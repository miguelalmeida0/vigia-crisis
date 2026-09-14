import { readFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { canonical, createFieldSensorRegistration, sha256, stableId } from '../../../packages/domain/src/fieldnet/contracts.mjs';

const measurementObservationType = (measurementType) => {
  const value = String(measurementType ?? '').toUpperCase();
  if (value.includes('THERMAL') || value.includes('TEMPERATURE')) return 'THERMAL_READING';
  if (['WEATHER','WIND','HUMIDITY','PRESSURE','PRECIPITATION'].some((kind) => value.includes(kind))) return 'WEATHER';
  return 'FIELD_NOTE';
};

const hardwareReport = (path) => {
  try {
    const report = JSON.parse(readFileSync(path, 'utf8'));
    return { status: report.sensorHardware, inspectedAt: report.inspectedAt, supportedFamiliesDetected: report.supportedFamiliesDetected ?? [], qualification: report.qualification };
  } catch { return { status: 'NOT_INSPECTED', inspectedAt: null, supportedFamiliesDetected: [], qualification: 'Run deterministic hardware discovery before claiming physical sensor availability.' }; }
};

const blockedAddresses=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blockedAddresses.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',128],['::1',128],['100::',64],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]])blockedAddresses.addSubnet(address,prefix,'ipv6');
const blockedAddress=(address)=>{const value=String(address).replace(/^\[|\]$/g,''),family=isIP(value);return family===0||value.toLowerCase().startsWith('::ffff:')||blockedAddresses.check(value,family===4?'ipv4':'ipv6');};
const MAX_WEBSOCKET_MESSAGE_BYTES=256*1024;
const withDeadline=async(work,timeoutMs,code)=>{let timer;try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(code),{statusCode:504})),timeoutMs);timer.unref?.();})]);}finally{clearTimeout(timer);}};

export function normalizeSensorThingsObservation(input = {}) {
  const datastream = input.Datastream ?? input.datastream ?? {};
  const feature = input.FeatureOfInterest?.feature ?? input.featureOfInterest?.feature ?? input.feature ?? null;
  return {
    sensorId: input.sensorId ?? datastream.sensorId ?? datastream['@iot.id'],
    incidentId: input.incidentId ?? input.parameters?.incidentId,
    observedAt: input.phenomenonTime ?? input.resultTime,
    receivedAt: input.resultTime ?? new Date().toISOString(),
    geometry: feature?.type === 'Point' ? feature : input.geometry,
    measurement: { value: input.result, unit: input.unitOfMeasurement?.symbol ?? input.parameters?.unit, quality: input.resultQuality ?? null },
    rawPayload: input,
    causalMetadata: { sensorThingsObservationId: input['@iot.id'] ?? null, datastreamId: datastream['@iot.id'] ?? null }
  };
}

export class FieldSensorGateway {
  constructor({ fieldNetService, hardwareReportPath, allowedWebSocketHosts = [], resolveHost=(hostname)=>lookup(hostname,{all:true}), WebSocketImpl=null, clock = () => new Date(), maxRegisteredSensors=128, maxWebSockets=16, maxWebSocketsPerPrincipal=8, maxPendingConnections=1, connectTimeoutMs=15_000, maxSocketAgeMs=60*60_000 } = {}) {
    if (!fieldNetService) throw new Error('fieldnet_service_required');
    this.service = fieldNetService; this.clock = clock; this.hardware = hardwareReport(hardwareReportPath); this.allowedWebSocketHosts=new Set(allowedWebSocketHosts.map((value)=>String(value).toLowerCase()));this.resolveHost=resolveHost;this.WebSocketImpl=WebSocketImpl;this.webSockets = new Map();this.socketPrincipals=new Map();this.socketTimers=new Map();this.pendingConnections=0;Object.assign(this,{maxRegisteredSensors,maxWebSockets,maxWebSocketsPerPrincipal,maxPendingConnections,connectTimeoutMs,maxSocketAgeMs});
  }

  status() {
    return {
      schemaVersion: 'vigia.field-sensor-gateway-status.v1',
      productionGateway: 'READY',
      hardware: this.hardware,
      adapters: {
        HTTP_LOCAL_REST: { state: 'READY', role: 'INGEST_AND_REGISTRATION' },
        SENSORTHINGS_V1_1: { state: 'READY', role: 'OBSERVATION_NORMALIZATION' },
        WEBSOCKET_CLIENT: { state: this.WebSocketImpl?.supportsPrebufferLimit===true&&Number(this.WebSocketImpl.maxPayloadBytes)<=MAX_WEBSOCKET_MESSAGE_BYTES ? 'READY' : 'BOUNDED_TRANSPORT_NOT_CONFIGURED', role: 'GOVERNED_UPSTREAM_CLIENT',maxPayloadBytes:MAX_WEBSOCKET_MESSAGE_BYTES },
        SERIAL_USB: { state: 'ADAPTER_BOUNDARY_READY_RUNTIME_LIBRARY_NOT_INSTALLED', role: 'NO_HARDWARE_CLAIM' },
        BLE: { state: 'ADAPTER_BOUNDARY_READY_RUNTIME_LIBRARY_NOT_INSTALLED', role: 'NO_HARDWARE_CLAIM' }
      },
      capacity:{registeredSensors:this.sensors().length,maxRegisteredSensors:this.maxRegisteredSensors,webSockets:this.webSockets.size,maxWebSockets:this.maxWebSockets,pendingConnections:this.pendingConnections,maxPendingConnections:this.maxPendingConnections},
      registeredSensors: this.sensors().map(({ sensorId, sensorFamily, measurementType, currentQualification, physicalFamilyEligible, mode, transport }) => ({ sensorId, sensorFamily, measurementType, currentQualification, physicalFamilyEligible, mode, transport })),
      generatedAt: this.clock().toISOString()
    };
  }

