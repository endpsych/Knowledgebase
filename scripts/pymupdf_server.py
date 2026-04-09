"""
scripts/pymupdf_server.py
--------------------------
Local HTTP server for PDF text extraction with streaming progress.
Supports PyMuPDF, pdfplumber, EasyOCR, Unstructured, and Docling.

Endpoints:
  GET  /ping   → { ok, parsers }
  POST /parse  → streams NDJSON: progress lines then final result
"""

import os
import platform
import shutil

# ─── Windows symlink fix ──────────────────────────────────────────────────────
# HuggingFace Hub uses symlinks in its model cache. Windows requires Developer
# Mode or admin rights to create symlinks. Patch os.symlink to fall back to
# hard links (no extra disk space) then copying as last resort.
if platform.system() == 'Windows':
    os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
    _original_symlink = os.symlink
    def _symlink_or_hardlink(src, dst, *args, **kwargs):
        try:
            _original_symlink(src, dst, *args, **kwargs)
        except OSError:
            if os.path.isdir(src):
                # Directories can't be hard-linked; use junction instead
                import subprocess
                try:
                    subprocess.run(
                        ['cmd', '/c', 'mklink', '/J', str(dst), str(src)],
                        check=True, capture_output=True,
                    )
                except Exception:
                    shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                # Hard link — same data on disk, zero extra space
                try:
                    os.link(src, dst)
                except OSError:
                    shutil.copy2(src, dst)
    os.symlink = _symlink_or_hardlink

import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handles each request in a separate thread so model loading doesn't block the server."""
    daemon_threads = True

# ─── Parser availability detection ────────────────────────────────────────────

try:
    import fitz
    PYMUPDF_VERSION = fitz.version[0]
except ImportError:
    fitz = None
    PYMUPDF_VERSION = None

try:
    import pdfplumber
    PDFPLUMBER_VERSION = pdfplumber.__version__
except ImportError:
    pdfplumber = None
    PDFPLUMBER_VERSION = None

try:
    import unstructured
    UNSTRUCTURED_VERSION = unstructured.__version__
except ImportError:
    unstructured = None
    UNSTRUCTURED_VERSION = None

try:
    import docling
    from importlib.metadata import version as _pkg_version
    DOCLING_VERSION = _pkg_version('docling')
except Exception:
    docling = None
    DOCLING_VERSION = None

try:
    import easyocr as _easyocr_module
    from importlib.metadata import version as _pkg_version2
    EASYOCR_VERSION = _pkg_version2('easyocr')
except Exception:
    _easyocr_module = None
    EASYOCR_VERSION = None

try:
    from markitdown import MarkItDown as _MarkItDown
    from importlib.metadata import version as _pkg_version3
    MARKITDOWN_VERSION = _pkg_version3('markitdown')
except Exception:
    _MarkItDown = None
    MARKITDOWN_VERSION = None

try:
    from llama_cloud.client import LlamaCloud as _LlamaCloud
    from importlib.metadata import version as _pkg_version4
    LLAMACLOUD_VERSION = _pkg_version4('llama-cloud')
except Exception:
    _LlamaCloud = None
    LLAMACLOUD_VERSION = None

PORT = 7432

# Singletons — created once on first use, reused across requests.
_docling_converter = None
_easyocr_reader    = None


# ─── Shared helpers ────────────────────────────────────────────────────────────

def _parse_custom_pages(spec, total):
    """Parse a page spec like '1-3, 5, 8-10' into 0-based indices.
    Page numbers in the spec are 1-based (user-facing).
    """
    pages = set()
    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, _, b = part.partition('-')
            try:
                lo = max(1, int(a.strip()))
                hi = min(total, int(b.strip()))
                pages.update(range(lo - 1, hi))
            except ValueError:
                pass
        else:
            try:
                n = int(part)
                if 1 <= n <= total:
                    pages.add(n - 1)
            except ValueError:
                pass
    return sorted(pages)


def _page_range(total, target, custom_pages=None):
    if custom_pages is not None:
        return _parse_custom_pages(custom_pages, total)
    if target == 'abstract':
        return list(range(0, min(2, total)))
    if target == 'references':
        return list(range(max(0, int(total * 0.65)), total))
    return list(range(total))


