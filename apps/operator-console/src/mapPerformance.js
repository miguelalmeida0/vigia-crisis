const TRACE_DURATION_MS = 5_000;
const traces = globalThis.__VIGIA_MAP_TRACES__ ?? [];
globalThis.__VIGIA_MAP_TRACES__ = traces;

let activeTrace = null;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return Number(ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1))].toFixed(2));
}

function gpuSnapshot(map) {
  const canvas = map.querySelector('canvas');
  if (!canvas) return { canvasCount: 0, backingStore: null, renderer: null };
  let renderer = null;
  try {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? null;
  } catch {}
  return {
    canvasCount: map.querySelectorAll('canvas').length,
    backingStore: `${canvas.width}x${canvas.height}`,
    cssSize: `${Math.round(canvas.getBoundingClientRect().width)}x${Math.round(canvas.getBoundingClientRect().height)}`,
    devicePixelRatio: finite(globalThis.devicePixelRatio, 1),
    renderer,
  };
}

function runtimeSnapshot(map) {
  const runtime = globalThis.__VIGIA_MAP_RUNTIME__ ?? {};
  const app = document.querySelector('#app');
  return {
    applicationRenders: finite(Number(app?.dataset.routeRenderCount)),
    mapMounts: finite(Number(runtime.mountCount)),
    mapDestroys: finite(Number(runtime.destroyCount)),
    styleReloads: finite(Number(runtime.styleReloadCount)),
    sourceUpdates: finite(Number(runtime.sourceUpdateCount)),
    filterUpdates: finite(Number(runtime.filterUpdateCount)),
    tileRequests: finite(Number(runtime.tileRequests)),
    domMarkers: map.querySelectorAll('.tile-map__marker,.maplibregl-marker').length,
    pointerToPostRenderMs: Number.isFinite(Number(map.dataset.mapPointerToPostRenderMs)) ? Number(map.dataset.mapPointerToPostRenderMs) : null,
    resourceEntries: performance.getEntriesByType?.('resource')?.length ?? null,
    usedHeapBytes: performance.memory?.usedJSHeapSize ?? null,
    ...gpuSnapshot(map),
  };
}

function delta(after, before, key) {
  const next = after[key], prior = before[key];
  return Number.isFinite(next) && Number.isFinite(prior) ? next - prior : null;
}

function traceEvent(name, startedAt, duration, category = 'vigia') {
  return { name, cat: category, ph: 'X', ts: Math.round(startedAt * 1_000), dur: Math.max(0, Math.round(duration * 1_000)), pid: 1, tid: 1 };
}

function finishTrace(trace) {
  if (activeTrace !== trace) return;
  cancelAnimationFrame(trace.rafId);
  for (const observer of trace.observers) observer.disconnect();
  const endedAt = performance.now(), after = runtimeSnapshot(trace.map);
  const intervals = trace.frameIntervals.filter(value => value > 0 && value < 1_000);
  const report = {
    schemaVersion: 'vigia.map-drag-raf-telemetry.v1',
    engine: trace.engine,
    route: document.body.dataset.vigiaRoute ?? null,
    sceneIdentity: trace.map.dataset.mapSceneIdentity ?? null,
    startedAt: new Date(Date.now() - Math.round(endedAt - trace.startedAt)).toISOString(),
    durationMs: Number((endedAt - trace.startedAt).toFixed(2)),
    renderedFrames: intervals.length,
    frameTimeMs: {
      p50: percentile(intervals, .5),
      p95: percentile(intervals, .95),
      max: intervals.length ? Number(Math.max(...intervals).toFixed(2)) : null,
      over50: intervals.filter(value => value > 50).length,
    },
    longTasks: trace.longTasks,
    longAnimationFrames: trace.longAnimationFrames,
    handlers: Object.fromEntries([...trace.handlers].map(([name, values]) => [name, {
      calls: values.length,
      p95Ms: percentile(values, .95),
      maxMs: values.length ? Number(Math.max(...values).toFixed(3)) : null,
      totalMs: Number(values.reduce((sum, value) => sum + value, 0).toFixed(3)),
    }])),
    before: trace.before,
    after,
    deltas: {
      applicationRenders: delta(after, trace.before, 'applicationRenders'),
      mapMounts: delta(after, trace.before, 'mapMounts'),
      mapDestroys: delta(after, trace.before, 'mapDestroys'),
      styleReloads: delta(after, trace.before, 'styleReloads'),
      sourceUpdates: delta(after, trace.before, 'sourceUpdates'),
      filterUpdates: delta(after, trace.before, 'filterUpdates'),
      tileRequests: delta(after, trace.before, 'tileRequests'),
      resourceEntries: delta(after, trace.before, 'resourceEntries'),
      usedHeapBytes: delta(after, trace.before, 'usedHeapBytes'),
    },
    traceEvents: [
      traceEvent('VIGIA five-second native map drag', trace.startedAt, endedAt - trace.startedAt),
      ...trace.frameIntervals.map((duration, index) => traceEvent(`Animation frame ${index + 1}`, trace.frameStarts[index] ?? trace.startedAt, duration, 'devtools.timeline')),
      ...trace.handlerEvents.map(item => traceEvent(item.name, item.startedAt, item.duration, 'vigia.map-handler')),
      ...trace.longTasks.map(item => traceEvent('Long task', item.startTime, item.duration, 'devtools.timeline')),
      ...trace.longAnimationFrames.map(item => traceEvent('Long animation frame', item.startTime, item.duration, 'devtools.timeline')),
    ],
  };
  traces.push(report);
  trace.map.dataset.mapTraceState = 'COMPLETE';
  trace.map.dataset.mapLastTrace = JSON.stringify(report);
  activeTrace = null;
}

export function beginMapDragTrace(map, { engine = 'unknown' } = {}) {
  if (activeTrace?.map === map) {
    activeTrace.dragStarts += 1;
    return activeTrace;
  }
  if (activeTrace) finishTrace(activeTrace);
  const trace = {
    map,
    engine,
    startedAt: performance.now(),
    before: runtimeSnapshot(map),
    frameIntervals: [],
    frameStarts: [],
    handlers: new Map(),
    handlerEvents: [],
    longTasks: [],
    longAnimationFrames: [],
    observers: [],
    dragStarts: 1,
    rafId: 0,
  };
  activeTrace = trace;
  map.dataset.mapTraceState = 'RECORDING';
  let previous = trace.startedAt;
  const frame = now => {
    trace.frameStarts.push(previous);
    trace.frameIntervals.push(now - previous);
    previous = now;
    if (now - trace.startedAt >= TRACE_DURATION_MS) finishTrace(trace);
    else trace.rafId = requestAnimationFrame(frame);
  };
  trace.rafId = requestAnimationFrame(frame);
  for (const type of ['longtask', 'long-animation-frame']) {
    try {
      const observer = new PerformanceObserver(list => {
        const target = type === 'longtask' ? trace.longTasks : trace.longAnimationFrames;
        for (const entry of list.getEntries()) target.push({ startTime: Number(entry.startTime.toFixed(2)), duration: Number(entry.duration.toFixed(2)), name: entry.name });
      });
      observer.observe({ type, buffered: false });
      trace.observers.push(observer);
    } catch {}
  }
  return trace;
}

export function recordMapHandler(name, startedAt, endedAt = performance.now()) {
  if (!activeTrace) return;
  const duration = Math.max(0, endedAt - startedAt), values = activeTrace.handlers.get(name) ?? [];
  values.push(duration);
  activeTrace.handlers.set(name, values);
  activeTrace.handlerEvents.push({ name, startedAt, duration });
}
