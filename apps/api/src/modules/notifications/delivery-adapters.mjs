function safePayload(row) {
  const alert = row.alert ?? {};
  return {
    schemaVersion: 'vigia.alert-delivery.v1', deliveryId: row.id, alertId: row.alert_id,
    eventId: alert.canonical_event_id, alertType: alert.alert_type, priority: alert.priority,
    title: alert.title, reasonCode: alert.reason_code, evidenceVersion: row.evidence_version,
    openedAt: alert.opened_at, recipient: { actorId: row.recipient?.actor_id, role: row.recipient?.actor_role },
    links: { alert: `/api/v10/alerts/${encodeURIComponent(row.alert_id)}`, incident: alert.canonical_event_id ? `/api/v10/operations/incidents/${encodeURIComponent(alert.canonical_event_id)}` : null }
  };
}
function webhookAllowed(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)); } catch { return false; }
}

export class DeliveryAdapters {
  constructor({ fetchImpl = globalThis.fetch, pinnedHttpsFetch = null, webhookUrl = '', emailTransport = null,emailProviderUrl='',emailToken='',emailFrom='',emailTo='', timeoutMs = 5000 } = {}) { Object.assign(this, { fetchImpl,pinnedHttpsFetch, webhookUrl, emailTransport,emailProviderUrl,emailToken,emailFrom,emailTo, timeoutMs }); }
  #transport(value){return new URL(value).protocol==='https:'&&this.pinnedHttpsFetch?this.pinnedHttpsFetch:this.fetchImpl;}
  async #post(value,options){const response=await this.#transport(value)(value,{...options,redirect:'manual'});if(response.status>=300&&response.status<400){try{await response.body?.cancel?.();}catch{}throw Object.assign(new Error('notification_redirect_rejected'),{code:'PROVIDER_REDIRECT_REJECTED'});}return response;}
  emailConfigured(){return Boolean(this.emailTransport?.send)||(webhookAllowed(this.emailProviderUrl)&&Boolean(this.emailToken&&this.emailFrom&&this.emailTo));}
  configuration() {
    return {
      IN_APP: { configured: true, transport: 'durable_in_app_outbox' },
      BROWSER_NOTIFICATION: { configured: true, transport: 'same_origin_browser_poll' },
      WEBHOOK: { configured: webhookAllowed(this.webhookUrl), transport: webhookAllowed(this.webhookUrl) ? 'https_webhook' : 'configured_off' },
      EMAIL: { configured: this.emailConfigured(), transport: this.emailTransport?.name ?? (this.emailConfigured()?'https_email_provider':'configured_off') }
    };
  }
  async deliver(row) {
    const payload = safePayload(row), channel = row.channel;
    if (channel === 'IN_APP' || channel === 'BROWSER_NOTIFICATION') return { state: 'DELIVERED', providerReference: `${channel.toLowerCase()}:${row.id}`, providerResponse: { accepted: true, transport: this.configuration()[channel].transport } };
    if (channel === 'WEBHOOK') {
      if (!webhookAllowed(this.webhookUrl)) return { state: 'CONFIGURED_OFF', failureCode: 'WEBHOOK_NOT_CONFIGURED', providerResponse: { configured: false } };
      const response = await this.#post(this.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'VIGIA/10.0 live-operations' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) throw Object.assign(new Error(`webhook_http_${response.status}`), { code: 'WEBHOOK_REJECTED' });
      return { state: 'DELIVERED', providerReference: response.headers?.get?.('x-request-id') ?? `webhook:${row.id}`, providerResponse: { status: response.status } };
    }
    if (channel === 'EMAIL') {
      if (!this.emailConfigured()) return { state: 'CONFIGURED_OFF', failureCode: 'EMAIL_NOT_CONFIGURED', providerResponse: { configured: false } };
      if(this.emailTransport?.send){const result = await this.emailTransport.send(payload);return { state: 'DELIVERED', providerReference: result?.id ?? `email:${row.id}`, providerResponse: { accepted: result?.accepted !== false } };}
      const response=await this.#post(this.emailProviderUrl,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.emailToken}`,'user-agent':'VIGIA/10.0 live-operations'},body:JSON.stringify({from:this.emailFrom,to:[this.emailTo],subject:`[${payload.priority}] ${payload.title}`,text:`${payload.reasonCode}\nAlert ${payload.alertId}\nIncident ${payload.eventId??'unlinked'}`,metadata:payload}),signal:AbortSignal.timeout(this.timeoutMs)});
      if(!response.ok)throw Object.assign(new Error(`email_http_${response.status}`),{code:'EMAIL_REJECTED'});
      return{state:'DELIVERED',providerReference:response.headers?.get?.('x-request-id')??`email:${row.id}`,providerResponse:{status:response.status}};
    }
    return { state: 'FAILED', failureCode: 'UNSUPPORTED_CHANNEL', failureMessage: `Unsupported delivery channel ${channel}` };
  }
}
