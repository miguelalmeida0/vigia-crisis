import {icon} from './icons.js';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const e = escapeHTML;
export function badge(label, tone='neutral') {return `<span class="badge ${['red','green','amber','blue','neutral'].includes(tone)?tone:'neutral'}">${e(label)}</span>`;}
export function button(label, action, {tone='', ico='', extra='', disabled=false}={}) {return `<button type="button" class="btn ${tone}" data-action="${e(action)}" ${tone.includes('icon-button')?`aria-label="${e(label)}" title="${e(label)}"`:''} ${extra} ${disabled?'disabled':''}>${ico?icon(ico):''}<span${tone.includes('icon-button')?' class="sr-only"':''}>${e(label)}</span></button>`;}
export function link(label, action, extra='') {return `<button type="button" class="text-link" data-action="${e(action)}" ${extra}>${e(label)} ${icon('arrow')}</button>`;}
export function panel(title, body, {action='', cls='', sub=''}={}) {return `<section class="panel ${cls}"><header class="panel-head"><div><h2>${e(title)}</h2>${sub?`<p>${e(sub)}</p>`:''}</div>${action}</header>${body}</section>`;}
export function empty(title, explanation, extra='') {return `<div class="empty-state">${icon('file')}<h3>${e(title)}</h3><p>${e(explanation)}</p>${extra}</div>`;}
export function kv(label,value){return `<div class="kv"><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;}
export function select(label, key, options, selected, cls='') {return `<label class="select-wrap ${cls}"><span class="sr-only">${e(label)}</span><select aria-label="${e(label)}" data-control="${e(key)}">${options.map(([v,l])=>`<option value="${e(v)}" ${v===selected?'selected':''}>${e(l)}</option>`).join('')}</select>${icon('down')}</label>`;}
