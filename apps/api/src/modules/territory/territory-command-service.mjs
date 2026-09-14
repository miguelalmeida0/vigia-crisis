const SIGNAL_ORDER = Object.freeze({
  THERMAL_FIRE_CANDIDATE: 0,
  FIRE_EVENT: 1,
  DELAYED_PHYSICAL: 2,
  PRE_IGNITION_FINDING: 3,
  REPORT_ONLY_INCIDENT: 4,
  MULTISOURCE_HISTORICAL: 5,
  STALE_PHYSICAL: 6,
  STALE_ARCHIVE: 7
});

function reportCurrent(event) {
  return ['current', 'delayed'].includes(event.reportState?.sourceActivity);
}

function physicalCurrent(event) {
  return event.physicalState?.freshness === 'current';
}

function eventType(event) {
  const physical = physicalCurrent(event);
  const report = reportCurrent(event);
  if (physical && !report) return 'THERMAL_FIRE_CANDIDATE';
  if (physical) return 'FIRE_EVENT';
  if (event.physicalState?.freshness === 'delayed') return 'DELAYED_PHYSICAL';
  if (event.physicalState?.freshness === 'stale' && event.physicalSourceProfile?.twoPhysicalSourceFamilies === true) return 'MULTISOURCE_HISTORICAL';
  if (event.physicalState?.freshness === 'stale') return 'STALE_PHYSICAL';
  if (report) return 'REPORT_ONLY_INCIDENT';
  return 'STALE_ARCHIVE';
}

function findingSignal(item) {
  return {
    id: `territory-signal:${item.findingId}`,
    type: 'PRE_IGNITION_FINDING',
    resourceKind: 'finding',
    resourceId: item.findingId,
    place: item.place,
    coordinate: null,
    locationQualification: 'RESTRICTED_PUBLIC_PROJECTION',
    state: item.calibrationState,
    observedAt: item.firstObservableInterval?.end ?? item.updatedAt,
    actionRequired: item.validation?.state === 'UNMEASURED',
    sourceState: item.sourceQuality?.state ?? 'UNKNOWN',
    priorityBasis: {
      nearestStructureM: item.nearestStructureM,
      structuresWithinPolicyRadius: item.structuresWithinPolicyRadius,
      affectedAreaHa: item.affectedAreaHa
    }
  };
}

function eventSignal(item) {
  const type = eventType(item);
  return {
    id: `territory-signal:${item.id}`,
    type,
    resourceKind: 'event',
    resourceId: item.id,
    place: item.label,
    coordinate: item.coordinate,
    state: item.evidenceState,
    observedAt: item.lastSeenAt ?? item.firstSeenAt,
    actionRequired: item.actionNeed?.needsRouting === true,
    sourceState: item.physicalState?.freshness ?? item.reportState?.sourceActivity ?? 'unknown',
    priorityBasis: {
      physicalCurrent: physicalCurrent(item),
      reportCurrent: reportCurrent(item),
      physicalSourceFamilies: item.physicalSourceProfile?.families ?? [],
      twoPhysicalSourceFamilies: item.physicalSourceProfile?.twoPhysicalSourceFamilies === true,
      rank: item.priority?.rank ?? null
    }
  };
}

function compareSignals(a, b) {
  const type = SIGNAL_ORDER[a.type] - SIGNAL_ORDER[b.type];
  if (type) return type;
  if (a.type === 'PRE_IGNITION_FINDING') {
    const distance = Number(a.priorityBasis.nearestStructureM ?? Infinity) - Number(b.priorityBasis.nearestStructureM ?? Infinity);
    if (distance) return distance;
  }
  return Date.parse(b.observedAt ?? 0) - Date.parse(a.observedAt ?? 0);
}

export class TerritoryCommandService {
  constructor({ preventionService, operationalEventService, clock = () => new Date() }) {
    Object.assign(this, { preventionService, operationalEventService, clock });
  }

  async snapshot() {
    const [prevention, live] = await Promise.all([
      this.preventionService.snapshot({ preferCache:true,publicProjection:true }),
      this.operationalEventService.commandSnapshot?.() ?? this.operationalEventService.snapshot()
    ]);
    const signals = [
      ...(prevention.findings ?? []).map(findingSignal),
      ...(live.events ?? []).map(eventSignal)
    ].sort(compareSignals);
    const count = (type) => signals.filter((item) => item.type === type).length;
    return {
      meta: {
        generatedAt: this.clock().toISOString(),
        region: live.meta?.region ?? 'Portugal mainland',
        universe: 'production',
        notice: 'Pre-ignition findings, physical observations and public reports are separate signal populations. Screening candidates are not verified hazards.'
      },
      summary: {
        preIgnitionFindings: count('PRE_IGNITION_FINDING'),
        thermalFireCandidates: count('THERMAL_FIRE_CANDIDATE'),
        physicalFireEvents: count('FIRE_EVENT'),
        delayedPhysicalEvents: count('DELAYED_PHYSICAL'),
        stalePhysicalEvents: count('STALE_PHYSICAL'),
        multisourceHistoricalEvents: count('MULTISOURCE_HISTORICAL'),
        multisourcePhysicalEvents: live.summary?.currentMultisourceEvents ?? 0,
        twoPhysicalFamilyEvents: live.summary?.twoPhysicalFamilyEvents ?? 0,
        viirsSentinel3Events: live.summary?.viirsSentinel3Events ?? 0,
        reportOnlyIncidents: count('REPORT_ONLY_INCIDENT'),
        staleArchive: count('STALE_ARCHIVE'),
        actionsRequired: signals.filter((item) => item.actionRequired).length
      },
      sensing: {
        firms: live.sources?.firms?.state ?? 'not_configured',
        sentinel3: live.sources?.sentinel3Pixels?.state ?? 'not_configured',
        thermal: live.sources?.thermal?.state ?? live.thermal?.state ?? 'unavailable',
        reports: live.sources?.fires?.state ?? 'unavailable',
        physicalFamilies: {
          viirs: live.sources?.firms?.state ?? 'not_configured',
          sentinel3_slstr: live.sources?.sentinel3Pixels?.state ?? 'not_configured'
        }
      },
      signals
    };
  }
}
