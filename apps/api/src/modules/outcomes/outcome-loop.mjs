export function buildOutcomeLoop(state, remediation) {
  const hazard = state.hazards.find((item) => item.id === remediation.hazardId) ?? null;
  const beforeEvidence = hazard ? state.evidencePackages.find((item) => item.id === hazard.evidencePackageId) ?? null : null;
  const completionEvidence = state.evidencePackages.find((item) => item.id === remediation.completionEvidencePackageId) ?? null;
  const reobservation = state.reobservations.find((item) => item.id === remediation.reobservationId) ?? null;
  return {
    remediation,
    hazard,
    beforeEvidence,
    completionEvidence,
    reobservation,
    proof: {
      beforeImage: beforeEvidence?.attachments?.find((item) => item.type === 'image')?.url ?? null,
      completionImage: completionEvidence?.attachments?.find((item) => item.type === 'image')?.url ?? null,
      afterImage: reobservation?.attachments?.find((item) => item.type === 'image')?.url ?? completionEvidence?.attachments?.find((item) => item.type === 'image')?.url ?? null,
      observerId: beforeEvidence?.observerId ?? null,
      reviewerId: reobservation?.reviewerId ?? hazard?.createdBy ?? null
    },
    methodology: {
      exposureChangeState: 'UNMEASURED',
      limitation: 'No versioned pre-action and post-action exposure sets are attached. VIGIA does not calculate asset change from operator input.',
      reviewType: 'supervisor_recorded_reobservation',
      independenceValidated: false
    }
  };
}
