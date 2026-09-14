import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const input=path.join(root,'data/validation/pilot/governed-pilot-report.json');
const operationalInput=path.join(root,'data/validation/fieldnet/fieldnet-1-1-operational-proof.json');
const output=path.join(root,'data/validation/pilot/governed-pilot-report.md');
const report=JSON.parse(await readFile(input,'utf8'));
const operational=JSON.parse(await readFile(operationalInput,'utf8'));
const metric=(value)=>{
  if(!value)return 'NOT MEASURED';
  if(value.state==='NO_OBSERVED_CASES')return 'NO OBSERVED CASES (denominator 0)';
  if(value.value==null)return value.state??'NOT MEASURED';
  if(value.unit==='ratio')return `${(value.value*100).toFixed(1)}% (${value.numerator}/${value.denominator})`;
  return `${value.value}${value.denominator!=null?` (${value.numerator}/${value.denominator})`:''}`;
};
const ms=(value)=>value==null?'NOT MEASURED':`${Number(value).toFixed(3)} ms`;
const rows=(items)=>items.map((item)=>`| ${item.join(' | ')} |`).join('\n');
const escape=(value)=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
const windows=operational.campaign?.windows??[];
const science=report.preventScience.machineVerified;
const timingRows=Object.entries(report.responseTimings.prospective??{}).map(([name,value])=>[
  name.replaceAll('_',' '),value.sampleCount,ms(value.medianMs),ms(value.p95Ms)
]);
const limitations=(report.limitations??[]).map((item)=>`- ${item}`).join('\n');
const examples=(report.incidentExamples??[]).map((item)=>`- **${item.incidentId}** — ${item.qualification} Families: ${item.physicalFamilies.join(', ')}. Exercise proof: \`${item.fieldNetExerciseProofId}\`.`).join('\n');
const markdown=`# VIGIA governed design-partner pilot report

Generated: ${report.generatedAt}

> **Status: ${report.pilot.status}.** Organization: **${report.pilot.organization}**. This report uses governed production evidence and controlled FieldNet exercise evidence. It does not claim ROI, lives saved, or fires avoided.

## Territory

- Reference incident cell: \`${report.pilot.territory.referenceIncidentId}\`
- Buffer: ${report.pilot.territory.bufferKm} km
- Bounding box: ${report.pilot.territory.bbox.join(', ')}
- Qualification: ${report.pilot.territory.qualification}

## Source coverage

| Window | Prospective records | Source availability | Physical candidates | Physical-first | Multisource |
| --- | ---: | --- | --- | --- | --- |
${rows(windows.map((window)=>[
  window.label,window.prospectiveRecordCount,metric(window.metrics.sourceAvailability),metric(window.metrics.physicalCandidates),metric(window.metrics.physicalFirst),metric(window.metrics.multisource)
]))}

The campaign boundary is frozen at ${report.campaign.prospectiveBoundaryAt}; retrospective backfill is prohibited.

## Detections

- Physical candidates: ${metric(report.detections.physicalCandidates)}
- Physical-first: ${metric(report.detections.physicalFirst)}
- Multisource corroboration: ${metric(report.detections.multisource)}

## Alerts

- Created: ${metric(report.alerts.created)}
- Delivered: ${metric(report.alerts.delivered)}
- Acknowledged: ${metric(report.alerts.acknowledged)}
- External outcome labels: ${report.alerts.operationsDenominators.externallyLabeledAlerts}

## Response timings

The following samples are a current operations-store snapshot and are **not** attributed to the frozen prospective campaign window.

| Metric | Samples | Median | P95 |
| --- | ---: | ---: | ---: |
${rows(timingRows)}

Controlled FieldNet exercise: observation commit ${ms(report.responseTimings.controlledFieldExercise.observationCommitMs)}; task acknowledgement ${ms(report.responseTimings.controlledFieldExercise.taskAcknowledgementMs)}; sync recovery ${ms(report.responseTimings.controlledFieldExercise.syncRecoveryMs)}. These are deployment-readiness measurements, not a customer SLA.

## Evidence closure

- Governed Evidence Debt: ${report.evidenceClosure.summary.total} total; ${report.evidenceClosure.summary.open} open; ${report.evidenceClosure.summary.resolved} resolved.
- Every item has a verification plan: ${report.evidenceClosure.summary.allWithPlans?'yes':'no'}.
- Prospectively created: ${metric(report.evidenceClosure.prospectiveCreated)}
- Prospectively system-resolved: ${metric(report.evidenceClosure.prospectiveResolved)}

## FieldNet resilience

- Acceptance verdict: **${report.fieldNetResilience.exerciseVerdict}** (${report.fieldNetResilience.scope})
- Message delivery: ${report.fieldNetResilience.messageDelivery.numerator}/${report.fieldNetResilience.messageDelivery.denominator}
- Duplicate deliveries exercised: ${report.fieldNetResilience.duplicateDeliveries}; duplicate applications: ${report.fieldNetResilience.duplicateApplications}
- Zero lost evidence: ${report.fieldNetResilience.zeroLostEvidence}
- Audit: ${report.fieldNetResilience.audit.valid?'VERIFIED':'FAILED'}; ${report.fieldNetResilience.audit.records} records
- Real sensor hardware: ${report.fieldNetResilience.sensorHardware}

## PREVENT science

| Machine-verified dimension | Coverage | Result |
| --- | ---: | --- |
${rows([
  ['Reference land-cover concordance',`${science.landCover.measured}/${science.denominatorFindings}`,`median ${science.landCover.medianConcordance}`],
  ['Repeat-scene stability',`${science.repeatScene.measured}/${science.denominatorFindings}`,`median survival ${science.repeatScene.medianCandidateSurvival}; IoU ${science.repeatScene.medianGeometryIou}`],
  ['Threshold stability',`${science.threshold.measured}/${science.denominatorFindings}`,`median survival ${science.threshold.medianCandidateSurvival}; IoU ${science.threshold.medianGeometryIou}`],
  ['Graph stability',`${science.graph.measured}/${science.denominatorFindings}`,`node ${science.graph.medianNodeStability}; edge ${science.graph.medianEdgeStability}`],
  ['Breakpoint robustness',`${science.breakpoint.measured}/${science.denominatorFindings}`,`median ${science.breakpoint.medianStability}`],
  ['Counterfactual robustness',`${science.counterfactual.measured}/${science.denominatorFindings}`,`median retention ${science.counterfactual.medianRetention}; LOW ${science.counterfactual.classifications.LOW}; MODERATE ${science.counterfactual.classifications.MODERATE}`]
])}

Human/field validation: **${report.preventScience.humanFieldValidation.state}**. ${report.preventScience.boundary}

## Limitations

${limitations}

## Incident examples

${examples}

## Audit and provenance

- Report schema: \`${report.schemaVersion}\`
- FieldNet audit head: \`${report.fieldNetResilience.audit.headHash}\`
- Pilot definition: \`${report.pilot.pilotId}\`
- Source report: \`${escape(path.relative(root,input))}\`
`;
await writeFile(output,markdown);
process.stdout.write(`${JSON.stringify({ok:true,output:path.relative(root,output),bytes:Buffer.byteLength(markdown)})}\n`);
