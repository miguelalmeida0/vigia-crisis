#!/usr/bin/env node
import { setTimeout as wait } from 'node:timers/promises';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { createForecastRuntime } from '../apps/api/src/modules/forecasting/index.mjs';

function durationSeconds(){const index=process.argv.findIndex((item)=>item==='--duration'),raw=process.argv.find((item)=>item.startsWith('--duration='))?.split('=')[1]??(index>=0?process.argv[index+1]:null);if(!raw)return 0;const match=String(raw).match(/^(\d+(?:\.\d+)?)(s|m)?$/);if(!match)throw new Error('shadow_duration_invalid');const seconds=Number(match[1])*(match[2]==='m'?60:1);if(seconds<=0||seconds>600)throw new Error('shadow_duration_must_be_at_most_10_minutes');return seconds;}
if(process.argv.includes('--help')){console.log('Usage: npm run shadow:spread [-- --once | --duration=10m]\nRuns decision-free spread forecasting against the latest retained real-world state. Duration is capped at 10 minutes.');process.exit(0);}
const config=loadConfig(),runtime=await createForecastRuntime({config}),duration=durationSeconds(),deadline=Date.now()+duration*1_000,reports=[];
do{const report=await runtime.runOnce();reports.push({runId:report.runId,runHash:report.runHash,state:report.state,incident:report.incident,forecastState:report.forecast.state,abstentionReasons:report.forecast.abstention.reasons,replay:report.replay,externalActionsExecuted:report.shadow.externalActionsExecuted,output:config.forecastReportFile});if(!duration||Date.now()>=deadline)break;await wait(Math.min(60_000,Math.max(0,deadline-Date.now())));}while(Date.now()<deadline);
console.log(JSON.stringify({schemaVersion:'vigia.spread-shadow-command.v1',mode:duration?'BOUNDED_DURATION':'ONCE',durationSeconds:duration,runs:reports},null,2));
if(reports.some((item)=>!item.replay.valid||item.externalActionsExecuted!==0))process.exitCode=1;
