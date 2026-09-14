#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { createRealityNetworkRuntime } from '../apps/api/src/modules/reality-network/index.mjs';
import { providerHealthProjection } from '../apps/api/src/modules/reality-network/provider-health.mjs';
import { PROVIDER_MANIFESTS } from '../apps/api/src/modules/reality-network/provider-portfolio.mjs';

if(process.argv.includes('--help')){console.log('Usage: npm run report:reality-quality\nReports provider freshness, latency, vault volume, retrieval bindings, replay, evidence, licensing, and shadow quality gates from durable state.');process.exit(0);}
const config=loadConfig(),runtime=await createRealityNetworkRuntime({config}),state=runtime.stateStore.status(),latest=JSON.parse(await readFile(config.realityReportFile,'utf8')),health=PROVIDER_MANIFESTS.map((manifest)=>providerHealthProjection(runtime.stateStore.provider(manifest.providerId),manifest));
const report={schemaVersion:'vigia.reality-quality-report.v1',generatedAt:new Date().toISOString(),latestRun:{runId:latest.runId,state:latest.state,runHash:latest.runHash,incident:latest.selection?.providerIncidentId,evidenceState:latest.evidence?.evaluation.state,replayValid:latest.replay?.valid,shadowWouldHaveActions:latest.shadow?.wouldHaveActionCount},rawVault:runtime.rawVault.status(),providers:health,retrievals:{count:state.retrievals.length,bound:state.retrievals.filter((item)=>item.canonicalEventIds?.length).length,failed:state.retrievals.filter((item)=>item.outcome==='REJECTED').length},qualityGates:{replay:latest.replay?.valid===true,threePhysicalFamilies:(latest.evidence?.physicalInstrumentFamilies?.length??0)>=3,liveProviders:(latest.sourceSummary?.live??0)>=5,shadowReceipt:(latest.shadow?.wouldHaveActionCount??0)>=1,rights:latest.rights?.allowed===true}};console.log(JSON.stringify(report,null,2));if(Object.values(report.qualityGates).includes(false))process.exitCode=1;
