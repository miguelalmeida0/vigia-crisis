import { RequestGate } from '../shared/request-gate.mjs';

export class SignedIngressAdmission {
  constructor({ gate = new RequestGate({ maxConcurrent: 16, maxConcurrentPerClient: 8, maxRequestsPerWindow: 600, windowMs: 60_000, maxClients: 256 }) } = {}) {
    this.gate = gate;
  }

  run(req, work) {
    const clientKey = String(req?.socket?.remoteAddress ?? 'unknown').slice(0, 160);
    return this.gate.run(clientKey, work);
  }
}

export const signedIngressAdmission = new SignedIngressAdmission();
