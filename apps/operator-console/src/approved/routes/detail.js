import { AnswerRow } from '../ui/operator-answers.js';
import { EnvironmentalConditionsStrip } from '../ui/signals.js';
import {icon} from '../ui/icons.js';
import {button,link,panel,empty} from '../ui/html.js';
import {mapView} from '../ui/map.js';
import {incidentFor,isLimited} from '../data/model.js';
import {OperationalSlot} from '../ui/operational-picture.js';

export function detail(state){const i=incidentFor(state),limited=isLimited(state);if(!i)return empty('Incident not found','The selected record is not available in the authenticated scope.',button('Browse incidents','navigate',{extra:'data-route="incidents"'}));
 const situation=AnswerRow(state,'fire','Latest fire signal')+AnswerRow(state,'official','Official status')+AnswerRow(state,'warnings','Applicable warnings');
 const changes=AnswerRow(state,'changes','Latest meaningful change'),exposure=AnswerRow(state,'exposure','Places and assets');
 return `<div class="route-stack"><div class="incident-context detail-toolbar">${button('Operational Picture','operational-picture',{tone:'primary'})}${button('Brief me','ask-vigia',{extra:'data-question="Brief me"'})}${button('Ask Vigia','ask-vigia')}${button('Change incident','choose-incident',{ico:'down'})}</div>
 ${EnvironmentalConditionsStrip(state,"Current conditions")}
 <div class="detail-primary">${panel('Incident location',`<div class="detail-map-pad">${mapView({state,id:'detail-map',title:i.name,height:326,limited})}</div>`,{action:button('Expand incident map','expand-map',{ico:'expand',tone:'icon-button',extra:'data-kind="local"'})})}
 <div class="detail-findings">${OperationalSlot()}${situation?panel('Fire and official information',situation):''}
 ${panel('Next attention',AnswerRow(state,'roads','Road access')+AnswerRow(state,'attention','Investigate next')+`<div class="detail-actions">${button('Fire activity','navigate',{tone:'soft-blue',extra:'data-route="intelligence"'})}${button('Response & access','navigate',{tone:'primary',ico:'arrow',extra:'data-route="operations"'})}</div>`)}</div></div>
 <div class="detail-secondary">${changes?panel('What changed',changes,{action:button('What matters now','ask-vigia',{extra:'data-question="What matters now?"'})}):''}${exposure?panel('Nearby places and assets',exposure):''}<div class="detail-history-link">${link('View physical history','incident-history')}</div></div></div>`;
}
