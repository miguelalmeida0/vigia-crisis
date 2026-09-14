"""Bounded, non-executing PDF text extraction. Requires pypdf in the configured Python."""
import sys
from pathlib import Path
from pypdf import PdfReader

source,output=sys.argv[1:3]
plan=len(sys.argv)>3 and sys.argv[3]=='registered-municipal-plan'
if Path(source).stat().st_size>(20_000_000 if plan else 5_000_000):
    raise ValueError('source_size_limit')
reader=PdfReader(source,strict=True)
if reader.is_encrypted:
    raise ValueError('encrypted_pdf_requires_unencrypted_source_copy')
if len(reader.pages)>(300 if plan else 100):
    raise ValueError('pdf_page_limit')
parts=[]
for page in reader.pages:
    parts.append(page.extract_text() or '')
    if sum(len(p) for p in parts)>2_000_000:
        raise ValueError('document_text_limit')
Path(output).write_text('\n\f\n'.join(parts),encoding='utf-8')
