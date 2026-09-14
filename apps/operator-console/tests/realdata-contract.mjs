import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderRoute } from '../src/routes/index.js';
import { phaseBFixture } from './phase-b-fixture.mjs';

const routes=['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness'];
for(const route of routes){
  const html=renderRoute(route,phaseBFixture());
  assert.doesNotMatch(html,/Canyon Ridge|Pinecrest|Serra da Estrela|data:image\//,`${route} contains fixture or embedded-image data`);
}
const production=['index.html','src/app.js','src/vigiaApi.js','src/canonicalComponents.js','src/canonicalViewModel.js','src/evidenceGraph.js','src/map.js','src/routes/commandOverview.js','src/routes/incidents.js','src/routes/incidentDetail.js','src/routes/intelligenceEvidence.js','src/routes/operations.js','src/routes/reportsAnalytics.js','src/routes/globalAwareness.js'];
for(const file of production){const source=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');assert.doesNotMatch(source,/https?:\/\/(?:tile|api|maps|firms|nominatim|openstreetmap)/i,`${file} contains a direct browser provider URL`);assert.doesNotMatch(source,/\/assets\/(?:maps|evidence|fleet)/,`${file} references a bundled operational substitute`);}
for(const rel of ['assets/maps','assets/evidence','assets/fleet'])assert.equal(existsSync(new URL(`../${rel}`,import.meta.url)),false);
console.log('Real-data contract passed: canonical backend projection only and zero bundled operational-image substitutes.');
