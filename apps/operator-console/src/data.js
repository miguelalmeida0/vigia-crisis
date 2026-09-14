// Static product metadata only. Live operational data is never stored in this file.
export const navPrimary = [
  ['command-overview','Command Overview','overview'],
  ['incidents','Incidents','evidence'],
  ['incident-detail','Incident Detail','map'],
  ['intelligence','Fire Activity','detect'],
  ['operations','Response & Access','settings'],
  ['global-awareness','National Awareness','globe']
];
export const navUtility = [];
export const routes = {
  'command-overview':{title:'Command Overview',iconName:'overview',eyebrow:'Real-time operational picture'},
  incidents:{title:'Incidents',iconName:'evidence',eyebrow:'Current incident universe'},
  'incident-detail':{title:'Incident Detail',iconName:'map',eyebrow:'Understand this incident and its latest confirmed information.'},
  intelligence:{title:'Fire Activity',iconName:'detect',eyebrow:'What is happening around this fire right now?'},
  operations:{title:'Response & Access',iconName:'settings',eyebrow:'Access, surrounding places and mapped response facilities.'},
  'reports-analytics':{title:'Reports & Analytics',iconName:'chart',eyebrow:'Review results over time. Find what needs to improve.'},
  'global-awareness':{title:'National Awareness',iconName:'globe',eyebrow:'See the situation across Portugal’s regions.'}
};
export const primaryRoutes = Object.freeze(navPrimary.map(([route])=>route));
