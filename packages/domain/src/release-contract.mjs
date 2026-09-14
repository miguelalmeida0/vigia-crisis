export const VIGIA_RELEASE_CONTRACT = Object.freeze({
  apiContractVersion:'vigia-api-v10.5',
  operationsApiVersion:'operations-api-v6',
  validationApiVersion:'validation-api-v8',
  fieldNodeContractVersion:'fieldnet-api-v5',
  databaseSchemaVersion:'vigia-postgis-025',
  migrationHead:'025',
  domainSchemaVersion:'vigia-domain-v10.5',
  webContractVersion:'decision-os-web-v1',
  ontologyContractVersion:'vigia.crisis-ontology.v1',
  intelligenceRuleSetVersion:'vigia.intelligence-rules.v1:83ec995872f1245d'
});

export const WEB_REQUIRED_CONTRACTS=Object.freeze({
  apiContractVersion:VIGIA_RELEASE_CONTRACT.apiContractVersion,
  operationsApiVersion:VIGIA_RELEASE_CONTRACT.operationsApiVersion,
  validationApiVersion:VIGIA_RELEASE_CONTRACT.validationApiVersion,
  fieldNodeContractVersion:VIGIA_RELEASE_CONTRACT.fieldNodeContractVersion,
  databaseSchemaVersion:VIGIA_RELEASE_CONTRACT.databaseSchemaVersion,
  domainSchemaVersion:VIGIA_RELEASE_CONTRACT.domainSchemaVersion,
  ontologyContractVersion:VIGIA_RELEASE_CONTRACT.ontologyContractVersion,
  intelligenceRuleSetVersion:VIGIA_RELEASE_CONTRACT.intelligenceRuleSetVersion
});

export const CENTRAL_REQUIRED_ROUTES=Object.freeze([
  ['release','RELEASE','/api/v10/release'],
  ['health','RELEASE','/api/v10/health'],
  ['session','SESSION','/api/v10/session'],
  ['command','COMMAND','/api/v10/workspaces/command'],
  ['events','INCIDENT','/api/v10/events'],
  ['territory','COMMAND','/api/v10/territory'],
  ['prevention','PREVENTION','/api/v10/prevention/findings'],
  ['bootstrap','PREVENTION','/api/v2/bootstrap'],
  ['benchmark','VALIDATION','/api/v10/detection/benchmark'],
  ['measurement-debt','MEASUREMENT_DEBT','/api/v10/validation/measurement-debt'],
  ['prevention-science','VALIDATION','/api/v10/validation/prevention-machine-evidence'],
  ['measurement-campaigns','VALIDATION','/api/v10/validation/measurement-campaigns'],
  ['false-negative-taxonomy','VALIDATION','/api/v10/validation/false-negative-taxonomy'],
  ['live-campaign','OPERATIONS','/api/v10/campaign/live-shadow/scorecards'],
  ['pilot','VALIDATION','/api/v10/pilot/report'],
  ['alerts','ALERTS','/api/v10/alerts'],
  ['operations-status','OPERATIONS','/api/v10/operations/status'],
  ['operations-metrics','OPERATIONS','/api/v10/operations/metrics'],
  ['work','WORK','/api/v10/evidence-needs'],
  ['fieldnet-central','FIELDNET','/api/v10/fieldnet/status']
  ,['command-survival','COMMAND','/api/v10/incident-command/incidents/{incidentId}']
  ,['intelligence-inbox','INTELLIGENCE','/api/v10/intelligence/inbox']
].map(([id,product,path])=>Object.freeze({id,product,path,method:'GET'})));

export const FIELDNET_REQUIRED_ROUTES=Object.freeze([
  ['fieldnet-release','/api/fieldnet/release'],
  ['fieldnet-health','/health'],
  ['fieldnet-ready','/ready'],
  ['fieldnet-state','/api/fieldnet/state'],
  ['fieldnet-incidents','/api/fieldnet/incidents'],
  ['fieldnet-incident','/api/fieldnet/incidents/{incidentId}'],
  ['fieldnet-map','/api/fieldnet/incidents/{incidentId}/offline-map'],
  ['fieldnet-truth','/api/fieldnet/incidents/{incidentId}/truth-graph'],
  ['fieldnet-replay','/api/fieldnet/incidents/{incidentId}/replay'],
  ['fieldnet-debt','/api/fieldnet/incidents/{incidentId}/evidence-debt'],
  ['fieldnet-sensors','/api/fieldnet/sensor-gateway']
  ,['fieldnet-command-survival','/api/fieldnet/incidents/{incidentId}/command-survival']
].map(([id,path])=>Object.freeze({id,product:'FIELDNET',path,method:'GET'})));

export function releaseCompatibility({web,api,fieldNode}){
  const failures=[];
  if(!web||!api||!fieldNode)failures.push('release_identity_missing');
  if(web?.releaseId!==api?.releaseId)failures.push('web_api_release_id_mismatch');
  if(web?.releaseId!==fieldNode?.releaseId)failures.push('web_fieldnode_release_id_mismatch');
  for(const [key,value] of Object.entries(WEB_REQUIRED_CONTRACTS)){
    if(api?.contracts?.[key]!==value)failures.push(`api_${key}_incompatible`);
    if(key==='fieldNodeContractVersion'&&fieldNode?.contracts?.[key]!==value)failures.push(`fieldnode_${key}_incompatible`);
  }
  if(api?.codeStateHash!==web?.codeStateHash||fieldNode?.codeStateHash!==web?.codeStateHash)failures.push('code_state_hash_mismatch');
  if(api?.operationalDataHash!==web?.operationalDataHash||fieldNode?.operationalDataHash!==web?.operationalDataHash)failures.push('operational_data_hash_mismatch');
  if(api?.releaseStatementHash!==web?.releaseStatementHash||fieldNode?.releaseStatementHash!==web?.releaseStatementHash)failures.push('release_statement_hash_mismatch');
  return{compatible:failures.length===0,failures};
}
