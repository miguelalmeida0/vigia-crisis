import { instant, rows, state, strategicId, text, truthSource, visibleAt } from './strategic-helpers.mjs';

const PUBLIC_TYPES = new Set(['SMOKE', 'BLOCKED_ROAD', 'POWER_OUTAGE', 'REQUEST_FOR_HELP', 'COMMUNITY_STATUS']);

function coordinateDistanceMeters(left, right) {
  const radians = (value) => value * Math.PI / 180;
  const latitudeDelta = radians(right[1] - left[1]), longitudeDelta = radians(right[0] - left[0]);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(left[1])) * Math.cos(radians(right[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function projectPublicSafetyMesh(reports, asOf) {
  const supplied = rows(reports), visible = supplied.filter((report) => visibleAt(report, asOf, report.observedAt ?? report.timestamp));
  const seen = new Set(), priorReports = [];
  const observations = visible.map((report, index) => {
    const reportId = text(report.id ?? report.reportId) ?? strategicId('public-report', { index, report });
    const coordinate = rows(report.coordinate ?? report.location?.coordinate), observedAt = instant(report.observedAt ?? report.timestamp);
    const reportType = state(report.type ?? report.reportType);
    const coordinateValid = coordinate.length === 2 && coordinate.every(Number.isFinite) && coordinate[0] >= -180 && coordinate[0] <= 180 && coordinate[1] >= -90 && coordinate[1] <= 90;
    const source = truthSource(report), allowedType = PUBLIC_TYPES.has(reportType), metadataValid = Boolean(coordinateValid && observedAt && allowedType && source);
    const content = text(report.note ?? report.description ?? report.summary), exactDuplicate = seen.has(reportId);
    const geospatialDuplicate = metadataValid && priorReports.some((prior) => prior.reportType === reportType
      && Math.abs(Date.parse(prior.observedAt) - Date.parse(observedAt)) <= 15 * 60_000
      && coordinateDistanceMeters(prior.coordinate, coordinate) <= 250
      && (!content || !prior.content || content.toLocaleLowerCase('en-US') === prior.content.toLocaleLowerCase('en-US')));
    const duplicate = exactDuplicate || geospatialDuplicate;
    seen.add(reportId); if (metadataValid) priorReports.push({ reportType, coordinate, observedAt, content });
    const rawMediaIntegrity = report.media ? state(report.mediaIntegrity?.state ?? 'NOT_EVALUATED') : 'NO_MEDIA';
    const mediaIntegrity = report.media && ['VERIFIED', 'PASSED'].includes(rawMediaIntegrity) ? 'VERIFIED' : rawMediaIntegrity;
    const crossSourceMatches = rows(report.crossSourceMatches).flatMap((match) => {
      const reference = text(match?.reference ?? match?.id ?? match), matchSource = truthSource(match);
      return reference ? [{ reference, source: matchSource }] : [];
    });
    const ageHours = observedAt ? Number(((Date.parse(asOf) - Date.parse(observedAt)) / 3_600_000).toFixed(2)) : null;
    const reviewReasons = [
      ...(!coordinateValid ? ['COORDINATE_INVALID_OR_OUT_OF_BOUNDS'] : []), ...(!observedAt ? ['OBSERVATION_TIME_INVALID'] : []),
      ...(!allowedType ? ['REPORT_TYPE_NOT_SUPPORTED'] : []), ...(!source ? ['SUBMISSION_PROVENANCE_MISSING'] : []),
      ...(duplicate ? ['POTENTIAL_DUPLICATE'] : []), ...(report.media && mediaIntegrity !== 'VERIFIED' ? ['MEDIA_INTEGRITY_NOT_VERIFIED'] : []),
      ...(ageHours !== null && ageHours > 24 ? ['OLDER_THAN_24_HOUR_REVIEW_WINDOW'] : []),
      ...(crossSourceMatches.length ? [] : ['NO_ATTRIBUTABLE_CROSS_SOURCE_MATCH']),
    ];
    const admissionState = !metadataValid ? 'REJECTED_INVALID_METADATA' : duplicate ? 'DUPLICATE_REVIEW' : 'HUMAN_OR_CROSS_SOURCE_REVIEW_REQUIRED';
    return {
      reportId, reportType, coordinate: metadataValid ? [...coordinate] : null, observedAt, reporterClass: 'PUBLIC',
      metadataState: metadataValid ? 'VALID' : 'INVALID', temporalState: ageHours === null ? 'INVALID' : ageHours > 24 ? 'STALE_REVIEW_REQUIRED' : 'WITHIN_24_HOUR_REVIEW_WINDOW', ageHours,
      duplicateState: exactDuplicate ? 'DUPLICATE_IDENTIFIER' : geospatialDuplicate ? 'POTENTIAL_CONTENT_GEOSPATIAL_DUPLICATE' : 'NO_DUPLICATE_IN_PROJECTION',
      mediaIntegrity, crossSourceState: crossSourceMatches.length ? 'ATTRIBUTABLE_MATCHES_AVAILABLE_FOR_REVIEW' : 'NO_ATTRIBUTABLE_MATCH', crossSourceMatches, reviewReasons,
      trustClass: 'PUBLIC_UNVERIFIED', admissionState, createsVerifiedIncident: false, grantsAuthority: false, source,
    };
  });
  return {
    schemaVersion: 'vigia.public-safety-mesh.v1', generatedAt: asOf,
    state: observations.length ? 'REPORTS_REQUIRE_ADMISSION' : 'NO_REPORTS', observations,
    counts: { supplied: supplied.length, excludedFuture: supplied.length - visible.length, rejected: observations.filter((item) => item.admissionState === 'REJECTED_INVALID_METADATA').length, duplicateReview: observations.filter((item) => item.admissionState === 'DUPLICATE_REVIEW').length, admissionReview: observations.filter((item) => item.admissionState === 'HUMAN_OR_CROSS_SOURCE_REVIEW_REQUIRED').length, autoVerified: 0 },
    admissionPolicy: { coordinateBoundsChecked: true, futureReportsExcluded: true, recencyReviewHours: 24, duplicateDistanceMeters: 250, duplicateTimeWindowMinutes: 15, publicReportAutoVerification: false },
    truthBoundary: 'A public report remains an unverified observation candidate. Metadata, duplicate, and media checks cannot create verification, official confirmation, authority, or dispatch.',
  };
}
