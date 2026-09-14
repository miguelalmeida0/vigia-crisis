/** Fictional development records. These are never live incidents or authority messages. */
export const DEMO_TIME = '2026-09-07T11:14:00Z';
export const BASE_INCIDENTS = [
 ['lever','Vila Nova de Gaia · Lever','Norte','Heat detection','candidate','high','2026-08-16T15:49:00Z',41.0644,-8.4721,'A satellite heat observation needs independent confirmation.'],
 ['monsanto','Lisboa · Monsanto','Lisboa','Smoke report','monitored','normal','2026-09-07T10:14:00Z',38.735,-9.19,'A smoke report is being reviewed. No fire is independently confirmed.'],
 ['valongo','Valongo','Norte','Heat detection','candidate','high','2026-09-07T08:21:00Z',41.188,-8.497,'Multiple heat detections are awaiting confirmation.'],
 ['coelhoso','Bragança · Coelhoso','Norte','Heat detection','candidate','normal','2026-09-07T07:12:00Z',41.718,-6.749,'Recent observations are available from one source type.'],
 ['vinhais','Vinhais','Norte','Earlier report','monitored','normal','2026-09-06T18:03:00Z',41.835,-7.008,'An earlier record has no recent update.'],
 ['evora','Évora','Alentejo','Heat detection','candidate','normal','2026-09-06T12:41:00Z',38.571,-7.913,'A heat detection needs source review.'],
 ['castelo','Castelo Branco','Centro','Heat detection','candidate','normal','2026-09-07T11:00:00Z',39.822,-7.491,'A new observation has been added for verification.'],
 ['landeira','Landeira','Alentejo','Heat detection','candidate','normal','2026-09-07T10:22:00Z',38.5972,-8.6616,'A satellite observation needs an official-source check.'],
 ['coimbra','Coimbra','Centro','Heat detection','candidate','normal','2026-09-07T09:45:00Z',40.211,-8.429,'A new heat detection is awaiting review.'],
 ['benavente','Benavente','Lisboa','Heat detection','candidate','normal','2026-09-07T09:02:00Z',38.979,-8.807,'A heat observation is unconfirmed.'],
 ['viseu','Viseu','Centro','Heat detection','candidate','normal','2026-09-07T08:55:00Z',40.657,-7.913,'A new source observation has been recorded.'],
 ['guarda','Guarda','Centro','Heat detection','candidate','normal','2026-09-07T08:45:00Z',40.537,-7.267,'Independent confirmation is still needed.'],
 ['beja','Beja','Alentejo','Heat detection','candidate','normal','2026-09-07T08:35:00Z',38.014,-7.863,'Heat activity needs an incident classification.'],
 ['silves','Silves','Algarve','Exercise incident','confirmed','normal','2026-09-07T09:00:00Z',37.189,-8.438,'Confirmed within this fictional exercise only.'],
 ['leiria','Leiria','Centro','Exercise incident','confirmed','normal','2026-09-07T08:00:00Z',39.744,-8.807,'Confirmed within this fictional exercise only.'],
 ['ponte','Ponte de Lima','Norte','Exercise incident','confirmed','normal','2026-09-07T07:00:00Z',41.767,-8.584,'Confirmed within this fictional exercise only.'],
 ['tavira','Tavira','Algarve','Earlier report','monitored','normal','2026-09-06T17:20:00Z',37.127,-7.649,'Retained for review; current fire presence is unknown.'],
 ['setubal','Setúbal','Lisboa','Earlier report','monitored','normal','2026-09-06T14:20:00Z',38.525,-8.894,'An earlier observation remains under monitoring.'],
].map(([id,name,region,type,status,priority,observedAt,lat,lon,summary])=>({id,name,region,type,status,priority,observedAt,lat,lon,summary,source:status==='confirmed'?'Exercise controller':'Satellite / report',verified:status==='confirmed',area:null}));
export const REGIONS = ['Norte','Centro','Lisboa','Alentejo','Algarve'];
export const OWNERS = ['Unassigned','Exercise Controller','Duty analyst','Regional reviewer'];
export const QUESTIONS = [
 {id:'official',title:'Has an official source confirmed the incident?',short:'Official confirmation',body:'No official confirmation is attached to this demonstration record.',resolves:'A current, attributable update from the responsible authority.',context:'Satellite observations can support a heat detection, but do not establish official incident status.',source:'Official-source update',next:'7 Sept, 12:00 UTC'},
 {id:'newer',title:'Is there more recent activity?',short:'Recent observations',body:'No newer heat observation has been verified for this record.',resolves:'A newer, valid observation associated with this incident.',context:'Repeated copies of the same observation are not independent confirmation.',source:'New satellite or field observation',next:'7 Sept, 12:07 UTC'},
 {id:'area',title:'What is the affected area?',short:'Affected area',body:'The extent and perimeter have not been established.',resolves:'A time-stamped perimeter or verified field assessment.',context:'A location marker is not a fire perimeter.',source:'Verified geometry',next:'Awaiting source'},
 {id:'conditions',title:'Are environmental factors increasing risk?',short:'Environmental conditions',body:'Weather and terrain provide context, not a validated spread forecast.',resolves:'Current local conditions and a qualified assessment.',context:'Regional wind information alone does not predict fire arrival.',source:'Weather and terrain context',next:'7 Sept, 12:15 UTC'},
];
export const TASK_TEMPLATES = [
 {key:'official',title:'Confirm the incident with an official source',summary:'Review the source checks and request official confirmation.',status:'attention',priority:'high',owner:'Exercise Controller',due:'12:00',blocker:'Official update not received',question:'official'},
 {key:'thermal',title:'Check independent heat observations',summary:'Review a separate observation for corroboration.',status:'attention',priority:'high',owner:'Exercise Controller',due:'12:07',blocker:'Independent observation not confirmed',question:'newer'},
 {key:'consistency',title:'Review satellite source consistency',summary:'Compare the recorded location, time, and source metadata.',status:'progress',priority:'normal',owner:'Duty analyst',due:'14:00',blocker:'None recorded',question:'newer'},
 {key:'exposure',title:'Assess potential exposure',summary:'Separate mapped surroundings from confirmed impact.',status:'waiting',priority:'normal',owner:'Unassigned',due:'16:00',blocker:'Verified affected area needed',question:'area'},
];
export const INITIAL_ACTIVITY = [
 {id:'a1',time:'11:08',title:'Source check completed for Landeira',actor:'Automated',type:'machine'},
 {id:'a2',time:'10:54',title:'Task assigned to Exercise Controller',actor:'System',type:'human'},
 {id:'a3',time:'09:12',title:'Weather context refreshed',actor:'IPMA · sample',type:'machine'},
];
export const PERIODS = {
 '24h': {label:'Last 24 hours',reviewed:11,resolved:7,open:4,series:[3,2,4,2],labels:['02:00','05:00','08:00','11:00'],categories:[['Official confirmation',5],['Independent observation',4],['Incident classification',2]],map:[1.1,1.25,1.18,1.4],api:[720,640,710,850],mapLast:1.4,apiLast:850,freshness:2.1,checks:48,successful:48},
 '7d': {label:'Last 7 days',reviewed:48,resolved:35,open:13,series:[4,6,5,9,7,6,11],labels:['1 Sept','2 Sept','3 Sept','4 Sept','5 Sept','6 Sept','7 Sept'],categories:[['Official confirmation',18],['Independent observation',16],['Incident classification',14]],map:[1.8,1.7,1.5,1.7,1.55,1.45,1.4],api:[940,830,910,820,760,800,850],mapLast:1.4,apiLast:850,freshness:2.1,checks:336,successful:334}
};