def _trim(text, target):
    if target == 'references':
        m = re.search(r'\b(references|bibliography|works cited|cited literature)\b', text, re.IGNORECASE)
        if m:
            return text[m.start():]
    elif target == 'abstract':
        m = re.search(r'\babstract\b', text, re.IGNORECASE)
        if m:
            return text[m.start():m.start() + 3000]
    return text


# ─── Streaming extractors (generators yielding progress then result) ──────────
# Each yields: { type: "progress", page, total, pagesTotal }
# Then finally: { type: "result", ok, text, pagesScanned, totalPages, chars, parser }

def extract_pymupdf(file_path, target, custom_pages=None):
    doc = fitz.open(file_path)
    total = len(doc)
    page_nums = _page_range(total, target, custom_pages)
    parts = []
    for idx, i in enumerate(page_nums):
        parts.append(f'[Page {i + 1}]\n{doc[i].get_text("text").strip()}')
        yield {'type': 'progress', 'page': idx + 1, 'total': len(page_nums), 'pagesTotal': total}
    doc.close()
    combined = _trim('\n\n'.join(parts), target) if custom_pages is None else '\n\n'.join(parts)
    yield {'type': 'result', 'ok': True, 'text': combined, 'pagesScanned': len(page_nums),
           'totalPages': total, 'chars': len(combined), 'parser': 'PyMuPDF'}


def extract_pdfplumber(file_path, target, custom_pages=None):
    with pdfplumber.open(file_path) as pdf:
        total = len(pdf.pages)
        page_nums = _page_range(total, target, custom_pages)
        parts = []
        for idx, i in enumerate(page_nums):
            parts.append(f'[Page {i + 1}]\n{(pdf.pages[i].extract_text() or "").strip()}')
            yield {'type': 'progress', 'page': idx + 1, 'total': len(page_nums), 'pagesTotal': total}
    combined = _trim('\n\n'.join(parts), target) if custom_pages is None else '\n\n'.join(parts)
    yield {'type': 'result', 'ok': True, 'text': combined, 'pagesScanned': len(page_nums),
           'totalPages': total, 'chars': len(combined), 'parser': 'pdfplumber'}


def extract_easyocr(file_path, target, custom_pages=None):
    global _easyocr_reader
    if _easyocr_reader is None:
        _easyocr_reader = _easyocr_module.Reader(['en'], gpu=False, verbose=False)

    import numpy as np

    doc = fitz.open(file_path)
    total = len(doc)
    page_nums = _page_range(total, target, custom_pages)

    parts = []
    for idx, i in enumerate(page_nums):
        page = doc[i]
        mat = fitz.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        results = _easyocr_reader.readtext(img, detail=0)
        text = '\n'.join(str(r) for r in results)
        parts.append(f'[Page {i + 1}]\n{text}')
        yield {'type': 'progress', 'page': idx + 1, 'total': len(page_nums), 'pagesTotal': total}
    doc.close()

    combined = _trim('\n\n'.join(parts), target) if custom_pages is None else '\n\n'.join(parts)
    yield {'type': 'result', 'ok': True, 'text': combined, 'pagesScanned': len(page_nums),
           'totalPages': total, 'chars': len(combined), 'parser': 'EasyOCR'}


def extract_unstructured(file_path, target, custom_pages=None):
    from unstructured.partition.pdf import partition_pdf
    yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0, 'status': 'Partitioning PDF…'}
    elements = partition_pdf(filename=file_path, strategy='fast')

    page_numbers = [getattr(e.metadata, 'page_number', None) for e in elements]
    total = max((p for p in page_numbers if p), default=0)

    if custom_pages is not None:
        allowed = set(_parse_custom_pages(custom_pages, total) + [p + 1 for p in _parse_custom_pages(custom_pages, total)])
        # page_number in unstructured is 1-based
        allowed_1based = set(p + 1 for p in _parse_custom_pages(custom_pages, total))
        filtered = [e for e in elements if (getattr(e.metadata, 'page_number', None) or 0) in allowed_1based]
    elif target == 'abstract':
        filtered = [e for e in elements if (getattr(e.metadata, 'page_number', 1) or 1) <= 2]
    elif target == 'references':
        filtered = []
        in_refs = False
        for e in elements:
            if not in_refs and re.search(r'\b(references|bibliography)\b', e.text or '', re.IGNORECASE):
                in_refs = True
            if in_refs:
                filtered.append(e)
        if not filtered:
            start_page = max(1, int(total * 0.65))
            filtered = [e for e in elements if (getattr(e.metadata, 'page_number', 1) or 1) >= start_page]
    else:
        filtered = elements

    text = '\n\n'.join(e.text for e in filtered if getattr(e, 'text', None))
    pages_scanned = len(set(getattr(e.metadata, 'page_number', None) for e in filtered) - {None})
    yield {'type': 'progress', 'page': 1, 'total': 1, 'pagesTotal': total}
    yield {'type': 'result', 'ok': True, 'text': text, 'pagesScanned': pages_scanned,
           'totalPages': total, 'chars': len(text), 'parser': 'Unstructured'}


