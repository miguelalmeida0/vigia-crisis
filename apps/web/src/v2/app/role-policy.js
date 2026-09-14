const ROLE_VIEWS = Object.freeze({
  public_viewer: ['live','incidents','observe','validation','system','replay'],
  supervisor: ['live','incidents','observe','command','field','outcomes','validation','system','replay'],
  analyst: ['live','incidents','observe','command','validation','system','replay'],
  field_inspector: ['live','incidents','observe','field','validation','system','replay'],
  administrator: ['live','incidents','observe','command','field','outcomes','validation','system','replay'],
  viewer: ['live','incidents','observe','validation','system','replay']
});

const LABELS = Object.freeze({
  live: 'Overview',
  replay: 'System proof',
  command: 'Action',
  observe: 'Prevent',
  validation:'Evidence',
  system:'System proof',
  incidents: 'Detect',
  field: 'My work',
  outcomes: 'Outcomes'
});

export function viewsForActor(actor) {
  return ROLE_VIEWS[actor?.role] ?? ROLE_VIEWS.viewer;
}

export function defaultViewForActor(actor) {
  return 'live';
}

export function viewLabel(view) { return LABELS[view] ?? view; }

export function canOpenView(actor, view) {
  const normalized = view === 'consequence' ? 'incidents' : view;
  return viewsForActor(actor).includes(normalized);
}
