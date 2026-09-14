import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { PreventionReviewContextService } from '../src/modules/prevention/prevention-review-context-service.mjs';

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])]));return value;}
const sha=(value)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

test('PREVENT context is applied only to an exact detector and geometry binding',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vigia-prevent-context-')),file=path.join(dir,'context.json'),geometry={type:'Point',coordinates:[-8,37]};
  await writeFile(file,JSON.stringify({schema:'vigia.prevention.review-context.v1',evidenceHash:'sha256:evidence',generatedAt:'2026-08-13T00:00:00Z',integrity:{syntheticEvidence:false,humanLabelsGenerated:false},findings:[{findingId:'finding-1',detectorVersion:'detector-v1',geometrySha256:sha(geometry),roadCrossings:2,criticalAssetProximityM:81.4,terrainContext:{state:'MEASURED_LOCAL_CONTEXT'},landCoverContext:{state:'MEASURED_GEOMETRY_BOUND',dominantClass:'tree_cover'},roadContext:{provider:'OpenStreetMap'},sourceProducts:{worldCover:{itemId:'wc'}}}]}));
  const service=new PreventionReviewContextService({filePath:file});await service.initialize();
  const enriched=service.enrich({findingId:'finding-1',detectorVersion:'detector-v1',geometry,rationale:{uncertainty:['Land cover is unmeasured','Human adjudication is required']},provenance:{}});
  assert.equal(enriched.roadCrossings,2);assert.equal(enriched.landCoverContext.dominantClass,'tree_cover');assert.equal(enriched.reviewContextBinding.state,'GEOMETRY_BOUND_REAL_CONTEXT');
  assert.deepEqual(enriched.rationale.uncertainty,['Human adjudication is required','Static/context providers do not replace domain-expert adjudication','OpenStreetMap completeness varies']);
  const rejected=service.enrich({...enriched,geometry:{type:'Point',coordinates:[-8.1,37]}});
  assert.equal(rejected.reviewContextBinding.state,'REJECTED_VERSION_OR_GEOMETRY_MISMATCH');
});
