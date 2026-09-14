import { createHash } from 'node:crypto';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function at(base, minutes) { return new Date(base.getTime() - minutes * 60_000).toISOString(); }

export function createPilotAuditSeed(now = new Date()) {
  const events = [
    { at: at(now, 7_250), actorId: 'actor-analyst', actorRole: 'analyst', type: 'evidence.requested', entityType: 'inspection', entityId: 'inspection:pilot-access', payload: { purpose: 'Verify roadside residue and emergency access' } },
    { at: at(now, 7_000), actorId: 'actor-field', actorRole: 'field_inspector', type: 'evidence.submitted', entityType: 'evidence_package', entityId: 'evidence-package:pilot-access', payload: { source: 'field' } },
    { at: at(now, 6_900), actorId: 'actor-supervisor', actorRole: 'supervisor', type: 'hazard.verified', entityType: 'hazard', entityId: 'hazard:pilot-access', payload: { category: 'combustible_accumulation' } },
    { at: at(now, 6_820), actorId: 'actor-supervisor', actorRole: 'supervisor', type: 'remediation.created', entityType: 'remediation', entityId: 'remediation:pilot-closed', payload: { ownerId: 'actor-field' } },
    { at: at(now, 3_050), actorId: 'actor-field', actorRole: 'field_inspector', type: 'remediation.completion_evidence', entityType: 'remediation', entityId: 'remediation:pilot-closed', payload: { packageId: 'evidence-package:pilot-completion' } },
    { at: at(now, 2_160), actorId: 'actor-analyst', actorRole: 'analyst', type: 'remediation.reobserved', entityType: 'remediation', entityId: 'remediation:pilot-closed', payload: { outcome: 'verified_removed' } },
    { at: at(now, 2_100), actorId: 'actor-supervisor', actorRole: 'supervisor', type: 'remediation.closed', entityType: 'remediation', entityId: 'remediation:pilot-closed', payload: {} },
    { at: at(now, 1_440), actorId: 'actor-supervisor', actorRole: 'supervisor', type: 'evidence.requested', entityType: 'inspection', entityId: 'inspection:1816', payload: { ownerId: 'actor-field' } },
    { at: at(now, 1_020), actorId: 'actor-field', actorRole: 'field_inspector', type: 'evidence.submitted', entityType: 'evidence_package', entityId: 'evidence-package:pilot-accepted', payload: { source: 'field-pwa' } },
    { at: at(now, 920), actorId: 'actor-supervisor', actorRole: 'supervisor', type: 'hazard.verified', entityType: 'hazard', entityId: 'hazard:pilot-vegetation-corridor', payload: { category: 'vegetation_continuity' } },
    { at: at(now, 820), actorId: 'actor-supervisor', actorRole: 'supervisor', type: 'remediation.created', entityType: 'remediation', entityId: 'remediation:pilot-open', payload: { ownerId: 'actor-field' } }
  ];
  let previousHash = 'GENESIS';
  const chained = events.map((item, index) => {
    const base = { id: `audit:fixture:${String(index + 1).padStart(3, '0')}`, ...item, previousHash };
    const event = { ...base, hash: hash(JSON.stringify(base)) };
    previousHash = event.hash;
    return event;
  });
  return chained.reverse();
}
