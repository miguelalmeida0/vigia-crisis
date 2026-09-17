import {readFile,writeFile,copyFile,access} from 'node:fs/promises';
const directory='/Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/mega-vii';
const original=directory+'/after-map-interrupted.json';
try{await access(original);}catch{await copyFile(directory+'/after-map.json',original);}
if(process.argv.includes('--preserve')){console.log('Interrupted raw benchmark preserved.');process.exit(0);}
const before=JSON.parse(await readFile(original,'utf8'));
const resumed=JSON.parse(await readFile(directory+'/resumed-map.json','utf8'));
const results=[...before.results,...resumed.results];
const groups=Map.groupBy(results,r=>r.sample);
const complete=[...groups].filter(([,rows])=>rows.length===8&&new Set(rows.map(r=>r.case)).size===8).map(([sample])=>sample);
const combined={...before,results,errors:[...before.errors,...resumed.errors],failedRequests:[...before.failedRequests,...resumed.failedRequests],
  interruptedAttempts:[{sample:16,case:'national',completedJourneys:7,cause:'Docker daemon stopped; benchmark container exited with unexpected EOF on 2026-09-13. The missing national journey is not a successful measurement.'}],
  provenance:{original:'after-map-interrupted.json',resumed:'resumed-map.json',resumedAt:new Date().toISOString(),completeContexts:complete,startedContexts:groups.size,note:'All original measurements retained, including the partial context. Four new cold contexts replace no original failures.'}};
await writeFile(directory+'/after-map.json',JSON.stringify(combined,null,2));
console.log(JSON.stringify({journeys:results.length,completeContexts:complete.length,startedContexts:groups.size,pageErrors:combined.errors.length}));
