#!/usr/bin/env python3
"""Read-only UI + whole-container stability gate. Never deploys or enables workers."""
import argparse
import asyncio
import json
import math
import os
import re
import statistics
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

ROUTES = (
    ('Command Overview','command-overview','command-overview',True),
    ('Incidents','incidents','incidents',True),
    ('Incident Detail','incident-detail','incident-detail',True),
    ('Fire Activity','fire-activity','intelligence',True),
    ('Response & Access','response-access','operations',True),
    ('National Awareness','global-awareness','global-awareness',True),
    ('Reports compatibility','reports-analytics','reports-analytics',False),
)
CANONICAL = 'PT-2026-5440CF7B01'
MIB = 1024 * 1024


def command(*args):
    return subprocess.check_output(args, text=True, timeout=15).strip()


def assess_memory(samples, minimum_seconds=900):
    if len(samples) < 20 or samples[-1]['elapsed'] - samples[0]['elapsed'] < minimum_seconds:
        raise ValueError('insufficient_real_observation_duration')
    if any(s['oom_kill'] != samples[0]['oom_kill'] or s['oom_kill'] > 0 for s in samples):
        raise ValueError('container_oom_detected')
    if any(s['identity'] != samples[0]['identity'] for s in samples):
        raise ValueError('container_restart_detected')
    if any(s['limit'] <= 0 or s['limit'] > 512 * MIB for s in samples):
        raise ValueError('test_container_must_have_at_most_512MiB')
    peak = max(s['bytes'] for s in samples)
    if any(s['bytes'] > s['limit'] - 32 * MIB for s in samples):
        raise ValueError('less_than_32MiB_container_headroom')
    warm = [s for s in samples if s['elapsed'] >= samples[0]['elapsed'] + 300]
    x = [s['elapsed'] / 60 for s in warm]
    y = [s['working_set'] / MIB for s in warm]
    denominator = sum((v-statistics.mean(x))**2 for v in x)
    slope = sum((a-statistics.mean(x))*(b-statistics.mean(y)) for a,b in zip(x,y)) / denominator if denominator else math.inf
    drift = statistics.mean(y[-5:]) - statistics.mean(y[:5])
    if slope > 0.5 or drift > 16:
        raise ValueError('memory_did_not_plateau')
    return {'peak_container_mib': round(peak/MIB,2), 'working_set_slope_mib_per_minute': round(slope,3), 'working_set_drift_mib': round(drift,2)}


def sample_container(name, started):
    record = json.loads(command('docker','inspect',name))[0]
    state = record['State']
    if not state['Running'] or state.get('OOMKilled') or record.get('RestartCount',0):
        raise ValueError('container_stopped_restarted_or_oom')
    env = set(record['Config'].get('Env',[]))
    if 'VIGIA_DEMO_DATABASE_MODE=ephemeral_local_postgis' not in env or 'VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY' not in env:
        raise ValueError('soak_requires_explicit_isolated_local_database')
    # cgroup v2 includes every API/gateway/PostgreSQL process. Do not substitute
    # JS heap or sum PostgreSQL RSS (which double-counts shared pages).
    raw = command('docker','exec',name,'bash','-c',
        'cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.max; '
        'grep "^oom_kill " /sys/fs/cgroup/memory.events; '
        'grep "^inactive_file " /sys/fs/cgroup/memory.stat')
    lines = raw.splitlines()
    current, limit = int(lines[0]), int(lines[1])
    return {'elapsed':time.monotonic()-started,'bytes':current,'limit':limit,
            'working_set':max(0,current-int(lines[3].split()[1])), 'oom_kill':int(lines[2].split()[1]),
            'identity':record['Id']+':'+state['StartedAt'], 'image':record['Image']}


async def wait_for_hydration(page, route, report, timeout=20000):
    try:
        await page.wait_for_function(
            "route => document.body.dataset.vigiaRoute === route && globalThis.__VIGIA_APP_RUNTIME__?.hydrationIdle === true",
            arg=route, timeout=timeout)
    except Exception:
        state = await page.evaluate("""() => ({
          bodyRoute: document.body.dataset.vigiaRoute ?? null,
          bodyState: document.body.dataset.vigiaAppState ?? null,
          resourceState: document.body.dataset.vigiaResourceState ?? null,
          appGlobalRefreshPending: document.querySelector('#app')?.dataset.vigiaGlobalRefreshPending ?? null,
          appIncidentLoadPending: document.querySelector('#app')?.dataset.vigiaIncidentLoadPending ?? null,
          runtime: globalThis.__VIGIA_APP_RUNTIME__ ?? null,
          hash: location.hash
        })""")
        report['errors'].append({'kind':'hydration','route':route,'state':state})
        raise


