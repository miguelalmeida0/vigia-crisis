#!/usr/bin/env node
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { createRealityNetworkRuntime } from '../apps/api/src/modules/reality-network/index.mjs';
import { doctorRealityProviders } from '../apps/api/src/modules/reality-network/provider-doctor.mjs';

const strict=process.argv.includes('--strict'),json=process.argv.includes('--json');
if(process.argv.includes('--help')){console.log('Usage: npm run providers:doctor -- [--json] [--strict]\nChecks configuration, credentials, network reachability, schema readiness, and explicit partner boundaries without printing secrets.');process.exit(0);}
const config=loadConfig(),runtime=await createRealityNetworkRuntime({config}),report=await doctorRealityProviders({runtime,config});
if(json)console.log(JSON.stringify(report,null,2));else{console.log(`VIGIA REALITY PROVIDER DOCTOR · ${report.generatedAt}`);for(const item of report.providers)console.log(`${item.providerId.padEnd(34)} ${item.status.padEnd(38)} ${item.network??item.configuration??''}`);console.log(`ready=${report.summary.ready} credentials_required=${report.summary.credentialsRequired} partner_required=${report.summary.partnerRequired} unavailable=${report.summary.unavailable}`);}
if(strict&&(report.summary.ready<5||report.providers.some((item)=>['nasa-firms','noaa-goes-abi','nifc-wfigs'].includes(item.providerId)&&item.status!=='READY')))process.exitCode=1;
