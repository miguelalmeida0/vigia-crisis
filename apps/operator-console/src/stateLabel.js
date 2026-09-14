const escapeHtml=(value='')=>String(value??'').replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));

export function stateTone(input){
  const state=String(input??'').toUpperCase();
  if(/BLOCK|FAILED|REVOKED|CRITICAL|CONTRADICT|ERROR|OFFLINE/.test(state))return'critical';
  if(/DEGRADED|WAIT|UNKNOWN|UNAVAILABLE|INSUFFICIENT|OPEN|STALE|AGING|EVIDENCE|VALIDATION|PENDING|WITHHELD|ABSTAIN|NOT[_ ]|NO[_ ]|NO RECENT/.test(state))return'warning';
  if(/CONFIRMED|VERIFIED|READY|ACTIVE|HEALTHY|COMPLETED|SATISFIED|OPERATIONAL|CONTAINED|MONITORING|CURRENT|LIVE|FRESH|ADMITTED|RUNNING/.test(state))return'green';
  return'info';
}

export function stateLabel(input,{label=null,compact=false,title=''}={}){
  const text=label??String(input??'Not reported').replaceAll('_',' ').toLocaleLowerCase().replace(/^./,letter=>letter.toUpperCase()),tone=stateTone(input);
  return`<span class="vigia-state-label vigia-state-label--${tone}${compact?' vigia-state-label--compact':''}"${title?` title="${escapeHtml(title)}"`:''}><i aria-hidden="true"></i><span>${escapeHtml(text)}</span></span>`;
}
