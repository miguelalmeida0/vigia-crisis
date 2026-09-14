import { randomBytes } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteNoFollow, readFileNoFollow, verifyDirectoryChain } from './release/safe_artifact.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SECRET_PATTERN=/^[A-Za-z0-9_-]{43}$/;

export const LOCAL_POSTGRES_PASSWORD_FILE=path.join(root,'.tmp','release','local-postgres-password');

export async function ensureLocalPostgresPassword({projectRoot=root,secretFile=path.join(projectRoot,'.tmp','release','local-postgres-password')}={}){
  await verifyDirectoryChain(projectRoot,path.dirname(secretFile));
  const metadata=await lstat(secretFile).catch((error)=>error?.code==='ENOENT'?null:Promise.reject(error));
  if(metadata){
    if(!metadata.isFile()||metadata.isSymbolicLink())throw new Error('local_postgres_secret_file_invalid');
    if((metadata.mode&0o077)!==0)throw new Error('local_postgres_secret_permissions_invalid');
    const existing=String(await readFileNoFollow(secretFile,{root:projectRoot,maxBytes:128,encoding:'utf8'})).trim();
    if(!SECRET_PATTERN.test(existing))throw new Error('local_postgres_secret_value_invalid');
    return existing;
  }
  const generated=randomBytes(32).toString('base64url');
  await atomicWriteNoFollow(secretFile,`${generated}\n`,{root:projectRoot,mode:0o600});
  return generated;
}

export function buildLocalDatabaseUrl(password,{host='127.0.0.1',port=55432,database='vigia'}={}){
  if(!SECRET_PATTERN.test(String(password)))throw new Error('local_postgres_secret_value_invalid');
  const target=new URL('postgresql://vigia@127.0.0.1/vigia');target.password=String(password);target.hostname=host;target.port=String(port);target.pathname=`/${database}`;return target.toString();
}

export async function resolveLocalDatabaseUrl(options={}){
  if(process.env.VIGIA_DATABASE_URL)return process.env.VIGIA_DATABASE_URL;
  return buildLocalDatabaseUrl(await ensureLocalPostgresPassword(options));
}
