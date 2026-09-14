import { traverseLineage, verifyLineageGraph } from '../../../../../packages/domain/src/data-foundry/index.mjs';
import { readJson } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { dataFoundryPaths } from './foundry-paths.mjs';

export class DataFoundryQueryService {
  constructor({ projectRoot = process.cwd() } = {}) { this.paths = dataFoundryPaths(projectRoot); this.corpus = corpusPaths(projectRoot); }
  async registry() { return readJson(this.paths.registry, { products: [], versions: [], incidentProducts: {}, packages: [] }); }
  async graph() { return readJson(this.paths.lineage, { nodes: [], edges: [] }); }
  async getDataProduct(id) { const registry = await this.registry(), product = registry.products.find((item) => item.id === id); return product ? structuredClone(product) : null; }
  async listDataProductVersions(productId) { const registry = await this.registry(); return structuredClone(registry.versions.filter((item) => item.productId === productId)); }
  async getProductLineage(versionId) { return traverseLineage(await this.graph(), versionId); }
  async getIncidentDataProducts(incidentId) { const registry = await this.registry(), binding = registry.incidentProducts[incidentId]; if (!binding) return null; const ids = new Set(binding.dataProductVersionIds); return { incidentId, region: binding.region, season: binding.season, versions: registry.versions.filter((item) => ids.has(item.id)), forecastInputPackages: registry.packages.filter((item) => item.incidentId === incidentId) }; }
  async getMissingIncidentInputs(incidentId, horizonHours) { const value = await readJson(this.paths.gaps, { gaps: [] }); return structuredClone(value.gaps.filter((item) => item.incidentId === incidentId && (horizonHours == null || item.horizonHours === Number(horizonHours)))); }
  async getAcquisitionPlan(incidentId) { const value = await readJson(this.paths.plans, { actions: [] }); return structuredClone({ ...value, actions: value.actions.filter((item) => !incidentId || item.incidentId === incidentId) }); }
  async getIncidentDataReadiness(incidentId) { const products = await this.getIncidentDataProducts(incidentId), gaps = await this.getMissingIncidentInputs(incidentId); return products ? { incidentId, availableProductVersions: products.versions.length, forecastInputPackages: products.forecastInputPackages.length, openGaps: gaps.length, ready: gaps.length === 0 } : null; }
  async getCorpusReadiness() { const report = await readJson(this.paths.registry, null); return report?.consumerState?.corpusReadiness ?? null; }
  async getCorpusExample(id) { const gold = await readJson(`${this.corpus.gold}/forecast-corpus.json`, { examples: [] }), example = gold.examples.find((item) => item.id === id); return example ? structuredClone(example) : null; }
  async getSplitManifest() { const registry = await this.registry(); return structuredClone(registry.consumerState?.splitManifest ?? null); }
  async verifyProductReplay() { const graph = await this.graph(); return verifyLineageGraph(graph); }
  async objectSet(name) { const registry = await this.registry(), gaps = await readJson(this.paths.gaps, { gaps: [] }), graph = await this.graph(); const sets = { incidentsMissingDecodedWeather: [...new Set(gaps.gaps.filter((item) => item.requirement === 'DECODED_WEATHER').map((item) => item.incidentId))].sort(), productsWithRightsBlockers: registry.versions.filter((item) => item.rights?.derivedRedistribution === false).map((item) => item.id), lineageInvalidProducts: graph.verification?.passed ? [] : graph.verification?.failures ?? [], incidentsWithThreeRevisions: Object.values(registry.incidentProducts).filter((item) => registry.versions.some((version) => version.productId === `incident:${item.incidentId}:perimeter-sequence` && version.qualityState === 'PASSED')).map((item) => item.incidentId).sort() }; return structuredClone(sets[name] ?? []); }
}
