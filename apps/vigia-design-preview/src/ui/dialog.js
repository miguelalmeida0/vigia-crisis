import {button,e} from './html.js';
const dialog=document.getElementById('inspector');
let restoreTarget=null;
export function openDialog(title,body,{wide=false}={}){
 if(!dialog.open)restoreTarget=document.activeElement;
 dialog.classList.toggle('dialog-full',wide);
 document.getElementById('dialog-content').innerHTML=`<div class="dialog-head"><h2>${e(title)}</h2>${button('Close dialog','close-dialog',{ico:'close',tone:'icon-button'})}</div><div class="dialog-body">${body}</div>`;
 if(!dialog.open)dialog.showModal();
 dialog.querySelector('button')?.focus();
 return dialog;
}
export function closeDialog(){dialog.close();}
dialog.addEventListener('close',()=>{if(restoreTarget?.isConnected)restoreTarget.focus();else document.getElementById('page-content')?.focus();});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
let timer;
export function toast(message){const el=document.getElementById('toast');el.textContent=message;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{el.hidden=true;},4200);}
