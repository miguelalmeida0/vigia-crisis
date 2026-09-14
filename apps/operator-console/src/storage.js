const KEY = 'vigia-mission-dark-state-v2';
const LAST_GOOD_KEY='vigia-operator-last-good-v1';

export const defaultSettings = {
  language: 'English',
  timezone: 'Europe/Lisbon (WEST)',
  units: 'Metric',
  density: 'Operational compact',
  basemap: 'Mission Dark terrain',
  territory: 'North Portugal',
  showRoads: true,
  showTerrain: true,
  preloadTerritory: true,
  physicalAlerts: true,
  sourceAlerts: true,
  preventAlerts: true,
  soundCritical: true,
  interfaceScale: '100%',
  mapLabelSize: 'Standard',
  compactTables: true,
  showFreshness: true,
  refreshInterval: '60 seconds',
  offlineCache: 'Active territory',
  cacheEvidence: true,
  preserveOriginals: true,
};

export const defaultState = {
  selectedIncidentId: null,
  selectedEvidenceId: null,
  incidentSearch: '',
  incidentPage: 1,
  incidentStateFilter: 'QUEUE',
  incidentTypeFilter: 'ALL',
  incidentSort: 'IDENTITY',
  incidentSavedFilter: 'ALL',
  incidentTab: 'overview',
  intelligenceTab: 'hypotheses',
  debtFilter: 'ALL',
  debtSearch: '',
  operationsTab: 'resolution',
  operationIncidentSearch: '',
  incidentContextSearch: '',
  quicklookRoute: null,
  quicklookIncidentId: null,
  quicklookExpanded: false,
  selectedOperationId: null,
  authorityTab: 'authority',
  controlTab: 'policies',
  reportsTab: 'summary',
  reportsRange: 'H24',
  reportsCompare: false,
  openSelectId: null,
  globalRegion: 'ALL',
  globalType: 'ALL',
  globalPriority: 'ALL',
  globalStatus: 'ALL',
  globalTime: 'ALL',
  globalSelectedIncidentId: null,
  mapZoom: 5,
  // Thermal observations and admitted support geometry remain visible through
  // canonical map layers. The optional external raster starts off until its
  // provider is explicitly requested and can prove a successful image read.
  mapThermal: false,
  mapSceneCameras: {},
  mapLayerVisibility: {},
  mapFocusedLayer: {},
  detectView: 'map',
  detectFilter: 'all',
  detectDetailTab: 'now',
  detectQueueOpen: false,
  selectedEventId: null,
  selectedDetection: 0,
  preventCompare: 52,
  preventTab: 'compare',
  selectedFindingId: null,
  selectedScreening: 0,
  resourceFilter: 'all',
  resourceSearch: '',
  selectedEvidence: 0,
  replayTime: 68,
  selectedReplayCaseId: null,
  selectedReplayEvent: 0,
  respondAcknowledged: false,
  acknowledgedActions: [],
  alertsOpen: false,
  navOpen: false,
  settingsTab: 'general',
  settingsSaved: { ...defaultSettings },
  settingsDraft: { ...defaultSettings },
  settingsSavedAt: null,
  personAcknowledgements: {},
  parReports: [],
  locationUpdates: {},
  fieldnetLastSync: null,
  handoffCompletedAt: null,
  handoffSnapshots: [],
  decisionChanges: [],
  pilotSession: null,
  pilotImportAdapter: 'CAD_JSON',
  pilotImportReceipts: [],
  dispatchRequestOpened: false,
  dispatchAgencyContactedAt: null,
  commandTransferredAt: null,
  sourceFilter: 'all',
  sourceRefreshedAt: null,
  cacheClearedAt: null,
  resourcePhotos: {},
  resourceNotes: {},
  runtime: null,
};

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return structuredClone(base);
  return {
    ...structuredClone(base),
    ...saved,
    settingsSaved: { ...base.settingsSaved, ...(saved.settingsSaved || {}) },
    settingsDraft: { ...base.settingsDraft, ...(saved.settingsDraft || saved.settingsSaved || {}) },
    personAcknowledgements: { ...(saved.personAcknowledgements || {}) },
    locationUpdates: { ...(saved.locationUpdates || {}) },
    resourcePhotos: { ...(saved.resourcePhotos || {}) },
    resourceNotes: { ...(saved.resourceNotes || {}) },
    mapSceneCameras: { ...(saved.mapSceneCameras || {}) },
    mapLayerVisibility: Object.fromEntries(Object.entries(saved.mapLayerVisibility || {}).map(([scene,layers])=>[scene,{...(layers||{})}])),
    mapFocusedLayer: { ...(saved.mapFocusedLayer || {}) },
    handoffSnapshots: Array.isArray(saved.handoffSnapshots) ? saved.handoffSnapshots.slice(-10) : [],
    decisionChanges: Array.isArray(saved.decisionChanges) ? saved.decisionChanges.slice(-100) : [],
    pilotImportReceipts: Array.isArray(saved.pilotImportReceipts) ? saved.pilotImportReceipts.slice(-20) : [],
  };
}

export function loadState() {
  try {
    return merge(defaultState, JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state) {
  const { runtime, ...persistent } = state;
  const safe = { ...persistent, alertsOpen: false, navOpen: false, openSelectId:null, handoffSnapshots:(persistent.handoffSnapshots??[]).slice(-10), decisionChanges:(persistent.decisionChanges??[]).slice(-100), pilotImportReceipts:(persistent.pilotImportReceipts??[]).slice(-20), pilotSession:persistent.pilotSession?{...persistent.pilotSession,records:(persistent.pilotSession.records??[]).slice(-1000)}:null };
  localStorage.setItem(KEY, JSON.stringify(safe));
  return safe;
}

export function resetState() {
  localStorage.removeItem(KEY);
  return structuredClone(defaultState);
}

export function persistenceKey() { return KEY; }

export function loadLastGoodRuntime(scopeKey){
  if(!scopeKey)return null;
  try{const stored=JSON.parse(sessionStorage.getItem(LAST_GOOD_KEY)||'null');return stored?.scopeKey===scopeKey&&stored?.canonical&&typeof stored.canonical==='object'?stored:null;}catch{return null;}
}

export function saveLastGoodRuntime(scopeKey,runtime){
  if(!scopeKey||!runtime?.canonical)return null;
  const snapshot={schemaVersion:'vigia.operator.last-good.v1',scopeKey,savedAt:new Date().toISOString(),canonical:runtime.canonical};
  try{sessionStorage.setItem(LAST_GOOD_KEY,JSON.stringify(snapshot));return snapshot;}catch{return null;}
}

export function clearLastGoodRuntime(){try{sessionStorage.removeItem(LAST_GOOD_KEY);}catch{}}
