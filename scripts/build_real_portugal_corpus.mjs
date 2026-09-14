import path from 'node:path';
import { MANIFEST_OUTPUT, MAX_CASES, OUTPUT, RAW_PRODUCTS, ROOT } from './lib/portugal-corpus-config.mjs';
import { buildCasesAndRecords, buildEvidencePool, loadRawProducts, selectCandidates } from './lib/portugal-corpus-selection.mjs';
import { corpusDataset, sourceManifest, writeCorpus } from './lib/portugal-corpus-output.mjs';

async function main() {
  const rawProducts=await loadRawProducts(ROOT,RAW_PRODUCTS),pool=buildEvidencePool(rawProducts);
  const selected=selectCandidates(pool,MAX_CASES),{cases,records}=buildCasesAndRecords(selected,pool);
  const manifest=sourceManifest(rawProducts),dataset=corpusDataset({root:ROOT,manifestOutput:MANIFEST_OUTPUT,manifest,cases,records});
  await writeCorpus({output:OUTPUT,manifestOutput:MANIFEST_OUTPUT,manifest,dataset});
  console.log(JSON.stringify({
    state:'BUILT',output:path.relative(ROOT,OUTPUT),manifest:path.relative(ROOT,MANIFEST_OUTPUT),officialReportPool:pool.reports.length,
    vegetationDetections:pool.detections.length,cases:cases.length,physicalFirstCases:cases.filter((item)=>item.physicalFirst).length,
    thermalRecords:records.filter((item)=>item.kind==='thermal').length,caseSummaries:cases
  },null,2));
}

main().catch((error)=>{console.error(JSON.stringify({state:'FAILED',error:String(error.message??error)}));process.exitCode=1;});
