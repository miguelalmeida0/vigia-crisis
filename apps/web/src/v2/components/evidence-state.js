import { escapeHtml } from '../utils/html.js';

const text=(value,fallback)=>escapeHtml(value??fallback);
export function renderEvidenceStateCard(input={}){
  const state=String(input.state??'UNKNOWN').toUpperCase(),title=input.title??state.replaceAll('_',' ');
  const rows=state==='UNMEASURED'?[['WHAT METRIC',input.metric],['CURRENT DENOMINATOR',input.denominator],['MEASUREMENT CAMPAIGN',input.campaign],['PROGRESS',input.progress],['WHAT MAKES IT MEASURABLE',input.closure]]
    :state==='CONFLICTED'?[['EVIDENCE A',input.evidenceA],['EVIDENCE B',input.evidenceB],['CONFLICT DIMENSION',input.dimension],['RESOLUTION EVIDENCE',input.resolution],['ASSIGNED VERIFICATION',input.owner]]
    :[['WHAT IS UNKNOWN',input.unknown],['WHY IT MATTERS',input.matters],['HOW IT CAN BE RESOLVED',input.resolution],['OWNER',input.owner],['CURRENT PLAN',input.plan],['NEXT OPPORTUNITY',input.next],['CLOSURE CONTRACT',input.closure]];
  return`<article class="decision-state is-${text(state.toLowerCase(),'unknown')}" data-evidence-state="${text(state,'UNKNOWN')}"><header><span>${text(state,'UNKNOWN')}</span><strong>${text(title,'Evidence state')}</strong></header><dl>${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${text(value,'Not yet established')}</dd></div>`).join('')}</dl>${input.boundary?`<p>${text(input.boundary,'')}</p>`:''}</article>`;
}
