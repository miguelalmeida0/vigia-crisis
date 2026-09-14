import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('operator console server applies strict CSP without unsafe evaluation or wildcard authority',async()=>{
  const source=await readFile(new URL('../../operator-console/server.mjs',import.meta.url),'utf8');
  for(const directive of ["default-src 'self'","script-src 'self'","object-src 'none'","base-uri 'none'","frame-ancestors 'none'","connect-src 'self'","img-src 'self' data: blob:","worker-src 'self'","manifest-src 'self'"])assert.match(source,new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(source,/unsafe-eval|default-src \*/);
  assert.match(source,/securityHeaders\(res\)/);
  assert.match(source,/securityHeaders\(res,\{document:extname\(path\)===['"]\.html['"]\}\)/);
});
