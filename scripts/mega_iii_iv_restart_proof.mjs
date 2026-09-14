import {readFile,writeFile} from 'node:fs/promises';
const captured=JSON.parse(await readFile('docs/handoffs/mega-iii-iv/live-proof.json','utf8')),release=JSON.parse(await readFile('data/validation/release/current-release-manifest.json','utf8')),token=(await readFile('.tmp/release/operator-token','utf8')).trim(),rows=[];
for(const incident of captured.incidents.filter(i=>i.snapshotId)){
 const r=await fetch('http://127.0.0.1:4177/api/v10/operator/incidents/'+encodeURIComponent(incident.id)+'/situation?'+new URLSearchParams({at:incident.knownAt}),{headers:{authorization:'Bearer '+token}}),view=await r.json();
 rows.push({incidentId:incident.id,expectedSnapshotId:incident.snapshotId,actualSnapshotId:view.snapshot?.id,knownAt:view.knownAt,status:r.status,passed:r.status===200&&view.mode==='HISTORICAL'&&view.snapshot?.id===incident.snapshotId});
}
const report={at:new Date().toISOString(),capturedBeforeRestart:captured.capturedAt,releaseId:release.releaseId,codeStateHash:release.codeStateHash,modelInferenceCalls:0,operationalWrites:0,rows,passed:rows.every(r=>r.passed)};await writeFile('docs/handoffs/mega-iii-iv/restart-proof.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,retainedSnapshots:rows.length}));if(!report.passed)process.exitCode=1;
