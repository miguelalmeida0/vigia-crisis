#!/usr/bin/env node
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { createRealityNetworkRuntime } from '../apps/api/src/modules/reality-network/index.mjs';

function duration(value){const match=String(value??'').match(/^(\d+)(s|m)$/);if(!match)return null;return Number(match[1])*(match[2]==='m'?60_000:1_000);}
const durationArg=process.argv.find((item)=>item.startsWith('--duration=')),once=process.argv.includes('--once')||!durationArg;
if(process.argv.includes('--help')){console.log('Usage: npm run run:wildfire:reality -- --once | --duration=10m\nRuns bounded current-data ingestion, raw preservation, Twin projection, evidence evaluation, next-best collection, and SHADOW-only control. Duration is capped at 10 minutes.');process.exit(0);}
const milliseconds=duration(durationArg?.split('=')[1]);if(durationArg&&(!milliseconds||milliseconds>600_000)){console.error('Invalid duration. Use 1s..600s or 1m..10m.');process.exit(2);}if(once&&durationArg){console.error('Choose either --once or --duration.');process.exit(2);}
const runtime=await createRealityNetworkRuntime({config:loadConfig()}),endsAt=Date.now()+(milliseconds??0),reports=[];
do{const report=await runtime.runOnce();reports.push(report);console.log(JSON.stringify({runId:report.runId,state:report.state,incident:report.selection?.providerIncidentId??null,providers:report.sourceSummary??null,evidence:report.evidence?.evaluation.state??null,physicalFamilies:report.evidence?.physicalInstrumentFamilies??[],shadow:report.shadow??null,replay:report.replay??null},null,2));if(once||Date.now()>=endsAt)break;await delay(Math.min(60_000,Math.max(1,endsAt-Date.now())));}while(Date.now()<endsAt);
if(!reports.some((item)=>item.state==='COMPLETED'))process.exitCode=1;
