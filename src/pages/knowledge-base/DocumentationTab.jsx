/* """
src/pages/knowledge-base/DocumentationTab.jsx
----------------------------------------------
Documentation tab — measure and track documentation quality across the KB
codebase. Six sections: README quality, docstring coverage, API docs
generation, changelog, architecture docs, and KB-specific docs.
""" */

import { useState, useMemo } from 'react';
import {
  FileText, BookOpen, Code2, ScrollText,
  Network, Library,
  CheckCircle2, AlertCircle, Circle,
  Plus, Edit2, Trash2, X,
  ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACC = '#fb7185'; // rose-400
const cr  = (a) => `rgba(251,113,133,${a})`;

// ─── Static data ──────────────────────────────────────────────────────────────

const README_SECTIONS = [
  { key: 'purpose',           label: 'Purpose / overview',        desc: 'What the project is and why it exists'          },
  { key: 'install',           label: 'Installation',              desc: 'How to install dependencies and set up the env' },
  { key: 'usage',             label: 'Usage / quickstart',        desc: 'How to run or use the system'                   },
  { key: 'examples',          label: 'Examples',                  desc: 'Concrete usage examples or screenshots'         },
  { key: 'schemaDescription', label: 'Schema / data model',       desc: 'Description of the KB schema or data structures' },
  { key: 'apiReference',      label: 'API reference',             desc: 'Endpoint or function reference'                 },
  { key: 'contributing',      label: 'Contributing',              desc: 'How to contribute, PR process, code style'      },
  { key: 'troubleshooting',   label: 'Troubleshooting',           desc: 'Common issues and how to fix them'              },
];

const DOC_TOOLS = [
  'Sphinx', 'MkDocs', 'pdoc', 'mkdocstrings',
  'JSDoc', 'TypeDoc', 'Doxygen', 'Custom',
];

const DOC_TOOL_STATUSES = [
  { value: 'not-configured', label: 'Not Configured', color: '#64748b' },
  { value: 'configured',     label: 'Configured',     color: '#fbbf24' },
  { value: 'deployed',       label: 'Deployed',       color: '#34d399' },
];

const CHANGELOG_FORMATS = [
  { value: 'keep-a-changelog',     label: 'Keep a Changelog'     },
  { value: 'conventional-commits', label: 'Conventional Commits' },
  { value: 'custom',               label: 'Custom format'        },
];

const ARCH_TYPES = [
  { value: 'architecture', label: 'Architecture overview' },
  { value: 'dataflow',     label: 'Data flow'             },
  { value: 'erd',          label: 'Entity-relationship'   },
  { value: 'sequence',     label: 'Sequence diagram'      },
  { value: 'deployment',   label: 'Deployment'            },
  { value: 'written',      label: 'Written doc'           },
];

const ARCH_FORMATS = [
  '.drawio', '.puml (PlantUML)', 'Mermaid (Markdown)', '.png / .svg',
  '.pdf', 'Confluence / Notion', 'Other',
];

const ARCH_STATUSES = [
  { value: 'current',  label: 'Current',  color: '#34d399' },
  { value: 'draft',    label: 'Draft',    color: '#fbbf24' },
  { value: 'outdated', label: 'Outdated', color: '#ef4444' },
];

const KB_DOC_ITEMS = [
  { key: 'schemaDocumentation',    label: 'Schema documentation',       desc: 'Entity types, fields, and relationships documented'    },
  { key: 'ontologyDescriptions',   label: 'Ontology descriptions',      desc: 'Each ontology file explained in prose'                 },
  { key: 'ingestionPipelineReadme',label: 'Ingestion pipeline README',  desc: 'How to run the ingestion pipeline end-to-end'          },
  { key: 'retrievalLayerDocs',     label: 'Retrieval layer docs',       desc: 'How queries are constructed and results ranked'        },
  { key: 'vectorIndexDocs',        label: 'Vector index docs',          desc: 'Embedding model, dimensions, collection structure'     },
  { key: 'entityExtractionDocs',   label: 'Entity extraction docs',     desc: 'Which NER tools run and what they extract'             },
  { key: 'dataGovernanceDocs',     label: 'Data governance docs',       desc: 'Provenance, approval, versioning, and expiry policies' },
  { key: 'apiUsageGuide',          label: 'API usage guide',            desc: 'How to query the KB programmatically'                  },
  { key: 'deploymentGuide',        label: 'Deployment guide',           desc: 'How to deploy the KB in production'                    },
  { key: 'troubleshootingGuide',   label: 'Troubleshooting guide',      desc: 'Common failure modes and how to resolve them'         },
];

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_STATE = {
  readme: {
    present: false,
    path: 'README.md',
    wordCount: '',
    sections: Object.fromEntries(README_SECTIONS.map(s => [s.key, false])),
    notes: '',
  },
  docstringModules: [],
  apiDocs: {
    tool: 'MkDocs',
    configPath: '',
    buildTarget: '',
    outputDir: 'docs/',
    deployUrl: '',
    status: 'not-configured',
    notes: '',
  },
  changelog: {
    present: false,
    filename: 'CHANGELOG.md',
    path: '',
    lastEntryDate: '',
    entryCount: '',
    format: 'keep-a-changelog',
    notes: '',
  },
  archDocs: [],
  kbDocs: Object.fromEntries(KB_DOC_ITEMS.map(i => [i.key, false])),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const daysSince = (dateStr) => {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
};

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

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
  borderRadius: 6, cursor: 'pointer', fontSize: 11,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)',
};
const dangerBtn = { ...ghostBtn, color: '#ef4444',
  border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.05)' };

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 7 }}>
      {children}
    </div>
  );
}

