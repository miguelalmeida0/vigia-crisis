import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { primaryRoutes } from '../src/data.js';

const routes=['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness'];
const activeStyles=['tokens.css','base.css','components.css','routes.css','responsive.css'];
const required=['index.html','server.mjs','src/app.js','src/routeState.js','src/bootSkeleton.js','src/incidentSelection.js','src/vigiaApi.js','src/canonicalViewModel.js','src/canonicalComponents.js','src/evidenceGraph.js','src/map.js','src/components.js',...activeStyles.map(name=>`styles/${name}`),'src/routes/index.js','src/routes/commandOverview.js','src/routes/incidents.js','src/routes/incidentDetail.js','src/routes/intelligenceEvidence.js','src/routes/operations.js','src/routes/reportsAnalytics.js','src/routes/globalAwareness.js'];
for(const file of required)assert.ok(existsSync(new URL(`../${file}`,import.meta.url)),`Missing ${file}`);
assert.deepEqual(primaryRoutes,routes.filter(route=>route!=='reports-analytics'),'primary navigation contains six routes; Reports remains an internal route');
const routeIndex=readFileSync(new URL('../src/routes/index.js',import.meta.url),'utf8'),api=readFileSync(new URL('../src/vigiaApi.js',import.meta.url),'utf8'),index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const route of routes)assert.ok(routeIndex.includes(route),`Route not registered: ${route}`);
for(const endpoint of ['/api/v10/operator/command-overview','/api/v10/operator/incidents','/intelligence','/evidence-debt','/operations'])assert.ok(api.includes(endpoint),`Canonical endpoint not wired: ${endpoint}`);
const linkedStyles=[...index.matchAll(/href="\.\/styles\/([^"?]+)(?:\?[^"?]+)?"/g)].map(match=>match[1]);
assert.deepEqual(linkedStyles,[...activeStyles,...['approved/tokens.css','approved/shell.css','approved/components.css','approved/routes.css','approved/responsive.css','approved/runtime-compat.css','approved/integration.css','approved/signals.css','approved/field.css','approved/hierarchy.css','approved/situation.css']],'retained legacy and approved CSS imports must have deterministic ownership');
const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');assert.match(app,/link.disabled=link.hasAttribute\('data-approved-style'\)\?!approved:approved/,'approved routes must disable legacy styling');
assert.doesNotMatch(index,/styles\/(?:phase-b|final-locked)\.css/,'legacy recovery override layers must not be active runtime dependencies');
for(const rel of ['assets/maps','assets/evidence','assets/fleet'])assert.equal(existsSync(new URL(`../${rel}`,import.meta.url)),false,`Forbidden bundled operational asset directory: ${rel}`);
console.log('Smoke verification passed: seven approved primary routes and canonical endpoint clients are present.');
