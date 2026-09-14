export function createDrawer(ui) {
  let trigger=null;
  const close = () => { if(ui.drawer.getAttribute('aria-hidden')==='true')return;ui.drawer.setAttribute('aria-hidden','true');ui.scrim.hidden=true;const restore=trigger;trigger=null;restore?.focus?.(); };
  document.addEventListener('keydown',(event)=>{
    if(ui.drawer.getAttribute('aria-hidden')!=='false')return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=='Tab')return;
    const focusable=[...ui.drawer.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((element)=>element.getClientRects().length>0);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  return { open({ kicker, title, html }) { trigger=document.activeElement;ui.drawerKicker.textContent=kicker;ui.drawerTitle.textContent=title;ui.drawerContent.innerHTML=html;ui.drawer.setAttribute('aria-hidden','false');ui.scrim.hidden=false;setTimeout(()=>ui.drawer.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')?.focus(),0); }, close };
}
