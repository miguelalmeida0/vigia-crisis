import { stableId } from '../../../packages/domain/src/fieldnet/contracts.mjs';

export function createCapacityTaskRoutePolicy({ capacityTaskKeyId, capacityTaskKey, store, nodeId, incidentAllowed }) {
  const capacityTaskRouteAllowed = (method, pathname) => `${String(method).toUpperCase()} ${pathname}` === 'GET /api/fieldnet/capacity-task-readiness'
    || `${String(method).toUpperCase()} ${pathname}` === 'GET /api/fieldnet/state'
    || `${String(method).toUpperCase()} ${pathname}` === 'POST /api/fieldnet/verification-tasks'
    || String(method).toUpperCase() === 'GET' && /^\/api\/fieldnet\/tasks\/field-capacity-task%3A[a-f0-9]{32}(?:\/lifecycle)?$/i.test(pathname);
  const isGovernedCapacityTask = (task) => {
    const kind = String(task?.subject?.facilityKind ?? '');
    const report = kind === 'HOSPITAL' ? 'HOSPITAL_CAPACITY_UPDATE' : kind === 'FIRE_STATION' ? 'FIRE_STATION_CAPACITY_UPDATE' : null;
    const observer = kind === 'HOSPITAL' ? 'MUNICIPAL_OPERATOR' : kind === 'FIRE_STATION' ? 'AUTHORIZED_RESPONDER' : null;
    return Boolean(
      /^field-capacity-task:[a-f0-9]{32}$/.test(String(task?.taskId ?? ''))
      && task.taskId === stableId('field-capacity-task', task.incidentId, task.linkedInformationRequirementId, task.subject?.facilityId, nodeId)
      && incidentAllowed(task?.incidentId)
      && task?.subject?.type === 'RESPONSE_FACILITY'
      && typeof task?.subject?.facilityId === 'string' && task.subject.facilityId.length > 0
      && report
      && Array.isArray(task.expectedReportTypes) && task.expectedReportTypes.length === 1 && task.expectedReportTypes[0] === report
      && Array.isArray(task.targetObserverClasses) && task.targetObserverClasses.length === 1 && task.targetObserverClasses[0] === observer
      && task?.safeZoneConstraint?.mode === 'REMOTE_ONLY'
      && (task.location === null || task.location === undefined)
      && /^(?:information-requirement:)?sha256:[a-f0-9]{16,64}$/.test(String(task?.linkedInformationRequirementId ?? ''))
      && task?.owner === `fieldnet-capacity-resolver:${nodeId}`
    );
  };
  const assertCapacityTaskBoundary = ({ principal, method, pathname, input }) => {
    if (principal?.keyId !== capacityTaskKeyId) return;
    if (!capacityTaskKey || !capacityTaskRouteAllowed(method, pathname)) throw Object.assign(new Error('fieldnet_capacity_task_route_forbidden'), { statusCode: 403 });
    if (String(method).toUpperCase() !== 'POST') {
      const taskMatch = pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)(?:\/lifecycle)?$/);
      if (taskMatch) {
        const task = store.task(decodeURIComponent(taskMatch[1]));
        if (task && !isGovernedCapacityTask(task)) throw Object.assign(new Error('fieldnet_capacity_task_record_forbidden'), { statusCode: 403 });
      }
      return;
    }
    const task = input?.task ?? input;
    if (!isGovernedCapacityTask(task)) throw Object.assign(new Error('fieldnet_capacity_task_contract_forbidden'), { statusCode: 403 });
  };
  return { assertCapacityTaskBoundary, capacityTaskRouteAllowed };
}

export function uiSessionRouteAllowed(method, pathname) {
  const signature = `${String(method).toUpperCase()} ${pathname}`;
  return ['GET /api/fieldnet/ui-session', 'POST /api/fieldnet/ui-session/revoke', 'POST /api/fieldnet/reports', 'POST /api/fieldnet/sync'].includes(signature)
    || /^GET \/api\/fieldnet\/incidents\/[^/]+\/tasks$/.test(signature)
    || /^GET \/api\/fieldnet\/tasks\/[^/]+\/acknowledgements$/.test(signature)
    || /^POST \/api\/fieldnet\/tasks\/[^/]+\/(verification-acknowledgements|completion)$/.test(signature);
}
