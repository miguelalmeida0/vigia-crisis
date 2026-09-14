import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { completionEvidenceFor } from '../public/fieldnet-lite/task-evidence.js';
import { createFieldNodeUiAssetServer } from '../src/http-helpers.mjs';

const task = {
  taskId: 'task:capacity', incidentId: 'incident:one',
  expectedReportTypes: ['HOSPITAL_CAPACITY_UPDATE']
};

const action = (overrides = {}) => ({
  type: 'REPORT', linkedTaskId: task.taskId, incidentId: task.incidentId,
  reportId: 'report:one', reportType: 'HOSPITAL_CAPACITY_UPDATE',
  createdAt: '2026-09-04T15:00:00.000Z',
  body: { report: { linkedTaskId: task.taskId, incidentId: task.incidentId, reportType: 'HOSPITAL_CAPACITY_UPDATE' } },
  ...overrides
});

test('FieldNet Lite local completion selects only an expected report with exact incident and task scope', () => {
  assert.equal(completionEvidenceFor(task, [action()], task.incidentId)?.reportId, 'report:one');
  assert.equal(completionEvidenceFor(task, [action({ reportType: 'ROAD_ACCESS' })], task.incidentId), null);
  assert.equal(completionEvidenceFor(task, [action({ incidentId: 'incident:other' })], task.incidentId), null);
  assert.equal(completionEvidenceFor(task, [action({ linkedTaskId: 'task:other' })], task.incidentId), null);
  assert.equal(completionEvidenceFor(task, [action()], 'incident:other'), null);
});

test('FieldNet Lite serves the task evidence module imported by its task controller', () => {
  const serveUiAsset = createFieldNodeUiAssetServer({
    uiRoot: fileURLToPath(new URL('../public/fieldnet-lite/', import.meta.url))
  });
  const response = {
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(payload) {
      this.payload = payload;
    }
  };

  assert.equal(serveUiAsset(response, '/fieldnet-lite/task-evidence.js'), true);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^text\/javascript/);
  assert.match(response.payload.toString('utf8'), /export function completionEvidenceFor/);
});
