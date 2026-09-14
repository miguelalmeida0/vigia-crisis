import { createHash } from 'node:crypto';
import { readJsonBody } from '../../http/body.mjs';
import { json } from '../../http/responses.mjs';

const mutationReceipt=(operation,result)=>{const period=result?.period??result,last=period?.history?.at?.(-1)??null,core={operation,periodId:period?.periodId??null,fingerprint:period?.fingerprint??result?.afterActionPackage?.fingerprint??null,at:last?.at??period?.updatedAt??period?.createdAt??new Date().toISOString(),actorId:last?.actorId??period?.createdBy??null,persistedReference:last?{collection:'operationalPeriods.history',state:last.state,at:last.at}:result?.afterActionPackage?{collection:'operationalPeriodAfterActionPackages',packageId:result.afterActionPackage.packageId}:null};return{schemaVersion:'vigia.operational-period-mutation-receipt.v1',receiptId:`period-receipt:${createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0,24)}`,...core};};
const withReceipt=(operation,result)=>result?.period?{...result,receipt:mutationReceipt(operation,result)}:{...result,receipt:mutationReceipt(operation,result)};

export function registerOperationalPeriodRoutes(router, { operationalPeriodService, canonicalOperatorApiService }) {
  const base = '/api/v10/operator/operational-periods';
  const mutate = async (operation) => { const result = await operation(); canonicalOperatorApiService?.invalidate?.(); return result; };
  router.get(base, async ({ res, context }) => json(res, 200, operationalPeriodService.snapshot(context.actor)));
  router.post(base, async ({ req, res, context }) => { const input=await readJsonBody(req),result=await mutate(()=>operationalPeriodService.start(context.actor,input)); return json(res, 201, withReceipt('START_PERIOD',result)); });
  router.post(`${base}/:periodId/records`, async ({ req, res, params, context }) => { const input=await readJsonBody(req),result=await mutate(()=>operationalPeriodService.record(context.actor,params.periodId,input)); return json(res, 200, withReceipt(`RECORD_${String(input.kind??'UNKNOWN')}`,result)); });
  router.post(`${base}/:periodId/handoff`, async ({ req, res, params, context }) => { const input=await readJsonBody(req),result=await mutate(()=>operationalPeriodService.handoff(context.actor,params.periodId,input)); return json(res, 200, withReceipt('HANDOFF',result)); });
  router.post(`${base}/:periodId/abort-controlled-exercise`, async ({ req, res, params, context }) => { const input=await readJsonBody(req),result=await mutate(()=>operationalPeriodService.abortControlledExercise(context.actor,params.periodId,input)); return json(res, 200, withReceipt('ABORT_CONTROLLED_EXERCISE',result)); });
  router.post(`${base}/:periodId/close`, async ({ req, res, params, context }) => { const input=await readJsonBody(req),result=await mutate(()=>operationalPeriodService.close(context.actor,params.periodId,input)); return json(res, 200, withReceipt('CLOSE_PERIOD',result)); });
  router.get(`${base}/:periodId/audit-bundle`, async ({ res, params, context }) => json(res, 200, operationalPeriodService.exportAuditBundle(context.actor, params.periodId)));
}
