#!/usr/bin/env node
/** Dependency-free, loopback-only development server. No APIs or privileged operations. */
import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const args=process.argv.slice(2);let port=4310;
for(let i=0;i<args.length;i++)if(args[i]==='--port'){port=Number(args[++i]);}
if(!Number.isInteger(port)||port<1024||port>65535){console.error('Use a port between 1024 and 65535.');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.json':'application/json; charset=utf-8'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',csp);res.setHeader('Cache-Control','no-store');
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Method not allowed');return;}
 try{
  const parsed=new URL(req.url,'http://127.0.0.1');let name=decodeURIComponent(parsed.pathname);if(name==='/')name='/index.html';
  if(!/^\/(index\.html|src\/[^.][^\0]*|styles\/[^.][^\0]*|assets\/[^.][^\0]*)$/.test(name)||name.split('/').some(s=>s==='..'||s.startsWith('.'))){res.writeHead(404);res.end('Not found');return;}
  const candidate=path.resolve(root,'.'+name);const resolved=await realpath(candidate);
  if(!resolved.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  const s=await stat(resolved);if(!s.isFile())throw Object.assign(new Error(),{code:'ENOENT'});
  res.writeHead(200,{'Content-Type':mime[path.extname(resolved)]||'application/octet-stream','Content-Length':s.size});res.end(req.method==='HEAD'?undefined:await readFile(resolved));
 }catch(error){res.writeHead(error instanceof URIError?400:404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Try: npm run dev -- --port ${port+1}`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`\nVIGIA DESIGN PREVIEW\n\n  http://127.0.0.1:${port}/#/command-overview\n\n  Fictional data · local only · no API keys\n  Ctrl+C stops the preview.\n`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
