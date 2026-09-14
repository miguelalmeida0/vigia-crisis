import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { PRODUCT_KINDS, PRODUCT_MATURITY } from './constants.mjs';

function clock(value, name, required = false) {
  if (!value && !required) return null;
  return isoTime(value, `data_product_${name}_invalid`);
}

export function createKnowledgeClocks(value = {}) {
  const clocks = {
    physicalOccurredAt: clock(value.physicalOccurredAt, 'physicalOccurredAt'),
    observedAt: clock(value.observedAt, 'observedAt'),
    providerPublishedAt: clock(value.providerPublishedAt, 'providerPublishedAt'),
    providerModifiedAt: clock(value.providerModifiedAt, 'providerModifiedAt'),
    providerRetrievedAt: clock(value.providerRetrievedAt, 'providerRetrievedAt'),
    availableToVigiaAt: clock(value.availableToVigiaAt, 'availableToVigiaAt', true),
    canonicalIngestedAt: clock(value.canonicalIngestedAt, 'canonicalIngestedAt'),
    materializedAt: clock(value.materializedAt, 'materializedAt'),
    labelPublishedAt: clock(value.labelPublishedAt, 'labelPublishedAt'),
    supersededAt: clock(value.supersededAt, 'supersededAt'),
  };
  const known = Object.values(clocks).filter(Boolean);
  if (clocks.providerRetrievedAt && Date.parse(clocks.availableToVigiaAt) < Date.parse(clocks.providerRetrievedAt)) throw new Error('data_product_available_before_retrieval');
  if (!known.length) throw new Error('data_product_knowledge_clocks_required');
  return immutable(clocks);
}

export function createDataProduct(input = {}) {
  const core = {
    schemaVersion: 'vigia.data-product.v1',
    id: requiredText(input.id, 'data_product_id_required'),
    name: requiredText(input.name, 'data_product_name_required'),
    kind: PRODUCT_KINDS.includes(input.kind) ? input.kind : 'CANONICAL_DATASET',
    ontologyObjectType: requiredText(input.ontologyObjectType, 'data_product_object_type_required'),
    description: String(input.description ?? ''),
    owner: requiredText(input.owner ?? 'vigia-data-foundry', 'data_product_owner_required'),
    currentVersionId: input.currentVersionId ?? null,
    createdAt: isoTime(input.createdAt ?? new Date().toISOString()),
  };
  return immutable({ ...core, fingerprint: semanticHash('data-product', core) });
}

export function createDataProductVersion(input = {}) {
  const maturity = PRODUCT_MATURITY.includes(input.maturity) ? input.maturity : 'PROVISIONAL';
  const core = {
    schemaVersion: 'vigia.data-product-version.v1',
    id: requiredText(input.id, 'data_product_version_id_required'),
    productId: requiredText(input.productId, 'data_product_version_product_required'),
    semanticVersion: requiredText(input.semanticVersion, 'data_product_semver_required'),
    dataSchemaVersion: requiredText(input.dataSchemaVersion, 'data_product_schema_required'),
    contentFingerprint: requiredText(input.contentFingerprint, 'data_product_content_hash_required'),
    provider: requiredText(input.provider, 'data_product_provider_required'),
    sourceProduct: requiredText(input.sourceProduct, 'data_product_source_required'),
    ontologyBindings: uniqueSorted(input.ontologyBindings),
    coverage: structuredClone(input.coverage ?? {}),
    timeRange: structuredClone(input.timeRange ?? {}),
    maturity,
    rights: structuredClone(input.rights ?? { licenceIds: [], rawRedistribution: false, derivedRedistribution: false }),
    qualityState: input.qualityState ?? 'PENDING',
    lineageRoot: requiredText(input.lineageRoot, 'data_product_lineage_root_required'),
    clocks: createKnowledgeClocks(input.clocks),
    parserVersion: requiredText(input.parserVersion, 'data_product_parser_version_required'),
    contractVersion: requiredText(input.contractVersion, 'data_product_contract_version_required'),
    createdAt: isoTime(input.createdAt ?? input.clocks?.materializedAt ?? new Date().toISOString()),
    supersedes: input.supersedes ?? null,
    supersededBy: input.supersededBy ?? null,
  };
  return immutable({ ...core, registryFingerprint: semanticHash('data-product-version', core) });
}

export function knownAt(version, cutoff) {
  return Date.parse(version.clocks.availableToVigiaAt) <= Date.parse(isoTime(cutoff));
}
