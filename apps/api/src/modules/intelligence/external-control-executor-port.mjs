export class ExternalControlExecutorPort {
  id = 'unconfigured-external-control-executor';
  async execute() {
    throw Object.assign(new Error('external_control_executor_not_configured'), { code: 'EXTERNAL_EXECUTOR_NOT_CONFIGURED' });
  }
}