async def wait_for_map(page, route_name, report, timeout=20000):
    try:
        await page.wait_for_function("""() => [...document.querySelectorAll('.tile-map')].some(map => {
          const r=map.getBoundingClientRect();
          const visible=r.width>100 && r.height>100;
          const usable=['LIVE','DEGRADED_PARTIAL','STALE_LAST_GOOD'].includes(map.dataset.mapState);
          const drawn=[...map.querySelectorAll('img')].some(img=>img.complete && img.naturalWidth>0) || !!map.querySelector('canvas,svg');
          return visible && usable && drawn;
        })""", timeout=timeout)
    except Exception:
        state = await page.evaluate("""() => [...document.querySelectorAll('.tile-map')].map(map => {
          const r=map.getBoundingClientRect();
          return {
            state: map.dataset.mapState ?? null,
            failureClass: map.dataset.mapFailureClass ?? null,
            failureSource: map.dataset.mapFailureSource ?? null,
            width: Math.round(r.width), height: Math.round(r.height),
            canvasCount: map.querySelectorAll('canvas').length,
            svgCount: map.querySelectorAll('svg').length,
            loadedImages: [...map.querySelectorAll('img')].filter(img=>img.complete && img.naturalWidth>0).length
          };
        })""")
        report['errors'].append({'kind':'map','route':route_name,'state':state})
        raise


