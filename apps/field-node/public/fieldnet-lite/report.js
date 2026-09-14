import { $, MEDIA_STORE, digest, put } from './core.js';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const genericFields = (label = 'Subject') => `
  <label class="field"><span>${label} identifier</span><input name="subjectId" required maxlength="160" autocomplete="off"></label>
  <label class="field"><span>Observed status</span><input name="status" required maxlength="100" autocomplete="off"></label>
  <label class="field field--full"><span>Structured detail <span class="optional">optional</span></span><input name="details" maxlength="500" autocomplete="off"></label>`;

const reportFields = {
  ROAD_ACCESS: `
    <label class="field"><span>Road identifier</span><input name="roadId" required maxlength="160" autocomplete="off"></label>
    <label class="field"><span>Access state</span><select name="accessState" required><option>PASSABLE</option><option>RESTRICTED</option><option>BLOCKED</option><option>UNKNOWN</option></select></label>
    <label class="field"><span>Direction</span><select name="direction"><option>BOTH</option><option>FORWARD</option><option>REVERSE</option><option>UNKNOWN</option></select></label>
    <label class="field"><span>Alternative known</span><select name="alternativeRouteKnown"><option>UNKNOWN</option><option>YES</option><option>NO</option></select></label>
    <label class="field field--full"><span>Vehicle classes <span class="optional">comma-separated</span></span><input name="vehicleClasses" value="EMERGENCY" maxlength="240"></label>`,
  HOSPITAL_CAPACITY_UPDATE: `
    <label class="field"><span>Facility identifier</span><input name="facilityId" required maxlength="160" autocomplete="off"></label>
    <label class="field"><span>Emergency department</span><select name="edStatus"><option>UNKNOWN</option><option>OPERATIONAL</option><option>LIMITED</option><option>DIVERTING</option><option>CLOSED</option></select></label>
    <label class="field"><span>Beds available <span class="optional">blank = unknown</span></span><input name="bedsAvailable" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>ICU availability</span><select name="icuAvailability"><option>UNKNOWN</option><option>AVAILABLE</option><option>LIMITED</option><option>UNAVAILABLE</option></select></label>
    <label class="field"><span>Doctors on duty <span class="optional">aggregate</span></span><input name="doctors" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Nurses available <span class="optional">aggregate</span></span><input name="nurses" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Ambulance access</span><select name="ambulanceAccess"><option>UNKNOWN</option><option>OPEN</option><option>RESTRICTED</option><option>CLOSED</option></select></label>
    <label class="field"><span>Accepting patients</span><select name="acceptingPatients"><option>UNKNOWN</option><option>YES</option><option>NO</option></select></label>
    <label class="field"><span>Next expected update <span class="optional">optional</span></span><input name="nextExpectedUpdate" type="datetime-local"></label>
    <label class="field field--full"><span>Operational constraints <span class="optional">comma-separated; no personal details</span></span><input name="constraints" maxlength="500" autocomplete="off"></label>`,
  FIRE_STATION_CAPACITY_UPDATE: `
    <label class="field"><span>Station identifier</span><input name="stationId" required maxlength="160" autocomplete="off"></label>
    <label class="field"><span>Crews available <span class="optional">blank = unknown</span></span><input name="crewsAvailable" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Crew size <span class="optional">aggregate</span></span><input name="crewSize" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Engines available</span><input name="enginesAvailable" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Tankers available</span><input name="tankersAvailable" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Crews already committed</span><input name="crewsCommitted" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Command vehicles available</span><input name="commandVehiclesAvailable" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Specialist teams available</span><input name="specialistTeamsAvailable" type="number" inputmode="numeric" min="0"></label>
    <label class="field"><span>Mobilization minutes</span><input name="estimatedMobilizationMinutes" type="number" inputmode="decimal" min="0"></label>
    <label class="field"><span>Communications</span><select name="communicationsStatus"><option>UNKNOWN</option><option>OPERATIONAL</option><option>DEGRADED</option><option>UNAVAILABLE</option></select></label>
    <label class="field"><span>Next expected update <span class="optional">optional</span></span><input name="nextExpectedUpdate" type="datetime-local"></label>
    <label class="field field--full"><span>Specialist capabilities <span class="optional">comma-separated</span></span><input name="specialistCapabilities" maxlength="400" autocomplete="off"></label>
    <label class="field field--full"><span>Operational constraints <span class="optional">comma-separated; no personal details</span></span><input name="constraints" maxlength="500" autocomplete="off"></label>`
};

