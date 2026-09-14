import { json, problem } from './responses.mjs';
import { authorizeRoute, policyForRoute } from './route-security-policy.mjs';
function compilePath(pattern) {
  const names = []; const escaped = pattern.split('/').map((part) => { if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)'; } if (part === '*') { names.push('wildcard'); return '(.*)'; } return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('/');
  return { regex: new RegExp(`^${escaped}$`), names };
}
export class Router {
  #routes = [];
  register(method, path, handler) { const normalized=method.toUpperCase(),policy=policyForRoute(normalized,path);this.#routes.push({ method:normalized, path, handler, policy, ...compilePath(path) }); return this; }
  get(path, handler) { return this.register('GET', path, handler); } post(path, handler) { return this.register('POST', path, handler); } patch(path, handler) { return this.register('PATCH', path, handler); }
  routes(){return this.#routes.map(({method,path,policy})=>({method,path,policy}));}
  async handle(req, res, context = {}) {
    const url = new URL(req.url, 'http://localhost');
    for (const route of this.#routes) { if (route.method !== req.method) continue; const match = route.regex.exec(url.pathname); if (!match) continue; const params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])])); authorizeRoute({policy:route.policy,req,context,params});await route.handler({ req, res, url, params, context }); return true; }
    return false;
  }
  async safeHandle(req, res, context = {}) {
    try { return await this.handle(req, res, context); }
    catch (error) {
      const code = String(error?.message ?? error); const status = Number(error?.statusCode) || (code === 'forbidden' ? 403 : code.endsWith('_not_found') ? 404 : code === 'invalid_json' ? 400 : code === 'request_body_too_large' ? 413 : code.startsWith('invalid_') || code.endsWith('_required') ? 400 : 500);
      if (status >= 500&&status!==503) console.error(JSON.stringify({ level: 'error', component: 'http_router', method: req.method, path: new URL(req.url, 'http://localhost').pathname, error: code }));
      if(status===503&&error?.details?.dependency){json(res,503,{error:error.code??code,...error.details});return true;}
      problem(res, status, code, status === 500 ? 'Unexpected server error.' : code.replaceAll('_', ' '), error?.details); return true;
    }
  }
}
