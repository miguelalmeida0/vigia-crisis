import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateValidationPolicy, validateFireCore } from '../packages/domain/src/validation-metrics.mjs';

const [datasetArg,policyArg]=process.argv.slice(2); const datasetPath=datasetArg||process.env.VIGIA_VALIDATION_DATASET;
if(!datasetPath){console.error('Usage: npm run validation:fire -- <labelled-cases.json> [validation-policy.json]');process.exit(2);}
const dataset=JSON.parse(await readFile(resolve(datasetPath),'utf8')); const records=Array.isArray(dataset)?dataset:dataset.records;
if(!Array.isArray(records))throw new Error('validation_dataset_records_required');
const metrics=validateFireCore(records); const result={metrics,policy:null};
if(policyArg){const policy=JSON.parse(await readFile(resolve(policyArg),'utf8'));result.policy=evaluateValidationPolicy(metrics,policy);}
console.log(JSON.stringify(result,null,2)); if(result.policy&&!result.policy.pass)process.exitCode=1;
