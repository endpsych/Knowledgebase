/* """
src/pages/knowledge-base/KnowledgeStoreTab.jsx
-----------------------------------------------
Knowledge Store tab — inventory and configuration of the KB storage layer.
Seven sections: document store, vector indexes, metadata database, graph
entity store, knowledge unit diversity, chunk inventory, and a computed
readiness score card at the top.
""" */

import { useState, useMemo } from 'react';
import {
  Database, FolderOpen, Layers, GitBranch, LayoutGrid,
  Package, CheckCircle2, AlertCircle, Circle, Plus,
  ChevronDown, ChevronRight, Trash2, X,
  Lightbulb, BookMarked, CalendarDays, GitFork, Highlighter,
} from 'lucide-react';

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACC = '#34d399'; // emerald-400
const cr  = (a) => `rgba(52,211,153,${a})`;

// ─── Static option lists ──────────────────────────────────────────────────────

const DOC_STORE_TYPES = [
  'Filesystem', 'Amazon S3', 'Google Cloud Storage',
  'Azure Blob Storage', 'MinIO', 'Custom / Other',
];

const VECTOR_BACKENDS = [
  'Chroma', 'Pinecone', 'Qdrant', 'FAISS',
  'Weaviate', 'pgvector', 'Redis', 'Other',
];

const DISTANCE_METRICS = ['cosine', 'euclidean', 'dot-product'];

const DB_BACKENDS = [
  'PostgreSQL', 'SQLite', 'DuckDB', 'MongoDB', 'MySQL', 'Other',
];

const GRAPH_BACKENDS = [
  'Neo4j', 'PostgreSQL (entity tables)', 'RDF triple store (Fuseki / Virtuoso)',
  'Amazon Neptune', 'Memgraph', 'Other',
];

const ENTITY_TYPE_LIST = [
  'Person', 'Organization', 'Project', 'Process',
  'Dataset', 'Model', 'Policy', 'Test',
  'Construct', 'Risk', 'Metric', 'Decision',
  'Event', 'Location', 'Concept', 'Document',
];

const UNIT_TYPES = [
  { key: 'documents',     label: 'Documents',     desc: 'Raw or parsed full-text documents'       },
  { key: 'entities',      label: 'Entities',      desc: 'Named entities extracted from text'      },
  { key: 'facts',         label: 'Facts',         desc: 'Atomic subject–predicate–object triples' },
  { key: 'relationships', label: 'Relationships', desc: 'Typed edges between entities'            },
  { key: 'definitions',   label: 'Definitions',   desc: 'Term glossary entries and definitions'   },
  { key: 'events',        label: 'Events',        desc: 'Dated occurrences and incidents'         },
  { key: 'processes',     label: 'Processes',     desc: 'Multi-step workflows and procedures'     },
  { key: 'summaries',     label: 'Summaries',     desc: 'Auto-generated or manual summaries'      },
];

const CHUNK_STRATEGIES = [
  { value: 'section-aware', label: 'Section-aware (heading-based)' },
  { value: 'fixed-size',    label: 'Fixed-size with overlap'       },
  { value: 'semantic',      label: 'Semantic splitting'            },
  { value: 'mixed',         label: 'Mixed strategy'                },
];

const META_FIELDS = [
  { key: 'title',           label: 'title'           },
  { key: 'source',          label: 'source'          },
  { key: 'author',          label: 'author'          },
  { key: 'date',            label: 'date'            },
  { key: 'status',          label: 'status'          },
  { key: 'confidentiality', label: 'confidentiality' },
  { key: 'docType',         label: 'doc_type'        },
  { key: 'owner',           label: 'owner'           },
  { key: 'region',          label: 'region'          },
  { key: 'language',        label: 'language'        },
  { key: 'version',         label: 'version'         },
  { key: 'tags',            label: 'tags'            },
];

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  docStore: {
    type: 'Filesystem', location: '', docCount: '',
    hasParsedText: false, hasVersionHistory: false, hasMetadata: false,
    status: 'not-configured', notes: '',
  },
  vectorIndexes: [],
  metadataDB: {
    backend: 'PostgreSQL', connectionUri: '', recordCount: '',
    schemaFields: Object.fromEntries(META_FIELDS.map(f => [f.key, false])),
    status: 'not-configured', notes: '',
  },
  graphStore: {
    backend: 'Neo4j', connectionUri: '',
    entityTypes: ENTITY_TYPE_LIST.map(n => ({ name: n, count: '', enabled: false })),
    status: 'not-configured', notes: '',
  },
  unitTypes: Object.fromEntries(UNIT_TYPES.map(u => [u.key, false])),
  chunking: {
    strategy: 'fixed-size', chunkSize: 512, overlap: 64,
    estimatedChunkCount: '', estimatedDocCount: '', notes: '',
  },
};

