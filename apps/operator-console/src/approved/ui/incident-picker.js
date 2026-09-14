import {selectOptionMarkup} from './select-runtime.js';
import {e} from './html.js';
import {icon} from './icons.js';
import {incidentId,incidentLabel,incidentLocation} from '../../canonicalViewModel.js';

// Reuse the product picker inside the existing focus-managed dialog.
export function openIncidentPicker({incidents,selected,showOverlay,onSelect}) {
 const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const markup=query=>{const found=incidents.filter(i=>normalize(incidentLabel(i)+' '+incidentLocation(i)+' '+incidentId(i)).includes(normalize(query)));return found.sort((a,b)=>Number(incidentId(b)===selected)-Number(incidentId(a)===selected)).slice(0,60).map(i=>selectOptionMarkup({value:incidentId(i),label:incidentLabel(i),detail:incidentLocation(i),selected:incidentId(i)===selected})).join('')||'<p class="vg-select-empty">No matching incidents.</p>';};
 showOverlay('Change incident',`<div class="incident-choice-sheet"><label class="vg-select-search">${icon('search')}<input type="search" aria-label="Search incidents" placeholder="Search name, locality, or ID" autocomplete="off"></label><div class="vg-select-options" role="listbox" aria-label="Incident">${markup('')}</div></div>`,{kind:'dialog'});
 const root=document.querySelector('.incident-choice-sheet'),input=root.querySelector('input');

 root.addEventListener('input',event=>{
  event.stopPropagation();
  root.querySelector('[role=listbox]').innerHTML=markup(input.value);
 });
 root.addEventListener('click',event=>{
  const option=event.target.closest('[role=option]');if(!option)return;
  event.preventDefault();event.stopPropagation();
  const id=option.dataset.value;
  root.closest('.vigia-dialog').querySelector('[data-dialog-close]').click();onSelect(id);
 });
 root.addEventListener('keydown',event=>{
  if(event.target.matches('[role=option]')&&['Enter',' '].includes(event.key)){
   event.preventDefault();event.stopPropagation();event.target.click();return;
  }
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  if(event.target===input&&!['ArrowDown','ArrowUp'].includes(event.key))return;
  const options=[...root.querySelectorAll('[role=option]')];if(!options.length)return;
  event.preventDefault();event.stopPropagation();
  const index=options.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?(index+1)%options.length:(index-1+options.length)%options.length;
  options.forEach((option,i)=>option.tabIndex=i===next?0:-1);options[next].focus();
 });
 input.focus();
}
