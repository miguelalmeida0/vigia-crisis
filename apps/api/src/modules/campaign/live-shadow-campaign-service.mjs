import { createHash } from 'node:crypto';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';

const SCHEMA = 'vigia.live-shadow-campaign.v2';
const LEGACY_SCHEMA = 'vigia.live-shadow-campaign.v1';
const OUTCOME_STATES = new Set(['CONFIRMED_COMPATIBLE', 'REFERENCE_CONTRADICTED', 'REPORT_ONLY', 'PHYSICAL_ONLY_UNRESOLVED', 'IDENTITY_CONFLICT', 'NO_REFERENCE']);
const OUTCOME_ALIASES = Object.freeze({ DUPLICATE_IDENTITY_CONFLICT:'IDENTITY_CONFLICT', NO_REFERENCE_AVAILABLE:'NO_REFERENCE' });
const OPERATIONAL_TYPES = new Set(['EVIDENCE_DEBT_CREATED', 'EVIDENCE_DEBT_RESOLVED', 'EVIDENCE_DEBT_PARTIALLY_MEASURED', 'EVIDENCE_DEBT_PRESERVED', 'OPERATOR_CORRECTION', 'FIELDNET_OFFLINE_STARTED', 'FIELDNET_OFFLINE_ENDED', 'FIELDNET_SYNC_SUCCEEDED']);
const EMPTY = Object.freeze({ schemaVersion:SCHEMA, campaignId:'VIGIA_LIVE_SHADOW_CAMPAIGN', name:'VIGIA LIVE SHADOW CAMPAIGN', createdAt:null, prospectiveBoundaryAt:null, releaseId:null, releases:[], records:[], fieldnetBaseline:null, evidenceDebtBaseline:null, lastCapturedAt:null });
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const hashId = (...parts) => hash(parts.join('|')).slice(0, 28);
const validTime = (value) => value !== null && value !== undefined && Number.isFinite(Date.parse(value));
const reachableSource = (value) => !['UNAVAILABLE','NOT_CONFIGURED','RUNTIME_UNAVAILABLE','FAILED'].includes(String(value ?? '').toUpperCase());
const iso = (value) => new Date(value).toISOString();

export class LiveShadowCampaignService {
  #chain = Promise.resolve();
  constructor({ filePath, acquisitionStore, alertService, centralFieldNetService, evidenceClosureService, releaseId = 'vigia-10.0.0', clock = () => new Date(), writer = writeJsonAtomic } = {}) {
    Object.assign(this, { filePath, acquisitionStore, alertService, centralFieldNetService, evidenceClosureService, releaseId, clock, writer });
    this.state = structuredClone(EMPTY);
  }

