import { createGroundTruthApp } from './v2/app/app.js';
import { certifyBrowserRelease,renderReleaseFailure } from './v2/release-compatibility.js';

const root=document.querySelector('#app'),release=await certifyBrowserRelease();
globalThis.__VIGIA_RELEASE__=release;
document.documentElement.dataset.releaseId=release.web?.releaseId??'incompatible';
const releaseBadge=document.querySelector('[data-release-badge]');
if(releaseBadge){releaseBadge.textContent=release.compatible?release.web.releaseId:'INCOMPATIBLE RELEASE';releaseBadge.dataset.state=release.compatible?'current':'incompatible';}
if(release.compatible){createGroundTruthApp(root);await Promise.all([import('./v2/avoidance-runtime.js'),import('./v2/fieldnet-runtime.js'),import('./v2/fireground/runtime.js')]);}
else renderReleaseFailure(root,release);
