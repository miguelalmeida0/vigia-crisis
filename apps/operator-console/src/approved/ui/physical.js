import {MeasurementPanel,ChangeList,DetailRows} from './measurement-panel.js';
import { e } from './html.js';
import {primaryMetric} from '../data/hierarchy.js';

export function MetricValue(m){return `<div class="physical-metric ${e(m.tone)}" data-metric="${e(m.id)}"><dt>${e(m.label)}</dt><dd><strong>${e(m.display)}</strong>${m.available&&m.unit?` <span>${e(m.unit)}</span>`:''}</dd><small>${e(m.freshnessLabel)}</small>${m.asOf?`<time datetime="${e(m.asOf)}">${e(m.timeLabel)}</time>`:''}${m.source?`<small>${e(m.source)}</small>`:''}${m.context?`<small class="metric-context">${e(m.context)}</small>`:''}${m.trendLabel?`<small>${e(m.trendLabel)}</small>`:''}${m.sparkline?`<svg class="metric-trend" viewBox="0 0 100 26" role="img" aria-label="${e(m.label+' trend: '+m.trendLabel)}"><polyline points="${e(m.sparkline)}"/></svg>`:''}</div>`;}
export function MetricStrip(metrics,label){return `<dl class="physical-strip" aria-label="${e(label)}">${metrics.map(MetricValue).join('')}</dl>`;}
export function WeatherStrip(p){return `<p class="small">${e(p.metrics.temperature.context??'Nearest weather station unavailable.')}</p>`+MetricStrip(['temperature','wind','gust','windDirection','humidity','rain'].map(id=>({...p.metrics[id],context:''})),'Weather conditions');}
export function PhysicalInline(p){
 const metrics=['temperature','wind','humidity','rain'].map(id=>p?.metrics?.[id]).filter(primaryMetric);
 if(!metrics.length)return '';
 const ages=[...new Set(metrics.map(m=>m.freshnessLabel).filter(Boolean))];
 return `<span class="physical-inline">${metrics.map(m=>`<span>${e(m.label)} <strong>${e(m.display)} ${e(m.unit)}${m.id==='wind'&&m.direction?' '+e(m.direction):''}</strong></span>`).join('')}<small>${ages.length===1?e(ages[0]):'Station readings · select incident for measurement times'}</small></span>`;
}
export const WhatChanged=ChangeList;
export function PhysicalConditionsPanel(vm) {
 const p=vm.physical;
 const extra=`<section><h3>Places and road access</h3>${DetailRows([...(p.places??[]).map(a=>[a.label??a.name??'Mapped place',String(a.exposureState??'Exposure unconfirmed').replaceAll('_',' ').toLowerCase()]),...(p.roads??[]).map(r=>[r.label??r.name??'Road',r.statusLabel])])}${!p.roads?.length?'<p class="ux-empty">Road status is unavailable. No safe route is inferred.</p>':''}</section>`;
 return MeasurementPanel({metrics:[...Object.values(p.metrics),...p.exposure,...p.roadMetrics],changes:p.changes,notices:p.warnings,title:'Current reported conditions',boundary:'Measurements retain their source location. Thermal observations do not establish fire-front geometry; modelled smoke is separate from measurements.',extra});
}
export function PhysicalSummary(vm) {
 return MeasurementPanel({metrics:vm.physicalSummary,changes:vm.physicalChanges,notices:vm.physicalNotices,coverage:vm.physicalNoticeCoverage,boundary:vm.physicalBoundary});
}
