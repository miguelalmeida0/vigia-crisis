import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPortugalReplay } from './lib/portugal-replay.mjs';

const input=process.argv[2]??'apps/api/test/fixtures/replay/portugal-software-replay.json';
try{
  const dataset=JSON.parse(await readFile(path.resolve(input),'utf8'));
  const result=await runPortugalReplay(dataset);
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({state:'FAILED',error:String(error.message??error)}));process.exitCode=1;}