const NEW_VECTOR_INDEX = () => ({
  id: `vi-${Date.now()}`,
  backend: 'Chroma', collectionName: '', embeddingModel: '',
  dimensions: '', distanceMetric: 'cosine', chunkCount: '',
  status: 'not-configured', notes: '',
});

// ─── Readiness score ──────────────────────────────────────────────────────────

function computeReadiness(s) {
  const metaFieldCount = Object.values(s.metadataDB.schemaFields).filter(Boolean).length;
  const unitCount      = Object.values(s.unitTypes).filter(Boolean).length;
  const criteria = [
    {
      label:   'Document store populated',
      met:     s.docStore.status === 'populated',
      partial: s.docStore.status === 'configured',
    },
    {
      label:   'Vector index present',
      met:     s.vectorIndexes.some(v => v.status === 'indexed'),
      partial: s.vectorIndexes.length > 0,
    },
    {
      label:   'Metadata schema defined (≥ 5 fields)',
      met:     s.metadataDB.status !== 'not-configured' && metaFieldCount >= 5,
      partial: s.metadataDB.status !== 'not-configured' && metaFieldCount >= 1,
    },
    {
      label:   'Entity store detected',
      met:     s.graphStore.status === 'populated',
      partial: s.graphStore.status === 'configured',
    },
    {
      label:   'Knowledge unit diversity ≥ 3 types',
      met:     unitCount >= 3,
      partial: unitCount >= 1,
    },
    {
      label:   'Chunking strategy configured',
      met:     s.chunking.strategy != null && +s.chunking.chunkSize > 0,
      partial: s.chunking.strategy != null,
    },
    {
      label:   'Metadata has confidentiality + status fields',
      met:     s.metadataDB.schemaFields.confidentiality && s.metadataDB.schemaFields.status,
      partial: s.metadataDB.schemaFields.confidentiality || s.metadataDB.schemaFields.status,
    },
  ];
  const score = criteria.reduce((sum, c) => sum + (c.met ? 1 : c.partial ? 0.5 : 0), 0);
  return { criteria, score, max: criteria.length };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const STATUS_OPTS = [
  { value: 'not-configured', label: 'Not configured', color: '#64748b' },
  { value: 'configured',     label: 'Configured',     color: '#fbbf24' },
  { value: 'populated',      label: 'Populated',      color: ACC       },
];

const VECTOR_STATUS_OPTS = [
  { value: 'not-configured', label: 'Not configured', color: '#64748b' },
  { value: 'configured',     label: 'Configured',     color: '#fbbf24' },
  { value: 'indexed',        label: 'Indexed',        color: ACC       },
];

function statusColor(v, opts = STATUS_OPTS) {
  return (opts.find(o => o.value === v) || opts[0]).color;
}

function StatusDot({ value, opts = STATUS_OPTS }) {
  const col = statusColor(value, opts);
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: col, flexShrink: 0, boxShadow: `0 0 5px ${col}88`,
    }} />
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.09em', color: 'var(--text-muted)', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function FieldRow({ label, children, half }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: half ? 'span 1' : 'span 2' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputSx = {
  padding: '6px 10px', borderRadius: 6,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box',
};

const selectSx = { ...inputSx, cursor: 'pointer' };

