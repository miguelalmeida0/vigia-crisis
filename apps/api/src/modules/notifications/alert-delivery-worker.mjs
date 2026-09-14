export class AlertDeliveryWorker {
  constructor({ store, adapters, clock = () => new Date(), batchSize = 20, baseRetryMs = 1000 } = {}) { Object.assign(this, { store, adapters, clock, batchSize, baseRetryMs }); this.running = false;this.lastRun=null; }
  status(){return{state:this.running?'RUNNING':'IDLE',batchSize:this.batchSize,lastRun:this.lastRun};}
  async drain() {
    if (this.running) return { claimed: 0, delivered: 0, failed: 0, configuredOff: 0, skipped: 'already_running' };
    this.running = true;
    const summary = { claimed: 0, delivered: 0, failed: 0, configuredOff: 0, retrying: 0 };
    try {
      const rows = await this.store.claimDeliveries(this.batchSize); summary.claimed = rows.length;
      for (const row of rows) {
        try {
          const result = await this.adapters.deliver(row);
          await this.store.completeDelivery(row.id, result);
          if (result.state === 'DELIVERED') summary.delivered += 1;
          else if (result.state === 'CONFIGURED_OFF') summary.configuredOff += 1;
          else summary.failed += 1;
        } catch (error) {
          const exhausted = Number(row.attempt_count) >= Number(row.max_attempts);
          const retryMs = this.baseRetryMs * 2 ** Math.max(0, Number(row.attempt_count) - 1);
          await this.store.completeDelivery(row.id, {
            state: exhausted ? 'FAILED' : 'RETRY_WAIT', failureCode: error.code ?? 'DELIVERY_ERROR',
            failureMessage: String(error.message ?? error), retryAt: exhausted ? null : new Date(this.clock().getTime() + retryMs).toISOString()
          });
          if (exhausted) summary.failed += 1; else summary.retrying += 1;
        }
      }
      this.lastRun={...summary,completedAt:this.clock().toISOString(),error:null};return summary;
    } catch(error){this.lastRun={...summary,completedAt:this.clock().toISOString(),error:error?.code??String(error.message??error)};throw error;
    } finally { this.running = false; }
  }
}
