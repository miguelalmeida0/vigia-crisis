import { readFile,writeFile } from 'node:fs/promises';

const value=(name)=>process.argv[process.argv.indexOf(name)+1];
const inputFile=value('--input'),outputFile=value('--output');
if(!inputFile||!outputFile)throw new Error('mock_runner_arguments_required');
const input=JSON.parse(await readFile(inputFile,'utf8'));
const ring=[[-121,47],[-120.99,47],[-120.99,47.01],[-121,47.01],[-121,47]];
const geometry={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[ring]}};
const contours=[.1,.3,.5,.7,.9].map((probability)=>({probability,geometry}));
const payload={schemaVersion:'vigia.physical-model-output.v1',modelFingerprint:input.modelFingerprint,horizons:input.horizonsHours.map((hours)=>({hours,contours}))};
await writeFile(outputFile,`${JSON.stringify(payload)}\n`,{encoding:'utf8',mode:0o600,flag:'wx'});