function StatusRow({ value, opts = STATUS_OPTS, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '3px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
          border: `1px solid ${value === o.value ? o.color : 'rgba(255,255,255,0.1)'}`,
          background: value === o.value ? `${o.color}18` : 'transparent',
          color: value === o.value ? o.color : 'var(--text-muted)',
          fontWeight: value === o.value ? 600 : 400,
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Collapsible section card ─────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, status, statusOpts = STATUS_OPTS,
                        badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const col = status ? statusColor(status, statusOpts) : null;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: cr(0.1), display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={15} color={ACC} />
        </div>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
          {title}
        </span>
        {status && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
            background: `${col}18`, color: col, border: `1px solid ${col}44`,
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            {(statusOpts.find(o => o.value === status) || statusOpts[0]).label}
          </span>
        )}
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
            background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}`,
          }}>
            {badge}
          </span>
        )}
        {open
          ? <ChevronDown size={15} color="var(--text-muted)" />
          : <ChevronRight size={15} color="var(--text-muted)" />}
      </button>

      {/* Body */}
      {open && (
        <div style={{
          padding: '0 18px 18px',
          borderTop: '1px solid var(--border)',
          paddingTop: 16,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Vector index modal ───────────────────────────────────────────────────────

function VectorIndexModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 500, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.collectionName ? 'Edit Vector Index' : 'Add Vector Index'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '18px 22px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          <FieldRow label="Backend" half>
            <select style={selectSx} value={form.backend}
              onChange={e => set('backend', e.target.value)}>
              {VECTOR_BACKENDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="Collection Name" half>
            <input style={inputSx} value={form.collectionName}
              onChange={e => set('collectionName', e.target.value)}
              placeholder="e.g. psychometrics_kb" />
          </FieldRow>

          <FieldRow label="Embedding Model" half>
            <input style={inputSx} value={form.embeddingModel}
              onChange={e => set('embeddingModel', e.target.value)}
              placeholder="e.g. text-embedding-3-small" />
          </FieldRow>

          <FieldRow label="Dimensions" half>
            <input style={inputSx} type="number" value={form.dimensions}
              onChange={e => set('dimensions', e.target.value)}
              placeholder="e.g. 1536" />
          </FieldRow>

          <FieldRow label="Distance Metric" half>
            <select style={selectSx} value={form.distanceMetric}
              onChange={e => set('distanceMetric', e.target.value)}>
              {DISTANCE_METRICS.map(m => <option key={m}>{m}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="Chunk Count" half>
            <input style={inputSx} type="number" value={form.chunkCount}
              onChange={e => set('chunkCount', e.target.value)}
              placeholder="estimated chunk count" />
          </FieldRow>

          <FieldRow label="Status">
            <StatusRow value={form.status} opts={VECTOR_STATUS_OPTS}
              onChange={v => set('status', v)} />
          </FieldRow>

          <FieldRow label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 56 }} value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes…" />
          </FieldRow>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
          }}>Cancel</button>
          <button onClick={() => { if (form.collectionName.trim()) onSave(form); }} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.collectionName.trim() ? 1 : 0.4,
          }}>Save Index</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

// ─── KB type config ───────────────────────────────────────────────────────────

const KB_TYPES = [
  { key: 'all',         label: 'All',       color: '#94a3b8', Icon: null         },
  { key: 'claims',      label: 'Claims',    color: '#a78bfa', Icon: Lightbulb    },
  { key: 'definitions', label: 'Defs',      color: '#34d399', Icon: BookMarked   },
  { key: 'events',      label: 'Events',    color: '#fb923c', Icon: CalendarDays },
  { key: 'processes',   label: 'Processes', color: '#38bdf8', Icon: GitFork      },
];

export default function KnowledgeStoreTab({ papers = [] }) {
  const [s, setS] = useState(DEFAULT_STATE);
  const [viModal, setViModal] = useState(null); // null | 'new' | {index object}
  const [kbFilter, setKbFilter] = useState('all');

  // Aggregate all KB items across all papers
  const kbItems = useMemo(() => {
    const items = [];
    papers.forEach(paper => {
      const ref = [
        paper.authors ? paper.authors.split(',')[0].trim() : null,
        paper.year,
      ].filter(Boolean).join(', ');
      const source = { title: paper.title, ref, id: paper.id };
      (paper.claims      || []).forEach(cl => items.push({ type: 'claims',      id: cl.id, text: cl.text, sub: cl.confidence, page: cl.sourcePage, source }));
      (paper.definitions || []).forEach(d  => items.push({ type: 'definitions', id: d.id,  text: d.term, sub: d.definition,   page: d.sourcePage,  source }));
      (paper.events      || []).forEach(ev => items.push({ type: 'events',      id: ev.id, text: ev.name, sub: ev.outcome,    page: ev.sourcePage, source }));
      (paper.processes   || []).forEach(pr => items.push({ type: 'processes',   id: pr.id, text: pr.name, sub: pr.steps?.join(' → '), page: pr.sourcePage, source }));
    });
    return items;
  }, [papers]);

  const filteredKbItems = kbFilter === 'all' ? kbItems : kbItems.filter(i => i.type === kbFilter);

  const kbCounts = useMemo(() => {
    const c = { all: kbItems.length };
    KB_TYPES.slice(1).forEach(t => { c[t.key] = kbItems.filter(i => i.type === t.key).length; });
    return c;
  }, [kbItems]);

  const set = (section, patch) =>
    setS(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }));

  const readiness = computeReadiness(s);

  // ── Vector index helpers ─────────────────────────────────────────────────
  const saveVectorIndex = (vi) => {
    setS(prev => {
      const exists = prev.vectorIndexes.some(x => x.id === vi.id);
      return {
        ...prev,
        vectorIndexes: exists
          ? prev.vectorIndexes.map(x => x.id === vi.id ? vi : x)
          : [...prev.vectorIndexes, vi],
      };
    });
    setViModal(null);
  };

  const deleteVectorIndex = (id) =>
    setS(prev => ({ ...prev, vectorIndexes: prev.vectorIndexes.filter(x => x.id !== id) }));

  // ── Graph entity type helpers ────────────────────────────────────────────
  const setEntityType = (name, patch) =>
    setS(prev => ({
      ...prev,
      graphStore: {
        ...prev.graphStore,
        entityTypes: prev.graphStore.entityTypes.map(
          et => et.name === name ? { ...et, ...patch } : et
        ),
      },
    }));

  const scoreColor = readiness.score >= readiness.max * 0.85 ? ACC
    : readiness.score >= readiness.max * 0.5 ? '#fbbf24'
    : '#ef4444';

  const scoreLabel = readiness.score >= readiness.max * 0.85 ? 'Ready'
    : readiness.score >= readiness.max * 0.5 ? 'Partial'
    : 'Not Ready';

  const tinyBtn = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-secondary)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Manually Curated Knowledge ── */}
      <SectionCard
        icon={Highlighter}
        title="Manually Curated Knowledge"
        badge={kbItems.length > 0 ? `${kbItems.length} item${kbItems.length !== 1 ? 's' : ''}` : 'empty'}
        defaultOpen={kbItems.length > 0}
      >
        {kbItems.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No KB items extracted yet. Open a paper in the Literature tab, highlight text, and use the KB actions to create claims, definitions, events, or processes.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stat row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {KB_TYPES.slice(1).map(t => {
                const cnt = kbCounts[t.key];
                if (!cnt) return null;
                return (
                  <div key={t.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8,
                    background: `color-mix(in srgb, ${t.color} 8%, transparent)`,
                    border: `1px solid ${t.color}33`,
                  }}>
                    <t.Icon size={12} color={t.color} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.color }}>{cnt}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {KB_TYPES.map(t => {
                const cnt = kbCounts[t.key] ?? kbItems.length;
                const active = kbFilter === t.key;
                return (
                  <button key={t.key} onClick={() => setKbFilter(t.key)} style={{
                    padding: '3px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
                    border: `1px solid ${active ? t.color : 'rgba(255,255,255,0.1)'}`,
                    background: active ? `color-mix(in srgb, ${t.color} 12%, transparent)` : 'transparent',
                    color: active ? t.color : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400,
                  }}>
                    {t.label} <span style={{ opacity: 0.65 }}>{cnt}</span>
                  </button>
                );
              })}
            </div>

            {/* Item list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {filteredKbItems.map(item => {
                const t = KB_TYPES.find(x => x.key === item.type);
                return (
                  <div key={item.id} style={{
                    padding: '9px 12px', borderRadius: 8,
                    background: `color-mix(in srgb, ${t.color} 4%, transparent)`,
                    border: `1px solid ${t.color}25`,
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    {/* Type badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
                      background: `color-mix(in srgb, ${t.color} 15%, transparent)`,
                      border: `1px solid ${t.color}44`, color: t.color,
                      textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 1,
                    }}>
                      {t.label.slice(0, -1)}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>
                        {item.text.length > 100 ? item.text.slice(0, 100) + '…' : item.text}
                      </div>
                      {item.sub && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 3 }}>
                          {item.sub.length > 80 ? item.sub.slice(0, 80) + '…' : item.sub}
                        </div>
                      )}
                      {/* Provenance pill */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'var(--text-muted)',
                          maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.source.title.length > 30 ? item.source.title.slice(0, 30) + '…' : item.source.title}
                        </span>
                        {item.source.ref && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.65 }}>
                            {item.source.ref}
                          </span>
                        )}
                        {item.page && (
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 8,
                            background: `color-mix(in srgb, ${t.color} 10%, transparent)`,
                            border: `1px solid ${t.color}33`, color: t.color,
                          }}>
                            p.{item.page}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Readiness score card ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '18px 22px',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
              Store Readiness Score
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {Math.round((readiness.score / readiness.max) * 100)}%
              </span>
              <span style={{ fontSize: 12, fontWeight: 600,
                padding: '2px 10px', borderRadius: 12,
                background: `${scoreColor}18`, color: scoreColor,
                border: `1px solid ${scoreColor}44`,
              }}>
                {scoreLabel}
              </span>
            </div>
          </div>
          {/* Progress bar */}
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

        {/* Criteria grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 7 }}>
          {readiness.criteria.map((c, i) => {
            const icon = c.met ? <CheckCircle2 size={13} color={ACC} />
              : c.partial ? <AlertCircle size={13} color="#fbbf24" />
              : <Circle size={13} color="#64748b" />;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 10px', borderRadius: 7,
                background: c.met ? cr(0.06) : 'rgba(255,255,255,0.02)',
                border: `1px solid ${c.met ? cr(0.2) : 'rgba(255,255,255,0.06)'}`,
              }}>
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

      {/* ── 1. Document Store ── */}
      <SectionCard icon={FolderOpen} title="Document Store"
        status={s.docStore.status} defaultOpen>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          <FieldRow label="Store Type" half>
            <select style={selectSx} value={s.docStore.type}
              onChange={e => set('docStore', { type: e.target.value })}>
              {DOC_STORE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="Location / URI" half>
            <input style={inputSx} value={s.docStore.location}
              onChange={e => set('docStore', { location: e.target.value })}
              placeholder="e.g. /data/documents or s3://bucket/path" />
          </FieldRow>

          <FieldRow label="Document Count" half>
            <input style={inputSx} type="number" value={s.docStore.docCount}
              onChange={e => set('docStore', { docCount: e.target.value })}
              placeholder="estimated document count" />
          </FieldRow>

          <FieldRow label="Status" half>
            <StatusRow value={s.docStore.status}
              onChange={v => set('docStore', { status: v })} />
          </FieldRow>

          <FieldRow label="Properties">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { key: 'hasParsedText',     label: 'Parsed text output stored'  },
                { key: 'hasVersionHistory', label: 'Version history maintained'  },
                { key: 'hasMetadata',       label: 'Metadata present per doc'   },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6,
                  cursor: 'pointer', fontSize: 12, color: s.docStore[key] ? 'var(--text)' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={s.docStore[key]}
                    onChange={e => set('docStore', { [key]: e.target.checked })}
                    style={{ accentColor: ACC, width: 12, height: 12 }} />
                  {label}
                </label>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 56 }}
              value={s.docStore.notes}
              onChange={e => set('docStore', { notes: e.target.value })}
              placeholder="Notes on store structure, naming conventions, known issues…" />
          </FieldRow>
        </div>
      </SectionCard>

      {/* ── 2. Vector Indexes ── */}
      <SectionCard icon={Layers} title="Vector Indexes"
        badge={`${s.vectorIndexes.length} index${s.vectorIndexes.length !== 1 ? 'es' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {s.vectorIndexes.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 13 }}>
              No vector indexes registered yet.
            </div>
          ) : (
            s.vectorIndexes.map(vi => {
              const col = statusColor(vi.status, VECTOR_STATUS_OPTS);
              return (
                <div key={vi.id} style={{
                  padding: '12px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <StatusDot value={vi.status} opts={VECTOR_STATUS_OPTS} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                      {vi.collectionName || '(unnamed)'}
                      <span style={{ marginLeft: 8, fontSize: 11,
                        color: 'var(--text-muted)', fontWeight: 400 }}>
                        {vi.backend}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {[
                        vi.embeddingModel && `model: ${vi.embeddingModel}`,
                        vi.dimensions && `${vi.dimensions}d`,
                        `metric: ${vi.distanceMetric}`,
                        vi.chunkCount && `${Number(vi.chunkCount).toLocaleString()} chunks`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 12, background: `${col}18`, color: col,
                    border: `1px solid ${col}44`, textTransform: 'uppercase',
                    letterSpacing: '0.07em', flexShrink: 0 }}>
                    {(VECTOR_STATUS_OPTS.find(o => o.value === vi.status) || VECTOR_STATUS_OPTS[0]).label}
                  </span>
                  <button onClick={() => setViModal(vi)} style={tinyBtn}>Edit</button>
                  <button onClick={() => deleteVectorIndex(vi.id)}
                    style={{ ...tinyBtn, color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.25)',
                      background: 'rgba(239,68,68,0.05)' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })
          )}
          <button onClick={() => setViModal(NEW_VECTOR_INDEX())} style={{
            ...tinyBtn, justifyContent: 'center', padding: '7px', borderStyle: 'dashed',
            borderColor: cr(0.3), color: ACC,
          }}>
            <Plus size={13} /> Add Vector Index
          </button>
        </div>
      </SectionCard>

      {/* ── 3. Metadata Database ── */}
      <SectionCard icon={Database} title="Metadata Database"
        status={s.metadataDB.status}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          <FieldRow label="Backend" half>
            <select style={selectSx} value={s.metadataDB.backend}
              onChange={e => set('metadataDB', { backend: e.target.value })}>
              {DB_BACKENDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="Record Count" half>
            <input style={inputSx} type="number" value={s.metadataDB.recordCount}
              onChange={e => set('metadataDB', { recordCount: e.target.value })}
              placeholder="estimated record count" />
          </FieldRow>

          <FieldRow label="Connection URI">
            <input style={inputSx} value={s.metadataDB.connectionUri}
              onChange={e => set('metadataDB', { connectionUri: e.target.value })}
              placeholder="e.g. postgresql://user:pass@host:5432/kb_meta" />
          </FieldRow>

          <FieldRow label="Status">
            <StatusRow value={s.metadataDB.status}
              onChange={v => set('metadataDB', { status: v })} />
          </FieldRow>

          {/* Schema fields */}
          <FieldRow label="Schema Fields Present">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {META_FIELDS.map(f => {
                const on = s.metadataDB.schemaFields[f.key];
                return (
                  <button key={f.key}
                    onClick={() => set('metadataDB', {
                      schemaFields: { ...s.metadataDB.schemaFields, [f.key]: !on },
                    })}
                    style={{
                      padding: '3px 10px', borderRadius: 12, cursor: 'pointer',
                      fontSize: 11, fontFamily: 'monospace',
                      border: `1px solid ${on ? cr(0.5) : 'rgba(255,255,255,0.1)'}`,
                      background: on ? cr(0.1) : 'transparent',
                      color: on ? ACC : 'var(--text-muted)',
                      fontWeight: on ? 600 : 400,
                    }}>
                    {f.label}
                  </button>
                );
              })}
            </div>
          </FieldRow>

          <FieldRow label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 56 }}
              value={s.metadataDB.notes}
              onChange={e => set('metadataDB', { notes: e.target.value })}
              placeholder="Notes on schema design, indexes, table structure…" />
          </FieldRow>
        </div>
      </SectionCard>

      {/* ── 4. Graph Entity Store ── */}
      <SectionCard icon={GitBranch} title="Graph Entity Store"
        status={s.graphStore.status}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          <FieldRow label="Backend" half>
            <select style={selectSx} value={s.graphStore.backend}
              onChange={e => set('graphStore', { backend: e.target.value })}>
              {GRAPH_BACKENDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="Status" half>
            <StatusRow value={s.graphStore.status}
              onChange={v => set('graphStore', { status: v })} />
          </FieldRow>

          <FieldRow label="Connection URI">
            <input style={inputSx} value={s.graphStore.connectionUri}
              onChange={e => set('graphStore', { connectionUri: e.target.value })}
              placeholder="e.g. bolt://localhost:7687 or postgresql://…" />
          </FieldRow>

          {/* Entity type inventory */}
          <FieldRow label="Entity Types">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 6 }}>
              {s.graphStore.entityTypes.map(et => (
                <div key={et.name} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                  borderRadius: 7, border: `1px solid ${et.enabled ? cr(0.3) : 'rgba(255,255,255,0.07)'}`,
                  background: et.enabled ? cr(0.06) : 'rgba(255,255,255,0.02)',
                }}>
                  <input type="checkbox" checked={et.enabled}
                    onChange={e => setEntityType(et.name, { enabled: e.target.checked })}
                    style={{ accentColor: ACC, width: 11, height: 11, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11,
                    color: et.enabled ? 'var(--text)' : 'var(--text-muted)' }}>
                    {et.name}
                  </span>
                  {et.enabled && (
                    <input
                      type="number"
                      value={et.count}
                      onChange={e => setEntityType(et.name, { count: e.target.value })}
                      placeholder="n"
                      style={{
                        width: 52, padding: '2px 6px', borderRadius: 5, fontSize: 11,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text)', outline: 'none', textAlign: 'right',
                      }} />
                  )}
                </div>
              ))}
            </div>
          </FieldRow>

          <FieldRow label="Notes">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 56 }}
              value={s.graphStore.notes}
              onChange={e => set('graphStore', { notes: e.target.value })}
              placeholder="Notes on schema, relationship types, query patterns…" />
          </FieldRow>
        </div>
      </SectionCard>

      {/* ── 5 + 6: Two-column row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* 5. Knowledge Unit Diversity */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LayoutGrid size={13} color={ACC} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              Knowledge Unit Diversity
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              {Object.values(s.unitTypes).filter(Boolean).length} / {UNIT_TYPES.length} types
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {UNIT_TYPES.map(u => {
              const on = s.unitTypes[u.key];
              return (
                <label key={u.key} style={{
                  display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                  padding: '5px 8px', borderRadius: 7,
                  background: on ? cr(0.06) : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${on ? cr(0.25) : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <input type="checkbox" checked={on}
                    onChange={e => setS(prev => ({
                      ...prev,
                      unitTypes: { ...prev.unitTypes, [u.key]: e.target.checked },
                    }))}
                    style={{ accentColor: ACC, width: 12, height: 12, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: on ? 600 : 400,
                      color: on ? 'var(--text)' : 'var(--text-muted)' }}>
                      {u.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {u.desc}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* 6. Chunk Inventory */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={13} color={ACC} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              Chunk Inventory
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <SectionLabel>Strategy</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {CHUNK_STRATEGIES.map(cs => (
                  <label key={cs.value} style={{ display: 'flex', alignItems: 'center',
                    gap: 8, cursor: 'pointer', fontSize: 12,
                    color: s.chunking.strategy === cs.value
                      ? 'var(--text)' : 'var(--text-muted)' }}>
                    <input type="radio" name="chunk-strategy" value={cs.value}
                      checked={s.chunking.strategy === cs.value}
                      onChange={() => set('chunking', { strategy: cs.value })}
                      style={{ accentColor: ACC }} />
                    {cs.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <SectionLabel>Chunk Size (tokens)</SectionLabel>
                <input style={inputSx} type="number" value={s.chunking.chunkSize}
                  onChange={e => set('chunking', { chunkSize: e.target.value })} />
              </div>
              <div>
                <SectionLabel>Overlap (tokens)</SectionLabel>
                <input style={inputSx} type="number" value={s.chunking.overlap}
                  onChange={e => set('chunking', { overlap: e.target.value })} />
              </div>
              <div>
                <SectionLabel>Est. Document Count</SectionLabel>
                <input style={inputSx} type="number" value={s.chunking.estimatedDocCount}
                  onChange={e => set('chunking', { estimatedDocCount: e.target.value })}
                  placeholder="source docs" />
              </div>
              <div>
                <SectionLabel>Est. Chunk Count</SectionLabel>
                <input style={inputSx} type="number" value={s.chunking.estimatedChunkCount}
                  onChange={e => set('chunking', { estimatedChunkCount: e.target.value })}
                  placeholder="total chunks" />
              </div>
            </div>

            {/* Ratio */}
            {s.chunking.estimatedDocCount && s.chunking.estimatedChunkCount && (
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: cr(0.06), border: `1px solid ${cr(0.2)}`,
                fontSize: 12, color: 'var(--text-secondary)',
              }}>
                Chunks per document:{' '}
                <strong style={{ color: ACC }}>
                  {(+s.chunking.estimatedChunkCount / +s.chunking.estimatedDocCount).toFixed(1)}
                </strong>
                {' '}— target range is typically 4–15 for well-chunked documents.
              </div>
            )}

            <div>
              <SectionLabel>Notes</SectionLabel>
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 56 }}
                value={s.chunking.notes}
                onChange={e => set('chunking', { notes: e.target.value })}
                placeholder="Notes on chunking implementation, splitter class, special handling…" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Vector index modal ── */}
      {viModal && (
        <VectorIndexModal
          initial={typeof viModal === 'string' ? NEW_VECTOR_INDEX() : viModal}
          onSave={saveVectorIndex}
          onClose={() => setViModal(null)} />
      )}
    </div>
  );
}
