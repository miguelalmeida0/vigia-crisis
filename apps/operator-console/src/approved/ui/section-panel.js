import {e, panel as basePanel} from './html.js';
import {icon} from './signal-icons.js';

// Reference A uses a colored section icon; the other routes retain their headers.
export function panel(title, body, {ico='', iconTone='blue', ...options}={}) {
 if(!ico)return basePanel(title,body,options);
 const {action='',cls='',sub=''}=options;
 return `<section class="panel ${cls}"><header class="panel-head"><div class="panel-title-with-icon"><span class="section-icon ${e(iconTone)}">${icon(ico)}</span><div><h2>${e(title)}</h2>${sub?`<p>${e(sub)}</p>`:''}</div></div>${action}</header>${body}</section>`;
}
