import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPortugalReplay } from './lib/portugal-replay.mjs';

const input=process.argv[2];
if(!input){console.error(JSON.stringify({state:'BLOCKED',error:'externally_labelled_replay_corpus_path_required'}));process.exit(2);}
try{
  const dataset=JSON.parse(await readFile(path.resolve(input),'utf8'));
  if(!['externally_labelled','official_archival_evidence'].includes(dataset?.metadata?.evidenceClass))throw new Error('replay_universe_requires_real_attributable_observations');
  const result=await runPortugalReplay(dataset);
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({state:'FAILED',error:String(error.message??error)}));process.exitCode=1;}
