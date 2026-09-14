function message(error) {
  return String(error?.message ?? error ?? 'Unknown service error');
}

export function preserveLazyValidationWorkspace(current, incoming) {
  return incoming ?? current ?? null;
}

function unavailableLive(error, bootstrap) {
  const detail = message(error);
  return {
    state: 'unavailable', error: detail, events: [], evidenceNeeds: [], clocks: {},
    meta: { mode: 'production', generatedAt: bootstrap?.meta?.generatedAt ?? null, region: bootstrap?.meta?.region ?? 'Portugal mainland' },
    summary: {}, sources: bootstrap?.sources ?? {},
    thermal: { state: 'unavailable', selected: null, providers: [], replaySlots: [], error: detail }
  };
}

function unavailableReplay(error) {
  return { state: 'unavailable', error: message(error), cases: [], sources: [], limitations: [], benchmark: null, heroCaseId: null };
}

function pendingLive(bootstrap) {
  return {
    state:'loading', events:[], evidenceNeeds:[], clocks:{}, summary:{}, sources:bootstrap?.sources??{},
    meta:{mode:'production',generatedAt:bootstrap?.meta?.generatedAt??null,region:bootstrap?.meta?.region??'Portugal mainland'},
    thermal:{state:'loading',selected:null,providers:[],replaySlots:[]}
  };
}

export async function loadCommandShell(api) {
  const invoke = (method) => Promise.resolve().then(() => {
    if (typeof api?.[method] !== 'function') throw new Error(`${method}_client_unavailable`);
    return api[method]();
  });
  let session=null,sessionFailure=null;
  try{session=await invoke('session');}catch(error){sessionFailure=error;session={authenticated:false,actor:null,state:'unavailable',error:message(error)};}
  let bootstrap;
  try{bootstrap=await invoke('commandBootstrap');}catch(error){
    const failure = new Error(`Workspace bootstrap unavailable: ${message(error)}`);
    failure.code = 'workspace_bootstrap_unavailable';
    failure.cause = error;
    throw failure;
  }
  if (!bootstrap) {
    const error = new Error('Workspace bootstrap unavailable.');
    error.code = 'workspace_bootstrap_unavailable';
    throw error;
  }
  const failures={};
  if(typeof api?.preventionConsensusZones==='function'){
    try{
      const collection=await invoke('preventionConsensusZones'),zones=new Map((collection?.zones??[]).map((zone)=>[String(zone.finding_id),zone]));
      bootstrap={...bootstrap,prevention:{...bootstrap.prevention,findings:(bootstrap.prevention?.findings??[]).map((finding)=>{const zone=zones.get(String(finding.findingId));return zone?{...finding,consensusTopology:{state:zone.claim_state,zone,qualification:collection.qualification,policyHash:collection.policyHash}}:finding;})}};
    }catch(error){failures.preventionConsensus=message(error);}
  }
  if(sessionFailure)failures.session=message(sessionFailure);
  const projectedActor=bootstrap.actor??{};
  const sessionActor=session?.actor??{};
  const identityMatches=session?.authenticated===true&&Boolean(sessionActor.id)&&projectedActor.id===sessionActor.id&&projectedActor.name===sessionActor.name&&projectedActor.title===sessionActor.title;
  if(session?.authenticated===true&&!identityMatches){
    failures.session='Session identity differs from the Command projection; intelligence remains readable and mutations are disabled.';
    bootstrap={...bootstrap,actor:{...projectedActor,authentication:{authenticated:false,mode:'read_only_identity_mismatch'}}};
    session={...session,authenticated:false,state:'identity_mismatch'};
  }else if(session?.authenticated!==true&&projectedActor.authentication?.authenticated===true){
    bootstrap={...bootstrap,actor:{...projectedActor,authentication:{authenticated:false,mode:'read_only_session_unavailable'}}};
  }
  return {bootstrap,session,live:pendingLive(bootstrap),failures};
}