export function renderReportFields() {
  const type = $('#report-type').value;
  $('#structured-fields').innerHTML = reportFields[type] ?? genericFields(type === 'FIRE_SMOKE' ? 'Observed feature' : 'Subject');
}

const nullableNumber = (form, key) => {
  const value = form.get(key);
  return value === '' || value === null ? null : Number(value);
};
const list = (value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

export function structuredAnswers(type, form) {
  if (type === 'ROAD_ACCESS') return {
    roadId: form.get('roadId'), accessState: form.get('accessState'), direction: form.get('direction'),
    alternativeRouteKnown: form.get('alternativeRouteKnown'), vehicleClasses: list(form.get('vehicleClasses')), constraints: []
  };
  if (type === 'HOSPITAL_CAPACITY_UPDATE') return {
    facilityId: form.get('facilityId'), edStatus: form.get('edStatus'), bedsAvailable: nullableNumber(form, 'bedsAvailable'),
    icuAvailability: form.get('icuAvailability'), staffAvailable: { DOCTORS: nullableNumber(form, 'doctors'), NURSES: nullableNumber(form, 'nurses') },
    ambulanceAccess: form.get('ambulanceAccess'), acceptingPatients: form.get('acceptingPatients'),
    nextExpectedUpdate: form.get('nextExpectedUpdate') || null, constraints: list(form.get('constraints'))
  };
  if (type === 'FIRE_STATION_CAPACITY_UPDATE') return {
    stationId: form.get('stationId'), crewsAvailable: nullableNumber(form, 'crewsAvailable'), crewSize: nullableNumber(form, 'crewSize'),
    enginesAvailable: nullableNumber(form, 'enginesAvailable'), tankersAvailable: nullableNumber(form, 'tankersAvailable'),
    commandVehiclesAvailable: nullableNumber(form, 'commandVehiclesAvailable'), specialistTeamsAvailable: nullableNumber(form, 'specialistTeamsAvailable'),
    estimatedMobilizationMinutes: nullableNumber(form, 'estimatedMobilizationMinutes'),
    alreadyCommittedResources: { CREWS: nullableNumber(form, 'crewsCommitted') },
    specialistCapabilities: list(form.get('specialistCapabilities')), communicationsStatus: form.get('communicationsStatus'),
    nextExpectedUpdate: form.get('nextExpectedUpdate') || null, constraints: list(form.get('constraints'))
  };
  return { subjectId: form.get('subjectId'), status: form.get('status'), details: form.get('details') || null, quantity: null, unit: null };
}

export async function mediaReference(file, capturedAt) {
  if (!file || !file.size) return null;
  if (file.size > MAX_MEDIA_BYTES) throw new Error('Each media item must be 25 MB or smaller.');
  const evidenceHash = await digest(await file.arrayBuffer());
  const kind = file.type.startsWith('video/') ? 'VIDEO' : file.type.startsWith('audio/') ? 'AUDIO' : 'PHOTO';
  await put(MEDIA_STORE, { evidenceHash, kind, contentType: file.type || 'application/octet-stream', byteLength: file.size, capturedAt, blob: file });
  return { evidenceHash, kind, contentType: file.type || 'application/octet-stream', byteLength: file.size, capturedAt };
}

export function containsPii(value) {
  return /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value) || /(?:^|\D)(?:\+?\d[\d ().-]{7,}\d)(?:\D|$)/.test(value);
}
