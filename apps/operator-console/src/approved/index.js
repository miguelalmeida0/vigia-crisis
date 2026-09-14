import { shell } from './ui/shell.js';
import { attachPhysical } from './data/physical.js';
import { PhysicalConditionsPanel, PhysicalSummary } from './ui/physical.js';
import { intelligenceSummary } from './ui/intelligence-summary.js';
import { overview } from './routes/overview.js';
import { incidents } from './routes/incidents.js';
import { detail } from './routes/detail.js';
import { fireActivity } from './routes/fire-activity.js';
import { responseAccess } from './routes/response-access.js';
import { reports } from './routes/reports.js';
import { national } from './routes/national.js';
import { baseVM, CommandOverviewViewModel, IncidentsViewModel, IncidentDetailViewModel, ReportsViewModel, NationalAwarenessViewModel } from './data/model.js';

export const integratedRoutes=new Set(['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness']);
export function renderApprovedRoute(route,state) {
  const [adapter,present]={ 'command-overview':[CommandOverviewViewModel,overview],incidents:[IncidentsViewModel,incidents],'incident-detail':[IncidentDetailViewModel,detail],intelligence:[s=>baseVM(s,'intelligence'),fireActivity],operations:[s=>baseVM(s,'operations'),responseAccess],'reports-analytics':[ReportsViewModel,reports],'global-awareness':[NationalAwarenessViewModel,national]}[route];
  const vm=attachPhysical(adapter(state));
  const physical=['incident-detail'].includes(route)&&vm.incident?`<details class="physical-detail"><summary>More incident information</summary>${PhysicalConditionsPanel(vm)}</details>`:['command-overview','global-awareness'].includes(route)?`<details class="physical-detail"><summary>Conditions, changes & sources</summary>${PhysicalSummary(vm)}</details>`:'';
  const deeper=['command-overview','incident-detail','reports-analytics'].includes(route)?`<details class="physical-detail supporting-intelligence"><summary>Assessments, gaps & next steps</summary>${intelligenceSummary(vm)}</details>`:'';
  const body=present(vm,vm.ui)+physical+deeper;
  return shell(route==='global-awareness'?'national-awareness':route,vm,body).replace('class="vg-content"',`class="vg-content route--${route} approved-route"`);
}
