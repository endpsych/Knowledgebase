/* """
src/pages/knowledge-base/LiteratureTab.jsx
------------------------------------------
Literature & Papers tab for the Knowledge Base page.
A reference manager: add papers, track reading status, filter by
tags/status, view full details, copy APA/BibTeX citations.
""" */

import { useState, useMemo, useEffect } from 'react';
import { BookOpen, Plus, Search, X, Copy, Edit2, Trash2, ExternalLink, FileText, FolderOpen, AlertCircle, BookMarked, GitBranch, LayoutList, Share2 } from 'lucide-react';
import PdfReader from './PdfReader';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACC = '#38bdf8'; // sky-400 — literature theme colour

const STATUS = {
  'to-read':    { label: 'To Read',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  'reading':    { label: 'Reading',    color: '#38bdf8', bg: 'rgba(56,189,248,0.1)'  },
  'read':       { label: 'Read',       color: '#34d399', bg: 'rgba(52,211,153,0.1)'  },
  'referenced': { label: 'Referenced', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
};

const SORT_OPTIONS = [
  { value: 'addedAt-desc', label: 'Newest added'  },
  { value: 'addedAt-asc',  label: 'Oldest added'  },
  { value: 'year-desc',    label: 'Year (newest)' },
  { value: 'year-asc',     label: 'Year (oldest)' },
  { value: 'title-asc',    label: 'Title A → Z'   },
];

const PRESET_TAGS = [
  'spatial-rotation', 'mental-rotation', 'psychometrics', 'IRT', 'CTT',
  'validity', 'reliability', 'cognitive-assessment', 'factor-analysis',
  'measurement', 'test-development', 'normative-data', 'construct-validity',
  'vandenberg', 'item-generation', 'DIF', 'structural-equation',
  'confirmatory-factor', 'exploratory-factor', 'working-memory', 'intelligence',
];

export const SAMPLE_PAPERS = [
  {
    id: 'seed-1',
    title: 'Mental Rotation of Three-Dimensional Objects',
    authors: 'Shepard, R. N., Metzler, J.',
    year: 1971, journal: 'Science',
    doi: '10.1126/science.171.3972.701', url: '', arxivId: '',
    abstract: 'The time required to mentally rotate three-dimensional objects increases linearly with the angle of rotation between object pairs, providing evidence for an analogue mental rotation process.',
    tags: ['mental-rotation', 'spatial-rotation', 'cognitive-assessment'],
    status: 'read',
    notes: 'Foundational study establishing mental rotation as an analogue process.',
    filePath: '', addedAt: 1700000000000,
  },
  {
    id: 'seed-2',
    title: 'The Vandenberg & Kuse Mental Rotations Test: An Update and Partial Reanalysis',
    authors: 'Peters, M., Chisholm, P., Laeng, B.',
    year: 1995, journal: 'Perceptual and Motor Skills',
    doi: '10.2466/pms.1995.81.2.635', url: '', arxivId: '',
    abstract: 'Reanalysis of the Vandenberg & Kuse Mental Rotations Test providing updated norms and a partial factor structure analysis.',
    tags: ['vandenberg', 'mental-rotation', 'psychometrics', 'normative-data'],
    status: 'referenced',
    notes: 'Key normative reference for our item generator validation.',
    filePath: '', addedAt: 1700000001000,
  },
  {
    id: 'seed-3',
    title: 'A Meta-Analysis of Sex Differences in Mental Rotation Ability',
    authors: 'Voyer, D., Voyer, S., Bryden, M. P.',
    year: 1995, journal: 'Psychological Bulletin',
    doi: '10.1037/0033-2909.117.2.250', url: '', arxivId: '',
    abstract: 'Meta-analytic review of 286 studies on sex differences in spatial abilities with particular attention to mental rotation tasks.',
    tags: ['mental-rotation', 'psychometrics', 'validity', 'normative-data'],
    status: 'read',
    notes: 'Important for normative data considerations.',
    filePath: '', addedAt: 1700000002000,
  },
  {
    id: 'seed-4',
    title: 'Item Response Theory for Psychologists',
    authors: 'Embretson, S. E., Reise, S. P.',
    year: 2000, journal: 'Lawrence Erlbaum Associates',
    doi: '', url: '', arxivId: '',
    abstract: 'Comprehensive introduction to item response theory models and their application in psychological measurement.',
    tags: ['IRT', 'psychometrics', 'measurement', 'test-development'],
    status: 'reading',
    notes: 'Chapter 4 most relevant for difficulty calibration.',
    filePath: '', addedAt: 1700000003000,
  },
  {
    id: 'seed-5',
    title: 'Automatic Item Generation: A More Efficient Process for Developing Location-Based Items for Cognitive Tests',
    authors: 'Gierl, M. J., Lai, H., Turner, S. R.',
    year: 2012, journal: 'Applied Psychological Measurement',
    doi: '10.1177/0146621612450900', url: '', arxivId: '',
    abstract: 'Describes an automatic item generation approach for developing cognitive test items based on the cognitive design system framework.',
    tags: ['item-generation', 'cognitive-assessment', 'test-development'],
    status: 'to-read',
    notes: '',
    filePath: '', addedAt: 1700000004000,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAPA(p) {
  const authors = p.authors || 'Unknown Author';
  const year    = p.year    || 'n.d.';
  const doi     = p.doi ? ` https://doi.org/${p.doi}` : (p.url ? ` ${p.url}` : '');
  return `${authors} (${year}). ${p.title}.${p.journal ? ' ' + p.journal + '.' : ''}${doi}`;
}

function formatBibTeX(p) {
  const firstAuthorSurname = (p.authors || 'author').split(',')[0].trim().replace(/\s+/g, '_');
  const key = `${firstAuthorSurname}_${p.year || 'nd'}`;
  return [
    `@article{${key},`,
    `  author  = {${p.authors  || ''}},`,
    `  title   = {${p.title   || ''}},`,
    `  journal = {${p.journal  || ''}},`,
    `  year    = {${p.year    || ''}},`,
    p.doi ? `  doi     = {${p.doi}},` : null,
    p.url ? `  url     = {${p.url}},` : null,
    `}`,
  ].filter(Boolean).join('\n');
}

const EMPTY_FORM = {
  title: '', authors: '', year: '', journal: '',
  doi: '', url: '', arxivId: '', abstract: '',
  tags: [], status: 'to-read', notes: '', filePath: '',
};

// ─── Citation lineage visualization ───────────────────────────────────────────

function makeDummyRefs(paper) {
  const tag = (paper.tags || [])[0] || 'spatial cognition';
  const y   = paper.year || 2000;
  return [
    { id: 'r1', title: `Origins of ${tag} research`,      authors: 'Cooper & Shepard', year: y - 18, relation: 'foundational' },
    { id: 'r2', title: `Psychometric models in ${tag}`,   authors: 'Linn & Petersen',  year: y - 12, relation: 'methodology' },
    { id: 'r3', title: `Neural correlates of ${tag}`,     authors: 'Kosslyn et al.',   year: y - 8,  relation: 'theoretical' },
    { id: 'r4', title: `Individual differences in ${tag}`,authors: 'Peters & Battista', year: y - 5,  relation: 'empirical'   },
    { id: 'r5', title: `Measurement invariance in ${tag}`,authors: 'Vandenberg & Kuse', year: y - 3,  relation: 'measurement' },
    { id: 'r6', title: `Item generation for ${tag} tests`,authors: 'Bejar et al.',      year: y - 1,  relation: 'applied'     },
  ];
}

const RELATION_COLORS = {
  foundational: '#a78bfa',
  methodology:  '#38bdf8',
  theoretical:  '#34d399',
  empirical:    '#fb923c',
  measurement:  '#f472b6',
  applied:      '#fde68a',
};

// Normalize a Crossref reference entry → { id, title, authors, year, doi }
function normalizeCrossref(r, i) {
  return {
    id:      r.DOI || r.key || String(i),
    title:   r['article-title'] || r['volume-title'] || r.unstructured?.slice(0, 60) || 'Untitled',
    authors: r.author || r['first-author']?.['family'] || '—',
    year:    r.year ? String(r.year) : '—',
    doi:     r.DOI || null,
  };
}

// Normalize a Semantic Scholar reference entry → { id, title, authors, year, doi }
function normalizeS2(r, i) {
  const p = r.citedPaper || r;
  return {
    id:      p.paperId || String(i),
    title:   p.title || 'Untitled',
    authors: (p.authors || []).map(a => a.name?.split(' ').pop()).slice(0, 2).join(', ') || '—',
    year:    p.year ? String(p.year) : '—',
    doi:     p.externalIds?.DOI || null,
  };
}

// Normalize an OpenAlex work entry → { id, title, authors, year, doi }
function normalizeOpenAlex(w, i) {
  return {
    id:      w.id || String(i),
    title:   w.title || 'Untitled',
    authors: (w.authorships || []).map(a => a.author?.display_name?.split(' ').pop()).slice(0, 2).join(', ') || '—',
    year:    w.publication_year ? String(w.publication_year) : '—',
    doi:     w.doi ? w.doi.replace('https://doi.org/', '') : null,
  };
}

// Normalize a PubMed esummary entry → { id, title, authors, year, doi }
function normalizePubMed(summary, pmid) {
  return {
    id:      pmid,
    title:   summary.title || 'Untitled',
    authors: (summary.authors || []).map(a => a.name?.split(' ').pop()).slice(0, 2).join(', ') || '—',
    year:    summary.pubdate?.slice(0, 4) || '—',
    doi:     null,
  };
}

const FETCH_METHODS = [
  { id: 'crossref',  label: 'Crossref'          },
  { id: 's2',        label: 'Semantic Scholar'  },
  { id: 'openalex',  label: 'OpenAlex'          },
  { id: 'pubmed',    label: 'PubMed'            },
];

async function fetchByMethod(doi, method) {
  if (method === 'crossref') {
    const res = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) throw new Error(`Crossref: ${res.status}`);
    const data = await res.json();
    const raw  = data?.message?.reference || [];
    if (raw.length === 0) throw new Error('Crossref found no references for this DOI');
    return { refs: raw.map(normalizeCrossref), source: 'Crossref' };
  }

  if (method === 's2') {
    const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=references.title,references.authors,references.year,references.externalIds`;
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`Semantic Scholar: ${res.status}`);
    const data = await res.json();
    const raw  = data?.references || [];
    if (raw.length === 0) throw new Error('Semantic Scholar found no references for this DOI');
    return { refs: raw.map(normalizeS2), source: 'Semantic Scholar' };
  }

  if (method === 'openalex') {
    // Step 1: get the paper and its referenced_works IDs
    const res1 = await fetch(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=referenced_works`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!res1.ok) throw new Error(`OpenAlex: ${res1.status}`);
    const data1  = await res1.json();
    const refIds = data1.referenced_works || [];
    if (refIds.length === 0) throw new Error('OpenAlex found no references for this work');
    // Step 2: batch-fetch the referenced works for titles/authors (max 200 per OpenAlex page)
    const ids  = refIds.slice(0, 200).map(u => u.replace('https://openalex.org/', '')).join('|');
    const res2 = await fetch(
      `https://api.openalex.org/works?filter=openalex_id:${ids}&select=id,title,authorships,publication_year,doi&per_page=200`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!res2.ok) throw new Error(`OpenAlex batch: ${res2.status}`);
    const data2 = await res2.json();
    const raw   = data2.results || [];
    if (raw.length === 0) throw new Error('OpenAlex returned no reference details');
    return { refs: raw.map(normalizeOpenAlex), source: 'OpenAlex' };
  }

  if (method === 'pubmed') {
    // Step 1: resolve DOI → PMID
    const searchRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(doi)}[DOI]&retmode=json`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!searchRes.ok) throw new Error(`PubMed search: ${searchRes.status}`);
    const searchData = await searchRes.json();
    const pmid = searchData?.esearchresult?.idlist?.[0];
    if (!pmid) throw new Error('PubMed: paper not found by this DOI');
    // Step 2: get reference PMIDs via elink
    const linkRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&linkname=pubmed_pubmed_refs&id=${pmid}&retmode=json`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!linkRes.ok) throw new Error(`PubMed elink: ${linkRes.status}`);
    const linkData  = await linkRes.json();
    const linksetdb = linkData?.linksets?.[0]?.linksetdbs?.find(l => l.linkname === 'pubmed_pubmed_refs');
    const refPmids  = linksetdb?.links || [];
    if (refPmids.length === 0) throw new Error('PubMed found no references for this paper');
    // Step 3: fetch summaries for all reference PMIDs
    const summaryRes = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${refPmids.join(',')}&retmode=json`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!summaryRes.ok) throw new Error(`PubMed summary: ${summaryRes.status}`);
    const summaryData = await summaryRes.json();
    const resultMap   = summaryData?.result || {};
    const refs = refPmids.filter(id => resultMap[id]).map(id => normalizePubMed(resultMap[id], id));
    if (refs.length === 0) throw new Error('PubMed returned no reference details');
    return { refs, source: 'PubMed' };
  }

  throw new Error('Unknown method');
}

function LineageModal({ paper, onClose, onUpdatePaper }) {
  // Initialise from cached data on the paper object — no auto-fetch
  const [refs,        setRefs]        = useState(paper.references     || null);
  const [source,      setSource]      = useState(paper.referencesSource || null);
  const [fetchMethod, setFetchMethod] = useState('crossref');
  const [fetching,    setFetching]    = useState(false);
  const [error,       setError]       = useState(null);
  const [viewMode,    setViewMode]    = useState('graph'); // 'graph' | 'table'

  const doFetch = async () => {
    if (!paper.doi || fetching) return;
    setFetching(true);
    setError(null);
    try {
      const result = await fetchByMethod(paper.doi, fetchMethod);
      setRefs(result.refs);
      setSource(result.source);
      onUpdatePaper({
        ...paper,
        references:          result.refs,
        referencesSource:    result.source,
        referencesFetchedAt: Date.now(),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  };

  const W = 860, H = 460;
  const mainX = 630, mainY = H / 2;
  const mainW = 190, mainH = 70;
  const refW  = 190, refH  = 52;
  const colX  = 20;

  const refNodes = (refs || []).map((r, i) => {
    const spacing = H / ((refs || []).length + 1);
    return { ...r, x: colX, y: spacing * (i + 1) };
  });

  const SOURCE_COLORS = {
    'Crossref':         '#34d399',
    'Semantic Scholar': '#38bdf8',
    'OpenAlex':         '#a78bfa',
    'PubMed':           '#fb923c',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16, padding: 28, maxWidth: 980, width: '95vw',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <GitBranch size={16} color={ACC} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', flex: 1 }}>
            Citation Lineage
            {refs && (
              <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
                {refs.length} reference{refs.length !== 1 ? 's' : ''}
              </span>
            )}
          </span>
          {source && SOURCE_COLORS[source] && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 12,
              border: `1px solid ${SOURCE_COLORS[source]}44`,
              color: SOURCE_COLORS[source],
              background: `color-mix(in srgb, ${SOURCE_COLORS[source]} 8%, transparent)`,
            }}>
              via {source}
            </span>
          )}
          {/* View mode toggle */}
          <div style={{
            display: 'flex', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden',
          }}>
            {[
              { id: 'graph', icon: Share2,      label: 'Graph' },
              { id: 'table', icon: LayoutList,  label: 'Table' },
            ].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 11px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                border: 'none',
                background: viewMode === v.id ? `color-mix(in srgb, ${ACC} 15%, transparent)` : 'transparent',
                color: viewMode === v.id ? ACC : '#64748b',
                borderRight: v.id === 'graph' ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}>
                <v.icon size={12} /> {v.label}
              </button>
            ))}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Paper identity row */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12,
          fontSize: 12, color: '#475569',
        }}>
          <span style={{ color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
            {paper.title.length > 60 ? paper.title.slice(0, 60) + '…' : paper.title}
          </span>
          {paper.doi ? (
            <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: ACC, textDecoration: 'none', flexShrink: 0 }}>
              <ExternalLink size={10} />
              {paper.doi}
            </a>
          ) : (
            <span style={{ fontSize: 11, color: '#334155' }}>No DOI</span>
          )}
        </div>

        {/* Controls toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '10px 14px', marginBottom: 14, borderRadius: 9,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569',
            textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Source
          </span>

          {FETCH_METHODS.map(m => (
            <button key={m.id} onClick={() => setFetchMethod(m.id)} style={{
              padding: '3px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600,
              border: `1px solid ${fetchMethod === m.id ? ACC + '55' : 'rgba(255,255,255,0.1)'}`,
              background: fetchMethod === m.id
                ? `color-mix(in srgb, ${ACC} 12%, transparent)` : 'transparent',
              color: fetchMethod === m.id ? ACC : '#64748b',
            }}>
              {m.label}
            </button>
          ))}

          <button onClick={doFetch} disabled={!paper.doi || fetching} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            cursor: paper.doi && !fetching ? 'pointer' : 'not-allowed',
            background: paper.doi ? `color-mix(in srgb, ${ACC} 15%, transparent)` : 'rgba(255,255,255,0.03)',
            border: `1px solid ${paper.doi ? ACC + '44' : 'rgba(255,255,255,0.07)'}`,
            color: paper.doi ? ACC : '#475569',
            opacity: fetching ? 0.6 : 1,
          }}>
            {fetching ? 'Fetching…' : refs ? 'Re-fetch' : 'Fetch References'}
          </button>

          {!paper.doi && (
            <span style={{ fontSize: 11, color: '#f87171', opacity: 0.8 }}>
              No DOI — add one via Edit to enable fetching
            </span>
          )}

          {paper.referencesFetchedAt && !error && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569' }}>
              Cached {new Date(paper.referencesFetchedAt).toLocaleDateString()} · {paper.referencesSource}
            </span>
          )}

          {error && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f87171' }}>{error}</span>
          )}
        </div>

        {/* ── Table view ── */}
        {viewMode === 'table' && (
          <div style={{
            borderRadius: 10, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.07)',
            background: '#070d1a',
          }}>
            {(!refs || refs.length === 0) ? (
              <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: '#334155' }}>
                {refs ? 'No references found for this paper.' : 'Select a source and click Fetch References.'}
              </div>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 460 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0 }}>
                      {['#', 'Year', 'Title', 'Authors', 'DOI'].map(h => (
                        <th key={h} style={{
                          padding: '9px 12px', textAlign: 'left', fontWeight: 700,
                          fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em',
                          color: '#475569', borderBottom: '1px solid rgba(255,255,255,0.07)',
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((r, i) => (
                      <tr key={r.id} style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      }}>
                        <td style={{ padding: '8px 12px', color: '#334155', width: 32, textAlign: 'center' }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b', width: 48, whiteSpace: 'nowrap' }}>
                          {r.year}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          {r.title}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {r.authors}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {r.doi ? (
                            <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 4,
                                color: ACC, textDecoration: 'none', fontSize: 11 }}>
                              <ExternalLink size={10} /> {r.doi.length > 24 ? r.doi.slice(0, 24) + '…' : r.doi}
                            </a>
                          ) : (
                            <span style={{ color: '#334155' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Graph view ── */}
        {viewMode === 'graph' && <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10,
            background: '#070d1a', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="rgba(148,163,184,0.45)" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Empty / loading state */}
          {!refs && !fetching && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#334155">
              Select a source and click Fetch References to load the citation graph.
            </text>
          )}
          {!refs && fetching && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#475569">
              Fetching references…
            </text>
          )}

          {/* Reference → main bezier paths */}
          {refNodes.map((r, i) => {
            const sx  = r.x + refW;
            const sy  = r.y;
            const ex  = mainX;
            const ey  = mainY;
            const mx  = (sx + ex) / 2;
            // Cycle through a palette for real refs (no relation type available)
            const PAL = ['#38bdf8','#34d399','#a78bfa','#fb923c','#f472b6','#fde68a'];
            const col = source === 'illustrative'
              ? (RELATION_COLORS[r.relation] || '#94a3b8')
              : PAL[i % PAL.length];
            return (
              <path
                key={r.id}
                d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
                fill="none"
                stroke={col}
                strokeWidth="1.5"
                strokeOpacity="0.4"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Reference nodes */}
          {refNodes.map((r, i) => {
            const PAL = ['#38bdf8','#34d399','#a78bfa','#fb923c','#f472b6','#fde68a'];
            const col = source === 'illustrative'
              ? (RELATION_COLORS[r.relation] || '#94a3b8')
              : PAL[i % PAL.length];
            const titleTrunc = (r.title || '').length > 28 ? r.title.slice(0, 28) + '…' : r.title;
            return (
              <g key={r.id}>
                <rect
                  x={r.x} y={r.y - refH / 2} width={refW} height={refH} rx="7"
                  fill="rgba(30,41,59,0.9)" stroke={col} strokeWidth="1" strokeOpacity="0.5"
                />
                {/* Relation label (illustrative) or year badge (real) */}
                {source === 'illustrative' ? (
                  <text x={r.x + 8} y={r.y - refH / 2 + 13}
                    fontSize="8" fill={col} fontWeight="700">
                    {r.relation?.toUpperCase()}
                  </text>
                ) : (
                  <text x={r.x + 8} y={r.y - refH / 2 + 13}
                    fontSize="8" fill={col} fontWeight="700">
                    {r.year}
                  </text>
                )}
                <text x={r.x + 8} y={r.y - 2} fontSize="9" fill="#cbd5e1" fontWeight="600">
                  {titleTrunc}
                </text>
                <text x={r.x + 8} y={r.y + 12} fontSize="8" fill="#64748b">
                  {r.authors}
                </text>
              </g>
            );
          })}

          {/* Main paper node */}
          {(() => {
            const titleLines = paper.title.length > 28
              ? [paper.title.slice(0, 28), paper.title.slice(28, 54) + (paper.title.length > 54 ? '…' : '')]
              : [paper.title];
            return (
              <>
                <rect
                  x={mainX} y={mainY - mainH / 2} width={mainW} height={mainH} rx="10"
                  fill="rgba(56,189,248,0.1)" stroke={ACC} strokeWidth="1.5"
                  filter="url(#glow)"
                />
                <text x={mainX + mainW / 2} y={mainY - mainH / 2 + 14} fontSize="9" fill={ACC}
                  fontWeight="700" textAnchor="middle">
                  THIS PAPER
                </text>
                {titleLines.map((line, i) => (
                  <text key={i} x={mainX + mainW / 2} y={mainY - 6 + i * 13}
                    fontSize="9" fill="#e2e8f0" fontWeight="600" textAnchor="middle">
                    {line}
                  </text>
                ))}
                <text x={mainX + mainW / 2} y={mainY + mainH / 2 - 9}
                  fontSize="8" fill="#64748b" textAnchor="middle">
                  {paper.authors?.split(',')[0]?.trim() || ''}{paper.year ? ` · ${paper.year}` : ''}
                </text>
              </>
            );
          })()}

          {/* "No refs" message */}
          {refs && refs.length === 0 && (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="#475569">
              No references found for this paper.
            </text>
          )}
        </svg>}
      </div>
    </div>
  );
}

// ─── Paper form modal ─────────────────────────────────────────────────────────

function PaperModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = (raw) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t]);
    setTagInput('');
  };

  const handleSave = () => {
    if (!form.title.trim()) return;
    onSave({
      ...form,
      year:     form.year ? parseInt(form.year, 10) : null,
      id:       form.id       || `p-${Date.now()}`,
      addedAt:  form.addedAt  || Date.now(),
    });
  };

  const inp = {
    style: {
      width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      color: 'var(--text)', fontSize: 13, outline: 'none',
    },
  };

  const fieldLabel = (text, req) => (
    <label style={{ display: 'block', marginBottom: 4, fontSize: 11, fontWeight: 600,
      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {text}{req && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 580, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {form.id ? 'Edit Paper' : 'Add Paper'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Title */}
          <div>
            {fieldLabel('Title', true)}
            <input {...inp} value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Paper title…" />
          </div>

          {/* Authors + Year */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
            <div>
              {fieldLabel('Authors')}
              <input {...inp} value={form.authors}
                onChange={e => set('authors', e.target.value)}
                placeholder="Smith, J., Jones, A." />
            </div>
            <div>
              {fieldLabel('Year')}
              <input {...inp} value={form.year} type="number"
                onChange={e => set('year', e.target.value)}
                placeholder="2024" />
            </div>
          </div>

          {/* Journal */}
          <div>
            {fieldLabel('Journal / Venue')}
            <input {...inp} value={form.journal}
              onChange={e => set('journal', e.target.value)}
              placeholder="Journal of Psychometrics" />
          </div>

          {/* DOI + URL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              {fieldLabel('DOI')}
              <input {...inp} value={form.doi}
                onChange={e => set('doi', e.target.value)}
                placeholder="10.xxxx/…" />
            </div>
            <div>
              {fieldLabel('URL')}
              <input {...inp} value={form.url}
                onChange={e => set('url', e.target.value)}
                placeholder="https://…" />
            </div>
          </div>

          {/* Status */}
          <div>
            {fieldLabel('Status')}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(STATUS).map(([k, s]) => (
                <button key={k} onClick={() => set('status', k)} style={{
                  padding: '4px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${form.status === k ? s.color : 'rgba(255,255,255,0.1)'}`,
                  background: form.status === k ? s.bg : 'transparent',
                  color: form.status === k ? s.color : 'var(--text-muted)',
                  fontWeight: form.status === k ? 600 : 400,
                }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            {fieldLabel('Tags')}
            {/* Applied tags */}
            {form.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {form.tags.map(t => (
                  <span key={t} style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 8px 2px 10px', borderRadius: 12,
                    background: `color-mix(in srgb, ${ACC} 12%, transparent)`,
                    border: `1px solid ${ACC}44`, fontSize: 11, color: ACC,
                  }}>
                    {t}
                    <button onClick={() => set('tags', form.tags.filter(x => x !== t))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: ACC, opacity: 0.65, lineHeight: 1, padding: 0, fontSize: 14 }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Tag input */}
            <input {...inp} value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag(tagInput))}
              placeholder="Type a tag and press Enter…" />
            {/* Preset suggestions */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
              {PRESET_TAGS.filter(t => !form.tags.includes(t)).slice(0, 14).map(t => (
                <button key={t} onClick={() => addTag(t)} style={{
                  padding: '2px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)',
                }}>
                  + {t}
                </button>
              ))}
            </div>
          </div>

          {/* Abstract */}
          <div>
            {fieldLabel('Abstract')}
            <textarea {...inp} value={form.abstract} rows={4}
              onChange={e => set('abstract', e.target.value)}
              placeholder="Paste abstract…"
              style={{ ...inp.style, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }} />
          </div>

          {/* Notes */}
          <div>
            {fieldLabel('Notes')}
            <textarea {...inp} value={form.notes} rows={3}
              onChange={e => set('notes', e.target.value)}
              placeholder="Your notes on this paper…"
              style={{ ...inp.style, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55 }} />
          </div>

          {/* PDF File */}
          <div>
            {fieldLabel('PDF File')}
            <div style={{ display: 'flex', gap: 6 }}>
              <input {...inp} value={form.filePath}
                onChange={e => set('filePath', e.target.value)}
                placeholder="Path to PDF file, or browse →"
                style={{ ...inp.style, flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
              <button
                type="button"
                onClick={async () => {
                  const path = await window.electronAPI?.selectPdf?.();
                  if (path) set('filePath', path);
                }}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500,
                }}>
                <FolderOpen size={13} /> Browse
              </button>
            </div>
            {form.filePath && (
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                {form.filePath}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!form.title.trim()} style={{
            padding: '7px 18px', borderRadius: 6, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.title.trim() ? 1 : 0.4,
          }}>
            {form.id ? 'Save Changes' : 'Add Paper'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Paper card (list row) ────────────────────────────────────────────────────

function PaperCard({ paper, selected, onClick }) {
  const s = STATUS[paper.status] || STATUS['to-read'];
  return (
    <div onClick={onClick} style={{
      padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${selected ? ACC + '55' : 'var(--border)'}`,
      background: selected
        ? `color-mix(in srgb, ${ACC} 6%, var(--bg-card))`
        : 'var(--bg-card)',
      transition: 'border-color 0.12s, background 0.12s',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 3,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {paper.title}
          </div>
          {/* Authors · year · journal */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            {paper.authors && <span>{paper.authors}</span>}
            {paper.year    && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {paper.year}</span>}
            {paper.journal && <span style={{ marginLeft: 6, opacity: 0.65 }}>· {paper.journal}</span>}
          </div>
          {/* Tags */}
          {paper.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {paper.tags.slice(0, 4).map(t => (
                <span key={t} style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  {t}
                </span>
              ))}
              {paper.tags.length > 4 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '1px 4px' }}>
                  +{paper.tags.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Status badge */}
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 12, flexShrink: 0,
          background: s.bg, color: s.color, border: `1px solid ${s.color}44`,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {s.label}
        </span>
      </div>

      {/* KB extraction badges */}
      {(() => {
        const items = [
          { count: (paper.annotations  || []).length, label: 'highlight', color: '#fde68a' },
          { count: (paper.claims       || []).length, label: 'claim',     color: '#a78bfa' },
          { count: (paper.definitions  || []).length, label: 'def',       color: '#34d399' },
          { count: (paper.events       || []).length, label: 'event',     color: '#fb923c' },
          { count: (paper.processes    || []).length, label: 'process',   color: '#38bdf8' },
        ].filter(i => i.count > 0);
        if (items.length === 0) return null;
        return (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
            {items.map(item => (
              <span key={item.label} style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                background: `color-mix(in srgb, ${item.color} 10%, transparent)`,
                border: `1px solid ${item.color}44`, color: item.color,
              }}>
                {item.count} {item.count === 1 ? item.label : item.label + 's'}
              </span>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Open PDF button ──────────────────────────────────────────────────────────

function OpenPdfButton({ filePath }) {
  const [state, setState] = useState('idle'); // idle | opening | error

  const open = async () => {
    if (!filePath) return;
    setState('opening');
    try {
      const res = await window.electronAPI?.openFile?.(filePath);
      setState(res?.ok === false ? 'error' : 'idle');
      if (res?.ok === false) setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  return (
    <button onClick={open} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
      fontSize: 12, fontWeight: 600,
      background: state === 'error' ? 'rgba(239,68,68,0.08)' : `color-mix(in srgb, ${ACC} 12%, transparent)`,
      border: `1px solid ${state === 'error' ? 'rgba(239,68,68,0.3)' : ACC + '44'}`,
      color: state === 'error' ? '#ef4444' : ACC,
      width: '100%', justifyContent: 'center',
      transition: 'all 0.15s',
    }}>
      <FileText size={13} />
      {state === 'opening' ? 'Opening…' : state === 'error' ? 'Could not open file' : 'Open PDF'}
    </button>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function PaperDetail({ paper, onEdit, onDelete, onRead, onViewLineage }) {
  const [copied, setCopied] = useState('');
  const s = paper ? (STATUS[paper.status] || STATUS['to-read']) : null;

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    });
  };

  const rowBtn = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-secondary)',
  };

  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
      {children}
    </div>
  );

  return (
    <div style={{
      width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '13px 16px 12px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          Paper Details
        </span>
        {paper && (
          <>
            <button onClick={() => onViewLineage(paper)} style={rowBtn}><GitBranch size={11} /> Lineage</button>
            <button onClick={() => onEdit(paper)} style={rowBtn}><Edit2 size={11} /> Edit</button>
          </>
        )}
      </div>

      {/* Body */}
      {!paper ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 32, gap: 10,
        }}>
          <BookOpen size={28} color="var(--text-muted)" style={{ opacity: 0.4 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
            Select a paper from the list to view its details, abstract, notes, and citation export.
          </span>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16,
            display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Status */}
            <span style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 10px',
              borderRadius: 12, background: s.bg, color: s.color,
              border: `1px solid ${s.color}44`,
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              {s.label}
            </span>

            {/* Title */}
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45 }}>
              {paper.title}
            </div>

            {/* Authors / year / journal */}
            <div>
              {paper.authors && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>
                  {paper.authors}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {paper.year    && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{paper.year}</span>}
                {paper.journal && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {paper.journal}</span>}
              </div>
            </div>

            {/* DOI / URL */}
            {(paper.doi || paper.url) && (
              <div>
                {paper.doi && (
                  <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: ACC, textDecoration: 'none' }}>
                    <ExternalLink size={10} /> doi.org/{paper.doi}
                  </a>
                )}
                {!paper.doi && paper.url && (
                  <a href={paper.url} target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: ACC, textDecoration: 'none' }}>
                    <ExternalLink size={10} /> Open URL
                  </a>
                )}
              </div>
            )}

            {/* PDF file */}
            <div>
              <SectionLabel>PDF File</SectionLabel>
              {paper.filePath ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    wordBreak: 'break-all', lineHeight: 1.5,
                    padding: '6px 8px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    {paper.filePath}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onRead?.(paper)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      background: `color-mix(in srgb, ${ACC} 12%, transparent)`,
                      border: `1px solid ${ACC}44`, color: ACC,
                      justifyContent: 'center',
                    }}>
                      <BookMarked size={12} /> Read in App
                    </button>
                    <OpenPdfButton filePath={paper.filePath} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  <AlertCircle size={11} style={{ opacity: 0.5 }} />
                  No file linked — click Edit to browse for a PDF.
                </div>
              )}
            </div>

            {/* Tags */}
            {paper.tags.length > 0 && (
              <div>
                <SectionLabel>Tags</SectionLabel>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {paper.tags.map(t => (
                    <span key={t} style={{
                      fontSize: 11, padding: '2px 9px', borderRadius: 10,
                      background: `color-mix(in srgb, ${ACC} 10%, transparent)`,
                      border: `1px solid ${ACC}44`, color: ACC,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Abstract */}
            {paper.abstract && (
              <div>
                <SectionLabel>Abstract</SectionLabel>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  {paper.abstract}
                </div>
              </div>
            )}

            {/* Notes */}
            {paper.notes && (
              <div>
                <SectionLabel>Notes</SectionLabel>
                <div style={{
                  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                  background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderLeft: `3px solid ${ACC}66`,
                }}>
                  {paper.notes}
                </div>
              </div>
            )}

            {/* KB Extractions summary */}
            {(paper.claims?.length || paper.definitions?.length || paper.events?.length || paper.processes?.length) ? (
              <div>
                <SectionLabel>KB Extractions</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(paper.claims || []).map(cl => (
                    <div key={cl.id} style={{
                      padding: '6px 9px', borderRadius: 6, fontSize: 11,
                      border: '1px solid #a78bfa33', background: 'color-mix(in srgb, #a78bfa 5%, transparent)',
                      display: 'flex', gap: 6, alignItems: 'flex-start',
                    }}>
                      <span style={{ color: '#a78bfa', fontWeight: 700, flexShrink: 0, fontSize: 10 }}>CLAIM</span>
                      <span style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {cl.text.length > 80 ? cl.text.slice(0, 80) + '…' : cl.text}
                      </span>
                      {cl.confidence && (
                        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, color: '#a78bfa', opacity: 0.7 }}>
                          {cl.confidence}
                        </span>
                      )}
                    </div>
                  ))}
                  {(paper.definitions || []).map(d => (
                    <div key={d.id} style={{
                      padding: '6px 9px', borderRadius: 6, fontSize: 11,
                      border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 5%, transparent)',
                      display: 'flex', gap: 6, alignItems: 'flex-start',
                    }}>
                      <span style={{ color: '#34d399', fontWeight: 700, flexShrink: 0, fontSize: 10 }}>DEF</span>
                      <span style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        <em>{d.term}</em> — {d.definition.length > 60 ? d.definition.slice(0, 60) + '…' : d.definition}
                      </span>
                    </div>
                  ))}
                  {(paper.events || []).map(ev => (
                    <div key={ev.id} style={{
                      padding: '6px 9px', borderRadius: 6, fontSize: 11,
                      border: '1px solid #fb923c33', background: 'color-mix(in srgb, #fb923c 5%, transparent)',
                      display: 'flex', gap: 6,
                    }}>
                      <span style={{ color: '#fb923c', fontWeight: 700, flexShrink: 0, fontSize: 10 }}>EVENT</span>
                      <span style={{ color: 'var(--text-muted)' }}>{ev.name}</span>
                    </div>
                  ))}
                  {(paper.processes || []).map(pr => (
                    <div key={pr.id} style={{
                      padding: '6px 9px', borderRadius: 6, fontSize: 11,
                      border: '1px solid #38bdf833', background: 'color-mix(in srgb, #38bdf8 5%, transparent)',
                      display: 'flex', gap: 6,
                    }}>
                      <span style={{ color: '#38bdf8', fontWeight: 700, flexShrink: 0, fontSize: 10 }}>PROCESS</span>
                      <span style={{ color: 'var(--text-muted)' }}>{pr.name}{pr.steps?.length ? ` · ${pr.steps.length} steps` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Export citations */}
            <div>
              <SectionLabel>Export Citation</SectionLabel>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => copy(formatAPA(paper), 'APA')} style={rowBtn}>
                  <Copy size={10} />
                  {copied === 'APA' ? '✓ Copied' : 'APA'}
                </button>
                <button onClick={() => copy(formatBibTeX(paper), 'BibTeX')} style={rowBtn}>
                  <Copy size={10} />
                  {copied === 'BibTeX' ? '✓ Copied' : 'BibTeX'}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            <button onClick={() => onDelete(paper.id)} style={{
              ...rowBtn,
              color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)',
              background: 'rgba(239,68,68,0.05)', width: '100%', justifyContent: 'center',
            }}>
              <Trash2 size={11} /> Remove from Library
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function LiteratureTab({ papers, onPapersChange, focusPaperId }) {
  const [selectedId,   setSelectedId]   = useState(null);

  // When another tab navigates here with a specific paper, select it
  useEffect(() => {
    if (focusPaperId) setSelectedId(focusPaperId);
  }, [focusPaperId]);
  const [showModal,    setShowModal]    = useState(false);
  const [editingPaper, setEditingPaper] = useState(null);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTags,   setFilterTags]   = useState([]);
  const [sort,         setSort]         = useState('addedAt-desc');
  const [readerPaper,  setReaderPaper]  = useState(null);
  const [lineagePaper, setLineagePaper] = useState(null);

  const selected = papers.find(p => p.id === selectedId) ?? null;

  // All tags present in the library
  const allTags = useMemo(() => {
    const s = new Set();
    papers.forEach(p => p.tags.forEach(t => s.add(t)));
    return [...s].sort();
  }, [papers]);

  // Filtered + sorted list
  const visible = useMemo(() => {
    let list = papers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.authors   || '').toLowerCase().includes(q) ||
        (p.journal   || '').toLowerCase().includes(q) ||
        p.tags.some(t => t.includes(q)) ||
        (p.abstract  || '').toLowerCase().includes(q) ||
        (p.notes     || '').toLowerCase().includes(q) ||
        (p.annotations || []).some(a =>
          (a.text    || '').toLowerCase().includes(q) ||
          (a.comment || '').toLowerCase().includes(q)
        )
      );
    }
    if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus);
    if (filterTags.length > 0)  list = list.filter(p => filterTags.every(t => p.tags.includes(t)));

    const [field, dir] = sort.split('-');
    return [...list].sort((a, b) => {
      let va = a[field], vb = b[field];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [papers, search, filterStatus, filterTags, sort]);

  // Status counts (for chips)
  const counts = useMemo(() => {
    const c = { all: papers.length };
    Object.keys(STATUS).forEach(k => { c[k] = papers.filter(p => p.status === k).length; });
    return c;
  }, [papers]);

  const savePaper = (p) => {
    onPapersChange(prev => {
      const exists = prev.some(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev];
    });
    setShowModal(false);
    setEditingPaper(null);
    setSelectedId(p.id);
    if (readerPaper?.id === p.id) setReaderPaper(p);
  };

  const updatePaper = (p) => {
    onPapersChange(prev => prev.map(x => x.id === p.id ? p : x));
    if (readerPaper?.id === p.id) setReaderPaper(p);
    if (selectedId   === p.id)   setSelectedId(p.id);
  };

  const deletePaper = (id) => {
    onPapersChange(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const openEdit = (p) => { setEditingPaper(p); setShowModal(true); };
  const openAdd  = ()  => { setEditingPaper(null); setShowModal(true); };

  const toggleTagFilter = (t) =>
    setFilterTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const inputBase = {
    padding: '7px 12px', borderRadius: 7,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text)', fontSize: 13, outline: 'none',
  };

  // ── Reader mode — full-width, hides the library ──────────────────────────
  if (readerPaper) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <PdfReader
          paper={readerPaper}
          onClose={() => setReaderPaper(null)}
          onUpdate={updatePaper}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search title, author, tag, abstract, notes, annotations…"
            style={{ ...inputBase, width: '100%', paddingLeft: 30, boxSizing: 'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2,
            }}>
              <X size={12} />
            </button>
          )}
        </div>
        {/* Sort */}
        <select value={sort} onChange={e => setSort(e.target.value)}
          style={{ ...inputBase, cursor: 'pointer' }}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {/* Add Paper */}
        <button onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 16px', borderRadius: 7, cursor: 'pointer',
          fontWeight: 600, fontSize: 13, background: ACC, border: 'none', color: '#0f172a',
        }}>
          <Plus size={14} /> Add Paper
        </button>
      </div>

      {/* ── Status filter chips ── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          ['all', 'All', '#94a3b8'],
          ...Object.entries(STATUS).map(([k, s]) => [k, s.label, s.color]),
        ].map(([k, lbl, col]) => (
          <button key={k} onClick={() => setFilterStatus(k)} style={{
            padding: '4px 13px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
            border: `1px solid ${filterStatus === k ? col : 'rgba(255,255,255,0.1)'}`,
            background: filterStatus === k
              ? `color-mix(in srgb, ${col} 12%, transparent)` : 'transparent',
            color: filterStatus === k ? col : 'var(--text-muted)',
            fontWeight: filterStatus === k ? 600 : 400,
          }}>
            {lbl}
            {counts[k] != null && (
              <span style={{ marginLeft: 5, opacity: 0.7 }}>{counts[k]}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tag filter bar ── */}
      {allTags.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
          }}>
            Tags
          </span>
          <div style={{
            display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1,
          }}>
            {allTags.map(t => {
              const cnt    = papers.filter(p => p.tags.includes(t)).length;
              const active = filterTags.includes(t);
              return (
                <button key={t} onClick={() => toggleTagFilter(t)} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 12, cursor: 'pointer', fontSize: 11,
                  border: `1px solid ${active ? ACC + '55' : 'rgba(255,255,255,0.08)'}`,
                  background: active
                    ? `color-mix(in srgb, ${ACC} 12%, transparent)`
                    : 'rgba(255,255,255,0.03)',
                  color: active ? ACC : 'var(--text-muted)',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.12s',
                }}>
                  {t}
                  <span style={{ opacity: 0.55, fontSize: 10 }}>{cnt}</span>
                </button>
              );
            })}
          </div>
          {filterTags.length > 0 && (
            <button onClick={() => setFilterTags([])} style={{
              flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <X size={11} /> Clear
            </button>
          )}
        </div>
      )}

      {/* ── Main area: paper list + detail panel ── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* Paper list */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.length === 0 ? (
            <div style={{
              padding: '48px 20px', textAlign: 'center',
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            }}>
              <BookOpen size={30} color="var(--text-muted)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                {papers.length === 0
                  ? 'No papers yet — click Add Paper to get started.'
                  : 'No papers match your current filters.'}
              </div>
            </div>
          ) : (
            visible.map(p => (
              <PaperCard key={p.id} paper={p}
                selected={selectedId === p.id}
                onClick={() => setSelectedId(selectedId === p.id ? null : p.id)} />
            ))
          )}
        </div>

        {/* Detail panel — always visible */}
        <PaperDetail
          paper={selected}
          onEdit={openEdit}
          onDelete={deletePaper}
          onRead={p => setReaderPaper(p)}
          onViewLineage={p => setLineagePaper(p)}
        />
      </div>

      {/* ── Paper form modal ── */}
      {showModal && (
        <PaperModal
          initial={editingPaper ?? EMPTY_FORM}
          onSave={savePaper}
          onClose={() => { setShowModal(false); setEditingPaper(null); }} />
      )}

      {/* ── Lineage modal ── */}
      {lineagePaper && (
        <LineageModal
          paper={lineagePaper}
          onClose={() => setLineagePaper(null)}
          onUpdatePaper={p => { updatePaper(p); setLineagePaper(p); }}
        />
      )}
    </div>
  );
}
