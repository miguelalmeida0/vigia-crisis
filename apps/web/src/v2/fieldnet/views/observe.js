import { html } from '../format.js';

const TYPES = [
  ['VISUAL_SMOKE','Smoke'], ['VISUAL_FLAME','Flame'], ['THERMAL_READING','Thermal'], ['WEATHER','Weather'],
  ['ROAD_OBSTRUCTION','Road obstruction'], ['ACCESS_CONDITION','Access condition'], ['FIELD_NOTE','Field note']
];

export function observeView(model) {
  const region = model.map?.region ?? {}, center = region.center ?? model.incident?.incidentState?.coordinate ?? model.incident?.physicalObservations?.[0]?.geometry?.coordinates ?? [-8.2, 39.7];
  return `<form class="fieldnet-capture" data-fieldnet-observation-form data-default-lon="${Number(center[0])}" data-default-lat="${Number(center[1])}">
    <header><div><span>FIELD OBSERVATION</span><h2>What do you see?</h2></div><p>Saved to this Field Node first. Human evidence is never promoted to a physical sensor family.</p></header>
    <fieldset class="fieldnet-type-grid"><legend>Observation type</legend>${TYPES.map(([value, title], index) => `<label><input type="radio" name="observationType" value="${value}" ${index === 0 ? 'checked' : ''}><span>${title}</span></label>`).join('')}</fieldset>
    <section class="fieldnet-location-block"><div><span>FIELD LOCATION</span><strong data-fieldnet-location-label>Incident package reference</strong><small data-fieldnet-location-detail>${Number(center[1]).toFixed(5)}, ${Number(center[0]).toFixed(5)} · accuracy ±50 m</small></div><button type="button" data-fieldnet-geolocate>Use device GPS</button><input type="hidden" name="longitude" value="${Number(center[0])}"><input type="hidden" name="latitude" value="${Number(center[1])}"><input type="hidden" name="accuracy" value="50"></section>
    <label class="fieldnet-capture-note"><span>NOTE</span><textarea name="note" rows="3" maxlength="600" placeholder="What is visible, changing, blocked or accessible?"></textarea></label>
    <div class="fieldnet-capture-meta"><div><span>OBSERVED</span><strong>Now</strong><input type="datetime-local" name="observedAt"></div><div><span>DEVICE CLOCK</span><strong data-fieldnet-clock-state>Synced</strong><small>Compared with Field Node at submit</small></div></div>
    <label class="fieldnet-evidence-file"><span>PHOTO / EVIDENCE</span><strong>Add camera evidence</strong><small>Raw file, capture metadata and hash remain local until synchronized.</small><input type="file" name="evidence" accept="image/*" capture="environment"></label>
    <div class="fieldnet-submit-bar"><p data-fieldnet-capture-status>${model.node.connectionState === 'FULL' ? 'Ready · central connection available' : 'Ready · will be queued locally'}</p><button type="submit">Save observation</button></div>
  </form>`;
}

export async function observationFromForm(form, model) {
  const data = new FormData(form), file = data.get('evidence'), note = String(data.get('note') ?? '').trim(), observedAtInput = data.get('observedAt');
  let evidenceReference = null, rawMaterial = `${data.get('observationType')}|${note}|${Date.now()}`;
  if (file instanceof File && file.size) {
    if (file.size > 360_000) throw new Error('Evidence file must be under 360 KB for this bounded local node.');
    const bytes = new Uint8Array(await file.arrayBuffer()); rawMaterial = bytes;
    let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    evidenceReference = { fileName:file.name, mimeType:file.type || 'application/octet-stream', byteLength:file.size, capturedAt:new Date(file.lastModified || Date.now()).toISOString(), dataBase64:btoa(binary) };
  }
  const encoded = typeof rawMaterial === 'string' ? new TextEncoder().encode(rawMaterial) : rawMaterial;
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))].map((value) => value.toString(16).padStart(2, '0')).join('');
  const device = model.devices.find((item) => item.deviceType === 'PHONE') ?? model.devices[0];
  if (!device) throw new Error('No registered FieldNet device is available.');
  return {
    observationId:`field-observation:${crypto.randomUUID()}`, incidentId:model.incidentId,
    sourceIdentity:{ kind:'HUMAN', actorId:'miguel-almeida', exercise:true }, deviceId:device.deviceId,
    observerIdentity:{ actorId:'miguel-almeida', displayName:'Miguel Almeida', role:'Shadow Operator' },
    observedAt:observedAtInput ? new Date(observedAtInput).toISOString() : new Date().toISOString(), deviceClockQuality:'SYNCED',
    geometry:{ type:'Point', coordinates:[Number(data.get('longitude')), Number(data.get('latitude'))] }, horizontalUncertaintyM:Number(data.get('accuracy')),
    observationType:String(data.get('observationType')), payload:{ note, subjectKey:`incident:${model.incidentId}`, claimField:'field_condition', claimValue:note || String(data.get('observationType')), exerciseMode:'CONTROLLED_FIELD_EXERCISE' },
    evidenceReference, calibrationState:'NOT_APPLICABLE', rawEvidenceHash:`sha256:${digest}`, causalMetadata:{ ui:'VIGIA_FIELDNET', captureMode:evidenceReference ? 'CAMERA_OR_FILE' : 'FIELD_NOTE' }
  };
}
