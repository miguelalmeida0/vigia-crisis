import {json} from '../../http/responses.mjs';
import {CollectionIntelligenceService} from './collection-intelligence-service.mjs';
import {PREVIEW_KINDS} from '../../../../../packages/domain/src/intelligence/epistemic-impact.mjs';

// Read-only collection-intelligence surface. Every route sits under the existing
// `/api/v10/operator/incidents/:incidentId/...` namespace, so it inherits the
// operator authentication, capability and incident-scope policy already declared
// for that namespace: no security-policy change is required to add these.

const bounded = (value, max = 180) => typeof value === 'string' && value.length <= max ? value : null;

function assertQuery(url, allowed) {
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key)) throw Object.assign(new Error('collection_query_invalid'), {statusCode: 400});
    if (value.length > 180) throw Object.assign(new Error('collection_query_invalid'), {statusCode: 400});
  }
}

const boundedLimit = (value, fallback, max) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
};

export function registerCollectionIntelligenceRoutes(router, services) {
  const {situationService, situationAsk: ask, worldKnowledgeService} = services;
  if (!situationService || !ask) return router;
  const service = services.collectionIntelligenceService
    ?? new CollectionIntelligenceService({situationService, knowledgeService: worldKnowledgeService, clock: situationService.clock});
  services.collectionIntelligenceService = service;

  const base = '/api/v10/operator/incidents/:incidentId/collection';

  router.get(`${base}/requirements`, async ({res, context, params, url}) => {
    assertQuery(url, ['at', 'limit']);
    const at = bounded(url.searchParams.get('at'));
    ask.authorize(context.actor, params.incidentId, at);
    return json(res, 200, await service.requirements(params.incidentId, {at, limit: boundedLimit(url.searchParams.get('limit'), 60, 200)}));
  });

  router.get(`${base}/tasks`, async ({res, context, params, url}) => {
    assertQuery(url, ['at', 'limit']);
    const at = bounded(url.searchParams.get('at'));
    ask.authorize(context.actor, params.incidentId, at);
    return json(res, 200, await service.tasks(params.incidentId, {at, limit: boundedLimit(url.searchParams.get('limit'), 10, 50)}));
  });

  router.get(`${base}/requirements/:requirementId`, async ({res, context, params, url}) => {
    assertQuery(url, ['at']);
    const at = bounded(url.searchParams.get('at'));
    ask.authorize(context.actor, params.incidentId, at);
    return json(res, 200, await service.requirement(params.incidentId, params.requirementId, {at}));
  });

  router.get(`${base}/requirements/:requirementId/sources`, async ({res, context, params, url}) => {
    assertQuery(url, ['at']);
    const at = bounded(url.searchParams.get('at'));
    ask.authorize(context.actor, params.incidentId, at);
    return json(res, 200, await service.sources(params.incidentId, params.requirementId, {at}));
  });

  // A preview is a read: it is a GET, it writes nothing, and its assumption is
  // discarded with the response.
  router.get(`${base}/preview`, async ({res, context, params, url}) => {
    assertQuery(url, ['at', 'kind', 'entityId', 'capability']);
    const at = bounded(url.searchParams.get('at'));
    ask.authorize(context.actor, params.incidentId, at);
    const kind = url.searchParams.get('kind');
    if (!PREVIEW_KINDS.includes(kind)) throw Object.assign(new Error('knowledge_preview_kind_unsupported'), {statusCode: 400});
    const request = {kind, entityId: url.searchParams.get('entityId') ?? ''};
    if (url.searchParams.has('capability')) request.capability = url.searchParams.get('capability');
    return json(res, 200, await service.preview(params.incidentId, request, {at}));
  });

  router.get(`${base}/knowledge-changes`, async ({res, context, params, url}) => {
    assertQuery(url, ['since']);
    const since = bounded(url.searchParams.get('since'));
    ask.authorize(context.actor, params.incidentId, since ? 'history' : null);
    return json(res, 200, await service.knowledgeChanges(params.incidentId, {since}));
  });

  return router;
}

/**
 * Read-only collection-intelligence tools, shaped like the existing situation
 * tools. They are exported rather than registered into `situation-ask.mjs` so
 * this branch adds no edit to that file; registering them there later is a
 * one-line change documented in the sprint report.
 */
export const COLLECTION_TOOLS = Object.freeze([
  'getInformationRequirements',
  'getNextVerificationTasks',
  'getInformationRequirement',
  'previewKnowledgeImpact',
  'getRequirementSources',
  'getKnowledgeChanges'
]);

export function collectionToolHandlers(service) {
  return Object.freeze({
    getInformationRequirements: (incidentId, args) => service.requirements(incidentId, {at: args.at ?? null}),
    getNextVerificationTasks: (incidentId, args) => service.tasks(incidentId, {at: args.at ?? null}),
    getInformationRequirement: (incidentId, args) => service.requirement(incidentId, args.requirementId, {at: args.at ?? null}),
    previewKnowledgeImpact: (incidentId, args) => service.preview(incidentId, {kind: args.kind, entityId: args.entityId, ...(args.capability ? {capability: args.capability} : {})}, {at: args.at ?? null}),
    getRequirementSources: (incidentId, args) => service.sources(incidentId, args.requirementId, {at: args.at ?? null}),
    getKnowledgeChanges: (incidentId, args) => service.knowledgeChanges(incidentId, {since: args.since ?? null})
  });
}

export function collectionMapIntents(tool, args, result) {
  if (tool === 'previewKnowledgeImpact' && result?.mapIntent) return [result.mapIntent];
  if (tool === 'getInformationRequirement' && result?.requirement?.subject?.kind === 'ROAD') return [{type: 'FOCUS_ROAD', road: result.requirement.subject.id, validated: true}];
  return [];
}
