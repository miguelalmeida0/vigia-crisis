import { readFile } from 'node:fs/promises';

const ARCHIVE_URL = new URL('../../../../../data/source-archive/osm/loule-buildings-2026-08-11.json', import.meta.url);

function covers([lon, lat], [west, south, east, north]) {
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

export async function loadArchivedStructureContext(coordinate) {
  const archive = JSON.parse(await readFile(ARCHIVE_URL, 'utf8'));
  if (!covers(coordinate.map(Number), archive.coverageBbox)) return null;
  return {
    buildingPoints: archive.records.map((record) => record.coordinate),
    buildingCount: null,
    endpoint: archive.endpoint,
    provider: `${archive.source} · archived verified subset`,
    partial: true,
    archived: true,
    acquiredAt: archive.acquiredAt,
    sourceRecordCount: archive.rawSourceRecordCount,
    sourceChecksum: archive.rawSourceSha256,
    archivePath: 'data/source-archive/osm/loule-buildings-2026-08-11.json',
    limitation: archive.selection
  };
}