def extract_docling(file_path, target, custom_pages=None, docling_format='markdown'):
    import sys, traceback
    global _docling_converter
    if _docling_converter is None:
        yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0, 'status': 'Loading Docling models…'}
        try:
            print('[Docling] Importing docling modules…', file=sys.stderr, flush=True)
            from docling.document_converter import DocumentConverter, PdfFormatOption
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.pipeline_options import PdfPipelineOptions, EasyOcrOptions

            pipeline_options = PdfPipelineOptions()
            pipeline_options.do_ocr = True
            pipeline_options.ocr_options = EasyOcrOptions(use_gpu=False)

            print('[Docling] Creating DocumentConverter…', file=sys.stderr, flush=True)
            _docling_converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
                }
            )
            print('[Docling] Converter ready.', file=sys.stderr, flush=True)
        except Exception as exc:
            print(f'[Docling] FAILED to init: {exc}', file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
            _docling_converter = None
            yield {'type': 'result', 'ok': False, 'error': f'Docling init failed: {exc}'}
            return

    yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0, 'status': 'Converting document…'}
    try:
        # Build page range limit for Docling if needed
        convert_kwargs = {}
        if custom_pages is not None or target in ('abstract', 'references'):
            # We need total pages first — open with fitz just for the count
            _doc_probe = fitz.open(file_path) if fitz else None
            total_pages = len(_doc_probe) if _doc_probe else 9999
            if _doc_probe:
                _doc_probe.close()
            if custom_pages is not None:
                page_nums = _parse_custom_pages(custom_pages, total_pages)
            else:
                page_nums = _page_range(total_pages, target)
            # Docling v2.80+ uses page_range=(start, end) — 1-based inclusive
            page_nums_sorted = sorted(page_nums)
            if page_nums_sorted:
                convert_kwargs['page_range'] = (page_nums_sorted[0] + 1, page_nums_sorted[-1] + 1)

        result = _docling_converter.convert(file_path, **convert_kwargs)
        doc = result.document
        total = len(doc.pages) if hasattr(doc, 'pages') else 0

        if docling_format == 'text':
            text = doc.export_to_text()
        elif docling_format == 'json':
            import json as _json
            text = _json.dumps(doc.export_to_dict(), indent=2, ensure_ascii=False)
        else:  # 'markdown' (default)
            text = doc.export_to_markdown()

        if custom_pages is None and docling_format != 'json':
            text = _trim(text, target)

        pages_scanned = len(page_nums) if (custom_pages is not None or target in ('abstract', 'references')) else total
        yield {'type': 'progress', 'page': 1, 'total': 1, 'pagesTotal': total}
        yield {'type': 'result', 'ok': True, 'text': text, 'pagesScanned': pages_scanned,
               'totalPages': total, 'chars': len(text), 'parser': 'Docling'}
    except Exception as exc:
        print(f'[Docling] Convert error: {exc}', file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        yield {'type': 'result', 'ok': False, 'error': f'Docling conversion failed: {exc}'}


def extract_markitdown(file_path, target, custom_pages=None):
    import sys, traceback
    yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0,
           'status': 'Converting with MarkItDown…'}
    try:
        md_converter = _MarkItDown()
        result = md_converter.convert(file_path)
        text = result.text_content or ''
        if custom_pages is None:
            text = _trim(text, target)
        yield {'type': 'result', 'ok': True, 'text': text,
               'pagesScanned': 0, 'totalPages': 0,
               'chars': len(text), 'parser': 'Markitdown'}
    except Exception as exc:
        print(f'[Markitdown] Error: {exc}', file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        yield {'type': 'result', 'ok': False, 'error': f'Markitdown failed: {exc}'}


def extract_llamaparse(file_path, target, custom_pages=None, llamaparse_format='markdown', llama_api_key=None):
    import sys, traceback, os, time, httpx
    api_key = llama_api_key or os.environ.get('LLAMA_CLOUD_API_KEY', '')
    if not api_key:
        yield {'type': 'result', 'ok': False, 'error': 'LlamaParse API key is not set. Click "API Key" in the parser controls to add it.'}
        return

    BASE = 'https://api.cloud.llamaindex.ai/api/v1/parsing'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Accept': 'application/json',
    }

    try:
        yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0, 'status': 'Uploading to LlamaParse cloud…'}

        # Build form data
        form_data = {}
        if custom_pages is not None:
            form_data['target_pages'] = custom_pages
        elif target == 'abstract':
            form_data['target_pages'] = '0,1'
        elif target == 'references':
            _probe = fitz.open(file_path) if fitz else None
            if _probe:
                total = len(_probe)
                _probe.close()
                start = max(0, int(total * 0.65))
                form_data['target_pages'] = ','.join(str(i) for i in range(start, total))

        print(f'[LlamaParse] Uploading {os.path.basename(file_path)} ...', file=sys.stderr, flush=True)
        with open(file_path, 'rb') as f:
            upload_resp = httpx.post(
                f'{BASE}/upload',
                headers=headers,
                files={'file': (os.path.basename(file_path), f)},
                data=form_data,
                timeout=120,
            )
        if upload_resp.status_code != 200:
            yield {'type': 'result', 'ok': False, 'error': f'LlamaParse upload failed ({upload_resp.status_code}): {upload_resp.text[:300]}'}
            return
        job = upload_resp.json()
        job_id = job.get('id')
        print(f'[LlamaParse] Job created: {job_id} (status={job.get("status")})', file=sys.stderr, flush=True)

        # Poll until complete
        yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0, 'status': 'Parsing in cloud…'}
        poll_count = 0
        while True:
            status_resp = httpx.get(f'{BASE}/job/{job_id}', headers=headers, timeout=30)
            status = status_resp.json()
            st = status.get('status', '')
            print(f'[LlamaParse] Poll #{poll_count}: status={st}', file=sys.stderr, flush=True)
            if st == 'SUCCESS' or st == 'PARTIAL_SUCCESS':
                break
            if st == 'ERROR':
                err_msg = status.get('error_message') or 'unknown error'
                yield {'type': 'result', 'ok': False, 'error': f'LlamaParse API error: {err_msg}'}
                return
            if st == 'CANCELLED':
                yield {'type': 'result', 'ok': False, 'error': 'LlamaParse job was cancelled.'}
                return
            poll_count += 1
            if poll_count > 150:
                yield {'type': 'result', 'ok': False, 'error': 'LlamaParse timed out after 5 minutes.'}
                return
            time.sleep(2)

        # Fetch result
        yield {'type': 'progress', 'page': 0, 'total': 1, 'pagesTotal': 0, 'status': 'Downloading result…'}
        result_type = 'text' if llamaparse_format == 'text' else 'markdown'
        result_resp = httpx.get(
            f'{BASE}/job/{job_id}/result/{result_type}',
            headers=headers,
            timeout=60,
        )
        if result_resp.status_code != 200:
            yield {'type': 'result', 'ok': False, 'error': f'LlamaParse result fetch failed ({result_resp.status_code}): {result_resp.text[:300]}'}
            return
        result_data = result_resp.json()
        text = result_data.get(result_type, '') or ''

        print(f'[LlamaParse] Got {len(text)} chars', file=sys.stderr, flush=True)
        preview = text[:200].replace('\n', ' ')
        print(f'[LlamaParse] Preview: {repr(preview)}', file=sys.stderr, flush=True)

        if not text.strip():
            yield {'type': 'result', 'ok': False, 'error': 'LlamaParse returned empty text. The document may be password-protected or in an unsupported format.'}
            return

        if custom_pages is None:
            text = _trim(text, target)

        yield {'type': 'progress', 'page': 1, 'total': 1, 'pagesTotal': 0}
        yield {'type': 'result', 'ok': True, 'text': text,
               'pagesScanned': 0, 'totalPages': 0,
               'chars': len(text), 'parser': 'LlamaParse'}
    except Exception as exc:
        print(f'[LlamaParse] Error: {exc}', file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        yield {'type': 'result', 'ok': False, 'error': f'LlamaParse failed: {exc}'}


# ─── Parser registry ──────────────────────────────────────────────────────────

EXTRACTORS = {
    'pymupdf':      (fitz,             extract_pymupdf,      'PyMuPDF',      PYMUPDF_VERSION),
    'pdfplumber':   (pdfplumber,       extract_pdfplumber,   'pdfplumber',   PDFPLUMBER_VERSION),
    'easyocr':      (_easyocr_module,  extract_easyocr,      'EasyOCR',      EASYOCR_VERSION),
    'unstructured': (unstructured,     extract_unstructured, 'Unstructured', UNSTRUCTURED_VERSION),
    'docling':      (docling,          extract_docling,      'Docling',      DOCLING_VERSION),
    'markitdown':   (_MarkItDown,           extract_markitdown,   'Markitdown',   MARKITDOWN_VERSION),
    'llamaparse':   (_LlamaCloud,           extract_llamaparse,   'LlamaParse',   LLAMACLOUD_VERSION),
}


# ─── HTTP handler ─────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        import sys
        print(f'[HTTP] {fmt % args}', file=sys.stderr, flush=True)

    def _send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _send_line(self, data):
        self.wfile.write((json.dumps(data) + '\n').encode())
        self.wfile.flush()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/ping':
            self._send_json(200, {
                'ok': True,
                'parsers': {
                    pid: {'available': lib is not None, 'version': ver}
                    for pid, (lib, _, __, ver) in EXTRACTORS.items()
                },
            })
        elif self.path.startswith('/detect'):
            from urllib.parse import urlparse, parse_qs
            params = parse_qs(urlparse(self.path).query)
            file_path = params.get('filePath', [None])[0]
            if not file_path:
                self._send_json(400, {'ok': False, 'error': 'filePath is required'})
                return

            ext = os.path.splitext(file_path)[1].lower()

            # ── Non-PDF formats → recommend Markitdown ──────────────────────
            office_exts = {
                '.docx': 'DOCX', '.doc': 'DOC', '.pptx': 'PPTX', '.ppt': 'PPT',
                '.xlsx': 'XLSX', '.xls': 'XLS',
                '.html': 'HTML', '.htm': 'HTML',
                '.csv': 'CSV', '.tsv': 'TSV',
                '.rtf': 'RTF', '.epub': 'EPUB',
            }
            if ext in office_exts:
                fmt = office_exts[ext]
                has_md = _MarkItDown is not None
                self._send_json(200, {
                    'ok': True, 'type': 'office', 'format': fmt,
                    'recommendation': 'markitdown' if has_md else 'pymupdf',
                    'reason': f'{fmt} document — Markitdown converts to structured Markdown'
                              if has_md else f'{fmt} document — install markitdown for best results',
                    'alt': None, 'altReason': None,
                    'totalPages': 0, 'samplePages': 0, 'avgCharsPerPage': 0,
                    'avgImagesPerPage': 0, 'pagesWithText': 0, 'pagesScanned': 0,
                    'textRatio': 0, 'pageStats': [],
                })
                return

            # ── PDF analysis ────────────────────────────────────────────────
            if fitz is None:
                self._send_json(503, {'ok': False, 'error': 'PyMuPDF not available'})
                return

            try:
                doc = fitz.open(file_path)
                total = len(doc)

                # Sample pages from beginning, middle, and end of the document
                indices = set()
                for i in range(min(3, total)):
                    indices.add(i)
                mid = total // 2
                for i in range(max(0, mid - 1), min(total, mid + 2)):
                    indices.add(i)
                for i in range(max(0, total - 3), total):
                    indices.add(i)
                indices = sorted(indices)

                page_stats = []
                for i in indices:
                    page = doc[i]
                    text = page.get_text('text').strip()
                    chars = len(text)
                    images = page.get_images(full=True)
                    page_stats.append({
                        'page': i + 1,
                        'chars': chars,
                        'images': len(images),
                        'hasText': chars > 50,
                    })
                doc.close()

                n = len(page_stats)
                total_chars = sum(p['chars'] for p in page_stats)
                total_images = sum(p['images'] for p in page_stats)
                avg_chars = total_chars / n if n else 0
                avg_images = total_images / n if n else 0
                pages_with_text = sum(1 for p in page_stats if p['hasText'])
                pages_without = n - pages_with_text
                text_ratio = pages_with_text / n if n else 0

                # ── Classification ──────────────────────────────────────────
                if text_ratio >= 0.85:
                    pdf_type = 'text'
                elif text_ratio <= 0.15:
                    pdf_type = 'scanned'
                else:
                    pdf_type = 'mixed'

                # ── Recommendation logic ────────────────────────────────────
                if pdf_type == 'text':
                    recommendation = 'pymupdf'
                    reason = 'Text-layer PDF — direct extraction is fast and accurate'
                    alt = 'pdfplumber'
                    alt_reason = 'Better for documents with dense tables or complex columns'
                elif pdf_type == 'scanned':
                    recommendation = 'easyocr'
                    reason = 'Scanned PDF — OCR needed to read text from page images'
                    alt = 'docling'
                    alt_reason = 'ML layout analysis — slower but better structure understanding'
                else:
                    recommendation = 'unstructured'
                    reason = 'Mixed PDF — ML parser handles both text and scanned pages'
                    alt = 'docling'
                    alt_reason = 'Layout-aware ML — good at mixed content with complex structure'

                self._send_json(200, {
                    'ok': True, 'type': pdf_type,
                    'recommendation': recommendation, 'reason': reason,
                    'alt': alt, 'altReason': alt_reason,
                    'totalPages': total, 'samplePages': n,
                    'avgCharsPerPage': round(avg_chars),
                    'avgImagesPerPage': round(avg_images, 1),
                    'pagesWithText': pages_with_text,
                    'pagesScanned': pages_without,
                    'textRatio': round(text_ratio, 2),
                    'pageStats': page_stats,
                })
            except Exception as exc:
                self._send_json(500, {'ok': False, 'error': str(exc)})
        else:
            self._send_json(404, {'ok': False, 'error': 'Not found'})

    def do_POST(self):
        if self.path != '/parse':
            self._send_json(404, {'ok': False, 'error': 'Not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            file_path    = body.get('filePath')
            target       = body.get('target', 'full-text')
            parser_id    = body.get('parser', 'pymupdf')
            custom_pages    = body.get('customPages') or None   # e.g. "1-3, 5"
            docling_format      = body.get('doclingFormat', 'markdown')      # 'markdown'|'text'|'json'
            llamaparse_format   = body.get('llamaparseFormat', 'markdown')  # 'markdown'|'text'
            llama_api_key       = body.get('llamaApiKey') or None
            if not file_path:
                self._send_json(400, {'ok': False, 'error': 'filePath is required'})
                return
            entry = EXTRACTORS.get(parser_id)
            if entry is None:
                self._send_json(400, {'ok': False, 'error': f'Unknown parser: {parser_id}'})
                return
            lib, fn, name, _ = entry
            if lib is None:
                self._send_json(500, {'ok': False, 'error': f'{name} is not installed in this environment'})
                return

            # Stream NDJSON: progress lines then final result
            self.send_response(200)
            self.send_header('Content-Type', 'application/x-ndjson')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if parser_id == 'docling':
                extra_kwargs = {'docling_format': docling_format}
            elif parser_id == 'llamaparse':
                extra_kwargs = {'llamaparse_format': llamaparse_format}
                if llama_api_key:
                    extra_kwargs['llama_api_key'] = llama_api_key
            else:
                extra_kwargs = {}
            for msg in fn(file_path, target, custom_pages, **extra_kwargs):
                self._send_line(msg)

        except Exception as exc:
            # If headers already sent, stream the error; otherwise send JSON
            try:
                self._send_line({'type': 'result', 'ok': False, 'error': str(exc)})
            except Exception:
                self._send_json(500, {'ok': False, 'error': str(exc)})


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == '__main__':
    available = [pid for pid, (lib, *_) in EXTRACTORS.items() if lib is not None]
    if not available:
        print('ERROR: No parsers available. Install at least one of: pymupdf, pdfplumber, unstructured, docling', flush=True)
        raise SystemExit(1)
    server = ThreadedHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Parser server on http://127.0.0.1:{PORT}  —  available: {", ".join(available)}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()