function SectionCard({ icon: Icon, title, badge, subtitle, children, defaultOpen = false }) {
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
          {subtitle && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>
              {subtitle}
            </span>
          )}
        </div>
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

// coverage bar
function CoverageBar({ value, total, size = 'md' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const color = pct >= 80 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#ef4444';
  const height = size === 'sm' ? 4 : 6;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height, borderRadius: 99,
        background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`,
          background: color, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0, minWidth: 36,
        textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Module modal ─────────────────────────────────────────────────────────────

function ModuleModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fnPct   = form.functionCount > 0 ? Math.round((form.coveredFunctions / form.functionCount) * 100) : 0;
  const clsPct  = form.classCount > 0    ? Math.round((form.coveredClasses   / form.classCount)   * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit Module' : 'Add Module'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FL label="Module Name" span2>
            <input style={inputSx} value={form.moduleName}
              onChange={e => set('moduleName', e.target.value)}
              placeholder="e.g. pipeline.parsers, kb.retrieval" />
          </FL>
          <FL label="File Path" span2>
            <input style={inputSx} value={form.path}
              onChange={e => set('path', e.target.value)}
              placeholder="e.g. src/pipeline/parsers.py" />
          </FL>
          <FL label="Functions (total)">
            <input style={inputSx} type="number" min={0} value={form.functionCount}
              onChange={e => set('functionCount', +e.target.value)} />
          </FL>
          <FL label="Functions (with docstrings)">
            <input style={inputSx} type="number" min={0} value={form.coveredFunctions}
              onChange={e => set('coveredFunctions', +e.target.value)} />
          </FL>
          <FL label="Classes (total)">
            <input style={inputSx} type="number" min={0} value={form.classCount}
              onChange={e => set('classCount', +e.target.value)} />
          </FL>
          <FL label="Classes (with docstrings)">
            <input style={inputSx} type="number" min={0} value={form.coveredClasses}
              onChange={e => set('coveredClasses', +e.target.value)} />
          </FL>

          {(form.functionCount > 0 || form.classCount > 0) && (
            <div style={{ gridColumn: 'span 2', padding: '10px 12px', borderRadius: 8,
              background: cr(0.06), border: `1px solid ${cr(0.2)}`,
              display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.functionCount > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    Function coverage
                  </div>
                  <CoverageBar value={form.coveredFunctions} total={form.functionCount} size="sm" />
                </div>
              )}
              {form.classCount > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                    Class coverage
                  </div>
                  <CoverageBar value={form.coveredClasses} total={form.classCount} size="sm" />
                </div>
              )}
            </div>
          )}

          <FL label="Notes" span2>
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Notes on coverage gaps, auto-generated stubs, etc." />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button onClick={() => form.moduleName.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.moduleName.trim() ? 1 : 0.4,
          }}>
            {form.id ? 'Save Changes' : 'Add Module'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Arch doc modal ───────────────────────────────────────────────────────────

function ArchModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 460, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit Document' : 'Add Architecture Document'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid',
          gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FL label="Title" span2>
            <input style={inputSx} value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. KB Data Flow, Entity-Relationship Diagram" />
          </FL>
          <FL label="Type">
            <select style={selectSx} value={form.type}
              onChange={e => set('type', e.target.value)}>
              {ARCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FL>
          <FL label="Format">
            <select style={selectSx} value={form.format}
              onChange={e => set('format', e.target.value)}>
              {ARCH_FORMATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </FL>
          <FL label="File Path" span2>
            <input style={inputSx} value={form.path}
              onChange={e => set('path', e.target.value)}
              placeholder="e.g. docs/architecture/data-flow.drawio" />
          </FL>
          <FL label="Status" span2>
            <div style={{ display: 'flex', gap: 6 }}>
              {ARCH_STATUSES.map(s => (
                <button key={s.value} onClick={() => set('status', s.value)} style={{
                  flex: 1, padding: '5px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                  border: `1px solid ${form.status === s.value ? s.color : 'rgba(255,255,255,0.1)'}`,
                  background: form.status === s.value ? `${s.color}18` : 'transparent',
                  color: form.status === s.value ? s.color : 'var(--text-muted)',
                }}>
                  {s.label}
                </button>
              ))}
            </div>
          </FL>
          <FL label="Description" span2>
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What this document covers…" />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button onClick={() => form.title.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.title.trim() ? 1 : 0.4,
          }}>
            {form.id ? 'Save' : 'Add Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Readiness score ──────────────────────────────────────────────────────────

function computeReadiness(s) {
  const readmeSections = Object.values(s.readme.sections).filter(Boolean).length;
  const kbDocCount     = Object.values(s.kbDocs).filter(Boolean).length;

  const totalFunctions  = s.docstringModules.reduce((n, m) => n + m.functionCount, 0);
  const coveredFunctions = s.docstringModules.reduce((n, m) => n + m.coveredFunctions, 0);
  const fnCovPct = totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 0;

  const staleDays = daysSince(s.changelog.lastEntryDate);

  const criteria = [
    {
      label:   'README present with ≥ 4 sections',
      met:     s.readme.present && readmeSections >= 4,
      partial: s.readme.present && readmeSections >= 2,
    },
    {
      label:   'Docstring coverage ≥ 70%',
      met:     totalFunctions > 0 && fnCovPct >= 70,
      partial: totalFunctions > 0 && fnCovPct >= 40,
    },
    {
      label:   'API docs generator configured',
      met:     s.apiDocs.status === 'deployed',
      partial: s.apiDocs.status === 'configured',
    },
    {
      label:   'Changelog present and recent (≤ 90 days)',
      met:     s.changelog.present && staleDays !== null && staleDays <= 90,
      partial: s.changelog.present,
    },
    {
      label:   'Architecture docs registered (≥ 2)',
      met:     s.archDocs.filter(d => d.status === 'current').length >= 2,
      partial: s.archDocs.length >= 1,
    },
    {
      label:   'KB-specific docs ≥ 4 items',
      met:     kbDocCount >= 4,
      partial: kbDocCount >= 2,
    },
    {
      label:   'Schema documentation present',
      met:     s.kbDocs.schemaDocumentation && s.kbDocs.ontologyDescriptions,
      partial: s.kbDocs.schemaDocumentation || s.kbDocs.ontologyDescriptions,
    },
  ];
  const score = criteria.reduce((n, c) => n + (c.met ? 1 : c.partial ? 0.5 : 0), 0);
  return { criteria, score, max: criteria.length };
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function DocumentationTab() {
  const [s, setS]       = useState(DEFAULT_STATE);
  const [modModal, setModModal]   = useState(null);
  const [archModal, setArchModal] = useState(null);

  const set = (section, patch) =>
    setS(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }));

  const setReadmeSection = (key, val) =>
    set('readme', { sections: { ...s.readme.sections, [key]: val } });

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

  const readiness = computeReadiness(s);

  // overall docstring stats
  const totalFn  = s.docstringModules.reduce((n, m) => n + m.functionCount, 0);
  const coveredFn = s.docstringModules.reduce((n, m) => n + m.coveredFunctions, 0);
  const totalCls  = s.docstringModules.reduce((n, m) => n + m.classCount, 0);
  const coveredCls = s.docstringModules.reduce((n, m) => n + m.coveredClasses, 0);

  const scoreColor = readiness.score >= readiness.max * 0.85 ? ACC
    : readiness.score >= readiness.max * 0.5 ? '#fbbf24' : '#ef4444';
  const scoreLabel = readiness.score >= readiness.max * 0.85 ? 'Ready'
    : readiness.score >= readiness.max * 0.5 ? 'Partial' : 'Not Ready';

  const readmeSectionCount = Object.values(s.readme.sections).filter(Boolean).length;
  const readmeQualityColor = !s.readme.present ? '#64748b'
    : readmeSectionCount >= 6 ? '#34d399'
    : readmeSectionCount >= 3 ? '#fbbf24' : '#ef4444';
  const readmeQualityLabel = !s.readme.present ? 'Missing'
    : readmeSectionCount >= 6 ? 'Comprehensive'
    : readmeSectionCount >= 3 ? 'Adequate' : 'Minimal';

  const staleDays   = daysSince(s.changelog.lastEntryDate);
  const changelogOk = s.changelog.present && staleDays !== null && staleDays <= 90;
  const changelogColor = !s.changelog.present ? '#64748b'
    : changelogOk ? '#34d399' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Readiness score ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
              Documentation Readiness Score
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {Math.round((readiness.score / readiness.max) * 100)}%
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
                background: `${scoreColor}18`, color: scoreColor,
                border: `1px solid ${scoreColor}44` }}>
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
        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 7 }}>
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

      {/* ── 1. README Quality ── */}
      <SectionCard icon={BookOpen} title="README Quality"
        subtitle={s.readme.present ? `${readmeSectionCount} / ${README_SECTIONS.length} sections` : ''}
        badge={<span style={{ color: readmeQualityColor }}>{readmeQualityLabel}</span>}
        defaultOpen>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: presence + metadata */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: s.readme.present ? cr(0.06) : 'rgba(255,255,255,0.02)',
              border: `1px solid ${s.readme.present ? cr(0.25) : 'rgba(255,255,255,0.08)'}`,
              color: s.readme.present ? 'var(--text)' : 'var(--text-muted)' }}>
              <input type="checkbox" checked={s.readme.present}
                onChange={e => set('readme', { present: e.target.checked })}
                style={{ accentColor: ACC, width: 13, height: 13 }} />
              README file present
            </label>

            {s.readme.present && (
              <>
                <FL label="File Path">
                  <input style={inputSx} value={s.readme.path}
                    onChange={e => set('readme', { path: e.target.value })}
                    placeholder="README.md" />
                </FL>
                <FL label="Word Count (approx.)">
                  <input style={inputSx} type="number" value={s.readme.wordCount}
                    onChange={e => set('readme', { wordCount: e.target.value })}
                    placeholder="estimated word count" />
                  {s.readme.wordCount && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                      {+s.readme.wordCount < 200 ? '⚠ Very short — consider expanding.'
                        : +s.readme.wordCount < 600 ? 'Minimal length — add more context.'
                        : +s.readme.wordCount < 1500 ? 'Good length for a project README.'
                        : 'Comprehensive README.'}
                    </div>
                  )}
                </FL>

                {/* Quality bar */}
                <div style={{ padding: '10px 12px', borderRadius: 8,
                  background: cr(0.05), border: `1px solid ${cr(0.18)}` }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
                    Section coverage
                  </div>
                  <CoverageBar value={readmeSectionCount} total={README_SECTIONS.length} />
                </div>
              </>
            )}

            <FL label="Notes">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 60 }}
                value={s.readme.notes}
                onChange={e => set('readme', { notes: e.target.value })}
                placeholder="Notes on README gaps, planned improvements…" />
            </FL>
          </div>

          {/* Right: section checklist */}
          <div>
            <SectionLabel>Sections Present</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {README_SECTIONS.map(sec => {
                const on = s.readme.sections[sec.key];
                return (
                  <label key={sec.key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                    padding: '6px 8px', borderRadius: 7,
                    background: on ? cr(0.06) : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${on ? cr(0.22) : 'rgba(255,255,255,0.06)'}`,
                    opacity: s.readme.present ? 1 : 0.4,
                  }}>
                    <input type="checkbox" checked={on}
                      onChange={e => setReadmeSection(sec.key, e.target.checked)}
                      disabled={!s.readme.present}
                      style={{ accentColor: ACC, marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: on ? 600 : 400,
                        color: on ? ACC : 'var(--text-muted)' }}>
                        {sec.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {sec.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Docstring Coverage ── */}
      <SectionCard icon={Code2} title="Docstring Coverage"
        badge={totalFn > 0 ? `${coveredFn} / ${totalFn} functions` : `${s.docstringModules.length} module${s.docstringModules.length !== 1 ? 's' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Overall summary */}
          {s.docstringModules.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
              padding: '12px 14px', borderRadius: 8,
              background: cr(0.05), border: `1px solid ${cr(0.18)}` }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
                  Function coverage — {coveredFn} / {totalFn}
                </div>
                <CoverageBar value={coveredFn} total={totalFn} />
              </div>
              {totalCls > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
                    Class coverage — {coveredCls} / {totalCls}
                  </div>
                  <CoverageBar value={coveredCls} total={totalCls} />
                </div>
              )}
            </div>
          )}

          {/* Module list */}
          {s.docstringModules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0',
              fontSize: 12, color: 'var(--text-muted)' }}>
              No modules registered yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.docstringModules.map(m => {
                const fnPct = m.functionCount > 0
                  ? Math.round((m.coveredFunctions / m.functionCount) * 100) : null;
                const pctColor = fnPct === null ? '#64748b'
                  : fnPct >= 80 ? '#34d399' : fnPct >= 50 ? '#fbbf24' : '#ef4444';
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center',
                        gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)',
                          fontFamily: 'monospace' }}>
                          {m.moduleName}
                        </span>
                        {m.path && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)',
                            fontFamily: 'monospace', opacity: 0.7 }}>
                            {m.path}
                          </span>
                        )}
                      </div>
                      {m.functionCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center',
                          gap: 6, marginBottom: m.classCount > 0 ? 3 : 0 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)',
                            width: 70, flexShrink: 0 }}>
                            functions
                          </span>
                          <div style={{ flex: 1 }}>
                            <CoverageBar value={m.coveredFunctions}
                              total={m.functionCount} size="sm" />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)',
                            flexShrink: 0 }}>
                            {m.coveredFunctions}/{m.functionCount}
                          </span>
                        </div>
                      )}
                      {m.classCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)',
                            width: 70, flexShrink: 0 }}>
                            classes
                          </span>
                          <div style={{ flex: 1 }}>
                            <CoverageBar value={m.coveredClasses}
                              total={m.classCount} size="sm" />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)',
                            flexShrink: 0 }}>
                            {m.coveredClasses}/{m.classCount}
                          </span>
                        </div>
                      )}
                    </div>
                    {fnPct !== null && (
                      <span style={{ fontSize: 14, fontWeight: 800, color: pctColor,
                        flexShrink: 0, minWidth: 42, textAlign: 'right' }}>
                        {fnPct}%
                      </span>
                    )}
                    <button onClick={() => setModModal(m)} style={ghostBtn}><Edit2 size={11} /></button>
                    <button onClick={() => remove('docstringModules', m.id)} style={dangerBtn}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <button onClick={() => setModModal({
            id: newId('mod'), moduleName: '', path: '',
            functionCount: 0, coveredFunctions: 0,
            classCount: 0, coveredClasses: 0, notes: '',
          })} style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
            borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Add Module
          </button>
        </div>
      </SectionCard>

      {/* ── 3. API Docs + 4. Changelog ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* API Docs Generation */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden' }}>
          {(() => {
            const [open, setOpen] = useState(false);
            const sc = DOC_TOOL_STATUSES.find(o => o.value === s.apiDocs.status);
            return (
              <>
                <button onClick={() => setOpen(o => !o)} style={{ width: '100%',
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: cr(0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ScrollText size={15} color={ACC} />
                  </div>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                    API Docs Generation
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
                    borderRadius: 10, background: `${sc.color}18`, color: sc.color,
                    border: `1px solid ${sc.color}44`, textTransform: 'uppercase',
                    letterSpacing: '0.07em' }}>
                    {sc.label}
                  </span>
                  {open ? <ChevronDown size={15} color="var(--text-muted)" />
                         : <ChevronRight size={15} color="var(--text-muted)" />}
                </button>
                {open && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)',
                    paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <FL label="Tool">
                        <select style={selectSx} value={s.apiDocs.tool}
                          onChange={e => set('apiDocs', { tool: e.target.value })}>
                          {DOC_TOOLS.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </FL>
                      <FL label="Status">
                        <select style={selectSx} value={s.apiDocs.status}
                          onChange={e => set('apiDocs', { status: e.target.value })}>
                          {DOC_TOOL_STATUSES.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </FL>
                      <FL label="Config Path">
                        <input style={inputSx} value={s.apiDocs.configPath}
                          onChange={e => set('apiDocs', { configPath: e.target.value })}
                          placeholder="e.g. mkdocs.yml" />
                      </FL>
                      <FL label="Output Directory">
                        <input style={inputSx} value={s.apiDocs.outputDir}
                          onChange={e => set('apiDocs', { outputDir: e.target.value })}
                          placeholder="e.g. site/ or docs/_build/" />
                      </FL>
                    </div>
                    <FL label="Build Target">
                      <input style={inputSx} value={s.apiDocs.buildTarget}
                        onChange={e => set('apiDocs', { buildTarget: e.target.value })}
                        placeholder="e.g. make docs, mkdocs build" />
                    </FL>
                    <FL label="Deploy URL">
                      <input style={inputSx} value={s.apiDocs.deployUrl}
                        onChange={e => set('apiDocs', { deployUrl: e.target.value })}
                        placeholder="e.g. https://docs.example.com" />
                    </FL>
                    <FL label="Notes">
                      <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                        lineHeight: 1.5, minHeight: 48 }}
                        value={s.apiDocs.notes}
                        onChange={e => set('apiDocs', { notes: e.target.value })}
                        placeholder="Notes on doc generation setup…" />
                    </FL>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Changelog */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden' }}>
          {(() => {
            const [open, setOpen] = useState(false);
            return (
              <>
                <button onClick={() => setOpen(o => !o)} style={{ width: '100%',
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: cr(0.1),
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={15} color={ACC} />
                  </div>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                    Changelog
                  </span>
                  {s.changelog.present && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 10, background: `${changelogColor}18`,
                      color: changelogColor, border: `1px solid ${changelogColor}44`,
                      textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {changelogOk ? 'Current' : staleDays !== null ? `${staleDays}d ago` : 'Present'}
                    </span>
                  )}
                  {!s.changelog.present && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px',
                      borderRadius: 10, background: 'rgba(100,116,139,0.15)',
                      color: '#64748b', border: '1px solid rgba(100,116,139,0.3)',
                      textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Missing
                    </span>
                  )}
                  {open ? <ChevronDown size={15} color="var(--text-muted)" />
                         : <ChevronRight size={15} color="var(--text-muted)" />}
                </button>
                {open && (
                  <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)',
                    paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer', padding: '7px 10px', borderRadius: 8, fontSize: 12,
                      background: s.changelog.present ? cr(0.06) : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${s.changelog.present ? cr(0.22) : 'rgba(255,255,255,0.07)'}`,
                      color: s.changelog.present ? 'var(--text)' : 'var(--text-muted)' }}>
                      <input type="checkbox" checked={s.changelog.present}
                        onChange={e => set('changelog', { present: e.target.checked })}
                        style={{ accentColor: ACC }} />
                      Changelog file present
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <FL label="Filename">
                        <input style={inputSx} value={s.changelog.filename}
                          onChange={e => set('changelog', { filename: e.target.value })}
                          placeholder="CHANGELOG.md" />
                      </FL>
                      <FL label="Entry Count">
                        <input style={inputSx} type="number" value={s.changelog.entryCount}
                          onChange={e => set('changelog', { entryCount: e.target.value })} />
                      </FL>
                      <FL label="Last Entry Date" span2>
                        <input style={inputSx} type="date" value={s.changelog.lastEntryDate}
                          onChange={e => set('changelog', { lastEntryDate: e.target.value })} />
                        {staleDays !== null && (
                          <div style={{ fontSize: 10, marginTop: 3,
                            color: staleDays <= 30 ? '#34d399' : staleDays <= 90 ? '#fbbf24' : '#ef4444',
                            display: 'flex', alignItems: 'center', gap: 4 }}>
                            {staleDays > 90 && <AlertTriangle size={10} />}
                            {staleDays === 0 ? 'Updated today' : `${staleDays} days since last entry`}
                            {staleDays > 90 && ' — consider updating'}
                          </div>
                        )}
                      </FL>
                    </div>
                    <FL label="Format">
                      <select style={selectSx} value={s.changelog.format}
                        onChange={e => set('changelog', { format: e.target.value })}>
                        {CHANGELOG_FORMATS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </FL>
                    <FL label="Notes">
                      <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                        lineHeight: 1.5, minHeight: 48 }}
                        value={s.changelog.notes}
                        onChange={e => set('changelog', { notes: e.target.value })}
                        placeholder="Notes on changelog maintenance…" />
                    </FL>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* ── 5. Architecture Docs + 6. KB-Specific Docs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Architecture Docs */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Network size={13} color={ACC} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>
              Architecture Docs
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {s.archDocs.length} document{s.archDocs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {s.archDocs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)',
                textAlign: 'center', padding: '12px 0' }}>
                No architecture documents registered.
              </div>
            ) : (
              s.archDocs.map(d => {
                const sc = ARCH_STATUSES.find(o => o.value === d.status) || ARCH_STATUSES[0];
                const tp = ARCH_TYPES.find(t => t.value === d.type) || ARCH_TYPES[0];
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '9px 10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)',
                        marginBottom: 2 }}>
                        {d.title}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex',
                        gap: 6, flexWrap: 'wrap' }}>
                        <span>{tp.label}</span>
                        <span>·</span>
                        <span>{d.format}</span>
                        {d.path && <><span>·</span><span style={{ fontFamily: 'monospace' }}>{d.path}</span></>}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px',
                      borderRadius: 10, background: `${sc.color}18`, color: sc.color,
                      border: `1px solid ${sc.color}44`, textTransform: 'uppercase',
                      letterSpacing: '0.06em', flexShrink: 0 }}>
                      {sc.label}
                    </span>
                    <button onClick={() => setArchModal(d)} style={{ ...ghostBtn, padding: '3px 6px' }}>
                      <Edit2 size={11} />
                    </button>
                    <button onClick={() => remove('archDocs', d.id)}
                      style={{ ...dangerBtn, padding: '3px 6px' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <button onClick={() => setArchModal({
            id: newId('arch'), title: '', type: 'architecture',
            format: '.drawio', path: '', description: '', status: 'current',
          })} style={{ ...ghostBtn, width: '100%', justifyContent: 'center',
            padding: 7, borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Add Document
          </button>
        </div>

        {/* KB-Specific Docs */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Library size={13} color={ACC} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>
              KB-Specific Docs
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {Object.values(s.kbDocs).filter(Boolean).length} / {KB_DOC_ITEMS.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {KB_DOC_ITEMS.map(item => {
              const on = s.kbDocs[item.key];
              return (
                <label key={item.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                  padding: '6px 8px', borderRadius: 7,
                  background: on ? cr(0.06) : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${on ? cr(0.22) : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <input type="checkbox" checked={on}
                    onChange={e => setS(prev => ({
                      ...prev, kbDocs: { ...prev.kbDocs, [item.key]: e.target.checked },
                    }))}
                    style={{ accentColor: ACC, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: on ? 600 : 400,
                      color: on ? ACC : 'var(--text-muted)' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {item.desc}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modModal  && <ModuleModal initial={modModal}
        onSave={m => { upsert('docstringModules', m); setModModal(null); }}
        onClose={() => setModModal(null)} />}
      {archModal && <ArchModal initial={archModal}
        onSave={d => { upsert('archDocs', d); setArchModal(null); }}
        onClose={() => setArchModal(null)} />}
    </div>
  );
}
