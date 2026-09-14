export function completionEvidenceFor(task, actions, incidentId) {
  if (!task || String(task.incidentId) !== String(incidentId)) return null;
  const expected = new Set(task.expectedReportTypes ?? []);
  return (actions ?? [])
    .filter((item) => item.type === 'REPORT'
      && item.linkedTaskId === task.taskId
      && String(item.incidentId) === String(task.incidentId)
      && expected.has(item.reportType)
      && String(item.body?.report?.incidentId) === String(task.incidentId)
      && item.body?.report?.linkedTaskId === task.taskId
      && item.body?.report?.reportType === item.reportType)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}
