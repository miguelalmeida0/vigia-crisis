import { postJson } from '../../shared/fetch.mjs';

export class ExternalSpreadProvider {
  constructor({ endpoint = '', apiKey = '', approval = null, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) { this.endpoint = endpoint; this.apiKey = apiKey; this.approval = approval; this.fetchImpl = fetchImpl; this.timeoutMs = timeoutMs; this.id = 'external-spread-provider'; }
  get approved() { return Boolean(this.endpoint && this.approval?.id && this.approval?.datasetId && this.approval?.approvedBy && Number.isFinite(Date.parse(this.approval?.approvedAt)) && this.approval?.scope); }
  get configured() { return this.approved; }
  async build(input) {
    if (!this.configured) throw new Error('external_spread_provider_not_configured');
    const result = await postJson(this.endpoint, input, { fetchImpl: this.fetchImpl, timeoutMs: this.timeoutMs, headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {} });
    return { ...result, provider: this.id, validated: true, validationEvidence: structuredClone(this.approval), modelNotice: 'Approved external provider result; use remains bounded by the attached validation scope and agency procedure.' };
  }
}
