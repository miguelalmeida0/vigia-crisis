import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return structuredClone(fallback);
    throw error;
  }
}

export async function writeJsonAtomic(filePath, value, { space = 2 } = {}) {
  const directory=path.dirname(filePath);await mkdir(directory, { recursive: true,mode:0o700 });await chmod(directory,0o700);
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, space)}\n`, {encoding:'utf8',mode:0o600,flag:'wx'});
  await rename(temporary, filePath);await chmod(filePath,0o600);
}
