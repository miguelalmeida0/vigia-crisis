import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

// SQLite owns atomicity; payloads (including membership and cached context) are
// AES-GCM encrypted. The local installation key is never sent to a client.
export class TeamStore {
  constructor({filePath,key=null}) {
    this.filePath=filePath;
    if(filePath!==':memory:') {
      mkdirSync(path.dirname(filePath),{recursive:true,mode:0o700});
      const keyPath=filePath+'.key';
      try { if(lstatSync(keyPath).isSymbolicLink())throw Error('Team key must be a regular file.');key=readFileSync(keyPath); }
      catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);writeFileSync(keyPath,key,{flag:'wx',mode:0o600});}
      try{if(lstatSync(filePath).isSymbolicLink())throw Error('Team store must be a regular file.');}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    this.key=key??randomBytes(32);if(this.key.length!==32)throw Error('Invalid team storage key.');
    this.db=new DatabaseSync(filePath);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA max_page_count=65536; CREATE TABLE IF NOT EXISTS team_records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));');
    if(!this.db.prepare('PRAGMA table_info(team_records)').all().some(c=>c.name==='group_id'))this.db.exec("ALTER TABLE team_records ADD COLUMN group_id TEXT NOT NULL DEFAULT ''; CREATE INDEX IF NOT EXISTS team_group_records ON team_records(kind,group_id);");
    this.secure();
  }
  secure(){if(this.filePath!==':memory:')for(const f of [this.filePath,this.filePath+'-wal',this.filePath+'-shm',this.filePath+'.key'])try{chmodSync(f,0o600);}catch(e){if(e.code!=='ENOENT')throw e;}}
  encrypt(v){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv),body=Buffer.concat([cipher.update(JSON.stringify(v)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');}
  decrypt(v){const b=Buffer.from(v,'base64'),c=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString());}
  get(kind,id){const r=this.db.prepare('SELECT body FROM team_records WHERE kind=? AND id=?').get(kind,id);return r?this.decrypt(r.body):null;}
  list(kind,groupId=null){return (groupId===null?this.db.prepare('SELECT body FROM team_records WHERE kind=? ORDER BY rowid').all(kind):this.db.prepare('SELECT body FROM team_records WHERE kind=? AND group_id=? ORDER BY rowid').all(kind,groupId)).map(r=>this.decrypt(r.body));}
  page(kind,groupId,after=0,limit=100){const rows=this.db.prepare('SELECT rowid AS cursor, body FROM team_records WHERE kind=? AND group_id=? AND rowid>? ORDER BY rowid LIMIT ?').all(kind,groupId,after,limit+1);const selected=rows.slice(0,limit);return {records:selected.map(r=>this.decrypt(r.body)),nextCursor:selected.at(-1)?.cursor??after,hasMore:rows.length>limit};}
  put(kind,id,v){this.db.prepare('INSERT INTO team_records(kind,id,body,group_id) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,group_id=excluded.group_id').run(kind,id,this.encrypt(v),v.groupId??(kind==='group'?id:''));return v;}
  transaction(work){this.db.exec('BEGIN IMMEDIATE');try{const v=work();this.db.exec('COMMIT');this.secure();return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close(){this.secure();this.db.close();}
}
