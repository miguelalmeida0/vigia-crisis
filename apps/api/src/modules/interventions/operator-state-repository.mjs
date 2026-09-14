import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { clone } from '../../shared/values.mjs';
import { assertOperatorStateCapacity } from './operator-state-capacity.mjs';
import { SourceResolutionAttemptArchive } from './source-resolution-attempt-archive.mjs';
import path from 'node:path';
import {sealNewAuditReceipts} from '../audit/audit-chain.mjs';

function emptyState(now) {
  return {
    version: 2,
    organizations: [],
    workspaces: [],
    territories: [],
    actors: [],
    hazards: [],
    preventionFindings: [],
    detectorRuns: [],
    preventionReviews: [],
    candidateReviews: [],
    incidentDecisions: {},
    evidenceRequests: [],
    evidencePackages: [],
    evidenceNeeds: [],
    fieldOperationReceipts: [],
    eventEvidenceIngestReceipts: [],
    interventions: [],
    productionActions: [],
    productionAcknowledgements: [],
    expectedPostconditions: [],
    observedPostconditions: [],
    outcomeClassifications: [],
    shiftHandoffs: [],
    materialEventAcknowledgements: [],
    humanAttentionWorkStates: [],
    humanAttentionActions: [],
    reobservations: [],
    sourceResolutionJobs: [],
    crisisAutopilotReceipts: [],
    crisisAutopilotInformationRequirements: [],
    crisisAutopilotCollectionTasks: [],
    crisisAutopilotRecomputeActions: [],
    crisisAutopilotAuthorityProposals: [],
    responseRecommendationReviews: [],
    responseRecommendationReviewActions: [],
    certifiedActionOutcomeChains: [],
    protectionWorkflows: [],
    operationalRecovery: null,
    watchPlaces: [],
    watchedEventIds: [],
    audit: []
  };
}

function migrate(loaded, { clock }) {
  const now = clock().toISOString();
  const base = emptyState(now);
  const previous = loaded && typeof loaded === 'object' ? loaded : {};
  const merged = {
    ...base,
    ...previous,
    version: 2,
    organizations: previous.organizations?.length ? previous.organizations : base.organizations,
    workspaces: previous.workspaces?.length ? previous.workspaces : base.workspaces,
    territories: previous.territories?.length ? previous.territories : base.territories,
    actors: previous.actors?.length ? previous.actors : base.actors,
    evidenceRequests: previous.evidenceRequests ?? [],
    evidencePackages: previous.evidencePackages ?? [],
    evidenceNeeds: previous.evidenceNeeds ?? [],
    fieldOperationReceipts: previous.fieldOperationReceipts ?? [],
    eventEvidenceIngestReceipts: previous.eventEvidenceIngestReceipts ?? [],
    candidateReviews: previous.candidateReviews ?? [],
    preventionFindings: previous.preventionFindings ?? [],
    detectorRuns: previous.detectorRuns ?? [],
    preventionReviews: previous.preventionReviews ?? [],
    reobservations: previous.reobservations ?? [],
    productionActions: previous.productionActions ?? [],
    productionAcknowledgements: previous.productionAcknowledgements ?? [],
    expectedPostconditions: previous.expectedPostconditions ?? [],
    observedPostconditions: previous.observedPostconditions ?? [],
    outcomeClassifications: previous.outcomeClassifications ?? [],
    shiftHandoffs: previous.shiftHandoffs ?? [],
    materialEventAcknowledgements: previous.materialEventAcknowledgements ?? [],
    humanAttentionWorkStates: previous.humanAttentionWorkStates ?? [],
    humanAttentionActions: previous.humanAttentionActions ?? [],
    sourceResolutionJobs: previous.sourceResolutionJobs ?? [],
    crisisAutopilotReceipts: previous.crisisAutopilotReceipts ?? [],
    crisisAutopilotInformationRequirements: previous.crisisAutopilotInformationRequirements ?? [],
    crisisAutopilotCollectionTasks: previous.crisisAutopilotCollectionTasks ?? [],
    crisisAutopilotRecomputeActions: previous.crisisAutopilotRecomputeActions ?? [],
    crisisAutopilotAuthorityProposals: previous.crisisAutopilotAuthorityProposals ?? [],
    responseRecommendationReviews: previous.responseRecommendationReviews ?? [],
    responseRecommendationReviewActions: previous.responseRecommendationReviewActions ?? [],
    certifiedActionOutcomeChains: previous.certifiedActionOutcomeChains ?? [],
    protectionWorkflows: previous.protectionWorkflows ?? [],
    operationalRecovery: previous.operationalRecovery ?? null,
    watchedEventIds: previous.watchedEventIds ?? []
  };
  return merged;
}

