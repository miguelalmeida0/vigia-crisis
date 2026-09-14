import {e} from './html.js';
import {icon} from './icons.js';

export function selectOptionMarkup({value,label,detail='',selected=false,disabled=false}) {
 return `<button type="button" class="vg-select-option" role="option" aria-selected="${selected}" tabindex="-1" data-value="${e(value)}" ${disabled?'disabled aria-disabled="true"':''}><span><strong>${e(label)}</strong>${detail?`<small>${e(detail)}</small>`:''}</span>${selected?icon('check'):''}</button>`;
}

let installed=false,sequence=0;
export function installSelectSystem() {
 if(installed)return;installed=true;
 let active=null,scheduled=false;
 const labelFor=select=>select.getAttribute('aria-label')||select.labels?.[0]?.querySelector('span')?.textContent||select.name||'Choose an option';
 const refresh=select=>{
  const button=select.nextElementSibling?.querySelector('.vg-select-trigger');if(!button)return;
  const text=select.options[select.selectedIndex]?.textContent??'Choose an option',label=labelFor(select),busy=select.getAttribute('aria-busy')==='true';
  const markup=`<span>${e(busy?'Loading options…':text)}</span>${icon('down')}`;
  const contentKey=String(busy)+text;
  if(button.dataset.contentKey!==contentKey){button.innerHTML=markup;button.dataset.contentKey=contentKey;}
  button.disabled=select.disabled||busy;button.setAttribute('aria-label',`${label}: ${text}`);
  button.setAttribute('aria-invalid',select.getAttribute('aria-invalid')??'false');button.setAttribute('aria-busy',String(busy));
  if(select.getAttribute('aria-describedby'))button.setAttribute('aria-describedby',select.getAttribute('aria-describedby'));
  if(select.title)button.title=select.title;
 };
 const close=(focus=true)=>{if(!active)return;const {select,button,menu}=active;active=null;menu.remove();button.setAttribute('aria-expanded','false');if(focus&&select.isConnected)button.focus();};
 const position=()=>{
  if(!active)return;const r=active.button.getBoundingClientRect(),menu=active.menu,margin=8,width=Math.min(Math.max(r.width,260),520,innerWidth-margin*2),below=innerHeight-r.bottom-margin,above=r.top-margin,up=below<220&&above>below,height=Math.max(80,Math.min(360,up?above-6:below-6));
  Object.assign(menu.style,{width:`${width}px`,maxHeight:`${height}px`,left:`${Math.max(margin,Math.min(r.left,innerWidth-width-margin))}px`,top:up?'auto':`${r.bottom+6}px`,bottom:up?`${innerHeight-r.top+6}px`:'auto'});
 };
 const open=(select,button,last=false)=>{
  if(select.disabled||button.disabled)return;if(active?.select===select){close();return;}close(false);
  const menu=document.createElement('div'),id=button.getAttribute('aria-controls');menu.className='vg-select-menu';menu.id=id+'-menu';menu.setAttribute('popover','manual');
  const searchable=select.options.length>10||select.dataset.searchable==='true';
  menu.innerHTML=`${searchable?`<label class="vg-select-search">${icon('search')}<input type="search" aria-label="Search ${e(labelFor(select))}" placeholder="Search options" autocomplete="off"></label>`:''}<div id="${id}" class="vg-select-options" role="listbox" aria-label="${e(labelFor(select))}"></div><p class="vg-select-count sr-only" role="status"></p>`;
  document.body.append(menu);active={select,button,menu};button.setAttribute('aria-expanded','true');
  const list=menu.querySelector('[role=listbox]'),normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  const draw=(query='')=>{const options=[...select.options].filter(o=>normalize(o.textContent).includes(normalize(query)));list.innerHTML=options.map(o=>selectOptionMarkup({value:o.value,label:o.textContent,selected:o.selected,disabled:o.disabled||o.parentElement.disabled})).join('')||'<p class="vg-select-empty">No matching options.</p>';menu.querySelector('[role=status]').textContent=`${options.length} options`;};draw();
  menu.showPopover?.();position();
  const options=()=>[...list.querySelectorAll('[role=option]:not(:disabled)')];
  const focusOption=index=>{const items=options();if(!items.length)return;const item=items[(index+items.length)%items.length];items.forEach(o=>o.tabIndex=o===item?0:-1);item.focus();item.scrollIntoView({block:'nearest'});};
  menu.querySelector('input')?.addEventListener('input',event=>{draw(event.target.value);});
  menu.addEventListener('click',event=>{const option=event.target.closest('[role=option]');if(!option||option.disabled)return;event.preventDefault();event.stopPropagation();select.value=option.dataset.value;
   const key=['data-control','data-setting','name','id'].find(k=>select.hasAttribute(k)),value=key?select.getAttribute(key):null;close(false);refresh(select);select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));
   requestAnimationFrame(()=>{const current=select.isConnected?select:key?document.querySelector(`select[${key}="${CSS.escape(value)}"]`):null;current?.nextElementSibling?.querySelector('.vg-select-trigger')?.focus();});
  });
  let typed='',typedAt=0;
  menu.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key==='Tab'){close();return;}
   const index=options().indexOf(document.activeElement),inSearch=event.target.matches('input');
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&(!inSearch||event.key.startsWith('Arrow'))){event.preventDefault();event.stopPropagation();focusOption(event.key==='Home'?0:event.key==='End'?options().length-1:event.key==='ArrowDown'?index+1:index<0?options().length-1:index-1);}
   else if(!inSearch&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();document.activeElement.click();}
   else if(!inSearch&&event.key.length===1&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopPropagation();typed=Date.now()-typedAt>700?event.key:typed+event.key;typedAt=Date.now();const next=options().findIndex(o=>normalize(o.textContent).startsWith(normalize(typed)));if(next>=0)focusOption(next);}
  });
  const input=menu.querySelector('input');if(input)input.focus();else focusOption(last?options().length-1:Math.max(0,options().findIndex(o=>o.getAttribute('aria-selected')==='true')));
 };
 const scan=()=>{scheduled=false;if(active&&!active.select.isConnected)close(false);document.querySelectorAll('select:not([multiple]):not([size])').forEach(select=>{
  if(!select.dataset.vgEnhanced){select.dataset.vgEnhanced='true';select.hidden=true;select.setAttribute('aria-hidden','true');select.tabIndex=-1;
   const wrap=document.createElement('span');wrap.className='vg-select';wrap.innerHTML=`<button type="button" class="vg-select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="vg-options-${++sequence}"></button>`;select.after(wrap);const button=wrap.firstElementChild;
   button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();open(select,button);});button.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();open(select,button,event.key==='ArrowUp');}});select.addEventListener('change',()=>refresh(select));
  }refresh(select);
 });};
 new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.target.matches('select,option,optgroup'))&&!scheduled){scheduled=true;queueMicrotask(scan);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','aria-invalid','aria-busy']});
 document.addEventListener('pointerdown',event=>{if(active&&!active.menu.contains(event.target)&&!active.button.contains(event.target))close(false);},true);
 window.addEventListener('resize',position);document.addEventListener('scroll',event=>{if(active&&!active.menu.contains(event.target))position();},true);window.addEventListener('hashchange',()=>close(false));scan();
}
