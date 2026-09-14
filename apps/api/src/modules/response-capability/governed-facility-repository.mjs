import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { RESPONSE_FACILITY_KINDS } from '../../../../../packages/domain/src/response-capability/index.mjs';
import { retrieveFacilityCandidates } from './facility-retrieval.mjs';

const DEFAULT_ARCHIVE_PATH = 'data/reference/operational-proof/raw/osm-community-medical-fire-protected.json';
const DEFAULT_CONTEXT_PATH = 'data/reference/operational-proof/governed-incident-context.json';

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const number = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const split = (value) => text(value)?.split(/[;,]/).map((item) => item.trim()).filter(Boolean) ?? [];
const coordinateOf = (element) => {
  const lon = Number(element.lon ?? element.center?.lon);
  const lat = Number(element.lat ?? element.center?.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
};
const fact = (value, sourceTag) => {
  const normalized = text(value)?.toLowerCase();
  if (['yes', 'true', '1', 'designated'].includes(normalized)) return { state: 'KNOWN', value: true, sourceTag };
  if (['no', 'false', '0'].includes(normalized)) return { state: 'KNOWN', value: false, sourceTag };
  return { state: 'UNKNOWN', value: null, sourceTag: null };
};
const evidenceKeyword = (tags, pattern, sourceTags) => {
  const matched = sourceTags.find((key) => pattern.test(String(tags[key] ?? '')));
  return matched ? { state: 'KNOWN', value: true, sourceTag: matched } : { state: 'UNKNOWN', value: null, sourceTag: null };
};

function facilityKind(tags = {}) {
  if (tags.amenity === 'hospital') return 'HOSPITAL';
  if (tags.amenity === 'fire_station') return 'FIRE_STATION';
  if (tags.emergency === 'ambulance_station' || tags.amenity === 'ambulance_station') return 'EMS_BASE';
  if (tags.amenity === 'police') return 'POLICE';
  if (tags.amenity === 'shelter' || tags.emergency === 'shelter' || (tags.amenity === 'social_facility' && tags.social_facility === 'shelter')) return 'SHELTER';
  if (['fire_hydrant', 'water_tank'].includes(tags.emergency)) return 'WATER_POINT';
  if (tags.office === 'government' && /civil.?protection|prote[cç][aã]o civil|emergency/i.test(`${tags.government ?? ''} ${tags.name ?? ''}`)) return 'CIVIL_PROTECTION';
  if (['heliport', 'helipad'].includes(tags.aeroway) && /fire|wildfire|civil.?protection|prote[cç][aã]o civil|emergency|emerg[eê]ncia|rescue|socorro|military|meios?\s+a[eé]reos?|defesa\s+florestal|defensa\s+forestal/i.test(`${tags.operator ?? ''} ${tags.name ?? ''} ${tags.description ?? ''}`)) return 'AIR_SUPPORT_BASE';
  return null;
}

function hospitalCapability(tags) {
  const specialties = split(tags['healthcare:speciality']);
  return {
    emergencyDepartment: fact(tags.emergency, 'emergency'),
    traumaCapability: evidenceKeyword(tags, /trauma/i, ['healthcare:speciality', 'description']),
    icuCapability: evidenceKeyword(tags, /intensive.?care|\bicu\b/i, ['healthcare:speciality', 'description']),
    burnTreatmentCapability: evidenceKeyword(tags, /burn/i, ['healthcare:speciality', 'description']),
    helipad: fact(tags.helipad, 'helipad'),
    ambulanceAccess: fact(tags['ambulance:access'], 'ambulance:access'),
    bedCapacity: number(tags.beds),
    bedCapacitySourceTag: number(tags.beds) === null ? null : 'beds',
    specialties,
    limitation: 'Capabilities are reported only when an explicit mapped tag supports them. Missing tags remain unknown and do not prove absence.'
  };
}

function fireCapability(tags) {
  return {
    jurisdiction: text(tags.operator ?? tags['addr:city']),
    normalServiceArea: text(tags['service_area']),
    vehicleBays: number(tags['vehicle_bays']),
    knownVehicleTypes: split(tags['fire_station:vehicles'] ?? tags.vehicles),
    specialistCapabilities: split(tags['fire_station:capability'] ?? tags.service),
    wildfireCapability: evidenceKeyword(tags, /wildfire|forest.?fire|florestal/i, ['fire_station:type', 'fire_station:capability', 'service', 'description', 'name']),
    waterTankerCapability: evidenceKeyword(tags, /tanker|water.?tender|tanque/i, ['fire_station:vehicles', 'vehicles', 'fire_station:capability', 'description']),
    commandCapability: evidenceKeyword(tags, /command|comando/i, ['fire_station:capability', 'service', 'description']),
    airSupportRelationship: text(tags['air_support']),
    limitation: 'A mapped fire station proves static location context only. Crew, vehicle and readiness availability require an attributable operational report.'
  };
}

export function osmElementToResponseFacility(element, provenance) {
  const tags = element?.tags ?? {};
  const kind = facilityKind(tags);
  const coordinate = coordinateOf(element);
  if (!kind || !coordinate) return null;
  const fallback = kind.replaceAll('_', ' ').toLowerCase();
  return {
    id: `osm:${element.type}:${element.id}`,
    kind,
    name: text(tags.name ?? tags.operator) ?? `Mapped ${fallback}`,
    addressPrecision: text(tags['addr:full'] ?? tags['addr:street'] ?? tags['addr:place']) ? 'ADDRESS' : 'LOCALITY',
    locality: text(tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? tags['addr:suburb']),
    municipality: text(tags['addr:municipality']),
    district: text(tags['addr:district']),
    address: text(tags['addr:full']) ?? ([
      [text(tags['addr:street'] ?? tags['addr:place']), text(tags['addr:housenumber'])].filter(Boolean).join(' '),
      [text(tags['addr:postcode']), text(tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'])].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ') || null),
    coordinate,
    contact: {
      phone: text(tags['contact:phone'] ?? tags.phone),
      website: text(tags['contact:website'] ?? tags.website)
    },
    staticCapability: kind === 'HOSPITAL' ? hospitalCapability(tags) : kind === 'FIRE_STATION' ? fireCapability(tags) : {
      limitation: 'Only mapped facility identity and location are available; operational capability is unknown.'
    },
    sourceObservedAt: text(tags.check_date ?? tags['source:date']),
    provenance: {
      ...provenance,
      sourceRecordId: `${element.type}/${element.id}`,
      mappedTagBasis: Object.fromEntries(['amenity', 'emergency', 'office', 'government', 'aeroway'].flatMap((key) => tags[key] === undefined ? [] : [[key, tags[key]]]))
    },
    freshness: {
      state: 'STATIC_SNAPSHOT',
      scope: 'FACILITY_LOCATION_AND_MAPPED_ATTRIBUTES',
      sourceObservedAt: text(tags.check_date ?? tags['source:date']),
      retrievedAt: provenance.retrievedAt,
      limitation: 'Snapshot freshness does not establish current operational status or capacity.'
    }
  };
}

export class GovernedResponseFacilityRepository {
  #facilities = [];
  #source = null;
  #initialized = false;

  constructor({ projectRoot = process.cwd(), archivePath = null, contextPath = DEFAULT_CONTEXT_PATH } = {}) {
    this.projectRoot = projectRoot;
    this.explicitArchivePath = archivePath;
    this.archivePath = archivePath ? path.resolve(projectRoot, archivePath) : null;
    this.contextPath = path.resolve(projectRoot, contextPath);
    this.archiveReference = this.archivePath ? path.relative(projectRoot, this.archivePath) : null;
  }

  async initialize() {
    const contextBytes = await readFile(this.contextPath);
    const context = JSON.parse(contextBytes.toString('utf8'));
    const metadata = context?.sources?.openStreetMap;
    const preferredArchive = [...(metadata?.archives ?? [])].filter((entry) => entry.purpose === 'RESPONSE_FACILITIES')
      .sort((left, right) => (Date.parse(right.retrievedAt ?? '') || 0) - (Date.parse(left.retrievedAt ?? '') || 0))[0]
      ?? metadata?.archives?.find((entry) => entry.path === DEFAULT_ARCHIVE_PATH);
    if (!this.archivePath) {
      this.archiveReference = preferredArchive?.path ?? DEFAULT_ARCHIVE_PATH;
      this.archivePath = path.resolve(this.projectRoot, this.archiveReference);
    }
    const archiveBytes = await readFile(this.archivePath);
    const checksum = `sha256:${createHash('sha256').update(archiveBytes).digest('hex')}`;
    const archive = JSON.parse(archiveBytes.toString('utf8'));
    const registered = metadata?.archives?.find((entry) => entry.path === this.archiveReference);
    if (!registered || registered.sha256 !== checksum) throw new Error('response_facility_archive_checksum_mismatch');
    const provenance = {
      provider: metadata.provider,
      licence: metadata.license,
      retrievedAt: registered?.retrievedAt ?? metadata.retrievedAt,
      archivePath: this.archiveReference,
      archiveSha256: checksum,
      query: registered?.query ?? metadata.queries?.responseFacilities ?? metadata.queries?.context ?? null,
      purpose: registered?.purpose ?? 'GENERAL_CONTEXT'
    };
    this.#facilities = (archive.elements ?? []).map((element) => osmElementToResponseFacility(element, provenance)).filter(Boolean);
    this.#source = { ...provenance, coverageBbox: [-9.75, 36.7, -6, 42.3], records: this.#facilities.length };
    this.#initialized = true;
    return this.status();
  }

  status() {
    const facilities = this.canonicalRecords();
    const counts = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, facilities.filter((facility) => facility.kind === kind).length]));
    return { state: this.#initialized ? 'READY' : 'NOT_INITIALIZED', source: this.#source, counts };
  }

  records() { return structuredClone(this.#facilities); }

  canonicalRecords() {
    if(!this.knowledgeService)return this.#facilities;
    const records=new Map(this.#facilities.map(f=>[f.id,this.knowledgeService.decorate(f)]));
    for(const f of this.knowledgeService.facilityRecords())if(!records.has(f.id))records.set(f.id,f);
    return [...records.values()];
  }

  attachKnowledge(service) { this.knowledgeService = service; }

  nearest(origin, { limitPerKind = 6, maximumDistanceKm = 150, mustIncludeIds = [] } = {}) {
    if (!this.#initialized) throw new Error('response_facility_repository_not_initialized');
    const facilities=this.canonicalRecords();
    const { byKind, retrieval, covered } = retrieveFacilityCandidates({
      facilities,
      source: this.#source,
      origin,
      limitPerKind,
      maximumDistanceKm,
      mustIncludeIds
    });
    if(this.knowledgeService)for(const kind of RESPONSE_FACILITY_KINDS)byKind[kind]=byKind[kind].map(f=>this.knowledgeService.decorate(f,{observe:true}));
    const counts=Object.fromEntries(RESPONSE_FACILITY_KINDS.map(kind=>[kind,facilities.filter(f=>f.kind===kind).length]));
    const sourceCoverage = Object.fromEntries(RESPONSE_FACILITY_KINDS.map((kind) => [kind, {
      state: !covered ? 'OUTSIDE_GOVERNED_COVERAGE' : counts[kind] > 0 ? 'GOVERNED_ARCHIVE_AVAILABLE' : this.#source?.purpose === 'RESPONSE_FACILITIES' ? 'GOVERNED_ARCHIVE_QUERY_NO_MATCH' : 'NOT_INCLUDED_IN_GOVERNED_ARCHIVE_QUERY',
      sourceRecordCount: counts[kind],
      returnedCandidateCount: byKind[kind].length,
      retrieval: retrieval[kind],
      source: this.#source,
      canonicalSources: [...new Set(facilities.filter(f=>f.kind===kind&&f.canonicalId).map(f=>f.canonicalIntelligence.provenance.canonicalName?.[0]?.provider).filter(Boolean))],
      limitation: counts[kind] > 0
        ? 'OpenStreetMap completeness varies; mapped presence is static context and mapped absence is not real-world absence.'
        : this.#source?.purpose === 'RESPONSE_FACILITIES'
          ? 'The governed response-facility query returned no retained match for this class. This does not prove real-world absence or zero capacity.'
          : 'This facility class is not present in the governed archive query. No absence or zero-capacity conclusion is permitted.'
    }]));
    return {
      byKind,
      sourceCoverage,
      covered,
      retrieval: {
        schemaVersion: 'vigia.response-facility-retrieval.v1',
        maximumDistanceKm,
        covered,
        byKind: retrieval,
        truthBoundary: 'The denominator is every governed archive record within the distance bound. The routed cohort retains the distance prefilter plus any current attributable-capacity report in bounds; truncation never implies absence.'
      }
    };
  }
}
