// Evidence-layer controls live at the document boundary so they survive observation-studio redraws.
document.addEventListener('click',(event)=>{
  const control=event.target.closest?.('[data-studio-action="connectivity"],[data-studio-action="assets"],[data-studio-action="consensus"]');
  if(!control)return;
  const overlay=document.querySelector('[data-connectivity-overlay]');
  const layer=overlay?.querySelector({connectivity:'.fuel-graph-lines',assets:'.fuel-asset-connections',consensus:'.fuel-consensus-zone'}[control.dataset.studioAction]);
  if(!layer)return;
  const hidden=layer.classList.toggle('is-hidden');control.classList.toggle('is-active',!hidden);
},true);
