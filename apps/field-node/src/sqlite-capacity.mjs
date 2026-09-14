import { statSync } from 'node:fs';

export function sqliteStorageBytes(filePath){let total=0;for(const file of [filePath,`${filePath}-wal`,`${filePath}-shm`]){try{total+=statSync(file).size;}catch{}}return total;}

export function sqliteLogicalBytes(db){return Number(db.prepare('PRAGMA page_size').get().page_size)*Number(db.prepare('PRAGMA page_count').get().page_count);}

export function configureSqliteHardLimit(db,maxDatabaseBytes){
  const pageSize=Number(db.prepare('PRAGMA page_size').get().page_size),pageCount=Number(db.prepare('PRAGMA page_count').get().page_count);
  const maxPages=Math.max(pageCount,Math.floor(maxDatabaseBytes/pageSize));
  db.exec(`PRAGMA max_page_count=${Math.max(1,maxPages)}`);
  return{pageSize,maxPages,logicalLimitBytes:maxPages*pageSize};
}

export function sqliteWriteLimit({maxDatabaseBytes,reserveBytes,protectedWrite=false}){return protectedWrite?maxDatabaseBytes:Math.max(1,maxDatabaseBytes-reserveBytes);}

export function prepareSqliteWrite({db,filePath,maxDatabaseBytes,reserveBytes,protectedWrite=false,estimatedBytes=64*1024}){
  const limit=sqliteWriteLimit({maxDatabaseBytes,reserveBytes,protectedWrite});
  if(sqliteStorageBytes(filePath)>limit)db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const bytes=sqliteStorageBytes(filePath),logicalBytes=sqliteLogicalBytes(db),transactionReserveBytes=Math.max(4096,Number(estimatedBytes)||0);if(bytes>limit||logicalBytes>limit||bytes+transactionReserveBytes>limit)throw Object.assign(new Error('field_storage_capacity_reached'),{statusCode:507,details:{bytes,logicalBytes,transactionReserveBytes,maxBytes:maxDatabaseBytes,writeLimitBytes:limit,protectedWrite}});
  return limit;
}

export function assertSqliteWriteCapacity({db,filePath,maxDatabaseBytes,limit}){const bytes=sqliteStorageBytes(filePath),logicalBytes=sqliteLogicalBytes(db);if(bytes>limit||logicalBytes>limit)throw Object.assign(new Error('field_storage_capacity_reached'),{statusCode:507,details:{bytes,logicalBytes,maxBytes:maxDatabaseBytes,writeLimitBytes:limit}});}

export function recoverSqliteWal(db){try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');}catch{}}
