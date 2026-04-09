/* """
src/pages/knowledge-base/IngestionPipelineTab.jsx
--------------------------------------------------
Ingestion Pipeline tab — configure and audit the KB ingestion pipeline.
Eight sections: document parsers, chunking strategy, entity extraction,
metadata enrichment, deduplication, knowledge extraction, provenance
tagging, and a live readiness score card.
""" */

import { useState, useMemo, useEffect, useRef } from 'react';
import { pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Workflow, FileInput, Scissors, Cpu, Tag,
  Copy, Lightbulb, Fingerprint, Settings2, Download, BookmarkPlus, Table2, Palette,
  CheckCircle2, AlertCircle, Circle,
  Plus, Edit2, Trash2, X, ChevronDown, ChevronRight,
  Highlighter, BookMarked, CalendarDays, GitFork, Zap,
  FileUp, ScanLine, FileText,
} from 'lucide-react';

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACC = '#fb923c'; // orange-400
const cr  = (a) => `rgba(251,146,60,${a})`;

// ─── Static option lists ──────────────────────────────────────────────────────

const PARSER_LIBRARIES = [
  'PyMuPDF', 'pdfplumber', 'python-docx', 'BeautifulSoup',
  'Unstructured.io', 'LlamaParse', 'Docling', 'Markitdown', 'Custom',
];

const SUPPORTED_FORMATS = [
  'PDF', 'DOCX', 'XLSX', 'PPTX', 'HTML', 'Markdown',
  'TXT', 'JSON', 'XML', 'CSV', 'RTF', 'Email',
];

const PARSER_STATUSES = [
  { value: 'configured', label: 'Configured', color: '#fbbf24' },
  { value: 'active',     label: 'Active',     color: '#34d399' },
  { value: 'disabled',   label: 'Disabled',   color: '#64748b' },
];

// ─── Built-in parsers (always available, no setup required) ───────────────────

