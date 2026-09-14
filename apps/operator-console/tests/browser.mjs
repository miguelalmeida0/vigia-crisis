import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../..',import.meta.url));
const result=spawnSync(process.execPath,['scripts/visual-qa/run.mjs','golden'],{
  cwd:root,
  env:{...process.env,VIGIA_VQA_EXECUTION:process.env.VIGIA_VQA_EXECUTION??'local'},
  stdio:'inherit',
});
if(result.error)throw result.error;
if(result.status!==0)throw new Error(`operator_console_golden_browser_qa_failed:${result.status}`);