function mirrorNotPersisted(result) {
  return Object.assign(new Error('operator_state_mirror_not_persisted'), {
    statusCode: 503,
    details: { state: result?.state ?? 'invalid' }
  });
}

export class OperatorStateRepository {
  #filePath;
  #clock;
  #state;
  #mutationChain = Promise.resolve();
  #writer;
  #mirrorStore;
  #attemptArchive;
  #persistence = { state: 'initializing', lastPersistedAt: null, lastError: null };

  constructor({ filePath, clock = () => new Date(), writer = writeJsonAtomic, mirrorStore = null,capacityPolicy={},attemptArchive=null,hotAttemptHistoryLimit=3 }) {
    this.#filePath = filePath;
    this.#clock = clock;
    this.#writer = writer;
    this.#mirrorStore = mirrorStore;
    this.#attemptArchive=attemptArchive??new SourceResolutionAttemptArchive({filePath:path.join(path.dirname(filePath),'source-resolution-attempt-history.jsonl'),hotLimit:hotAttemptHistoryLimit});
    this.capacityPolicy=capacityPolicy;
    this.#state = emptyState(clock().toISOString());
  }

  async #commitMirror(state) {
    if (this.#mirrorStore == null) return;
    if (typeof this.#mirrorStore.commitOperationalState !== 'function') throw mirrorNotPersisted();
    const result = await this.#mirrorStore.commitOperationalState(state);
    if (result?.persisted !== true) throw mirrorNotPersisted(result);
  }

  async initialize() {
    try {
      const loaded = await readJson(this.#filePath, null);
      const candidate = await this.#attemptArchive.compact(migrate(loaded, { clock: this.#clock }));
      assertOperatorStateCapacity(candidate,this.capacityPolicy);
      await this.#commitMirror(candidate);
      await this.#writer(this.#filePath, candidate);
      this.#state = candidate;
      this.#persistence = { state: 'ready', lastPersistedAt: this.#clock().toISOString(), lastError: null };
    } catch (error) {
      this.#persistence = { ...this.#persistence, state: 'failed', lastError: String(error.message ?? error) };
      throw error;
    }
  }

  snapshot() { return clone(this.#state); }
  // Clone only requested collections; callers never receive mutable repository references.
  snapshotFields(fields) {
    if (!Array.isArray(fields) || fields.some((field) => typeof field !== 'string' || !Object.hasOwn(this.#state, field))) throw new TypeError('operator_state_snapshot_fields_invalid');
    return clone(Object.fromEntries(fields.map((field) => [field, this.#state[field]])));
  }
  actor(id) { const actor=(this.#state.actors??[]).find((item)=>item.id===id)??null;return actor?clone(actor):null; }
  persistenceStatus() { return clone(this.#persistence); }

  async mutate(mutator,{fields=null,returnSnapshot=true}={}) {
    const operation = this.#mutationChain.then(async () => {
      if(fields&&(!Array.isArray(fields)||!fields.length||fields.some(k=>typeof k!=='string'||!Object.hasOwn(this.#state,k))))throw new TypeError('operator_state_mutation_fields_invalid');
      const proposed = await mutator(fields?this.snapshotFields(fields):clone(this.#state));
      if(fields&&Object.keys(proposed??{}).some(k=>!fields.includes(k)))throw new TypeError('operator_state_mutation_field_not_owned');
      const next=fields?{...this.#state,...proposed}:proposed;
      if (!next || typeof next !== 'object') throw new TypeError('state_mutator_must_return_object');
      next.audit=sealNewAuditReceipts(this.#state.audit??[],next.audit??[]);
      const candidate = fields&&!fields.includes('sourceResolutionJobs')?{...next,version:2}:await this.#attemptArchive.compact({ ...next, version: 2 });
      assertOperatorStateCapacity(candidate,this.capacityPolicy);
      let filePublished=false;
      try {
        await this.#writer(this.#filePath, candidate);filePublished=true;
        await this.#commitMirror(candidate);
        this.#state = candidate;
        this.#persistence = { state: 'ready', lastPersistedAt: this.#clock().toISOString(), lastError: null };
        return returnSnapshot?this.snapshot():{persisted:true,state:'ready'};
      } catch (error) {
        let failure=error;if(filePublished)try{await this.#writer(this.#filePath,this.#state);}catch(rollbackError){failure=Object.assign(new Error('operator_state_file_rollback_failed'),{cause:error,rollbackError});}
        this.#persistence = { ...this.#persistence, state: 'failed', lastError: String(failure.message ?? failure) };
        throw failure;
      }
    });
    this.#mutationChain = operation.catch(() => undefined);
    return operation;
  }
}
