import path from 'node:path';
import { ForecastRuntime } from './forecast-runtime.mjs';
import { ForecastStore } from './forecast-store.mjs';
import { createDefaultForecastModelRegistry } from './model-registry.mjs';
import { IsolatedPhysicalModelRunner } from './physical-model-runner.mjs';

export async function createForecastRuntime({config,clock=()=>new Date()}={}){const runtimeDir=config.forecastRuntimeDir,store=new ForecastStore({filePath:path.join(runtimeDir,'forecast-store.json')}),registry=createDefaultForecastModelRegistry(),commands={farsite:{modelId:'FARSITE_FLAMMAP_PHYSICAL_PORT',version:'1.0.0',executable:config.farsiteExecutable||config.flammapExecutable||'',artifactHash:config.farsiteArtifactHash,args:[]},windninja:{modelId:'WINDNINJA_PHYSICAL_PORT',version:'1.0.0',executable:config.windNinjaExecutable||'',artifactHash:config.windNinjaArtifactHash,args:[]}},runner=new IsolatedPhysicalModelRunner({rootDir:path.join(runtimeDir,'physical-runs'),commands,timeoutMs:config.forecastRunnerTimeoutMs,clock}),runtime=new ForecastRuntime({config,store,registry,runner,clock});await runtime.initialize();return runtime;}