const BUILTIN_PARSERS = [
  {
    id:          'pdfjs',
    name:        'PDF.js',
    tag:         'Built-in',
    type:        'client-side',
    formats:     ['PDF'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://mozilla.github.io/pdf.js/',
    description: 'Mozilla\'s PDF.js library, running entirely in-browser. Reads the embedded text layer from digitally-created PDFs — no server, no install, instant results.',
    inputType:   'text',
    outputFormat:'plain',
    method:      'Text layer',
    speed:       'fast',
    bestFor:     'Quick extraction from standard digital PDFs when no server is available.',
    strengths:   ['Zero setup — works out of the box', 'No server or Python needed', 'Fast — runs client-side in Electron', 'Handles most machine-readable PDFs well'],
    limitations: ['Cannot read scanned/image-only PDFs', 'No table structure detection', 'May scramble multi-column layouts', 'No heading or section classification'],
    tech:        'pdf.js (Mozilla) · client-side JavaScript · reads PDF text operators directly',
  },
  {
    id:          'pymupdf',
    name:        'PyMuPDF',
    tag:         'Local server',
    type:        'local-server',
    formats:     ['PDF'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://pymupdf.readthedocs.io/',
    description: 'High-performance text extraction via the MuPDF C library (Python binding: fitz). Faster and more accurate than PDF.js for complex layouts, ligatures, and Unicode-heavy documents.',
    inputType:   'text',
    outputFormat:'plain',
    method:      'Text layer',
    speed:       'fast',
    bestFor:     'Primary parser for text-layer PDFs. Best overall speed and accuracy for standard academic papers.',
    strengths:   ['Very fast — native C library', 'Accurate Unicode and ligature handling', 'Good reading order heuristics', 'Supports page-range extraction'],
    limitations: ['Cannot read scanned/image-only pages', 'No table structure detection', 'Multi-column reading order can occasionally split', 'Requires Python server running'],
    tech:        'PyMuPDF (fitz) · C/Python · server on port 7432 · streams progress via NDJSON',
  },
  {
    id:          'pdfplumber',
    name:        'pdfplumber',
    tag:         'Local server',
    type:        'local-server',
    formats:     ['PDF'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://github.com/jsvine/pdfplumber',
    description: 'Table-aware PDF extraction built on pdfminer.six. Analyzes character positioning to detect rows, columns, and cell boundaries — the best choice when your document contains dense tables.',
    inputType:   'text',
    outputFormat:'plain',
    method:      'Text layer',
    speed:       'medium',
    bestFor:     'Documents with tables, multi-column layouts, or precise spatial text positioning.',
    strengths:   ['Excellent table detection and cell alignment', 'Fine-grained character-level positioning data', 'Good for multi-column scientific papers', 'Preserves spatial layout of structured content'],
    limitations: ['Cannot read scanned/image-only pages', 'Slower than PyMuPDF on large documents', 'May over-segment free-flowing text', 'No semantic classification of content types'],
    tech:        'pdfplumber · Python (pdfminer.six engine) · character-level bounding boxes · table detection heuristics',
  },
  {
    id:          'easyocr',
    name:        'EasyOCR',
    tag:         'Local server · OCR',
    type:        'local-server',
    formats:     ['PDF'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://github.com/JaidedAI/EasyOCR',
    description: 'Optical Character Recognition pipeline: renders each page as a high-res image via PyMuPDF, then uses a CRNN+Attention neural network to recognize text from pixels. Essential for scanned PDFs.',
    inputType:   'scanned',
    outputFormat:'plain',
    method:      'OCR',
    speed:       'slow',
    bestFor:     'Scanned PDFs, photographed documents, or any PDF where text is embedded as images.',
    strengths:   ['Reads text from images — works on scanned documents', 'Supports 80+ languages', 'GPU-acceleratable (CUDA)', 'Handles rotated or noisy scans reasonably well'],
    limitations: ['Slow — renders pages then runs neural net per page', 'Accuracy drops on low-res or heavily degraded scans', 'No structural understanding (headings, tables, etc.)', 'First run downloads ~100 MB of model weights', 'Can hallucinate characters on noisy backgrounds'],
    tech:        'EasyOCR · PyTorch CRNN+Attention · page rendering via PyMuPDF (300 DPI) · per-page OCR inference',
  },
  {
    id:          'unstructured',
    name:        'Unstructured',
    tag:         'Local server · ML',
    type:        'local-server',
    formats:     ['PDF'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://unstructured.io/',
    description: 'Element-aware extraction that classifies every block of content into semantic types: Title, NarrativeText, Table, ListItem, Header, Footer, Image, Formula, and more. Handles both text-layer and scanned PDFs.',
    inputType:   'any',
    outputFormat:'plain',
    method:      'ML elements',
    speed:       'slow',
    bestFor:     'Mixed PDFs (text + scanned) where you need content classification, or when you want clean separation of titles, text, and tables.',
    strengths:   ['Handles both text and scanned pages automatically', 'Classifies content types (Title, Table, List, etc.)', 'Good at filtering out headers, footers, and page numbers', 'Extensible partition strategies (fast, hi-res, OCR-only)'],
    limitations: ['Slow — multiple ML inference passes', 'Large dependency footprint (~500 MB+)', 'Element boundaries can be noisy on complex layouts', 'Table reconstruction less precise than pdfplumber', 'May require specific partition strategy tuning'],
    tech:        'unstructured · Python · detectron2/YOLOX layout model · tesseract/paddle OCR fallback · element classification pipeline',
  },
  {
    id:          'docling',
    name:        'Docling',
    tag:         'Local server · ML',
    type:        'local-server',
    formats:     ['PDF'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://github.com/DS4SD/docling',
    description: 'IBM\'s deep-learning document understanding pipeline. Uses a layout analysis model (DocLayNet) plus a table structure recognition model to produce the highest-fidelity structural output — headings, tables, reading order, and figure captions preserved as Markdown.',
    inputType:   'any',
    outputFormat:'markdown',
    method:      'ML layout',
    speed:       'slow',
    bestFor:     'Complex academic papers with figures, tables, and multi-level headings where preserving document structure matters most. Always pair with the MD render toggle.',
    strengths:   ['Best structural fidelity — headings, tables, reading order', 'Handles both text and scanned pages', 'Dedicated table structure recognition model', 'Outputs clean Markdown with proper nesting', 'Trained on DocLayNet (diverse document types)'],
    limitations: ['Slowest parser — first run loads models (~10–30 s)', 'Large model downloads (~1 GB first time)', 'High memory usage (2–4 GB during inference)', 'Overkill for simple text-only documents', 'May struggle with unusual or artistic layouts'],
    tech:        'Docling (IBM) · DocLayNet layout model · TableFormer table model · PyTorch · first-run model download from HuggingFace',
  },
  {
    id:          'markitdown',
    name:        'Markitdown',
    tag:         'Local server · MD',
    type:        'local-server',
    formats:     ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://github.com/microsoft/markitdown',
    description: 'Microsoft\'s format converter — transcodes documents into clean Markdown. Unlike other parsers that "extract" text, Markitdown preserves the full semantic structure: headings, lists, tables, hyperlinks, and slide content. The only parser that handles non-PDF formats (Word, PowerPoint, Excel, HTML).',
    inputType:   'multi-format',
    outputFormat:'markdown',
    method:      'Converter',
    speed:       'fast',
    bestFor:     'Non-PDF documents (DOCX, PPTX, XLSX, HTML) or any document where you want Markdown output with structure preserved. Pair with the MD render toggle.',
    strengths:   ['Only parser that handles DOCX, PPTX, XLSX, HTML', 'Outputs structured Markdown (headings, tables, links)', 'Fast — single-pass conversion, no ML inference', 'Preserves hyperlinks, slide notes, sheet names', 'Lightweight dependency footprint'],
    limitations: ['Cannot OCR scanned content', 'PDF support is basic (text-layer only, no layout analysis)', 'No element classification or semantic typing', 'Single-pass — no page-by-page progress streaming', 'Table conversion quality varies with source complexity'],
    tech:        'markitdown (Microsoft) · Python · format-specific readers (python-docx, openpyxl, BeautifulSoup) · single-pass Markdown emitter',
  },
  {
    id:          'llamaparse',
    name:        'LlamaParse',
    tag:         'Cloud API · MD',
    type:        'cloud-api',
    formats:     ['PDF', 'DOCX', 'PPTX', 'XLSX', 'HTML', 'Images'],
    targets:     ['references', 'abstract', 'full-text'],
    website:     'https://docs.llamaindex.ai/en/stable/llama_cloud/llama_parse/',
    description: 'LlamaIndex\'s proprietary cloud parsing service — purpose-built for complex document layouts. Sends the document to the LlamaCloud API and returns structured Markdown. Excels at tables, multi-column layouts, figures with captions, and mixed text/image pages that defeat local parsers. Requires a LlamaParse API key — set it via the API Key button in the parser controls.',
    inputType:   'multi-format',
    outputFormat:'markdown',
    method:      'Cloud API',
    speed:       'cloud',
    bestFor:     'Complex PDFs where local parsers produce garbled output — dense tables, multi-column academic papers, scanned documents with mixed layouts. Also supports DOCX, PPTX, XLSX.',
    strengths:   ['Purpose-built for complex layouts and tables', 'Handles scanned + text PDFs in one pass', 'Multi-format support (PDF, DOCX, PPTX, XLSX, images)', 'Consistently high Markdown fidelity', 'No local model downloads or GPU required'],
    limitations: ['Requires internet connection and API key', 'Cloud latency (~5–30 s per document)', 'Paid service (free tier: 1,000 pages/day)', 'Document sent to external servers — consider data privacy', 'No offline / air-gapped operation'],
    tech:        'LlamaParse (LlamaIndex Inc.) · LlamaCloud API · vision-language model · llama-parse Python client',
  },
];

const EXTRACTION_TARGETS = [
  { id: 'references', label: 'References', color: '#38bdf8', desc: 'Last 35% of pages — locates References / Bibliography heading' },
  { id: 'abstract',   label: 'Abstract',   color: '#34d399', desc: 'First 2 pages — locates Abstract section'                      },
  { id: 'full-text',  label: 'Full Text',  color: '#a78bfa', desc: 'All pages — complete document text'                            },
];

const TARGET_FIELD_MAP = [
  { target: 'References', field: 'paper.references',  note: 'Raw text; future step parses into structured entries'  },
  { target: 'Abstract',   field: 'paper.abstract',    note: 'Overwrites existing abstract field on the paper'        },
  { target: 'Full Text',  field: 'paper.fullText',    note: 'Stored for full-text search and chunking pipeline'      },
];

// ─── Pipeline diagram metadata ────────────────────────────────────────────────

const PARSER_PIPELINE = {
  pdfjs:        { input:  { label: 'Text PDF',    note: 'embedded text layer', color: '#38bdf8' },
                  method: { label: 'Text layer',  note: 'client-side',         color: '#38bdf8' },
                  output: { label: 'Plain text',  note: 'unformatted',         color: '#94a3b8' } },
  pymupdf:      { input:  { label: 'Text PDF',    note: 'embedded text layer', color: '#38bdf8' },
                  method: { label: 'Text layer',  note: 'server-side',         color: '#38bdf8' },
                  output: { label: 'Plain text',  note: 'unformatted',         color: '#94a3b8' } },
  pdfplumber:   { input:  { label: 'Text PDF',    note: 'embedded text layer', color: '#38bdf8' },
                  method: { label: 'Text layer',  note: 'table-aware',         color: '#38bdf8' },
                  output: { label: 'Plain text',  note: 'unformatted',         color: '#94a3b8' } },
  easyocr:      { input:  { label: 'Scanned PDF', note: 'image pages',         color: '#fb923c' },
                  method: { label: 'OCR',         note: 'image → characters',  color: '#fb923c' },
                  output: { label: 'Plain text',  note: 'unformatted',         color: '#94a3b8' } },
  unstructured: { input:  { label: 'Any PDF',     note: 'text or scanned',     color: '#a78bfa' },
                  method: { label: 'ML elements', note: 'element-aware',       color: '#a78bfa' },
                  output: { label: 'Plain text',  note: 'classified elements',  color: '#94a3b8' } },
  docling:      { input:  { label: 'Any PDF',     note: 'text or scanned',     color: '#a78bfa' },
                  method: { label: 'ML layout',   note: 'layout-aware',        color: '#a78bfa' },
                  output: { label: 'Markdown',    note: 'headings & tables',   color: '#34d399' } },
  markitdown:   { input:  { label: 'PDF/DOCX/…',  note: 'any supported format', color: '#34d399' },
                  method: { label: 'Converter',   note: 'format transcode',    color: '#34d399' },
                  output: { label: 'Markdown',    note: 'headings & tables',   color: '#34d399' } },
  llamaparse:   { input:  { label: 'PDF/DOCX/…',  note: 'any supported format', color: '#60a5fa' },
                  method: { label: 'Cloud API',   note: 'LlamaCloud',          color: '#60a5fa' },
                  output: { label: 'Markdown',    note: 'headings & tables',   color: '#34d399' } },
};

// ─── PDF text extraction (pdf.js, client-side) ────────────────────────────────

async function extractPdfText(filePath, target) {
  const res = await window.electronAPI?.readPdf?.(filePath);
  if (!res?.ok) throw new Error(res?.error || 'Could not read PDF file');

  const bin   = atob(res.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const pdf   = await pdfjs.getDocument({ data: bytes }).promise;
  const total = pdf.numPages;

  let pageNums;
  if (target === 'abstract') {
    pageNums = Array.from({ length: Math.min(2, total) }, (_, i) => i + 1);
  } else if (target === 'references') {
    const start = Math.max(1, Math.floor(total * 0.65));
    pageNums = Array.from({ length: total - start + 1 }, (_, i) => start + i);
  } else {
    pageNums = Array.from({ length: total }, (_, i) => i + 1);
  }

  const parts = [];
  for (const pn of pageNums) {
    const page    = await pdf.getPage(pn);
    const content = await page.getTextContent();
    const text    = content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').trim();
    parts.push({ page: pn, text });
  }

  let combined = parts.map(p => `[Page ${p.page}]\n${p.text}`).join('\n\n');

  if (target === 'references') {
    const m = combined.match(/\b(references|bibliography|works cited|cited literature)\b/i);
    if (m) combined = combined.slice(m.index);
  } else if (target === 'abstract') {
    const m = combined.match(/\babstract\b/i);
    if (m) combined = combined.slice(m.index, m.index + 3000);
  }

  return { text: combined, pagesScanned: pageNums.length, totalPages: total, chars: combined.length };
}

const CHUNK_STRATEGIES = [
  { value: 'section-aware', label: 'Section-aware',  desc: 'Split on headings / section markers'    },
  { value: 'fixed-size',    label: 'Fixed-size',     desc: 'Fixed token window with overlap'        },
  { value: 'semantic',      label: 'Semantic',       desc: 'Split on semantic similarity boundaries' },
  { value: 'mixed',         label: 'Mixed',          desc: 'Combine multiple strategies per doc type' },
];

const CHUNK_IMPLEMENTATIONS = [
  'RecursiveCharacterTextSplitter', 'TokenTextSplitter',
  'SemanticChunker', 'MarkdownHeaderTextSplitter',
  'HTMLHeaderTextSplitter', 'Custom',
];

const NER_TOOLS = [
  'spaCy', 'GLiNER', 'Flair', 'Stanza', 'NLTK',
  'LLM-based (GPT)', 'LLM-based (Claude)', 'LLM-based (local)',
  'Transformers (HF)', 'Custom',
];

const NER_STATUSES = PARSER_STATUSES;

const ENRICHMENT_FIELDS = [
  { key: 'source',          label: 'source',          desc: 'Origin file, URL, or system'             },
  { key: 'author',          label: 'author',          desc: 'Author(s) of the document'               },
  { key: 'date',            label: 'date',            desc: 'Publication or ingestion date'            },
  { key: 'docType',         label: 'doc_type',        desc: 'Category: paper, policy, report, etc.'   },
  { key: 'confidentiality', label: 'confidentiality', desc: 'Public / internal / restricted / confidential' },
  { key: 'owner',           label: 'owner',           desc: 'Team or person responsible for this doc' },
  { key: 'region',          label: 'region',          desc: 'Geographic or regulatory region'         },
  { key: 'status',          label: 'status',          desc: 'Draft / reviewed / approved / deprecated' },
  { key: 'language',        label: 'language',        desc: 'ISO language code (en, fr, de, …)'       },
  { key: 'version',         label: 'version',         desc: 'Document version or revision number'     },
];

const ENRICHMENT_METHODS = [
  { value: 'manual',     label: 'Manual tagging'         },
  { value: 'rule-based', label: 'Rule-based extraction'  },
  { value: 'llm-based',  label: 'LLM-based extraction'   },
  { value: 'hybrid',     label: 'Hybrid (rules + LLM)'   },
];

const DEDUP_METHODS = [
  { key: 'contentHash',   label: 'Content hash (SHA-256)',     desc: 'Exact duplicate detection via file hash'           },
  { key: 'minhash',       label: 'MinHash / LSH',              desc: 'Near-duplicate detection using locality-sensitive hashing' },
  { key: 'simhash',       label: 'SimHash',                    desc: 'Fingerprint-based near-duplicate detection'        },
  { key: 'canonicalUrl',  label: 'Canonical URL resolution',   desc: 'Normalise and deduplicate by source URL'           },
  { key: 'exactDuplicate', label: 'Exact title + author match', desc: 'Dedup by matching title and author fields'        },
];

const KE_TYPES = [
  { key: 'definitions',   label: 'Definitions',    desc: 'Term → definition pairs extracted from text'           },
  { key: 'facts',         label: 'Facts',          desc: 'Atomic subject–predicate–object statements'            },
  { key: 'relationships', label: 'Relationships',  desc: 'Typed links between named entities'                    },
  { key: 'summaries',     label: 'Summaries',      desc: 'Per-chunk or per-document abstractive summaries'       },
  { key: 'keyPhrases',    label: 'Key Phrases',    desc: 'Important terms and concepts extracted per chunk'      },
  { key: 'qaPairs',       label: 'Q&A Pairs',      desc: 'Question–answer pairs generated for retrieval'         },
  { key: 'claims',        label: 'Claims',         desc: 'Verifiable assertions extracted for fact-checking'     },
];

const KE_METHODS = [
  { value: 'rule-based', label: 'Rule-based' },
  { value: 'llm-based',  label: 'LLM-based'  },
  { value: 'hybrid',     label: 'Hybrid'     },
];

const PROV_FIELDS = [
  { key: 'sourceFile',     label: 'source_file',     desc: 'Path or URI of the originating document'    },
  { key: 'section',        label: 'section',         desc: 'Heading or section name within the document' },
  { key: 'pageNumber',     label: 'page_number',     desc: 'Page (for PDFs and paginated formats)'       },
  { key: 'extractionDate', label: 'extraction_date', desc: 'Timestamp when the chunk was extracted'      },
  { key: 'extractorId',    label: 'extractor_id',    desc: 'ID of the parser / extractor that ran'       },
  { key: 'confidence',     label: 'confidence',      desc: 'Confidence score for extracted content'      },
  { key: 'chunkId',        label: 'chunk_id',        desc: 'Unique identifier for this chunk'            },
  { key: 'documentId',     label: 'document_id',     desc: 'Parent document identifier'                  },
  { key: 'chunkIndex',     label: 'chunk_index',     desc: 'Position of this chunk within the document'  },
];

const PROV_STORAGE = [
  { value: 'json-field',      label: 'JSON metadata field'    },
  { value: 'separate-table',  label: 'Separate DB table'      },
  { value: 'graph-edge',      label: 'Graph edge properties'  },
  { value: 'inline-metadata', label: 'Inline in chunk text'   },
];

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  parsers: [],
  chunking: {
    strategy: 'fixed-size',
    chunkSize: 512, overlap: 64,
    implementation: 'RecursiveCharacterTextSplitter',
    sectionDetection: false,
    notes: '',
  },
  nerTools: [],
  enrichment: {
    fields: Object.fromEntries(ENRICHMENT_FIELDS.map(f => [f.key, false])),
    method: 'hybrid',
    customFields: [],
    notes: '',
  },
  deduplication: {
    methods: Object.fromEntries(DEDUP_METHODS.map(m => [m.key, false])),
    threshold: 90,
    implementation: '',
    notes: '',
  },
  knowledgeExtraction: {
    types: Object.fromEntries(KE_TYPES.map(t => [t.key, false])),
    method: 'llm-based',
    llmModel: '',
    promptPath: '',
    notes: '',
  },
  provenance: {
    fields: Object.fromEntries(PROV_FIELDS.map(f => [f.key, false])),
    storageFormat: 'json-field',
    notes: '',
  },
};

// ─── Readiness score ──────────────────────────────────────────────────────────

function computeReadiness(s) {
  const enrichedCount = Object.values(s.enrichment.fields).filter(Boolean).length;
  const keCount       = Object.values(s.knowledgeExtraction.types).filter(Boolean).length;
  const provCount     = Object.values(s.provenance.fields).filter(Boolean).length;
  const dedupCount    = Object.values(s.deduplication.methods).filter(Boolean).length;

  const criteria = [
    {
      label:   'Document parser configured',
      met:     s.parsers.some(p => p.status === 'active'),
      partial: s.parsers.length > 0,
    },
    {
      label:   'Chunking strategy defined',
      met:     s.chunking.strategy != null && +s.chunking.chunkSize > 0,
      partial: s.chunking.strategy != null,
    },
    {
      label:   'Entity extraction pipeline active',
      met:     s.nerTools.some(t => t.status === 'active'),
      partial: s.nerTools.length > 0,
    },
    {
      label:   'Metadata enrichment covers ≥ 5 fields',
      met:     enrichedCount >= 5,
      partial: enrichedCount >= 2,
    },
    {
      label:   'Deduplication enabled',
      met:     dedupCount >= 2,
      partial: dedupCount >= 1,
    },
    {
      label:   'Knowledge extraction ≥ 2 types',
      met:     keCount >= 2,
      partial: keCount >= 1,
    },
    {
      label:   'Provenance tagging ≥ 5 fields',
      met:     provCount >= 5 && s.provenance.fields.sourceFile && s.provenance.fields.extractionDate,
      partial: provCount >= 3,
    },
  ];
  const score = criteria.reduce((n, c) => n + (c.met ? 1 : c.partial ? 0.5 : 0), 0);
  return { criteria, score, max: criteria.length };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputSx = {
  padding: '6px 10px', borderRadius: 6, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text)', fontSize: 12, outline: 'none', width: '100%',
};
const selectSx = { ...inputSx, cursor: 'pointer' };

function FL({ label, children, span2 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: span2 ? 'span 2' : undefined }}>
      {label && (
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

function StatusRow({ value, opts, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 10,
          fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
          border: `1px solid ${value === o.value ? o.color : 'rgba(255,255,255,0.1)'}`,
          background: value === o.value ? `${o.color}18` : 'transparent',
          color: value === o.value ? o.color : 'var(--text-muted)',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SectionCard({ icon: Icon, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: cr(0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={ACC} />
        </div>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
          {title}
        </span>
        {badge != null && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
            background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}` }}>
            {badge}
          </span>
        )}
        {open ? <ChevronDown size={15} color="var(--text-muted)" />
               : <ChevronRight size={15} color="var(--text-muted)" />}
      </button>
      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// toggle-chip for method selectors
function MethodRow({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '4px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
          border: `1px solid ${value === o.value ? ACC : 'rgba(255,255,255,0.1)'}`,
          background: value === o.value ? cr(0.12) : 'transparent',
          color: value === o.value ? ACC : 'var(--text-muted)',
          fontWeight: value === o.value ? 600 : 400,
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
  borderRadius: 6, cursor: 'pointer', fontSize: 11,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)',
};
const dangerBtn = { ...ghostBtn, color: '#ef4444',
  border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' };

// ─── Parser modal ─────────────────────────────────────────────────────────────

function ParserModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleFormat = (fmt) =>
    set('supportedFormats', form.supportedFormats.includes(fmt)
      ? form.supportedFormats.filter(x => x !== fmt)
      : [...form.supportedFormats, fmt]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 500, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit Parser' : 'Add Document Parser'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FL label="Library">
            <select style={selectSx} value={form.library}
              onChange={e => set('library', e.target.value)}>
              {PARSER_LIBRARIES.map(l => <option key={l}>{l}</option>)}
            </select>
          </FL>
          <FL label="Version">
            <input style={inputSx} value={form.version}
              onChange={e => set('version', e.target.value)}
              placeholder="e.g. 1.24.0" />
          </FL>
          <FL label="Config / Script Path" span2>
            <input style={inputSx} value={form.configPath}
              onChange={e => set('configPath', e.target.value)}
              placeholder="e.g. pipeline/parsers/pdf_parser.py" />
          </FL>
          <FL label="Status" span2>
            <StatusRow value={form.status} opts={PARSER_STATUSES}
              onChange={v => set('status', v)} />
          </FL>
          <FL label="Supported Formats" span2>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {SUPPORTED_FORMATS.map(fmt => {
                const on = form.supportedFormats.includes(fmt);
                return (
                  <button key={fmt} onClick={() => toggleFormat(fmt)} style={{
                    padding: '3px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 11,
                    border: `1px solid ${on ? ACC : 'rgba(255,255,255,0.1)'}`,
                    background: on ? cr(0.12) : 'transparent',
                    color: on ? ACC : 'var(--text-muted)',
                    fontWeight: on ? 600 : 400,
                  }}>
                    {fmt}
                  </button>
                );
              })}
            </div>
          </FL>
          <FL label="Notes" span2>
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Config notes, special handling, known issues…" />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)} style={{ padding: '6px 16px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: ACC, border: 'none', color: '#0f172a' }}>
            {form.id ? 'Save Changes' : 'Add Parser'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NER tool modal ───────────────────────────────────────────────────────────

function NERModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const [typeInput, setTypeInput] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addType = (raw) => {
    const t = raw.trim();
    if (t && !form.entityTypes.includes(t)) set('entityTypes', [...form.entityTypes, t]);
    setTypeInput('');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 500, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit Extraction Tool' : 'Add Extraction Tool'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FL label="Tool / Framework">
            <select style={selectSx} value={form.tool}
              onChange={e => set('tool', e.target.value)}>
              {NER_TOOLS.map(t => <option key={t}>{t}</option>)}
            </select>
          </FL>
          <FL label="Model / Version">
            <input style={inputSx} value={form.model}
              onChange={e => set('model', e.target.value)}
              placeholder="e.g. en_core_web_trf, gpt-4o" />
          </FL>
          <FL label="Status" span2>
            <StatusRow value={form.status} opts={NER_STATUSES}
              onChange={v => set('status', v)} />
          </FL>
          <FL label="Ontology-aligned entity types" span2>
            {form.entityTypes.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                {form.entityTypes.map(t => (
                  <span key={t} style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 8px 2px 9px', borderRadius: 10,
                    background: cr(0.1), border: `1px solid ${cr(0.35)}`,
                    fontSize: 11, color: ACC,
                  }}>
                    {t}
                    <button onClick={() => set('entityTypes', form.entityTypes.filter(x => x !== t))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: ACC, opacity: 0.6, padding: 0, fontSize: 14, lineHeight: 1 }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input style={inputSx} value={typeInput}
              onChange={e => setTypeInput(e.target.value)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addType(typeInput))}
              placeholder="Type entity type and press Enter (e.g. Person, Organization)…" />
          </FL>
          <FL label="Config / Script Path" span2>
            <input style={inputSx} value={form.configPath}
              onChange={e => set('configPath', e.target.value)}
              placeholder="e.g. pipeline/ner/extractor.py" />
          </FL>
          <FL label="Notes" span2>
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Notes on model, accuracy, scope…" />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)} style={{ padding: '6px 16px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: ACC, border: 'none', color: '#0f172a' }}>
            {form.id ? 'Save Changes' : 'Add Tool'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline 2-column panel ────────────────────────────────────────────────────

function InlinePanel({ icon: Icon, title, rightLabel, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={ACC} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>
          {title}
        </span>
        {rightLabel && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rightLabel}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// toggle row for checklist items
function CheckRow({ item, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
      padding: '6px 8px', borderRadius: 7,
      background: checked ? cr(0.06) : 'rgba(255,255,255,0.02)',
      border: `1px solid ${checked ? cr(0.22) : 'rgba(255,255,255,0.06)'}`,
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: ACC, marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: checked ? 600 : 400,
          fontFamily: 'monospace', color: checked ? ACC : 'var(--text-muted)' }}>
          {item.label}
        </div>
        {item.desc && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 1 }}>
            {item.desc}
          </div>
        )}
      </div>
    </label>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

// Maps manual extraction types to KE_TYPES keys where applicable
const MANUAL_TO_KE = { claims: 'claims', definitions: 'definitions' };

const MANUAL_TYPE_CFG = [
  { key: 'claims',      label: 'Claims',      color: '#a78bfa', Icon: Lightbulb,  keKey: 'claims'       },
  { key: 'definitions', label: 'Definitions', color: '#34d399', Icon: BookMarked, keKey: 'definitions'  },
  { key: 'events',      label: 'Events',      color: '#fb923c', Icon: CalendarDays, keKey: null          },
  { key: 'processes',   label: 'Processes',   color: '#38bdf8', Icon: GitFork,    keKey: null            },
];

const TEXT_COLORS = [
  { label: 'Slate',  value: '#94a3b8' },
  { label: 'Green',  value: '#34d399' },
  { label: 'Amber',  value: '#fbbf24' },
  { label: 'Cyan',   value: '#22d3ee' },
  { label: 'White',  value: '#e2e8f0' },
  { label: 'Dim',    value: '#475569' },
];

// Render text with search match highlights. Falls back to plain string if no matches.
function renderWithHighlights(text, matches, activeIdx, baseColor) {
  if (!matches || matches.length === 0) return text;
  const parts = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.start > pos) parts.push(text.slice(pos, m.start));
    parts.push(
      <mark key={i} style={{
        background: i === activeIdx ? '#fb923c' : '#fbbf2444',
        color: i === activeIdx ? '#0f172a' : baseColor,
        borderRadius: 2, padding: '0 1px',
      }}>
        {text.slice(m.start, m.end)}
      </mark>
    );
    pos = m.end;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

export default function IngestionPipelineTab({ papers = [], onPapersChange, onNavigate, mode, onOutputChange }) {
  const [s, setS] = useState(DEFAULT_STATE);
  const [parserModal, setParserModal] = useState(null);
  const [nerModal,    setNerModal]    = useState(null);
  const [bench, setBench] = useState({
    paperId: '', parserId: 'pdfjs', target: 'full-text',
    customPages: '', useCustomPages: false,
    running: false, output: null, error: null,
    doclingFormat: 'markdown',  // 'markdown' | 'text' | 'json'
  });
  const [elapsedSecs,     setElapsedSecs]     = useState(0);
  const [showLineNumbers, setShowLineNumbers] = useState(() => localStorage.getItem('bench.showLineNumbers') === 'true');
  const [textColor,       setTextColor]       = useState(() => localStorage.getItem('bench.textColor') || '#94a3b8');
  const [savedMsg,        setSavedMsg]        = useState(null); // { ok, text }

  // Expose parsed output to parent
  useEffect(() => {
    if (onOutputChange) onOutputChange(bench.output?.text || null);
  }, [bench.output, onOutputChange]);
  const [copiedMsg,       setCopiedMsg]       = useState(false);
  const [pymupdfOnline,   setPymupdfOnline]   = useState(false);
  const [serverLog,       setServerLog]       = useState('');
  const [pymupdfStarting, setPymupdfStarting] = useState(true);  // true on mount — auto-start in progress
  const [serverError,     setServerError]     = useState(null);
  // LlamaParse API key
  const [llamaApiKey,       setLlamaApiKey]       = useState(() => localStorage.getItem('kb.llamaApiKey') || '');
  const [showLlamaKeyModal, setShowLlamaKeyModal] = useState(false);
  const [llamaKeyDraft,     setLlamaKeyDraft]     = useState('');
  const [showLlamaKeyText,  setShowLlamaKeyText]  = useState(false);
  // Compare mode
  const [compareMode,     setCompareMode]     = useState(false);
  const [compareParsers,  setCompareParsers]  = useState(new Set(['pdfjs']));
  const [compareResults,  setCompareResults]  = useState({});
  const [activeCompareTab, setActiveCompareTab] = useState('pdfjs');
  // PDF type detection
  const [pdfTypeResult,   setPdfTypeResult]   = useState(null);
  const [detectingType,   setDetectingType]   = useState(false);
  // Post-processing
  const [postProc, setPostProc] = useState({
    stripHeaders:     false,
    removeHyphens:    false,
    normalizeSpace:   false,
    removeWatermarks: false,
  });
  // Regex search
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchRegex,   setSearchRegex]   = useState(false);
  const [searchMatches, setSearchMatches] = useState([]); // [{start,end}]
  const [searchIdx,     setSearchIdx]     = useState(0);
  // Batch extraction
  const [batchMode,      setBatchMode]      = useState(false);
  const [batchSelected,  setBatchSelected]  = useState(new Set());
  const [batchResults,   setBatchResults]   = useState([]); // [{paperId,title,status,chars,error}]
  const [batchRunning,   setBatchRunning]   = useState(false);
  // Output settings dropdown
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  const [showExportMenu,     setShowExportMenu]     = useState(false);
  const [showFieldMap,       setShowFieldMap]       = useState(false);
  const [showSectionSettings,   setShowSectionSettings]   = useState(false);
  const [sectionOpen,           setSectionOpen]           = useState(true);
  const [paperHeadingsDraft,    setPaperHeadingsDraft]    = useState('');
  const [sectionSortBySize,     setSectionSortBySize]     = useState(false);
  const [expandedSections,      setExpandedSections]      = useState(new Set());
  const [showMinimap,           setShowMinimap]           = useState(() => localStorage.getItem('bench.showMinimap') === 'true');
  const [showSectionExport,     setShowSectionExport]     = useState(false);
  const [sectionsSaved,         setSectionsSaved]         = useState(false);
  const [showSectionsModal,     setShowSectionsModal]     = useState(false);
  const [showParsersModal,      setShowParsersModal]      = useState(false);
  const [showParserDefs,        setShowParserDefs]        = useState(false);
  const [showHistoryModal,      setShowHistoryModal]      = useState(false);
  const [parserDropdownOpen,   setParserDropdownOpen]   = useState(false);
  const [modalSearch,           setModalSearch]           = useState('');
  const [modalFocusIdx,         setModalFocusIdx]         = useState(0);
  const [activeSectionIdx,      setActiveSectionIdx]      = useState(0);
  const modalCardRefs = useRef([]);
  const [modalSort,             setModalSort]             = useState('document');  // 'document'|'words'|'alpha'|'anomaly'
  const [modalCollapsed,        setModalCollapsed]        = useState(false);       // collapse all card bodies
  const [modalCardSize,         setModalCardSize]         = useState('normal');    // 'compact'|'normal'|'wide'
  const [cardExportOpen,        setCardExportOpen]        = useState(null);        // origI of card with open export dropdown
  const [editingName,           setEditingName]           = useState(null);        // origI of card being renamed
  const [editNameDraft,         setEditNameDraft]         = useState('');
  const [sectionColorLines,     setSectionColorLines]     = useState(() => localStorage.getItem('bench.sectionColorLines') === 'true');
  const [mdRender,              setMdRender]              = useState(() => localStorage.getItem('bench.mdRender') === 'true');
  const [editedOutput,          setEditedOutput]          = useState(null);   // string when edited, null = unmodified
  const [editMode,              setEditMode]              = useState(false);   // textarea active
  useEffect(() => { localStorage.setItem('bench.sectionColorLines', sectionColorLines); }, [sectionColorLines]);
  useEffect(() => { localStorage.setItem('bench.mdRender', mdRender); }, [mdRender]);
  // Reset edits whenever a new extraction result arrives
  useEffect(() => { setEditedOutput(null); setEditMode(false); }, [bench.output]);
  useEffect(() => { localStorage.setItem('bench.showMinimap', showMinimap); }, [showMinimap]);
  const outputRef = useRef(null);
  const [outputHeight, setOutputHeight] = useState(() => {
    const saved = parseInt(localStorage.getItem('bench.outputHeight'), 10);
    return saved > 0 ? saved : 320;
  });
  const outputDragRef = useRef(null);
  useEffect(() => { localStorage.setItem('bench.outputHeight', outputHeight); }, [outputHeight]);
  const [sectionSettings, setSectionSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bench.sectionSettings') || 'null') || {
      maxHeadingLen: 80,
      requireNoPunctEnd: true,
      allowNumberedPrefix: true,
      requireIsolatedLine: true,
      mergeDuplicates: false,
      customHeadings: '',
    }; } catch { return {
      maxHeadingLen: 80,
      requireNoPunctEnd: true,
      allowNumberedPrefix: true,
      requireIsolatedLine: true,
      mergeDuplicates: false,
      customHeadings: '',
    }; }
  });
  useEffect(() => {
    localStorage.setItem('bench.sectionSettings', JSON.stringify(sectionSettings));
  }, [sectionSettings]);
  // Sync per-paper headings draft whenever the active paper changes or panel opens
  useEffect(() => {
    const paper = papers.find(p => p.id === bench.paperId);
    setPaperHeadingsDraft(paper?.sectionHeadings || '');
  }, [bench.paperId, showSectionSettings]);

  // ── Modal: reset search + focus when opened ────────────────────────────────
  useEffect(() => {
    if (showSectionsModal) { setModalSearch(''); setModalFocusIdx(0); }
  }, [showSectionsModal]);


  const [gutterColor,        setGutterColor]        = useState(() => localStorage.getItem('bench.gutterColor') || '#334155');

  // pdfjs worker setup (needed for text extraction outside PdfReader)
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    // Inject progress bar animations
    if (!document.getElementById('bench-keyframes')) {
      const s = document.createElement('style');
      s.id = 'bench-keyframes';
      s.textContent = `
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(430%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .bench-output::-webkit-scrollbar { width: 6px; height: 6px; }
        .bench-output::-webkit-scrollbar-track { background: transparent; }
        .bench-output::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
        .bench-output::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
      `;
      document.head.appendChild(s);
    }
  }, []);

  // Poll PyMuPDF server status every 3 s.
  // Also clears the "starting" indicator once we know the server is up (or after 15 s timeout).
  useEffect(() => {
    const check = async () => {
      const res = await window.electronAPI?.pymupdfStatus?.();
      const running = !!res?.running;
      setPymupdfOnline(running);
      if (running) setPymupdfStarting(false);
      if (res?.log) setServerLog(res.log);
    };
    check();
    const id = setInterval(check, 3000);
    // Fallback: if server hasn't come online in 15 s, stop showing "Starting…"
    const timeout = setTimeout(() => setPymupdfStarting(false), 15000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, []);

  // Persist output display settings to localStorage
  useEffect(() => { localStorage.setItem('bench.showLineNumbers', showLineNumbers); }, [showLineNumbers]);
  useEffect(() => { localStorage.setItem('bench.textColor',       textColor);       }, [textColor]);
  useEffect(() => { localStorage.setItem('bench.gutterColor',     gutterColor);     }, [gutterColor]);

  // Elapsed timer — counts up while extraction is running
  useEffect(() => {
    if (!bench.running) { setElapsedSecs(0); return; }
    setElapsedSecs(0);
    const id = setInterval(() => setElapsedSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [bench.running]);

  const startPymupdf = async () => {
    setPymupdfStarting(true);
    setServerError(null);
    const res = await window.electronAPI?.pymupdfStart?.();
    if (!res?.ok) {
      setServerError(res?.error || 'Failed to start parser server');
    }
    const status = await window.electronAPI?.pymupdfStatus?.();
    setPymupdfOnline(!!status?.running);
    setPymupdfStarting(false);
  };

  const stopPymupdf = async () => {
    await window.electronAPI?.pymupdfStop?.();
    setPymupdfOnline(false);
    setServerError(null);
  };

  const detectPdfType = async () => {
    const paper = papersWithFile.find(p => p.id === bench.paperId);
    if (!paper) return;
    const ext = (paper.filePath || '').split('.').pop()?.toLowerCase();
    const officeExts = ['docx','doc','pptx','ppt','xlsx','xls','html','htm','csv','tsv','rtf','epub'];

    // Non-PDF files can be detected client-side without the server
    if (officeExts.includes(ext)) {
      const fmt = ext.toUpperCase();
      setPdfTypeResult({
        ok: true, type: 'office', format: fmt,
        recommendation: 'markitdown',
        reason: `${fmt} document — Markitdown converts to structured Markdown`,
        alt: null, altReason: null, totalPages: 0, avgCharsPerPage: 0,
        avgImagesPerPage: 0, pagesWithText: 0, pagesScanned: 0,
        textRatio: 0, pageStats: [],
      });
      setBench(b => ({ ...b, parserId: 'markitdown', output: null, error: null }));
      return;
    }

    // PDF analysis requires the server
    if (!pymupdfOnline) return;
    setDetectingType(true);
    setPdfTypeResult(null);
    try {
      const res = await fetch(`http://127.0.0.1:7432/detect?filePath=${encodeURIComponent(paper.filePath)}`);
      const data = await res.json();
      if (data.ok) {
        setPdfTypeResult(data);
        setBench(b => ({ ...b, parserId: data.recommendation, output: null, error: null }));
      } else {
        setPdfTypeResult({ error: data.error });
      }
    } catch (e) {
      setPdfTypeResult({ error: e.message });
    } finally {
      setDetectingType(false);
    }
  };

  const _runSingleParser = async (pid, paper) => {
    const selectedParser = BUILTIN_PARSERS.find(p => p.id === pid);
    if (selectedParser?.type === 'local-server' || selectedParser?.type === 'cloud-api') {
      const response = await fetch('http://127.0.0.1:7432/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: paper.filePath,
          target: bench.target,
          parser: pid,
          customPages: bench.useCustomPages && bench.customPages.trim() ? bench.customPages.trim() : null,
          doclingFormat: bench.doclingFormat || 'markdown',
          llamaApiKey: llamaApiKey || undefined,
        }),
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', result;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.type === 'result') {
            if (!msg.ok) throw new Error(msg.error || 'Server error');
            result = msg;
          }
        }
      }
      if (!result) throw new Error('Server returned no result');
      return result;
    } else {
      return { ...(await extractPdfText(paper.filePath, bench.target)), parser: 'PDF.js' };
    }
  };

  const runCompare = async () => {
    const paper = papersWithFile.find(p => p.id === bench.paperId);
    if (!paper || compareParsers.size === 0) return;
    const init = {};
    for (const pid of compareParsers) init[pid] = { running: true, output: null, error: null };
    setCompareResults(init);
    const promises = Array.from(compareParsers).map(async (pid) => {
      try {
        const result = await _runSingleParser(pid, paper);
        setCompareResults(prev => ({ ...prev, [pid]: { running: false, output: result, error: null } }));
      } catch (e) {
        setCompareResults(prev => ({ ...prev, [pid]: { running: false, output: null, error: e.message } }));
      }
    });
    await Promise.all(promises);
  };

  // ── Post-processing ──────────────────────────────────────────────────────────
  const applyPostProc = (text, opts = postProc) => {
    let t = text;
    if (opts.removeHyphens)    t = t.replace(/(\w)-\n(\w)/g, '$1$2');
    if (opts.stripHeaders)     t = t.replace(/^\[Page \d+\]\n?/gm, '');
    if (opts.normalizeSpace)   t = t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (opts.removeWatermarks) t = t.replace(/\b(confidential|draft|do not distribute|watermark)\b/gi, '');
    return t;
  };

  const anyPostProc = Object.values(postProc).some(Boolean);

  // ── Section word count ────────────────────────────────────────────────────────
  const BASE_SECTION_HEADINGS = [
    'abstract', 'introduction', 'background', 'related work', 'literature review',
    'methods', 'methodology', 'materials', 'experimental', 'results', 'findings',
    'discussion', 'conclusion', 'conclusions', 'references', 'bibliography',
    'acknowledgements', 'appendix', 'limitations', 'future work', 'contributions',
    'data availability', 'ethics', 'funding', 'conflicts of interest',
  ];

  const analyzeSections = (text, settings = sectionSettings, paperHeadings = '') => {
    const {
      maxHeadingLen = 80,
      requireNoPunctEnd = true,
      allowNumberedPrefix = true,
      requireIsolatedLine = true,
      mergeDuplicates = false,
      customHeadings = '',
    } = settings;

    // Build full heading list: built-in + global custom + per-paper custom
    const parseList = (raw) => raw.split(/[,\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const allHeadings = [
      ...BASE_SECTION_HEADINGS,
      ...parseList(customHeadings),
      ...parseList(paperHeadings),
    ];

    const numPrefix = allowNumberedPrefix ? '(?:\\d+(?:\\.\\d+)*\\.?\\s+)?' : '';
    const headingRe = new RegExp(
      `^\\s*${numPrefix}(${allHeadings.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*$`,
      'i'
    );

    // Less-strict fallback: heading word at start of line (not full-line)
    const headingStartRe = new RegExp(
      `^\\s*${numPrefix}(${allHeadings.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
      'i'
    );

    const lines = text.split('\n');
    const sections = [];
    let currentSection = { name: 'Preamble', words: 0, chars: 0 };

    const isHeadingLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      // 0. Markdown headings — detect # / ## / ### etc.
      const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (mdMatch) {
        const headingText = mdMatch[2].replace(/\s*#+\s*$/, '').trim(); // strip trailing #s
        if (headingText.length > 0 && headingText.length <= maxHeadingLen) {
          return { text: headingText, mdLevel: mdMatch[1].length };
        }
      }

      // 1. Length guard — headings are short
      if (trimmed.length > maxHeadingLen) return null;

      // 2. No trailing sentence punctuation (period, !, ?)
      if (requireNoPunctEnd && /[.!?]$/.test(trimmed)) return null;

      // 3. Try strict match (heading fills whole line)
      const strictMatch = trimmed.match(headingRe);
      if (strictMatch) return strictMatch[1];

      // 4. Relaxed match only if not requiring isolated line
      if (!requireIsolatedLine) {
        const relaxed = trimmed.match(headingStartRe);
        if (relaxed) return relaxed[1];
      }

      return null;
    };

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const headingResult = isHeadingLine(line);
      if (headingResult) {
        if (currentSection.words > 0 || sections.length > 0) sections.push(currentSection);
        const headingName = typeof headingResult === 'object' ? headingResult.text : headingResult;
        const mdLevel     = typeof headingResult === 'object' ? headingResult.mdLevel : undefined;
        const normalized = headingName.charAt(0).toUpperCase() + headingName.slice(1).toLowerCase();
        currentSection = { name: normalized, words: 0, chars: 0, lineIndex: li, previewLines: [], mdLevel };
      } else {
        const words = line.trim().split(/\s+/).filter(Boolean).length;
        currentSection.words += words;
        currentSection.chars += line.length;
        // Collect up to 3 non-empty lines as preview
        if (line.trim() && (currentSection.previewLines || []).length < 3) {
          currentSection.previewLines = [...(currentSection.previewLines || []), line.trim()];
        }
      }
    }
    if (currentSection.words > 0) sections.push(currentSection);

    // Merge duplicate section names if requested
    if (mergeDuplicates) {
      const merged = [];
      const seen = new Map();
      for (const sec of sections) {
        if (seen.has(sec.name)) {
          const existing = merged[seen.get(sec.name)];
          existing.words += sec.words;
          existing.chars += sec.chars;
          existing.occurrences = (existing.occurrences || 1) + 1;
          // Keep previewLines from first occurrence
        } else {
          seen.set(sec.name, merged.length);
          merged.push({ ...sec, occurrences: 1 });
        }
      }
      return merged;
    }

    return sections;
  };

  // ── Batch extraction ──────────────────────────────────────────────────────────
  const runBatch = async () => {
    if (batchSelected.size === 0) return;
    setBatchRunning(true);
    const fieldMap = { references: 'references', abstract: 'abstract', 'full-text': 'fullText' };
    const field = fieldMap[bench.target] || 'fullText';
    const targets = papersWithFile.filter(p => batchSelected.has(p.id));
    const results = targets.map(p => ({ paperId: p.id, title: p.title, status: 'pending', chars: 0, error: null }));
    setBatchResults([...results]);

    let updatedPapers = [...papers];
    for (let i = 0; i < targets.length; i++) {
      const paper = targets[i];
      setBatchResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'running' } : r));
      try {
        const result = await _runSingleParser(bench.parserId, paper);
        const text = anyPostProc ? applyPostProc(result.text) : result.text;
        const entry = {
          id: Date.now() + i,
          parserId: bench.parserId, parser: result.parser, target: bench.target,
          chars: text.length, pagesScanned: result.pagesScanned,
          totalPages: result.totalPages, timestamp: new Date().toISOString(), text,
        };
        updatedPapers = updatedPapers.map(p =>
          p.id === paper.id
            ? { ...p, [field]: text, extractionHistory: [...(p.extractionHistory || []), entry] }
            : p
        );
        onPapersChange?.(updatedPapers);
        setBatchResults(prev => prev.map((r, idx) => idx === i
          ? { ...r, status: 'done', chars: text.length } : r));
      } catch (e) {
        setBatchResults(prev => prev.map((r, idx) => idx === i
          ? { ...r, status: 'error', error: e.message } : r));
      }
    }
    setBatchRunning(false);
  };

  const papersWithFile = useMemo(() => papers.filter(p => p.filePath), [papers]);

  // Pre-compute section data so both the minimap (in output panel) and
  // the section breakdown list can share the same result without recomputing
  const sectionData = useMemo(() => {
    if (!bench.output || bench.target !== 'full-text') return null;
    const activePaper = papersWithFile.find(p => p.id === bench.paperId);
    const raw = analyzeSections(bench.output.text, sectionSettings, activePaper?.sectionHeadings || '');
    if (raw.length < 2) return null;
    return raw;
  }, [bench.output, bench.target, bench.paperId, sectionSettings, paperHeadingsDraft, papersWithFile]);

  // ── Modal: keyboard navigation ─────────────────────────────────────────────
  useEffect(() => {
    if (!showSectionsModal) return;
    const secs = sectionData
      ? extractSectionTexts(bench.output?.text || '', sectionData).filter(s =>
          !modalSearch || s.name.toLowerCase().includes(modalSearch.toLowerCase()) || s.text.toLowerCase().includes(modalSearch.toLowerCase())
        )
      : [];
    const total = secs.length;
    const handler = (e) => {
      if (e.key === 'Escape') { setShowSectionsModal(false); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setModalFocusIdx(i => { const n = Math.min(i + 1, total - 1); modalCardRefs.current[n]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return n; });
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setModalFocusIdx(i => { const n = Math.max(i - 1, 0); modalCardRefs.current[n]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return n; });
      }
      if (e.key === 'Enter') {
        const sec = secs[modalFocusIdx];
        if (sec) {
          setShowSectionsModal(false);
          setSearchQuery(sec.name); setSearchIdx(0);
          setTimeout(() => { if (outputRef.current) outputRef.current.scrollTop = Math.max(0, (sec.lineIndex ?? 0) * 11 * 1.6 - 12); }, 60);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSectionsModal, modalSearch, modalFocusIdx, sectionData, bench.output]);

  // ── Active section tracker: update as output panel scrolls ────────────────
  useEffect(() => {
    const el = outputRef.current;
    if (!el || !sectionData) return;
    const LINE_H = 11 * 1.6;
    const onScroll = () => {
      const currentLine = Math.floor((el.scrollTop + 12) / LINE_H);
      let best = 0;
      sectionData.forEach((sec, idx) => {
        if ((sec.lineIndex ?? 0) <= currentLine) best = idx;
      });
      setActiveSectionIdx(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [sectionData, bench.output]);

  // Compute search match positions whenever query or output changes
  const searchMatchPositions = useMemo(() => {
    const text = bench.output?.text;
    if (!text || !searchQuery.trim()) return [];
    try {
      const flags = 'gi';
      const pattern = searchRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(pattern, flags);
      const matches = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length });
        if (matches.length > 500) break; // cap at 500 matches
      }
      return matches;
    } catch { return []; }
  }, [bench.output?.text, searchQuery, searchRegex]);

  const saveToPaper = () => {
    if (!bench.output || !bench.paperId) return;
    const fieldMap = { references: 'references', abstract: 'abstract', 'full-text': 'fullText' };
    const field = fieldMap[bench.target] || 'fullText';
    const entry = {
      id: Date.now(),
      parserId: bench.parserId,
      parser: bench.output.parser,
      target: bench.target,
      chars: bench.output.chars,
      pagesScanned: bench.output.pagesScanned,
      totalPages: bench.output.totalPages,
      timestamp: new Date().toISOString(),
      text: bench.output.text,
    };
    const updated = papers.map(p =>
      p.id === bench.paperId
        ? { ...p, [field]: bench.output.text, extractionHistory: [...(p.extractionHistory || []), entry] }
        : p
    );
    onPapersChange?.(updated);
    setSavedMsg({ ok: true, text: `Saved to paper.${field}`, tab: 'literature', paperId: bench.paperId, field });
    setTimeout(() => setSavedMsg(null), 5000);
  };

  const savePaperHeadings = () => {
    if (!bench.paperId) return;
    const updated = papers.map(p =>
      p.id === bench.paperId ? { ...p, sectionHeadings: paperHeadingsDraft } : p
    );
    onPapersChange?.(updated);
  };

  // ── Section text extraction ────────────────────────────────────────────────
  // Takes raw text + sections metadata, returns each section enriched with its full text
  const extractSectionTexts = (rawText, sections) => {
    const lines = rawText.split('\n');
    return sections.map((sec, i) => {
      const start = (sec.lineIndex ?? 0) + 1; // skip the heading line itself
      const end   = sections[i + 1]?.lineIndex ?? lines.length;
      const text  = lines.slice(start, end).join('\n').trim();
      return { ...sec, text };
    });
  };

  // Feature 17 — save section breakdown to paper.sections
  const saveSections = () => {
    if (!sectionData || !bench.paperId || !bench.output) return;
    const withText = extractSectionTexts(bench.output.text, sectionData);
    const sectionsToSave = withText.map(({ name, words, chars, lineIndex, text }) =>
      ({ name, words, chars, lineIndex, text })
    );
    const updated = papers.map(p =>
      p.id === bench.paperId
        ? { ...p, sections: sectionsToSave, sectionsParser: bench.output.parser || bench.parserId,
            sectionsSavedAt: new Date().toISOString() }
        : p
    );
    onPapersChange?.(updated);
    setSectionsSaved(true);
    setTimeout(() => setSectionsSaved(false), 2500);
  };

  // Persist per-section metadata (customName, note, pinned) back to paper.sections
  const updateSectionMeta = (origI, changes) => {
    if (!bench.paperId || !sectionData || !bench.output) return;
    const withText    = extractSectionTexts(bench.output.text, sectionData);
    const activePaper = papersWithFile.find(p => p.id === bench.paperId);
    const base = withText.map(s => ({ name: s.name, words: s.words, chars: s.chars, lineIndex: s.lineIndex, text: s.text }));
    const existing = (activePaper?.sections?.length === base.length) ? activePaper.sections : base;
    const updated  = existing.map((s, i) => i === origI ? { ...s, ...changes } : s);
    onPapersChange?.(papers.map(p => p.id === bench.paperId ? { ...p, sections: updated } : p));
  };

  // Feature 18 — export sections
  const exportSections = (fmt) => {
    if (!sectionData || !bench.output) return;
    const paper = papersWithFile.find(p => p.id === bench.paperId);
    const stem  = paper?.title?.slice(0, 40).replace(/[^a-z0-9]/gi, '_') || 'extraction';
    const withText = extractSectionTexts(bench.output.text, sectionData);
    const dl = (content, mime, filename) => {
      const blob = new Blob([content], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
    };
    if (fmt === 'json') {
      const payload = withText.map(({ name, words, chars, text }) => ({ name, words, chars, text }));
      dl(JSON.stringify(payload, null, 2), 'application/json', `${stem}_sections.json`);
    } else if (fmt === 'md') {
      const md = withText.map(s => `## ${s.name}\n\n> ${s.words.toLocaleString()} words\n\n${s.text}`).join('\n\n---\n\n');
      dl(md, 'text/markdown', `${stem}_sections.md`);
    } else if (fmt === 'txt') {
      const txt = withText.map(s => `${'='.repeat(60)}\n${s.name.toUpperCase()}\n${'='.repeat(60)}\n\n${s.text}`).join('\n\n\n');
      dl(txt, 'text/plain', `${stem}_sections.txt`);
    } else if (fmt === 'individual') {
      // Download each section as its own .txt file sequentially
      withText.forEach((s, i) => {
        const safeName = s.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        setTimeout(() => dl(s.text, 'text/plain', `${stem}_${String(i+1).padStart(2,'0')}_${safeName}.txt`), i * 120);
      });
    }
    setShowSectionExport(false);
  };

  const exportAs = (fmt) => {
    if (!bench.output) return;
    const paper = papersWithFile.find(p => p.id === bench.paperId);
    const stem  = paper?.title?.slice(0, 40).replace(/[^a-z0-9]/gi, '_') || 'extraction';
    const title = paper?.title || stem;
    const text  = bench.output.text;
    let content, mime, ext;
    switch (fmt) {
      case 'txt':
        content = text; mime = 'text/plain'; ext = 'txt'; break;
      case 'md':
        content = `# ${title}\n\n> Extracted: ${bench.target} · Parser: ${bench.output.parser || 'PDF.js'} · Pages: ${bench.output.pagesScanned}/${bench.output.totalPages}\n\n${text}`;
        mime = 'text/markdown'; ext = 'md'; break;
      case 'html':
        content = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:Georgia,serif;max-width:860px;margin:2rem auto;padding:0 1rem;line-height:1.7;color:#1a1a1a}pre{white-space:pre-wrap;font-family:inherit}header{border-bottom:1px solid #ccc;margin-bottom:1.5rem;padding-bottom:.5rem}small{color:#666}</style></head>\n<body>\n<header><h1>${title}</h1><small>Extracted: ${bench.target} &nbsp;·&nbsp; Parser: ${bench.output.parser || 'PDF.js'} &nbsp;·&nbsp; Pages: ${bench.output.pagesScanned}/${bench.output.totalPages}</small></header>\n<pre>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>\n</body></html>`;
        mime = 'text/html'; ext = 'html'; break;
      case 'json':
        content = JSON.stringify({
          title, target: bench.target, parser: bench.output.parser || 'PDF.js',
          pagesScanned: bench.output.pagesScanned, totalPages: bench.output.totalPages,
          chars: bench.output.chars, exportedAt: new Date().toISOString(), text,
        }, null, 2);
        mime = 'application/json'; ext = 'json'; break;
      case 'rst': {
        const underline = (s, ch) => s + '\n' + ch.repeat(s.length);
        content = `${underline(title, '=')}\n\n.. extracted:: ${bench.target}\n.. parser:: ${bench.output.parser || 'PDF.js'}\n.. pages:: ${bench.output.pagesScanned}/${bench.output.totalPages}\n\n${text}`;
        mime = 'text/x-rst'; ext = 'rst'; break;
      }
      case 'csv': {
        const rows = text.split('\n').map(line => `"${line.replace(/"/g, '""')}"`);
        content = 'line\n' + rows.join('\n');
        mime = 'text/csv'; ext = 'csv'; break;
      }
      default: return;
    }
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${stem}_${bench.target}.${ext}`;
    a.click(); URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const copyOutput = () => {
    if (!bench.output) return;
    navigator.clipboard.writeText(bench.output.text).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    });
  };

  const runBench = async () => {
    const paper = papersWithFile.find(p => p.id === bench.paperId);
    if (!paper) return;
    const selectedParser = BUILTIN_PARSERS.find(p => p.id === bench.parserId);
    const useServer = selectedParser?.type === 'local-server' || selectedParser?.type === 'cloud-api';
    setBench(b => ({ ...b, running: true, output: null, error: null, progress: null }));
    try {
      let result;
      if (useServer) {
        // Stream NDJSON from the parser server — read progress line by line
        const response = await fetch('http://127.0.0.1:7432/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: paper.filePath,
            target: bench.target,
            parser: bench.parserId,
            customPages: bench.useCustomPages && bench.customPages.trim() ? bench.customPages.trim() : null,
            doclingFormat: bench.doclingFormat || 'markdown',
            llamaApiKey: llamaApiKey || undefined,
          }),
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line);
            if (msg.type === 'progress') {
              setBench(b => ({ ...b, progress: { page: msg.page, total: msg.total, status: msg.status || null } }));
            } else if (msg.type === 'result') {
              if (!msg.ok) throw new Error(msg.error || 'Server error');
              result = msg;
            }
          }
        }
        if (!result) throw new Error('Server returned no result');
      } else {
        result = { ...(await extractPdfText(paper.filePath, bench.target)), parser: 'PDF.js' };
      }
      if (anyPostProc && result?.text) result = { ...result, text: applyPostProc(result.text), chars: applyPostProc(result.text).length };
      setBench(b => ({ ...b, running: false, output: result, progress: null }));
    } catch (e) {
      // On connection errors, fetch server log to show what happened
      let errorMsg = e.message;
      try {
        const status = await window.electronAPI?.pymupdfStatus?.();
        if (status?.log) {
          setServerLog(status.log);
          if (!status.running) errorMsg += '\n\nServer crashed. Check server log below.';
        }
      } catch (_) { /* ignore */ }
      setBench(b => ({ ...b, running: false, error: errorMsg, progress: null }));
    }
  };

  const readiness = computeReadiness(s);

  const set = (section, patch) =>
    setS(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }));

  const setField = (section, subkey, key, val) =>
    setS(prev => ({
      ...prev,
      [section]: { ...prev[section], [subkey]: { ...prev[section][subkey], [key]: val } },
    }));

  const upsert = (key, item) =>
    setS(prev => {
      const exists = prev[key].some(x => x.id === item.id);
      return { ...prev, [key]: exists
        ? prev[key].map(x => x.id === item.id ? item : x)
        : [...prev[key], item] };
    });

  const remove = (key, id) =>
    setS(prev => ({ ...prev, [key]: prev[key].filter(x => x.id !== id) }));

  const newId = (p) => `${p}-${Date.now()}`;

  const scoreColor = readiness.score >= readiness.max * 0.85 ? ACC
    : readiness.score >= readiness.max * 0.5 ? '#fbbf24' : '#ef4444';
  const scoreLabel = readiness.score >= readiness.max * 0.85 ? 'Ready'
    : readiness.score >= readiness.max * 0.5 ? 'Partial' : 'Not Ready';

  // Aggregate manual extraction activity from papers
  const manualStats = useMemo(() => {
    const counts = { claims: 0, definitions: 0, events: 0, processes: 0 };
    const recentItems = [];
    let papersWithExtractions = 0;
    papers.forEach(paper => {
      const ref = [paper.authors ? paper.authors.split(',')[0].trim() : null, paper.year]
        .filter(Boolean).join(', ');
      let paperHasItems = false;
      (paper.claims      || []).forEach(cl => { counts.claims++;      paperHasItems = true; recentItems.push({ type: 'claims',      text: cl.text,  paper: paper.title, ref, page: cl.sourcePage, createdAt: cl.createdAt || 0 }); });
      (paper.definitions || []).forEach(d  => { counts.definitions++; paperHasItems = true; recentItems.push({ type: 'definitions', text: d.term,    paper: paper.title, ref, page: d.sourcePage,  createdAt: d.createdAt  || 0 }); });
      (paper.events      || []).forEach(ev => { counts.events++;      paperHasItems = true; recentItems.push({ type: 'events',      text: ev.name,  paper: paper.title, ref, page: ev.sourcePage, createdAt: ev.createdAt || 0 }); });
      (paper.processes   || []).forEach(pr => { counts.processes++;   paperHasItems = true; recentItems.push({ type: 'processes',   text: pr.name,  paper: paper.title, ref, page: pr.sourcePage, createdAt: pr.createdAt || 0 }); });
      if (paperHasItems) papersWithExtractions++;
    });
    recentItems.sort((a, b) => b.createdAt - a.createdAt);
    const total = counts.claims + counts.definitions + counts.events + counts.processes;
    return { counts, total, papersWithExtractions, recent: recentItems.slice(0, 8) };
  }, [papers]);

  const syncToPipeline = () => {
    const patch = {};
    Object.entries(MANUAL_TO_KE).forEach(([manualKey, keKey]) => {
      if (manualStats.counts[manualKey] > 0) patch[keKey] = true;
    });
    if (Object.keys(patch).length > 0) {
      setS(prev => ({
        ...prev,
        knowledgeExtraction: {
          ...prev.knowledgeExtraction,
          types: { ...prev.knowledgeExtraction.types, ...patch },
        },
      }));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Manual Extraction Activity ── */}
      {mode !== 'parsing' && <SectionCard
        icon={Highlighter}
        title="Manual Extraction Activity"
        badge={manualStats.total > 0
          ? `${manualStats.total} item${manualStats.total !== 1 ? 's' : ''} · ${manualStats.papersWithExtractions} paper${manualStats.papersWithExtractions !== 1 ? 's' : ''}`
          : 'no activity yet'}
        defaultOpen={manualStats.total > 0}
      >
        {manualStats.total === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No items manually extracted yet. Open a paper, highlight text, and use the KB actions (Create KB Claim, Extract as Definition, etc.) to start building the corpus.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Per-type coverage matrix */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Type Coverage
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 7 }}>
                {MANUAL_TYPE_CFG.map(({ key, label, color, Icon, keKey }) => {
                  const count = manualStats.counts[key];
                  if (!count) return null;
                  const inPipeline = keKey && s.knowledgeExtraction.types[keKey];
                  const canSync    = keKey && !inPipeline;
                  return (
                    <div key={key} style={{
                      padding: '9px 12px', borderRadius: 8,
                      background: `color-mix(in srgb, ${color} 6%, transparent)`,
                      border: `1px solid ${color}33`,
                      display: 'flex', gap: 8, alignItems: 'center',
                    }}>
                      <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color }}>
                          {count} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
                        </div>
                        <div style={{ fontSize: 10, marginTop: 2 }}>
                          {inPipeline ? (
                            <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <CheckCircle2 size={10} /> In pipeline
                            </span>
                          ) : canSync ? (
                            <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <AlertCircle size={10} /> Not in pipeline
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>No pipeline type</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sync button — only show if there are unconfigured types */}
            {MANUAL_TYPE_CFG.some(({ key, keKey }) => manualStats.counts[key] > 0 && keKey && !s.knowledgeExtraction.types[keKey]) && (
              <button
                onClick={syncToPipeline}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${ACC}55`,
                  background: `color-mix(in srgb, ${ACC} 8%, transparent)`,
                  color: ACC, fontSize: 12, fontWeight: 600, alignSelf: 'flex-start',
                }}
              >
                <Zap size={13} /> Sync extracted types to pipeline config
              </button>
            )}

            {/* Recent activity feed */}
            {manualStats.recent.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Recent Extractions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {manualStats.recent.map((item, i) => {
                    const tc = MANUAL_TYPE_CFG.find(x => x.key === item.type);
                    return (
                      <div key={i} style={{
                        padding: '7px 10px', borderRadius: 7,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', gap: 8, alignItems: 'center',
                      }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, flexShrink: 0,
                          background: `color-mix(in srgb, ${tc.color} 12%, transparent)`,
                          border: `1px solid ${tc.color}44`, color: tc.color,
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                        }}>
                          {tc.label.slice(0, -1)}
                        </span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.text.length > 70 ? item.text.slice(0, 70) + '…' : item.text}
                        </span>
                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, opacity: 0.7,
                          maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.paper.length > 20 ? item.paper.slice(0, 20) + '…' : item.paper}
                          {item.page ? ` · p.${item.page}` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>}

      {/* ── Readiness score ── */}
      {mode !== 'parsing' && (<>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
              Pipeline Readiness Score
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {Math.round((readiness.score / readiness.max) * 100)}%
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
                background: `${scoreColor}18`, color: scoreColor, border: `1px solid ${scoreColor}44` }}>
                {scoreLabel}
              </span>
            </div>
          </div>
          <div style={{ flex: 1, height: 8, borderRadius: 99,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${(readiness.score / readiness.max) * 100}%`,
              background: `linear-gradient(90deg, ${scoreColor}aa, ${scoreColor})`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            {readiness.score.toFixed(1)} / {readiness.max}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 7 }}>
          {readiness.criteria.map((c, i) => {
            const icon = c.met ? <CheckCircle2 size={13} color={ACC} />
              : c.partial ? <AlertCircle size={13} color="#fbbf24" />
              : <Circle size={13} color="#64748b" />;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 7,
                background: c.met ? cr(0.06) : 'rgba(255,255,255,0.02)',
                border: `1px solid ${c.met ? cr(0.2) : 'rgba(255,255,255,0.06)'}` }}>
                {icon}
                <span style={{ fontSize: 11,
                  color: c.met ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  {c.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      </>)}

      {/* ── 1. Document Parsers ── (modal trigger) */}
      {showParsersModal && (() => {
        const speedColors  = { fast: '#34d399', medium: '#fbbf24', slow: '#fb923c' };
        const inputColors  = { text: '#38bdf8', scanned: '#fb923c', any: '#a78bfa', 'multi-format': '#34d399' };
        const inputLabels  = { text: 'Text PDF', scanned: 'Scanned PDF', any: 'Any PDF', 'multi-format': 'Multi-format' };
        const outputColors = { plain: '#94a3b8', markdown: '#34d399', elements: '#a78bfa' };
        const outputLabels = { plain: 'Plain text', markdown: 'Markdown', elements: 'Elements' };
        return (
          <div onClick={() => setShowParsersModal(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1200,
              background: '#070d1a', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              paddingTop: 40, paddingBottom: 40 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 860, maxHeight: 'calc(100vh - 80px)',
                display: 'flex', flexDirection: 'column',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden' }}>
              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '16px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: cr(0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileInput size={15} color={ACC} />
                </div>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                  Document Parsers
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
                  background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}` }}>
                  {BUILTIN_PARSERS.length + s.parsers.length} parsers
                </span>
                {/* Definitions toggle button — in header so it's always visible */}
                <button onClick={() => setShowParserDefs(v => !v)}
                  style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    cursor: 'pointer', letterSpacing: '0.04em',
                    background: showParserDefs ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${showParserDefs ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
                    color: showParserDefs ? '#38bdf8' : 'var(--text-muted)' }}>
                  {showParserDefs ? '▲ Definitions' : '? Definitions'}
                </button>
                <button onClick={() => setShowParsersModal(false)}
                  style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px' }}>×</button>
              </div>

              {/* ── Definitions panel — below header, above scrollable list ── */}
              {showParserDefs && (
                <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)',
                  padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14,
                  background: 'rgba(56,189,248,0.03)', overflowY: 'auto', maxHeight: 340,
                  scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8',
                    textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Concepts & Definitions
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Input types */}
                      {[
                        { heading: 'Input Types', color: '#38bdf8', items: [
                          { term: 'Text PDF',        def: 'Digitally-created PDF with an embedded text layer (exported from Word, LaTeX, etc.). Text is directly selectable and readable without OCR.' },
                          { term: 'Scanned PDF',     def: 'Photographed or printed-then-scanned pages. Pixels only — no text layer exists. Requires OCR to extract any text.' },
                          { term: 'Mixed PDF',       def: 'Some pages are digital (text layer), some are scanned images. A mixed-mode parser or OCR is needed to handle both.' },
                          { term: 'Multi-format',    def: 'Office and web formats: DOCX, PPTX, XLSX, HTML. These have rich internal structure. Only Markitdown handles them.' },
                        ]},
                        { heading: 'Parser Types', color: '#a78bfa', items: [
                          { term: 'Text layer',      def: 'Reads the embedded text operators in the PDF directly. Fast and accurate for digital PDFs. Completely blind to scanned content.' },
                          { term: 'OCR',             def: 'Renders each page as a high-res image, then uses a neural network to recognise characters from pixels. Slow, works on scans, can hallucinate on noise.' },
                          { term: 'ML elements',     def: 'Combines text extraction + vision models to classify every block as Title, Paragraph, Table, List, etc. Handles both text and scanned PDFs.' },
                          { term: 'ML layout',       def: 'Deep-learning pipeline (DocLayNet + TableFormer) that reconstructs reading order, heading hierarchy, and table structure. Highest fidelity, slowest speed.' },
                          { term: 'Converter',       def: 'Transcodes the document format to Markdown rather than "extracting" text. Preserves headings, lists, tables, and hyperlinks. Not an OCR tool.' },
                        ]},
                        { heading: 'Output Types', color: '#34d399', items: [
                          { term: 'Plain text',      def: 'A flat string — no headings, no formatting, no tables. What every parser except Markitdown produces.' },
                          { term: 'Markdown',        def: 'Structured text with # headings, | tables, - lists, and [links]. Only Markitdown produces this natively. Pair with the MD render toggle to see it formatted.' },
                        ]},
                      ].map(({ heading, color, items }) => (
                        <div key={heading}>
                          <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase',
                            letterSpacing: '0.07em', marginBottom: 7, marginTop: 10 }}>
                            {heading}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {items.map(({ term, def }) => (
                              <div key={term} style={{ display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.5 }}>
                                <span style={{ fontWeight: 700, color, whiteSpace: 'nowrap',
                                  minWidth: 110, flexShrink: 0 }}>{term}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{def}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Modal body — scrollable */}
              <div style={{ overflowY: 'auto', padding: '20px 22px',
                display: 'flex', flexDirection: 'column', gap: 10,
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>

                {/* Built-in parsers */}
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                  Built-in
                </div>
                {BUILTIN_PARSERS.map(p => {
            const speedC = speedColors[p.speed] || '#94a3b8';
            return (
            <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8,
              padding: '14px 16px', borderRadius: 10,
              background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.18)' }}>

              {/* Header row: name + badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(52,211,153,0.12)', color: '#34d399',
                  border: '1px solid rgba(52,211,153,0.35)', textTransform: 'uppercase',
                  letterSpacing: '0.07em' }}>Active</span>
                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
                  border: '1px solid rgba(255,255,255,0.08)' }}>{p.tag}</span>
                {p.website && (
                  <button
                    onClick={() => window.electronAPI?.gpuOpenUrl?.(p.website) ?? window.open(p.website, '_blank')}
                    title={p.website}
                    style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)',
                      color: '#38bdf8', cursor: 'pointer', marginLeft: 'auto',
                      display: 'flex', alignItems: 'center', gap: 3 }}>
                    ↗ Docs
                  </button>
                )}
              </div>

              {/* Description */}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                {p.description}
              </div>

              {/* Pipeline badges: Input → Method → Output + Speed */}
              {(() => {
                const inputTitles = {
                  text:          'Text PDF — digitally-created PDF with an embedded text layer. Text is directly selectable. No OCR needed.',
                  scanned:       'Scanned PDF — photographed or printed-then-scanned pages. Pixels only, no text layer. Requires OCR.',
                  any:           'Any PDF — handles both text-layer and scanned pages using ML models.',
                  'multi-format':'Multi-format — handles DOCX, PPTX, XLSX, HTML and PDF. Only Markitdown supports these office/web formats.',
                };
                const methodTitles = {
                  'Text layer':  'Text-layer extraction — reads embedded text operators in the PDF directly. Fast and accurate for digital PDFs. Completely blind to scanned content.',
                  'OCR':         'OCR — renders each page as a high-res image then uses a neural network to recognise characters from pixels. Slow, works on scans, can hallucinate on noise.',
                  'ML elements': 'ML elements — classifies every block as Title, Paragraph, Table, List, etc. using vision models. Handles both text and scanned PDFs.',
                  'ML layout':   'ML layout — deep-learning pipeline (DocLayNet + TableFormer) that reconstructs reading order, heading hierarchy, and table structure. Highest fidelity, slowest speed.',
                  'Converter':   'Format converter — transcodes the document to Markdown rather than extracting raw text. Preserves headings, lists, tables, and hyperlinks. Not an OCR tool.',
                };
                const outputTitles = {
                  plain:    'Plain text — a flat string with no formatting. What every parser except Markitdown produces.',
                  markdown: 'Markdown — structured text with # headings, | tables, - lists, and [links]. Only Markitdown produces this natively. Pair with the MD render toggle.',
                };
                const speedTitles = {
                  fast:   'Fast — typically completes in under 2 seconds per document.',
                  medium: 'Medium — several seconds per document depending on size and complexity.',
                  slow:   'Slow — may take 10–60+ seconds. ML model loading and inference are expensive.',
                };
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span title={inputTitles[p.inputType] || ''}
                      style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6, cursor: 'help',
                        background: `color-mix(in srgb, ${inputColors[p.inputType] || '#94a3b8'} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${inputColors[p.inputType] || '#94a3b8'} 30%, transparent)`,
                        color: inputColors[p.inputType] || '#94a3b8' }}>
                      {inputLabels[p.inputType] || p.inputType}
                    </span>
                    <span style={{ fontSize: 10, color: '#334155' }}>→</span>
                    <span title={methodTitles[p.method] || ''}
                      style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6, cursor: 'help',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)' }}>
                      {p.method}
                    </span>
                    <span style={{ fontSize: 10, color: '#334155' }}>→</span>
                    <span title={outputTitles[p.outputFormat] || ''}
                      style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6, cursor: 'help',
                        background: `color-mix(in srgb, ${outputColors[p.outputFormat] || '#94a3b8'} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${outputColors[p.outputFormat] || '#94a3b8'} 30%, transparent)`,
                        color: outputColors[p.outputFormat] || '#94a3b8' }}>
                      {outputLabels[p.outputFormat] || p.outputFormat}
                    </span>
                    <span title={speedTitles[p.speed] || ''}
                      style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, marginLeft: 'auto', cursor: 'help',
                        background: `color-mix(in srgb, ${speedC} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${speedC} 30%, transparent)`,
                        color: speedC, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {p.speed}
                    </span>
                  </div>
                );
              })()}

              {/* Format + target badges */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {p.formats.map(f => (
                  <span key={f} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8,
                    background: cr(0.08), border: `1px solid ${cr(0.25)}`, color: ACC }}>{f}</span>
                ))}
                {p.targets.map(t => {
                  const tc = EXTRACTION_TARGETS.find(x => x.id === t);
                  return tc ? (
                    <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8,
                      background: `color-mix(in srgb, ${tc.color} 8%, transparent)`,
                      border: `1px solid ${tc.color}33`, color: tc.color }}>
                      {tc.label}
                    </span>
                  ) : null;
                })}
              </div>

              {/* Best for */}
              {p.bestFor && (
                <div style={{ fontSize: 10, color: '#38bdf8', padding: '5px 8px', borderRadius: 6,
                  background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)',
                  lineHeight: 1.4 }}>
                  <strong style={{ fontWeight: 700 }}>Best for:</strong> {p.bestFor}
                </div>
              )}

              {/* Strengths + Limitations (collapsible) */}
              <details style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                <summary style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600,
                  color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Strengths & Limitations
                </summary>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                  {/* Strengths */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#34d399', textTransform: 'uppercase',
                      letterSpacing: '0.06em', marginBottom: 4 }}>Strengths</div>
                    {(p.strengths || []).map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, lineHeight: 1.4 }}>
                        <span style={{ color: '#34d399', flexShrink: 0 }}>+</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                  {/* Limitations */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', textTransform: 'uppercase',
                      letterSpacing: '0.06em', marginBottom: 4 }}>Limitations</div>
                    {(p.limitations || []).map((l, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, lineHeight: 1.4 }}>
                        <span style={{ color: '#f87171', flexShrink: 0 }}>−</span>
                        <span>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>

              {/* Tech footer */}
              {p.tech && (
                <div style={{ fontSize: 9, color: '#475569', fontFamily: 'var(--font-mono)',
                  padding: '4px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.15)',
                  lineHeight: 1.4, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {p.tech}
                </div>
              )}
            </div>
            );
                })}

                {/* Configured parsers */}
                {s.parsers.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, marginBottom: 2 }}>
                    Configured
                  </div>
                )}
                {s.parsers.map(p => {
                  const sc = PARSER_STATUSES.find(o => o.value === p.status) || PARSER_STATUSES[0];
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 14px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.library}</span>
                          {p.version && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              v{p.version}
                            </span>
                          )}
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                            background: `${sc.color}18`, color: sc.color, border: `1px solid ${sc.color}44`,
                            textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            {sc.label}
                          </span>
                        </div>
                        {p.supportedFormats.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                            {p.supportedFormats.map(f => (
                              <span key={f} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8,
                                background: cr(0.08), border: `1px solid ${cr(0.25)}`, color: ACC }}>{f}</span>
                            ))}
                          </div>
                        )}
                        {p.configPath && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {p.configPath}
                          </div>
                        )}
                        {p.notes && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{p.notes}</div>
                        )}
                      </div>
                      <button onClick={() => setParserModal(p)} style={ghostBtn}><Edit2 size={11} /></button>
                      <button onClick={() => remove('parsers', p.id)} style={dangerBtn}><Trash2 size={11} /></button>
                    </div>
                  );
                })}

                <button onClick={() => setParserModal({ id: newId('par'), library: 'PyMuPDF',
                  version: '', supportedFormats: [], configPath: '', notes: '', status: 'configured' })}
                  style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
                    borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
                  <Plus size={13} /> Add Parser
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {mode === 'parsing' ? (<>
      {/* ── 1b. Parser Test Bench ── */}
        <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 130px)', minHeight: 500 }}>

          {/* ── LlamaParse API Key Modal ── */}
          {showLlamaKeyModal && (
            <div onClick={() => setShowLlamaKeyModal(false)} style={{
              position: 'fixed', inset: 0, zIndex: 1300,
              background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                width: 420, background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16 }}>🔑</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>LlamaParse API Key</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Stored locally — never sent anywhere except LlamaCloud
                    </div>
                  </div>
                  <button onClick={() => setShowLlamaKeyModal(false)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none',
                      color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>×</button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Get your key at{' '}
                    <a href="https://cloud.llamaindex.ai" target="_blank" rel="noreferrer"
                      style={{ color: '#60a5fa' }}>cloud.llamaindex.ai</a>
                    {' '}→ API Keys.
                  </div>

                  {/* Key input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.07em' }}>API Key</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type={showLlamaKeyText ? 'text' : 'password'}
                        value={llamaKeyDraft}
                        onChange={e => setLlamaKeyDraft(e.target.value)}
                        placeholder="llx-…"
                        autoComplete="off"
                        spellCheck={false}
                        style={{
                          flex: 1, background: 'rgba(255,255,255,0.04)',
                          border: `1px solid ${llamaKeyDraft ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.12)'}`,
                          borderRadius: 7, padding: '8px 12px', fontSize: 13,
                          color: 'var(--text)', outline: 'none', fontFamily: 'var(--font-mono)',
                          letterSpacing: llamaKeyDraft && !showLlamaKeyText ? '0.15em' : undefined,
                        }}
                      />
                      <button
                        onClick={() => setShowLlamaKeyText(v => !v)}
                        title={showLlamaKeyText ? 'Hide key' : 'Show key'}
                        style={{
                          flexShrink: 0, width: 36, borderRadius: 7, cursor: 'pointer',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                          color: 'var(--text-muted)', fontSize: 15, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                        {showLlamaKeyText ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>

                  {/* Current key status */}
                  {llamaApiKey && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#34d399' }}>●</span>
                      Key saved:{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                        {llamaApiKey.slice(0, 6)}{'•'.repeat(12)}{llamaApiKey.slice(-4)}
                      </span>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => {
                        const trimmed = llamaKeyDraft.trim();
                        if (!trimmed) return;
                        localStorage.setItem('kb.llamaApiKey', trimmed);
                        setLlamaApiKey(trimmed);
                        setShowLlamaKeyModal(false);
                      }}
                      disabled={!llamaKeyDraft.trim()}
                      style={{
                        flex: 1, padding: '9px 0', borderRadius: 8, fontWeight: 700, fontSize: 13,
                        cursor: llamaKeyDraft.trim() ? 'pointer' : 'not-allowed',
                        background: llamaKeyDraft.trim() ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${llamaKeyDraft.trim() ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        color: llamaKeyDraft.trim() ? '#60a5fa' : 'var(--text-muted)',
                        opacity: llamaKeyDraft.trim() ? 1 : 0.5,
                      }}>
                      Save Key
                    </button>
                    {llamaApiKey && (
                      <button
                        onClick={() => {
                          localStorage.removeItem('kb.llamaApiKey');
                          setLlamaApiKey('');
                          setLlamaKeyDraft('');
                        }}
                        style={{
                          padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12,
                          cursor: 'pointer',
                          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                          color: '#f87171',
                        }}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Controls panel ── */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14,
            overflowY: 'auto', paddingLeft: 8, paddingRight: 16,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

            {/* Server section — framed */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              padding: '8px 10px', borderRadius: 8,
              border: `1px solid ${pymupdfOnline ? 'rgba(52,211,153,0.35)' : pymupdfStarting ? 'rgba(251,146,60,0.3)' : 'rgba(100,116,139,0.25)'}`,
              background: pymupdfOnline ? 'rgba(52,211,153,0.04)' : pymupdfStarting ? 'rgba(251,146,60,0.04)' : 'rgba(100,116,139,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: pymupdfOnline ? '#34d399' : pymupdfStarting ? '#fb923c' : '#64748b' }}>
                  {pymupdfOnline ? '● Server running' : pymupdfStarting ? '◌ Starting…' : '○ Server offline'}
                </span>
                {!pymupdfOnline ? (
                  <button onClick={startPymupdf} disabled={pymupdfStarting}
                    style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.3)',
                      color: '#fb923c', cursor: pymupdfStarting ? 'not-allowed' : 'pointer',
                      opacity: pymupdfStarting ? 0.6 : 1 }}>
                    {pymupdfStarting ? 'Starting…' : 'Start'}
                  </button>
                ) : (
                  <button onClick={stopPymupdf}
                    style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
                      color: '#f87171', cursor: 'pointer' }}>
                    Stop
                  </button>
                )}
              </div>
              {serverError && (
                <div style={{ fontSize: 11, color: '#f87171', padding: '7px 10px', borderRadius: 6,
                  background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
                  fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  lineHeight: 1.5 }}>
                  {serverError}
                </div>
              )}
              {serverLog && (
                <details style={{ fontSize: 10, color: '#94a3b8' }}>
                  <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Server log</summary>
                  <pre style={{ fontSize: 10, color: '#94a3b8', padding: '6px 8px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.2)', maxHeight: 150, overflow: 'auto', marginTop: 4,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.4 }}>
                    {serverLog}
                  </pre>
                </details>
              )}
            </div>

            {/* Paper picker */}
            <FL label="Document">
              {papersWithFile.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>
                  No papers with a linked PDF. Open a paper in Edit and set a file path.
                </div>
              ) : (
                <select value={bench.paperId}
                  onChange={e => { setBench(b => ({ ...b, paperId: e.target.value, output: null, error: null })); setPdfTypeResult(null); setCompareResults({}); }}
                  style={selectSx}>
                  <option value="">— select a paper —</option>
                  {papersWithFile.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title.length > 48 ? p.title.slice(0, 48) + '…' : p.title}
                    </option>
                  ))}
                </select>
              )}
            </FL>

            {/* Document type detection — always visible */}
            {papersWithFile.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Detection results card — always visible, clickable when empty */}
                {(() => {
                  const paper = papersWithFile.find(p => p.id === bench.paperId);
                  const ext = (paper?.filePath || '').split('.').pop()?.toLowerCase();
                  const officeExts = ['docx','doc','pptx','ppt','xlsx','xls','html','htm','csv','tsv','rtf','epub'];
                  const isOffice = officeExts.includes(ext);
                  const canDetect = bench.paperId && (isOffice || pymupdfOnline);
                  const isEmpty = !pdfTypeResult && !detectingType;
                  return (
                <div
                  onClick={isEmpty && canDetect ? detectPdfType : undefined}
                  title={isEmpty ? (!canDetect ? 'Start the parser server first' : 'Detect document type') : undefined}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    padding: '8px 10px', borderRadius: 8,
                    background: pdfTypeResult && !pdfTypeResult.error
                      ? `color-mix(in srgb, ${{ text: '#34d399', mixed: '#fbbf24', scanned: '#f87171', office: '#a78bfa' }[pdfTypeResult.type] || '#94a3b8'} 6%, transparent)`
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${pdfTypeResult && !pdfTypeResult.error
                      ? `color-mix(in srgb, ${{ text: '#34d399', mixed: '#fbbf24', scanned: '#f87171', office: '#a78bfa' }[pdfTypeResult.type] || '#94a3b8'} 30%, transparent)`
                      : isEmpty ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    minHeight: 110,
                    cursor: isEmpty && canDetect ? 'pointer' : 'default',
                    opacity: isEmpty && !canDetect ? 0.5 : 1,
                  }}>
                  {!pdfTypeResult && !detectingType && (
                    <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4,
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      textAlign: 'center',
                      color: !bench.paperId ? 'var(--text-muted)' : canDetect ? '#38bdf8' : 'var(--text-muted)' }}>
                      {!bench.paperId
                        ? 'Select a document above to detect its type'
                        : canDetect ? 'Detect document type' : 'Start server to detect document type'}
                    </div>
                  )}
                  {detectingType && (
                    <div style={{ fontSize: 10, color: '#38bdf8', lineHeight: 1.4,
                      flex: 1, display: 'flex', alignItems: 'center' }}>
                      Analyzing document…
                    </div>
                  )}
                  {pdfTypeResult?.error && (
                    <div style={{ fontSize: 10, color: '#f87171', lineHeight: 1.4 }}>
                      {pdfTypeResult.error}
                    </div>
                  )}
                  {pdfTypeResult && !pdfTypeResult.error && (() => {
                    const colors = { text: '#34d399', mixed: '#fbbf24', scanned: '#f87171', office: '#a78bfa' };
                    const labels = { text: 'Text PDF', mixed: 'Mixed PDF', scanned: 'Scanned PDF', office: pdfTypeResult.format || 'Office' };
                    const icons  = { text: '📄', mixed: '📄', scanned: '🖼', office: '📁' };
                    const c = colors[pdfTypeResult.type] || '#94a3b8';
                    const lbl = labels[pdfTypeResult.type] || pdfTypeResult.type;
                    const ico = icons[pdfTypeResult.type] || '📄';
                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{ico} {lbl}</span>
                          {pdfTypeResult.totalPages > 0 && (
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                              {pdfTypeResult.totalPages} pages · ~{pdfTypeResult.avgCharsPerPage} chars/pg
                              {pdfTypeResult.avgImagesPerPage > 0 ? ` · ~${pdfTypeResult.avgImagesPerPage} img/pg` : ''}
                            </span>
                          )}
                        </div>
                        {pdfTypeResult.type !== 'office' && pdfTypeResult.samplePages > 0 && (
                          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                            {pdfTypeResult.pageStats?.map((ps, i) => (
                              <div key={i} title={`Page ${ps.page}: ${ps.chars} chars, ${ps.images} images`}
                                style={{
                                  flex: 1, height: 6, borderRadius: 3,
                                  background: ps.hasText
                                    ? 'rgba(52,211,153,0.5)'
                                    : 'rgba(248,113,113,0.5)',
                                }} />
                            ))}
                            <span style={{ fontSize: 8, color: '#64748b', flexShrink: 0, marginLeft: 2 }}>
                              {pdfTypeResult.pagesWithText}/{pdfTypeResult.samplePages} text
                            </span>
                          </div>
                        )}
                        {pdfTypeResult.reason && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {pdfTypeResult.reason}
                          </div>
                        )}
                        {pdfTypeResult.alt && (
                          <button
                            onClick={() => setBench(b => ({ ...b, parserId: pdfTypeResult.alt, output: null, error: null }))}
                            style={{ fontSize: 9, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                              cursor: 'pointer', alignSelf: 'flex-start',
                              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-muted)' }}
                            title={pdfTypeResult.altReason}>
                            Or try: {BUILTIN_PARSERS.find(p => p.id === pdfTypeResult.alt)?.name || pdfTypeResult.alt}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
                  );
                })()}
              </div>
            )}

            {/* Parser selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em' }}>Parser</label>

              {/* Single parser — custom styled dropdown */}
              {!compareMode && (() => {
                const selected = BUILTIN_PARSERS.find(p => p.id === bench.parserId);
                const doclingFmts = [
                  { id: 'markdown', label: 'Markdown',   suffix: 'MD',   color: '#34d399' },
                  { id: 'text',     label: 'Plain text', suffix: 'TXT',  color: '#94a3b8' },
                  { id: 'json',     label: 'JSON',       suffix: 'JSON', color: '#fb923c' },
                ];
                const typeColors = {
                  'client-side': '#38bdf8', 'local-server': '#34d399', 'cloud-api': '#60a5fa',
                };
                const isDocling = bench.parserId === 'docling';
                const activeFmt = doclingFmts.find(f => f.id === bench.doclingFormat) || doclingFmts[0];
                const displayLabel = isDocling
                  ? `${selected?.name} → ${activeFmt.label}`
                  : `${selected?.name || 'Select parser'}`;
                const displayTag = selected?.tag || '';
                const displayColor = isDocling ? activeFmt.color : (typeColors[selected?.type] || '#94a3b8');

                return (
                  <div style={{ position: 'relative' }}>
                    {/* Trigger button */}
                    <button
                      onClick={() => setParserDropdownOpen(v => !v)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
                        background: `color-mix(in srgb, ${displayColor} 6%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${displayColor} 25%, transparent)`,
                      }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: displayColor,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayLabel}
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{displayTag}</div>
                      </div>
                      <ChevronDown size={13} color="var(--text-muted)"
                        style={{ transform: parserDropdownOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.15s', flexShrink: 0 }} />
                    </button>

                    {/* Dropdown menu */}
                    {parserDropdownOpen && (
                      <>
                        <div onClick={() => setParserDropdownOpen(false)}
                          style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                          marginTop: 4, borderRadius: 8, overflow: 'hidden',
                          background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.12)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                          maxHeight: 200, overflowY: 'auto',
                          scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
                        }}>
                          {BUILTIN_PARSERS.map(p => {
                            const isActive = bench.parserId === p.id && p.id !== 'docling';
                            const c = typeColors[p.type] || '#94a3b8';
                            if (p.id === 'docling') {
                              return (
                                <div key={p.id}>
                                  <div style={{ fontSize: 8, fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: '0.08em',
                                    padding: '8px 12px 3px' }}>
                                    {p.name} — {p.tag}
                                  </div>
                                  {doclingFmts.map(fmt => {
                                    const isSel = bench.parserId === 'docling' && bench.doclingFormat === fmt.id;
                                    return (
                                      <button key={`docling-${fmt.id}`}
                                        onClick={() => {
                                          setBench(b => ({ ...b, parserId: 'docling', doclingFormat: fmt.id, output: null, error: null }));
                                          setParserDropdownOpen(false);
                                        }}
                                        style={{
                                          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                          padding: '7px 12px 7px 22px', cursor: 'pointer', textAlign: 'left',
                                          background: isSel ? `color-mix(in srgb, ${fmt.color} 8%, transparent)` : 'transparent',
                                          border: 'none', borderLeft: isSel ? `3px solid ${fmt.color}` : '3px solid transparent',
                                        }}>
                                        <span style={{ fontSize: 11, fontWeight: 600,
                                          color: isSel ? fmt.color : 'var(--text)' }}>
                                          {fmt.label}
                                        </span>
                                        <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                                          background: `color-mix(in srgb, ${fmt.color} 12%, transparent)`,
                                          color: fmt.color, marginLeft: 'auto' }}>
                                          {fmt.suffix}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            }
                            return (
                              <button key={p.id}
                                onClick={() => {
                                  setBench(b => ({ ...b, parserId: p.id, output: null, error: null }));
                                  setParserDropdownOpen(false);
                                }}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '7px 12px', cursor: 'pointer', textAlign: 'left',
                                  background: isActive ? `color-mix(in srgb, ${c} 8%, transparent)` : 'transparent',
                                  border: 'none', borderLeft: isActive ? `3px solid ${c}` : '3px solid transparent',
                                }}>
                                <span style={{ fontSize: 11, fontWeight: 600,
                                  color: isActive ? c : 'var(--text)' }}>
                                  {p.name}
                                </span>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                  {p.tag}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* LlamaParse API key button — shown when llamaparse is selected */}
              {!compareMode && bench.parserId === 'llamaparse' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => { setLlamaKeyDraft(llamaApiKey); setShowLlamaKeyText(false); setShowLlamaKeyModal(true); }}
                    style={{
                      flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 7,
                      cursor: 'pointer', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6,
                      background: llamaApiKey ? 'rgba(96,165,250,0.08)' : 'rgba(251,146,60,0.1)',
                      border: `1px solid ${llamaApiKey ? 'rgba(96,165,250,0.3)' : 'rgba(251,146,60,0.35)'}`,
                      color: llamaApiKey ? '#60a5fa' : '#fb923c',
                    }}>
                    <span style={{ fontSize: 13 }}>{llamaApiKey ? '🔑' : '⚠️'}</span>
                    {llamaApiKey ? 'API Key set' : 'Set API Key'}
                  </button>
                  {llamaApiKey && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                      {llamaApiKey.slice(0, 4)}{'•'.repeat(8)}
                    </span>
                  )}
                </div>
              )}

              {/* Compare mode — checkboxes */}
              {compareMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Select up to 3 parsers to compare
                  </div>
                  {BUILTIN_PARSERS.map(p => {
                    const isSelected = compareParsers.has(p.id);
                    const isDisabled = !isSelected && compareParsers.size >= 3;
                    return (
                      <label key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, cursor: isDisabled ? 'not-allowed' : 'pointer',
                        padding: '6px 10px', borderRadius: 7, opacity: isDisabled ? 0.4 : 1,
                        background: isSelected ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      }}>
                        <input type="checkbox" checked={isSelected} disabled={isDisabled}
                          onChange={e => {
                            setCompareParsers(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(p.id); else next.delete(p.id);
                              return next;
                            });
                            setCompareResults({});
                          }}
                          style={{ accentColor: '#34d399', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#34d399' : 'var(--text)' }}>
                          {p.name}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                          textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4, marginLeft: 'auto',
                          background: p.type === 'local-server' ? 'rgba(251,146,60,0.1)' : 'rgba(52,211,153,0.1)',
                          color: p.type === 'local-server' ? '#fb923c' : '#34d399',
                          border: `1px solid ${p.type === 'local-server' ? 'rgba(251,146,60,0.2)' : 'rgba(52,211,153,0.2)'}` }}>
                          {p.tag}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Pipeline diagram ── */}
            {(() => {
              const pip = PARSER_PIPELINE[bench.parserId];
              if (!pip) return null;
              const doclingOutputMap = {
                markdown: { label: 'Markdown',   note: 'headings & tables', color: '#34d399' },
                text:     { label: 'Plain text', note: 'unformatted',       color: '#94a3b8' },
                json:     { label: 'JSON',        note: 'element tree',      color: '#fb923c' },
              };
              const outputNode = bench.parserId === 'docling'
                ? (doclingOutputMap[bench.doclingFormat] || pip.output)
                : pip.output;
              const nodeIcons = {
                input:  FileUp,
                method: ScanLine,
                output: FileText,
              };
              const Node = ({ label, note, color, role }) => {
                const Icon = nodeIcons[role] || Circle;
                return (
                  <div style={{ width: 80, height: 80, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 3, padding: '6px 4px',
                    borderRadius: 8, flexShrink: 0,
                    background: `color-mix(in srgb, ${color} 8%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${color} 28%, transparent)` }}>
                    <Icon size={14} color={color} strokeWidth={2} />
                    <span style={{ fontSize: 10, fontWeight: 700, color, textAlign: 'center', lineHeight: 1.2 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>
                      {note}
                    </span>
                  </div>
                );
              };
              const Arrow = () => (
                <span style={{ fontSize: 12, color: '#334155', flexShrink: 0 }}>→</span>
              );
              const ColLabel = ({ children }) => (
                <span style={{ fontSize: 8, fontWeight: 700, color: '#334155', textTransform: 'uppercase',
                  letterSpacing: '0.06em', textAlign: 'center' }}>
                  {children}
                </span>
              );
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* column headers */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 80, display: 'flex', justifyContent: 'center', flexShrink: 0 }}><ColLabel>Input</ColLabel></div>
                    <div style={{ width: 16 }} />
                    <div style={{ width: 80, display: 'flex', justifyContent: 'center', flexShrink: 0 }}><ColLabel>Parser</ColLabel></div>
                    <div style={{ width: 16 }} />
                    <div style={{ width: 80, display: 'flex', justifyContent: 'center', flexShrink: 0 }}><ColLabel>Output</ColLabel></div>
                  </div>
                  {/* nodes */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Node {...pip.input} role="input" />
                    <Arrow />
                    <Node {...pip.method} role="method" />
                    <Arrow />
                    <Node {...outputNode} role="output" />
                  </div>
                </div>
              );
            })()}

            {/* Extraction target */}
            <FL label="Extract">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select
                  value={bench.useCustomPages ? 'custom' : bench.target}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setBench(b => ({ ...b, useCustomPages: true, output: null, error: null }));
                    } else {
                      setBench(b => ({ ...b, target: e.target.value, useCustomPages: false, output: null, error: null }));
                    }
                  }}
                  style={selectSx}>
                  {EXTRACTION_TARGETS.map(t => (
                    <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>
                  ))}
                  <option value="custom">Custom pages — specify exact pages or ranges</option>
                </select>

                {bench.useCustomPages && (
                  <input
                    type="text"
                    placeholder="e.g. 1-3, 5, 8-10"
                    value={bench.customPages}
                    onChange={e => setBench(b => ({ ...b, customPages: e.target.value }))}
                    style={{ ...inputSx, fontFamily: 'var(--font-mono)',
                      border: '1px solid rgba(251,146,60,0.3)', color: '#fb923c' }}
                  />
                )}
              </div>
            </FL>

            {(() => {
              const selectedParser = BUILTIN_PARSERS.find(p => p.id === bench.parserId);
              const needsServer = selectedParser?.type === 'local-server';
              return needsServer && !pymupdfOnline ? (
                <div style={{ fontSize: 11, color: '#fb923c', padding: '6px 10px', borderRadius: 7,
                  background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)' }}>
                  Start the parser server above before running extraction.
                </div>
              ) : null;
            })()}
            {(() => {
              const selectedParser = BUILTIN_PARSERS.find(p => p.id === bench.parserId);
              const needsServer = (t) => t === 'local-server' || t === 'cloud-api';
              const serverBlocked = !compareMode
                ? (needsServer(selectedParser?.type) && !pymupdfOnline)
                : (Array.from(compareParsers).some(pid => needsServer(BUILTIN_PARSERS.find(p => p.id === pid)?.type)) && !pymupdfOnline);
              const compareRunning = compareMode && Object.values(compareResults).some(r => r.running);
              const disabled = !bench.paperId || bench.running || compareRunning ||
                (compareMode ? compareParsers.size === 0 : false) || serverBlocked;
              return (
                <button
                  onClick={compareMode ? runCompare : runBench}
                  disabled={disabled}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '9px 0', borderRadius: 8,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 700,
                    background: bench.paperId ? cr(0.15) : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${bench.paperId ? cr(0.4) : 'rgba(255,255,255,0.08)'}`,
                    color: bench.paperId ? ACC : 'var(--text-muted)',
                    opacity: disabled ? 0.5 : 1,
                  }}>
                  <Zap size={14} />
                  {(bench.running || compareRunning) ? 'Extracting…'
                    : compareMode ? `Run ${compareParsers.size} Parsers`
                    : 'Run Extraction'}
                </button>
              );
            })()}

            {/* Compare toggle */}
            <button
              onClick={() => { setCompareMode(v => !v); setCompareResults({}); setPdfTypeResult(null); }}
              style={{ fontSize: 11, fontWeight: 600, padding: '6px 0', borderRadius: 7,
                cursor: 'pointer', letterSpacing: '0.04em', width: '100%',
                background: compareMode ? cr(0.10) : 'rgba(255,255,255,0.03)',
                border: `1px solid ${compareMode ? cr(0.30) : 'rgba(255,255,255,0.08)'}`,
                color: compareMode ? ACC : 'var(--text-muted)' }}>
              {compareMode ? '✕ Close Compare' : 'Compare Parsers'}
            </button>

            {/* Document Parsers modal trigger */}
            <button
              onClick={() => setShowParsersModal(true)}
              style={{ fontSize: 11, fontWeight: 600, padding: '6px 0', borderRadius: 7,
                cursor: 'pointer', letterSpacing: '0.04em', width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-muted)' }}>
              <FileInput size={12} />
              Document Parsers
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}`, marginLeft: 2 }}>
                {BUILTIN_PARSERS.length + s.parsers.length}
              </span>
            </button>

            {/* Extraction history trigger */}
            {(() => {
              const paper = papersWithFile.find(p => p.id === bench.paperId);
              const history = paper?.extractionHistory || [];
              if (history.length === 0) return null;
              return (
                <button onClick={() => setShowHistoryModal(true)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '6px 0', borderRadius: 7,
                    cursor: 'pointer', letterSpacing: '0.04em', width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-muted)' }}>
                  Extraction History
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                    background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}` }}>
                    {history.length}
                  </span>
                </button>
              );
            })()}

            {/* Post-processing toggles (collapsible) */}
            <details style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
              <summary style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em', cursor: 'pointer',
                listStyle: 'none', display: 'flex', alignItems: 'center', gap: 5, userSelect: 'none' }}>
                <ChevronRight size={10} style={{ transition: 'transform 0.15s' }} className="postproc-chevron" />
                Post-processing
                {Object.values(postProc).some(Boolean) && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                    background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}`, marginLeft: 'auto' }}>
                    {Object.values(postProc).filter(Boolean).length} active
                  </span>
                )}
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }}>
                {[
                  { key: 'stripHeaders',     label: 'Strip [Page N] markers' },
                  { key: 'removeHyphens',    label: 'Rejoin hyphenated words' },
                  { key: 'normalizeSpace',   label: 'Normalize whitespace' },
                  { key: 'removeWatermarks', label: 'Remove watermark text' },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7,
                    cursor: 'pointer', fontSize: 11, color: postProc[key] ? 'var(--text)' : 'var(--text-muted)' }}>
                    <input type="checkbox" checked={postProc[key]}
                      onChange={e => setPostProc(p => ({ ...p, [key]: e.target.checked }))}
                      style={{ accentColor: ACC }} />
                    {label}
                  </label>
                ))}
              </div>
            </details>

            {/* Batch extraction */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Batch extraction
                </div>
                <button onClick={() => { setBatchMode(v => !v); setBatchSelected(new Set()); setBatchResults([]); }}
                  style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                    letterSpacing: '0.06em',
                    background: batchMode ? cr(0.12) : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${batchMode ? cr(0.35) : 'rgba(255,255,255,0.1)'}`,
                    color: batchMode ? ACC : 'var(--text-muted)' }}>
                  {batchMode ? 'Batch ON' : 'Enable'}
                </button>
              </div>
              {batchMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {papersWithFile.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No papers with linked PDFs.</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                        <button onClick={() => setBatchSelected(new Set(papersWithFile.map(p => p.id)))}
                          style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-muted)' }}>
                          All
                        </button>
                        <button onClick={() => setBatchSelected(new Set())}
                          style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-muted)' }}>
                          None
                        </button>
                      </div>
                      <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {papersWithFile.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6,
                            cursor: 'pointer', fontSize: 10,
                            color: batchSelected.has(p.id) ? 'var(--text)' : 'var(--text-muted)' }}>
                            <input type="checkbox" checked={batchSelected.has(p.id)}
                              onChange={e => setBatchSelected(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(p.id); else next.delete(p.id);
                                return next;
                              })}
                              style={{ accentColor: ACC, flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.title.length > 36 ? p.title.slice(0, 36) + '…' : p.title}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button onClick={runBatch} disabled={batchSelected.size === 0 || batchRunning}
                        style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          gap: 5, padding: '7px 0', borderRadius: 7, cursor: batchSelected.size > 0 && !batchRunning ? 'pointer' : 'not-allowed',
                          fontSize: 12, fontWeight: 700,
                          background: batchSelected.size > 0 ? cr(0.12) : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${batchSelected.size > 0 ? cr(0.35) : 'rgba(255,255,255,0.07)'}`,
                          color: batchSelected.size > 0 ? ACC : 'var(--text-muted)',
                          opacity: batchRunning ? 0.6 : 1 }}>
                        <Zap size={12} />
                        {batchRunning ? 'Running…' : `Extract ${batchSelected.size} paper${batchSelected.size !== 1 ? 's' : ''}`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* ── Output panel ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0,
            overflowY: 'auto', paddingLeft: 16,
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

            {/* ── Compare mode output — side by side ── */}
            {compareMode && (() => {
              const pids = Array.from(compareParsers);
              if (pids.length === 0) return (
                <div style={{ fontSize: 11, color: '#334155', padding: '10px 0' }}>
                  Select parsers above and click Run to compare outputs.
                </div>
              );
              return (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {pids.map(pid => {
                    const p = BUILTIN_PARSERS.find(x => x.id === pid);
                    const r = compareResults[pid] || {};
                    return (
                      <div key={pid} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {/* Panel header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                          borderRadius: 6, background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                            {p?.name}
                          </span>
                          {r.running && (
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                              background: ACC, animation: 'pulse 1.2s ease-in-out infinite' }} />
                          )}
                          {r.output && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {r.output.chars?.toLocaleString()} chars
                            </span>
                          )}
                          {r.output && <span style={{ fontSize: 10, color: '#34d399' }}>✓</span>}
                          {r.error  && <span style={{ fontSize: 10, color: '#f87171' }}>✗</span>}
                        </div>

                        {/* Panel body */}
                        {r.running ? (
                          <div style={{ height: 280, borderRadius: 7, background: '#070d1a',
                            border: '1px solid rgba(255,255,255,0.07)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: 'var(--text-muted)', gap: 8 }}>
                            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                              background: ACC, animation: 'pulse 1.2s ease-in-out infinite' }} />
                            Extracting…
                          </div>
                        ) : r.error ? (
                          <div style={{ height: 280, padding: '10px 12px', borderRadius: 7,
                            fontSize: 11, color: '#f87171', overflowY: 'auto',
                            background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.18)' }}>
                            {r.error}
                          </div>
                        ) : r.output ? (
                          <div style={{ height: 280, overflowY: 'auto', padding: '10px 12px',
                            borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 11,
                            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            background: '#070d1a', border: '1px solid rgba(255,255,255,0.07)',
                            color: textColor }}>
                            {r.output.text}
                          </div>
                        ) : (
                          <div style={{ height: 280, borderRadius: 7, background: '#070d1a',
                            border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: '#1e293b' }}>
                            Not run yet
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Feature 16: Compare section breakdown side by side ── */}
            {compareMode && bench.target === 'full-text' && (() => {
              const pids = Array.from(compareParsers).filter(pid => compareResults[pid]?.output?.text);
              if (pids.length < 2) return null;
              const COMPARE_COLORS = [
                '#38bdf8','#fb923c','#34d399','#a78bfa','#f472b6',
                '#facc15','#60a5fa','#4ade80','#f87171','#818cf8','#2dd4bf','#fb7185',
              ];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Section breakdown comparison
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {pids.map(pid => {
                      const p = BUILTIN_PARSERS.find(x => x.id === pid);
                      const r = compareResults[pid];
                      const activePaper = papersWithFile.find(pp => pp.id === bench.paperId);
                      const secs = analyzeSections(r.output.text, sectionSettings, activePaper?.sectionHeadings || '');
                      const totalW = secs.reduce((n, s) => n + s.words, 0);
                      return (
                        <div key={pid} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {/* Parser label */}
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)',
                            padding: '3px 8px', borderRadius: 5,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {p?.name} · {secs.length} sections · {totalW.toLocaleString()} w
                          </div>
                          {/* Fingerprint bar */}
                          <div style={{ display: 'flex', height: 7, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                            {secs.map((sec, idx) => (
                              <div key={idx}
                                title={`${sec.name}: ${sec.words.toLocaleString()} w`}
                                style={{ height: '100%', flexShrink: 0,
                                  width: `${totalW > 0 ? sec.words / totalW * 100 : 0}%`, minWidth: 2,
                                  background: COMPARE_COLORS[idx % COMPARE_COLORS.length], opacity: 0.75 }} />
                            ))}
                          </div>
                          {/* Section rows */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {secs.map((sec, idx) => {
                              const pct = totalW > 0 ? sec.words / totalW : 0;
                              const col = COMPARE_COLORS[idx % COMPARE_COLORS.length];
                              const isTooShort = sec.words < 50;
                              const isDominant = pct > 0.5;
                              return (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 90, flexShrink: 0, fontSize: 10, color: col,
                                    fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap' }}>
                                    {sec.name}
                                  </span>
                                  {(isTooShort || isDominant) && (
                                    <span title={isTooShort ? 'Very short' : 'Dominates document'}
                                      style={{ fontSize: 9, flexShrink: 0 }}>
                                      {isTooShort ? '⚠' : '⚡'}
                                    </span>
                                  )}
                                  <div style={{ flex: 1, height: 4, borderRadius: 2,
                                    background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', borderRadius: 2, background: col,
                                      width: `${pct * 100}%` }} />
                                  </div>
                                  <span style={{ fontSize: 9, color: col, width: 46,
                                    flexShrink: 0, textAlign: 'right', opacity: 0.8 }}>
                                    {sec.words.toLocaleString()} w
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* ── Batch results ── */}
            {batchMode && batchResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
                  Batch results
                </div>
                {batchResults.map((r, i) => {
                  const statusColor = r.status === 'done' ? '#34d399' : r.status === 'error' ? '#f87171'
                    : r.status === 'running' ? ACC : '#475569';
                  return (
                    <div key={r.paperId} style={{ display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 10px', borderRadius: 6, fontSize: 11,
                      background: 'rgba(255,255,255,0.02)', border: `1px solid ${statusColor}22` }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: statusColor,
                        animation: r.status === 'running' ? 'pulse 1s infinite' : 'none' }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: 'var(--text)' }}>
                        {r.title.length > 40 ? r.title.slice(0, 40) + '…' : r.title}
                      </span>
                      <span style={{ fontSize: 10, color: statusColor, flexShrink: 0 }}>
                        {r.status === 'done' ? `${r.chars?.toLocaleString()} chars`
                          : r.status === 'error' ? 'Error'
                          : r.status === 'running' ? 'Extracting…'
                          : 'Pending'}
                      </span>
                      {r.error && (
                        <span title={r.error} style={{ fontSize: 10, color: '#f87171', cursor: 'help' }}>ⓘ</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Single-parser output ── */}
            {!compareMode && (
            <>

            {/* Progress bar */}
            {bench.running && (
              (() => {
                const p = bench.progress;
                const hasCounts = p && p.total > 0 && p.page > 0;
                const pct = hasCounts ? Math.round(p.page / p.total * 100) : null;
                const statusMsg = p?.status || (hasCounts ? `Page ${p.page} / ${p.total}` : 'Processing…');
                const selectedParser = BUILTIN_PARSERS.find(x => x.id === bench.parserId);
                const isML = selectedParser?.id === 'docling' || selectedParser?.id === 'unstructured';
                return (
                  <div style={{ padding: '8px 10px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 11, color: 'var(--text-muted)', marginBottom: 5 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                          background: ACC, boxShadow: `0 0 6px ${ACC}`,
                          animation: 'pulse 1.2s ease-in-out infinite' }} />
                        {statusMsg}
                      </span>
                      <span style={{ color: ACC, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {pct != null ? `${pct}%` : `${elapsedSecs}s`}
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      {pct != null ? (
                        <div style={{ height: '100%', borderRadius: 3, background: ACC,
                          width: `${pct}%`, transition: 'width 0.4s ease' }} />
                      ) : (
                        <div style={{ height: '100%', borderRadius: 3, background: ACC, width: '30%',
                          animation: 'indeterminate 1.5s ease-in-out infinite' }} />
                      )}
                    </div>
                    {isML && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                        ML parser — no per-page progress available
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            {/* Search bar + stats */}
            {bench.output && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Inline stats */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                  color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>{bench.output?.parser || 'PDF.js'}</span>
                  <span style={{ opacity: 0.35 }}>·</span>
                  <span>Pages: <b style={{ color: 'var(--text)' }}>{bench.output.pagesScanned}</b>/{bench.output.totalPages}</span>
                  <span style={{ opacity: 0.35 }}>·</span>
                  <span>Chars: <b style={{ color: 'var(--text)' }}>{bench.output.chars.toLocaleString()}</b></span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search in output…"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchIdx(0); }}
                    style={{ ...inputSx, paddingRight: 32, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(''); setSearchIdx(0); }}
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}>×</button>
                  )}
                </div>
                <button onClick={() => setSearchRegex(v => !v)} title="Toggle regex"
                  style={{ fontSize: 10, fontWeight: 700, padding: '5px 8px', borderRadius: 5,
                    cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    background: searchRegex ? cr(0.12) : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${searchRegex ? cr(0.35) : 'rgba(255,255,255,0.1)'}`,
                    color: searchRegex ? ACC : 'var(--text-muted)' }}>.*</button>

                {/* Export icon button */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowExportMenu(v => !v)}
                    title="Export output"
                    style={{ width: 28, height: 28, borderRadius: 5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: showExportMenu ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${showExportMenu ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      color: showExportMenu ? '#38bdf8' : 'var(--text-muted)',
                      flexShrink: 0 }}>
                    <Download size={13} />
                  </button>
                  {showExportMenu && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '6px 0', minWidth: 160,
                      boxShadow: '0 8px 28px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column' }}>
                      {[
                        { fmt: 'txt',  label: 'Plain text',      ext: '.txt'  },
                        { fmt: 'md',   label: 'Markdown',         ext: '.md'   },
                        { fmt: 'html', label: 'HTML',             ext: '.html' },
                        { fmt: 'json', label: 'JSON',             ext: '.json' },
                        { fmt: 'rst',  label: 'reStructuredText', ext: '.rst'  },
                        { fmt: 'csv',  label: 'CSV (lines)',       ext: '.csv'  },
                      ].map(({ fmt, label, ext }) => (
                        <button key={fmt} onClick={() => exportAs(fmt)}
                          style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                            gap: 8, padding: '6px 12px', background: 'none', border: 'none',
                            cursor: 'pointer', textAlign: 'left', width: '100%' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ext}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* View settings icon button */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowOutputSettings(v => !v)}
                    title="View settings"
                    style={{ width: 28, height: 28, borderRadius: 5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: showOutputSettings ? cr(0.1) : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${showOutputSettings ? cr(0.3) : 'rgba(255,255,255,0.1)'}`,
                      color: showOutputSettings ? ACC : 'var(--text-muted)',
                      flexShrink: 0 }}>
                    <Settings2 size={13} />
                  </button>

                  {showOutputSettings && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 9, padding: '14px 16px', width: 220,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Line numbers */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                          Line numbers
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7,
                          cursor: 'pointer', fontSize: 11, color: showLineNumbers ? ACC : 'var(--text-muted)' }}>
                          <input type="checkbox" checked={showLineNumbers}
                            onChange={e => setShowLineNumbers(e.target.checked)}
                            style={{ accentColor: ACC }} />
                          Show line numbers
                        </label>
                        {showLineNumbers && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
                              Gutter color
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                              {TEXT_COLORS.map(c => (
                                <button key={c.value} onClick={() => setGutterColor(c.value)} title={c.label}
                                  style={{ width: 14, height: 14, borderRadius: '50%', cursor: 'pointer', padding: 0,
                                    background: c.value, flexShrink: 0,
                                    border: gutterColor === c.value ? '2px solid white' : '2px solid transparent',
                                    outline: gutterColor === c.value ? `1px solid ${c.value}` : 'none' }} />
                              ))}
                              <label title="Custom gutter color" style={{ position: 'relative', cursor: 'pointer',
                                width: 14, height: 14, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                                background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)',
                                border: '2px solid rgba(255,255,255,0.3)' }}>
                                <input type="color" value={gutterColor} onChange={e => setGutterColor(e.target.value)}
                                  style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                              </label>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Text color */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                          Text color
                        </div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          {TEXT_COLORS.map(c => (
                            <button key={c.value} onClick={() => setTextColor(c.value)} title={c.label}
                              style={{ width: 14, height: 14, borderRadius: '50%', cursor: 'pointer', padding: 0,
                                background: c.value, flexShrink: 0,
                                border: textColor === c.value ? '2px solid white' : '2px solid transparent',
                                outline: textColor === c.value ? `1px solid ${c.value}` : 'none' }} />
                          ))}
                          <label title="Custom text color" style={{ position: 'relative', cursor: 'pointer',
                            width: 14, height: 14, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                            background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)',
                            border: '2px solid rgba(255,255,255,0.3)' }}>
                            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                              style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                          </label>
                        </div>
                      </div>

                    </div>
                  )}
                </div>

                {/* Save to paper icon button */}
                <button onClick={saveToPaper} disabled={!onPapersChange || !bench.output}
                  title={onPapersChange && bench.output
                    ? `Save extracted text into paper.${bench.target === 'references' ? 'references' : bench.target === 'abstract' ? 'abstract' : 'fullText'}`
                    : !bench.output ? 'Run extraction first' : 'No save handler available'}
                  style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: onPapersChange && bench.output ? 'pointer' : 'not-allowed',
                    background: savedMsg?.ok ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${savedMsg?.ok ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: savedMsg?.ok ? '#34d399' : onPapersChange && bench.output ? 'var(--text-muted)' : 'rgba(255,255,255,0.2)',
                    transition: 'background 0.15s, border-color 0.15s, color 0.15s' }}>
                  <BookmarkPlus size={13} />
                </button>

                {/* Field map icon button */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowFieldMap(v => !v)}
                    title="Extraction target → paper field mapping"
                    style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: showFieldMap ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${showFieldMap ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: showFieldMap ? '#a78bfa' : 'var(--text-muted)' }}>
                    <Table2 size={13} />
                  </button>
                  {showFieldMap && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 9, padding: '12px 14px', width: 380,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                        Extraction target → paper field mapping
                      </div>
                      {TARGET_FIELD_MAP.map(row => (
                        <div key={row.target} style={{ display: 'flex', alignItems: 'baseline', gap: 8,
                          fontSize: 11, padding: '5px 10px', borderRadius: 6,
                          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ color: 'var(--text)', fontWeight: 600, width: 70, flexShrink: 0 }}>{row.target}</span>
                          <span style={{ color: ACC, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.field}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>— {row.note}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section colour-lines toggle */}
                {sectionData && !mdRender && (
                  <button
                    onClick={() => setSectionColorLines(v => !v)}
                    title={sectionColorLines ? 'Disable section colouring' : 'Colour lines by section'}
                    style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      background: sectionColorLines ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${sectionColorLines ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.1)'}`,
                      color: sectionColorLines ? '#a78bfa' : 'var(--text-muted)' }}>
                    <Palette size={13} />
                  </button>
                )}

                {/* Markdown render toggle */}
                {!!bench.output && !bench.error && (
                  <button
                    onClick={() => setMdRender(v => !v)}
                    title={mdRender ? 'Switch to raw text view' : 'Render output as Markdown'}
                    style={{ height: 28, padding: '0 9px', borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer', fontSize: 10, fontWeight: 700,
                      background: mdRender ? 'rgba(251,146,60,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${mdRender ? 'rgba(251,146,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
                      color: mdRender ? ACC : 'var(--text-muted)' }}>
                    MD
                  </button>
                )}

                {/* Edit / Done toggle */}
                {!!bench.output && !bench.error && (
                  <button
                    onClick={() => setEditMode(v => !v)}
                    title={editMode ? 'Exit edit mode' : 'Edit output text'}
                    style={{ height: 28, padding: '0 9px', borderRadius: 5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer', fontSize: 10, fontWeight: 700,
                      background: editMode ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${editMode ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.1)'}`,
                      color: editMode ? '#34d399' : 'var(--text-muted)' }}>
                    {editMode ? '✓ Done' : '✎ Edit'}
                  </button>
                )}

                {/* Edited badge + Reset */}
                {editedOutput !== null && (
                  <>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)',
                      color: ACC, flexShrink: 0 }}>
                      Edited
                    </span>
                    <button
                      onClick={() => { setEditedOutput(null); setEditMode(false); }}
                      title="Restore original parser output"
                      style={{ height: 28, padding: '0 9px', borderRadius: 5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', cursor: 'pointer',
                        fontSize: 10, fontWeight: 700,
                        background: 'rgba(248,113,113,0.10)',
                        border: '1px solid rgba(248,113,113,0.35)',
                        color: '#f87171' }}>
                      ↺ Reset
                    </button>
                  </>
                )}

                {/* Save feedback — clickable to jump to Literature tab */}
                {savedMsg && (
                  savedMsg.tab && onNavigate
                    ? <button
                        onClick={() => onNavigate({ tab: savedMsg.tab, paperId: savedMsg.paperId })}
                        title="Click to go to the saved field"
                        style={{ fontSize: 10, background: 'none', border: 'none', padding: 0,
                          cursor: 'pointer', color: '#34d399', whiteSpace: 'nowrap',
                          textDecoration: 'underline', textDecorationStyle: 'dotted',
                          textUnderlineOffset: 3 }}>
                        {savedMsg.text} ↗
                      </button>
                    : <span style={{ fontSize: 10, color: savedMsg.ok ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
                        {savedMsg.text}
                      </span>
                )}

                {searchMatchPositions.length > 0 && (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {searchIdx + 1} / {searchMatchPositions.length}
                    </span>
                    <button onClick={() => setSearchIdx(i => Math.max(0, i - 1))}
                      style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)' }}>↑</button>
                    <button onClick={() => setSearchIdx(i => Math.min(searchMatchPositions.length - 1, i + 1))}
                      style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)' }}>↓</button>
                  </>
                )}
                {searchQuery && searchMatchPositions.length === 0 && (
                  <span style={{ fontSize: 10, color: '#f87171', whiteSpace: 'nowrap' }}>No matches</span>
                )}
              </div>
            )}

            {/* Output text */}
            {(() => {
              const rawText = bench.error
                ? bench.error
                : bench.output
                ? (editedOutput ?? bench.output.text)
                : bench.running
                ? 'Extracting text…'
                : 'Select a document and click Run Extraction to see the raw parser output here.';
              const displayColor = bench.error ? '#f87171' : (bench.output ? textColor : '#334155');
              const hasContent = !!bench.output && !bench.error;

              // Floating copy button rendered inside both panel variants
              const CopyBtn = () => (
                <button
                  onClick={copyOutput}
                  title={copiedMsg ? 'Copied!' : 'Copy to clipboard'}
                  style={{
                    position: 'absolute', top: 7, right: 7, zIndex: 10,
                    width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: copiedMsg ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${copiedMsg ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: copiedMsg ? '#34d399' : 'var(--text-muted)',
                    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { if (!copiedMsg) { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text)'; }}}
                  onMouseLeave={e => { if (!copiedMsg) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-muted)'; }}}
                >
                  <Copy size={13} />
                </button>
              );

              // ── Minimap ──────────────────────────────────────────────────────
              const MINIMAP_W = 14;
              const OUTPUT_MAX_H = outputHeight;
              const SECTION_COLORS_MM = [
                '#38bdf8','#fb923c','#34d399','#a78bfa','#f472b6',
                '#facc15','#60a5fa','#4ade80','#f87171','#818cf8','#2dd4bf','#fb7185',
              ];
              const MinimapBar = () => {
                if (!showMinimap || !sectionData || !hasContent) return null;
                const totalLines = rawText.split('\n').length;
                return (
                  <div style={{ width: MINIMAP_W, flexShrink: 0, borderRadius: 4, overflow: 'hidden',
                    height: OUTPUT_MAX_H, display: 'flex', flexDirection: 'column',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    cursor: 'pointer', userSelect: 'none' }}>
                    {sectionData.map((sec, idx) => {
                      const nextLine = sectionData[idx + 1]?.lineIndex ?? totalLines;
                      const startLine = sec.lineIndex ?? 0;
                      const spanLines = Math.max(1, nextLine - startLine);
                      const pct = spanLines / totalLines;
                      const col = SECTION_COLORS_MM[idx % SECTION_COLORS_MM.length];
                      return (
                        <div key={idx}
                          onClick={() => { if (outputRef.current) outputRef.current.scrollTop = Math.max(0, startLine * 11 * 1.6 - 12); }}
                          title={`${sec.name} (${sec.words.toLocaleString()} w)`}
                          style={{ flexShrink: 0, height: `${pct * 100}%`, minHeight: 2,
                            background: col, opacity: 0.7, transition: 'opacity 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                        />
                      );
                    })}
                  </div>
                );
              };

              // ── Per-line section colour mapping ───────────────────────────
              const SEC_LINE_COLORS = SECTION_COLORS_MM; // reuse same palette
              // Build a lookup: lineIndex → colour string
              const lineColorOf = (() => {
                if (!sectionColorLines || !sectionData || !hasContent) return null;
                const totalLines = rawText.split('\n').length;
                const map = new Array(totalLines).fill(null);
                sectionData.forEach((sec, idx) => {
                  const col = SEC_LINE_COLORS[idx % SEC_LINE_COLORS.length];
                  const start    = sec.lineIndex ?? 0;
                  const nextStart = Math.min(sectionData[idx + 1]?.lineIndex ?? totalLines, totalLines);
                  for (let li = start; li < nextStart; li++) map[li] = col;
                });
                return map;
              })();

              // ── Edit mode path ────────────────────────────────────────────
              if (hasContent && editMode) {
                return (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <textarea
                        defaultValue={editedOutput ?? bench.output.text}
                        onChange={e => {
                          const val = e.target.value;
                          setEditedOutput(val === bench.output.text ? null : val);
                        }}
                        spellCheck={false}
                        style={{ width: '100%', boxSizing: 'border-box',
                          height: OUTPUT_MAX_H, resize: 'none',
                          fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
                          background: '#070d1a', color: 'var(--text-muted)',
                          border: '1px solid rgba(52,211,153,0.4)', borderRadius: 8,
                          padding: '12px 14px', outline: 'none',
                          scrollbarWidth: 'thin',
                          scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}
                      />
                    </div>
                  </div>
                );
              }

              // ── Markdown render path ──────────────────────────────────────
              if (hasContent && mdRender) {
                const suspendedFeatures = [
                  searchQuery.trim() && 'search highlights',
                  sectionColorLines  && 'section colouring',
                ].filter(Boolean);

                // Dark-theme component overrides for ReactMarkdown
                const md = {
                  h1: ({node,...p}) => <h1 {...p} style={{ fontSize: 20, fontWeight: 800, color: ACC,
                    borderBottom: `1px solid ${cr(0.25)}`, paddingBottom: 6, marginTop: 20, marginBottom: 10 }} />,
                  h2: ({node,...p}) => <h2 {...p} style={{ fontSize: 16, fontWeight: 700, color: ACC,
                    borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 4, marginTop: 18, marginBottom: 8 }} />,
                  h3: ({node,...p}) => <h3 {...p} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)',
                    marginTop: 14, marginBottom: 6 }} />,
                  h4: ({node,...p}) => <h4 {...p} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    opacity: 0.85, marginTop: 12, marginBottom: 4 }} />,
                  h5: ({node,...p}) => <h5 {...p} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                    marginTop: 10, marginBottom: 4 }} />,
                  h6: ({node,...p}) => <h6 {...p} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                    opacity: 0.65, marginTop: 8, marginBottom: 4 }} />,
                  p:  ({node,...p}) => <p  {...p} style={{ fontSize: 11, lineHeight: 1.75,
                    color: 'var(--text-muted)', marginBottom: 10, marginTop: 0 }} />,
                  a:  ({node,...p}) => <a  {...p} style={{ color: ACC, textDecoration: 'underline' }}
                    target="_blank" rel="noreferrer" />,
                  strong: ({node,...p}) => <strong {...p} style={{ fontWeight: 700, color: 'var(--text)' }} />,
                  em:     ({node,...p}) => <em     {...p} style={{ fontStyle: 'italic', color: 'var(--text)' }} />,
                  blockquote: ({node,...p}) => <blockquote {...p} style={{ borderLeft: `3px solid ${cr(0.45)}`,
                    paddingLeft: 12, margin: '8px 0', color: 'var(--text-muted)', fontStyle: 'italic' }} />,
                  hr: ({node,...p}) => <hr {...p} style={{ border: 'none',
                    borderTop: '1px solid rgba(255,255,255,0.08)', margin: '14px 0' }} />,
                  ul: ({node,...p}) => <ul {...p} style={{ paddingLeft: 20, marginBottom: 10,
                    color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.75 }} />,
                  ol: ({node,...p}) => <ol {...p} style={{ paddingLeft: 20, marginBottom: 10,
                    color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.75 }} />,
                  li: ({node,...p}) => <li {...p} style={{ marginBottom: 2 }} />,
                  code: ({node, inline, ...p}) => inline
                    ? <code {...p} style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                        background: 'rgba(255,255,255,0.08)', borderRadius: 3,
                        padding: '1px 5px', color: '#7dd3fc' }} />
                    : <code {...p} style={{ display: 'block', fontFamily: 'var(--font-mono)',
                        fontSize: 10, lineHeight: 1.7, color: '#7dd3fc',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />,
                  pre: ({node,...p}) => <pre {...p} style={{ background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                    padding: '10px 14px', marginBottom: 10, overflowX: 'auto' }} />,
                  table: ({node,...p}) => <table {...p} style={{ width: '100%', borderCollapse: 'collapse',
                    fontSize: 10, marginBottom: 12 }} />,
                  th: ({node,...p}) => <th {...p} style={{ textAlign: 'left', fontWeight: 700,
                    padding: '5px 10px', borderBottom: `1px solid ${cr(0.3)}`,
                    color: ACC, background: cr(0.07) }} />,
                  td: ({node,...p}) => <td {...p} style={{ padding: '4px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)' }} />,
                  tr: ({node,...p}) => <tr {...p} style={{ background: 'transparent' }} />,
                };

                return (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <CopyBtn />
                      {suspendedFeatures.length > 0 && (
                        <div style={{ position: 'absolute', top: 7, left: 10, zIndex: 5,
                          fontSize: 9, color: 'var(--text-muted)', opacity: 0.6,
                          background: '#070d1a', padding: '1px 6px', borderRadius: 3,
                          border: '1px solid rgba(255,255,255,0.08)' }}>
                          {suspendedFeatures.join(' & ')} suspended in Render mode
                        </div>
                      )}
                      <div ref={outputRef} className="bench-output" style={{ height: OUTPUT_MAX_H,
                        overflowY: 'auto', padding: '16px 20px', borderRadius: 8,
                        background: '#070d1a', border: '1px solid rgba(255,255,255,0.07)',
                        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
                          {rawText}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <MinimapBar />
                  </div>
                );
              }

              if (hasContent && showLineNumbers) {
                const trimmedText = rawText.trimEnd();
                const lines = trimmedText.split('\n');
                const gutterWidth = String(lines.length).length * 8 + 20;
                return (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <CopyBtn />
                      <div ref={outputRef} className="bench-output" style={{ height: OUTPUT_MAX_H, overflowY: 'auto', overflowX: 'hidden',
                        borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
                        background: '#070d1a', border: '1px solid rgba(255,255,255,0.07)',
                        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent',
                        display: 'flex', alignItems: 'flex-start' }}>
                        <div style={{ width: gutterWidth, flexShrink: 0, padding: '12px 8px 12px 10px',
                          textAlign: 'right', userSelect: 'none',
                          borderRight: '1px solid rgba(255,255,255,0.05)', position: 'sticky', left: 0,
                          background: '#070d1a' }}>
                          {lines.map((_, i) => (
                            <div key={i} style={{ color: lineColorOf ? (lineColorOf[i] || gutterColor) : gutterColor }}>
                              {i + 1}
                            </div>
                          ))}
                        </div>
                        <div style={{ flex: 1, padding: '12px 14px', whiteSpace: 'pre', overflowX: 'auto' }}>
                          {lineColorOf
                            ? lines.map((line, i) => {
                                const col = lineColorOf[i] || displayColor;
                                const lineStart = lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
                                const lineEnd   = lineStart + line.length;
                                const lineMatches = searchMatchPositions
                                  .filter(m => m.end > lineStart && m.start < lineEnd)
                                  .map(m => ({ start: Math.max(0, m.start - lineStart), end: Math.min(line.length, m.end - lineStart) }));
                                return (
                                  <div key={i} style={{ color: col, minHeight: '1.6em' }}>
                                    {renderWithHighlights(line, lineMatches, -1, col)}
                                  </div>
                                );
                              })
                            : renderWithHighlights(trimmedText, searchMatchPositions, searchIdx, displayColor)
                          }
                        </div>
                      </div>
                    </div>
                    <MinimapBar />
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <CopyBtn />
                    <div ref={outputRef} className="bench-output" style={{ height: OUTPUT_MAX_H, overflowY: 'auto',
                      padding: '12px 14px', borderRadius: 8, fontFamily: 'var(--font-mono)',
                      fontSize: 11, lineHeight: 1.6, background: '#070d1a',
                      scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent',
                      border: '1px solid rgba(255,255,255,0.07)',
                      ...(lineColorOf ? {} : { whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: displayColor }) }}>
                      {lineColorOf
                        ? rawText.split('\n').map((line, i) => {
                            const col = lineColorOf[i] || displayColor;
                            const lineStart = rawText.split('\n').slice(0, i).reduce((n, l) => n + l.length + 1, 0);
                            const lineEnd   = lineStart + line.length;
                            const lineMatches = searchMatchPositions
                              .filter(m => m.end > lineStart && m.start < lineEnd)
                              .map(m => ({ start: Math.max(0, m.start - lineStart), end: Math.min(line.length, m.end - lineStart) }));
                            return (
                              <div key={i} style={{ color: col, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: '1.6em' }}>
                                {renderWithHighlights(line, lineMatches, -1, col)}
                              </div>
                            );
                          })
                        : renderWithHighlights(rawText, searchMatchPositions, searchIdx, displayColor)
                      }
                    </div>
                  </div>
                  <MinimapBar />
                </div>
              );
            })()}

            {/* ── Drag handle to resize output pane ── */}
            <div
              style={{ height: 10, cursor: 'row-resize', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, userSelect: 'none',
                borderRadius: 2, margin: '2px 0',
                transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => { if (!outputDragRef.current) e.currentTarget.style.background = 'transparent'; }}
              onMouseDown={e => {
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startH = outputHeight;
                outputDragRef.current = true;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
                const onMove = (ev) => {
                  ev.preventDefault();
                  const delta = ev.clientY - startY;
                  setOutputHeight(Math.max(150, Math.min(startH + delta, window.innerHeight - 200)));
                };
                const onUp = () => {
                  outputDragRef.current = null;
                  document.body.style.cursor = '';
                  document.body.style.userSelect = '';
                  window.removeEventListener('mousemove', onMove, true);
                  window.removeEventListener('mouseup', onUp, true);
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
              }}
            >
              <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
            </div>

            {/* Section word count — shown for full-text extraction, below the output window */}
            {sectionData && bench.output && bench.target === 'full-text' && (() => {
              const rawSections = sectionData;
              const totalWords = rawSections.reduce((n, s) => n + s.words, 0);
              const SECTION_COLORS = [
                '#38bdf8','#fb923c','#34d399','#a78bfa','#f472b6',
                '#facc15','#60a5fa','#4ade80','#f87171','#818cf8','#2dd4bf','#fb7185',
              ];
              // Sort: either document order (default) or by descending word count
              const sections = sectionSortBySize
                ? [...rawSections].sort((a, b) => b.words - a.words)
                : rawSections;
              // Color is always tied to original document-order index so colors stay stable during sort
              const colorOf = (sec) => SECTION_COLORS[rawSections.indexOf(sec) % SECTION_COLORS.length];
              // Anomaly thresholds
              const anomalyOf = (sec) => {
                if (sec.words < 50) return { icon: '⚠', label: `Very short section (${sec.words} w) — may be a mis-detected heading or parsing gap`, color: '#f87171' };
                if (totalWords > 0 && sec.words / totalWords > 0.5) return { icon: '⚡', label: `Dominates ${Math.round(sec.words / totalWords * 100)}% of the document — check for boundary errors`, color: '#f87171' };
                return null;
              };

              const LINE_H = 11 * 1.6; // font-size × line-height
              const jumpToSection = (lineIndex) => {
                if (!outputRef.current) return;
                outputRef.current.scrollTop = Math.max(0, lineIndex * LINE_H - 12);
              };
              const activateSearch = (name) => {
                setSearchQuery(name);
                setSearchIdx(0);
              };
              const secKey = (sec, i) => `${sec.name}-${sec.lineIndex ?? i}`;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Section breakdown ({sections.length} sections · {totalWords.toLocaleString()} words)
                    </span>
                    <div style={{ flex: 1 }} />
                    {/* Sort toggle */}
                    <button onClick={() => setSectionSortBySize(v => !v)}
                      title={sectionSortBySize ? 'Showing largest first — click for document order' : 'Sort by word count'}
                      style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        background: sectionSortBySize ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${sectionSortBySize ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
                        color: sectionSortBySize ? '#38bdf8' : 'var(--text-muted)' }}>
                      {sectionSortBySize ? '↕ Size' : '↕ Order'}
                    </button>
                    {/* Sections card view modal */}
                    <button onClick={() => setShowSectionsModal(true)}
                      title="View sections as cards"
                      style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)' }}>
                      ⊞ Cards
                    </button>

                    {/* Save sections to paper */}
                    <button onClick={saveSections}
                      title="Save section breakdown to paper.sections"
                      style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        background: sectionsSaved ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${sectionsSaved ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.1)'}`,
                        color: sectionsSaved ? '#34d399' : 'var(--text-muted)',
                        transition: 'all 0.2s' }}>
                      {sectionsSaved ? '✓ Saved' : '↓ Save'}
                    </button>

                    {/* Export sections dropdown */}
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowSectionExport(v => !v)}
                        title="Export section breakdown"
                        style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                          background: showSectionExport ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${showSectionExport ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
                          color: showSectionExport ? '#38bdf8' : 'var(--text-muted)' }}>
                        ↑ Export ▾
                      </button>
                      {showSectionExport && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 70,
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '5px 0', minWidth: 170,
                          boxShadow: '0 8px 28px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column' }}>
                          {[
                            { fmt: 'json',       label: 'Sections JSON',       ext: '.json', desc: '{ name, words, chars, text }' },
                            { fmt: 'md',         label: 'Merged Markdown',     ext: '.md',   desc: 'All sections as ## headings' },
                            { fmt: 'txt',        label: 'Merged plain text',   ext: '.txt',  desc: 'Separated by ===== dividers' },
                            { fmt: 'individual', label: 'Individual .txt files', ext: '×N', desc: 'One file per section' },
                          ].map(({ fmt, label, ext, desc }) => (
                            <button key={fmt} onClick={() => exportSections(fmt)}
                              style={{ display: 'flex', flexDirection: 'column', gap: 1,
                                padding: '6px 12px', background: 'none', border: 'none',
                                cursor: 'pointer', textAlign: 'left', width: '100%' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                                <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ext}</span>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{desc}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Minimap toggle */}
                    <button onClick={() => setShowMinimap(v => !v)}
                      title={showMinimap ? 'Hide minimap' : 'Show minimap beside output'}
                      style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        background: showMinimap ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${showMinimap ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.1)'}`,
                        color: showMinimap ? '#a78bfa' : 'var(--text-muted)' }}>
                      ▌Map
                    </button>
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowSectionSettings(v => !v)}
                        title="Heading detection settings"
                        style={{ width: 22, height: 22, borderRadius: 5, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                          background: showSectionSettings ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${showSectionSettings ? 'rgba(251,146,60,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          color: showSectionSettings ? '#fb923c' : 'var(--text-muted)' }}>
                        <Settings2 size={11} />
                      </button>
                      {showSectionSettings && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60,
                          background: 'var(--bg-card)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: '16px', width: 300,
                          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Heading Detection Settings
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text)' }}>Max heading length</span>
                              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: ACC }}>
                                {sectionSettings.maxHeadingLen} chars
                              </span>
                            </div>
                            <input type="range" min={20} max={160} step={5}
                              value={sectionSettings.maxHeadingLen}
                              onChange={e => setSectionSettings(s => ({ ...s, maxHeadingLen: +e.target.value }))}
                              style={{ width: '100%', accentColor: ACC }} />
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              Lines longer than this are never treated as headings
                            </span>
                          </div>
                          {[
                            { key: 'requireNoPunctEnd',   label: 'Reject lines ending with . ! ?',
                              hint: 'Sentence-ending lines are almost never headings' },
                            { key: 'allowNumberedPrefix', label: 'Allow numbered prefixes',
                              hint: 'Matches "1. Introduction", "2.1 Methods", etc.' },
                            { key: 'requireIsolatedLine', label: 'Require heading fills the whole line',
                              hint: 'Stricter — ignores heading words buried mid-sentence' },
                            { key: 'mergeDuplicates',     label: 'Merge duplicate section names',
                              hint: 'Combines repeated sections (e.g. two "References") into one row' },
                          ].map(({ key, label, hint }) => (
                            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input type="checkbox" checked={!!sectionSettings[key]}
                                  onChange={e => setSectionSettings(s => ({ ...s, [key]: e.target.checked }))}
                                  style={{ accentColor: ACC, width: 13, height: 13, flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 21 }}>{hint}</span>
                            </label>
                          ))}
                          {/* Divider */}
                          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />

                          {/* Global custom headings */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>Global headings</span>
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4,
                                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)',
                                color: '#38bdf8', fontWeight: 700 }}>ALL PAPERS</span>
                            </div>
                            <textarea
                              value={sectionSettings.customHeadings}
                              onChange={e => setSectionSettings(s => ({ ...s, customHeadings: e.target.value }))}
                              placeholder={'experimental setup\nlimitations\nfuture work\nethical statement'}
                              rows={3}
                              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', resize: 'vertical',
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(56,189,248,0.2)',
                                borderRadius: 6, padding: '6px 8px', color: 'var(--text)',
                                width: '100%', boxSizing: 'border-box' }}
                            />
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              Comma- or newline-separated. Applied to every paper. Saved in browser settings.
                            </span>
                          </div>

                          {/* Per-paper custom headings */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>This paper's headings</span>
                              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4,
                                background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)',
                                color: '#a78bfa', fontWeight: 700 }}>THIS PAPER</span>
                            </div>
                            {bench.paperId ? (
                              <>
                                <textarea
                                  value={paperHeadingsDraft}
                                  onChange={e => setPaperHeadingsDraft(e.target.value)}
                                  placeholder={'patient cohort\nstatistical analysis\nclinical implications'}
                                  rows={3}
                                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)', resize: 'vertical',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(167,139,250,0.2)',
                                    borderRadius: 6, padding: '6px 8px', color: 'var(--text)',
                                    width: '100%', boxSizing: 'border-box' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>
                                    Overrides only for this paper. Stored on the paper object.
                                  </span>
                                  <button onClick={savePaperHeadings}
                                    style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 5,
                                      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                                      background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.35)',
                                      color: '#a78bfa' }}>
                                    Save to paper
                                  </button>
                                </div>
                              </>
                            ) : (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Select a paper first to set paper-specific headings.
                              </span>
                            )}
                          </div>
                          <button onClick={() => setSectionSettings({
                            maxHeadingLen: 80, requireNoPunctEnd: true, allowNumberedPrefix: true,
                            requireIsolatedLine: true, mergeDuplicates: false, customHeadings: '',
                          })} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5,
                            cursor: 'pointer', alignSelf: 'flex-start',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: 'var(--text-muted)' }}>
                            Reset to defaults
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Stacked fingerprint bar */}
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden',
                    marginBottom: 8, gap: 1 }}>
                    {rawSections.map((sec, idx) => {
                      const pct = totalWords > 0 ? sec.words / totalWords : 0;
                      const col = colorOf(sec);
                      const anomaly = anomalyOf(sec);
                      return (
                        <div key={idx}
                          onClick={() => { jumpToSection(sec.lineIndex ?? 0); activateSearch(sec.name); }}
                          title={`${sec.name}: ${sec.words.toLocaleString()} w (${Math.round(pct * 100)}%)${anomaly ? ' · ' + anomaly.label : ''}`}
                          style={{ height: '100%', flexShrink: 0, width: `${pct * 100}%`, minWidth: 2,
                            background: anomaly ? anomaly.color : col,
                            opacity: anomaly ? 1 : 0.75, cursor: 'pointer', transition: 'opacity 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = anomaly ? '1' : '0.75'}
                        />
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {sections.map((sec, i) => {
                        const pct = totalWords > 0 ? sec.words / totalWords : 0;
                        const col = colorOf(sec);
                        const key = secKey(sec, i);
                        const isExpanded = expandedSections.has(key);
                        const preview = sec.previewLines || [];
                        const anomaly = anomalyOf(sec);
                        return (
                          <div key={key}>
                            {/* Main row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                              borderRadius: 5, padding: '2px 4px 2px 0',
                              transition: 'background 0.12s' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                              {/* Expand toggle */}
                              <button
                                onClick={() => setExpandedSections(prev => {
                                  const next = new Set(prev);
                                  next.has(key) ? next.delete(key) : next.add(key);
                                  return next;
                                })}
                                title={isExpanded ? 'Collapse preview' : 'Expand preview'}
                                style={{ width: 14, height: 14, flexShrink: 0, background: 'none',
                                  border: 'none', cursor: 'pointer', padding: 0,
                                  color: 'var(--text-muted)', fontSize: 8, lineHeight: 1,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  opacity: preview.length ? 1 : 0.2 }}>
                                {isExpanded ? '▾' : '▸'}
                              </button>

                              {/* Section name — click to jump + search */}
                              <button
                                onClick={() => {
                                  jumpToSection(sec.lineIndex ?? 0);
                                  activateSearch(sec.name);
                                }}
                                title={`Jump to ${sec.name} in output · search for occurrences`}
                                style={{ width: 110, flexShrink: 0, fontSize: 11, color: col,
                                  fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', textAlign: 'left',
                                  background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                {sec.name}
                                {sec.occurrences > 1 && (
                                  <span style={{ opacity: 0.5, fontSize: 9, marginLeft: 3 }}>×{sec.occurrences}</span>
                                )}
                              </button>

                              {/* Anomaly icon */}
                              {anomaly && (
                                <span title={anomaly.label}
                                  style={{ fontSize: 10, flexShrink: 0, cursor: 'help', lineHeight: 1 }}>
                                  {anomaly.icon}
                                </span>
                              )}

                              {/* Progress bar — click to jump */}
                              <div
                                onClick={() => jumpToSection(sec.lineIndex ?? 0)}
                                title="Jump to section in output"
                                style={{ flex: 1, height: 5, borderRadius: 3, cursor: 'pointer',
                                  background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 3,
                                  background: anomaly ? anomaly.color : col,
                                  width: `${pct * 100}%`, transition: 'width 0.3s' }} />
                              </div>

                              {/* Word count */}
                              <span style={{ fontSize: 10, color: anomaly ? anomaly.color : col, width: 60,
                                flexShrink: 0, textAlign: 'right', opacity: 0.85 }}>
                                {sec.words.toLocaleString()} w
                              </span>
                            </div>

                            {/* Preview lines (collapsed by default) */}
                            {isExpanded && preview.length > 0 && (
                              <div style={{ marginLeft: 20, marginTop: 3, marginBottom: 4,
                                padding: '7px 10px', borderRadius: 5,
                                background: 'rgba(255,255,255,0.025)',
                                borderLeft: `2px solid ${col}44` }}>
                                {preview.map((line, li) => (
                                  <div key={li} style={{ fontSize: 10, color: 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)', lineHeight: 1.6,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {line}
                                  </div>
                                ))}
                                {sec.words > preview.join(' ').split(/\s+/).length && (
                                  <div style={{ fontSize: 9, color: col, opacity: 0.5, marginTop: 3 }}>
                                    …{sec.words.toLocaleString()} words total
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                </div>
              );
            })()}


</>
            )}


          </div>
        </div>
      </>) : (
        /* ── Parsing callout — shown when this component is in Ingestion Pipeline mode ── */
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.18)',
          borderRadius: 10, padding: '18px 22px',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9, flexShrink: 0,
            background: cr(0.12), display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={18} color={ACC} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
              Run document extractions in the Parsing tab
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Select a parser, run extractions, inspect output and section structure — then return here to configure chunking and entity extraction.
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate({ tab: 'parsing' })}
              style={{
                flexShrink: 0, fontSize: 12, fontWeight: 700, padding: '8px 16px',
                borderRadius: 7, cursor: 'pointer', letterSpacing: '0.03em',
                background: cr(0.14), border: `1px solid ${cr(0.35)}`, color: ACC,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = cr(0.25)}
              onMouseLeave={e => e.currentTarget.style.background = cr(0.14)}
            >
              Go to Parsing →
            </button>
          )}
        </div>
      )}

      {/* ── 2. Chunking Strategy ── */}
      {mode !== 'parsing' && (<>
      <SectionCard icon={Scissors} title="Chunking Strategy" defaultOpen>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Strategy radio */}
          <div>
            <FL label="Strategy">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                {CHUNK_STRATEGIES.map(cs => (
                  <label key={cs.value} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                    padding: '7px 10px', borderRadius: 8,
                    background: s.chunking.strategy === cs.value ? cr(0.06) : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${s.chunking.strategy === cs.value ? cr(0.25) : 'rgba(255,255,255,0.07)'}`,
                  }}>
                    <input type="radio" name="chunk-strat" value={cs.value}
                      checked={s.chunking.strategy === cs.value}
                      onChange={() => set('chunking', { strategy: cs.value })}
                      style={{ accentColor: ACC, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600,
                        color: s.chunking.strategy === cs.value ? 'var(--text)' : 'var(--text-muted)' }}>
                        {cs.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {cs.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </FL>
          </div>

          {/* Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FL label="Chunk Size (tokens)">
                <input style={inputSx} type="number" value={s.chunking.chunkSize}
                  onChange={e => set('chunking', { chunkSize: e.target.value })} />
              </FL>
              <FL label="Overlap (tokens)">
                <input style={inputSx} type="number" value={s.chunking.overlap}
                  onChange={e => set('chunking', { overlap: e.target.value })} />
              </FL>
            </div>
            <FL label="Implementation">
              <select style={selectSx} value={s.chunking.implementation}
                onChange={e => set('chunking', { implementation: e.target.value })}>
                {CHUNK_IMPLEMENTATIONS.map(i => <option key={i}>{i}</option>)}
              </select>
            </FL>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '7px 10px', borderRadius: 8, fontSize: 12,
              background: s.chunking.sectionDetection ? cr(0.06) : 'rgba(255,255,255,0.02)',
              border: `1px solid ${s.chunking.sectionDetection ? cr(0.25) : 'rgba(255,255,255,0.07)'}`,
              color: s.chunking.sectionDetection ? 'var(--text)' : 'var(--text-muted)' }}>
              <input type="checkbox" checked={s.chunking.sectionDetection}
                onChange={e => set('chunking', { sectionDetection: e.target.checked })}
                style={{ accentColor: ACC }} />
              Section heading detection enabled
            </label>
            {s.chunking.chunkSize && s.chunking.overlap && (
              <div style={{ padding: '8px 12px', borderRadius: 8,
                background: cr(0.06), border: `1px solid ${cr(0.2)}`,
                fontSize: 11, color: 'var(--text-secondary)' }}>
                Overlap ratio:{' '}
                <strong style={{ color: ACC }}>
                  {Math.round((+s.chunking.overlap / +s.chunking.chunkSize) * 100)}%
                </strong>
                {' '}— recommended 10–20% for most use cases.
              </div>
            )}
            <FL label="Notes">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 52 }}
                value={s.chunking.notes}
                onChange={e => set('chunking', { notes: e.target.value })}
                placeholder="Notes on implementation, special handling by doc type…" />
            </FL>
          </div>
        </div>
      </SectionCard>

      {/* ── 3. Entity Extraction Pipeline ── */}
      <SectionCard icon={Cpu} title="Entity Extraction Pipeline"
        badge={`${s.nerTools.length} tool${s.nerTools.length !== 1 ? 's' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.nerTools.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0',
              fontSize: 12, color: 'var(--text-muted)' }}>
              No extraction tools configured.
            </div>
          ) : (
            s.nerTools.map(t => {
              const sc = NER_STATUSES.find(o => o.value === t.status) || NER_STATUSES[0];
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {t.tool}
                      </span>
                      {t.model && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)',
                          fontFamily: 'monospace' }}>{t.model}</span>
                      )}
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 10, background: `${sc.color}18`, color: sc.color,
                        border: `1px solid ${sc.color}44`, textTransform: 'uppercase',
                        letterSpacing: '0.07em' }}>
                        {sc.label}
                      </span>
                    </div>
                    {t.entityTypes.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                        {t.entityTypes.map(et => (
                          <span key={et} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8,
                            background: cr(0.08), border: `1px solid ${cr(0.25)}`, color: ACC }}>
                            {et}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.notes && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.notes}</div>
                    )}
                  </div>
                  <button onClick={() => setNerModal(t)} style={ghostBtn}><Edit2 size={11} /></button>
                  <button onClick={() => remove('nerTools', t.id)} style={dangerBtn}><Trash2 size={11} /></button>
                </div>
              );
            })
          )}
          <button onClick={() => setNerModal({ id: newId('ner'), tool: 'spaCy', model: '',
            entityTypes: [], configPath: '', notes: '', status: 'configured' })}
            style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
              borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Add Extraction Tool
          </button>
        </div>
      </SectionCard>

      {/* ── 4 + 5: Enrichment + Deduplication ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Metadata Enrichment */}
        <InlinePanel icon={Tag} title="Metadata Enrichment"
          rightLabel={`${Object.values(s.enrichment.fields).filter(Boolean).length} / ${ENRICHMENT_FIELDS.length} fields`}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Method
            </div>
            <MethodRow options={ENRICHMENT_METHODS} value={s.enrichment.method}
              onChange={v => set('enrichment', { method: v })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
            {ENRICHMENT_FIELDS.map(f => (
              <CheckRow key={f.key}
                item={{ label: f.label, desc: f.desc }}
                checked={s.enrichment.fields[f.key]}
                onChange={v => setField('enrichment', 'fields', f.key, v)} />
            ))}
          </div>
          <FL label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 48 }}
              value={s.enrichment.notes}
              onChange={e => set('enrichment', { notes: e.target.value })}
              placeholder="Notes on tagging logic, data sources…" />
          </FL>
        </InlinePanel>

        {/* Deduplication */}
        <InlinePanel icon={Copy} title="Deduplication"
          rightLabel={`${Object.values(s.deduplication.methods).filter(Boolean).length} method${Object.values(s.deduplication.methods).filter(Boolean).length !== 1 ? 's' : ''} active`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
            {DEDUP_METHODS.map(m => (
              <CheckRow key={m.key}
                item={{ label: m.label, desc: m.desc }}
                checked={s.deduplication.methods[m.key]}
                onChange={v => setField('deduplication', 'methods', m.key, v)} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <FL label="Similarity Threshold (%)">
              <input style={inputSx} type="number" min={50} max={100}
                value={s.deduplication.threshold}
                onChange={e => set('deduplication', { threshold: e.target.value })} />
            </FL>
            <FL label="Implementation">
              <input style={inputSx} value={s.deduplication.implementation}
                onChange={e => set('deduplication', { implementation: e.target.value })}
                placeholder="e.g. datasketch, custom" />
            </FL>
          </div>
          <FL label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 48 }}
              value={s.deduplication.notes}
              onChange={e => set('deduplication', { notes: e.target.value })}
              placeholder="Notes on dedup strategy and edge cases…" />
          </FL>
        </InlinePanel>
      </div>

      {/* ── 6 + 7: Knowledge Extraction + Provenance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Knowledge Extraction */}
        <InlinePanel icon={Lightbulb} title="Knowledge Extraction"
          rightLabel={`${Object.values(s.knowledgeExtraction.types).filter(Boolean).length} type${Object.values(s.knowledgeExtraction.types).filter(Boolean).length !== 1 ? 's' : ''} active`}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Method
            </div>
            <MethodRow options={KE_METHODS} value={s.knowledgeExtraction.method}
              onChange={v => set('knowledgeExtraction', { method: v })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
            {KE_TYPES.map(t => (
              <CheckRow key={t.key}
                item={{ label: t.label, desc: t.desc }}
                checked={s.knowledgeExtraction.types[t.key]}
                onChange={v => setField('knowledgeExtraction', 'types', t.key, v)} />
            ))}
          </div>
          {s.knowledgeExtraction.method !== 'rule-based' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <FL label="LLM Model">
                <input style={inputSx} value={s.knowledgeExtraction.llmModel}
                  onChange={e => set('knowledgeExtraction', { llmModel: e.target.value })}
                  placeholder="e.g. gpt-4o, claude-sonnet" />
              </FL>
              <FL label="Prompt Path">
                <input style={inputSx} value={s.knowledgeExtraction.promptPath}
                  onChange={e => set('knowledgeExtraction', { promptPath: e.target.value })}
                  placeholder="e.g. prompts/extract.yaml" />
              </FL>
            </div>
          )}
          <FL label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 48 }}
              value={s.knowledgeExtraction.notes}
              onChange={e => set('knowledgeExtraction', { notes: e.target.value })}
              placeholder="Notes on extraction quality, review process…" />
          </FL>
        </InlinePanel>

        {/* Provenance Tagging */}
        <InlinePanel icon={Fingerprint} title="Provenance Tagging"
          rightLabel={`${Object.values(s.provenance.fields).filter(Boolean).length} / ${PROV_FIELDS.length} fields`}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
              Storage Format
            </div>
            <MethodRow options={PROV_STORAGE} value={s.provenance.storageFormat}
              onChange={v => set('provenance', { storageFormat: v })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
            {PROV_FIELDS.map(f => (
              <CheckRow key={f.key}
                item={{ label: f.label, desc: f.desc }}
                checked={s.provenance.fields[f.key]}
                onChange={v => setField('provenance', 'fields', f.key, v)} />
            ))}
          </div>
          <FL label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 48 }}
              value={s.provenance.notes}
              onChange={e => set('provenance', { notes: e.target.value })}
              placeholder="Notes on provenance implementation, per-fact vs per-chunk…" />
          </FL>
        </InlinePanel>
      </div>
      </>)}

      {/* ── Modals ── */}
      {parserModal && (
        <ParserModal initial={parserModal}
          onSave={p => { upsert('parsers', p); setParserModal(null); }}
          onClose={() => setParserModal(null)} />
      )}
      {nerModal && (
        <NERModal initial={nerModal}
          onSave={t => { upsert('nerTools', t); setNerModal(null); }}
          onClose={() => setNerModal(null)} />
      )}

      {/* ── Extraction History modal ── */}
      {showHistoryModal && (() => {
        const paper = papersWithFile.find(p => p.id === bench.paperId);
        const history = paper?.extractionHistory || [];
        return (
          <div onClick={() => setShowHistoryModal(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1200,
              background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start',
              justifyContent: 'center', paddingTop: 60, paddingBottom: 40 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 700, maxHeight: 'calc(100vh - 100px)',
                display: 'flex', flexDirection: 'column',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '16px 22px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                  Extraction History
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
                  background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}` }}>
                  {history.length} entries
                </span>
                <button onClick={() => setShowHistoryModal(false)}
                  style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px' }}>×</button>
              </div>
              {/* List */}
              <div style={{ overflowY: 'auto', padding: '14px 22px',
                display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...history].reverse().map(entry => {
                  const targetColor = EXTRACTION_TARGETS.find(t => t.id === entry.target)?.color || '#94a3b8';
                  const date = new Date(entry.timestamp);
                  const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                  return (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: `${targetColor}14`, border: `1px solid ${targetColor}33`,
                        color: targetColor, textTransform: 'uppercase', flexShrink: 0 }}>
                        {entry.target}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                        {entry.parser}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {entry.chars?.toLocaleString()} chars · {entry.pagesScanned}/{entry.totalPages} pages
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                        {dateStr}
                      </span>
                      <button
                        onClick={() => { setBench(b => ({
                          ...b,
                          output: { text: entry.text, chars: entry.chars,
                            pagesScanned: entry.pagesScanned, totalPages: entry.totalPages,
                            parser: entry.parser },
                          parserId: entry.parserId, target: entry.target, error: null,
                        })); setShowHistoryModal(false); }}
                        style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 5,
                          cursor: 'pointer', flexShrink: 0,
                          background: cr(0.08), border: `1px solid ${cr(0.25)}`, color: ACC }}>
                        Load
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sections card-view modal ── */}
      {showSectionsModal && sectionData && bench.output && (() => {
        const MODAL_COLORS = [
          '#38bdf8','#fb923c','#34d399','#a78bfa','#f472b6',
          '#facc15','#60a5fa','#4ade80','#f87171','#818cf8','#2dd4bf','#fb7185',
        ];
        const allSections = extractSectionTexts(bench.output.text, sectionData);
        const paper       = papersWithFile.find(p => p.id === bench.paperId);
        const totalW      = allSections.reduce((n, s) => n + s.words, 0);
        const LINE_H      = 11 * 1.6;

        // ── #18 Cross-parser word-count comparison ──────────────────────────
        // parserComparisons: { [sectionName]: [{ parser, words, diff, pct }] }
        const parserComparisons = (() => {
          const history = paper?.extractionHistory || [];
          if (history.length === 0) return {};
          const curParser = bench.output.parser || bench.parserId || '';
          // Collect the most recent unique run per parser (excluding current)
          const seen = new Set([curParser]);
          const otherRuns = [];
          for (const entry of [...history].reverse()) {
            if (entry.target !== 'full-text' || !entry.text) continue;
            if (seen.has(entry.parser)) continue;
            seen.add(entry.parser);
            otherRuns.push(entry);
            if (otherRuns.length >= 3) break;
          }
          if (otherRuns.length === 0) return {};
          const result = {};
          for (const run of otherRuns) {
            try {
              const otherSecs  = analyzeSections(run.text, sectionSettings, paper?.sectionHeadings || '');
              const otherTexts = extractSectionTexts(run.text, otherSecs);
              for (const os of otherTexts) {
                if (!result[os.name]) result[os.name] = [];
                result[os.name].push({ parser: run.parser, words: os.words });
              }
            } catch { /* skip malformed history entry */ }
          }
          return result;
        })();

        // Filter by modalSearch (name or body text)
        const q = modalSearch.trim().toLowerCase();
        const filtered = q
          ? allSections.filter(s =>
              s.name.toLowerCase().includes(q) || s.text.toLowerCase().includes(q))
          : allSections;

        // Map filtered index → original index (for colors + active detection)
        const originalIdx = (sec) => allSections.indexOf(sec);

        const jumpInModal = (lineIndex, secName) => {
          setShowSectionsModal(false);
          setSearchQuery(secName); setSearchIdx(0);
          setTimeout(() => { if (outputRef.current) outputRef.current.scrollTop = Math.max(0, lineIndex * LINE_H - 12); }, 60);
        };

        // ── Per-card analysis helpers ──────────────────────────────────────
        const STOPWORDS = new Set([
          'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
          'from','as','is','was','are','were','be','been','being','have','has','had',
          'do','does','did','will','would','could','should','may','might','shall','can',
          'not','no','nor','so','yet','both','either','neither','each','few','more',
          'most','other','some','such','than','then','there','these','they','this',
          'those','through','up','out','if','about','into','also','it','its','we',
          'you','he','she','that','which','who','what','when','where','how','all',
          'any','between','i','am','our','their','his','her','my','your','us','them',
          'me','him','s','t','re','ll','ve','d','m','n','one','two','three','here',
        ]);

        const topKeywords = (text, n = 5) => {
          if (!text) return [];
          const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
          const freq = {};
          for (const w of words) {
            if (!STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
          }
          return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([word, count]) => ({ word, count }));
        };

        const sentenceStats = (text) => {
          if (!text) return null;
          const sents = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim().length > 8);
          if (sents.length === 0) return null;
          const totalW = sents.reduce((n, s) => n + s.trim().split(/\s+/).length, 0);
          const avg    = Math.round(totalW / sents.length);
          const style  = avg < 12 ? 'bullet-style' : avg > 28 ? 'dense prose' : 'mixed';
          return { count: sents.length, avg, style };
        };

        const firstSentence = (text) => {
          if (!text) return '';
          const m = text.match(/^.{15,}?[.!?](?=\s|$)/s);
          return m ? m[0].trim() : text.slice(0, 130).trim() + (text.length > 130 ? '…' : '');
        };

        // ── Per-section saved metadata helpers ─────────────────────────────
        const secMeta   = (origI) => paper?.sections?.[origI] || {};
        const isPinned  = (origI) => !!secMeta(origI).pinned;
        const pinWeight = (s)     => isPinned(originalIdx(s)) ? 0 : 1;

        // per-card single-section export
        const exportCard = (sec, origI, fmt) => {
          const stem = (secMeta(origI).customName || sec.name).slice(0, 40).replace(/[^a-z0-9]/gi, '_');
          const blob = fmt === 'md'
            ? new Blob([`## ${sec.name}\n\n${sec.text}`], { type: 'text/markdown' })
            : new Blob([sec.text || ''], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href = url; a.download = `${stem}.${fmt}`; a.click(); URL.revokeObjectURL(url);
          setCardExportOpen(null);
        };

        // ── Sort filtered list (pins always float to top) ───────────────────
        const sorted = (() => {
          const arr = [...filtered];
          if (modalSort === 'words')
            arr.sort((a, b) => pinWeight(a) - pinWeight(b) || b.words - a.words);
          else if (modalSort === 'alpha')
            arr.sort((a, b) => pinWeight(a) - pinWeight(b) || a.name.localeCompare(b.name));
          else if (modalSort === 'anomaly') {
            const flag = s => ((s.words < 50) || (totalW > 0 && s.words / totalW > 0.5)) ? 0 : 1;
            arr.sort((a, b) => pinWeight(a) - pinWeight(b) || flag(a) - flag(b));
          } else {
            // document order — just float pinned
            arr.sort((a, b) => pinWeight(a) - pinWeight(b) || originalIdx(a) - originalIdx(b));
          }
          return arr;
        })();

        // ── Highlight search-query terms inside card body ───────────────────
        const highlightInBody = (text) => {
          if (!searchQuery.trim() || !text) return text;
          try {
            const esc  = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pat  = searchRegex ? searchQuery : esc;
            const re   = new RegExp(`(${pat})`, 'gi');
            const test = new RegExp(pat, 'i');
            return text.split(re).map((part, i) =>
              test.test(part)
                ? <mark key={i} style={{ background: '#fbbf2466', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
                : part
            );
          } catch { return text; }
        };


        // ── Layout tokens ───────────────────────────────────────────────────
        const gridCols  = modalCardSize === 'wide' ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))';
        const bodyMaxH  = modalCardSize === 'wide' ? 260 : 180;
        const hideBody  = modalCollapsed || modalCardSize === 'compact';

        // ── Button helper ───────────────────────────────────────────────────
        const ToolBtn = ({ active, onClick, children, title }) => (
          <button title={title} onClick={onClick}
            style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
              fontWeight: active ? 700 : 400,
              background: active ? `${ACC}22` : 'rgba(255,255,255,0.05)',
              border: `1px solid ${active ? ACC : 'rgba(255,255,255,0.12)'}`,
              color: active ? ACC : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {children}
          </button>
        );

        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000,
              background: '#070d1a',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '28px 24px 24px', overflowY: 'auto' }}>

            <div style={{ width: '100%', maxWidth: modalCardSize === 'wide' ? 860 : 960,
              display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ── Title row ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                    Section breakdown
                  </div>
                  {paper && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {paper.title} · {allSections.length} sections · {totalW.toLocaleString()} words
                    </div>
                  )}
                </div>
                <button onClick={() => setShowSectionsModal(false)}
                  style={{ width: 30, height: 30, borderRadius: 7,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              </div>

              {/* ── Toolbar row ── */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {/* Sort group */}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, marginRight: 2 }}>SORT</span>
                {[['document','Doc order'],['words','Word count'],['alpha','A–Z'],['anomaly','Anomalies ⚠']].map(([v, label]) => (
                  <ToolBtn key={v} active={modalSort === v} onClick={() => setModalSort(v)}>{label}</ToolBtn>
                ))}

                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                {/* Collapse toggle */}
                <ToolBtn active={modalCollapsed} onClick={() => setModalCollapsed(c => !c)}
                  title="Toggle between overview (headers only) and reading (full text) mode">
                  {modalCollapsed ? '⊞ Expand all' : '⊟ Collapse all'}
                </ToolBtn>

                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                {/* Card size */}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.6, marginRight: 2 }}>SIZE</span>
                {[['compact','Compact'],['normal','Normal'],['wide','Wide'],['list','List']].map(([v, label]) => (
                  <ToolBtn key={v} active={modalCardSize === v} onClick={() => setModalCardSize(v)}>{label}</ToolBtn>
                ))}

              </div>

              {/* ── Search bar ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Filter by section name or body text…"
                    value={modalSearch}
                    onChange={e => { setModalSearch(e.target.value); setModalFocusIdx(0); }}
                    style={{ ...inputSx, width: '100%', boxSizing: 'border-box',
                      paddingRight: modalSearch ? 28 : 12 }}
                  />
                  {modalSearch && (
                    <button onClick={() => setModalSearch('')}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: 14, lineHeight: 1 }}>×</button>
                  )}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', opacity: 0.6 }}>
                  ←→ navigate · Enter jump · Esc close
                </span>
                {q && (
                  <span style={{ fontSize: 10, color: ACC, whiteSpace: 'nowrap' }}>
                    {filtered.length} / {allSections.length}
                  </span>
                )}
              </div>

              {/* ── Cards grid / list ── */}
              {sorted.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center', opacity: 0.5 }}>
                  No sections match "{modalSearch}"
                </div>
              ) : modalCardSize === 'list' ? (

                /* ── List + Detail split view ──────────────────────────── */
                <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 270px)', minHeight: 440,
                  borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>

                  {/* Left: compact section list */}
                  <div style={{ width: 268, flexShrink: 0, overflowY: 'auto',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.018)' }}>
                    {sorted.map((sec, filteredI) => {
                      const oI  = originalIdx(sec);
                      const c   = MODAL_COLORS[oI % MODAL_COLORS.length];
                      const m   = secMeta(oI);
                      const sel = filteredI === modalFocusIdx;
                      const act = oI === activeSectionIdx;
                      const pct2 = totalW > 0 ? Math.round(sec.words / totalW * 100) : 0;
                      return (
                        <div key={oI} onClick={() => setModalFocusIdx(filteredI)}
                          style={{ display: 'flex', alignItems: 'center', gap: 7,
                            padding: '8px 12px', cursor: 'pointer',
                            borderLeft: `3px solid ${sel ? c : 'transparent'}`,
                            background: sel ? `${c}15` : act ? `${c}07` : 'transparent',
                            transition: 'background 0.1s' }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%',
                            background: c, flexShrink: 0, opacity: sel ? 1 : 0.7 }} />
                          {m.pinned && <span style={{ fontSize: 9 }}>📌</span>}
                          {sec.mdLevel && (
                            <span style={{ fontSize: 7, fontWeight: 700, padding: '0px 3px', borderRadius: 2,
                              background: `${c}18`, color: c, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                              H{sec.mdLevel}
                            </span>
                          )}
                          <span style={{ flex: 1, fontSize: 11,
                            fontWeight: sel ? 700 : 400,
                            color: sel ? c : 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            paddingLeft: sec.mdLevel ? (sec.mdLevel - 1) * 8 : 0 }}>
                            {m.customName || sec.name}
                          </span>
                          {sec.words < 50 && <span style={{ fontSize: 9, opacity: 0.7 }}>⚠</span>}
                          {pct2 > 50    && <span style={{ fontSize: 9, opacity: 0.7 }}>⚡</span>}
                          {act && <span style={{ fontSize: 7, color: c, flexShrink: 0 }}>●</span>}
                          <span style={{ fontSize: 9, color: 'var(--text-muted)',
                            flexShrink: 0, opacity: 0.65 }}>
                            {sec.words.toLocaleString()}w
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: full detail panel */}
                  {(() => {
                    const dSec = sorted[modalFocusIdx];
                    if (!dSec) return (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 12,
                        color: 'var(--text-muted)', opacity: 0.35 }}>
                        Select a section
                      </div>
                    );
                    const dOrigI   = originalIdx(dSec);
                    const dCol     = MODAL_COLORS[dOrigI % MODAL_COLORS.length];
                    const dPct     = totalW > 0 ? Math.round(dSec.words / totalW * 100) : 0;
                    const dMeta    = secMeta(dOrigI);
                    const dPinned  = !!dMeta.pinned;
                    const dName    = dMeta.customName || dSec.name;
                    const dEdit    = editingName === dOrigI;
                    const dActive  = dOrigI === activeSectionIdx;
                    const dKws     = topKeywords(dSec.text);
                    const dStats   = sentenceStats(dSec.text);
                    const dFirst   = firstSentence(dSec.text);
                    const dDiffs   = (parserComparisons[dSec.name] || [])
                      .map(d => ({ ...d, diff: d.words - dSec.words,
                        pct: dSec.words > 0 ? (d.words - dSec.words) / dSec.words : 0 }))
                      .filter(d => Math.abs(d.pct) > 0.15 || Math.abs(d.diff) > 80);
                    const dIsRef   = /\b(references?|bibliography|works?\s+cited|citations?|literature)\b/i.test(dSec.name);
                    const dCites   = (() => {
                      if (!dIsRef || !dSec.text) return 0;
                      const nums = new Set((dSec.text.match(/\[(\d+)\]/g) || []).map(s => parseInt(s.replace(/\D/g, ''))));
                      const list = (dSec.text.match(/^\s*\d+[.)]\s+\S/gm) || []).length;
                      return Math.max(nums.size, list);
                    })();
                    return (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* Detail header */}
                        <div style={{ padding: '12px 16px 10px', flexShrink: 0,
                          background: `linear-gradient(135deg, ${dCol}22 0%, ${dCol}08 100%)`,
                          borderBottom: `1px solid ${dCol}25`,
                          display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button title={dPinned ? 'Unpin' : 'Pin to top'}
                            onClick={() => updateSectionMeta(dOrigI, { pinned: !dPinned })}
                            style={{ fontSize: 12, padding: '1px 2px', borderRadius: 4, border: 'none',
                              cursor: 'pointer', background: dPinned ? `${dCol}30` : 'transparent',
                              color: dPinned ? dCol : 'var(--text-muted)', opacity: dPinned ? 1 : 0.35 }}>
                            📌
                          </button>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dCol, flexShrink: 0 }} />
                          {dSec.mdLevel && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                              background: `${dCol}18`, border: `1px solid ${dCol}30`, color: dCol,
                              flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                              H{dSec.mdLevel}
                            </span>
                          )}
                          {dEdit ? (
                            <input autoFocus value={editNameDraft}
                              onChange={e => setEditNameDraft(e.target.value)}
                              onBlur={() => { if (editNameDraft.trim()) updateSectionMeta(dOrigI, { customName: editNameDraft.trim() }); setEditingName(null); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingName(null); e.stopPropagation(); }}
                              style={{ flex: 1, fontSize: 14, fontWeight: 700, background: `${dCol}18`,
                                border: `1px solid ${dCol}60`, borderRadius: 4, padding: '2px 7px',
                                color: dCol, outline: 'none' }} />
                          ) : (
                            <span title="Click to rename"
                              onClick={() => { setEditNameDraft(dName); setEditingName(dOrigI); }}
                              style={{ fontSize: 14, fontWeight: 700, color: dCol, flex: 1, cursor: 'text' }}>
                              {dName}
                              {dMeta.customName && (
                                <span title="Reset" onClick={e => { e.stopPropagation(); updateSectionMeta(dOrigI, { customName: null }); }}
                                  style={{ fontSize: 9, opacity: 0.5, marginLeft: 5, cursor: 'pointer' }}>✎</span>
                              )}
                            </span>
                          )}
                          {dSec.words < 50 && <span title="Very short" style={{ fontSize: 13 }}>⚠</span>}
                          {dPct > 50       && <span title="Dominant"   style={{ fontSize: 13 }}>⚡</span>}
                          {dActive && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                              background: `${dCol}25`, color: dCol, whiteSpace: 'nowrap' }}>
                              ● Now reading
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: dCol, fontWeight: 700, flexShrink: 0 }}>
                            {dSec.words.toLocaleString()} w
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 6px',
                            borderRadius: 3, background: `${dCol}18`, border: `1px solid ${dCol}30`, flexShrink: 0 }}>
                            {dPct}%
                          </span>
                        </div>

                        {/* Bar */}
                        <div style={{ height: 3, background: `${dCol}18`, flexShrink: 0 }}>
                          <div style={{ height: '100%', background: dCol, width: `${dPct}%`, opacity: 0.7 }} />
                        </div>

                        {/* First sentence */}
                        {dFirst && (
                          <div style={{ padding: '10px 16px 8px', flexShrink: 0,
                            fontSize: 12, fontStyle: 'italic', lineHeight: 1.6,
                            color: 'var(--text)', opacity: 0.88,
                            borderBottom: `1px solid ${dCol}12` }}>
                            {dFirst}
                          </div>
                        )}

                        {/* Keywords + stats */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5,
                          padding: '7px 16px', flexShrink: 0,
                          borderBottom: dDiffs.length === 0 ? `1px solid ${dCol}12` : 'none' }}>
                          {dKws.map(({ word, count }) => (
                            <span key={word} title={`appears ${count}×`}
                              style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: `${dCol}18`, color: dCol, fontWeight: 600,
                                border: `1px solid ${dCol}28` }}>
                              {word}
                            </span>
                          ))}
                          {dCites > 0 && (
                            <span title={`${dCites} citation entries detected`}
                              style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10,
                                background: '#818cf818', color: '#818cf8',
                                fontWeight: 600, border: '1px solid #818cf830' }}>
                              📚 {dCites} citations
                            </span>
                          )}
                          {dStats && (
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>
                              {dStats.count} sent · avg {dStats.avg}w ·{' '}
                              <span style={{ color: dStats.style === 'dense prose' ? '#f87171' : dStats.style === 'bullet-style' ? '#34d399' : 'var(--text-muted)' }}>
                                {dStats.style}
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Parser diffs */}
                        {dDiffs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4,
                            padding: '4px 16px 6px', borderBottom: `1px solid ${dCol}12`, flexShrink: 0 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5, marginRight: 2 }}>vs other parsers:</span>
                            {dDiffs.map(d => {
                              const isMore = d.diff > 0;
                              const dc = isMore ? '#34d399' : '#f87171';
                              const sign = isMore ? '+' : '';
                              return (
                                <span key={d.parser} title={`${d.parser}: ${d.words.toLocaleString()} words`}
                                  style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10,
                                    background: `${dc}15`, color: dc, border: `1px solid ${dc}30`, fontWeight: 600 }}>
                                  {d.parser} {sign}{Math.round(d.pct * 100)}%
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Body — full height */}
                        <div style={{ flex: 1, padding: '10px 16px 12px', overflowY: 'auto',
                          fontSize: 11, lineHeight: 1.72, color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {dSec.text
                            ? highlightInBody(dSec.text)
                            : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>No body text detected.</span>}
                        </div>

                        {/* Annotation */}
                        <div style={{ padding: '6px 16px', borderTop: `1px solid ${dCol}12`, flexShrink: 0 }}>
                          <input type="text" key={`dn-${dOrigI}`}
                            placeholder="Add a note or tag (e.g. #relevant, #skip, #verify)…"
                            defaultValue={dMeta.note || ''}
                            onBlur={e => updateSectionMeta(dOrigI, { note: e.target.value.trim() || null })}
                            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: 10,
                              padding: '3px 8px', borderRadius: 5, background: `${dCol}0d`,
                              border: `1px solid ${dCol}20`, color: 'var(--text-muted)',
                              outline: 'none', fontFamily: 'inherit' }} />
                          {dMeta.note && (
                            <div style={{ marginTop: 3, fontSize: 9, color: dCol, opacity: 0.75 }}>{dMeta.note}</div>
                          )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '7px 16px 10px', borderTop: `1px solid ${dCol}15`,
                          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.55, flex: 1 }}>
                            Line {(dSec.lineIndex ?? 0) + 1} · {dSec.chars?.toLocaleString()} chars
                          </span>
                          <button title="Copy section text"
                            onClick={() => navigator.clipboard.writeText(dSec.text || '')}
                            style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
                              background: `${dCol}12`, border: `1px solid ${dCol}28`, color: dCol }}>
                            ⎘
                          </button>
                          <div style={{ position: 'relative' }}>
                            <button title="Export this section"
                              onClick={e => { e.stopPropagation(); setCardExportOpen(cardExportOpen === dOrigI ? null : dOrigI); }}
                              style={{ fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: 4,
                                cursor: 'pointer', background: `${dCol}12`,
                                border: `1px solid ${dCol}28`, color: dCol }}>
                              ↓ Export
                            </button>
                            {cardExportOpen === dOrigI && (
                              <div onClick={e => e.stopPropagation()}
                                style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                                  background: '#0f1729', border: `1px solid ${dCol}40`,
                                  borderRadius: 7, padding: '4px', display: 'flex',
                                  flexDirection: 'column', gap: 2, zIndex: 10, minWidth: 80 }}>
                                {['txt','md'].map(fmt => (
                                  <button key={fmt} onClick={() => exportCard(dSec, dOrigI, fmt)}
                                    style={{ fontSize: 9, fontWeight: 600, padding: '3px 10px',
                                      borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                                      background: 'transparent', border: 'none', color: dCol }}>
                                    .{fmt}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => jumpInModal(dSec.lineIndex ?? 0, dSec.name)}
                            style={{ fontSize: 9, fontWeight: 600, padding: '3px 10px', borderRadius: 4,
                              cursor: 'pointer', background: `${dCol}15`,
                              border: `1px solid ${dCol}30`, color: dCol }}>
                            Jump ↗
                          </button>
                        </div>

                      </div>
                    );
                  })()}

                </div>

              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                  {sorted.map((sec, filteredI) => {
                    const origI      = originalIdx(sec);
                    const col        = MODAL_COLORS[origI % MODAL_COLORS.length];
                    const pct        = totalW > 0 ? Math.round(sec.words / totalW * 100) : 0;
                    const isTooShort = sec.words < 50;
                    const isDominant = pct > 50;
                    const isActive   = origI === activeSectionIdx;   // currently visible in output
                    const isFocused  = filteredI === modalFocusIdx;  // keyboard focus

                    const keywords    = topKeywords(sec.text);
                    const sentStats   = sentenceStats(sec.text);
                    const firstSent   = firstSentence(sec.text);
                    const meta        = secMeta(origI);
                    const pinned      = !!meta.pinned;
                    const displayName = meta.customName || sec.name;
                    const isEditingThis = editingName === origI;

                    // #18 — significant word-count diffs vs other parser runs
                    const parserDiffs = (parserComparisons[sec.name] || [])
                      .map(d => ({ ...d, diff: d.words - sec.words,
                        pct: sec.words > 0 ? (d.words - sec.words) / sec.words : 0 }))
                      .filter(d => Math.abs(d.pct) > 0.15 || Math.abs(d.diff) > 80);

                    // #19 — citation count for reference-like sections
                    const isRefSection = /\b(references?|bibliography|works?\s+cited|citations?|literature)\b/i.test(sec.name);
                    const citationCount = (() => {
                      if (!isRefSection || !sec.text) return 0;
                      // Count unique [N] markers
                      const bracketNums = new Set((sec.text.match(/\[(\d+)\]/g) || []).map(s => parseInt(s.replace(/\D/g, ''))));
                      // Count numbered-list entries at line start: "1. " or "1) "
                      const listEntries = (sec.text.match(/^\s*\d+[.)]\s+\S/gm) || []).length;
                      return Math.max(bracketNums.size, listEntries);
                    })();

                    return (
                      <div
                        key={origI}
                        ref={el => { modalCardRefs.current[filteredI] = el; }}
                        onClick={() => setModalFocusIdx(filteredI)}
                        style={{ borderRadius: 12, overflow: 'hidden',
                          border: isFocused
                            ? `2px solid ${col}`
                            : isActive
                              ? `2px solid ${col}88`
                              : `1px solid ${col}30`,
                          background: isActive ? `${col}08` : 'rgba(7,13,26,0.97)',
                          display: 'flex', flexDirection: 'column', cursor: 'default',
                          boxShadow: isFocused
                            ? `0 0 0 3px ${col}30, 0 6px 28px rgba(0,0,0,0.4)`
                            : pinned
                              ? `0 0 0 2px ${col}55, 0 4px 18px ${col}22`
                              : isActive
                                ? `0 0 0 2px ${col}18, 0 4px 20px rgba(0,0,0,0.3)`
                                : '0 2px 12px rgba(0,0,0,0.3)',
                          transition: 'box-shadow 0.15s, border 0.15s, background 0.15s' }}>

                        {/* Active / focused badges */}
                        {(isActive || isFocused) && (
                          <div style={{ display: 'flex', gap: 4, padding: '4px 10px 0',
                            justifyContent: 'flex-end' }}>
                            {isActive && (
                              <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                background: `${col}25`, color: col, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                ● Now reading
                              </span>
                            )}
                            {isFocused && (
                              <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                                background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)',
                                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                ↵ focused
                              </span>
                            )}
                          </div>
                        )}

                        {/* Card header */}
                        <div style={{ padding: '10px 14px 8px',
                          background: `linear-gradient(135deg, ${col}22 0%, ${col}08 100%)`,
                          borderBottom: `1px solid ${col}25`,
                          display: 'flex', alignItems: 'center', gap: 8 }}>
                          {/* Pin toggle — #17 */}
                          <button
                            title={pinned ? 'Unpin section' : 'Pin to top'}
                            onClick={e => { e.stopPropagation(); updateSectionMeta(origI, { pinned: !pinned }); }}
                            style={{ fontSize: 11, lineHeight: 1, padding: '1px 2px', borderRadius: 4,
                              border: 'none', cursor: 'pointer', flexShrink: 0,
                              background: pinned ? `${col}30` : 'transparent',
                              color: pinned ? col : 'var(--text-muted)', opacity: pinned ? 1 : 0.35 }}>
                            📌
                          </button>

                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />

                          {/* Heading level badge (from Markdown headings) */}
                          {sec.mdLevel && (
                            <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                              background: `${col}18`, border: `1px solid ${col}30`, color: col,
                              flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                              H{sec.mdLevel}
                            </span>
                          )}

                          {/* Editable name — #15 */}
                          {isEditingThis ? (
                            <input
                              autoFocus
                              value={editNameDraft}
                              onChange={e => setEditNameDraft(e.target.value)}
                              onBlur={() => {
                                if (editNameDraft.trim()) updateSectionMeta(origI, { customName: editNameDraft.trim() });
                                setEditingName(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.target.blur(); }
                                if (e.key === 'Escape') { setEditingName(null); }
                                e.stopPropagation();
                              }}
                              style={{ flex: 1, fontSize: 11, fontWeight: 700,
                                background: `${col}18`, border: `1px solid ${col}60`,
                                borderRadius: 4, padding: '1px 5px',
                                color: col, outline: 'none', minWidth: 0 }}
                            />
                          ) : (
                            <span
                              title="Click to rename"
                              onClick={e => { e.stopPropagation(); setEditNameDraft(displayName); setEditingName(origI); }}
                              style={{ fontSize: 12, fontWeight: 700, color: col, flex: 1,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                cursor: 'text' }}>
                              {displayName}
                              {meta.customName && (
                                <span title="Reset to original name"
                                  onClick={e => { e.stopPropagation(); updateSectionMeta(origI, { customName: null }); }}
                                  style={{ fontSize: 8, opacity: 0.5, marginLeft: 4, cursor: 'pointer' }}>✎</span>
                              )}
                              {sec.occurrences > 1 && (
                                <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 5 }}>×{sec.occurrences}</span>
                              )}
                            </span>
                          )}

                          {isTooShort && <span title="Very short — possible parsing error" style={{ fontSize: 11 }}>⚠</span>}
                          {isDominant && <span title="Dominates document — check boundaries" style={{ fontSize: 11 }}>⚡</span>}
                          <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>
                            {sec.words.toLocaleString()} w
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', padding: '1px 5px',
                            borderRadius: 3, background: `${col}18`, border: `1px solid ${col}30` }}>
                            {pct}%
                          </span>
                        </div>

                        {/* Proportional bar */}
                        <div style={{ height: 3, background: `${col}18` }}>
                          <div style={{ height: '100%', background: col, width: `${pct}%`, opacity: 0.7 }} />
                        </div>

                        {/* First sentence preview — #7 */}
                        {!hideBody && firstSent && (
                          <div style={{ padding: '9px 14px 0',
                            fontSize: 11, fontStyle: 'italic', lineHeight: 1.55,
                            color: 'var(--text)', opacity: 0.88,
                            borderBottom: `1px solid ${col}12` }}>
                            {firstSent}
                          </div>
                        )}

                        {/* Keyword chips + sentence stats — #5 & #6 */}
                        {!hideBody && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                            gap: 4, padding: '6px 14px 6px',
                            borderBottom: parserDiffs.length === 0 ? `1px solid ${col}12` : 'none' }}>
                            {keywords.map(({ word, count }) => (
                              <span key={word}
                                style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10,
                                  background: `${col}18`, color: col,
                                  fontWeight: 600, border: `1px solid ${col}28`,
                                  whiteSpace: 'nowrap' }}
                                title={`appears ${count}×`}>
                                {word}
                              </span>
                            ))}
                            {/* Citation count chip — #19 */}
                            {citationCount > 0 && (
                              <span title={`${citationCount} citation entries detected`}
                                style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10,
                                  background: '#818cf818', color: '#818cf8',
                                  fontWeight: 600, border: '1px solid #818cf830',
                                  whiteSpace: 'nowrap' }}>
                                📚 {citationCount} citations
                              </span>
                            )}
                            {sentStats && (
                              <span style={{ marginLeft: 'auto', fontSize: 9,
                                color: 'var(--text-muted)',
                                opacity: 0.75, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                {sentStats.count} sent · avg {sentStats.avg}w ·{' '}
                                <span style={{ color: sentStats.style === 'dense prose' ? '#f87171'
                                  : sentStats.style === 'bullet-style' ? '#34d399' : 'var(--text-muted)' }}>
                                  {sentStats.style}
                                </span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Parser diff row — #18 */}
                        {!hideBody && parserDiffs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                            gap: 4, padding: '4px 14px 6px',
                            borderBottom: `1px solid ${col}12` }}>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5,
                              marginRight: 2, whiteSpace: 'nowrap' }}>
                              vs other parsers:
                            </span>
                            {parserDiffs.map(d => {
                              const isMore  = d.diff > 0;
                              const diffCol = isMore ? '#34d399' : '#f87171';
                              const sign    = isMore ? '+' : '';
                              const pctStr  = `${sign}${Math.round(d.pct * 100)}%`;
                              return (
                                <span key={d.parser}
                                  title={`${d.parser}: ${d.words.toLocaleString()} words (${sign}${d.diff.toLocaleString()} vs current)`}
                                  style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10,
                                    background: `${diffCol}15`, color: diffCol,
                                    border: `1px solid ${diffCol}30`, whiteSpace: 'nowrap',
                                    fontWeight: 600 }}>
                                  {d.parser} {pctStr}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Card body */}
                        {!hideBody && (
                          <div style={{ flex: 1, padding: '8px 14px 12px',
                            maxHeight: bodyMaxH, overflowY: 'auto',
                            fontSize: 11, lineHeight: 1.65,
                            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {sec.text
                              ? highlightInBody(sec.text)
                              : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>No body text detected.</span>}
                          </div>
                        )}

                        {/* Annotation row — #16 */}
                        <div style={{ padding: '5px 14px', borderTop: `1px solid ${col}12` }}>
                          <input
                            type="text"
                            placeholder="Add a note or tag (e.g. #relevant, #skip, #verify)…"
                            defaultValue={meta.note || ''}
                            onBlur={e => updateSectionMeta(origI, { note: e.target.value.trim() || null })}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.target.blur();
                              e.stopPropagation();
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ width: '100%', boxSizing: 'border-box',
                              fontSize: 10, padding: '3px 7px', borderRadius: 5,
                              background: `${col}0d`, border: `1px solid ${col}20`,
                              color: 'var(--text-muted)',
                              outline: 'none', fontFamily: 'inherit' }}
                          />
                          {meta.note && (
                            <div style={{ marginTop: 3, fontSize: 9, color: col, opacity: 0.75,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {meta.note}
                            </div>
                          )}
                        </div>

                        {/* Card footer — copy #13 + export #14 + jump */}
                        <div style={{ padding: '6px 14px 8px', borderTop: `1px solid ${col}15`,
                          display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.55, flex: 1 }}>
                            Line {(sec.lineIndex ?? 0) + 1} · {sec.chars?.toLocaleString()} chars
                          </span>

                          {/* Copy button — #13 */}
                          <button
                            title="Copy section text"
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(sec.text || ''); }}
                            style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                              background: `${col}12`, border: `1px solid ${col}28`, color: col }}>
                            ⎘
                          </button>

                          {/* Export dropdown — #14 */}
                          <div style={{ position: 'relative' }}>
                            <button
                              title="Export this section"
                              onClick={e => { e.stopPropagation(); setCardExportOpen(cardExportOpen === origI ? null : origI); }}
                              style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                                cursor: 'pointer', background: `${col}12`,
                                border: `1px solid ${col}28`, color: col }}>
                              ↓ Export
                            </button>
                            {cardExportOpen === origI && (
                              <div
                                onClick={e => e.stopPropagation()}
                                style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
                                  background: '#0f1729',
                                  border: `1px solid ${col}40`, borderRadius: 7,
                                  padding: '4px', display: 'flex', flexDirection: 'column',
                                  gap: 2, zIndex: 10, minWidth: 80 }}>
                                {['txt','md'].map(fmt => (
                                  <button key={fmt}
                                    onClick={() => exportCard(sec, origI, fmt)}
                                    style={{ fontSize: 9, fontWeight: 600, padding: '3px 10px',
                                      borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                                      background: 'transparent', border: 'none', color: col }}>
                                    .{fmt}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button onClick={() => jumpInModal(sec.lineIndex ?? 0, sec.name)}
                            style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                              cursor: 'pointer', background: `${col}15`,
                              border: `1px solid ${col}30`, color: col }}>
                            Jump ↗
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        );
      })()}

    </div>
  );
}
