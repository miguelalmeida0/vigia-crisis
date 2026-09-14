import { AtlasMap } from '../../map/atlas-map.js';
import { buildMapData } from './map-data.js';

function mapMode(view) { return view === 'live' ? 'live' : view === 'replay' ? 'replay' : view === 'incidents' ? 'detect' : view === 'outcomes' || view === 'field' || view === 'command' || view === 'observe' ? 'command' : 'respond'; }
export class GroundTruthMap {
  constructor(container, { onSelect }) { this.impl = new AtlasMap(container, { onSelect }); }
  update(state) { this.impl.setData(buildMapData(state)); this.impl.setMode(state.view === 'consequence' ? 'respond' : mapMode(state.view)); }
  flyTo(coordinate, zoom = 9.8) { this.impl.flyTo(coordinate, zoom); }
  home() { this.impl.home(); }
  zoomIn() { this.impl.zoomIn(); }
  zoomOut() { this.impl.zoomOut(); }
  destroy() { this.impl.destroy(); }
}
