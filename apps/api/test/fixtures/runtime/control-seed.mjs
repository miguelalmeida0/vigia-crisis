export function createControlSeed(now = new Date().toISOString()) {
  return {
    organizations: [{ id: 'org-portugal-pilot', name: 'Portugal Wildfire Resilience Pilot', plan: 'pilot', createdAt: now }],
    workspaces: [{ id: 'ws-centre-pilot', organizationId: 'org-portugal-pilot', name: 'Central Portugal Pilot', territoryIds: ['territory-centre'], createdAt: now }],
    territories: [{ id: 'territory-centre', workspaceId: 'ws-centre-pilot', name: 'Central Portugal', bbox: [-9.2, 38.5, -6.7, 41.2], areaKm2: 14_800, createdAt: now }],
    actors: [
      { id: 'actor-supervisor', tenantId: 'org-portugal-pilot', workspaceId: 'ws-centre-pilot', name: 'Ana Martins', role: 'supervisor', title: 'Wildfire Operations Supervisor' },
      { id: 'actor-analyst', tenantId: 'org-portugal-pilot', workspaceId: 'ws-centre-pilot', name: 'Rui Costa', role: 'analyst', title: 'Geospatial Risk Analyst' },
      { id: 'actor-field', tenantId: 'org-portugal-pilot', workspaceId: 'ws-centre-pilot', name: 'Marta Silva', role: 'field_inspector', title: 'Field Verification Lead' },
      { id: 'actor-viewer', tenantId: 'org-portugal-pilot', workspaceId: 'ws-centre-pilot', name: 'Executive Viewer', role: 'viewer', title: 'Pilot Sponsor' }
    ]
  };
}