async def run(args):
    from playwright.async_api import async_playwright
    origin = urlparse(args.base_url)
    if origin.scheme not in ('http','https') or origin.username or origin.password or 'vigia-live' in (origin.hostname or ''):
        raise ValueError('isolated_demo_URL_required_production_forbidden')
    if not args.once and (not args.container or not 900 <= args.seconds <= 1800):
        raise ValueError('soak_requires_container_and_900_to_1800_seconds')
    output = Path(args.output); output.mkdir(parents=True,exist_ok=True)
    report = {'status':'RUNNING','scope':'automated_demo_gate_not_operational_certification','base_url':args.base_url,
              'canonical_id':CANONICAL,'routes':[],'errors':[],'samples':[], 'manual_visual_review_required':True}
    try:
        report['source_commit'] = command('git','rev-parse','HEAD')
    except (subprocess.SubprocessError, FileNotFoundError):
        report['source_commit'] = None
    try:
        async with async_playwright() as p:
            executable = os.environ.get('VIGIA_CHROMIUM_EXECUTABLE')
            browser = await p.chromium.launch(headless=True,executable_path=executable)
            context = await browser.new_context(viewport={'width':1440,'height':1000},ignore_https_errors=False)
            page = await context.new_page()
            page.on('pageerror', lambda error: report['errors'].append({'kind':'pageerror','error':str(error)}))
            page.on('console', lambda msg: report['errors'].append({'kind':'console','error':msg.text}) if msg.type=='error' else None)
            canonical_seen = False; map_responses = 0; json_checked = 0
            pending = set()
            async def inspect_response(response):
                nonlocal canonical_seen,map_responses,json_checked
                if response.status >= 400:
                    report['errors'].append({'kind':'http','status':response.status,'url':response.url})
                content_type = (await response.all_headers()).get('content-type','')
                if '/basemap/' in response.url and response.status==200 and ('image/' in content_type or 'protobuf' in content_type):
                    map_responses += 1
                if not canonical_seen and json_checked < 40 and response.status==200 and 'json' in content_type and '/backend/' in response.url:
                    json_checked += 1
                    try:
                        body = await response.body()
                        canonical_seen = canonical_seen or CANONICAL.encode() in body
                    except Exception as error:
                        report['errors'].append({'kind':'body','error':str(error)[:200]})
            def on_response(response):
                task = asyncio.create_task(inspect_response(response)); pending.add(task); task.add_done_callback(pending.discard)
            page.on('response',on_response)
            def request_failed(request):
                # A navigation can legitimately cancel an unfinished image/SSE.
                # Actual HTTP failures, console and page errors are never ignored.
                if request.failure and 'ERR_ABORTED' not in request.failure:
                    report['errors'].append({'kind':'network','url':request.url,'error':request.failure})
            page.on('requestfailed',request_failed)
            ready = await context.request.get(args.base_url.rstrip('/')+'/__operator/ready',timeout=8000)
            payload = await ready.json()
            if ready.status!=200 or not payload.get('ok') or not payload.get('isolatedDemo') or not payload.get('readOnly'):
                raise ValueError('public_dependency_readiness_failed')
            report['release_identity'] = {key:payload.get(key) for key in ('releaseId','codeStateHash','operationalDataHash','releaseStatementHash')}
            await page.goto(args.base_url,wait_until='domcontentloaded',timeout=30000)
            for name,public_route,internal_route,requires_map in ROUTES:
                # URLs and body markers come from routeState.js/app.js. Incident
                # Detail and Reports are contextual/compatibility routes, not
                # fabricated extra items in the locked navigation.
                suffix='?id='+CANONICAL if internal_route in ('incidents','incident-detail','intelligence','operations') else ''
                await page.goto(args.base_url.split('#')[0].rstrip('/')+'/#/'+public_route+suffix,wait_until='domcontentloaded',timeout=30000)
                # app.js/routeState.js canonicalize navigation aliases (e.g. the locked
                # "fire-activity" URL) to their internal route name (e.g. "intelligence")
                # before stamping document.body.dataset.vigiaRoute, so hydration must be
                # awaited against that internal identity, not the public URL segment.
                await wait_for_hydration(page, internal_route, report)
                if len((await page.locator('#main-content').inner_text()).strip()) < 100: raise ValueError('blank_route:'+name)
                if requires_map:
                    await wait_for_map(page, name, report)
                filename=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')+'.png'
                await page.screenshot(path=str(output/filename),full_page=True)
                report['routes'].append({'name':name,'url':page.url,'screenshot':filename})
            if pending: await asyncio.gather(*list(pending))
            if not canonical_seen: raise ValueError('canonical_incident_not_observed_in_API_responses')
            if not map_responses: raise ValueError('no_successfully_loaded_basemap_tiles')
            # Mobile verifies real routed pages, not a mocked screenshot.
            await page.set_viewport_size({'width':390,'height':844})
            for index,route in enumerate(report['routes']):
                await page.goto(route['url'],wait_until='domcontentloaded',timeout=30000); await page.wait_for_timeout(1500)
                if await page.evaluate('document.documentElement.scrollWidth > innerWidth + 2'): raise ValueError('mobile_horizontal_overflow:'+route['name'])
                await page.screenshot(path=str(output/f'mobile-{index+1}.png'),full_page=True)
            if not args.once:
                await page.set_viewport_size({'width':1440,'height':1000})
                start=time.monotonic(); index=0
                while True:
                    report['samples'].append(sample_container(args.container,start))
                    if report['samples'][-1]['elapsed']-report['samples'][0]['elapsed'] >= args.seconds: break
                    route=report['routes'][index % len(report['routes'])]; index+=1
                    await page.goto(route['url'],wait_until='domcontentloaded',timeout=30000)
                    await asyncio.sleep(30)
                report['memory']=assess_memory(report['samples'],args.seconds)
                logs=command('docker','logs','--tail','2000',args.container)
                if '"recurringOperationalWorkers":false' not in logs or '"state":"bounded_read_plane"' not in logs:
                    raise ValueError('disabled_worker_mode_not_verified')
                required_seed_markers = (
                    '"event":"demo_seed_contract_verified"', '"importStatus":"VALID"',
                    '"acceptedRecords":13', '"universe":"SHADOW"', '"exercise":true',
                    '"idempotentReplay":true'
                )
                if not all(marker in logs for marker in required_seed_markers):
                    raise ValueError('deterministic_seed_contract_not_verified')
            if pending: await asyncio.gather(*list(pending))
            if report['errors']: raise ValueError('browser_or_network_errors_detected')
            await context.close(); await browser.close()
            report['status']='SMOKE_PASS_NOT_STABILITY_CERTIFIED' if args.once else 'AUTOMATED_GATES_PASSED_VISUAL_REVIEW_REQUIRED'
            return report
    except Exception as error:
        report['status']='FAIL'; report['failure']=str(error)
        raise
    finally:
        (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',required=True); parser.add_argument('--container')
    parser.add_argument('--seconds',type=int,default=1200); parser.add_argument('--once',action='store_true')
    parser.add_argument('--output',default='.tmp/release-gate')
    args=parser.parse_args()
    try: print(json.dumps(asyncio.run(run(args)),indent=2))
    except Exception as error: raise SystemExit(str(error))
