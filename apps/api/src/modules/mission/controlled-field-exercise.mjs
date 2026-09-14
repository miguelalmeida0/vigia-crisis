// Explicit exercise lane only. These paths/times are controlled assumptions,
// not surveyed EM527 geography, real facility capability or current road status.
export function controlledFieldContext(now){
  const calculatedAt=now.toISOString(),validUntil=new Date(now.getTime()+2*3600000).toISOString();
  const base={facilityId:'exercise:hospital',name:'Hospital access — controlled exercise',qualified:true,openingConfirmed:true,calculatedAt,validUntil,direction:'FACILITY_TO_SETTLEMENT',source:{provider:'CONTROLLED FIELD TEST — synthetic paths and times'}};
  const routes=[{...base,id:'exercise:em527',minutes:11,distanceKm:8,roads:['EM527 (exercise)'],geometry:{type:'LineString',coordinates:[[-7.94,38.62],[-7.93,38.62],[-7.92,38.62]]}},{...base,id:'exercise:n254',minutes:24,distanceKm:16,roads:['N254 (exercise)'],geometry:{type:'LineString',coordinates:[[-7.94,38.62],[-7.94,38.65],[-7.92,38.65],[-7.92,38.62]]}}];
  return {catalog:[{id:'exercise:louredo',name:'Louredo (exercise)',coordinate:[-7.92,38.62],services:[{id:'emergency_hospital',label:'Emergency healthcare',routes},{id:'fire_response',label:'Fire response',routes:[]},{id:'designated_reception',label:'Reception',routes:[]}]}],knownAt:calculatedAt,sourceValidUntil:validUntil,restrictions:[],notices:[],exercise:{label:'CONTROLLED FIELD TEST',reportPoint:[-7.93,38.62],accuracyM:10,locationName:'EM527 bridge (exercise)',limitations:'Synthetic path geometry, facility and 11/24 minute values. Not operational information.'}};
}
