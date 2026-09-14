export const SOURCE_DEFINITIONS = Object.freeze({
  fires: {
    label: 'Active civil-protection occurrences',
    origin: 'ANEPC-derived records through Fogos.pt and api.ptdata.org',
    cadence: 'approximately 2 minutes',
    staleAfterSeconds: 10 * 60,
    authority: 'public operational report',
    url: 'https://api.ptdata.org/v1/civil-protection/occurrences/active'
  },
  riskToday: {
    label: 'Municipal rural-fire danger · today',
    origin: 'IPMA RCM through api.ptdata.org',
    cadence: 'up to every 6 hours',
    staleAfterSeconds: 12 * 60 * 60,
    authority: 'official forecast',
    url: 'https://api.ptdata.org/v1/civil-protection/risk?day=today'
  },
  riskTomorrow: {
    label: 'Municipal rural-fire danger · tomorrow',
    origin: 'IPMA RCM through api.ptdata.org',
    cadence: 'up to every 6 hours',
    staleAfterSeconds: 12 * 60 * 60,
    authority: 'official forecast',
    url: 'https://api.ptdata.org/v1/civil-protection/risk?day=tomorrow'
  },
  weather: {
    label: 'Meteorological station observations',
    origin: 'IPMA through api.ptdata.org',
    cadence: 'hourly',
    staleAfterSeconds: 3 * 60 * 60,
    authority: 'official station observation',
    url: 'https://api.ptdata.org/v1/weather/observations?limit=500'
  },
  ipmaWeather: {
    label: 'Direct meteorological station observations',
    origin: 'IPMA Open Data',
    cadence: 'hourly',
    staleAfterSeconds: 3 * 60 * 60,
    authority: 'official station observation',
    accessClass: 'PUBLIC_NO_AUTH',
    url: 'https://api.ipma.pt/open-data/observation/meteorology/stations/obs-surface.geojson'
  },
  warnings: {
    label: 'Meteorological warnings',
    origin: 'IPMA through api.ptdata.org',
    cadence: 'event-driven',
    staleAfterSeconds: 6 * 60 * 60,
    authority: 'official warning',
    url: 'https://api.ptdata.org/v1/weather/warnings'
  },
  ipmaWarnings: {
    label: 'Direct meteorological warnings',
    origin: 'IPMA Open Data',
    cadence: 'event-driven',
    staleAfterSeconds: 6 * 60 * 60,
    authority: 'official meteorological warning',
    accessClass: 'PUBLIC_NO_AUTH',
    url: 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json'
  },
  history: {
    label: 'Historical rural-fire records',
    origin: 'ICNF SGIF through api.ptdata.org',
    cadence: 'periodic archive sync',
    staleAfterSeconds: 7 * 24 * 60 * 60,
    authority: 'official archive',
    url: 'https://api.ptdata.org/v1/civil-protection/fires'
  },
  copernicus: {
    label: 'Sentinel-2 acquisition catalogue',
    origin: 'Copernicus Data Space Ecosystem STAC',
    cadence: 'catalogue ingestion follows satellite delivery',
    staleAfterSeconds: 48 * 60 * 60,
    authority: 'Earth-observation catalogue metadata',
    url: 'https://stac.dataspace.copernicus.eu/v1/'
  },
  firms: {
    label: 'VIIRS active-fire detections',
    origin: 'NASA FIRMS',
    cadence: 'near-real-time; service updated frequently',
    staleAfterSeconds: 6 * 60 * 60,
    authority: 'satellite thermal detection',
    url: 'https://firms.modaps.eosdis.nasa.gov/api/'
  },
  thermal: {
    label: 'Meteosat Fire Radiative Power layer',
    origin: 'IPMA / EUMETSAT LSA SAF',
    cadence: 'MTG 10-minute preferred; MSG 15-minute fallback',
    staleAfterSeconds: 90 * 60,
    authority: 'geostationary satellite thermal context',
    url: 'https://adaguc.lsasvcs.ipma.pt/adaguc-server?DATASET=MTG-FRP'
  }
});

export function emptySource(id) {
  const definition = SOURCE_DEFINITIONS[id];
  return {
    id,
    ...definition,
    state: id === 'firms' ? 'not_configured' : 'unavailable',
    fetchedAt: null,
    upstreamAt: null,
    error: id === 'firms' ? 'NASA_FIRMS_MAP_KEY is not configured.' : 'Not fetched yet.'
  };
}
