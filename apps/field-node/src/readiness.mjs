const RELEASE_IDENTITY_KEYS=Object.freeze([
  'releaseId',
  'codeStateHash',
  'operationalDataHash',
  'releaseStatementHash'
]);

function exactReleaseIdentity(actual,expected){
  return RELEASE_IDENTITY_KEYS.every((key)=>Boolean(expected?.[key])&&actual?.[key]===expected[key]);
}

function check(ready,details={}){return{ready:Boolean(ready),...details};}

export function evaluateFieldNetReadiness({
  process:processState={},
  releaseIdentity=null,
  expectedReleaseIdentity=null,
  startup={},
  deploymentIdentity=null,
  incidentScope={},
  storage={},
  internalServices={},
  centralConnectivity={}
}={}){
  const checks={
    liveness:check(Boolean(processState.alive&&processState.startedAt),{startedAt:processState.startedAt??null,pid:processState.pid??null}),
    listener:check(Boolean(processState.listenerBound),{boundAt:startup.listenerAt??null}),
    releaseIdentity:check(exactReleaseIdentity(releaseIdentity,expectedReleaseIdentity),{releaseId:releaseIdentity?.releaseId??null}),
    startup:check(Boolean(startup.ready&&startup.state==='services_ready'&&startup.servicesReadyAt),{state:startup.state??'loading',servicesReadyAt:startup.servicesReadyAt??null}),
    deploymentIdentity:check(Boolean(deploymentIdentity?.state==='ready'&&exactReleaseIdentity(deploymentIdentity,expectedReleaseIdentity)),{state:deploymentIdentity?.state??'unavailable',recordedAt:deploymentIdentity?.recordedAt??null}),
    incidentScope:check(Boolean(incidentScope.exact&&incidentScope.incidentId&&incidentScope.incidentId===incidentScope.expectedIncidentId),{exact:Boolean(incidentScope.exact),incidentId:incidentScope.incidentId??null}),
    storage:check(Boolean(storage.opened&&storage.writable&&storage.state==='ready'),{state:storage.state??'unavailable',writable:Boolean(storage.writable),mode:storage.mode??null}),
    internalServices:check(Boolean(internalServices.fieldNetService&&internalServices.sensorGateway&&internalServices.deploymentIdentityStore),{fieldNetService:Boolean(internalServices.fieldNetService),sensorGateway:Boolean(internalServices.sensorGateway),deploymentIdentityStore:Boolean(internalServices.deploymentIdentityStore)})
  };
  return{
    schemaVersion:'vigia.fieldnet-readiness.v1',
    ...Object.fromEntries(RELEASE_IDENTITY_KEYS.map((key)=>[key,releaseIdentity?.[key]??null])),
    ready:Object.values(checks).every((item)=>item.ready),
    checkedAt:new Date().toISOString(),
    checks,
    centralConnectivity:{
      configured:Boolean(centralConnectivity.configured),
      connectionState:centralConnectivity.connectionState??'UNKNOWN',
      releaseCompatibility:centralConnectivity.releaseCompatibility??{state:'NOT_CHECKED',checkedAt:null,failures:[]},
      readinessGate:false,
      qualification:'Central connectivity is reported independently. FieldNet remains operationally ready offline when its local release, scope, and durable storage are valid.'
    }
  };
}

export function restrictedCapacityTaskReadiness(readiness, { nodeId, incidentId } = {}) {
  const restrictedChecks = {
    process: readiness?.checks?.liveness?.ready === true,
    listener: readiness?.checks?.listener?.ready === true,
    releaseIdentity: readiness?.checks?.releaseIdentity?.ready === true,
    startup: readiness?.checks?.startup?.ready === true,
    deploymentIdentity: readiness?.checks?.deploymentIdentity?.ready === true,
    incidentScope: readiness?.checks?.incidentScope?.ready === true,
    storage: readiness?.checks?.storage?.ready === true,
    internalServices: readiness?.checks?.internalServices?.ready === true
  };
  return Object.freeze({
    schemaVersion: 'vigia.fieldnet-capacity-task-readiness.v1',
    ready: readiness?.ready === true && Object.values(restrictedChecks).every(Boolean),
    checkedAt: readiness?.checkedAt ?? null,
    nodeId: nodeId ?? null,
    incidentScope: Object.freeze({ exact: readiness?.checks?.incidentScope?.ready === true, incidentId: incidentId ?? null }),
    releaseIdentity: Object.freeze(Object.fromEntries(RELEASE_IDENTITY_KEYS.map((key) => [key, readiness?.[key] ?? null]))),
    checks: Object.freeze(Object.fromEntries(Object.entries(restrictedChecks).map(([name, ready]) => [name, Object.freeze({ ready })]))),
    centralConnectivity: Object.freeze({
      configured: readiness?.centralConnectivity?.configured === true,
      connectionState: readiness?.centralConnectivity?.connectionState ?? 'UNKNOWN',
      readinessGate: false
    }),
    truthBoundary: 'This restricted signed response proves local FieldNet readiness for task persistence. It does not prove central connectivity, task completion, report admission, capacity, dispatch, or authority.'
  });
}
