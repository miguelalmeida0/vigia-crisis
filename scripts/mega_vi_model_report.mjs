import {readFile,writeFile} from 'node:fs/promises';
const root='docs/handoffs/mega-vi/',r=JSON.parse(await readFile(root+'model-corpus.json','utf8'));
const rows=r.rows,completed=rows.filter(x=>x.rawOutput!==null),timeouts=rows.filter(x=>/timeout/i.test(x.error??'')),malformed=rows.filter(x=>x.rawOutput!==null&&x.error);
const percent=(list,predicate)=>list.length?100*list.filter(predicate).length/list.length:null;
const result={...r,requestErrors:r.crashes,crashes:undefined,transportTimeouts:timeouts.length,malformedResponses:malformed.length,otherRequestErrors:rows.filter(x=>x.error&&!timeouts.includes(x)&&!malformed.includes(x)).length,completedResponses:completed.length,completionRatePercent:100*completed.length/rows.length,accuracyAmongCompletedPercent:percent(completed,x=>x.correct),schemaAmongCompletedPercent:percent(completed,x=>x.schemaValid),nativeProcessCrashes:'NONE_OBSERVED_IN_COMPLETED_CPU_RUN',interpretation:'Timeouts are unsuccessful attempts, not native process crashes or completed-response accuracy. All raw rows are retained.'};
await writeFile(root+'model-evaluation.json',JSON.stringify(result,null,2));
const runtime=JSON.parse(await readFile(root+'model-runtime.json','utf8'));runtime.corpusState=result.selectionState;runtime.selectedModel=result.qualified?result.model:null;runtime.corpusReport='model-evaluation.json';await writeFile(root+'model-runtime.json',JSON.stringify(runtime,null,2));
console.log(JSON.stringify({...result,rows:undefined}));
