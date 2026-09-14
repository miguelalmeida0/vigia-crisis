import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { AcquisitionStore } from '../acquisition/acquisition-store.mjs';
import { ProviderStateStore } from '../reality-network/provider-state-store.mjs';
import { RawDataVault } from '../reality-network/raw-data-vault.mjs';
import { corpusPaths } from './corpus-paths.mjs';
import { CorpusRunStore } from './run-store.mjs';
import { CorpusAcquisitionRuntime } from './runtime.mjs';

export async function createForecastCorpusRuntime({ projectRoot = process.cwd(), fetchImpl = globalThis.fetch, clock = () => new Date(), config = {} } = {}) {
  const paths = corpusPaths(projectRoot); await Promise.all([paths.runtime, paths.validation, paths.plans, paths.runs, paths.bronze, paths.silver, paths.gold, paths.reports, paths.cards, paths.benchmarks].map((directory) => mkdir(directory, { recursive: true })));
  const stateStore = new ProviderStateStore({ filePath: paths.providerState }), acquisitionStore = new AcquisitionStore({ filePath: paths.acquisitionState, archiveDir: paths.bronze, clock, maxArchiveBytes: 2 * 1024 * 1024 * 1024, maxProviderArchiveBytes: 1024 * 1024 * 1024, maxProductBytes: 64 * 1024 * 1024, maxProducts: 20_000 }), rawVault = new RawDataVault({ acquisitionStore, stateStore }), runStore = new CorpusRunStore({ directory: paths.runs, clock });
  await rawVault.initialize();
  return new CorpusAcquisitionRuntime({ paths, rawVault, acquisitionStore, runStore, fetchImpl, clock, config });
}
