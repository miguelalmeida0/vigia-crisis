import { associationRejectForm, completionForm, eventMergeForm, eventSplitForm, evidenceCaptureForm, evidenceRequestForm, evidenceReviewForm, incidentReviewForm, preventionReviewForm, preventionReviewImportForm, remediationForm, reobserveForm, verifyHazardForm } from './forms.js';
import { coordinateFor, lines, localToIso, selectedRequest } from './controller-utils.js';
import { prepareEvidenceImage } from '../utils/media.js';

export function createModalWorkflows({ api, store, modal, toasts, reload }) {
  const state = () => store.get();
  const done = async (message) => { await reload({ quiet: true }); toasts.show(message); };
  const provenance = () => ({ device: navigator.userAgent, clientVersion: '10.0.0', offlineCaptured: !navigator.onLine, source: 'operational-fire-console', locationSource: 'assignment_coordinate' });
  return {
    async authenticate() { const session=await api.resumeLocalSession();if(!session?.authenticated)throw new Error('Local Shadow Operator session is unavailable.');await reload();toasts.show(`Session restored for ${session.actor.name}.`); },
    requestEvidence(target, source) {
      const actors = state().bootstrap.control.actors; const isEvent = target.queueKind === 'event' || target.observations || target.evidenceState; const targetType = isEvent ? 'fire_event' : target.truthStage ? 'incident' : 'inspection'; const targetId = isEvent ? `event:${target.id}` : target.truthStage ? `incident:${target.id}` : target.id;
      modal.open(evidenceRequestForm({ item: target, actors, targetType }), { source, submit: async (data) => {
        await api.createEvidence({ ...data, targetId, targetType, dueAt: localToIso(data.dueAt), requirements: lines(data.requirements), coordinate: coordinateFor(target) });
        await done('Evidence request assigned.');
      } });
    },
    async captureEvidence(request, source) {
      let current = request;
      if (current.state === 'requested') current = await api.transitionEvidence(current.id, { state: 'acknowledged', note: 'Accepted from operator workspace.' });
      if (current.state === 'acknowledged') current = await api.transitionEvidence(current.id, { state: 'in_progress', note: 'Evidence capture started.' });
      modal.open(evidenceCaptureForm(current), { source, submit: async (data) => {
        const photo = await prepareEvidenceImage(data.photo);
        await api.submitEvidence(current.id, { capturedAt: localToIso(data.capturedAt), accuracyMeters: Number(data.accuracyMeters), note: data.note, observations: lines(data.observations), coordinate: current.coordinate, attachments: [photo], provenance: provenance() });
        await done('Evidence package submitted.');
      } });
    },
    reviewEvidence(request, source) {
      modal.open(evidenceReviewForm(request), { source, submit: async (data) => { await api.reviewEvidence(request.id, data); await done(`Evidence ${data.decision}.`); } });
    },
    verifyHazard(candidate, source) {
      const request = selectedRequest(state(), candidate.id); if (!request) return toasts.show('Accepted evidence is required before hazard verification.');
      modal.open(verifyHazardForm({ candidate, request }), { source, submit: async (data) => {
        await api.verifyHazard({ ...data, candidateId: candidate.id, evidenceRequestId: request.id, place: candidate.municipality, coordinate: candidate.coordinate, priorityScore: candidate.priority, priorityBand: candidate.band });
        await done('Physical hazard verified from accepted evidence.');
      } });
    },
    createRemediation(hazard, source) {
      modal.open(remediationForm({ hazard, actors: state().bootstrap.control.actors }), { source, submit: async (data) => {
        await api.createRemediation({ ...data, hazardId: hazard.id, dueAt: localToIso(data.dueAt), assetsRemovedFromExposure: 0 }); await done('Remediation created and assigned.');
      } });
    },
    submitCompletion(remediation, source) {
      modal.open(completionForm(remediation), { source, submit: async (data) => {
        const photo = await prepareEvidenceImage(data.photo);
        await api.submitCompletion(remediation.id, { capturedAt: localToIso(data.capturedAt), accuracyMeters: Number(data.accuracyMeters), note: data.note, observations: lines(data.observations), coordinate: remediation.coordinate, attachments: [photo], provenance: provenance() });
        await done('Completion evidence submitted.');
      } });
    },
    reobserve(remediation, source) {
      modal.open(reobserveForm(remediation), { source, submit: async (data) => {
        const photo = await prepareEvidenceImage(data.photo);
        await api.reobserve(remediation.id, { outcome: data.outcome, source: data.source, note: data.note, observedAt: new Date().toISOString(), attachments: [photo] });
        await done(data.outcome === 'verified_removed' ? 'Risk-reduction loop verified and closed.' : 'Re-observation recorded.');
      } });
    },
    reviewIncident(incident, source) {
      modal.open(incidentReviewForm(incident), { source, submit: async (data) => { await api.reviewIncident(incident.id, data); await done(`Incident review recorded: ${data.decision}.`); } });
    },
    reviewPreventionFinding(finding, source) {
      modal.open(preventionReviewForm({ finding, actor:state().bootstrap?.actor }), { source, submit: async (data) => {
        await api.reviewPreventionFinding(finding.findingId, data);
        await done(data.reviewerType === 'DEVELOPER_REVIEW' ? 'Developer candidate review recorded. Expert validation remains separate.' : `${data.reviewerType.replaceAll('_',' ').toLowerCase()} recorded with attributable evidence.`);
      } });
    },
    importPreventionReviews(source){
      modal.open(preventionReviewImportForm(),{source,submit:async(data)=>{let payload;try{payload=JSON.parse(data.payload);}catch{throw new Error('Completed review JSON is invalid.');}const result=await api.importPreventionReviews(payload);await done(`${result.imported} qualified expert review${result.imported===1?'':'s'} imported with evidence closure.`);}});
    },
    mergeEvent(event, source) {
      const events=state().live?.events??[]; modal.open(eventMergeForm({event,events}), { source, submit: async(data)=>{ await api.mergeEvents({sourceEventId:event.id,targetEventId:data.targetEventId,reason:data.reason}); store.set((current)=>({...current,selected:{kind:'event',id:data.targetEventId}})); await done(`Event identity merged into ${data.targetEventId}.`); } });
    },
    splitEvent(event, source) {
      modal.open(eventSplitForm(event), { source, submit: async(data)=>{ await api.splitEvent({sourceEventId:event.id,observationIds:[data.observationId],reason:data.reason}); await done('Observation split into a separate persistent fire event.'); } });
    },
    rejectAssociation(event, source) {
      modal.open(associationRejectForm(event), { source, submit: async(data)=>{ await api.rejectAssociation({sourceEventId:event.id,observationId:data.observationId,reason:data.reason}); await done('Association rejected. Evidence preserved under a separate event identity.'); } });
    }
  };
}
