import { createPilotAuditSeed } from './pilot-audit-seed.mjs';
function at(base, minutes) {
  return new Date(base.getTime() - minutes * 60_000).toISOString();
}

export function createPilotOperationsSeed(clock = () => new Date()) {
  const now = clock();
  const acceptedRequest = {
    id: 'evidence-request:pilot-accepted', targetType: 'inspection', targetId: 'inspection:1816', title: 'Verify vegetation continuity beside settlement edge',
    coordinate: [-8.08, 40.76], ownerId: 'actor-field', requestedBy: 'actor-supervisor', priority: 'urgent', dueAt: at(now, -240),
    requirements: ['Geotagged wide photo', 'Access-road condition', 'Fuel continuity note'], state: 'accepted', createdAt: at(now, 1_440), updatedAt: at(now, 920),
    acknowledgedAt: at(now, 1_380), submittedAt: at(now, 1_020), resolvedAt: at(now, 920), evidencePackageId: 'evidence-package:pilot-accepted',
    review: { actorId: 'actor-supervisor', note: 'Visible continuous dry vegetation reaches the settlement boundary.' }, history: []
  };
  const activeRequest = {
    id: 'evidence-request:pilot-active', targetType: 'inspection', targetId: 'inspection:0508', title: 'Inspect emergency access and roadside fuel',
    coordinate: [-7.92, 39.75], ownerId: 'actor-field', requestedBy: 'actor-analyst', priority: 'high', dueAt: at(now, -180),
    requirements: ['Road width photo', 'Gate status', 'GPS accuracy under 25 m'], state: 'in_progress', createdAt: at(now, 180), updatedAt: at(now, 70),
    acknowledgedAt: at(now, 150), submittedAt: null, resolvedAt: null, evidencePackageId: null, review: null, history: []
  };
  const packageAccepted = {
    id: 'evidence-package:pilot-accepted', requestId: acceptedRequest.id, observerId: 'actor-field', observerRole: 'field_inspector', capturedAt: at(now, 1_060), receivedAt: at(now, 1_020),
    coordinate: [-8.079, 40.759], accuracyMeters: 8, evidenceType: 'field_observation', note: 'Continuous dry vegetation connects woodland to six structures. Access remains clear.',
    attachments: [{ id: 'pilot-photo-1', type: 'image', name: 'settlement-edge.jpg', url: '/assets/fixtures/locations/1816-current.webp', size: 182_000 }],
    observations: ['Continuous dry fuel', 'Six structures within visible corridor'], provenance: { device: 'Field Capture', clientVersion: '3.0.0', offlineCaptured: true, source: 'field-capture' },
    checksum: 'pilot-accepted-checksum', state: 'accepted', review: acceptedRequest.review
  };
  const closedRequest = {
    id: 'evidence-request:pilot-access', targetType: 'inspection', targetId: 'inspection:1013', title: 'Verify roadside residue and emergency access',
    coordinate: [-8.12, 39.93], ownerId: 'actor-field', requestedBy: 'actor-analyst', priority: 'high', dueAt: at(now, 6_800),
    requirements: ['Geotagged roadside image', 'Access width measurement', 'Combustible material note'], state: 'accepted', createdAt: at(now, 7_250), updatedAt: at(now, 6_880),
    acknowledgedAt: at(now, 7_200), submittedAt: at(now, 7_000), resolvedAt: at(now, 6_880), evidencePackageId: 'evidence-package:pilot-access-before',
    review: { actorId: 'actor-supervisor', note: 'Attributable evidence confirms combustible roadside accumulation reducing usable emergency access.' }, history: []
  };
  const accessBeforePackage = {
    id: 'evidence-package:pilot-access-before', requestId: closedRequest.id, observerId: 'actor-field', observerRole: 'field_inspector', capturedAt: at(now, 7_020), receivedAt: at(now, 7_000),
    coordinate: [-8.12, 39.93], accuracyMeters: 9, evidenceType: 'field_observation', note: 'Combustible roadside residue narrows the emergency access corridor.',
    attachments: [{ id: 'pilot-access-before', type: 'image', name: 'access-before.webp', url: '/assets/fixtures/locations/1013-current.webp', size: 170_000 }],
    observations: ['Combustible accumulation', 'Emergency access width reduced'], provenance: { device: 'Field Capture', clientVersion: '3.0.0', offlineCaptured: false, source: 'field-capture' },
    checksum: 'pilot-access-before-checksum', state: 'accepted', review: closedRequest.review
  };
  const completionPackage = {
    id: 'evidence-package:pilot-completion', requestId: 'completion:pilot-closed', observerId: 'actor-field', observerRole: 'field_inspector', capturedAt: at(now, 3_000), receivedAt: at(now, 2_980),
    coordinate: [-8.12, 39.93], accuracyMeters: 11, evidenceType: 'completion_evidence', note: 'Roadside residue removed and access width restored.',
    attachments: [{ id: 'pilot-photo-2', type: 'image', name: 'cleared-access.jpg', url: '/assets/fixtures/locations/1013-before.webp', size: 164_000 }], observations: ['Material removed', 'Heavy vehicle access restored'],
    provenance: { device: 'Field Capture', clientVersion: '3.0.0', offlineCaptured: false, source: 'field-capture' }, checksum: 'pilot-completion-checksum', state: 'accepted', review: { note: 'Completion accepted.' }
  };
  const hazard = {
    id: 'hazard:pilot-vegetation-corridor', candidateId: 'inspection:1816', evidenceRequestId: acceptedRequest.id, evidencePackageId: packageAccepted.id,
    state: 'verified_hazard', physicalHazardConfirmed: true, kind: 'vegetation_continuity', title: 'Continuous dry vegetation beside settlement edge', place: 'São Pedro do Sul',
    coordinate: [-8.08, 40.76], evidenceNote: packageAccepted.note, recommendedAction: 'Create a bounded clearance break and verify it through re-observation.',
    priority: { score: 91, band: 'urgent' }, createdAt: at(now, 900), updatedAt: at(now, 900), createdBy: 'actor-supervisor', provenance: ['Accepted field evidence']
  };
  const closedHazard = {
    id: 'hazard:pilot-access', candidateId: 'inspection:1013', evidenceRequestId: closedRequest.id, evidencePackageId: accessBeforePackage.id,
    state: 'verified_hazard', physicalHazardConfirmed: true, kind: 'combustible_accumulation', title: 'Combustible residue narrowing emergency access', place: 'Pedrógão Grande',
    coordinate: [-8.12, 39.93], evidenceNote: accessBeforePackage.note, recommendedAction: 'Remove combustible residue and restore the usable emergency access width.',
    priority: { score: 88, band: 'high' }, createdAt: at(now, 6_900), updatedAt: at(now, 6_900), createdBy: 'actor-supervisor', provenance: ['Accepted attributable field evidence']
  };
  const openRemediation = {
    id: 'remediation:pilot-open', hazardId: hazard.id, title: 'Clear settlement-edge fuel corridor', ownerId: 'actor-field', priority: 'urgent', dueAt: at(now, -360),
    coordinate: hazard.coordinate, recommendation: hazard.recommendedAction, state: 'in_progress', createdAt: at(now, 820), updatedAt: at(now, 120),
    completionEvidencePackageId: null, reobservationId: null, history: []
  };
  const closedRemediation = {
    id: 'remediation:pilot-closed', hazardId: 'hazard:pilot-access', title: 'Remove residue and reopen emergency access', ownerId: 'actor-field', priority: 'high', dueAt: at(now, 4_000),
    coordinate: [-8.12, 39.93], recommendation: 'Remove combustible residue and restore road width.', state: 'closed', createdAt: at(now, 7_200), updatedAt: at(now, 2_100), closedAt: at(now, 2_100),
    completionEvidencePackageId: completionPackage.id, reobservationId: 'reobservation:pilot-closed', history: []
  };
  return {
    hazards: [hazard, closedHazard], candidateReviews: [], incidentDecisions: {}, evidenceRequests: [activeRequest, acceptedRequest, closedRequest], evidencePackages: [packageAccepted, accessBeforePackage, completionPackage],
    interventions: [openRemediation, closedRemediation], reobservations: [{ id: 'reobservation:pilot-closed', remediationId: closedRemediation.id, outcome: 'verified_removed', observedAt: at(now, 2_160), source: 'field_and_imagery', note: 'Access restored and combustible material absent.', attachments: [{ id: 'reobservation-image', type: 'image', name: 'access-after.webp', url: '/assets/fixtures/locations/1013-before.webp' }], reviewerId: 'actor-analyst' }],
    watchPlaces: [], audit: createPilotAuditSeed(now)
  };
}
