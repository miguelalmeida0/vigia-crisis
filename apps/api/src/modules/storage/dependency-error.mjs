export class DependencyUnavailableError extends Error {
  constructor({ dependency, capability, code, message, retryable = true, state = 'degraded', details = {} }) {
    super(code);
    this.name = 'DependencyUnavailableError';
    this.statusCode = 503;
    this.code = code;
    this.details = {
      status: state,
      dependency,
      capability,
      retryable,
      message,
      ...details
    };
  }
}

export function operationsPostgisUnavailable(status = {}) {
  return new DependencyUnavailableError({
    dependency: 'postgis',
    capability: 'operations',
    code: 'operations_postgis_unavailable',
    message: 'Durable operations state is temporarily unavailable. Retry after PostGIS recovers.',
    details: {
      dependencyState: status.state ?? 'unknown',
      lastSuccessfulConnectionAt: status.lastSuccessfulConnectionAt ?? null,
      lastFailureAt: status.lastFailureAt ?? null
    }
  });
}

export function isPostgresAvailabilityError(error){
  const code=String(error?.code??'').toUpperCase(),message=String(error?.message??error??'').toLowerCase();
  return ['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','ENOTFOUND','EAI_AGAIN','53300','57P01','57P02','57P03','25P03','08000','08001','08003','08004','08006','08007','08P01'].includes(code)
    ||message.includes('connection terminated')||message.includes('connection timeout')||message.includes('connect timeout')||message.includes('timeout exceeded when trying to connect')||message.includes('client has already been released')||message.includes('client was closed');
}
