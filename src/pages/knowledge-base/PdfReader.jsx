/* """
src/pages/knowledge-base/PdfReader.jsx
---------------------------------------
Full-width in-app PDF reader for the Literature tab.
Features: continuous scroll, fit-width default, zoom, page tracking,
reading progress bar, thumbnail strip, TOC sidebar tab,
collapsible notes sidebar, status badge, Mark as Read shortcut,
text layer enabled for copy/paste.
""" */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, AlignCenter,
  Moon, Sun, Layers, FileText,
  ExternalLink, PanelRightClose, PanelRightOpen,
  PanelLeftClose, PanelLeftOpen,
  CheckCircle2, BookOpen, Loader, List,
  Highlighter, Trash2, Underline, Strikethrough, MessageSquare, Square, Camera, Check, Download,
  Search, X, StickyNote, ClipboardCopy, Lightbulb, BookMarked, FileCode2,
  CalendarDays, GitFork, Link2, FileDown, Unlink,
} from 'lucide-react';

// ─── Worker ──────────────────────────────────────────────────────────────────
// Worker setup is deferred to a useEffect inside PdfReader so each mount gets
// a fresh worker — pdfjs terminates the workerPort when a loading task is
// destroyed, which would leave a dead Worker for the next open.

// ─── Theme ───────────────────────────────────────────────────────────────────

const ACC = '#38bdf8';

const STATUS = {
  'to-read':    { label: 'To Read',    color: '#94a3b8' },
  'reading':    { label: 'Reading',    color: '#38bdf8' },
  'read':       { label: 'Read',       color: '#34d399' },
  'referenced': { label: 'Referenced', color: '#a78bfa' },
};

// ─── Highlight colors ─────────────────────────────────────────────────────────

