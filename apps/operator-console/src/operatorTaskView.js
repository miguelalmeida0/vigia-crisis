// Presentation only: source contracts and server authorization remain authoritative.
export function canManageWork(session, incidentId) {
  const actor=session?.actor, normalize=id=>String(id??'').replace(/^(incident|event):/,'');
  return session?.authenticated===true && session?.mutationReady===true
    && ['supervisor','administrator'].includes(String(actor?.role??'').toLowerCase())
    && actor?.capabilities?.includes('command:incident')===true
    && actor?.incidentScopes?.some(scope=>scope==='*'||normalize(scope)===normalize(incidentId))===true;
}

export function requirementCopy(item) {
  const question=String(item?.question??item?.title??''), reason=String(item?.decisionBlocked??item?.reason??'');
  if(/authoritative|official incident/i.test(question))return {title:'Confirm the incident with an official source',why:'Current observations need an attributable official confirmation.'};
  if(/causal sensor|thermal|physical/i.test(question))return {title:'Check independent heat observations',why:'A separate observation is needed to corroborate the detected activity.'};
  if(/extent|perimeter|geometry/i.test(question))return {title:'Confirm the observed incident boundary',why:'The observed extent is needed before spatial conclusions can be supported.'};
  if(/weather|environment/i.test(question))return {title:'Check local environmental conditions',why:'Weather context is needed to assess the operating conditions.'};
  return {title:question||'Review the information request',why:reason||'The reason for this request was not returned.'};
}

export function permittedWorkMarkup(html, permitted) {
  if(permitted)return html;
  // Suppress mutation affordances in read-only views; inspection/navigation survives.
  return html.replace(/<button\b[^>]*data-action="(?:human-attention-|period-|protection-|command-intent-|command-context-|planning-(?:proposal-review|approved-apply|review|apply))[^\"]*"[^>]*>[\s\S]*?<\/button>/g,'');
}
