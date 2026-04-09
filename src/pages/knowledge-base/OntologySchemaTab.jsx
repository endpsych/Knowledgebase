/* """
src/pages/knowledge-base/OntologySchemaTab.jsx
-----------------------------------------------
Ontology & Schema tab — define and audit the conceptual model of the KB.
Seven sections: ontology files, entity type inventory, relationship schema,
controlled vocabulary, domain alignment, schema versioning, readiness score.
""" */

import { useState, useMemo } from 'react';
import {
  Boxes, FileCode, List, Link2, BookMarked,
  Globe, History, Plus, Edit2, Trash2, X,
  CheckCircle2, AlertCircle, Circle,
  ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACC = '#a78bfa'; // violet-400
const cr  = (a) => `rgba(167,139,250,${a})`;

// ─── Static data ──────────────────────────────────────────────────────────────

const ENTITY_STATUSES = [
  { value: 'draft',    label: 'Draft',    color: '#64748b' },
  { value: 'reviewed', label: 'Reviewed', color: '#fbbf24' },
  { value: 'stable',   label: 'Stable',   color: '#34d399' },
];

const REL_STATUSES = ENTITY_STATUSES;

const ONTO_FORMATS  = ['.owl', '.ttl', '.rdf', '.n3', '.jsonld', 'YAML', 'JSON'];
const FILE_STATUSES = [
  { value: 'detected',  label: 'Detected',  color: '#64748b' },
  { value: 'validated', label: 'Validated', color: '#34d399' },
  { value: 'outdated',  label: 'Outdated',  color: '#ef4444' },
];

const CARDINALITIES = ['1:1', '1:N', 'M:N'];

const PREDICATE_SUGGESTIONS = [
  'OWNS', 'GOVERNS', 'USES', 'TRAINS_ON', 'MEASURES', 'SUPPORTS',
  'MITIGATES', 'DERIVED_FROM', 'PART_OF', 'BELONGS_TO', 'REFERENCES',
  'PRODUCES', 'CONSUMES', 'MANAGES', 'DESCRIBES', 'EVALUATES',
  'TAKES', 'CONTAINS', 'TESTS', 'VALIDATES', 'CITES',
];

const VOCAB_FORMATS = [
  { value: 'plain-list', label: 'Plain list'  },
  { value: 'skos',       label: 'SKOS'        },
  { value: 'csv',        label: 'CSV'         },
  { value: 'json',       label: 'JSON'        },
  { value: 'yaml',       label: 'YAML'        },
];

const DOMAIN_ONTOLOGIES = [
  { id: 'schema',  name: 'schema.org',    desc: 'Web-oriented structured data vocabulary',               domain: 'General'       },
  { id: 'dc',      name: 'Dublin Core',   desc: 'Metadata element set for documents and resources',     domain: 'Metadata'      },
  { id: 'skos',    name: 'SKOS',          desc: 'Simple Knowledge Organization System for vocabularies', domain: 'Vocabulary'    },
  { id: 'prov',    name: 'PROV-O',        desc: 'W3C provenance ontology for tracking data origin',     domain: 'Provenance'    },
  { id: 'foaf',    name: 'FOAF',          desc: 'Friend of a Friend — people and social networks',      domain: 'Social'        },
  { id: 'owl',     name: 'OWL 2',         desc: 'W3C Web Ontology Language',                            domain: 'Meta-ontology' },
  { id: 'bfo',     name: 'BFO',           desc: 'Basic Formal Ontology — upper-level ontology',         domain: 'Upper'         },
  { id: 'fibo',    name: 'FIBO',          desc: 'Financial Industry Business Ontology',                 domain: 'Finance'       },
  { id: 'iao',     name: 'IAO',           desc: 'Information Artifact Ontology',                        domain: 'Information'   },
  { id: 'custom',  name: 'Custom',        desc: 'In-house domain-specific ontology',                    domain: 'Custom'        },
];

// ─── Default / seed state ─────────────────────────────────────────────────────

const DEFAULT_ENTITIES = [
  {
    id: 'ent-1', name: 'Person',
    description: 'An individual human: test-taker, examiner, or researcher.',
    properties: ['id', 'name', 'role', 'organization', 'email'],
    instanceCount: '', status: 'stable',
  },
  {
    id: 'ent-2', name: 'Test',
    description: 'A psychometric test or assessment instrument.',
    properties: ['id', 'name', 'version', 'domain', 'item_count', 'duration_min'],
    instanceCount: '', status: 'stable',
  },
  {
    id: 'ent-3', name: 'Construct',
    description: 'A latent psychological trait or ability being measured.',
    properties: ['id', 'name', 'domain', 'definition', 'references'],
    instanceCount: '', status: 'reviewed',
  },
  {
    id: 'ent-4', name: 'Item',
    description: 'A single test question, stimulus, or task.',
    properties: ['id', 'content', 'difficulty', 'discrimination', 'format', 'tags'],
    instanceCount: '', status: 'draft',
  },
];

const DEFAULT_RELS = [
  { id: 'rel-1', subjectType: 'Test',   predicate: 'MEASURES',  objectType: 'Construct', cardinality: 'M:N', description: 'A test measures one or more psychological constructs.',              status: 'stable'   },
  { id: 'rel-2', subjectType: 'Person', predicate: 'TAKES',     objectType: 'Test',      cardinality: '1:N', description: 'A person can sit multiple test administrations.',                  status: 'stable'   },
  { id: 'rel-3', subjectType: 'Test',   predicate: 'CONTAINS',  objectType: 'Item',      cardinality: '1:N', description: 'A test is composed of one or more items.',                         status: 'reviewed' },
  { id: 'rel-4', subjectType: 'Item',   predicate: 'EVALUATES', objectType: 'Construct', cardinality: 'M:N', description: 'An item provides evidence about one or more latent constructs.',   status: 'draft'    },
];

const DEFAULT_STATE = {
  ontoFiles: [],
  entities:  DEFAULT_ENTITIES,
  relationships: DEFAULT_RELS,
  vocabSets: [],
  domainAlignment: Object.fromEntries(
    DOMAIN_ONTOLOGIES.map(o => [o.id, { aligned: false, coverage: '', file: '' }])
  ),
  versioning: {
    currentVersion: '',
    entries: [],
  },
};

// ─── Readiness score ──────────────────────────────────────────────────────────

function computeReadiness(s) {
  const stableEntities = s.entities.filter(e => e.status === 'stable').length;
  const alignedCount   = Object.values(s.domainAlignment).filter(v => v.aligned).length;
  const criteria = [
    {
      label:   'Entity types defined (≥ 3 stable)',
      met:     stableEntities >= 3,
      partial: s.entities.length >= 3,
    },
    {
      label:   'Entity properties documented',
      met:     s.entities.every(e => e.properties.length >= 2),
      partial: s.entities.some(e => e.properties.length >= 1),
    },
    {
      label:   'Relationship schema present (≥ 3)',
      met:     s.relationships.length >= 3,
      partial: s.relationships.length >= 1,
    },
    {
      label:   'Ontology file registered',
      met:     s.ontoFiles.some(f => f.status === 'validated'),
      partial: s.ontoFiles.length > 0,
    },
    {
      label:   'Controlled vocabulary maintained (≥ 1)',
      met:     s.vocabSets.length >= 1,
      partial: false,
    },
    {
      label:   'Domain ontology alignment (≥ 1)',
      met:     alignedCount >= 2,
      partial: alignedCount >= 1,
    },
    {
      label:   'Schema versioning in place',
      met:     s.versioning.currentVersion !== '' && s.versioning.entries.length >= 1,
      partial: s.versioning.currentVersion !== '',
    },
  ];
  const score = criteria.reduce((n, c) => n + (c.met ? 1 : c.partial ? 0.5 : 0), 0);
  return { criteria, score, max: criteria.length };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function statusColor(value, opts) {
  return (opts.find(o => o.value === value) || opts[0]).color;
}

function StatusPill({ value, opts, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {opts.map(o => (
        <button key={o.value} onClick={() => onChange?.(o.value)} style={{
          padding: '2px 10px', borderRadius: 20, cursor: onChange ? 'pointer' : 'default',
          fontSize: 10, fontWeight: 600,
          border: `1px solid ${value === o.value ? o.color : 'rgba(255,255,255,0.1)'}`,
          background: value === o.value ? `${o.color}18` : 'transparent',
          color: value === o.value ? o.color : 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

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

function SectionCard({ icon: Icon, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left',
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
        {badge != null && (
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
      {open && (
        <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)',
};

const dangerBtn = {
  ...ghostBtn, color: '#ef4444',
  border: '1px solid rgba(239,68,68,0.25)',
  background: 'rgba(239,68,68,0.05)',
};

// ─── Entity modal ─────────────────────────────────────────────────────────────

function EntityModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const [propInput, setPropInput] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addProp = (raw) => {
    const p = raw.trim().toLowerCase().replace(/\s+/g, '_');
    if (p && !form.properties.includes(p)) set('properties', [...form.properties, p]);
    setPropInput('');
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
            {form.id ? 'Edit Entity Type' : 'Add Entity Type'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Entity Name" span2>
              <input style={inputSx} value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Person, Test, Construct…" />
            </FL>
            <FL label="Status">
              <StatusPill value={form.status} opts={ENTITY_STATUSES}
                onChange={v => set('status', v)} />
            </FL>
            <FL label="Instance Count (est.)">
              <input style={inputSx} type="number" value={form.instanceCount}
                onChange={e => set('instanceCount', e.target.value)}
                placeholder="0" />
            </FL>
            <FL label="Description" span2>
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 64 }}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="What this entity represents…" />
            </FL>
          </div>

          {/* Properties */}
          <FL label="Properties (key fields)">
            {form.properties.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                {form.properties.map(p => (
                  <span key={p} style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    padding: '2px 8px 2px 9px', borderRadius: 10,
                    background: cr(0.08), border: `1px solid ${cr(0.3)}`,
                    fontSize: 11, color: ACC, fontFamily: 'monospace',
                  }}>
                    {p}
                    <button onClick={() => set('properties', form.properties.filter(x => x !== p))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: ACC, opacity: 0.6, padding: 0, fontSize: 14, lineHeight: 1 }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input style={inputSx} value={propInput}
              onChange={e => setPropInput(e.target.value)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addProp(propInput))}
              placeholder="Type a field name and press Enter…" />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
          }}>Cancel</button>
          <button onClick={() => form.name.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.name.trim() ? 1 : 0.4,
          }}>
            {form.id ? 'Save Changes' : 'Add Entity'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Relationship modal ───────────────────────────────────────────────────────

function RelModal({ initial, entityNames, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const [predInput, setPredInput] = useState(form.predicate);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 520, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit Relationship' : 'Add Relationship'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Triple row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                Subject Type
              </label>
              <select style={selectSx} value={form.subjectType}
                onChange={e => set('subjectType', e.target.value)}>
                <option value="">— select —</option>
                {entityNames.map(n => <option key={n}>{n}</option>)}
                <option value="*">Any</option>
              </select>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 18, paddingTop: 18 }}>→</div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                Object Type
              </label>
              <select style={selectSx} value={form.objectType}
                onChange={e => set('objectType', e.target.value)}>
                <option value="">— select —</option>
                {entityNames.map(n => <option key={n}>{n}</option>)}
                <option value="*">Any</option>
              </select>
            </div>
          </div>

          {/* Predicate + cardinality */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Predicate">
              <input style={{ ...inputSx, fontFamily: 'monospace', fontWeight: 700,
                color: ACC, textTransform: 'uppercase' }}
                value={predInput}
                onChange={e => { setPredInput(e.target.value); set('predicate', e.target.value.toUpperCase()); }}
                placeholder="PREDICATE" />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                {PREDICATE_SUGGESTIONS.filter(p => !p.includes(predInput.toUpperCase()) || predInput === '').slice(0, 8).map(p => (
                  <button key={p} onClick={() => { setPredInput(p); set('predicate', p); }} style={{
                    padding: '1px 7px', borderRadius: 8, cursor: 'pointer', fontSize: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-muted)', fontFamily: 'monospace',
                  }}>
                    {p}
                  </button>
                ))}
              </div>
            </FL>
            <FL label="Cardinality">
              <div style={{ display: 'flex', gap: 6 }}>
                {CARDINALITIES.map(c => (
                  <button key={c} onClick={() => set('cardinality', c)} style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: 'monospace',
                    border: `1px solid ${form.cardinality === c ? ACC : 'rgba(255,255,255,0.1)'}`,
                    background: form.cardinality === c ? cr(0.12) : 'transparent',
                    color: form.cardinality === c ? ACC : 'var(--text-muted)',
                  }}>
                    {c}
                  </button>
                ))}
              </div>
            </FL>
          </div>

          <FL label="Description">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 60 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What this relationship means…" />
          </FL>

          <FL label="Status">
            <StatusPill value={form.status} opts={REL_STATUSES}
              onChange={v => set('status', v)} />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
          }}>Cancel</button>
          <button
            onClick={() => form.predicate.trim() && form.subjectType && form.objectType && onSave(form)}
            style={{
              padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
              opacity: (form.predicate.trim() && form.subjectType && form.objectType) ? 1 : 0.4,
            }}>
            {form.id ? 'Save Changes' : 'Add Relationship'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ontology file modal ──────────────────────────────────────────────────────

function FileModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
            {form.id ? 'Edit Ontology File' : 'Register Ontology File'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: '18px 22px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FL label="Filename" span2>
            <input style={inputSx} value={form.filename}
              onChange={e => set('filename', e.target.value)}
              placeholder="e.g. psychometrics-core.ttl" />
          </FL>
          <FL label="Format">
            <select style={selectSx} value={form.format}
              onChange={e => set('format', e.target.value)}>
              {ONTO_FORMATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </FL>
          <FL label="Status">
            <select style={selectSx} value={form.status}
              onChange={e => set('status', e.target.value)}>
              {FILE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FL>
          <FL label="File Path" span2>
            <input style={inputSx} value={form.path}
              onChange={e => set('path', e.target.value)}
              placeholder="e.g. ontology/core.ttl or /opt/kb/schema.owl" />
          </FL>
          <FL label="Description" span2>
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 56 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What this file defines…" />
          </FL>
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
          }}>Cancel</button>
          <button onClick={() => form.filename.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.filename.trim() ? 1 : 0.4,
          }}>
            {form.id ? 'Save' : 'Register File'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vocab set modal ──────────────────────────────────────────────────────────

function VocabModal({ initial, onSave, onClose }) {
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
            {form.id ? 'Edit Vocabulary Set' : 'Add Vocabulary Set'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: '18px 22px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FL label="Name" span2>
            <input style={inputSx} value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Spatial Ability Terms, IRT Terminology…" />
          </FL>
          <FL label="Format">
            <select style={selectSx} value={form.format}
              onChange={e => set('format', e.target.value)}>
              {VOCAB_FORMATS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </FL>
          <FL label="Term Count (est.)">
            <input style={inputSx} type="number" value={form.termCount}
              onChange={e => set('termCount', e.target.value)} placeholder="0" />
          </FL>
          <FL label="File Path" span2>
            <input style={inputSx} value={form.path}
              onChange={e => set('path', e.target.value)}
              placeholder="e.g. vocab/spatial-ability.skos.ttl" />
          </FL>
          <FL label="Description" span2>
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Domain covered, source, notes…" />
          </FL>
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-muted)',
          }}>Cancel</button>
          <button onClick={() => form.name.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
            fontSize: 12, fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.name.trim() ? 1 : 0.4,
          }}>
            {form.id ? 'Save' : 'Add Vocabulary'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function OntologySchemaTab({ papers = [] }) {
  const [s, setS] = useState(DEFAULT_STATE);
  const [promotedDefIds, setPromotedDefIds] = useState(new Set());

  // Modal state
  const [entModal,   setEntModal]   = useState(null); // null | entity object
  const [relModal,   setRelModal]   = useState(null);
  const [fileModal,  setFileModal]  = useState(null);
  const [vocabModal, setVocabModal] = useState(null);

  const readiness = computeReadiness(s);
  const entityNames = s.entities.map(e => e.name);

  // Aggregate all definitions extracted from papers
  const paperDefs = useMemo(() => {
    const items = [];
    papers.forEach(paper => {
      const ref = [paper.authors ? paper.authors.split(',')[0].trim() : null, paper.year]
        .filter(Boolean).join(', ');
      (paper.definitions || []).forEach(d => items.push({
        ...d, paperTitle: paper.title, paperRef: ref, paperId: paper.id,
      }));
    });
    return items;
  }, [papers]);

  // Check if a term matches an existing entity type
  const entityNameSet = useMemo(
    () => new Set(s.entities.map(e => e.name.toLowerCase())),
    [s.entities]
  );

  // Promote a definition → create/update a "From Papers" vocabSet and bump termCount
  const promoteToVocab = (def) => {
    const VOCAB_ID = 'vocab-from-papers';
    setS(prev => {
      const existing = prev.vocabSets.find(v => v.id === VOCAB_ID);
      const currentCount = parseInt(existing?.termCount || '0', 10);
      if (existing) {
        return {
          ...prev,
          vocabSets: prev.vocabSets.map(v => v.id === VOCAB_ID
            ? { ...v, termCount: String(currentCount + 1) } : v),
        };
      }
      return {
        ...prev,
        vocabSets: [...prev.vocabSets, {
          id: VOCAB_ID, name: 'Extracted from Papers', format: 'plain-list',
          termCount: '1', path: '', description: 'Terms promoted from paper highlights.',
          status: 'draft',
        }],
      };
    });
    setPromotedDefIds(prev => new Set([...prev, def.id]));
  };

  const scoreColor = readiness.score >= readiness.max * 0.85 ? ACC
    : readiness.score >= readiness.max * 0.5 ? '#fbbf24'
    : '#ef4444';
  const scoreLabel = readiness.score >= readiness.max * 0.85 ? 'Ready'
    : readiness.score >= readiness.max * 0.5 ? 'Partial'
    : 'Not Ready';

  // ── Generic CRUD helpers ──────────────────────────────────────────────────
  const upsert = (key, item) =>
    setS(prev => {
      const exists = prev[key].some(x => x.id === item.id);
      return { ...prev, [key]: exists ? prev[key].map(x => x.id === item.id ? item : x) : [...prev[key], item] };
    });

  const remove = (key, id) =>
    setS(prev => ({ ...prev, [key]: prev[key].filter(x => x.id !== id) }));

  const newId = (prefix) => `${prefix}-${Date.now()}`;

  const saveEntity   = (e)  => { upsert('entities',      e); setEntModal(null);   };
  const saveRel      = (r)  => { upsert('relationships', r); setRelModal(null);   };
  const saveFile     = (f)  => { upsert('ontoFiles',     f); setFileModal(null);  };
  const saveVocab    = (v)  => { upsert('vocabSets',     v); setVocabModal(null); };

  const setAlignment = (id, patch) =>
    setS(prev => ({
      ...prev,
      domainAlignment: {
        ...prev.domainAlignment,
        [id]: { ...prev.domainAlignment[id], ...patch },
      },
    }));

  const setVersioning = (patch) =>
    setS(prev => ({ ...prev, versioning: { ...prev.versioning, ...patch } }));

  const addVersionEntry = () => {
    const entry = { id: newId('ver'), version: '', date: '', description: '', breaking: false, hasMigration: false };
    setS(prev => ({ ...prev, versioning: { ...prev.versioning, entries: [entry, ...prev.versioning.entries] } }));
  };

  const setVersionEntry = (id, patch) =>
    setS(prev => ({
      ...prev,
      versioning: {
        ...prev.versioning,
        entries: prev.versioning.entries.map(e => e.id === id ? { ...e, ...patch } : e),
      },
    }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Definitions from Papers ── */}
      <SectionCard
        icon={BookMarked}
        title="Definitions from Papers"
        badge={paperDefs.length > 0 ? `${paperDefs.length} term${paperDefs.length !== 1 ? 's' : ''}` : 'empty'}
        defaultOpen={paperDefs.length > 0}
      >
        {paperDefs.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No definitions extracted yet. Open a paper in the Literature tab, highlight a term definition, and use "Extract as Definition" in the KB actions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {paperDefs.map(def => {
              const promoted     = promotedDefIds.has(def.id);
              const entityMatch  = entityNameSet.has(def.term.toLowerCase());
              return (
                <div key={def.id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'color-mix(in srgb, #a78bfa 4%, transparent)',
                  border: `1px solid ${promoted ? '#a78bfa55' : 'rgba(167,139,250,0.15)'}`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: ACC }}>
                        {def.term}
                      </span>
                      {entityMatch && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 6,
                          background: 'color-mix(in srgb, #34d399 12%, transparent)',
                          border: '1px solid #34d39944', color: '#34d399',
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                        }}>
                          matches entity type
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 5 }}>
                      {def.definition.length > 120 ? def.definition.slice(0, 120) + '…' : def.definition}
                    </div>
                    {def.tags?.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 5 }}>
                        {def.tags.map(t => (
                          <span key={t} style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 8,
                            background: 'color-mix(in srgb, #a78bfa 8%, transparent)',
                            border: '1px solid #a78bfa33', color: ACC,
                          }}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        fontSize: 10, padding: '1px 7px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--text-muted)',
                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {def.paperTitle.length > 28 ? def.paperTitle.slice(0, 28) + '…' : def.paperTitle}
                      </span>
                      {def.paperRef && <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.65 }}>{def.paperRef}</span>}
                      {def.sourcePage && (
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 8,
                          background: 'color-mix(in srgb, #a78bfa 10%, transparent)',
                          border: '1px solid #a78bfa33', color: ACC,
                        }}>p.{def.sourcePage}</span>
                      )}
                    </div>
                  </div>
                  {/* Promote button */}
                  <button
                    onClick={() => !promoted && promoteToVocab(def)}
                    style={{
                      flexShrink: 0, padding: '5px 10px', borderRadius: 6, cursor: promoted ? 'default' : 'pointer',
                      fontSize: 11, fontWeight: 600,
                      border: `1px solid ${promoted ? '#34d39944' : '#a78bfa44'}`,
                      background: promoted ? 'color-mix(in srgb, #34d399 8%, transparent)' : 'color-mix(in srgb, #a78bfa 8%, transparent)',
                      color: promoted ? '#34d399' : ACC,
                    }}
                    title={promoted ? 'Added to vocabulary' : 'Add to Controlled Vocabulary'}
                  >
                    {promoted ? '✓ In Vocab' : '+ Vocab'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Readiness score ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '18px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
              Ontology Readiness Score
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
                <span style={{ fontSize: 11, color: c.met ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  {c.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 1. Ontology Files ── */}
      <SectionCard icon={FileCode} title="Ontology Files"
        badge={`${s.ontoFiles.length} file${s.ontoFiles.length !== 1 ? 's' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.ontoFiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0',
              fontSize: 12, color: 'var(--text-muted)' }}>
              No ontology files registered.
            </div>
          ) : (
            s.ontoFiles.map(f => {
              const fc = statusColor(f.status, FILE_STATUSES);
              return (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 8, background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}`,
                    fontFamily: 'monospace', flexShrink: 0,
                  }}>
                    {f.format}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {f.filename}
                    </div>
                    {f.path && <div style={{ fontSize: 11, color: 'var(--text-muted)',
                      fontFamily: 'monospace' }}>{f.path}</div>}
                    {f.description && <div style={{ fontSize: 11, color: 'var(--text-muted)',
                      marginTop: 2 }}>{f.description}</div>}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
                    background: `${fc}18`, color: fc, border: `1px solid ${fc}44`,
                    textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                  }}>
                    {f.status}
                  </span>
                  <button onClick={() => setFileModal(f)} style={ghostBtn}><Edit2 size={11} /></button>
                  <button onClick={() => remove('ontoFiles', f.id)} style={dangerBtn}><Trash2 size={11} /></button>
                </div>
              );
            })
          )}
          <button onClick={() => setFileModal({ id: newId('f'), filename: '', format: '.ttl',
            path: '', description: '', status: 'detected' })}
            style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
              borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Register Ontology File
          </button>
        </div>
      </SectionCard>

      {/* ── 2. Entity Type Inventory ── */}
      <SectionCard icon={List} title="Entity Type Inventory"
        badge={`${s.entities.length} type${s.entities.length !== 1 ? 's' : ''}`}
        defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.entities.map(e => {
            const col = statusColor(e.status, ENTITY_STATUSES);
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 8, border: `1px solid rgba(255,255,255,0.08)`,
                background: 'rgba(255,255,255,0.02)',
              }}>
                {/* Name + status */}
                <div style={{ width: 140, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {e.name}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: `${col}18`, color: col, border: `1px solid ${col}44`,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>
                    {e.status}
                  </span>
                  {e.instanceCount && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      ~{Number(e.instanceCount).toLocaleString()} instances
                    </div>
                  )}
                </div>
                {/* Description + properties */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)',
                      marginBottom: 6, lineHeight: 1.5 }}>
                      {e.description}
                    </div>
                  )}
                  {e.properties.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {e.properties.map(p => (
                        <span key={p} style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 8,
                          background: cr(0.07), border: `1px solid ${cr(0.2)}`,
                          color: ACC, fontFamily: 'monospace',
                        }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setEntModal(e)} style={ghostBtn}><Edit2 size={11} /> Edit</button>
                <button onClick={() => remove('entities', e.id)} style={dangerBtn}><Trash2 size={11} /></button>
              </div>
            );
          })}
          <button
            onClick={() => setEntModal({ id: newId('ent'), name: '', description: '',
              properties: [], instanceCount: '', status: 'draft' })}
            style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
              borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Add Entity Type
          </button>
        </div>
      </SectionCard>

      {/* ── 3. Relationship Schema ── */}
      <SectionCard icon={Link2} title="Relationship Schema"
        badge={`${s.relationships.length} relation${s.relationships.length !== 1 ? 's' : ''}`}
        defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.relationships.map(r => {
            const col = statusColor(r.status, REL_STATUSES);
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 8, background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {/* Triple */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                  flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>
                    {r.subjectType}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: ACC,
                    fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                    {r.predicate}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)',
                    background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>
                    {r.objectType}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 5,
                    border: '1px solid rgba(255,255,255,0.08)' }}>
                    {r.cardinality}
                  </span>
                  {r.description && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)',
                      flexBasis: '100%', marginTop: 2 }}>
                      {r.description}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: `${col}18`, color: col, border: `1px solid ${col}44`,
                  textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0,
                }}>
                  {r.status}
                </span>
                <button onClick={() => setRelModal(r)} style={ghostBtn}><Edit2 size={11} /></button>
                <button onClick={() => remove('relationships', r.id)} style={dangerBtn}><Trash2 size={11} /></button>
              </div>
            );
          })}
          <button
            onClick={() => setRelModal({ id: newId('rel'), subjectType: entityNames[0] || '',
              predicate: '', objectType: entityNames[1] || '',
              cardinality: '1:N', description: '', status: 'draft' })}
            style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
              borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Add Relationship
          </button>
        </div>
      </SectionCard>

      {/* ── 4. Controlled Vocabulary ── */}
      <SectionCard icon={BookMarked} title="Controlled Vocabulary"
        badge={`${s.vocabSets.length} set${s.vocabSets.length !== 1 ? 's' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.vocabSets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0',
              fontSize: 12, color: 'var(--text-muted)' }}>
              No vocabulary sets registered.
            </div>
          ) : (
            s.vocabSets.map(v => {
              const fmt = VOCAB_FORMATS.find(f => f.value === v.format);
              return (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 8, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {v.name}
                      {v.termCount && (
                        <span style={{ marginLeft: 8, fontSize: 11,
                          color: 'var(--text-muted)', fontWeight: 400 }}>
                          ~{v.termCount} terms
                        </span>
                      )}
                    </div>
                    {v.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {v.description}
                      </div>
                    )}
                    {v.path && <div style={{ fontSize: 10, color: 'var(--text-muted)',
                      fontFamily: 'monospace', marginTop: 2 }}>{v.path}</div>}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 12,
                    background: cr(0.1), color: ACC, border: `1px solid ${cr(0.3)}`,
                    textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                  }}>
                    {fmt?.label ?? v.format}
                  </span>
                  <button onClick={() => setVocabModal(v)} style={ghostBtn}><Edit2 size={11} /></button>
                  <button onClick={() => remove('vocabSets', v.id)} style={dangerBtn}><Trash2 size={11} /></button>
                </div>
              );
            })
          )}
          <button
            onClick={() => setVocabModal({ id: newId('vocab'), name: '', format: 'plain-list',
              termCount: '', path: '', description: '' })}
            style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
              borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
            <Plus size={13} /> Add Vocabulary Set
          </button>
        </div>
      </SectionCard>

      {/* ── 5 + 6: Alignment + Versioning side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* 5. Domain Ontology Alignment */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={13} color={ACC} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              Domain Alignment
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              {Object.values(s.domainAlignment).filter(v => v.aligned).length} aligned
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DOMAIN_ONTOLOGIES.map(onto => {
              const a = s.domainAlignment[onto.id];
              return (
                <div key={onto.id} style={{
                  padding: '8px 10px', borderRadius: 8,
                  background: a.aligned ? cr(0.05) : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${a.aligned ? cr(0.22) : 'rgba(255,255,255,0.07)'}`,
                }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start',
                    gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={a.aligned}
                      onChange={e => setAlignment(onto.id, { aligned: e.target.checked })}
                      style={{ accentColor: ACC, marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: a.aligned ? 700 : 400,
                        color: a.aligned ? 'var(--text)' : 'var(--text-muted)' }}>
                        {onto.name}
                        <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6,
                          fontWeight: 400, color: 'var(--text-muted)' }}>
                          {onto.domain}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {onto.desc}
                      </div>
                      {a.aligned && (
                        <input style={{ ...inputSx, marginTop: 5, fontSize: 11 }}
                          value={a.coverage}
                          onChange={e => setAlignment(onto.id, { coverage: e.target.value })}
                          placeholder="Coverage notes or alignment file path…" />
                      )}
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6. Schema Versioning */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History size={13} color={ACC} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              Schema Versioning
            </span>
          </div>

          {/* Current version */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
              Current Version
            </label>
            <input style={{ ...inputSx, fontFamily: 'monospace', fontWeight: 700,
              fontSize: 14, color: ACC }}
              value={s.versioning.currentVersion}
              onChange={e => setVersioning({ currentVersion: e.target.value })}
              placeholder="e.g. 1.0.0" />
          </div>

          {/* Changelog entries */}
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'space-between' }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Changelog
            </label>
            <button onClick={addVersionEntry} style={{ ...ghostBtn, fontSize: 10, padding: '3px 8px' }}>
              <Plus size={11} /> Add Entry
            </button>
          </div>

          {s.versioning.entries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)',
              textAlign: 'center', padding: '12px 0' }}>
              No changelog entries yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.versioning.entries.map(e => (
                <div key={e.id} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${e.breaking ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...inputSx, fontFamily: 'monospace', fontWeight: 700, color: ACC }}
                      value={e.version}
                      onChange={ev => setVersionEntry(e.id, { version: ev.target.value })}
                      placeholder="1.0.0" />
                    <input style={inputSx} type="date" value={e.date}
                      onChange={ev => setVersionEntry(e.id, { date: ev.target.value })} />
                  </div>
                  <input style={{ ...inputSx, marginBottom: 6 }}
                    value={e.description}
                    onChange={ev => setVersionEntry(e.id, { description: ev.target.value })}
                    placeholder="What changed in this version…" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer', fontSize: 11,
                      color: e.breaking ? '#ef4444' : 'var(--text-muted)' }}>
                      <input type="checkbox" checked={e.breaking}
                        onChange={ev => setVersionEntry(e.id, { breaking: ev.target.checked })}
                        style={{ accentColor: '#ef4444' }} />
                      <AlertTriangle size={11} /> Breaking change
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer', fontSize: 11,
                      color: e.hasMigration ? ACC : 'var(--text-muted)' }}>
                      <input type="checkbox" checked={e.hasMigration}
                        onChange={ev => setVersionEntry(e.id, { hasMigration: ev.target.checked })}
                        style={{ accentColor: ACC }} />
                      Migration script present
                    </label>
                    <button onClick={() => setS(prev => ({
                      ...prev, versioning: {
                        ...prev.versioning,
                        entries: prev.versioning.entries.filter(x => x.id !== e.id),
                      },
                    }))} style={{ ...dangerBtn, marginLeft: 'auto', padding: '2px 6px' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {entModal   && <EntityModal initial={entModal}   onSave={saveEntity} onClose={() => setEntModal(null)}   />}
      {relModal   && <RelModal    initial={relModal}   entityNames={entityNames} onSave={saveRel} onClose={() => setRelModal(null)}   />}
      {fileModal  && <FileModal   initial={fileModal}  onSave={saveFile}  onClose={() => setFileModal(null)}  />}
      {vocabModal && <VocabModal  initial={vocabModal} onSave={saveVocab} onClose={() => setVocabModal(null)} />}
    </div>
  );
}
