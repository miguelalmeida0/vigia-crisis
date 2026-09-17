from pathlib import Path
import json,shutil,hashlib
from PIL import Image,ImageChops,ImageStat
root=Path(__file__).resolve().parents[1]
captures=Path('/Users/malmeida/docs/internal/automation/codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259/mega-iii-iv')
out=root/'docs/handoffs/mega-iii-iv/visual';out.mkdir(exist_ok=True)
for p in captures.glob('*.png'):
 if p.name!='failure.png':shutil.copy2(p,out/p.name)
for name in ['ui-qa.json','ui-focus.json','document-ui.json']:
 p=captures/name
 if p.exists():shutil.copy2(p,out/name)
refs={
 'command-overview':root/'DESIGN_SOURCE_OF_TRUTH/01-command-overview.png',
 'incidents':root/'DESIGN_SOURCE_OF_TRUTH/02-incidents.png',
 'incident-detail':root/'DESIGN_SOURCE_OF_TRUTH/06-incident-detail.png',
 'fire-activity':Path('/Users/malmeida/Downloads/ChatGPT Image Sep 8, 2026, 05_53_32 PM (1).png'),
 'response-access':Path('/Users/malmeida/Downloads/ChatGPT Image Sep 8, 2026, 05_53_50 PM.png')}
rows=[]
for route,reference in refs.items():
 image=Image.open(out/(route+'-1672.png')).convert('RGB');ref=Image.open(reference).convert('RGB')
 directory=out/(route+'-comparison');directory.mkdir(exist_ok=True);shutil.copy2(reference,directory/'reference.png');image.save(directory/'runtime.png')
 native=ref.size==image.size
 if not native:ref=ref.resize(image.size)
 diff=ImageChops.difference(ref,image);Image.blend(ref,image,.5).save(directory/'overlay.png');diff.save(directory/'difference.png')
 rows.append({'route':route,'reference':str(reference),'sameNativeViewport':native,'meanAbsoluteRgbDifference':sum(ImageStat.Stat(diff).mean)/3,'comparisonPurpose':'Diagnostic visual-language comparison. Later approved route recomposition supersedes earlier page anatomy. Not a pixel-parity certification.'})
rows.append({'route':'national-awareness','runtime':'national-awareness-1672.png','reference':'docs/internal/automation/impeccable/surfaces/rator-console-src-approved-routes-fire-activity-js.md','state':'TEXT_COMPOSITION_CONTRACT_ONLY','reason':'The retained six-raster pack contains an old Evidence view, not the current National Awareness anatomy. No matching approved national raster was fabricated.'})
(out/'reference-comparisons.json').write_text(json.dumps(rows,indent=2))
print(json.dumps({'diagnosticImageComparisons':len(refs),'nationalRasterParity':'NOT_CERTIFIED'}))
