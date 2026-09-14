import { fieldControlRequest } from '../fieldnet/control-request.mjs';
import { signFieldRequest } from '../../packages/domain/src/fieldnet/request-auth.mjs';
import { readBoundedResponse } from '../release/bounded-response.mjs';

const cookieHeader = (values) => values.map((value) => value.split(';')[0]).join('; ');

export const governedOperatorConsoleHeaders = ({ operatorOrigin }) => ({
  origin: operatorOrigin,
  'sec-fetch-site': 'same-origin',
  'x-vigia-ui-proxy': 'mission-dark-realdata-2.0',
});

export const governedSessionBootstrapHeaders = ({ operatorOrigin, operatorToken }) => ({
  ...governedOperatorConsoleHeaders({ operatorOrigin }),
  authorization: `Bearer ${operatorToken}`,
});

export const governedIncidentCommandActorAuthorized = (actor) => actor?.role === 'administrator'
  && actor?.authentication?.mode === 'local_shadow_session'
  && actor?.incidentScopes?.includes('*')
  && actor?.capabilities?.includes('read:incident_command')
  && actor?.capabilities?.includes('command:incident');

function assertSession(session, code) {
  if (session?.authenticated !== true) throw new Error(`${code}:not_authenticated`);
  if (session.actor?.name !== 'Miguel Almeida' || session.actor?.title !== 'Shadow Operator') {
    throw new Error(`${code}:unexpected_actor`);
  }
  if (!governedIncidentCommandActorAuthorized(session.actor)) {
    throw new Error(`${code}:incident_command_capability_missing`);
  }
}

export function createRuntimeClient({ central, field, fieldControlKey=process.env.FIELDNET_CONTROL_KEY, fieldControlKeyId=process.env.FIELDNET_CONTROL_KEY_ID??'field-operator', fieldControlSocket=process.env.FIELDNET_CONTROL_SOCKET,operatorOrigin=process.env.VIGIA_OPERATOR_CONSOLE_ORIGIN??'http://127.0.0.1:4190',operatorToken=process.env.VIGIA_OPERATOR_TOKEN??'',fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const centralBase = String(central).replace(/\/$/, '');
  const fieldBase = String(field).replace(/\/$/, '');
  let governedCookie = null;

  const request = async (url, options = {}, headers = {}) => {
    const started = performance.now();
    const response = await fetchFn(url, {
      ...options,
      headers: { 'content-type': 'application/json', ...headers, ...options.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const {body}=await readBoundedResponse(response,{maxBytes:8*1024*1024});
    return {
      url,
      status: response.status,
      ok: response.ok,
      durationMs: Number((performance.now() - started).toFixed(3)),
      body,
      setCookies: response.headers.getSetCookie?.() ?? [],
    };
  };

  const establishGovernedSession = async () => {
    const issued = await request(`${centralBase}/api/v10/session`, {
      method: 'POST',
      headers: governedSessionBootstrapHeaders({ operatorOrigin, operatorToken }),
      body: JSON.stringify({ intent: 'local-shadow-operator-session' }),
    });
    if (!issued.ok) throw new Error(`governed_session_establishment_failed:${issued.status}`);
    assertSession(issued.body, 'governed_session_establishment_failed');
    governedCookie = cookieHeader(issued.setCookies);
    if (!governedCookie.includes('vigia_shadow_session=')) throw new Error('governed_session_cookie_missing');
    const reloaded = await request(`${centralBase}/api/v10/session`, {}, { cookie: governedCookie });
    if (!reloaded.ok) throw new Error(`governed_session_reload_failed:${reloaded.status}`);
    assertSession(reloaded.body, 'governed_session_reload_failed');
    if (issued.body.sessionId !== reloaded.body.sessionId || issued.body.actor?.id !== reloaded.body.actor?.id) {
      throw new Error('governed_session_not_persistent');
    }
    return {
      cookie: governedCookie,
      issued,
      reloaded,
      actor: reloaded.body.actor,
      sessionId: reloaded.body.sessionId,
    };
  };

  const centralRequest = (route, options = {}) => {
    if (!governedCookie) throw new Error('governed_session_required_before_central_request');
    return request(`${centralBase}${route}`, options, { cookie: governedCookie });
  };
  const fieldRequest = (route, options = {}) => {const body=options.body?JSON.parse(options.body):null,method=options.method??'GET',signed=signFieldRequest({method,path:new URL(route,'http://fieldnode.local').pathname,keyId:fieldControlKeyId,key:fieldControlKey,body});if(fieldControlSocket)return fieldControlRequest({socketPath:fieldControlSocket,path:route,method,headers:{'content-type':'application/json',...signed},body:options.body??null,timeoutMs,logicalUrl:`${fieldBase}${route}`});return request(`${fieldBase}${route}`, options, signed);};

  return { establishGovernedSession, centralRequest, fieldRequest };
}
