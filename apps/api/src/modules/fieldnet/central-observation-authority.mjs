export function centralObservationAuthority(payload,originNode){
  const claimedSourceIdentity=payload.sourceIdentity&&typeof payload.sourceIdentity==='object'&&!Array.isArray(payload.sourceIdentity)?structuredClone(payload.sourceIdentity):{kind:'HUMAN'};
  const sensorClaim=String(claimedSourceIdentity.kind??'HUMAN').toUpperCase()==='SENSOR';
  if(!sensorClaim)return{
    claimedSourceIdentity,
    claimedPhysicalFamilyQualification:payload.physicalFamilyQualification??null,
    sourceIdentity:{...claimedSourceIdentity,kind:'HUMAN'},
    calibrationState:'NOT_APPLICABLE',
    physicalFamilyQualification:'HUMAN_FIELD_REPORT_NOT_PHYSICAL_SENSOR_FAMILY'
  };
  return{
    claimedSourceIdentity,
    claimedPhysicalFamilyQualification:payload.physicalFamilyQualification??null,
    sourceIdentity:{kind:'FIELDNET_NODE_SENSOR_REPORT',sensorId:String(claimedSourceIdentity.sensorId??claimedSourceIdentity.id??payload.deviceId??'UNSPECIFIED'),originNode,qualification:'CENTRAL_REGISTRATION_REQUIRED'},
    calibrationState:'CENTRAL_REGISTRATION_REQUIRED',
    physicalFamilyQualification:'FIELDNET_SENSOR_NOT_CENTRALLY_REGISTERED'
  };
}