const HIGHLIGHT_COLORS = [
  { key: 'yellow',  hex: '#fde68a' },
  { key: 'red',     hex: '#fca5a5' },
  { key: 'green',   hex: '#86efac' },
  { key: 'blue',    hex: '#93c5fd' },
  { key: 'purple',  hex: '#c4b5fd' },
  { key: 'orange',  hex: '#fdba74' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// Renders a PDF page at 3× scale and returns a cropped <canvas> for the given
// area (x, y, w, h are all fractions of the rendered page width — same
// coordinate system used throughout for annotation overlays).
async function renderPdfAreaCrop(pdfProxy, { pageNum, x, y, w, h }, scale = 3) {
  const page     = await pdfProxy.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const full       = document.createElement('canvas');
  full.width       = Math.floor(viewport.width);
  full.height      = Math.floor(viewport.height);
  await page.render({ canvasContext: full.getContext('2d'), viewport }).promise;

  // Both axes normalised by page width, so all crop coords use viewport.width
  const pw    = viewport.width;
  const cropX = Math.max(0, Math.floor(x * pw));
  const cropY = Math.max(0, Math.floor(y * pw));
  const cropW = Math.min(Math.ceil(w * pw), full.width  - cropX);
  const cropH = Math.min(Math.ceil(h * pw), full.height - cropY);

  const crop   = document.createElement('canvas');
  crop.width   = cropW;
  crop.height  = cropH;
  crop.getContext('2d').drawImage(full, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return crop;
}

// ─── Notes heading helpers ────────────────────────────────────────────────────

// Returns [{heading, lineIdx}] for every # / ## / ### line in notes text.
function parseNotesHeadings(text) {
  return (text || '').split('\n')
    .map((line, lineIdx) => ({ line, lineIdx }))
    .filter(({ line }) => /^#{1,3}\s/.test(line))
    .map(({ line, lineIdx }) => ({ heading: line.replace(/^#{1,3}\s+/, '').trim(), lineIdx }));
}

// Inserts `block` at the end of the section that starts at `lineIdx`.
// The next heading (or EOF) marks the boundary.
function insertUnderHeading(notesText, lineIdx, block) {
  const lines = notesText.split('\n');
  let insertAt = lines.length;
  for (let i = lineIdx + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) { insertAt = i; break; }
  }
  // Eat trailing blank lines of the section so we don't double-space
  while (insertAt > lineIdx + 1 && lines[insertAt - 1].trim() === '') insertAt--;
  lines.splice(insertAt, 0, '', block.trim());
  return lines.join('\n');
}

// ─── Outline tree item ────────────────────────────────────────────────────────

function OutlineItem({ item, depth, onNavigate }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = item.items?.length > 0;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: 10 + depth * 14, paddingRight: 10,
          paddingTop: 5, paddingBottom: 5,
          cursor: 'pointer', borderRadius: 5,
          fontSize: 11, lineHeight: 1.4,
          color: 'var(--text-secondary)',
          userSelect: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => { if (hasChildren) setExpanded(e => !e); onNavigate(item); }}
      >
        <span style={{
          width: 12, flexShrink: 0, display: 'flex', alignItems: 'center',
          color: 'var(--text-muted)',
          transform: hasChildren && expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
        }}>
          {hasChildren ? <ChevronRight size={10} /> : null}
        </span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
      </div>
      {expanded && hasChildren && item.items.map((child, i) => (
        <OutlineItem key={i} item={child} depth={depth + 1} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PdfReader({ paper, onClose, onUpdate }) {

  // ── PDF state ──────────────────────────────────────────────────────────────
  const [pdfBase64,    setPdfBase64]    = useState(null);
  const [loadError,    setLoadError]    = useState(null);
  const [numPages,     setNumPages]     = useState(null);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [pageInput,    setPageInput]    = useState('1');
  const [zoomFactor,   setZoomFactor]   = useState(1.0);
  const [fitWidth,     setFitWidth]     = useState(true);
  const [readProgress, setReadProgress] = useState(0);

  // ── Outline ────────────────────────────────────────────────────────────────
  const [outline,    setOutline]    = useState([]);
  const pdfProxyRef = useRef(null);

  // ── Panels ─────────────────────────────────────────────────────────────────
  const [thumbsOpen,  setThumbsOpen]  = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab,  setSidebarTab]  = useState('notes'); // 'notes' | 'highlights'
  const [tocOpen,     setTocOpen]     = useState(false);

  // ── View options ───────────────────────────────────────────────────────────
  const [darkMode,    setDarkMode]    = useState(false);
  const [singlePage,  setSinglePage]  = useState(false);
  const [widthCap,    setWidthCap]    = useState(false);
  const WIDTH_CAP_PX = 800;

  // ── Notes & annotations ────────────────────────────────────────────────────
  const [notes,         setNotes]         = useState(paper.notes || '');
  const [notesDirty,    setNotesDirty]    = useState(false);
  // Page-anchored annotations: [{ id, page, text, comment, createdAt, type, color, rects }]
  const [annotations,   setAnnotations]   = useState(() => paper.annotations || []);
  // Floating selection popup: { x, y, text, selPage, rects } or null
  const [selectionPopup, setSelectionPopup] = useState(null);
  // Popup state: 'menu' shows swatches/buttons; 'comment' shows text input
  const [popupStep,     setPopupStep]     = useState('menu');
  const [popupComment,  setPopupComment]  = useState('');
  // Quick-add input text in the Highlights panel
  const [quickNote,     setQuickNote]     = useState('');

  // ── Area selection (marquee drag) ──────────────────────────────────────────
  // areaDrag: live drag state — { pageNum, pageBR, startX, startY, currentX, currentY }
  const [areaDrag,       setAreaDrag]       = useState(null);
  // areaSelection: finalized rect pending save — { pageNum, x, y, w, h } (page fractions)
  const [areaSelection,  setAreaSelection]  = useState(null);
  // areaMenu: right-click context menu position — { clientX, clientY }
  const [areaMenu,       setAreaMenu]       = useState(null);
  // areaMenuMode: 'main' shows all options; 'export' shows format picker
  const [areaMenuMode,   setAreaMenuMode]   = useState('main');
  // Snapshot / export: busy flag + toast message
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [snapshotToast,  setSnapshotToast]  = useState(null); // null | 'ok' | 'exported' | 'error'

  // ── Find in document ──────────────────────────────────────────────────────
  const [findOpen,    setFindOpen]    = useState(false);
  const [findQuery,   setFindQuery]   = useState('');
  const [findMatches, setFindMatches] = useState([]); // [{ page, x, y, w, h }]
  const [findIndex,   setFindIndex]   = useState(0);
  const [findBusy,    setFindBusy]    = useState(false);
  const findInputRef = useRef(null);
  const findOpenRef  = useRef(false);

  // ── Feature 1: Annotation edit popup ──────────────────────────────────────
  const [editPopup,    setEditPopup]    = useState(null); // null | {x,y,annId}
  const [editStep,     setEditStep]     = useState('menu'); // 'menu' | 'comment'
  const [editComment,  setEditComment]  = useState('');

  // ── Feature 2: Page history ────────────────────────────────────────────────
  const pageHistoryRef = useRef([paper.lastPage || 1]);
  const [historyIdx,   setHistoryIdx]   = useState(0);

  // ── Feature 3: Virtualized rendering ──────────────────────────────────────
  const PAGE_RENDER_WINDOW = 5;
  const PAGE_ASPECT        = 1.414;
  const pageHeights        = useRef({});

  // ── Feature 4: Lazy thumbnails ────────────────────────────────────────────
  const [visibleThumbs, setVisibleThumbs] = useState(() => new Set());

  // ── Highlight detail panel ─────────────────────────────────────────────────
  // ID of the annotation currently shown in the detail slide-over (null = list view)
  const [highlightDetailId, setHighlightDetailId] = useState(null);
  // Editable comment text in the detail panel (local until blur → updateAnnotation)
  const [detailComment,    setDetailComment]    = useState('');
  // Transient action feedback: null | { type: string, label: string }
  const [hlActionToast,    setHlActionToast]    = useState(null);
  // KB Claim inline form
  const [claimFormOpen,    setClaimFormOpen]    = useState(false);
  const [claimText,        setClaimText]        = useState('');
  const [claimConfidence,  setClaimConfidence]  = useState('medium');
  const [claimTags,        setClaimTags]        = useState('');
  // KB Definition inline form
  const [defFormOpen,      setDefFormOpen]      = useState(false);
  const [defTerm,          setDefTerm]          = useState('');
  const [defText,          setDefText]          = useState('');
  const [defTags,          setDefTags]          = useState('');
  // Notes section picker (shows headings from notes when "Add to Notes" is clicked)
  const [notesSectionOpen, setNotesSectionOpen] = useState(false);
  // KB Event inline form
  const [eventFormOpen,    setEventFormOpen]    = useState(false);
  const [eventName,        setEventName]        = useState('');
  const [eventActors,      setEventActors]      = useState('');
  const [eventOutcome,     setEventOutcome]     = useState('');
  const [eventTags,        setEventTags]        = useState('');
  // KB Process inline form
  const [processFormOpen,  setProcessFormOpen]  = useState(false);
  const [processName,      setProcessName]      = useState('');
  const [processSteps,     setProcessSteps]     = useState('');
  const [processInputs,    setProcessInputs]    = useState('');
  const [processOutputs,   setProcessOutputs]   = useState('');
  const [processTags,      setProcessTags]      = useState('');
  // Entity linker — which claim is in "link entity" mode
  const [linkingClaimId,   setLinkingClaimId]   = useState(null);
  // Export-all toast (shown in list view, not detail panel)
  const [exportAllToast,   setExportAllToast]   = useState(false);
  // Full-screen focused modal for working on a highlight
  const [hlModalOpen,      setHlModalOpen]      = useState(false);
  const [previewSection,   setPreviewSection]   = useState(null); // null | lineIdx — drives notes preview hover

  // currentPage via ref so selection handler doesn't need it in deps
  const currentPageRef = useRef(1);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const viewportRef = useRef(null);
  const [vpWidth,   setVpWidth]   = useState(0);
  const pageRefs    = useRef({});
  const scrollingTo = useRef(false);
  const thumbsRef   = useRef(null);
  // Stable refs for area selection handlers (avoid stale closures)
  const areaDragRef      = useRef(null);
  const areaSelectionRef = useRef(null);
  // Always-current payload used by the debounced last-page saver (avoids stale closures)
  const latestRef        = useRef(null);
  latestRef.current = { paper, notes, annotations, onUpdate };

  // ── Worker lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    let worker = null;
    try {
      worker = new Worker('/pdf.worker.min.mjs', { type: 'module' });
      pdfjs.GlobalWorkerOptions.workerPort = worker;
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
    return () => {
      pdfjs.GlobalWorkerOptions.workerPort = null;
      if (worker) setTimeout(() => worker.terminate(), 200);
    };
  }, []);

  // ── Load PDF via IPC ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setPdfBase64(null);
    setLoadError(null);
    setNumPages(null);
    setCurrentPage(paper.lastPage || 1);
    setPageInput(String(paper.lastPage || 1));
    setReadProgress(0);
    setOutline([]);

    pageHistoryRef.current = [paper.lastPage || 1];
    setHistoryIdx(0);

    window.electronAPI?.readPdf?.(paper.filePath).then(res => {
      if (cancelled) return;
      if (!res?.ok) { setLoadError(res?.error || 'Could not read file.'); return; }
      setPdfBase64(res.base64);
    }).catch(err => {
      if (!cancelled) setLoadError(err.message || 'Failed to load PDF.');
    });

    return () => { cancelled = true; };
  }, [paper.filePath]);

  // ── Stable file object (prevents double getDocument calls) ────────────────
  const pdfFile = useMemo(() => {
    if (!pdfBase64) return null;
    const bin = atob(pdfBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { data: bytes };
  }, [pdfBase64]);

  // ── Document load success — also fetch outline ────────────────────────────
  const handleLoadSuccess = useCallback(async (pdf) => {
    setNumPages(pdf.numPages);
    pdfProxyRef.current = pdf;
    try {
      const items = await pdf.getOutline();
      setOutline(items || []);
    } catch {
      setOutline([]);
    }
  }, []);

  // ── Measure viewport width ─────────────────────────────────────────────────
  useEffect(() => {
    if (!viewportRef.current) return;
    const ro = new ResizeObserver(entries => setVpWidth(entries[0].contentRect.width));
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Scroll: page tracking + progress ──────────────────────────────────────
  useEffect(() => {
    if (!numPages) return;
    const container = viewportRef.current;
    if (!container) return;

    const onScroll = () => {
      // Progress bar
      const max = container.scrollHeight - container.clientHeight;
      setReadProgress(max > 0 ? clamp(Math.round((container.scrollTop / max) * 100), 0, 100) : 0);

      // Current page (midpoint heuristic)
      if (scrollingTo.current) return;
      const midY = container.scrollTop + container.clientHeight / 2;
      let best = 1, bestDist = Infinity;
      for (let i = 1; i <= numPages; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        const dist = Math.abs(el.offsetTop + el.offsetHeight / 2 - midY);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      setCurrentPage(best);
      setPageInput(String(best));
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [numPages]);

  // ── Keep currentPageRef in sync ───────────────────────────────────────────
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // ── Restore last-read page once document finishes loading ──────────────────
  useEffect(() => {
    if (!numPages) return;
    const saved = latestRef.current.paper.lastPage;
    if (!saved || saved <= 1) return;
    // Give react-pdf a tick to mount page elements before scrolling
    const t = setTimeout(() => goToPage(Math.min(saved, numPages)), 150);
    return () => clearTimeout(t);
  }, [numPages]); // eslint-disable-line

  // ── Debounced last-page save (1.5 s after scroll stops) ────────────────────
  useEffect(() => {
    if (!numPages) return;
    const t = setTimeout(() => {
      const { paper: p, notes: n, annotations: a, onUpdate: upd } = latestRef.current;
      if (currentPage !== (p.lastPage || 1)) upd({ ...p, notes: n, annotations: a, lastPage: currentPage });
    }, 1500);
    return () => clearTimeout(t);
  }, [currentPage, numPages]); // eslint-disable-line

  // ── Keep active thumbnail visible ─────────────────────────────────────────
  useEffect(() => {
    if (!thumbsOpen || !thumbsRef.current) return;
    const el = thumbsRef.current.querySelector(`[data-thumb="${currentPage}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage, thumbsOpen]);

  // ── Text selection → floating annotation menu ────────────────────────────
  useEffect(() => {
    const onMouseUp = () => {
      // Small delay lets the browser finalise the selection range
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim();
        if (!text || text.length < 3) { setSelectionPopup(null); return; }
        // Only show for selections that live inside the PDF viewport
        if (!viewportRef.current) return;
        try {
          const range = sel.getRangeAt(0);
          if (!viewportRef.current.contains(range.commonAncestorContainer)) {
            setSelectionPopup(null); return;
          }
          const selRect = range.getBoundingClientRect();

          // Find which page the selection belongs to and capture rects
          let selPage = currentPageRef.current;
          let rects = [];
          for (const [pNum, el] of Object.entries(pageRefs.current)) {
            if (el && el.contains(range.commonAncestorContainer)) {
              selPage = parseInt(pNum);
              const pageContent = el.querySelector('.react-pdf__Page');
              if (pageContent) {
                const pageBR = pageContent.getBoundingClientRect();
                const pw = pageContent.clientWidth || 1;
                rects = Array.from(range.getClientRects()).map(r => ({
                  x: (r.left - pageBR.left) / pw,
                  y: (r.top  - pageBR.top)  / pw,
                  w: r.width  / pw,
                  h: r.height / pw,
                })).filter(r => r.w > 0.001 && r.h > 0.001);
              }
              break;
            }
          }

          setSelectionPopup({
            x: (selRect.left + selRect.right) / 2,
            y: selRect.top,
            text,
            selPage,
            rects,
          });
          setPopupStep('menu');
          setPopupComment('');
        } catch { setSelectionPopup(null); }
      }, 30);
    };

    const onMouseDown = (e) => {
      if (!e.target.closest('[data-sel-popup]')) setSelectionPopup(null);
      if (!e.target.closest('[data-edit-popup]')) setEditPopup(null);
    };

    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, []); // viewportRef is stable; currentPage read via ref

  // ── Keep area selection ref in sync ───────────────────────────────────────
  useEffect(() => { areaSelectionRef.current = areaSelection; }, [areaSelection]);

  // ── Keep find open ref in sync ────────────────────────────────────────────
  useEffect(() => { findOpenRef.current = findOpen; }, [findOpen]);

  // ── Reset context-menu mode when menu closes ───────────────────────────────
  useEffect(() => { if (!areaMenu) setAreaMenuMode('main'); }, [areaMenu]);

  // ── Feature 3: capture rendered page heights for placeholder sizing ────────
  useEffect(() => {
    if (!numPages) return;
    for (let p = 1; p <= numPages; p++) {
      const el = pageRefs.current[p];
      if (el && el.offsetHeight > 0) pageHeights.current[p] = el.offsetHeight;
    }
  }, [currentPage, singlePage, numPages]);

  // ── Feature 4: Lazy thumbnail IntersectionObserver ────────────────────────
  useEffect(() => {
    if (!thumbsOpen || !numPages || !thumbsRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const n = parseInt(entry.target.dataset.thumb);
          if (!isNaN(n)) setVisibleThumbs(prev => {
            const next = new Set(prev);
            next.add(n);
            return next;
          });
        }
      });
    }, { root: thumbsRef.current, rootMargin: '300px 0px' });

    thumbsRef.current.querySelectorAll('[data-thumb]').forEach(el => observer.observe(el));
    return () => {
      observer.disconnect();
      setVisibleThumbs(new Set());
    };
  }, [thumbsOpen, numPages]);

  // ── Area marquee drag (left-click on non-text page area) ──────────────────
  useEffect(() => {
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      // Ignore clicks on our own UI overlays
      if (e.target.closest('[data-sel-popup]') || e.target.closest('[data-area-menu]')) return;
      // Ignore clicks on annotation overlays — handled by onAnnotationClick
      if (e.target.closest('[data-ann-overlay]')) return;
      // Ignore clicks on text spans — let native text selection handle those
      if (e.target.tagName === 'SPAN' && e.target.closest('.react-pdf__Page__textContent')) return;

      // Locate which page (if any) was clicked
      let pageNum = null;
      let pageBR  = null;
      for (const [pNum, el] of Object.entries(pageRefs.current)) {
        if (el && el.contains(e.target)) {
          const pc = el.querySelector('.react-pdf__Page');
          if (pc) { pageNum = parseInt(pNum); pageBR = pc.getBoundingClientRect(); }
          break;
        }
      }

      // Click outside any page → just clear pending selection and menu
      if (!pageNum || !pageBR) {
        setAreaSelection(null); areaSelectionRef.current = null;
        setAreaMenu(null);
        return;
      }

      // Click outside the page's rendered bounds → clear only
      if (e.clientX < pageBR.left || e.clientX > pageBR.right ||
          e.clientY < pageBR.top  || e.clientY > pageBR.bottom) {
        setAreaSelection(null); areaSelectionRef.current = null;
        setAreaMenu(null);
        return;
      }

      // If clicking inside an existing pending selection rect → don't clear it
      // (user may follow with a right-click); just block starting a new drag
      const sel = areaSelectionRef.current;
      if (sel && sel.pageNum === pageNum) {
        const pw = pageBR.width;
        const xF = (e.clientX - pageBR.left) / pw;
        const yF = (e.clientY - pageBR.top)  / pw;
        if (xF >= sel.x && xF <= sel.x + sel.w && yF >= sel.y && yF <= sel.y + sel.h) return;
      }

      // Start a new drag — clear any old selection/menu first
      setAreaSelection(null); areaSelectionRef.current = null;
      setAreaMenu(null);
      areaDragRef.current = { pageNum, pageBR, startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY };
      setAreaDrag({ ...areaDragRef.current });
      e.preventDefault(); // prevent browser from starting a text/image selection
    };

    const onMouseMove = (e) => {
      if (!areaDragRef.current) return;
      areaDragRef.current.currentX = e.clientX;
      areaDragRef.current.currentY = e.clientY;
      setAreaDrag({ ...areaDragRef.current });
    };

    const onMouseUp = (e) => {
      if (!areaDragRef.current) return;
      const { pageNum, pageBR, startX, startY, currentX, currentY } = areaDragRef.current;
      areaDragRef.current = null;
      setAreaDrag(null);

      const pw = pageBR.width;
      // Normalise so x/y is always top-left corner
      const x1 = (Math.min(startX, currentX) - pageBR.left) / pw;
      const y1 = (Math.min(startY, currentY) - pageBR.top)  / pw;
      const x2 = (Math.max(startX, currentX) - pageBR.left) / pw;
      const y2 = (Math.max(startY, currentY) - pageBR.top)  / pw;
      const w  = x2 - x1;
      const h  = y2 - y1;

      // Require at least ~8px in each dimension to avoid accidental drags
      if (w * pw < 8 || h * pw < 8) return;

      const finalSel = {
        pageNum,
        x: Math.max(0, x1),
        y: Math.max(0, y1),
        w: Math.min(w, 1 - Math.max(0, x1)),
        h,
      };
      areaSelectionRef.current = finalSel;
      setAreaSelection(finalSel);
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, []); // pageRefs and state setters are stable

  // ── Right-click on area selection → context menu ───────────────────────────
  useEffect(() => {
    const onContextMenu = (e) => {
      if (!viewportRef.current?.contains(e.target)) return;
      e.preventDefault(); // always suppress browser default on the PDF viewport

      const sel = areaSelectionRef.current;
      if (!sel) return;

      // Find the page element for the selection
      const pageEl = pageRefs.current[sel.pageNum];
      if (!pageEl) return;
      const pc = pageEl.querySelector('.react-pdf__Page');
      if (!pc) return;
      const pageBR = pc.getBoundingClientRect();
      const pw = pageBR.width;
      const xF = (e.clientX - pageBR.left) / pw;
      const yF = (e.clientY - pageBR.top)  / pw;

      if (xF >= sel.x && xF <= sel.x + sel.w && yF >= sel.y && yF <= sel.y + sel.h) {
        setAreaMenu({ clientX: e.clientX, clientY: e.clientY });
      }
    };
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, []); // viewportRef and pageRefs are stable

  // ── Find in document: scan text content for query matches ─────────────────
  useEffect(() => {
    if (!findOpen || !findQuery.trim()) {
      setFindMatches([]); setFindIndex(0); setFindBusy(false); return;
    }
    setFindBusy(true);
    if (!pdfProxyRef.current || !numPages) return;

    const query = findQuery.trim().toLowerCase();
    let cancelled = false;

    const timer = setTimeout(async () => {
      const pdf = pdfProxyRef.current;
      const allMatches = [];

      for (let n = 1; n <= numPages; n++) {
        if (cancelled) break;
        try {
          const page = await pdf.getPage(n);
          const pv   = page.view;          // [x, y, width_pts, height_pts]
          const pw   = pv[2];              // page width in points
          const ph   = pv[3];             // page height in points
          const tc   = await page.getTextContent();

          for (const item of tc.items) {
            if (!item.str || !item.str.toLowerCase().includes(query)) continue;
            // Convert PDF-space coords to page-fraction coords (same system as annotations)
            const xPts = item.transform[4];
            const yPts = item.transform[5];       // baseline y from bottom
            const wPts = item.width  || 0;
            const hPts = Math.abs(item.transform[3]) || 10;
            allMatches.push({
              page: n,
              x:  xPts / pw,
              y:  (ph - yPts - hPts) / pw,  // flip to top-left; normalise by width
              w:  wPts / pw,
              h:  hPts / pw,
            });
          }
        } catch { /* page may not be ready yet, skip */ }
      }

      if (!cancelled) {
        setFindMatches(allMatches);
        setFindIndex(0);
        setFindBusy(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); setFindBusy(false); };
  }, [findQuery, findOpen, numPages]); // pdfProxyRef is a stable ref

  // ── Navigate to current find match ────────────────────────────────────────
  useEffect(() => {
    if (findMatches.length === 0) return;
    const m = findMatches[findIndex];
    if (m) goToPage(m.page);
  }, [findIndex, findMatches]); // eslint-disable-line

  // ── Page width ─────────────────────────────────────────────────────────────
  // In fit-width mode the ResizeObserver on viewportRef reacts to panel
  // open/close automatically. widthCap limits it to WIDTH_CAP_PX so content
  // doesn't stretch uncomfortably wide on large monitors.
  const pageWidth = (() => {
    if (!fitWidth) return Math.max(300, Math.floor(600 * zoomFactor));
    const fw = Math.max(300, vpWidth - 48);
    return widthCap ? Math.min(fw, WIDTH_CAP_PX) : fw;
  })();

  // ── Navigate to page ───────────────────────────────────────────────────────
  const goToPage = useCallback((n, pushHistory = true) => {
    if (!numPages) return;
    const p = clamp(n, 1, numPages);

    // Feature 2: push to history when jump is > 1 page
    if (pushHistory && Math.abs(p - currentPageRef.current) > 1) {
      const hist = pageHistoryRef.current.slice(0, historyIdx + 1); // eslint-disable-line
      hist.push(p);
      if (hist.length > 50) hist.splice(0, hist.length - 50);
      pageHistoryRef.current = hist;
      setHistoryIdx(hist.length - 1);
    }

    setCurrentPage(p);
    setPageInput(String(p));
    if (singlePage) {
      // Single-page mode: just swap the rendered page, reset to top
      if (viewportRef.current) viewportRef.current.scrollTop = 0;
      return;
    }
    const el = pageRefs.current[p];
    if (!el || !viewportRef.current) return;
    scrollingTo.current = true;
    viewportRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    setTimeout(() => { scrollingTo.current = false; }, 600);
  }, [numPages, singlePage, historyIdx]);

  // ── Navigate to outline item ──────────────────────────────────────────────
  const goToOutlineItem = useCallback(async (item) => {
    if (!pdfProxyRef.current || !item.dest) return;
    try {
      let dest = item.dest;
      if (typeof dest === 'string') dest = await pdfProxyRef.current.getDestination(dest);
      if (!Array.isArray(dest) || !dest[0]) return;
      const pageIndex = await pdfProxyRef.current.getPageIndex(dest[0]);
      goToPage(pageIndex + 1);
    } catch {}
  }, [goToPage]);

  // ── Feature 2: History navigation ─────────────────────────────────────────
  const goBack = useCallback(() => {
    if (historyIdx <= 0) return;
    const newIdx = historyIdx - 1;
    setHistoryIdx(newIdx);
    goToPage(pageHistoryRef.current[newIdx], false);
  }, [historyIdx, goToPage]);

  const goForward = useCallback(() => {
    if (historyIdx >= pageHistoryRef.current.length - 1) return;
    const newIdx = historyIdx + 1;
    setHistoryIdx(newIdx);
    goToPage(pageHistoryRef.current[newIdx], false);
  }, [historyIdx, goToPage]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Ctrl/Cmd+F: open / focus the find bar (intercepted before input guard)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => findInputRef.current?.focus(), 50);
        return;
      }
      // Escape: close modal first, then find bar
      if (e.key === 'Escape') {
        if (hlModalOpen) { setHlModalOpen(false); return; }
        if (findOpenRef.current) { setFindOpen(false); setFindQuery(''); setFindMatches([]); return; }
      }
      // Alt+Arrow: history navigation
      if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack();    return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); return; }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goToPage(currentPage + 1); }
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); goToPage(currentPage - 1); }
      if ((e.ctrlKey || e.metaKey) && e.key === '+') { e.preventDefault(); handleZoomIn(); }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); handleZoomOut(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, goToPage, goBack, goForward]); // eslint-disable-line

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const handleZoomIn   = () => { setFitWidth(false); setZoomFactor(z => clamp(+(z + 0.15).toFixed(2), 0.4, 3.0)); };
  const handleZoomOut  = () => { setFitWidth(false); setZoomFactor(z => clamp(+(z - 0.15).toFixed(2), 0.4, 3.0)); };
  const handleFitWidth = () => { setFitWidth(true);  setZoomFactor(1.0); };

  // ── Page input ────────────────────────────────────────────────────────────
  const commitPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n)) goToPage(n); else setPageInput(String(currentPage));
  };

  // ── Annotations ────────────────────────────────────────────────────────────
  const addAnnotationFromSelection = useCallback((type, color, comment = '') => {
    if (!selectionPopup) return;
    const ann = {
      id: `${Date.now()}`,
      page:      selectionPopup.selPage,
      text:      selectionPopup.text,
      comment,
      createdAt: Date.now(),
      type,
      color,
      rects:     selectionPopup.rects || [],
    };
    setAnnotations(prev => {
      const next = [...prev, ann];
      onUpdate({ ...paper, notes, annotations: next });
      return next;
    });
    setSidebarOpen(true);
    setSidebarTab('highlights');
    setSelectionPopup(null);
    setPopupStep('menu');
    setPopupComment('');
    window.getSelection()?.removeAllRanges();
  }, [selectionPopup, paper, notes, onUpdate]);

  const addQuickNote = useCallback((text, page) => {
    const t = (text || quickNote).trim();
    const p = page || currentPageRef.current;
    if (!t) return;
    const ann = {
      id: `${Date.now()}`, page: p, text: t, comment: '',
      createdAt: Date.now(), type: 'note', color: ACC, rects: [],
    };
    setAnnotations(prev => {
      const next = [...prev, ann];
      onUpdate({ ...paper, notes, annotations: next });
      return next;
    });
    setQuickNote('');
  }, [quickNote, paper, notes, onUpdate]);

  const deleteAnnotation = useCallback((id) => {
    setAnnotations(prev => {
      const next = prev.filter(a => a.id !== id);
      onUpdate({ ...paper, notes, annotations: next });
      return next;
    });
  }, [paper, notes, onUpdate]);

  // Feature 1: update an existing annotation by id with partial changes
  const updateAnnotation = useCallback((annId, changes) => {
    setAnnotations(prev => {
      const next = prev.map(a => a.id === annId ? { ...a, ...changes } : a);
      const { paper: p, notes: n, onUpdate: upd } = latestRef.current;
      upd({ ...p, notes: n, annotations: next });
      return next;
    });
  }, []); // eslint-disable-line

  // Feature 1: open the edit popup for an existing annotation
  const openEditPopup = useCallback((annId, clientX, clientY) => {
    const { annotations: anns } = latestRef.current;
    const ann = anns.find(a => a.id === annId);
    if (!ann) return;
    setEditComment(ann.comment || '');
    setEditStep('menu');
    setEditPopup({ x: clientX, y: clientY, annId });
    setSelectionPopup(null);
    setAreaMenu(null);
  }, []); // eslint-disable-line

  const addAreaToHighlights = useCallback(async () => {
    if (!areaSelection || !pdfProxyRef.current) return;

    // Capture values before we clear the selection
    const sel   = { ...areaSelection };
    const annId = `${Date.now()}`;

    // 1. Save the annotation immediately so it appears in the sidebar right away
    const ann = {
      id:        annId,
      page:      sel.pageNum,
      text:      `Area selection — p.${sel.pageNum}`,
      comment:   '',
      createdAt: Date.now(),
      type:      'area',
      color:     '#93c5fd',
      rects:     [],
      area:      { x: sel.x, y: sel.y, w: sel.w, h: sel.h },
      thumbnail: null, // filled in below
    };
    setAnnotations(prev => {
      const next = [...prev, ann];
      onUpdate({ ...paper, notes, annotations: next });
      return next;
    });
    setSidebarOpen(true);
    setSidebarTab('highlights');
    setAreaSelection(null);
    areaSelectionRef.current = null;
    setAreaMenu(null);

    // 2. Generate thumbnail asynchronously at 1.5× (good quality, small size)
    try {
      const crop      = await renderPdfAreaCrop(pdfProxyRef.current, sel, 1.5);
      const thumbnail = crop.toDataURL('image/jpeg', 0.85);
      // Patch only this annotation with the thumbnail
      setAnnotations(prev => {
        const next = prev.map(a => a.id === annId ? { ...a, thumbnail } : a);
        onUpdate({ ...paper, notes, annotations: next });
        return next;
      });
    } catch (e) {
      console.warn('[PdfReader] Area thumbnail generation failed:', e);
    }
  }, [areaSelection, paper, notes, onUpdate]);

  // ── Take snapshot — renders area to clipboard as PNG ─────────────────────
  const takeSnapshot = useCallback(async () => {
    if (!areaSelection || !pdfProxyRef.current || isSnapshotting) return;
    setAreaMenu(null);
    setIsSnapshotting(true);
    try {
      const crop = await renderPdfAreaCrop(pdfProxyRef.current, areaSelection);
      const blob = await new Promise(res => crop.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setSnapshotToast('ok');
    } catch (err) {
      console.error('[PdfReader] Snapshot failed:', err);
      setSnapshotToast('error');
    } finally {
      setIsSnapshotting(false);
      setTimeout(() => setSnapshotToast(null), 2800);
    }
  }, [areaSelection, isSnapshotting]);

  // ── Export selection — renders area and triggers a file download ──────────
  const exportSelection = useCallback(async (format /* 'png' | 'jpeg' */) => {
    if (!areaSelection || !pdfProxyRef.current) return;
    setAreaMenu(null);
    try {
      const crop     = await renderPdfAreaCrop(pdfProxyRef.current, areaSelection);
      const mime     = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const ext      = format === 'jpeg' ? 'jpg' : 'png';
      const quality  = format === 'jpeg' ? 0.92 : undefined;
      const blob     = await new Promise(res => crop.toBlob(res, mime, quality));
      const url      = URL.createObjectURL(blob);
      const anchor   = document.createElement('a');
      anchor.href     = url;
      anchor.download = `selection-p${areaSelection.pageNum}.${ext}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSnapshotToast('exported');
    } catch (err) {
      console.error('[PdfReader] Export failed:', err);
      setSnapshotToast('error');
    } finally {
      setTimeout(() => setSnapshotToast(null), 2800);
    }
  }, [areaSelection]);

  // ── Find navigation ────────────────────────────────────────────────────────
  const prevMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setFindIndex(i => (i - 1 + findMatches.length) % findMatches.length);
  }, [findMatches.length]);

  const nextMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setFindIndex(i => (i + 1) % findMatches.length);
  }, [findMatches.length]);

  // ── Notes ─────────────────────────────────────────────────────────────────
  const saveNotes = useCallback(() => {
    if (!notesDirty) return;
    onUpdate({ ...paper, notes, annotations });
    setNotesDirty(false);
  }, [notesDirty, notes, annotations, paper, onUpdate]);

  const markAsRead = () => { onUpdate({ ...paper, notes, annotations, status: 'read' }); setNotesDirty(false); };

  // ── Highlight detail panel helpers ─────────────────────────────────────────

  const openHighlightDetail = useCallback((annId) => {
    const { annotations: anns } = latestRef.current;
    const ann = anns.find(a => a.id === annId);
    if (!ann) return;
    setHighlightDetailId(annId);
    setDetailComment(ann.comment || '');
    // Claim form
    setClaimFormOpen(false);
    setClaimText(ann.text || '');
    setClaimConfidence('medium');
    setClaimTags('');
    // Def form
    setDefFormOpen(false);
    setDefTerm('');
    setDefText(ann.text || '');
    setDefTags('');
    // Notes section picker
    setNotesSectionOpen(false);
    // Event form
    setEventFormOpen(false);
    setEventName('');
    setEventActors('');
    setEventOutcome(ann.text || '');
    setEventTags('');
    // Process form
    setProcessFormOpen(false);
    setProcessName('');
    setProcessSteps(ann.text || '');
    setProcessInputs('');
    setProcessOutputs('');
    setProcessTags('');
    // Entity linker
    setLinkingClaimId(null);
    setHlActionToast(null);
  }, []); // eslint-disable-line

  const closeHighlightDetail = useCallback(() => {
    setHighlightDetailId(null);
    setHlModalOpen(false);
    setClaimFormOpen(false);
    setDefFormOpen(false);
    setNotesSectionOpen(false);
    setEventFormOpen(false);
    setProcessFormOpen(false);
    setLinkingClaimId(null);
    setHlActionToast(null);
    setPreviewSection(null);
  }, []);

  const hlToast = useCallback((type, label) => {
    setHlActionToast({ type, label });
    setTimeout(() => setHlActionToast(null), 2600);
  }, []);

  // Action: append quoted text to reading notes as a formatted block
  const addHighlightToNotes = useCallback((ann) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const ref = [p.authors ? p.authors.split(',')[0].trim() : null, p.year].filter(Boolean).join(', ');
    const block = `\n> "${ann.text || 'Area selection'}"\n> — p.${ann.page}${ref ? ` (${ref})` : ''}\n`;
    const next = (n || '').trimEnd() + block;
    setNotes(next);
    setNotesDirty(false);
    upd({ ...p, notes: next, annotations: anns });
    hlToast('notes', 'Added to notes');
  }, [hlToast]); // eslint-disable-line

  // Action: copy formatted citation to clipboard
  const copyHighlightCitation = useCallback((ann) => {
    const { paper: p } = latestRef.current;
    const ref = [p.authors ? p.authors.split(',')[0].trim() : null, p.year].filter(Boolean).join(', ');
    const text = `"${ann.text || 'Area selection'}" — ${ref ? ref + ', ' : ''}p.${ann.page}`;
    navigator.clipboard.writeText(text).catch(() => {});
    hlToast('copied', 'Citation copied');
  }, [hlToast]); // eslint-disable-line

  // Action: save as KB Claim
  const saveHighlightAsClaim = useCallback((ann, text, confidence, tagsStr) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const claim = {
      id:          `claim-${Date.now()}`,
      text:        text.trim(),
      confidence,
      tags:        tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      sourceAnnId: ann.id,
      sourcePage:  ann.page,
      createdAt:   Date.now(),
    };
    const next = [...(p.claims || []), claim];
    upd({ ...p, notes: n, annotations: anns, claims: next });
    setClaimFormOpen(false);
    hlToast('claim', 'Claim saved to KB');
  }, [hlToast]); // eslint-disable-line

  // Action: save as KB Definition
  const saveHighlightAsDefinition = useCallback((ann, term, text, tagsStr) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const def = {
      id:          `def-${Date.now()}`,
      term:        term.trim(),
      definition:  text.trim(),
      tags:        tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      sourceAnnId: ann.id,
      sourcePage:  ann.page,
      createdAt:   Date.now(),
    };
    const next = [...(p.definitions || []), def];
    upd({ ...p, notes: n, annotations: anns, definitions: next });
    setDefFormOpen(false);
    hlToast('def', 'Definition saved to KB');
  }, [hlToast]); // eslint-disable-line

  // Action: insert quoted text under a chosen notes heading (or append if headingLineIdx === -1)
  const addHighlightToNotesSection = useCallback((ann, headingLineIdx) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const ref = [p.authors ? p.authors.split(',')[0].trim() : null, p.year].filter(Boolean).join(', ');
    const block = `> "${ann.text || 'Area selection'}"\n> — p.${ann.page}${ref ? ` (${ref})` : ''}`;
    const next = headingLineIdx === -1
      ? (n || '').trimEnd() + '\n\n' + block
      : insertUnderHeading(n || '', headingLineIdx, block);
    setNotes(next);
    setNotesDirty(false);
    upd({ ...p, notes: next, annotations: anns });
    setNotesSectionOpen(false);
    hlToast('notes', 'Added to notes');
  }, [hlToast]); // eslint-disable-line

  // Action: save as KB Event
  const saveHighlightAsEvent = useCallback((ann, name, actors, outcome, tagsStr) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const ev = {
      id:          `event-${Date.now()}`,
      name:        name.trim(),
      actors:      actors.split(',').map(t => t.trim()).filter(Boolean),
      outcome:     outcome.trim(),
      tags:        tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      sourceAnnId: ann.id,
      sourcePage:  ann.page,
      createdAt:   Date.now(),
    };
    upd({ ...p, notes: n, annotations: anns, events: [...(p.events || []), ev] });
    setEventFormOpen(false);
    hlToast('event', 'Event saved to KB');
  }, [hlToast]); // eslint-disable-line

  // Action: save as KB Process
  const saveHighlightAsProcess = useCallback((ann, name, steps, inputs, outputs, tagsStr) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const proc = {
      id:          `process-${Date.now()}`,
      name:        name.trim(),
      steps:       steps.split('\n').map(s => s.trim()).filter(Boolean),
      inputs:      inputs.split(',').map(t => t.trim()).filter(Boolean),
      outputs:     outputs.split(',').map(t => t.trim()).filter(Boolean),
      tags:        tagsStr.split(',').map(t => t.trim()).filter(Boolean),
      sourceAnnId: ann.id,
      sourcePage:  ann.page,
      createdAt:   Date.now(),
    };
    upd({ ...p, notes: n, annotations: anns, processes: [...(p.processes || []), proc] });
    setProcessFormOpen(false);
    hlToast('process', 'Process saved to KB');
  }, [hlToast]); // eslint-disable-line

  // Action: link an existing claim to a definition entity
  const linkClaimToEntity = useCallback((claimId, defId, defTerm) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const next = (p.claims || []).map(cl =>
      cl.id === claimId ? { ...cl, linkedEntityId: defId, linkedEntityTerm: defTerm } : cl
    );
    upd({ ...p, notes: n, annotations: anns, claims: next });
    setLinkingClaimId(null);
    hlToast('link', 'Claim linked to entity');
  }, [hlToast]); // eslint-disable-line

  // Action: unlink a claim from its entity
  const unlinkClaim = useCallback((claimId) => {
    const { paper: p, notes: n, annotations: anns, onUpdate: upd } = latestRef.current;
    const next = (p.claims || []).map(cl =>
      cl.id === claimId ? { ...cl, linkedEntityId: null, linkedEntityTerm: null } : cl
    );
    upd({ ...p, notes: n, annotations: anns, claims: next });
  }, []); // eslint-disable-line

  // Action: export all highlights for this paper as a Markdown document
  const exportAllHighlights = useCallback(() => {
    const { paper: p, annotations: anns } = latestRef.current;
    const ref = [p.authors, p.year].filter(Boolean).join(' · ');
    const lines = [
      `# Highlights — ${p.title || 'Untitled'}`,
      ref || null,
      '',
      '---',
      '',
    ].filter(l => l !== null);
    const byPage = {};
    anns.forEach(a => { (byPage[a.page] = byPage[a.page] || []).push(a); });
    Object.keys(byPage).map(Number).sort((a, b) => a - b).forEach(pageNum => {
      lines.push(`## p.${pageNum}`, '');
      byPage[pageNum].forEach(ann => {
        const typeLabel =
          ann.type === 'highlight'     ? 'Highlight' :
          ann.type === 'underline'     ? 'Underline' :
          ann.type === 'strikethrough' ? 'Strikethrough' :
          ann.type === 'note'          ? 'Note' :
          ann.type === 'area'          ? 'Area capture' : ann.type;
        lines.push(`### ${typeLabel} — p.${ann.page}`);
        if (ann.type !== 'area') {
          lines.push(`> ${ann.text}`, `> — p.${ann.page}`);
        } else {
          lines.push(`*[Area capture — p.${ann.page}]*`);
        }
        if (ann.comment) lines.push('', `*${ann.comment}*`);
        lines.push('');
      });
    });
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
    setExportAllToast(true);
    setTimeout(() => setExportAllToast(false), 2500);
  }, []); // eslint-disable-line

  // Action: export to Markdown (Obsidian-style, copies to clipboard)
  const exportHighlightToMarkdown = useCallback((ann) => {
    const { paper: p } = latestRef.current;
    const ref = [p.authors ? p.authors.split(',')[0].trim() : null, p.year].filter(Boolean).join(', ');
    const tags = (p.tags || []).map(t => `#${t.replace(/\s+/g, '-')}`).join(' ');
    const lines = [
      `> ${ann.text || 'Area selection'}`,
      `> — ${ref ? ref + ', ' : ''}p.${ann.page}`,
      '',
      ann.comment ? `*${ann.comment}*\n` : null,
      tags || null,
    ].filter(l => l !== null).join('\n');
    navigator.clipboard.writeText(lines).catch(() => {});
    hlToast('md', 'Markdown copied');
  }, [hlToast]); // eslint-disable-line

  const s = STATUS[paper.status] || STATUS['to-read'];

  // ── Feature 3: compute render window ──────────────────────────────────────
  const renderWindowPages = useMemo(() => {
    if (singlePage || !numPages) return null;
    const pages = new Set();
    for (let p = Math.max(1, currentPage - PAGE_RENDER_WINDOW); p <= Math.min(numPages, currentPage + PAGE_RENDER_WINDOW); p++) {
      pages.add(p);
    }
    return pages;
  }, [currentPage, numPages, singlePage]);

  // ── Feature 1: derive the annotation being edited ─────────────────────────
  const editAnn = editPopup ? annotations.find(a => a.id === editPopup.annId) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 48, flexShrink: 0,
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
      }}>

        {/* Back */}
        <button onClick={onClose} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, flexShrink: 0,
        }}>
          <ArrowLeft size={13} /> Library
        </button>

        <Sep />

        {/* Thumbnail strip toggle */}
        <button
          onClick={() => setThumbsOpen(o => !o)}
          style={{ ...navBtnStyle, color: thumbsOpen ? ACC : 'var(--text-muted)' }}
          title={thumbsOpen ? 'Hide thumbnails' : 'Show thumbnails'}
        >
          {thumbsOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>

        {/* TOC toggle */}
        <button
          onClick={() => setTocOpen(o => !o)}
          style={{ ...navBtnStyle, color: tocOpen ? ACC : 'var(--text-muted)' }}
          title={tocOpen ? 'Hide table of contents' : 'Show table of contents'}
        >
          <List size={15} />
        </button>

        <Sep />

        {/* Title */}
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {paper.title}
        </span>

        {/* History back/forward */}
        {numPages && (
          <>
            <button
              onClick={goBack}
              disabled={historyIdx <= 0}
              style={{ ...navBtnStyle, opacity: historyIdx <= 0 ? 0.35 : 1 }}
              title="Back (Alt+←)"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              onClick={goForward}
              disabled={historyIdx >= pageHistoryRef.current.length - 1}
              style={{ ...navBtnStyle, opacity: historyIdx >= pageHistoryRef.current.length - 1 ? 0.35 : 1 }}
              title="Forward (Alt+→)"
            >
              <ArrowRight size={14} />
            </button>
            <Sep />
          </>
        )}

        {/* Page navigation */}
        {numPages && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}
              style={{ ...navBtnStyle, opacity: currentPage <= 1 ? 0.35 : 1 }}>
              <ChevronLeft size={14} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                onBlur={commitPageInput}
                onKeyDown={e => e.key === 'Enter' && commitPageInput()}
                style={{
                  width: 38, textAlign: 'center', padding: '3px 4px',
                  borderRadius: 5, border: '1px solid var(--border)',
                  background: 'var(--bg)', color: 'var(--text)',
                  fontSize: 12, fontFamily: 'var(--font-mono)',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/ {numPages}</span>
            </div>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}
              style={{ ...navBtnStyle, opacity: currentPage >= numPages ? 0.35 : 1 }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <Sep />

        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button onClick={handleZoomOut} style={navBtnStyle} title="Zoom out (Ctrl−)"><ZoomOut size={14} /></button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 38, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            {fitWidth ? 'fit' : `${Math.round(zoomFactor * 100)}%`}
          </span>
          <button onClick={handleZoomIn}  style={navBtnStyle} title="Zoom in (Ctrl+)"><ZoomIn size={14} /></button>
          <button onClick={handleFitWidth} title="Fit to width"
            style={{ ...navBtnStyle, color: fitWidth ? ACC : 'var(--text-muted)' }}>
            <Maximize2 size={13} />
          </button>
        </div>

        <Sep />

        {/* View options: dark mode | page mode | width cap */}
        <button
          onClick={() => setDarkMode(d => !d)}
          style={{ ...navBtnStyle, color: darkMode ? '#fbbf24' : 'var(--text-muted)' }}
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => setSinglePage(s => !s)}
          style={{ ...navBtnStyle, color: singlePage ? ACC : 'var(--text-muted)' }}
          title={singlePage ? 'Switch to continuous scroll' : 'Switch to single-page mode'}
        >
          {singlePage ? <FileText size={14} /> : <Layers size={14} />}
        </button>
        <button
          onClick={() => setWidthCap(w => !w)}
          style={{ ...navBtnStyle, color: widthCap ? ACC : 'var(--text-muted)' }}
          title={widthCap ? `Width capped at ${WIDTH_CAP_PX}px — click to fill width` : `Click to cap width at ${WIDTH_CAP_PX}px`}
        >
          <AlignCenter size={14} />
        </button>

        <Sep />

        {/* Status badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 12,
          background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
          color: s.color, border: `1px solid ${s.color}44`,
          textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
        }}>{s.label}</span>

        {/* Mark as Read */}
        {paper.status !== 'read' && (
          <button onClick={markAsRead} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(52,211,153,0.35)',
            background: 'rgba(52,211,153,0.08)', color: '#34d399',
            fontSize: 11, fontWeight: 600, flexShrink: 0,
          }}>
            <CheckCircle2 size={12} /> Mark as Read
          </button>
        )}

        {/* Open externally */}
        <button onClick={() => window.electronAPI?.openFile?.(paper.filePath)}
          style={navBtnStyle} title="Open in system PDF reader">
          <ExternalLink size={13} />
        </button>

        {/* Toggle right sidebar */}
        <button onClick={() => setSidebarOpen(o => !o)}
          style={{ ...navBtnStyle, color: sidebarOpen ? ACC : 'var(--text-muted)' }}
          title={sidebarOpen ? 'Close panel' : 'Open panel'}>
          {sidebarOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        </button>
      </div>

      {/* ── Find bar ── */}
      {findOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px', height: 40, flexShrink: 0,
          background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={e => setFindQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); nextMatch(); }
              if (e.key === 'Enter' &&  e.shiftKey) { e.preventDefault(); prevMatch(); }
              if (e.key === 'Escape') { setFindOpen(false); setFindQuery(''); setFindMatches([]); }
            }}
            placeholder="Find in document…  (Enter / Shift+Enter to navigate)"
            style={{
              flex: 1, padding: '4px 9px', borderRadius: 5, fontSize: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--text)', outline: 'none',
            }}
          />
          {findBusy && (
            <Loader size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          )}
          {!findBusy && findQuery.trim() && (
            <span style={{
              fontSize: 11, flexShrink: 0, fontFamily: 'var(--font-mono)',
              color: findMatches.length ? 'var(--text-muted)' : '#f87171',
            }}>
              {findMatches.length ? `${findIndex + 1} / ${findMatches.length}` : 'No results'}
            </span>
          )}
          <button onClick={prevMatch} disabled={findMatches.length === 0}
            style={{ ...navBtnStyle, opacity: findMatches.length === 0 ? 0.35 : 1 }}
            title="Previous match (Shift+Enter)">
            <ChevronLeft size={14} />
          </button>
          <button onClick={nextMatch} disabled={findMatches.length === 0}
            style={{ ...navBtnStyle, opacity: findMatches.length === 0 ? 0.35 : 1 }}
            title="Next match (Enter)">
            <ChevronRight size={14} />
          </button>
          <button onClick={() => { setFindOpen(false); setFindQuery(''); setFindMatches([]); }}
            style={navBtnStyle} title="Close (Escape)">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Reading progress bar ── */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', flexShrink: 0, position: 'relative' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${readProgress}%`,
          background: ACC,
          transition: 'width 0.12s',
          borderRadius: '0 2px 2px 0',
        }} />
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Thumbnail strip (left) ── */}
        {thumbsOpen && (
          <div
            ref={thumbsRef}
            style={{
              width: 108, flexShrink: 0,
              background: 'var(--bg-card)',
              borderRight: '1px solid rgba(255,255,255,0.07)',
              overflowY: 'auto', overflowX: 'hidden',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8, padding: '10px 0 32px',
            }}
          >
            {pdfFile && numPages && (
              <Document file={pdfFile} loading={null} error={null}>
                {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
                  <div
                    key={n}
                    data-thumb={n}
                    onClick={() => goToPage(n)}
                    title={`Page ${n}`}
                    style={{
                      cursor: 'pointer', flexShrink: 0,
                      border: n === currentPage ? `2px solid ${ACC}` : '2px solid transparent',
                      borderRadius: 3, overflow: 'hidden', position: 'relative',
                      transition: 'border-color 0.15s',
                      boxShadow: n === currentPage ? `0 0 0 1px ${ACC}33` : 'none',
                    }}
                  >
                    {/* Feature 4: only render Page when thumb has scrolled into view */}
                    {visibleThumbs.has(n) ? (
                      <div style={{ filter: darkMode ? 'invert(1) hue-rotate(180deg)' : 'none', transition: 'filter 0.2s' }}>
                        <Page
                          pageNumber={n}
                          width={80}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          loading={
                            <div style={{
                              width: 80, height: 113, background: '#444',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Loader size={12} color="#777" />
                            </div>
                          }
                        />
                      </div>
                    ) : (
                      <div style={{ width: 80, height: 113, background: 'var(--bg)' }} />
                    )}
                    {/* Page number badge */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: n === currentPage ? ACC : 'rgba(0,0,0,0.55)',
                      color: n === currentPage ? '#000' : 'rgba(255,255,255,0.65)',
                      fontSize: 9, fontWeight: n === currentPage ? 700 : 400,
                      textAlign: 'center', padding: '2px 0',
                      transition: 'background 0.15s, color 0.15s',
                    }}>{n}</div>
                  </div>
                ))}
              </Document>
            )}
          </div>
        )}

        {/* ── TOC panel (left of viewport) ── */}
        {tocOpen && (
          <div style={{
            width: 224, flexShrink: 0,
            background: 'var(--bg-card)',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 14px', height: 42, flexShrink: 0,
              borderBottom: '1px solid var(--border)',
            }}>
              <List size={12} color={ACC} />
              <span style={{
                flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: 'var(--text-muted)',
              }}>
                Contents
              </span>
              {outline.length > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                  background: `color-mix(in srgb, ${ACC} 15%, transparent)`, color: ACC,
                }}>
                  {outline.length}
                </span>
              )}
            </div>
            {/* Outline list */}
            {outline.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 10, color: 'var(--text-muted)', fontSize: 12,
                padding: '0 20px', textAlign: 'center',
              }}>
                <List size={24} style={{ opacity: 0.2 }} />
                {numPages ? 'No table of contents in this document.' : 'Loading…'}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                {outline.map((item, i) => (
                  <OutlineItem key={i} item={item} depth={0} onNavigate={goToOutlineItem} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PDF viewport ── */}
        <div
          ref={viewportRef}
          style={{
            flex: 1, overflowY: 'auto', overflowX: 'auto',
            background: darkMode ? '#050810' : 'var(--bg)',
            padding: '16px 24px 64px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
            transition: 'background 0.2s',
            cursor: areaDrag ? 'crosshair' : 'default',
            userSelect: areaDrag ? 'none' : 'auto',
          }}
        >
          {loadError ? (
            <ErrorState message={loadError} />
          ) : !pdfFile ? (
            <LoadingState />
          ) : (
            <Document
              key={paper.filePath}
              file={pdfFile}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={err => setLoadError(err.message)}
              loading={<LoadingState />}
              error={<ErrorState message="Failed to render PDF." />}
            >
              {numPages && (singlePage
                // ── Single-page mode: only render current page ──
                ? <PageCard pageNum={currentPage} numPages={numPages} pageWidth={pageWidth} darkMode={darkMode} pageRefs={pageRefs} annotations={annotations} areaSelection={areaSelection} findMatches={findMatches} findIndex={findIndex} onAnnotationClick={openEditPopup} />
                // ── Continuous mode: virtualized rendering (Feature 3) ──
                : Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                  <div
                    key={pageNum}
                    ref={el => { pageRefs.current[pageNum] = el; }}
                    style={(!renderWindowPages || renderWindowPages.has(pageNum))
                      ? { display: 'flex', flexDirection: 'column', alignItems: 'center' }
                      : { height: pageHeights.current[pageNum] || Math.round(pageWidth * PAGE_ASPECT) + 28,
                          width: pageWidth, flexShrink: 0 }}
                  >
                    {(!renderWindowPages || renderWindowPages.has(pageNum)) && (
                      <PageCard pageNum={pageNum} numPages={numPages} pageWidth={pageWidth}
                        darkMode={darkMode} pageRefs={null}
                        annotations={annotations} areaSelection={areaSelection}
                        findMatches={findMatches} findIndex={findIndex}
                        onAnnotationClick={openEditPopup} />
                    )}
                  </div>
                ))
              )}
            </Document>
          )}
        </div>

        {/* ── Right sidebar: Notes + TOC ── */}
        {sidebarOpen && (
          <div style={{
            width: 300, flexShrink: 0,
            background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>

            {/* Tab header */}
            <div style={{
              display: 'flex', alignItems: 'stretch', height: 42, flexShrink: 0,
              borderBottom: '1px solid var(--border)',
            }}>
              <SidebarTab
                active={sidebarTab === 'notes'}
                onClick={() => setSidebarTab('notes')}
                icon={<BookOpen size={12} />}
                label="Notes"
              />
              <SidebarTab
                active={sidebarTab === 'highlights'}
                onClick={() => setSidebarTab('highlights')}
                icon={<Highlighter size={12} />}
                label="Highlights"
                badge={annotations.length > 0 ? annotations.length : null}
              />
              <div style={{ flex: 1 }} />
              {sidebarTab === 'notes' && notesDirty && (
                <button onClick={saveNotes} style={{
                  alignSelf: 'center', marginRight: 12,
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                  background: `color-mix(in srgb, ${ACC} 15%, transparent)`,
                  border: `1px solid ${ACC}44`, color: ACC, cursor: 'pointer',
                }}>
                  Save
                </button>
              )}
            </div>

            {/* ── Notes panel ── */}
            <div style={{
              display: sidebarTab === 'notes' ? 'flex' : 'none',
              flexDirection: 'column', flex: 1, overflow: 'hidden',
            }}>
              {/* Paper meta */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>
                  {paper.title}
                </div>
                {paper.authors && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{paper.authors}</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {paper.year    && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{paper.year}</span>}
                  {paper.journal && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {paper.journal}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                  {Object.entries(STATUS).map(([k, st]) => (
                    <button key={k} onClick={() => onUpdate({ ...paper, notes, annotations, status: k })} style={{
                      padding: '2px 9px', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                      border: `1px solid ${paper.status === k ? st.color : 'rgba(255,255,255,0.1)'}`,
                      background: paper.status === k ? `color-mix(in srgb, ${st.color} 12%, transparent)` : 'transparent',
                      color: paper.status === k ? st.color : 'var(--text-muted)',
                    }}>{st.label}</button>
                  ))}
                </div>
              </div>

              {/* Notes textarea */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 8, overflow: 'hidden' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Your Notes
                </div>
                <textarea
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setNotesDirty(true); }}
                  onBlur={saveNotes}
                  placeholder="Take notes while reading…"
                  style={{
                    flex: 1, resize: 'none', padding: '10px 12px', minHeight: 0,
                    background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)', fontSize: 12,
                    fontFamily: 'var(--font-sans)', lineHeight: 1.65, outline: 'none',
                  }}
                />
              </div>

              {/* Tags */}
              {paper.tags?.length > 0 && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tags</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {paper.tags.map(t => (
                      <span key={t} style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        background: `color-mix(in srgb, ${ACC} 10%, transparent)`,
                        border: `1px solid ${ACC}44`, color: ACC,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Highlights panel ── */}
            <div style={{
              display: sidebarTab === 'highlights' ? 'flex' : 'none',
              flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative',
            }}>

              {/* ── Detail slide-over ── rendered on top when an annotation is selected */}
              {highlightDetailId && (() => {
                const ann = annotations.find(a => a.id === highlightDetailId);
                if (!ann) { setHighlightDetailId(null); return null; }
                const c         = ann.color || ACC;
                const typeLabel =
                  ann.type === 'highlight'     ? 'Highlight' :
                  ann.type === 'underline'     ? 'Underline' :
                  ann.type === 'strikethrough' ? 'Strikethrough' :
                  ann.type === 'area'          ? 'Area capture' : 'Note';
                const TypeIcon =
                  ann.type === 'underline'     ? <Underline size={10} /> :
                  ann.type === 'strikethrough' ? <Strikethrough size={10} /> :
                  ann.type === 'note'          ? <MessageSquare size={10} /> :
                  ann.type === 'area'          ? <Square size={10} /> :
                  <Highlighter size={10} />;

                // Shared input / textarea style
                const inputStyle = {
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 9px', borderRadius: 6, fontSize: 11,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  color: 'var(--text)', outline: 'none', resize: 'none',
                  fontFamily: 'var(--font-sans)', lineHeight: 1.55,
                };
                const btnStyle = (color, fill) => ({
                  flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  fontWeight: 600, border: `1px solid ${color}44`,
                  background: fill ? `color-mix(in srgb, ${color} 18%, transparent)` : 'transparent',
                  color: fill ? color : 'var(--text-muted)',
                });

                return (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'var(--bg-card)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }}>
                    {/* ── Panel header ── */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderBottom: '1px solid var(--border)',
                      flexShrink: 0,
                    }}>
                      <button
                        onClick={closeHighlightDetail}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                          padding: '2px 4px', borderRadius: 4,
                        }}
                        title="Back to list"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 700, color: c,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>
                        {TypeIcon} {typeLabel}
                      </div>
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => { goToPage(ann.page); }}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                          background: `color-mix(in srgb, ${c} 15%, transparent)`,
                          color: c, border: 'none', cursor: 'pointer', letterSpacing: '0.04em',
                        }}
                        title="Jump to page"
                      >
                        p.{ann.page}
                      </button>
                      <button
                        onClick={() => setHlModalOpen(true)}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                          padding: '2px 4px', borderRadius: 4,
                        }}
                        title="Open in focused view"
                      >
                        <Maximize2 size={12} />
                      </button>
                    </div>

                    {/* ── Scrollable body ── */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Quote / thumbnail block */}
                      <div style={{
                        borderLeft: `3px solid ${c}`, paddingLeft: 10,
                        borderRadius: '0 4px 4px 0',
                      }}>
                        {ann.type === 'area' ? (
                          ann.thumbnail ? (
                            <img
                              src={ann.thumbnail} alt="Area capture"
                              style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 200, objectFit: 'contain', borderRadius: 4 }}
                            />
                          ) : (
                            <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Loader size={14} color={c} />
                            </div>
                          )
                        ) : (
                          <div style={{
                            fontSize: 12, color: 'var(--text)', lineHeight: 1.65,
                            fontStyle: 'italic', wordBreak: 'break-word',
                          }}>
                            "{ann.text}"
                          </div>
                        )}
                      </div>

                      {/* Editable comment */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Comment
                        </div>
                        <textarea
                          rows={3}
                          value={detailComment}
                          onChange={e => setDetailComment(e.target.value)}
                          onBlur={() => updateAnnotation(ann.id, { comment: detailComment })}
                          placeholder="Add a note about this highlight…"
                          style={inputStyle}
                        />
                      </div>

                      {/* ── KB Actions ── */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                          Use in Knowledge Base
                        </div>

                        {/* Toast feedback */}
                        {hlActionToast && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: 'color-mix(in srgb, #34d399 12%, transparent)',
                            border: '1px solid #34d39944', color: '#34d399',
                          }}>
                            <Check size={11} /> {hlActionToast.label}
                          </div>
                        )}

                        {/* Add to Reading Notes — with section picker */}
                        {(() => {
                          const headings = parseNotesHeadings(notes);
                          return (
                            <>
                              <button
                                onClick={() => {
                                  if (headings.length === 0) { addHighlightToNotesSection(ann, -1); }
                                  else setNotesSectionOpen(v => !v);
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                                  border: `1px solid ${notesSectionOpen ? '#fde68a44' : 'var(--border)'}`,
                                  background: notesSectionOpen ? 'color-mix(in srgb, #fde68a 8%, transparent)' : 'var(--bg)',
                                  color: notesSectionOpen ? '#fde68a' : 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                                }}
                              >
                                <StickyNote size={13} color="#fde68a" style={{ flexShrink: 0 }} />
                                <span>Add to Reading Notes</span>
                                {headings.length > 0 && (
                                  <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.4, transform: notesSectionOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                                )}
                              </button>
                              {notesSectionOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 6px', borderRadius: 6, border: '1px solid #fde68a33', background: 'color-mix(in srgb, #fde68a 5%, transparent)' }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '3px 6px 4px' }}>Insert under section</div>
                                  {[{ heading: 'Append at end', lineIdx: -1 }, ...headings].map(({ heading, lineIdx }) => (
                                    <button
                                      key={lineIdx}
                                      onClick={() => addHighlightToNotesSection(ann, lineIdx)}
                                      style={{
                                        padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                                        border: 'none', background: 'transparent', color: 'var(--text)',
                                        textAlign: 'left', width: '100%',
                                      }}
                                      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, #fde68a 10%, transparent)'; e.currentTarget.style.color = '#fde68a'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text)'; }}
                                    >
                                      {lineIdx === -1 ? '↓ Append at end' : `# ${heading}`}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {/* Copy Citation */}
                        <button
                          onClick={() => copyHighlightCitation(ann)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'var(--bg)',
                            color: 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                            transition: 'border-color 0.12s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = `${ACC}88`}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <ClipboardCopy size={13} color={ACC} style={{ flexShrink: 0 }} />
                          <span>Copy formatted citation</span>
                        </button>

                        {/* Divider */}
                        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

                        {/* Create KB Claim */}
                        <button
                          onClick={() => { setClaimFormOpen(v => !v); setDefFormOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${claimFormOpen ? '#a78bfa44' : 'var(--border)'}`,
                            background: claimFormOpen ? 'color-mix(in srgb, #a78bfa 8%, transparent)' : 'var(--bg)',
                            color: claimFormOpen ? '#a78bfa' : 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                          }}
                        >
                          <Lightbulb size={13} color="#a78bfa" style={{ flexShrink: 0 }} />
                          <span>Create KB Claim</span>
                          <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.4, transform: claimFormOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>

                        {claimFormOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid #a78bfa33', background: 'color-mix(in srgb, #a78bfa 5%, transparent)' }}>
                            <textarea
                              rows={3} value={claimText} onChange={e => setClaimText(e.target.value)}
                              placeholder="Proposition / claim text…" style={inputStyle}
                            />
                            <div style={{ display: 'flex', gap: 4 }}>
                              {['low', 'medium', 'high'].map(lv => (
                                <button key={lv} onClick={() => setClaimConfidence(lv)} style={{
                                  flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer',
                                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                                  border: `1px solid ${claimConfidence === lv ? '#a78bfa' : 'var(--border)'}`,
                                  background: claimConfidence === lv ? 'color-mix(in srgb, #a78bfa 18%, transparent)' : 'transparent',
                                  color: claimConfidence === lv ? '#a78bfa' : 'var(--text-muted)',
                                }}>{lv}</button>
                              ))}
                            </div>
                            <input
                              value={claimTags} onChange={e => setClaimTags(e.target.value)}
                              placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => saveHighlightAsClaim(ann, claimText, claimConfidence, claimTags)} disabled={!claimText.trim()} style={{ ...btnStyle('#a78bfa', true), opacity: claimText.trim() ? 1 : 0.4 }}>Save Claim</button>
                              <button onClick={() => setClaimFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Extract as Definition */}
                        <button
                          onClick={() => { setDefFormOpen(v => !v); setClaimFormOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${defFormOpen ? '#34d39944' : 'var(--border)'}`,
                            background: defFormOpen ? 'color-mix(in srgb, #34d399 8%, transparent)' : 'var(--bg)',
                            color: defFormOpen ? '#34d399' : 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                          }}
                        >
                          <BookMarked size={13} color="#34d399" style={{ flexShrink: 0 }} />
                          <span>Extract as Definition</span>
                          <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.4, transform: defFormOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>

                        {defFormOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)' }}>
                            <input
                              value={defTerm} onChange={e => setDefTerm(e.target.value)}
                              placeholder="Term name…" style={{ ...inputStyle, resize: undefined }}
                            />
                            <textarea
                              rows={3} value={defText} onChange={e => setDefText(e.target.value)}
                              placeholder="Definition text…" style={inputStyle}
                            />
                            <input
                              value={defTags} onChange={e => setDefTags(e.target.value)}
                              placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }}
                            />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => saveHighlightAsDefinition(ann, defTerm, defText, defTags)} disabled={!defTerm.trim() || !defText.trim()} style={{ ...btnStyle('#34d399', true), opacity: defTerm.trim() && defText.trim() ? 1 : 0.4 }}>Save Definition</button>
                              <button onClick={() => setDefFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Create KB Event */}
                        <button
                          onClick={() => { setEventFormOpen(v => !v); setProcessFormOpen(false); setClaimFormOpen(false); setDefFormOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${eventFormOpen ? '#fb923c44' : 'var(--border)'}`,
                            background: eventFormOpen ? 'color-mix(in srgb, #fb923c 8%, transparent)' : 'var(--bg)',
                            color: eventFormOpen ? '#fb923c' : 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                          }}
                        >
                          <CalendarDays size={13} color="#fb923c" style={{ flexShrink: 0 }} />
                          <span>Create KB Event</span>
                          <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.4, transform: eventFormOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>

                        {eventFormOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid #fb923c33', background: 'color-mix(in srgb, #fb923c 5%, transparent)' }}>
                            <input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Event name…" style={{ ...inputStyle, resize: undefined }} />
                            <input value={eventActors} onChange={e => setEventActors(e.target.value)} placeholder="Actors / participants (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                            <textarea rows={3} value={eventOutcome} onChange={e => setEventOutcome(e.target.value)} placeholder="Outcome / result…" style={inputStyle} />
                            <input value={eventTags} onChange={e => setEventTags(e.target.value)} placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => saveHighlightAsEvent(ann, eventName, eventActors, eventOutcome, eventTags)} disabled={!eventName.trim()} style={{ ...btnStyle('#fb923c', true), opacity: eventName.trim() ? 1 : 0.4 }}>Save Event</button>
                              <button onClick={() => setEventFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Create KB Process */}
                        <button
                          onClick={() => { setProcessFormOpen(v => !v); setEventFormOpen(false); setClaimFormOpen(false); setDefFormOpen(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${processFormOpen ? '#38bdf844' : 'var(--border)'}`,
                            background: processFormOpen ? 'color-mix(in srgb, #38bdf8 8%, transparent)' : 'var(--bg)',
                            color: processFormOpen ? '#38bdf8' : 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                          }}
                        >
                          <GitFork size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
                          <span>Create KB Process</span>
                          <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.4, transform: processFormOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>

                        {processFormOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 6, border: '1px solid #38bdf833', background: 'color-mix(in srgb, #38bdf8 5%, transparent)' }}>
                            <input value={processName} onChange={e => setProcessName(e.target.value)} placeholder="Process name…" style={{ ...inputStyle, resize: undefined }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Steps (one per line)</div>
                            <textarea rows={4} value={processSteps} onChange={e => setProcessSteps(e.target.value)} placeholder="Step 1&#10;Step 2&#10;Step 3…" style={inputStyle} />
                            <input value={processInputs} onChange={e => setProcessInputs(e.target.value)} placeholder="Inputs (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                            <input value={processOutputs} onChange={e => setProcessOutputs(e.target.value)} placeholder="Outputs (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                            <input value={processTags} onChange={e => setProcessTags(e.target.value)} placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => saveHighlightAsProcess(ann, processName, processSteps, processInputs, processOutputs, processTags)} disabled={!processName.trim()} style={{ ...btnStyle('#38bdf8', true), opacity: processName.trim() ? 1 : 0.4 }}>Save Process</button>
                              <button onClick={() => setProcessFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Divider */}
                        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

                        {/* Export to Markdown */}
                        <button
                          onClick={() => exportHighlightToMarkdown(ann)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'var(--bg)',
                            color: 'var(--text)', fontSize: 11, textAlign: 'left', width: '100%',
                            transition: 'border-color 0.12s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#fb923c88'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                        >
                          <FileCode2 size={13} color="#fb923c" style={{ flexShrink: 0 }} />
                          <span>Export to Markdown</span>
                          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>copies</span>
                        </button>

                      </div>

                      {/* Saved KB items summary with entity linker */}
                      {(() => {
                        const savedClaims  = (paper.claims      || []).filter(cl => cl.sourceAnnId === ann.id);
                        const savedDefs    = (paper.definitions  || []).filter(d  => d.sourceAnnId  === ann.id);
                        const savedEvents  = (paper.events       || []).filter(ev => ev.sourceAnnId  === ann.id);
                        const savedProcs   = (paper.processes    || []).filter(pr => pr.sourceAnnId  === ann.id);
                        const allDefs      = paper.definitions   || [];
                        if (!savedClaims.length && !savedDefs.length && !savedEvents.length && !savedProcs.length) return null;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Saved from this highlight
                            </div>

                            {/* Claims — with entity linker */}
                            {savedClaims.map(cl => (
                              <div key={cl.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', borderRadius: 5, border: '1px solid #a78bfa33', background: 'color-mix(in srgb, #a78bfa 5%, transparent)', fontSize: 11 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                  <span style={{ color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>Claim</span>
                                  <span style={{ color: 'var(--text-muted)', flex: 1 }}>{cl.text.length > 70 ? cl.text.slice(0, 70) + '…' : cl.text}</span>
                                </div>
                                {/* Entity link status */}
                                {cl.linkedEntityId ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingTop: 2 }}>
                                    <Link2 size={9} color="#34d399" />
                                    <span style={{ fontSize: 10, color: '#34d399' }}>{cl.linkedEntityTerm}</span>
                                    <button
                                      onClick={() => unlinkClaim(cl.id)}
                                      style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', display: 'flex' }}
                                      title="Unlink entity"
                                    >
                                      <Unlink size={9} />
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    <button
                                      onClick={() => setLinkingClaimId(id => id === cl.id ? null : cl.id)}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 10, border: 'none', background: 'none', cursor: 'pointer',
                                        color: linkingClaimId === cl.id ? '#a78bfa' : 'var(--text-muted)', padding: 0,
                                      }}
                                    >
                                      <Link2 size={9} /> Link to entity
                                    </button>
                                    {linkingClaimId === cl.id && (
                                      <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {allDefs.length === 0 ? (
                                          <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '3px 4px' }}>No definitions saved yet — extract one first</div>
                                        ) : (
                                          allDefs.map(d => (
                                            <button
                                              key={d.id}
                                              onClick={() => linkClaimToEntity(cl.id, d.id, d.term)}
                                              style={{
                                                padding: '4px 7px', borderRadius: 4, cursor: 'pointer', fontSize: 10,
                                                border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)',
                                                color: '#34d399', textAlign: 'left', width: '100%',
                                              }}
                                            >
                                              {d.term}
                                            </button>
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Definitions */}
                            {savedDefs.map(d => (
                              <div key={d.id} style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)', fontSize: 11 }}>
                                <span style={{ color: '#34d399', fontWeight: 700, marginRight: 5 }}>Def</span>
                                <span style={{ color: 'var(--text-muted)' }}><em>{d.term}</em> — {d.definition.length > 60 ? d.definition.slice(0, 60) + '…' : d.definition}</span>
                              </div>
                            ))}

                            {/* Events */}
                            {savedEvents.map(ev => (
                              <div key={ev.id} style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #fb923c33', background: 'color-mix(in srgb, #fb923c 5%, transparent)', fontSize: 11 }}>
                                <span style={{ color: '#fb923c', fontWeight: 700, marginRight: 5 }}>Event</span>
                                <span style={{ color: 'var(--text-muted)' }}>{ev.name}{ev.actors?.length ? ` · ${ev.actors.join(', ')}` : ''}</span>
                              </div>
                            ))}

                            {/* Processes */}
                            {savedProcs.map(pr => (
                              <div key={pr.id} style={{ padding: '5px 8px', borderRadius: 5, border: '1px solid #38bdf833', background: 'color-mix(in srgb, #38bdf8 5%, transparent)', fontSize: 11 }}>
                                <span style={{ color: '#38bdf8', fontWeight: 700, marginRight: 5 }}>Process</span>
                                <span style={{ color: 'var(--text-muted)' }}>{pr.name}{pr.steps?.length ? ` · ${pr.steps.length} steps` : ''}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Delete */}
                      <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                        <button
                          onClick={() => { deleteAnnotation(ann.id); closeHighlightDetail(); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid transparent', background: 'transparent',
                            color: 'var(--text-muted)', fontSize: 11, width: '100%',
                            transition: 'color 0.12s, border-color 0.12s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f8717144'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
                        >
                          <Trash2 size={11} /> Delete annotation
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })()}

              {/* ── Export-all toolbar (hidden while detail is open) ── */}
              {!highlightDetailId && annotations.length > 0 && (
                <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
                  {exportAllToast ? (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={10} /> Copied!
                    </span>
                  ) : (
                    <button
                      onClick={exportAllHighlights}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                        fontSize: 10, fontWeight: 600,
                        border: '1px solid var(--border)', background: 'var(--bg)',
                        color: 'var(--text-muted)',
                      }}
                      title="Copy all highlights as Markdown"
                      onMouseEnter={e => { e.currentTarget.style.color = '#fb923c'; e.currentTarget.style.borderColor = '#fb923c44'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <FileDown size={11} /> Export all
                    </button>
                  )}
                </div>
              )}

              {/* ── Annotation list (hidden while detail is open) ── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: highlightDetailId ? 'none' : undefined }}>
                {annotations.length === 0 ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', gap: 10,
                    color: 'var(--text-muted)', fontSize: 12,
                    padding: '40px 24px', textAlign: 'center',
                  }}>
                    <Highlighter size={28} style={{ opacity: 0.2 }} />
                    Select text in the PDF and click the highlight button to save quotes.
                  </div>
                ) : (
                  // Group annotations by page, sorted ascending
                  (() => {
                    const byPage = {};
                    annotations.forEach(a => { (byPage[a.page] = byPage[a.page] || []).push(a); });
                    return Object.keys(byPage).map(Number).sort((a, b) => a - b).map(p => (
                      <div key={p} style={{ marginBottom: 4 }}>
                        {/* Page header — click to navigate */}
                        <button
                          onClick={() => goToPage(p)}
                          style={{
                            width: '100%', textAlign: 'left', border: 'none',
                            background: 'transparent', cursor: 'pointer',
                            padding: '4px 14px 2px',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                          title={`Jump to page ${p}`}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                            background: `color-mix(in srgb, ${ACC} 15%, transparent)`,
                            color: ACC, letterSpacing: '0.04em',
                          }}>p. {p}</span>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        </button>
                        {/* Annotations on this page */}
                        {byPage[p].map(ann => {
                          const c = ann.color || ACC;
                          const typeLabel =
                            ann.type === 'highlight'     ? 'Highlight' :
                            ann.type === 'underline'     ? 'Underline' :
                            ann.type === 'strikethrough' ? 'Strikethrough' :
                            ann.type === 'area'          ? 'Area' : 'Note';
                          const TypeIcon =
                            ann.type === 'underline'     ? <Underline size={9} /> :
                            ann.type === 'strikethrough' ? <Strikethrough size={9} /> :
                            ann.type === 'note'          ? <MessageSquare size={9} /> :
                            ann.type === 'area'          ? <Square size={9} /> :
                            <Highlighter size={9} />;
                          return (
                            <div
                              key={ann.id}
                              onClick={() => openHighlightDetail(ann.id)}
                              style={{
                                margin: '2px 10px', padding: '8px 10px', borderRadius: 6,
                                background: `color-mix(in srgb, ${c} 7%, transparent)`,
                                borderLeft: `3px solid ${c}`,
                                border: `1px solid color-mix(in srgb, ${c} 20%, transparent)`,
                                borderLeftWidth: 3,
                                display: 'flex', gap: 8, alignItems: 'flex-start',
                                cursor: 'pointer', transition: 'background 0.12s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${c} 14%, transparent)`; }}
                              onMouseLeave={e => { e.currentTarget.style.background = `color-mix(in srgb, ${c} 7%, transparent)`; }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {/* Type badge */}
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  marginBottom: 6, color: c,
                                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                                }}>
                                  {TypeIcon} {typeLabel}
                                </div>

                                {/* Area annotations: show thumbnail instead of quoted text */}
                                {ann.type === 'area' ? (
                                  ann.thumbnail ? (
                                    <div style={{
                                      borderRadius: 4, overflow: 'hidden',
                                      border: `1px solid ${c}33`,
                                      background: '#111',
                                      lineHeight: 0,
                                    }}>
                                      <img
                                        src={ann.thumbnail}
                                        alt="Area selection"
                                        style={{
                                          display: 'block', width: '100%', height: 'auto',
                                          maxHeight: 160, objectFit: 'contain',
                                        }}
                                      />
                                    </div>
                                  ) : (
                                    // Skeleton while thumbnail is generating
                                    <div style={{
                                      height: 64, borderRadius: 4,
                                      background: 'rgba(147,197,253,0.08)',
                                      border: `1px solid ${c}22`,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      <Loader size={14} color={c}
                                        style={{ opacity: 0.5, animation: 'spin 1s linear infinite' }} />
                                    </div>
                                  )
                                ) : (
                                  /* Text-based annotations: show quoted text */
                                  <div style={{
                                    fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
                                    fontStyle: 'italic', wordBreak: 'break-word',
                                    textDecoration:
                                      ann.type === 'underline'     ? 'underline' :
                                      ann.type === 'strikethrough' ? 'line-through' : 'none',
                                    textDecorationColor: c,
                                  }}>
                                    "{ann.text}"
                                  </div>
                                )}

                                {/* Comment */}
                                {ann.comment && (
                                  <div style={{
                                    marginTop: 5, fontSize: 11, color: 'var(--text)',
                                    lineHeight: 1.55, wordBreak: 'break-word',
                                  }}>
                                    {ann.comment}
                                  </div>
                                )}
                              </div>
                              <ChevronRight size={13} style={{ flexShrink: 0, color: 'var(--text-muted)', opacity: 0.45, marginTop: 1 }} />
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()
                )}
              </div>
              {/* Quick-add note on current page (hidden when detail is open) */}
              <div style={{
                padding: '10px 12px', borderTop: '1px solid var(--border)',
                display: highlightDetailId ? 'none' : 'flex', gap: 6, flexShrink: 0,
              }}>
                <input
                  value={quickNote}
                  onChange={e => setQuickNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addQuickNote()}
                  placeholder={`Note on p.${currentPage}…`}
                  style={{
                    flex: 1, padding: '5px 9px', borderRadius: 6, fontSize: 11,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: 'var(--text)', outline: 'none',
                  }}
                />
                <button
                  onClick={addQuickNote}
                  disabled={!quickNote.trim()}
                  style={{
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${ACC}44`,
                    background: `color-mix(in srgb, ${ACC} 12%, transparent)`,
                    color: ACC, fontSize: 11, fontWeight: 600,
                    opacity: quickNote.trim() ? 1 : 0.4,
                  }}
                >
                  Add
                </button>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Highlight focused modal ── */}
      {hlModalOpen && highlightDetailId && (() => {
        const ann = annotations.find(a => a.id === highlightDetailId);
        if (!ann) return null;
        const c         = ann.color || ACC;
        const typeLabel =
          ann.type === 'highlight'     ? 'Highlight' :
          ann.type === 'underline'     ? 'Underline' :
          ann.type === 'strikethrough' ? 'Strikethrough' :
          ann.type === 'area'          ? 'Area capture' : 'Note';
        const TypeIcon =
          ann.type === 'underline'     ? <Underline size={11} /> :
          ann.type === 'strikethrough' ? <Strikethrough size={11} /> :
          ann.type === 'note'          ? <MessageSquare size={11} /> :
          ann.type === 'area'          ? <Square size={11} /> :
          <Highlighter size={11} />;
        const ref = [
          paper.authors ? paper.authors.split(',')[0].trim() : null,
          paper.year,
        ].filter(Boolean).join(', ');

        // Prev / Next navigation
        const sortedAnns = [...annotations].sort((a, b) => a.page - b.page);
        const annIdx     = sortedAnns.findIndex(a => a.id === ann.id);
        const prevAnn    = annIdx > 0                      ? sortedAnns[annIdx - 1] : null;
        const nextAnn    = annIdx < sortedAnns.length - 1  ? sortedAnns[annIdx + 1] : null;
        const goToModalAnn = (target) => {
          setClaimFormOpen(false); setDefFormOpen(false);
          setEventFormOpen(false); setProcessFormOpen(false);
          setNotesSectionOpen(false); setLinkingClaimId(null);
          setHlActionToast(null); setPreviewSection(null);
          setClaimText(''); setClaimTags('');
          setDefTerm(''); setDefText(''); setDefTags('');
          setHighlightDetailId(target.id);
        };

        // Auto-fill: guess the most likely term from highlighted text
        const guessDefTerm = (text) => {
          if (!text) return '';
          const quoted = text.match(/["']([^"']{2,40})["']/);
          if (quoted) return quoted[1];
          const proper = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/);
          if (proper) return proper[1];
          const single = text.match(/\b([A-Z][a-zA-Z]{2,})\b/);
          if (single) return single[1];
          return '';
        };

        const inputStyle = {
          width: '100%', boxSizing: 'border-box',
          padding: '8px 10px', borderRadius: 6, fontSize: 12,
          border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--text)', outline: 'none', resize: 'none',
          fontFamily: 'var(--font-sans)', lineHeight: 1.6,
        };
        const btnStyle = (color, fill) => ({
          flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          fontWeight: 600, border: `1px solid ${color}44`,
          background: fill ? `color-mix(in srgb, ${color} 18%, transparent)` : 'transparent',
          color: fill ? color : 'var(--text-muted)',
        });
        const actionBtn = (onClick, color, Icon, label, active, chevron) => (
          <button
            onClick={onClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '9px 12px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${active ? color + '55' : 'var(--border)'}`,
              background: active ? `color-mix(in srgb, ${color} 9%, transparent)` : 'var(--bg)',
              color: active ? color : 'var(--text)', fontSize: 12, textAlign: 'left', width: '100%',
            }}
          >
            <Icon size={14} color={color} style={{ flexShrink: 0 }} />
            <span>{label}</span>
            {chevron && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.4, transform: active ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />}
          </button>
        );

        const savedClaims = (paper.claims     || []).filter(cl => cl.sourceAnnId === ann.id);
        const savedDefs   = (paper.definitions || []).filter(d  => d.sourceAnnId  === ann.id);
        const savedEvents = (paper.events      || []).filter(ev => ev.sourceAnnId  === ann.id);
        const savedProcs  = (paper.processes   || []).filter(pr => pr.sourceAnnId  === ann.id);
        const allDefs     = paper.definitions  || [];
        const hasSaved    = savedClaims.length || savedDefs.length || savedEvents.length || savedProcs.length;
        const headings    = parseNotesHeadings(notes);

        return (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setHlModalOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.72)',
                backdropFilter: 'blur(2px)',
              }}
            />

            {/* Modal card */}
            <div style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10000,
              width: 'min(940px, 94vw)',
              maxHeight: '88vh',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>

              {/* ── Modal header ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 18px', borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}>
                {/* Colour dot */}
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
                {/* Type label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: c, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {TypeIcon} {typeLabel}
                </div>
                {/* Paper info */}
                <div style={{ flex: 1, minWidth: 0, paddingLeft: 6, borderLeft: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {paper.title || 'Untitled'}
                  </div>
                  {ref && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ref}</div>}
                </div>
                {/* Page chip */}
                <button
                  onClick={() => { goToPage(ann.page); setHlModalOpen(false); }}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
                    background: `color-mix(in srgb, ${c} 15%, transparent)`,
                    color: c, border: 'none', cursor: 'pointer', letterSpacing: '0.04em', flexShrink: 0,
                  }}
                  title="Jump to page in PDF"
                >
                  p.{ann.page}
                </button>
                {/* Prev / Next nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderLeft: '1px solid var(--border)', paddingLeft: 10, marginLeft: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => prevAnn && goToModalAnn(prevAnn)}
                    disabled={!prevAnn}
                    style={{ border: 'none', background: 'none', cursor: prevAnn ? 'pointer' : 'default', color: prevAnn ? 'var(--text-muted)' : 'var(--border)', display: 'flex', alignItems: 'center', padding: '3px 5px', borderRadius: 4 }}
                    title={prevAnn ? `Previous highlight (p.${prevAnn.page})` : 'No previous highlight'}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 36, textAlign: 'center', letterSpacing: '0.03em' }}>
                    {annIdx + 1}/{sortedAnns.length}
                  </span>
                  <button
                    onClick={() => nextAnn && goToModalAnn(nextAnn)}
                    disabled={!nextAnn}
                    style={{ border: 'none', background: 'none', cursor: nextAnn ? 'pointer' : 'default', color: nextAnn ? 'var(--text-muted)' : 'var(--border)', display: 'flex', alignItems: 'center', padding: '3px 5px', borderRadius: 4 }}
                    title={nextAnn ? `Next highlight (p.${nextAnn.page})` : 'No next highlight'}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                {/* Close */}
                <button
                  onClick={() => setHlModalOpen(false)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: 5 }}
                  title="Close (Esc)"
                >
                  <X size={16} />
                </button>
              </div>

              {/* ── Modal body — two columns ── */}
              <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                {/* ── Left column: source + context ── */}
                <div style={{
                  width: 380, flexShrink: 0,
                  borderRight: '1px solid var(--border)',
                  display: 'flex', flexDirection: 'column',
                  overflowY: 'auto',
                  padding: '20px 20px 24px',
                  gap: 18,
                }}>

                  {/* Quote / area thumbnail */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                      Source
                    </div>
                    <div style={{ borderLeft: `3px solid ${c}`, paddingLeft: 14, borderRadius: '0 6px 6px 0' }}>
                      {ann.type === 'area' ? (
                        ann.thumbnail
                          ? <img src={ann.thumbnail} alt="Area capture" style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 5 }} />
                          : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader size={16} color={c} /></div>
                      ) : (
                        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, fontStyle: 'italic', wordBreak: 'break-word' }}>
                          "{ann.text}"
                        </div>
                      )}
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                        — p.{ann.page}{ref ? ` (${ref})` : ''}
                      </div>
                    </div>
                  </div>

                  {/* ── Color + Type editors ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Color row */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Color
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {HIGHLIGHT_COLORS.map(({ key, hex }) => (
                          <button
                            key={key}
                            onClick={() => updateAnnotation(ann.id, { color: hex })}
                            title={key}
                            style={{
                              width: 24, height: 24, borderRadius: '50%', cursor: 'pointer',
                              background: hex, flexShrink: 0,
                              border: ann.color === hex
                                ? `3px solid ${hex}` : '3px solid transparent',
                              outline: ann.color === hex ? `2px solid ${hex}` : '2px solid transparent',
                              outlineOffset: 2,
                              transition: 'transform 0.1s, outline-color 0.1s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* Type row — text annotations only */}
                    {ann.type !== 'area' && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                          Type
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[
                            { type: 'highlight',     label: 'Highlight',   Icon: Highlighter    },
                            { type: 'underline',     label: 'Underline',   Icon: Underline      },
                            { type: 'strikethrough', label: 'Strike',      Icon: Strikethrough  },
                          ].map(({ type: t, label, Icon }) => {
                            const active = ann.type === t;
                            return (
                              <button
                                key={t}
                                onClick={() => updateAnnotation(ann.id, { type: t })}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 5,
                                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                                  fontWeight: active ? 700 : 500,
                                  border: `1px solid ${active ? c + '88' : 'var(--border)'}`,
                                  background: active ? `color-mix(in srgb, ${c} 15%, transparent)` : 'transparent',
                                  color: active ? c : 'var(--text-muted)',
                                  transition: 'background 0.12s, color 0.12s',
                                }}
                              >
                                <Icon size={12} /> {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comment editor */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                      Comment
                    </div>
                    <textarea
                      rows={4}
                      value={detailComment}
                      onChange={e => setDetailComment(e.target.value)}
                      onBlur={() => updateAnnotation(ann.id, { comment: detailComment })}
                      placeholder="Add a note about this highlight…"
                      style={inputStyle}
                    />
                  </div>

                  {/* ── Notes preview ── */}
                  {(() => {
                    const previewBlock = `> "${ann.type === 'area' ? 'Area selection' : (ann.text || '')}"\n> — p.${ann.page}${ref ? ` (${ref})` : ''}`;
                    const noteLines    = (notes || '').split('\n');

                    // Compute which line to insert the ghost block after
                    const computeInsertAt = (lineIdx) => {
                      if (lineIdx === -1 || lineIdx === null) return noteLines.length; // append
                      let insertAt = noteLines.length;
                      for (let i = lineIdx + 1; i < noteLines.length; i++) {
                        if (/^#{1,3}\s/.test(noteLines[i])) { insertAt = i; break; }
                      }
                      while (insertAt > lineIdx + 1 && noteLines[insertAt - 1].trim() === '') insertAt--;
                      return insertAt;
                    };

                    const insertAt     = computeInsertAt(previewSection);
                    const ghostLines   = previewBlock.split('\n');

                    // Build rendered line list: [{ text, isGhost, isHeading, isBlockquote }]
                    const rendered = [];
                    noteLines.forEach((line, i) => {
                      if (i === insertAt) ghostLines.forEach(gl => rendered.push({ text: gl, isGhost: true, isBlockquote: true }));
                      rendered.push({
                        text: line, isGhost: false,
                        isHeading:    /^#{1,3}\s/.test(line),
                        isBlockquote: /^>\s?/.test(line),
                      });
                    });
                    if (insertAt >= noteLines.length) ghostLines.forEach(gl => rendered.push({ text: gl, isGhost: true, isBlockquote: true }));

                    const insertLabel = previewSection !== null && previewSection !== -1
                      ? `↑ will be inserted under "# ${headings.find(h => h.lineIdx === previewSection)?.heading || '…'}"`
                      : '↓ will be appended here';

                    return (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                          Notes preview
                        </div>
                        <div style={{
                          maxHeight: 190, overflowY: 'auto',
                          border: '1px solid var(--border)', borderRadius: 7,
                          background: 'var(--bg)', fontSize: 11,
                        }}>
                          {/* Line-by-line notes render */}
                          <div style={{ padding: '8px 10px 0' }}>
                            {notes ? rendered.map((row, i) => (
                              <div key={i} style={{
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.65,
                                color: row.isGhost ? c : row.isHeading ? 'var(--text)' : row.isBlockquote ? 'var(--text-muted)' : 'var(--text)',
                                fontWeight: row.isHeading ? 700 : 400,
                                fontStyle: row.isGhost ? 'italic' : 'normal',
                                fontSize: row.isHeading ? 12 : 11,
                                paddingLeft: row.isBlockquote ? 8 : 0,
                                borderLeft: row.isBlockquote ? `2px solid ${row.isGhost ? c : 'var(--border)'}` : 'none',
                                opacity: row.isGhost ? 0.75 : 1,
                              }}>
                                {row.text || '\u00A0'}
                              </div>
                            )) : (
                              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', paddingBottom: 8 }}>
                                Notes are empty — quote will start a new section.
                              </div>
                            )}
                          </div>
                          {/* Insertion label */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px 6px',
                            borderTop: `1px dashed ${c}55`,
                            marginTop: 4,
                          }}>
                            <div style={{ flex: 1, height: 0, borderTop: `1px dashed ${c}33` }} />
                            <span style={{ fontSize: 10, color: c, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {insertLabel}
                            </span>
                            <div style={{ flex: 1, height: 0, borderTop: `1px dashed ${c}33` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Saved KB items */}
                  {hasSaved > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                        Saved from this highlight
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {savedClaims.map(cl => (
                          <div key={cl.id} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #a78bfa33', background: 'color-mix(in srgb, #a78bfa 5%, transparent)', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: cl.linkedEntityId ? 5 : 0 }}>
                              <span style={{ color: '#a78bfa', fontWeight: 700, flexShrink: 0 }}>Claim</span>
                              <span style={{ color: 'var(--text-muted)', flex: 1 }}>{cl.text.length > 90 ? cl.text.slice(0, 90) + '…' : cl.text}</span>
                            </div>
                            {cl.linkedEntityId ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Link2 size={10} color="#34d399" />
                                <span style={{ fontSize: 11, color: '#34d399' }}>{cl.linkedEntityTerm}</span>
                                <button onClick={() => unlinkClaim(cl.id)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }} title="Unlink"><Unlink size={10} /></button>
                              </div>
                            ) : (
                              <div>
                                <button onClick={() => setLinkingClaimId(id => id === cl.id ? null : cl.id)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, border: 'none', background: 'none', cursor: 'pointer', color: linkingClaimId === cl.id ? '#a78bfa' : 'var(--text-muted)', padding: 0 }}>
                                  <Link2 size={10} /> Link to entity
                                </button>
                                {linkingClaimId === cl.id && (
                                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {allDefs.length === 0
                                      ? <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 4px' }}>No definitions saved yet</div>
                                      : allDefs.map(d => (
                                          <button key={d.id} onClick={() => linkClaimToEntity(cl.id, d.id, d.term)} style={{ padding: '5px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)', color: '#34d399', textAlign: 'left' }}>
                                            {d.term}
                                          </button>
                                        ))
                                    }
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {savedDefs.map(d => (
                          <div key={d.id} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)', fontSize: 12 }}>
                            <span style={{ color: '#34d399', fontWeight: 700, marginRight: 6 }}>Def</span>
                            <span style={{ color: 'var(--text-muted)' }}><em>{d.term}</em> — {d.definition.length > 70 ? d.definition.slice(0, 70) + '…' : d.definition}</span>
                          </div>
                        ))}
                        {savedEvents.map(ev => (
                          <div key={ev.id} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #fb923c33', background: 'color-mix(in srgb, #fb923c 5%, transparent)', fontSize: 12 }}>
                            <span style={{ color: '#fb923c', fontWeight: 700, marginRight: 6 }}>Event</span>
                            <span style={{ color: 'var(--text-muted)' }}>{ev.name}{ev.actors?.length ? ` · ${ev.actors.join(', ')}` : ''}</span>
                          </div>
                        ))}
                        {savedProcs.map(pr => (
                          <div key={pr.id} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #38bdf833', background: 'color-mix(in srgb, #38bdf8 5%, transparent)', fontSize: 12 }}>
                            <span style={{ color: '#38bdf8', fontWeight: 700, marginRight: 6 }}>Process</span>
                            <span style={{ color: 'var(--text-muted)' }}>{pr.name}{pr.steps?.length ? ` · ${pr.steps.length} steps` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Delete */}
                  <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => { deleteAnnotation(ann.id); closeHighlightDetail(); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, width: '100%' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = '#f8717144'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
                    >
                      <Trash2 size={12} /> Delete annotation
                    </button>
                  </div>
                </div>

                {/* ── Right column: KB actions ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>

                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    Use in Knowledge Base
                  </div>

                  {/* Action toast */}
                  {hlActionToast && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'color-mix(in srgb, #34d399 12%, transparent)', border: '1px solid #34d39944', color: '#34d399' }}>
                      <Check size={13} /> {hlActionToast.label}
                    </div>
                  )}

                  {/* Add to Reading Notes */}
                  {(() => {
                    return (
                      <>
                        {actionBtn(
                          () => { if (headings.length === 0) addHighlightToNotesSection(ann, -1); else setNotesSectionOpen(v => !v); },
                          '#fde68a', StickyNote, 'Add to Reading Notes', notesSectionOpen, headings.length > 0,
                        )}
                        {notesSectionOpen && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 7, border: '1px solid #fde68a33', background: 'color-mix(in srgb, #fde68a 5%, transparent)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 6px 4px' }}>Insert under section</div>
                            {[{ heading: 'Append at end', lineIdx: -1 }, ...headings].map(({ heading, lineIdx }) => (
                              <button key={lineIdx}
                                onClick={() => addHighlightToNotesSection(ann, lineIdx)}
                                onMouseEnter={e => {
                                  e.currentTarget.style.background = 'color-mix(in srgb, #fde68a 10%, transparent)';
                                  e.currentTarget.style.color = '#fde68a';
                                  setPreviewSection(lineIdx);
                                }}
                                onMouseLeave={e => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text)';
                                  setPreviewSection(null);
                                }}
                                style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, border: 'none', background: 'transparent', color: 'var(--text)', textAlign: 'left', width: '100%' }}
                              >
                                {lineIdx === -1 ? '↓ Append at end' : `# ${heading}`}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Copy Citation */}
                  {actionBtn(() => copyHighlightCitation(ann), ACC, ClipboardCopy, 'Copy formatted citation', false, false)}

                  <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

                  {/* Create KB Claim */}
                  {actionBtn(() => {
                    if (!claimFormOpen && !claimText.trim() && ann.type !== 'area') setClaimText(ann.text || '');
                    setClaimFormOpen(v => !v); setDefFormOpen(false); setEventFormOpen(false); setProcessFormOpen(false);
                  }, '#a78bfa', Lightbulb, 'Create KB Claim', claimFormOpen, true)}
                  {claimFormOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 7, border: '1px solid #a78bfa33', background: 'color-mix(in srgb, #a78bfa 5%, transparent)' }}>
                      <textarea rows={4} value={claimText} onChange={e => setClaimText(e.target.value)} placeholder="Proposition / claim text…" style={inputStyle} />
                      <div style={{ display: 'flex', gap: 5 }}>
                        {['low', 'medium', 'high'].map(lv => (
                          <button key={lv} onClick={() => setClaimConfidence(lv)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', border: `1px solid ${claimConfidence === lv ? '#a78bfa' : 'var(--border)'}`, background: claimConfidence === lv ? 'color-mix(in srgb, #a78bfa 18%, transparent)' : 'transparent', color: claimConfidence === lv ? '#a78bfa' : 'var(--text-muted)' }}>{lv}</button>
                        ))}
                      </div>
                      <input value={claimTags} onChange={e => setClaimTags(e.target.value)} placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button onClick={() => saveHighlightAsClaim(ann, claimText, claimConfidence, claimTags)} disabled={!claimText.trim()} style={{ ...btnStyle('#a78bfa', true), opacity: claimText.trim() ? 1 : 0.4 }}>Save Claim</button>
                        <button onClick={() => setClaimFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Extract as Definition */}
                  {actionBtn(() => {
                    if (!defFormOpen && ann.type !== 'area') {
                      if (!defText.trim()) setDefText(ann.text || '');
                      if (!defTerm.trim()) setDefTerm(guessDefTerm(ann.text || ''));
                    }
                    setDefFormOpen(v => !v); setClaimFormOpen(false); setEventFormOpen(false); setProcessFormOpen(false);
                  }, '#34d399', BookMarked, 'Extract as Definition', defFormOpen, true)}
                  {defFormOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 7, border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)' }}>
                      <input value={defTerm} onChange={e => setDefTerm(e.target.value)} placeholder="Term name…" style={{ ...inputStyle, resize: undefined }} />
                      <textarea rows={4} value={defText} onChange={e => setDefText(e.target.value)} placeholder="Definition text…" style={inputStyle} />
                      <input value={defTags} onChange={e => setDefTags(e.target.value)} placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button onClick={() => saveHighlightAsDefinition(ann, defTerm, defText, defTags)} disabled={!defTerm.trim() || !defText.trim()} style={{ ...btnStyle('#34d399', true), opacity: defTerm.trim() && defText.trim() ? 1 : 0.4 }}>Save Definition</button>
                        <button onClick={() => setDefFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Create KB Event */}
                  {actionBtn(() => { setEventFormOpen(v => !v); setClaimFormOpen(false); setDefFormOpen(false); setProcessFormOpen(false); }, '#fb923c', CalendarDays, 'Create KB Event', eventFormOpen, true)}
                  {eventFormOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 7, border: '1px solid #fb923c33', background: 'color-mix(in srgb, #fb923c 5%, transparent)' }}>
                      <input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Event name…" style={{ ...inputStyle, resize: undefined }} />
                      <input value={eventActors} onChange={e => setEventActors(e.target.value)} placeholder="Actors / participants (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <textarea rows={4} value={eventOutcome} onChange={e => setEventOutcome(e.target.value)} placeholder="Outcome / result…" style={inputStyle} />
                      <input value={eventTags} onChange={e => setEventTags(e.target.value)} placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button onClick={() => saveHighlightAsEvent(ann, eventName, eventActors, eventOutcome, eventTags)} disabled={!eventName.trim()} style={{ ...btnStyle('#fb923c', true), opacity: eventName.trim() ? 1 : 0.4 }}>Save Event</button>
                        <button onClick={() => setEventFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Create KB Process */}
                  {actionBtn(() => { setProcessFormOpen(v => !v); setClaimFormOpen(false); setDefFormOpen(false); setEventFormOpen(false); }, '#38bdf8', GitFork, 'Create KB Process', processFormOpen, true)}
                  {processFormOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 7, border: '1px solid #38bdf833', background: 'color-mix(in srgb, #38bdf8 5%, transparent)' }}>
                      <input value={processName} onChange={e => setProcessName(e.target.value)} placeholder="Process name…" style={{ ...inputStyle, resize: undefined }} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Steps (one per line)</div>
                      <textarea rows={5} value={processSteps} onChange={e => setProcessSteps(e.target.value)} placeholder={'Step 1\nStep 2\nStep 3…'} style={inputStyle} />
                      <input value={processInputs} onChange={e => setProcessInputs(e.target.value)} placeholder="Inputs (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <input value={processOutputs} onChange={e => setProcessOutputs(e.target.value)} placeholder="Outputs (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <input value={processTags} onChange={e => setProcessTags(e.target.value)} placeholder="Tags (comma-separated)…" style={{ ...inputStyle, resize: undefined }} />
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button onClick={() => saveHighlightAsProcess(ann, processName, processSteps, processInputs, processOutputs, processTags)} disabled={!processName.trim()} style={{ ...btnStyle('#38bdf8', true), opacity: processName.trim() ? 1 : 0.4 }}>Save Process</button>
                        <button onClick={() => setProcessFormOpen(false)} style={btnStyle('var(--text-muted)', false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

                  {/* Export to Markdown */}
                  {actionBtn(() => exportHighlightToMarkdown(ann), '#fb923c', FileCode2, 'Export to Markdown', false, false)}

                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Area marquee drag visual ── */}
      {areaDrag && (() => {
        const { startX, startY, currentX, currentY } = areaDrag;
        const left   = Math.min(startX, currentX);
        const top    = Math.min(startY, currentY);
        const width  = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        return (
          <div style={{
            position: 'fixed', left, top, width, height,
            border: '1.5px dashed #93c5fd',
            background: 'rgba(147,197,253,0.08)',
            zIndex: 9998,
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }} />
        );
      })()}

      {/* ── Area selection right-click context menu ── */}
      {areaMenu && (
        <div
          data-area-menu="true"
          style={{
            position: 'fixed',
            left: areaMenu.clientX + 2,
            top:  areaMenu.clientY + 2,
            zIndex: 9999,
            background: '#1c1c1e',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: 8,
            boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            minWidth: 210,
          }}
        >
          {areaMenuMode === 'export' ? (
            /* ── Format picker ── */
            <>
              <div style={{
                padding: '7px 14px 4px',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                Export as
              </div>
              <AreaMenuItem
                label="PNG — lossless"
                icon={<Download size={13} />}
                onClick={() => exportSelection('png')}
              />
              <AreaMenuItem
                label="JPEG — smaller file"
                icon={<Download size={13} />}
                onClick={() => exportSelection('jpeg')}
              />
              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />
              <AreaMenuItem
                label="Back"
                icon={<ChevronLeft size={13} />}
                onClick={() => setAreaMenuMode('main')}
              />
            </>
          ) : (
            /* ── Main menu ── */
            <>
              <AreaMenuItem
                label="Add to Highlights"
                icon={<Highlighter size={13} />}
                onClick={addAreaToHighlights}
                accent={ACC}
              />
              <AreaMenuItem
                label={isSnapshotting ? 'Copying…' : 'Take Snapshot'}
                icon={<Camera size={13} />}
                onClick={takeSnapshot}
                loading={isSnapshotting}
              />
              <AreaMenuItem
                label="Export Selection as…"
                icon={<Download size={13} />}
                onClick={() => setAreaMenuMode('export')}
                chevron
              />
            </>
          )}
        </div>
      )}

      {/* ── Snapshot / export toast ── */}
      {snapshotToast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 20,
          background: snapshotToast === 'error' ? '#7f1d1d' : '#166534',
          border: `1px solid ${snapshotToast === 'error' ? '#dc2626' : '#16a34a'}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
          fontSize: 12, fontWeight: 600, color: '#fff',
          pointerEvents: 'none',
          animation: 'fadeInUp 0.18s ease',
          whiteSpace: 'nowrap',
        }}>
          {snapshotToast === 'ok'       && <><Check size={13} />    Area copied to clipboard</>}
          {snapshotToast === 'exported' && <><Download size={13} /> File download started</>}
          {snapshotToast === 'error'    && <><Square size={13} />   Operation failed — try again</>}
        </div>
      )}

      {/* ── Feature 1: Annotation edit popup ── */}
      {editPopup && editAnn && (
        <div
          data-edit-popup="true"
          style={{
            position: 'fixed',
            left: editPopup.x,
            top: editPopup.y,
            transform: 'translateX(-50%) translateY(calc(-100% - 10px))',
            zIndex: 9999,
            background: '#1c1c1e',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: 10,
            boxShadow: '0 4px 28px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            minWidth: 226,
          }}
        >
          {editStep === 'menu' ? (
            <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {/* Color swatches */}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }}>
                {HIGHLIGHT_COLORS.map(({ key, hex }) => (
                  <button
                    key={key}
                    onClick={() => updateAnnotation(editAnn.id, { color: hex })}
                    title={`Color: ${key}`}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                      background: hex,
                      border: editAnn.color === hex ? '2px solid rgba(255,255,255,0.8)' : '2px solid rgba(255,255,255,0.18)',
                      flexShrink: 0, transition: 'transform 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.25)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  />
                ))}
              </div>
              {/* Type change row — only for non-area annotations */}
              {editAnn.type !== 'area' && (
                <div style={{ display: 'flex', gap: 2, margin: '0 -2px' }}>
                  <AnnotationActionBtn
                    label="Highlight"
                    icon={<Highlighter size={13} />}
                    onClick={() => updateAnnotation(editAnn.id, { type: 'highlight' })}
                  />
                  <AnnotationActionBtn
                    label="Underline"
                    icon={<Underline size={13} />}
                    onClick={() => updateAnnotation(editAnn.id, { type: 'underline' })}
                  />
                  <AnnotationActionBtn
                    label="Strike"
                    icon={<Strikethrough size={13} />}
                    onClick={() => updateAnnotation(editAnn.id, { type: 'strikethrough' })}
                  />
                </div>
              )}
              {/* Comment button */}
              <div style={{ display: 'flex', gap: 2, margin: '0 -2px' }}>
                <AnnotationActionBtn
                  label="Comment"
                  icon={<MessageSquare size={13} />}
                  onClick={() => setEditStep('comment')}
                />
              </div>
              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 -10px' }} />
              {/* Delete */}
              <button
                onClick={() => { deleteAnnotation(editAnn.id); setEditPopup(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  width: '100%', padding: '5px 4px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: '#f87171', fontSize: 11, borderRadius: 5,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Trash2 size={12} /> Delete annotation
              </button>
            </div>
          ) : (
            /* Comment step */
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}>
                {editAnn.text ? `"${editAnn.text}"` : `Area — p.${editAnn.page}`}
              </div>
              <textarea
                autoFocus
                value={editComment}
                onChange={e => setEditComment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    updateAnnotation(editAnn.id, { comment: editComment.trim() });
                    setEditPopup(null);
                  }
                  if (e.key === 'Escape') setEditStep('menu');
                }}
                placeholder="Edit comment… (Enter to save)"
                rows={3}
                style={{
                  resize: 'none', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text)', outline: 'none', width: '100%',
                  fontFamily: 'var(--font-sans)', lineHeight: 1.5, boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditStep('menu')}
                  style={{
                    fontSize: 11, padding: '4px 11px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                    color: 'var(--text-muted)',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => { updateAnnotation(editAnn.id, { comment: editComment.trim() }); setEditPopup(null); }}
                  style={{
                    fontSize: 11, padding: '4px 11px', borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${ACC}44`,
                    background: `color-mix(in srgb, ${ACC} 15%, transparent)`,
                    color: ACC, fontWeight: 600,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Floating annotation menu on text selection ── */}
      {selectionPopup && (
        <div
          data-sel-popup="true"
          style={{
            position: 'fixed',
            left: selectionPopup.x,
            top: selectionPopup.y,
            transform: 'translateX(-50%) translateY(calc(-100% - 10px))',
            zIndex: 9999,
            background: '#1c1c1e',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: 10,
            boxShadow: '0 4px 28px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            minWidth: 226,
          }}
        >
          {popupStep === 'menu' ? (
            <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>

              {/* ── Color swatches row ── */}
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' }}>
                {HIGHLIGHT_COLORS.map(({ key, hex }) => (
                  <button
                    key={key}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => addAnnotationFromSelection('highlight', hex)}
                    title={`Highlight ${key}`}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                      background: hex, border: '2px solid rgba(255,255,255,0.18)',
                      flexShrink: 0, transition: 'transform 0.1s, border-color 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.65)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
                  />
                ))}
              </div>

              {/* ── Divider ── */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 -10px' }} />

              {/* ── Action buttons row ── */}
              <div style={{ display: 'flex', gap: 2, margin: '0 -2px' }}>
                <AnnotationActionBtn
                  label="Underline"
                  icon={<Underline size={13} />}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addAnnotationFromSelection('underline', '#93c5fd')}
                />
                <AnnotationActionBtn
                  label="Strikethrough"
                  icon={<Strikethrough size={13} />}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addAnnotationFromSelection('strikethrough', '#fca5a5')}
                />
                <AnnotationActionBtn
                  label="Comment"
                  icon={<MessageSquare size={13} />}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setPopupStep('comment')}
                />
              </div>
            </div>
          ) : (
            /* ── Comment input step ── */
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}>
                "{selectionPopup.text}"
              </div>
              <textarea
                autoFocus
                value={popupComment}
                onChange={e => setPopupComment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addAnnotationFromSelection('note', '#93c5fd', popupComment.trim());
                  }
                  if (e.key === 'Escape') setPopupStep('menu');
                }}
                placeholder="Add a comment… (Enter to save)"
                rows={3}
                style={{
                  resize: 'none', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text)', outline: 'none', width: '100%',
                  fontFamily: 'var(--font-sans)', lineHeight: 1.5, boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setPopupStep('menu')}
                  style={{
                    fontSize: 11, padding: '4px 11px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                    color: 'var(--text-muted)',
                  }}
                >
                  Back
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addAnnotationFromSelection('note', '#93c5fd', popupComment.trim())}
                  style={{
                    fontSize: 11, padding: '4px 11px', borderRadius: 5, cursor: 'pointer',
                    border: `1px solid ${ACC}44`,
                    background: `color-mix(in srgb, ${ACC} 15%, transparent)`,
                    color: ACC, fontWeight: 600,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page card (shared between continuous and single-page modes) ─────────────

function PageCard({ pageNum, numPages, pageWidth, darkMode, pageRefs, annotations, areaSelection, findMatches, findIndex, onAnnotationClick }) {
  // Annotations with rects (text-based) plus area annotations for this page
  const pageAnnotations = (annotations || []).filter(a =>
    a.page === pageNum && (a.rects?.length > 0 || (a.type === 'area' && a.area))
  );
  // Pending (unsaved) area selection for this page
  const pendingArea = areaSelection?.pageNum === pageNum ? areaSelection : null;

  return (
    <div
      ref={el => { if (pageRefs) pageRefs.current[pageNum] = el; }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}
    >
      <div style={{
        fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em',
        padding: '6px 0 4px', userSelect: 'none',
      }}>
        {pageNum} / {numPages}
      </div>
      <div style={{
        borderRadius: 3, overflow: 'hidden', position: 'relative',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.35)',
        // Dark mode: invert colours inside the white PDF page only
        filter: darkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
        transition: 'filter 0.2s',
      }}>
        <Page
          pageNumber={pageNum}
          width={pageWidth}
          renderTextLayer
          renderAnnotationLayer
          loading={
            <div style={{
              width: pageWidth, height: Math.round(pageWidth * 1.414),
              background: darkMode ? '#111' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          }
        />

        {/* ── Annotation overlays ──
            The overlay container applies a counter-filter in dark mode so the
            annotation colors appear in their original hues on the inverted page. */}
        {pageAnnotations.length > 0 && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: 'none',
            // Undo the parent's invert so overlays keep their real colors
            filter: darkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
          }}>
            {pageAnnotations.flatMap(ann => {
              const color = ann.color || ACC;

              // ── Area annotation ──
              if (ann.type === 'area' && ann.area) {
                const { x, y, w, h } = ann.area;
                return [(
                  <div
                    key={`${ann.id}-area`}
                    data-ann-overlay="true"
                    style={{
                      position: 'absolute',
                      left:   x * pageWidth,
                      top:    y * pageWidth,
                      width:  w * pageWidth,
                      height: h * pageWidth,
                      background: color + '22',
                      border: `1.5px solid ${color}99`,
                      boxSizing: 'border-box',
                      pointerEvents: 'auto',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(ann.id, e.clientX, e.clientY); }}
                  />
                )];
              }

              // ── Text-based annotations (iterate rects) ──
              return ann.rects.map((r, i) => {
                const left   = r.x * pageWidth;
                const top    = r.y * pageWidth;
                const width  = r.w * pageWidth;
                const height = r.h * pageWidth;

                if (ann.type === 'highlight') {
                  return (
                    <div key={`${ann.id}-${i}`}
                      data-ann-overlay="true"
                      style={{
                        position: 'absolute', left, top, width, height,
                        background: color + '55',
                        mixBlendMode: 'multiply',
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(ann.id, e.clientX, e.clientY); }}
                    />
                  );
                }
                if (ann.type === 'underline') {
                  return (
                    <div key={`${ann.id}-${i}`}
                      data-ann-overlay="true"
                      style={{
                        position: 'absolute', left,
                        top: top + height - 2,
                        width, height: 2,
                        background: color, opacity: 0.85,
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(ann.id, e.clientX, e.clientY); }}
                    />
                  );
                }
                if (ann.type === 'strikethrough') {
                  return (
                    <div key={`${ann.id}-${i}`}
                      data-ann-overlay="true"
                      style={{
                        position: 'absolute', left,
                        top: top + height * 0.5 - 1,
                        width, height: 2,
                        background: color, opacity: 0.85,
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(ann.id, e.clientX, e.clientY); }}
                    />
                  );
                }
                if (ann.type === 'note') {
                  return (
                    <div key={`${ann.id}-${i}`}
                      data-ann-overlay="true"
                      style={{
                        position: 'absolute', left, top, width, height,
                        background: color + '30',
                        borderBottom: `2px solid ${color}`,
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => { e.stopPropagation(); onAnnotationClick?.(ann.id, e.clientX, e.clientY); }}
                    />
                  );
                }
                return null;
              });
            })}
          </div>
        )}

        {/* ── Find match overlays ── */}
        {findMatches && (() => {
          const pageMatches = findMatches
            .map((m, i) => ({ ...m, isCurrent: i === findIndex }))
            .filter(m => m.page === pageNum);
          if (!pageMatches.length) return null;
          return (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              pointerEvents: 'none',
              // Undo parent invert in dark mode so match colours appear correct
              filter: darkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
            }}>
              {pageMatches.map((m, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left:   m.x * pageWidth,
                  top:    m.y * pageWidth,
                  width:  Math.max(m.w * pageWidth, 4),
                  height: Math.max(m.h * pageWidth, 6),
                  background: m.isCurrent ? 'rgba(251,146,60,0.65)' : 'rgba(253,224,71,0.50)',
                  mixBlendMode: 'multiply',
                  borderRadius: 1,
                }} />
              ))}
            </div>
          );
        })()}

        {/* ── Pending area selection (dashed, not yet saved) ── */}
        {pendingArea && (
          <div style={{
            position: 'absolute',
            left:   pendingArea.x * pageWidth,
            top:    pendingArea.y * pageWidth,
            width:  pendingArea.w * pageWidth,
            height: pendingArea.h * pageWidth,
            border: '1.5px dashed #93c5fd',
            background: 'rgba(147,197,253,0.08)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            filter: darkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
          }} />
        )}
      </div>
    </div>
  );
}

// ─── Small reusable UI pieces ─────────────────────────────────────────────────

const navBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6, cursor: 'pointer',
  border: 'none', background: 'transparent', color: 'var(--text-muted)',
  flexShrink: 0,
};

function Sep() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />;
}

function SidebarTab({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '0 14px', height: '100%',
        border: 'none', borderBottom: active ? `2px solid ${ACC}` : '2px solid transparent',
        cursor: 'pointer', background: 'transparent',
        fontSize: 11, fontWeight: 600,
        color: active ? 'var(--text)' : 'var(--text-muted)',
        transition: 'color 0.15s',
        flexShrink: 0,
      }}
    >
      <span style={{ color: active ? ACC : 'var(--text-muted)', display: 'flex' }}>{icon}</span>
      {label}
      {badge != null && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
          background: `color-mix(in srgb, ${ACC} 15%, transparent)`,
          color: ACC,
        }}>{badge}</span>
      )}
    </button>
  );
}

// ─── Area selection context menu item ────────────────────────────────────────

function AreaMenuItem({ label, icon, onClick, accent, disabled, loading, chevron }) {
  const inactive = disabled || loading;
  return (
    <button
      onClick={inactive ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        width: '100%', padding: '8px 14px',
        border: 'none', background: 'transparent', cursor: inactive ? 'default' : 'pointer',
        color: disabled ? 'rgba(255,255,255,0.25)' : loading ? 'var(--text-muted)' : accent ? accent : 'var(--text)',
        fontSize: 12, textAlign: 'left',
        transition: 'background 0.12s',
        opacity: loading ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!inactive) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ display: 'flex', flexShrink: 0, opacity: disabled ? 0.3 : 1 }}>{icon}</span>
      {label}
      {chevron && <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.4 }} />}
      {disabled && <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.35, fontStyle: 'italic' }}>soon</span>}
    </button>
  );
}

// ─── Annotation popup action button ──────────────────────────────────────────

function AnnotationActionBtn({ label, icon, onClick, onMouseDown }) {
  return (
    <button
      onMouseDown={onMouseDown}
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
        border: 'none', background: 'transparent',
        color: 'var(--text-muted)', fontSize: 11, fontWeight: 500,
        flex: 1, transition: 'background 0.13s, color 0.13s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'var(--text)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
    >
      {icon} {label}
    </button>
  );
}

// ─── Loading / error states ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ color: '#aaa', fontSize: 13, marginTop: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
      Loading PDF…
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{
      color: '#f87171', fontSize: 13, marginTop: 60, textAlign: 'center',
      background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
      borderRadius: 10, padding: '24px 32px', maxWidth: 360,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Could not load PDF</div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>{message}</div>
    </div>
  );
}
