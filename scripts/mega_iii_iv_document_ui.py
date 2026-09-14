from pathlib import Path
prefix=Path('/workspace/scripts/mega_iii_iv_ui_qa.py').read_text().split(' for width,height in')[0].replace("OUT/'ui-qa.json'","OUT/'document-ui.json'")
exec(prefix+'''
 report['lane']='CONTROLLED_DOCUMENT_UI_WITH_REAL_TEMPORARY_POSTGRES_EXTRACTION';report['operationalWrites']=0
 extraction=json.loads((ROOT/'docs/handoffs/mega-iii-iv/postgres-proof.json').read_text())['extraction']
 doc={'id':'controlled-document-ui','filename':'CONTROLLED TEST — municipal passage.html','knownAt':'2026-09-12T12:00:00Z',**extraction}
 def upload(route):route.fulfill(status=201,content_type='application/json',body=json.dumps(doc))
 def review(route):
  body=route.request.post_data_json;report['reviewRequest']=body;route.fulfill(status=201,content_type='application/json',body=json.dumps({'decision':body['decision'],'candidateId':body['candidateId']}))
 page.route('**/situation/documents',upload);page.route('**/situation/documents/*/review',review)
 for width,height in [(1672,941),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.goto(ORIGIN+'/#/incident-detail?id=incident%3APT-2026-01F7E2E21A');wait_dom('()=>[\"READY\",\"STALE\",\"DEGRADED\"].includes(document.querySelector(\"main\")?.dataset.routeProjectionState)');page.get_by_role('button',name='Ask Vigia',exact=True).click();page.locator('[data-mode="document"]').click();page.wait_for_selector('[name="source-file"]');page.locator('[name="source-file"]').set_input_files({'name':'controlled-notice.html','mimeType':'text/html','buffer':extraction['text'].encode()});page.get_by_role('button',name='Extract candidate facts',exact=True).click();page.wait_for_selector('.situation-candidate blockquote');assert page.locator('.situation-candidate blockquote').first.inner_text()==doc['candidates'][0]['sourceText'];shot('document-review-'+str(width));page.get_by_role('button',name='Reject',exact=True).click();wait_dom('()=>document.querySelector("[data-situation-output]")?.textContent.includes("Candidate rejected")');shot('document-rejected-'+str(width));page.keyboard.press('Escape')
 report['browser']=browser.version;(OUT/'document-ui.json').write_text(json.dumps(report,indent=2));browser.close()
server.shutdown()
''')