export async function loadPhysicalWorkspace(api, bootstrap) {
  const invoke = (method) => Promise.resolve().then(() => {
    if (typeof api?.[method] !== 'function') throw new Error(`${method}_client_unavailable`);
    return api[method]();
  });
  const [liveResult,territoryResult]=await Promise.allSettled([invoke('live'),invoke('territory')]);
  const failures={};
  if (liveResult.status === 'rejected') failures.live = message(liveResult.reason);
  if (territoryResult.status === 'rejected') failures.territory = message(territoryResult.reason);
  const live = liveResult.status === 'fulfilled'
    ? liveResult.value?.state === 'loading'
      ? unavailableLive('Live physical projection has not completed. Retry after provider acquisition finishes.', bootstrap)
      : liveResult.value
    : unavailableLive(liveResult.reason, bootstrap);
  return {
    live,
    territory: territoryResult.status === 'fulfilled' ? territoryResult.value : null,
    failures
  };
}

export async function loadWorkspace(api,{onShell=null}={}) {
  const shell=await loadCommandShell(api);
  onShell?.(shell);
  const physical=await loadPhysicalWorkspace(api,shell.bootstrap);
  return {
    bootstrap:shell.bootstrap,
    session:shell.session,
    live:physical.live,
    territory:physical.territory,
    replay: unavailableReplay('Replay loads when opened.'),
    alerts:{alerts:[]},
    detectionBenchmark:null,
    failures:{...shell.failures,...physical.failures}
  };
}

export async function loadFullBootstrap(api){return api.bootstrap();}
export async function loadReplayWorkspace(api){return api.replay();}
export async function loadValidationWorkspace(api){
  const names=['benchmark','measurementDebt','machineEvidence','measurementCampaigns','falseNegativeTaxonomy','liveCampaignScorecards','pilotDefinition','pilotReport'];
  const methods=['detectionBenchmark','measurementDebt','preventionMachineEvidence','measurementCampaigns','falseNegativeTaxonomy','liveCampaignScorecards','pilotDefinition','pilotReport'];
  const settled=await Promise.allSettled(methods.map((method)=>Promise.resolve().then(()=>{
    if(typeof api?.[method]!=='function')throw new Error(`${method}_client_unavailable`);
    return api[method]();
  })));
  const values={},failures={};
  settled.forEach((result,index)=>{if(result.status==='fulfilled')values[names[index]]=result.value;else failures[names[index]]=message(result.reason);});
  const available=names.filter((name)=>values[name]!==undefined),unavailable=names.filter((name)=>failures[name]!==undefined),state=available.length===0?'unavailable':unavailable.length?'partially_available':'ready';
  return {
    ...(values.benchmark??{}),
    measurementDebt:values.measurementDebt??null,
    machineEvidence:values.machineEvidence??null,
    measurementCampaigns:values.measurementCampaigns??null,
    falseNegativeTaxonomy:values.falseNegativeTaxonomy??null,
    liveCampaignScorecards:values.liveCampaignScorecards??null,
    pilotDefinition:values.pilotDefinition??null,
    pilotReport:values.pilotReport??null,
    availability:{state,available,unavailable,failures}
  };
}

export async function loadOperationsWorkspace(api,{includeNotifications=true}={}) {
  const invoke = (method) => Promise.resolve().then(() => {
    if (typeof api?.[method] !== 'function') throw new Error(`${method}_client_unavailable`);
    return api[method]();
  });
  const [alerts, status, metrics, notifications] = await Promise.allSettled([
    invoke('alerts'), invoke('operationsStatus'), invoke('operationsMetrics'), includeNotifications ? invoke('notifications') : Promise.resolve({notifications:[]})
  ]);
  const results = [alerts, status, metrics, notifications];
  const failures = results.filter((item) => item.status === 'rejected');
  const operationsState = failures.length === results.length
    ? 'unavailable'
    : failures.length
      ? 'partially_available'
      : 'ready';
  const reason = failures[0]?.reason;
  return {
    persistentAlerts: alerts.status === 'fulfilled' ? (alerts.value.alerts ?? []) : [],
    operationsStatus: status.status === 'fulfilled' ? status.value : null,
    operationsMetrics: metrics.status === 'fulfilled' ? metrics.value : null,
    operationsNotifications: notifications.status === 'fulfilled' ? (notifications.value.notifications ?? []) : [],
    operationsState,
    operationsError: reason ? message(reason) : null,
    operationsLoading: false,
    operationsCheckedAt: new Date().toISOString()
  };
}