  sensors() { return this.service.store.devices().filter((device) => device.schemaVersion === 'vigia.field-sensor-registration.v1'); }

  register(input, actor) {
    const sensors=this.sensors();if(!sensors.some((item)=>item.sensorId===input.sensorId)&&sensors.length>=this.maxRegisteredSensors)throw Object.assign(new Error('field_sensor_registration_capacity_exhausted'),{statusCode:429});
    const registration = createFieldSensorRegistration(input, { now:this.clock(), originNode:this.service.store.nodeId });
    const stored = this.service.store.registerDevice(registration, actor);
    this.service.emit('field-event', { type:'FIELD_SENSOR_REGISTERED', at:this.clock().toISOString(), payload:{ sensor:stored.device, duplicate:stored.duplicate } });
    return { ...stored, qualification: { current:registration.currentQualification, trail:registration.qualificationTrail, blockers:registration.qualificationBlockers, physicalFamilyEligible:registration.physicalFamilyEligible } };
  }

  ingest(input, actor, { transport = 'HTTP_LOCAL_REST' } = {}) {
    const sensor = this.sensors().find((candidate) => candidate.sensorId === input.sensorId);
    if (!sensor) throw new Error('field_sensor_not_registered');
    if (input.rawPayload === undefined) throw new Error('sensor_raw_payload_required');
    const observedAt = new Date(input.observedAt), receivedAt = new Date(input.receivedAt ?? this.clock());
    if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(receivedAt.getTime())) throw new Error('valid_sensor_time_required');
    const geometry = input.geometry ?? sensor.location?.geometry;
    if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) throw new Error('sensor_observation_location_required');
    const unit = input.measurement?.unit ?? sensor.unit;
    if (unit !== sensor.unit) throw new Error('sensor_observation_unit_mismatch');
    const rawEvidenceHash = sha256(canonical(input.rawPayload));
    const exercise = ['TEST','EXERCISE'].includes(sensor.mode), qualified = sensor.currentQualification === 'QUALIFIED_FIELD_SENSOR' && sensor.physicalFamilyEligible && !exercise;
    const observation = {
      observationId: input.observationId ?? stableId('field-sensor-observation', sensor.sensorId, observedAt.toISOString(), rawEvidenceHash),
      incidentId: input.incidentId,
      deviceId: sensor.sensorId,
      sourceIdentity: { kind:'SENSOR', sensorId:sensor.sensorId, sensorFamily:sensor.sensorFamily, mode:sensor.mode, exercise },
      observedAt: observedAt.toISOString(), receivedAt: receivedAt.toISOString(), deviceClockQuality: sensor.timeQuality,
      geometry, horizontalUncertaintyM: Number(input.horizontalUncertaintyM ?? sensor.location?.horizontalUncertaintyM),
      observationType: measurementObservationType(sensor.measurementType),
      payload: { subjectKey:input.subjectKey ?? `sensor:${sensor.sensorId}:${sensor.measurementType}`, claimField:input.claimField ?? sensor.measurementType, claimValue:input.measurement?.value, measurementType:sensor.measurementType, value:input.measurement?.value, unit, rawPayload:input.rawPayload, rawPayloadEncoding:'PRESERVED_JSON', transport, qualificationAtObservation:sensor.currentQualification },
      evidenceReference: { kind:'FIELD_SENSOR_RAW_PAYLOAD', rawEvidenceHash, transport, firmware:sensor.firmware, model:sensor.model },
      calibrationState: sensor.calibrationStatus,
      rawEvidenceHash,
      freshnessContractMs: sensor.freshnessContractMs,
      physicalFamilyQualification: qualified ? 'QUALIFIED_FIELD_SENSOR_INDEPENDENT_PHYSICAL_FAMILY' : exercise ? 'EXERCISE_SENSOR_INELIGIBLE_FOR_PRODUCTION_EVIDENCE' : `FIELD_SENSOR_INELIGIBLE_${sensor.currentQualification}`,
      causalMetadata: { ...(input.causalMetadata ?? {}), sensorQualification:sensor.currentQualification, gatewayTransport:transport }
    };
    const result = this.service.addObservation(observation, actor);
    this.service.emit('field-event', { type:'FIELD_SENSOR_OBSERVATION_INGESTED', at:this.clock().toISOString(), payload:{ observationId:result.observation.observationId, sensorId:sensor.sensorId, physicalFamilyQualification:result.observation.physicalFamilyQualification } });
    return result;
  }

  ingestSensorThings(input, actor) { return this.ingest(normalizeSensorThingsObservation(input), actor, { transport:'SENSORTHINGS_V1_1' }); }

  async connectWebSocket({ sensorId, actor = 'field-sensor-gateway' }) {
    const transportLimit=Number(this.WebSocketImpl?.maxPayloadBytes);if(this.WebSocketImpl?.supportsPrebufferLimit!==true||!Number.isFinite(transportLimit)||transportLimit<=0||transportLimit>MAX_WEBSOCKET_MESSAGE_BYTES)throw Object.assign(new Error('field_sensor_websocket_bounded_transport_required'),{statusCode:503});
    const sensor=this.sensors().find((candidate)=>candidate.sensorId===sensorId);if(!sensor)throw new Error('field_sensor_not_registered');
    const target=new URL(sensor.websocketUrl??''),hostname=target.hostname.replace(/^\[|\]$/g,'').toLowerCase();if(target.protocol!=='wss:'||target.username||target.password||target.hash||target.href.length>4096||target.pathname.length>2048||(target.port&&target.port!=='443')||!this.allowedWebSocketHosts.has(hostname))throw Object.assign(new Error('field_sensor_websocket_destination_rejected'),{statusCode:403});
    const prior=this.webSockets.get(sensorId);if(prior&&prior.readyState<2)throw Object.assign(new Error('field_sensor_websocket_already_connected'),{statusCode:409});prior?.close?.();
    const principal=String(actor).slice(0,160),principalSockets=[...this.socketPrincipals.values()].filter((value)=>value===principal).length;
    if(this.webSockets.size>=this.maxWebSockets)throw Object.assign(new Error('field_sensor_websocket_capacity_exhausted'),{statusCode:503});
    if(principalSockets>=this.maxWebSocketsPerPrincipal)throw Object.assign(new Error('field_sensor_websocket_principal_capacity_exhausted'),{statusCode:429});
    if(this.pendingConnections>=this.maxPendingConnections)throw Object.assign(new Error('field_sensor_websocket_pending_capacity_exhausted'),{statusCode:503});
    this.pendingConnections+=1;
    let addresses,socket;
    try{socket=await withDeadline(async()=>{addresses=isIP(hostname)?[{address:hostname}]:await this.resolveHost(hostname);if(!Array.isArray(addresses)||!addresses.length||addresses.some((item)=>blockedAddress(item.address??item)))throw Object.assign(new Error('field_sensor_websocket_destination_rejected'),{statusCode:403});return new this.WebSocketImpl(target,{maxPayload:MAX_WEBSOCKET_MESSAGE_BYTES,perMessageDeflate:false});},this.connectTimeoutMs,'field_sensor_websocket_setup_timeout');}
    finally{this.pendingConnections-=1;}
    let windowStartedAt=this.clock().getTime(),messages=0;
    const cleanup=()=>{const timers=this.socketTimers.get(sensorId);if(timers){clearTimeout(timers.connect);clearTimeout(timers.age);this.socketTimers.delete(sensorId);}if(this.webSockets.get(sensorId)===socket){this.webSockets.delete(sensorId);this.socketPrincipals.delete(sensorId);}};
    socket.addEventListener('message', (event) => {try{const raw=typeof event.data==='string'?event.data:event.data instanceof ArrayBuffer?Buffer.from(event.data):Buffer.from(String(event.data));if(Buffer.byteLength(raw)>MAX_WEBSOCKET_MESSAGE_BYTES){socket.close(1009,'message_too_large');return;}const now=this.clock().getTime();if(now-windowStartedAt>=60_000){windowStartedAt=now;messages=0;}if(++messages>120){socket.close(1008,'message_rate_exceeded');return;}this.ingest({ ...JSON.parse(String(raw)), sensorId }, actor, { transport:'WEBSOCKET_CLIENT' });}catch{socket.close(1003,'invalid_sensor_message');}});
    socket.addEventListener('close',cleanup);
    const connect=setTimeout(()=>{if(this.webSockets.get(sensorId)===socket&&socket.readyState===0)socket.close(1008,'connection_timeout');},this.connectTimeoutMs),age=setTimeout(()=>{if(this.webSockets.get(sensorId)===socket)socket.close(1000,'connection_age_limit');},this.maxSocketAgeMs);connect.unref?.();age.unref?.();
    this.webSockets.set(sensorId, socket);this.socketPrincipals.set(sensorId,principal);this.socketTimers.set(sensorId,{connect,age});
    return { sensorId, state:'CONNECTING', transport:'WEBSOCKET_CLIENT' };
  }

  connectSerial() { throw new Error('serial_usb_runtime_library_not_installed'); }
  connectBle() { throw new Error('ble_runtime_library_not_installed'); }
  close() { for(const timers of this.socketTimers.values()){clearTimeout(timers.connect);clearTimeout(timers.age);}this.socketTimers.clear();for (const socket of this.webSockets.values()) socket.close(); this.webSockets.clear();this.socketPrincipals.clear(); }
}
