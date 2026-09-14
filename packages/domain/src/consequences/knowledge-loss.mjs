// KNOWLEDGE LOSS.
//
// When something VIGIA knew yesterday is not in today's projection, there are
// two entirely different explanations, and conflating them is dangerous:
//
//   the fact was superseded  — a report or restriction removed the option, and
//                              the consequence engine can say which;
//   the support expired      — nobody refuted it; the information backing it
//                              aged out and nothing replaced it.
//
// Only the first is a change in the world. The second is a change in what VIGIA
// can currently stand behind, and it must never be rendered as the option having
// ceased to exist. Absence in a newer projection is not evidence of falsehood.

export const LOSS_KINDS = Object.freeze([
  'SUPERSEDED_BY_OBSERVATION',
  'PREVIOUSLY_KNOWN_NOW_UNVERIFIED'
]);

const optionsOf = (missions) => new Map((missions ?? []).map((mission) => [mission.id, {
  mission,
  fallbackId: mission.fallback?.id ?? null,
  fallbackMinutes: Number.isFinite(mission.fallback?.minutes) ? mission.fallback.minutes : null,
  alternativeCount: Number.isFinite(mission.alternativeCount) ? mission.alternativeCount : null
}]));

/**
 * Compares what each objective could fall back on, between two projections.
 *
 * A loss is attributed to an observation only when a consequence in the current
 * projection actually names that mission. Otherwise it is reported as support
 * that expired, with the previous value retained rather than deleted.
 */
export function knowledgeLoss({previous, current}) {
  const before = optionsOf(previous?.missions);
  const after = optionsOf(current?.missions);
  const consequences = current?.consequences?.consequences ?? [];

  const losses = [];
  for (const [missionId, priorRow] of before) {
    const currentRow = after.get(missionId);
    if (!currentRow) continue;
    const lostFallback = priorRow.fallbackId && !currentRow.fallbackId;
    const fewerOptions = Number.isFinite(priorRow.alternativeCount) && Number.isFinite(currentRow.alternativeCount)
      && currentRow.alternativeCount < priorRow.alternativeCount;
    if (!lostFallback && !fewerOptions) continue;

    const explaining = consequences.find((row) => row.provenance?.missionIds?.includes(missionId)) ?? null;
    const kind = explaining ? 'SUPERSEDED_BY_OBSERVATION' : 'PREVIOUSLY_KNOWN_NOW_UNVERIFIED';
    const mission = currentRow.mission;
    losses.push({
      missionId,
      kind,
      subjectName: mission.subjectName,
      service: mission.service,
      // The previous value is RETAINED, never deleted. This is the whole point.
      previouslyKnown: {
        routeId: priorRow.fallbackId,
        minutes: priorRow.fallbackMinutes,
        knownAt: previous?.at ?? null
      },
      currentlyVerified: currentRow.fallbackId
        ? {routeId: currentRow.fallbackId, minutes: currentRow.fallbackMinutes}
        : null,
      currentState: kind === 'SUPERSEDED_BY_OBSERVATION' ? 'REMOVED_BY_REPORTED_CHANGE' : 'UNKNOWN_PENDING_CHECK',
      explainedByConsequenceId: explaining?.id ?? null,
      text: kind === 'SUPERSEDED_BY_OBSERVATION'
        ? `Another stored route was available at ${previous?.at ?? 'the previous check'}; a reported change removed it.`
        : `Another route was previously stored, but its current status needs checking.`,
      boundary: kind === 'PREVIOUSLY_KNOWN_NOW_UNVERIFIED'
        ? 'Nothing reported this route as unusable. Its supporting information expired and was not replaced, so its current state is unknown rather than unavailable.'
        : 'A reported change removed this option from the current projection.'
    });
  }

  return {
    schemaVersion: 'vigia.knowledge-loss.v1',
    incidentId: current?.incidentId ?? null,
    previousAt: previous?.at ?? null,
    currentAt: current?.at ?? null,
    losses: losses.sort((left, right) => left.missionId.localeCompare(right.missionId)),
    unverifiedCount: losses.filter((row) => row.kind === 'PREVIOUSLY_KNOWN_NOW_UNVERIFIED').length,
    truthBoundary: 'A fact missing from a newer projection has not been shown to be false. Where nothing superseded it, VIGIA reports that it was previously known and now needs checking, and retains the previous value.'
  };
}