  async initialize() {
    const loaded = await readJson(this.filePath, null), now = this.clock().toISOString();
    if ([SCHEMA, LEGACY_SCHEMA].includes(loaded?.schemaVersion) && validTime(loaded.prospectiveBoundaryAt)) this.state = migrateState(loaded, this.releaseId, now);
    else this.state = { ...structuredClone(EMPTY), createdAt:now, prospectiveBoundaryAt:now, releaseId:this.releaseId, releases:[{ releaseId:this.releaseId, startedAt:now, prospectiveBoundaryAt:now }], fieldnetBaseline:this.centralFieldNetService?.status?.() ?? null, evidenceDebtBaseline:await this.#evidenceDebtStatus() };
    await this.writer(this.filePath, this.state);
    return this.status();
  }

  async capture({ live = {}, cycle = null } = {}) { return this.#serialize(() => this.#capture({ live, cycle })); }

  async appendOutcome(outcome = {}) {
    return this.#serialize(async () => {
      const suppliedState = String(outcome.outcomeState ?? '').replace('/', '_'), state = OUTCOME_ALIASES[suppliedState] ?? suppliedState;
      if (!OUTCOME_STATES.has(state)) throw new Error('prospective_outcome_state_invalid');
      if (!outcome.eventId || !outcome.referenceId || !validTime(outcome.referenceObservedAt)) throw new Error('attributable_prospective_outcome_required');
      const eventRecord = this.state.records.find((record) => record.type === 'PHYSICAL_EVENT' && record.sourceId === String(outcome.eventId) && record.metricEligibility === 'ELIGIBLE');
      if (!eventRecord) throw new Error('prospective_event_record_required');
      const now = this.clock().toISOString();
      const record = this.#makeRecord('OUTCOME_JOINED', `${outcome.eventId}:${outcome.referenceId}:${state}`, outcome.referenceObservedAt, now, {
        eventId:String(outcome.eventId), outcomeState:state, referenceId:String(outcome.referenceId), referenceAuthority:outcome.referenceAuthority ?? null, referenceObservedAt:iso(outcome.referenceObservedAt), originalDecisionRecordHash:eventRecord.recordHash, qualification:outcome.qualification ?? null
      });
      if (!record) throw new Error('retrospective_outcome_rejected');
      if (!this.state.records.some((item) => item.id === record.id)) this.state.records.push(record);
      this.state.lastCapturedAt = now;
      await this.writer(this.filePath, this.state);
      return structuredClone(record);
    });
  }

  async recordOperationalEvidence({ type, sourceId, observedAt, data = {} } = {}) {
    if (!OPERATIONAL_TYPES.has(type)) throw new Error('prospective_operational_record_type_invalid');
    return this.#serialize(async () => {
      const now = this.clock().toISOString(), record = this.#makeRecord(type, sourceId, observedAt, now, data);
      if (!record) throw new Error('retrospective_operational_record_rejected');
      if (!this.state.records.some((item) => item.id === record.id)) this.state.records.push(record);
      this.state.lastCapturedAt = now;
      await this.writer(this.filePath, this.state);
      return structuredClone(record);
    });
  }

  async #capture({ live, cycle }) {
    const now = this.clock().toISOString(), prior = new Set(this.state.records.map((record) => record.id)), additions = [];
    const add = (type, sourceId, admittedAt, data = {}, metricEligibility = 'ELIGIBLE') => {
      const record = this.#makeRecord(type, sourceId, admittedAt, now, data, [...this.state.records, ...additions], metricEligibility);
      if (!record || prior.has(record.id)) return null;
      prior.add(record.id); additions.push(record); return record;
    };
    const sourceStates = Object.entries(live.sources ?? {}).filter(([, source]) => source && typeof source === 'object').map(([sourceFamily, source]) => ({ sourceFamily, state:source.state ?? source.status ?? source.healthState ?? 'UNKNOWN', observedAt:source.observedAt ?? source.lastObservationAt ?? null, receivedAt:source.receivedAt ?? source.lastReceivedAt ?? null }));
    add('CAMPAIGN_CYCLE', `cycle:${now}`, now, { sourceStates, liveState:live.state ?? null, worldChanged:cycle?.lastCycle?.worldChanged ?? null });
    for (const product of this.acquisitionStore?.products?.() ?? []) add('SOURCE_ACQUISITION', product.id, product.receivedAt, { sourceId:product.sourceId, provider:product.provider, processingState:product.processingState, sourceTimestamp:product.sourceTimestamp, checksumSha256:product.checksumSha256, qualification:'Prospective acquisition evidence only; a historical source timestamp does not become a prospective physical event.' }, 'ACQUISITION_ONLY');
    const eligibleEventIds = new Set();
    for (const event of live.events ?? []) {
      const timing = event.prospectiveDetectionTiming ?? {}, providerObservationAt = timing.providerObservationAt;
      const record = validTime(providerObservationAt) ? add('PHYSICAL_EVENT', event.id, providerObservationAt, { eventId:event.id, providerObservationAt:iso(providerObservationAt), providerReceivedAt:timing.providerReceivedAt ?? null, vigiaIngestedAt:timing.vigiaIngestedAt ?? null, eventCreatedAt:timing.eventCreatedAt ?? event.createdAt ?? null, firstPublicReportAt:timing.firstPublicReportAt ?? null, physicalFirst:event.physicalFirst === true, alertEligible:event.alertEligibility?.eligible === true || event.actionNeed?.needsRouting === true, evidenceState:event.evidenceState ?? null, families:event.physicalSourceProfile?.families ?? [], sourceCount:event.physicalSourceProfile?.sourceCount ?? null, finalState:event.state ?? event.status ?? null }) : null;
      if (!record) continue;
      eligibleEventIds.add(String(event.id));
      if ((event.physicalSourceProfile?.families ?? []).length >= 2) add('SECOND_FAMILY_EVIDENCE', event.id, providerObservationAt, { eventId:event.id, families:event.physicalSourceProfile.families });
    }
    for (const alert of this.alertService?.snapshot?.().alerts ?? []) {
      const alertAt = alert.openedAt ?? alert.createdAt;
      if (!validTime(alertAt)) continue;
      const eventEligible = eligibleEventIds.has(String(alert.eventId)) || this.state.records.some((record) => record.type === 'PHYSICAL_EVENT' && record.sourceId === String(alert.eventId) && record.metricEligibility === 'ELIGIBLE');
      add('ALERT_CREATED', alert.id, alertAt, { alertId:alert.id, eventId:alert.eventId, priority:alert.priority, lifecycleState:alert.lifecycleState ?? null, eventProspectiveEligible:eventEligible, deliveryState:alert.deliveryState ?? alert.payload?.deliveryState ?? null });
      const deliveryState = String(alert.deliveryState ?? alert.payload?.deliveryState ?? '').toUpperCase();
      if (validTime(alert.deliveredAt) || ['DELIVERED','SENT'].includes(deliveryState)) add('ALERT_DELIVERED', alert.id, validTime(alert.deliveredAt) ? alert.deliveredAt : now, { alertId:alert.id, eventId:alert.eventId, eventProspectiveEligible:eventEligible, timeQuality:validTime(alert.deliveredAt) ? 'ATTRIBUTABLE_TIMESTAMP' : 'PROSPECTIVELY_OBSERVED_STATE' });
      if (validTime(alert.acknowledgedAt)) add('ALERT_ACKNOWLEDGED', alert.id, alert.acknowledgedAt, { alertId:alert.id, eventId:alert.eventId, actorId:alert.acknowledgedBy ?? null, eventProspectiveEligible:eventEligible });
      if (validTime(alert.escalatedAt) || String(alert.lifecycleState).toUpperCase() === 'ESCALATED') add('ALERT_ESCALATED', alert.id, validTime(alert.escalatedAt) ? alert.escalatedAt : now, { alertId:alert.id, eventId:alert.eventId, eventProspectiveEligible:eventEligible });
      if (String(alert.lifecycleState).toUpperCase() === 'SUPPRESSED') add('ALERT_SUPPRESSED', alert.id, alert.resolvedAt ?? now, { alertId:alert.id, eventId:alert.eventId, eventProspectiveEligible:eventEligible, resolutionCode:alert.resolutionCode ?? null });
    }
    const fieldnet = this.centralFieldNetService?.status?.(), snapshot = this.centralFieldNetService?.snapshot?.();
    if (fieldnet && Number(fieldnet.persistedMutations) > Number(this.state.fieldnetBaseline?.persistedMutations ?? 0)) add('FIELDNET_RECONCILIATION_PROGRESS', `fieldnet:${fieldnet.cursor}`, now, { acceptedMutationsSinceBoundary:Number(fieldnet.persistedMutations) - Number(this.state.fieldnetBaseline?.persistedMutations ?? 0), canonicalIncidentsSinceBoundary:Math.max(0, Number(fieldnet.canonicalIncidents) - Number(this.state.fieldnetBaseline?.canonicalIncidents ?? 0)), cursor:fieldnet.cursor, observationsSinceBoundary:Math.max(0, Number(snapshot?.observations?.length ?? 0) - Number(this.state.fieldnetBaseline?.observations ?? 0)), conflictsOpen:snapshot?.conflicts?.filter((item) => item.state !== 'RESOLVED').length ?? 0, conflictsResolved:snapshot?.conflicts?.filter((item) => item.state === 'RESOLVED').length ?? 0 });
    const evidenceDebt = await this.#evidenceDebtStatus();
    if (evidenceDebt) add('EVIDENCE_DEBT_STATUS', `evidence-debt:${now}`, now, evidenceDebt);
    this.state = { ...this.state, records:[...this.state.records, ...additions], lastCapturedAt:now };
    await this.writer(this.filePath, this.state);
    return { captured:additions.length, totalRecords:this.state.records.length, lastCapturedAt:now, chainHead:this.state.records.at(-1)?.recordHash ?? null };
  }

  #makeRecord(type, sourceId, admittedAt, recordedAt, data = {}, records = this.state.records, metricEligibility = 'ELIGIBLE') {
    if (!sourceId || !validTime(admittedAt) || Date.parse(admittedAt) < Date.parse(this.state.prospectiveBoundaryAt)) return null;
    const observedAt = iso(admittedAt), id = `campaign-record:${hashId(type, sourceId, observedAt)}`;
    const sequence = records.length + 1, previousHash = records.at(-1)?.recordHash ?? null;
    const core = { id, sequence, previousHash, type, sourceId:String(sourceId), observedAt, recordedAt:iso(recordedAt), releaseId:this.releaseId, evidenceClass:'PROSPECTIVE', metricEligibility, data:structuredClone(data) };
    return { ...core, recordHash:`sha256:${hash(core)}` };
  }

  #serialize(work) { const run = this.#chain.then(work); this.#chain = run.catch(() => undefined); return run; }
  async #evidenceDebtStatus() { try { return await this.evidenceClosureService?.status?.() ?? null; } catch { return null; } }

  status() {
    const chain = verifyChain(this.state.records);
    return { schemaVersion:this.state.schemaVersion, campaignId:this.state.campaignId, name:this.state.name, state:'RUNNING_PROSPECTIVELY', releaseId:this.releaseId, releases:structuredClone(this.state.releases), createdAt:this.state.createdAt, prospectiveBoundaryAt:this.state.prospectiveBoundaryAt, lastCapturedAt:this.state.lastCapturedAt, recordCount:this.state.records.length, chainIntegrity:chain, retrospectiveBackfillAllowed:false, qualification:'Provider observation time gates physical-event admission. Historical acquisitions remain acquisition evidence and cannot enter prospective detection metrics.' };
  }

  outcomes() { return { schemaVersion:'vigia.prospective-outcomes.v2', campaign:this.status(), outcomeStates:[...OUTCOME_STATES], retrospectiveBackfillAllowed:false, outcomes:this.state.records.filter((record) => record.type === 'OUTCOME_JOINED').map((record) => structuredClone(record)) }; }
  scorecards() { return { schemaVersion:'vigia.live-shadow-scorecards.v2', campaign:this.status(), generatedAt:this.clock().toISOString(), windows:[['LAST_24_HOURS',24],['LAST_7_DAYS',168],['LAST_30_DAYS',720]].map(([label,hours]) => this.#scorecard(label, hours)) }; }

  #scorecard(label, hours) {
    const end = this.clock().getTime(), start = Math.max(Date.parse(this.state.prospectiveBoundaryAt), end - hours * 3_600_000);
    const records = this.state.records.filter((record) => Date.parse(record.recordedAt) >= start && Date.parse(record.recordedAt) <= end && record.evidenceClass === 'PROSPECTIVE');
    const ofType = (type) => records.filter((record) => record.type === type), events = ofType('PHYSICAL_EVENT').filter((record) => record.metricEligibility === 'ELIGIBLE');
    const eventIds = new Set(events.map((record) => String(record.sourceId))), alertFilter = (record) => record.data.eventProspectiveEligible === true && eventIds.has(String(record.data.eventId));
    const alerts = ofType('ALERT_CREATED').filter(alertFilter), delivered = ofType('ALERT_DELIVERED').filter(alertFilter), acknowledgements = ofType('ALERT_ACKNOWLEDGED').filter(alertFilter), escalated = ofType('ALERT_ESCALATED').filter(alertFilter), suppressed = ofType('ALERT_SUPPRESSED').filter(alertFilter), outcomes = ofType('OUTCOME_JOINED');
    const cycles = ofType('CAMPAIGN_CYCLE'), sourceChecks = cycles.flatMap((record) => record.data.sourceStates ?? []);
    const latestDebt = ofType('EVIDENCE_DEBT_STATUS').at(-1)?.data, baselineDebt = this.state.evidenceDebtBaseline ?? {};
    const fieldnet = ofType('FIELDNET_RECONCILIATION_PROGRESS'), latestFieldnet = fieldnet.at(-1)?.data;
    const alertEligibleIds = new Set([...events.filter((record) => record.data.alertEligible).map((record) => record.sourceId), ...alerts.map((record) => record.data.eventId)]);
    return {
      label, startAt:iso(start), endAt:iso(end), prospectiveRecordCount:records.length,
      metrics: {
        sourceUptime:ratio(sourceChecks.filter((source) => reachableSource(source.state)).length, sourceChecks.length),
        sourceAvailability:ratio(sourceChecks.filter((source) => reachableSource(source.state)).length, sourceChecks.length),
        physicalCandidates:count(events.length, 'physical candidates'),
        physicalFirst:ratio(events.filter((record) => record.data.physicalFirst).length, events.length),
        multisource:ratio(events.filter((record) => (record.data.families ?? []).length >= 2).length, events.length),
        alertEligible:count(alertEligibleIds.size, 'alert-eligible physical events'),
        alertsOpened:count(alerts.length, 'alerts opened'),
        alerts:count(alerts.length, 'alerts'),
        delivered:ratio(delivered.length, alerts.length), acknowledged:ratio(acknowledgements.length, delivered.length), escalated:ratio(escalated.length, alerts.length), suppressed:ratio(suppressed.length, alerts.length),
        alertsDelivered:ratio(delivered.length, alerts.length),
        contradictedWithReference:ratio(outcomes.filter((record) => record.data.outcomeState === 'REFERENCE_CONTRADICTED').length, outcomes.filter((record) => !['NO_REFERENCE','NO_REFERENCE_AVAILABLE','PHYSICAL_ONLY_UNRESOLVED'].includes(record.data.outcomeState)).length),
        attributableOutcomes:outcomes.length ? measuredValue(outcomes.length, 'count') : noCases('No external outcome labels were observed prospectively.'),
        missedReferenceCases:ratio(outcomes.filter((record) => record.data.outcomeState === 'REPORT_ONLY').length, outcomes.filter((record) => record.data.outcomeState === 'REPORT_ONLY' || eventIds.has(String(record.data.eventId))).length),
        eventToAlert:latency(events, alerts, (event, alert) => String(event.sourceId) === String(alert.data.eventId), (event) => event.data.eventCreatedAt ?? event.observedAt),
        alertToDelivery:latency(alerts, delivered, (alert, delivery) => alert.sourceId === delivery.sourceId),
        deliveryToAcknowledgement:latency(delivered, acknowledgements, (delivery, ack) => delivery.sourceId === ack.sourceId),
        evidenceDebtOpen:latestDebt ? measuredValue(Number(latestDebt.open ?? 0), 'count') : noCases('No EvidenceDebt status snapshot entered this window.'),
        evidenceDebtsCreated:count(ofType('EVIDENCE_DEBT_CREATED').length, 'evidence debts created'),
        evidenceDebtAutoclosed:latestDebt ? count(Math.max(0, Number(latestDebt.closed ?? 0) - Number(baselineDebt.closed ?? 0)), 'system-resolved EvidenceDebt') : noCases('No EvidenceDebt status snapshot entered this window.'),
        evidenceDebtsSystemResolved:latestDebt ? count(Math.max(0, Number(latestDebt.closed ?? 0) - Number(baselineDebt.closed ?? 0)), 'system-resolved EvidenceDebt') : noCases('No EvidenceDebt status snapshot entered this window.'),
        preservedUnknowns:latestDebt ? measuredValue(Number(latestDebt.preserved ?? 0), 'count') : noCases('No EvidenceDebt status snapshot entered this window.'),
        operatorCorrections:count(ofType('OPERATOR_CORRECTION').length, 'operator corrections'),
        fieldNetSessions:fieldnet.length ? count(fieldnet.length, 'FieldNet reconciliation sessions') : noCases('No FieldNet reconciliation session entered this window.'),
        fieldNetObservations:latestFieldnet ? measuredValue(Number(latestFieldnet.observationsSinceBoundary ?? 0), 'count') : noCases('No FieldNet observation denominator entered this window.'),
        fieldNetIncidents:latestFieldnet ? measuredValue(Number(latestFieldnet.canonicalIncidentsSinceBoundary ?? 0), 'count') : noCases('No FieldNet incident denominator entered this window.'),
        offlineMinutes:offlineMinutes(records),
        offlinePeriods:offlineMinutes(records),
        syncSuccess:ratio(ofType('FIELDNET_SYNC_SUCCEEDED').length || fieldnet.length, ofType('FIELDNET_SYNC_SUCCEEDED').length + ofType('FIELDNET_OFFLINE_STARTED').length || fieldnet.length),
        conflictsOpen:latestFieldnet ? measuredValue(Number(latestFieldnet.conflictsOpen ?? 0), 'count') : noCases('No conflict snapshot entered this window.'),
        conflictsResolved:latestFieldnet ? measuredValue(Number(latestFieldnet.conflictsResolved ?? 0), 'count') : noCases('No conflict snapshot entered this window.'),
        outcomes:count(outcomes.length, 'prospectively joined outcomes')
      }
    };
  }
}

function migrateState(loaded, releaseId, now) {
  const releases = Array.isArray(loaded.releases) ? structuredClone(loaded.releases) : [{ releaseId:loaded.releaseId ?? 'vigia-legacy-unversioned', startedAt:loaded.createdAt ?? loaded.prospectiveBoundaryAt, prospectiveBoundaryAt:loaded.prospectiveBoundaryAt }];
  if (!releases.some((release) => release.releaseId === releaseId)) releases.push({ releaseId, startedAt:now, prospectiveBoundaryAt:loaded.prospectiveBoundaryAt, successorOf:releases.at(-1)?.releaseId ?? null });
  if (loaded.schemaVersion === SCHEMA) {
    if (verifyChain(loaded.records ?? []).state !== 'VERIFIED') throw new Error('campaign_chain_integrity_failed');
    return { ...structuredClone(EMPTY), ...loaded, releaseId, releases, records:structuredClone(loaded.records ?? []) };
  }
  let previousHash = null;
  const records = (loaded.records ?? []).map((record, index) => {
    const { sequence:_sequence, previousHash:_previousHash, recordHash:_recordHash, ...legacy } = record;
    const metricEligibility = record.metricEligibility ?? (record.type === 'PHYSICAL_EVENT' ? 'INELIGIBLE_LEGACY_MISSING_PROVIDER_OBSERVATION_TIME' : record.type === 'SOURCE_ACQUISITION' ? 'ACQUISITION_ONLY' : 'ELIGIBLE');
    const core = { ...legacy, sequence:index + 1, previousHash, releaseId:record.releaseId ?? loaded.releaseId ?? 'vigia-legacy-unversioned', evidenceClass:'PROSPECTIVE', metricEligibility };
    const migrated = { ...core, recordHash:`sha256:${hash(core)}` }; previousHash = migrated.recordHash; return migrated;
  });
  return { ...structuredClone(EMPTY), ...loaded, schemaVersion:SCHEMA, releaseId, releases, records, evidenceDebtBaseline:loaded.evidenceDebtBaseline ?? null };
}
function verifyChain(records) { let previousHash = null; for (let index = 0; index < records.length; index += 1) { const { recordHash, ...core } = records[index]; if (core.sequence !== index + 1 || core.previousHash !== previousHash || recordHash !== `sha256:${hash(core)}`) return { state:'FAILED', verifiedRecords:index, head:previousHash }; previousHash = recordHash; } return { state:'VERIFIED', verifiedRecords:records.length, head:previousHash }; }
function ratio(numerator, denominator) { return denominator > 0 ? { state:'MEASURED', numerator, denominator, value:Number((numerator / denominator).toFixed(4)), unit:'ratio' } : noCases('No observed eligible denominator in this prospective window.'); }
function count(value, name) { return value > 0 ? { state:'MEASURED', numerator:value, denominator:{ kind:'PROSPECTIVE_WINDOW' }, value, unit:'count', name } : noCases(`No observed ${name} in this prospective window.`); }
function measuredValue(value, unit) { return { state:'MEASURED', numerator:value, denominator:{ kind:'STATUS_SNAPSHOT' }, value, unit }; }
function noCases(qualification) { return { state:'NO_OBSERVED_CASES', numerator:null, denominator:0, value:null, qualification }; }
function latency(from, to, match, fromTime = (record) => record.observedAt) { const values = []; for (const start of from) { const end = to.find((item) => match(start, item)); const duration = Date.parse(end?.observedAt ?? '') - Date.parse(fromTime(start) ?? ''); if (Number.isFinite(duration) && duration >= 0) values.push(duration); } if (!values.length) return noCases('No attributable ordered latency pair entered this prospective window.'); values.sort((a,b)=>a-b); return { state:'MEASURED', samples:values.length, medianMs:values[Math.floor((values.length - 1) / 2)], p95Ms:values[Math.floor((values.length - 1) * .95)], unit:'milliseconds' }; }
function offlineMinutes(records) { const starts = records.filter((record) => record.type === 'FIELDNET_OFFLINE_STARTED'), ends = records.filter((record) => record.type === 'FIELDNET_OFFLINE_ENDED'); const values = starts.map((start) => { const end = ends.find((item) => item.sourceId === start.sourceId && Date.parse(item.observedAt) >= Date.parse(start.observedAt)); return end ? (Date.parse(end.observedAt) - Date.parse(start.observedAt)) / 60_000 : null; }).filter((value) => Number.isFinite(value)); return values.length ? measuredValue(Number(values.reduce((sum,value)=>sum+value,0).toFixed(2)), 'minutes') : noCases('No closed prospectively timestamped offline interval entered this window.'); }
