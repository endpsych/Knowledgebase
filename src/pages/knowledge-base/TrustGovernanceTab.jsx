/* """
src/pages/knowledge-base/TrustGovernanceTab.jsx
------------------------------------------------
Trust & Governance tab — audit and configure the governance layer of the KB.
Seven sections: provenance coverage, approval workflow, versioning model,
deprecation & expiry, permissions & confidentiality, contradiction detection,
and confidence scoring. Plus a live readiness score card.
""" */

import { useState, useMemo } from 'react';
import {
  ShieldCheck, Fingerprint, GitMerge, Clock3,
  Archive, Lock, AlertOctagon, BarChart3,
  CheckCircle2, AlertCircle, Circle,
  Plus, Edit2, Trash2, X,
  ChevronDown, ChevronRight, ArrowRight,
  Lightbulb, Check,
} from 'lucide-react';

// ─── Theme ────────────────────────────────────────────────────────────────────

const ACC = '#2dd4bf'; // teal-400
const cr  = (a) => `rgba(45,212,191,${a})`;

// ─── Static data ──────────────────────────────────────────────────────────────

const PROVENANCE_FIELDS = [
  { key: 'sourceFile',     label: 'source_file',      desc: 'Path or URI of the originating document'             },
  { key: 'section',        label: 'section',          desc: 'Section or heading within the document'              },
  { key: 'pageNumber',     label: 'page_number',      desc: 'Page number for paginated documents'                  },
  { key: 'extractionDate', label: 'extraction_date',  desc: 'Timestamp when the chunk / fact was extracted'        },
  { key: 'extractorId',    label: 'extractor_id',     desc: 'ID of the tool or pipeline step that ran'             },
  { key: 'confidence',     label: 'confidence',       desc: 'Confidence score for the extracted content'           },
  { key: 'chunkId',        label: 'chunk_id',         desc: 'Unique identifier for this chunk'                     },
  { key: 'documentId',     label: 'document_id',      desc: 'Parent document identifier'                           },
  { key: 'humanReviewed',  label: 'human_reviewed',   desc: 'Boolean flag — was this verified by a human?'         },
  { key: 'sourceCount',    label: 'source_count',     desc: 'How many sources corroborate this fact'               },
];

const PROV_GRANULARITY = [
  { value: 'per-chunk',    label: 'Per chunk'    },
  { value: 'per-fact',     label: 'Per fact'     },
  { value: 'both',         label: 'Both'         },
  { value: 'per-document', label: 'Per document' },
];

const WORKFLOW_TOOL_OPTIONS = [
  'None / Manual', 'GitHub PRs', 'GitLab MRs', 'Jira', 'Linear',
  'Notion', 'Confluence', 'Custom internal tool',
];

const VERSIONING_STRATEGIES = [
  { value: 'semantic',    label: 'Semantic (1.0.0)' },
  { value: 'integer',     label: 'Integer (1, 2, 3)' },
  { value: 'date-based',  label: 'Date-based (2025-01-15)' },
  { value: 'hash-based',  label: 'Hash-based (git SHA)' },
];

const ACCESS_CONTROL_TYPES = [
  { value: 'rbac',   label: 'RBAC — Role-based'      },
  { value: 'abac',   label: 'ABAC — Attribute-based' },
  { value: 'dac',    label: 'DAC — Discretionary'    },
  { value: 'custom', label: 'Custom'                 },
  { value: 'none',   label: 'None enforced'          },
];

const DEDUP_METHODS = [
  { key: 'duplicateFacts',         label: 'Duplicate fact detection',       desc: 'Flag identical S-P-O triples from different sources'            },
  { key: 'conflictingAttributes',  label: 'Conflicting attribute detection', desc: 'Flag entities with contradictory attribute values'              },
  { key: 'sourcePriority',         label: 'Source priority rules',           desc: 'Define which sources win when conflicts arise'                  },
  { key: 'semanticSimilarity',     label: 'Semantic similarity check',       desc: 'Detect near-duplicate claims using embedding similarity'        },
  { key: 'humanReview',            label: 'Human review queue',              desc: 'Route detected conflicts to a human reviewer for resolution'    },
];

const CONFIDENCE_METHODS = [
  { value: 'rule-based', label: 'Rule-based'  },
  { value: 'llm-based',  label: 'LLM-based'   },
  { value: 'human-only', label: 'Human only'  },
  { value: 'hybrid',     label: 'Hybrid'      },
];

const CONFIDENCE_RANGES = [
  { value: '0-1',   label: '0 – 1 (float)' },
  { value: '0-100', label: '0 – 100 (int)' },
  { value: '1-5',   label: '1 – 5 scale'   },
];

const PRESET_COLORS = [
  '#64748b', '#38bdf8', '#34d399', '#a78bfa',
  '#fbbf24', '#fb923c', '#f97316', '#ef4444', '#2dd4bf',
];

// ─── Default state ────────────────────────────────────────────────────────────

const DEFAULT_WORKFLOW_STATES = [
  { id: 'ws-1', label: 'Draft',       color: '#64748b', description: 'Content being authored or extracted',          isTerminal: false },
  { id: 'ws-2', label: 'In Review',   color: '#fbbf24', description: 'Under human review or expert validation',      isTerminal: false },
  { id: 'ws-3', label: 'Approved',    color: '#34d399', description: 'Verified and approved for use in the KB',     isTerminal: false },
  { id: 'ws-4', label: 'Deprecated',  color: '#f97316', description: 'Superseded or outdated; kept for history',    isTerminal: false },
  { id: 'ws-5', label: 'Archived',    color: '#ef4444', description: 'Inactive, retained only for audit purposes',  isTerminal: true  },
];

const DEFAULT_CLASS_LEVELS = [
  { id: 'cl-1', label: 'Public',       color: '#34d399', description: 'Accessible to anyone',               accessRoles: 'everyone'      },
  { id: 'cl-2', label: 'Internal',     color: '#38bdf8', description: 'Accessible to all staff',            accessRoles: 'all_staff'     },
  { id: 'cl-3', label: 'Restricted',   color: '#fbbf24', description: 'Limited to specific teams only',     accessRoles: 'team_lead+'    },
  { id: 'cl-4', label: 'Confidential', color: '#ef4444', description: 'Highly sensitive, need-to-know',     accessRoles: 'admin'         },
];

const DEFAULT_STATE = {
  provenance: {
    fields: Object.fromEntries(
      PROVENANCE_FIELDS.map(f => [f.key, { present: false, fieldName: f.label }])
    ),
    granularity: 'per-chunk',
    storageLocation: '',
    notes: '',
  },
  workflow: {
    states: DEFAULT_WORKFLOW_STATES,
    hasReviewDateTracking: false,
    hasApproverField: false,
    hasRejectReason: false,
    toolIntegration: 'None / Manual',
    notes: '',
  },
  versioning: {
    hasVersionField: false,
    hasVersionHistory: false,
    hasDiffTracking: false,
    hasMigrationScripts: false,
    versionFieldName: 'version',
    historyTableName: '',
    strategy: 'semantic',
    notes: '',
  },
  deprecation: {
    hasDeprecatedAt: false,
    hasExpiryDate: false,
    hasStaleContentFlagging: false,
    hasSuccessorLink: false,
    staleThresholdDays: 180,
    process: '',
    notes: '',
  },
  permissions: {
    classificationLevels: DEFAULT_CLASS_LEVELS,
    hasAccessControl: false,
    hasFieldLevelSecurity: false,
    accessControlType: 'rbac',
    notes: '',
  },
  contradictions: {
    methods: Object.fromEntries(DEDUP_METHODS.map(m => [m.key, false])),
    hasResolutionWorkflow: false,
    resolutionDesc: '',
    alertThreshold: '',
    notes: '',
  },
  confidence: {
    hasPerFactConfidence: false,
    hasSourceCount: false,
    hasHumanReviewedFlag: false,
    hasAutoExtractedFlag: false,
    scoringMethod: 'hybrid',
    range: '0-1',
    fieldName: 'confidence',
    highThreshold: '',
    lowThreshold: '',
    notes: '',
  },
};

// ─── Readiness score ──────────────────────────────────────────────────────────

function computeReadiness(s) {
  const provCount    = Object.values(s.provenance.fields).filter(f => f.present).length;
  const provCritical = s.provenance.fields.sourceFile?.present && s.provenance.fields.extractionDate?.present;
  const dedupCount   = Object.values(s.contradictions.methods).filter(Boolean).length;
  const classCount   = s.permissions.classificationLevels.length;

  const criteria = [
    {
      label:   'Provenance covers ≥ 5 fields incl. source + date',
      met:     provCount >= 5 && provCritical,
      partial: provCount >= 3 || provCritical,
    },
    {
      label:   'Approval workflow has ≥ 3 states',
      met:     s.workflow.states.length >= 3 && s.workflow.hasApproverField,
      partial: s.workflow.states.length >= 3,
    },
    {
      label:   'Versioning model has field + history table',
      met:     s.versioning.hasVersionField && s.versioning.hasVersionHistory,
      partial: s.versioning.hasVersionField,
    },
    {
      label:   'Deprecation: deprecated_at + expiry date',
      met:     s.deprecation.hasDeprecatedAt && s.deprecation.hasExpiryDate,
      partial: s.deprecation.hasDeprecatedAt || s.deprecation.hasExpiryDate,
    },
    {
      label:   'Confidentiality classification ≥ 3 levels',
      met:     classCount >= 3 && s.permissions.hasAccessControl,
      partial: classCount >= 2,
    },
    {
      label:   'Contradiction detection + resolution workflow',
      met:     dedupCount >= 2 && s.contradictions.hasResolutionWorkflow,
      partial: dedupCount >= 1,
    },
    {
      label:   'Confidence scoring per fact + human-review flag',
      met:     s.confidence.hasPerFactConfidence && s.confidence.hasHumanReviewedFlag,
      partial: s.confidence.hasPerFactConfidence,
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

function SL({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
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

function ToggleRow({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
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

function CheckItem({ label, desc, checked, onChange, accent }) {
  const col = accent || ACC;
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
      padding: '6px 8px', borderRadius: 7,
      background: checked ? `${col}0d` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${checked ? col + '40' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: col, marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: checked ? 600 : 400,
          color: checked ? 'var(--text)' : 'var(--text-muted)' }}>
          {label}
        </div>
        {desc && <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</div>}
      </div>
    </label>
  );
}

function SectionCard({ icon: Icon, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%',
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: cr(0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={ACC} />
        </div>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
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

function InlinePanel({ icon: Icon, title, rightLabel, children }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: cr(0.1),
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color={ACC} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1 }}>{title}</span>
        {rightLabel && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rightLabel}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Workflow state modal ─────────────────────────────────────────────────────

function WorkflowStateModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit State' : 'Add Workflow State'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="State Label">
            <input style={inputSx} value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="e.g. In Review, Approved, Deprecated…" />
          </FL>
          <FL label="Color">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => set('color', c)} style={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                  background: c, border: `2px solid ${form.color === c ? '#fff' : 'transparent'}`,
                  boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none',
                  flexShrink: 0,
                }} />
              ))}
              <input type="color" value={form.color}
                onChange={e => set('color', e.target.value)}
                style={{ width: 26, height: 26, borderRadius: 4, cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.2)', background: 'none', padding: 1 }} />
            </div>
          </FL>
          <FL label="Description">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What this state means in the workflow…" />
          </FL>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            fontSize: 12, color: form.isTerminal ? '#ef4444' : 'var(--text-muted)' }}>
            <input type="checkbox" checked={form.isTerminal}
              onChange={e => set('isTerminal', e.target.checked)}
              style={{ accentColor: '#ef4444' }} />
            Terminal state (no further transitions)
          </label>
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button onClick={() => form.label.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.label.trim() ? 1 : 0.4 }}>
            {form.id ? 'Save' : 'Add State'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Classification level modal ───────────────────────────────────────────────

function ClassLevelModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, width: 420, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 22px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {form.id ? 'Edit Level' : 'Add Classification Level'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--text-muted)' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="Level Label">
            <input style={inputSx} value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="e.g. Public, Internal, Confidential…" />
          </FL>
          <FL label="Color">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => set('color', c)} style={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                  background: c, border: `2px solid ${form.color === c ? '#fff' : 'transparent'}`,
                  boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none', flexShrink: 0,
                }} />
              ))}
            </div>
          </FL>
          <FL label="Description">
            <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
              lineHeight: 1.5, minHeight: 52 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Who can access content at this level…" />
          </FL>
          <FL label="Access Roles">
            <input style={inputSx} value={form.accessRoles}
              onChange={e => set('accessRoles', e.target.value)}
              placeholder="e.g. admin, team_lead, all_staff" />
          </FL>
        </div>
        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button onClick={() => form.label.trim() && onSave(form)} style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            fontWeight: 600, background: ACC, border: 'none', color: '#0f172a',
            opacity: form.label.trim() ? 1 : 0.4 }}>
            {form.id ? 'Save' : 'Add Level'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function TrustGovernanceTab({ papers = [] }) {
  const [s, setS]           = useState(DEFAULT_STATE);
  const [wsModal,  setWsModal]  = useState(null); // workflow state modal
  const [clModal,  setClModal]  = useState(null); // classification level modal
  const [reviewFilter,    setReviewFilter]    = useState('all');   // 'all' | 'low' | 'reviewed'
  const [reviewedClaimIds, setReviewedClaimIds] = useState(new Set());
  const [flaggedClaimIds,  setFlaggedClaimIds]  = useState(new Set());

  const set = (section, patch) =>
    setS(prev => ({ ...prev, [section]: { ...prev[section], ...patch } }));

  const setProvField = (key, patch) =>
    setS(prev => ({
      ...prev,
      provenance: {
        ...prev.provenance,
        fields: { ...prev.provenance.fields, [key]: { ...prev.provenance.fields[key], ...patch } },
      },
    }));

  const upsertWS = (ws) =>
    setS(prev => {
      const exists = prev.workflow.states.some(x => x.id === ws.id);
      return {
        ...prev,
        workflow: {
          ...prev.workflow,
          states: exists
            ? prev.workflow.states.map(x => x.id === ws.id ? ws : x)
            : [...prev.workflow.states, ws],
        },
      };
    });

  const removeWS = (id) =>
    setS(prev => ({ ...prev,
      workflow: { ...prev.workflow, states: prev.workflow.states.filter(x => x.id !== id) } }));

  const upsertCL = (cl) =>
    setS(prev => {
      const exists = prev.permissions.classificationLevels.some(x => x.id === cl.id);
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          classificationLevels: exists
            ? prev.permissions.classificationLevels.map(x => x.id === cl.id ? cl : x)
            : [...prev.permissions.classificationLevels, cl],
        },
      };
    });

  const removeCL = (id) =>
    setS(prev => ({ ...prev,
      permissions: { ...prev.permissions,
        classificationLevels: prev.permissions.classificationLevels.filter(x => x.id !== id) } }));

  const setContraMethod = (key, val) =>
    setS(prev => ({
      ...prev,
      contradictions: { ...prev.contradictions,
        methods: { ...prev.contradictions.methods, [key]: val } },
    }));

  const newId = (p) => `${p}-${Date.now()}`;

  const readiness = computeReadiness(s);
  const scoreColor = readiness.score >= readiness.max * 0.85 ? ACC
    : readiness.score >= readiness.max * 0.5 ? '#fbbf24' : '#ef4444';
  const scoreLabel = readiness.score >= readiness.max * 0.85 ? 'Ready'
    : readiness.score >= readiness.max * 0.5 ? 'Partial' : 'Not Ready';

  const provPresentCount = Object.values(s.provenance.fields).filter(f => f.present).length;

  // Aggregate all claims from papers, sorted low-confidence first
  const allClaims = useMemo(() => {
    const CONF_ORDER = { low: 0, medium: 1, high: 2, undefined: 1 };
    const items = [];
    papers.forEach(paper => {
      const ref = [paper.authors ? paper.authors.split(',')[0].trim() : null, paper.year]
        .filter(Boolean).join(', ');
      (paper.claims || []).forEach(cl => items.push({
        ...cl, paperTitle: paper.title, paperRef: ref, paperId: paper.id,
      }));
    });
    return items.sort((a, b) => (CONF_ORDER[a.confidence] ?? 1) - (CONF_ORDER[b.confidence] ?? 1));
  }, [papers]);

  const filteredClaims = useMemo(() => {
    if (reviewFilter === 'low')      return allClaims.filter(c => c.confidence === 'low' && !reviewedClaimIds.has(c.id));
    if (reviewFilter === 'reviewed') return allClaims.filter(c => reviewedClaimIds.has(c.id));
    return allClaims;
  }, [allClaims, reviewFilter, reviewedClaimIds]);

  const lowCount      = allClaims.filter(c => c.confidence === 'low'  && !reviewedClaimIds.has(c.id)).length;
  const reviewedCount = reviewedClaimIds.size;

  const CONF_COLORS = { low: '#ef4444', medium: '#fbbf24', high: '#34d399' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Claims Review Queue ── */}
      <SectionCard
        icon={Lightbulb}
        title="Claims Review Queue"
        badge={lowCount > 0 ? `${lowCount} need${lowCount === 1 ? 's' : ''} review` : allClaims.length > 0 ? `${reviewedCount}/${allClaims.length} reviewed` : 'empty'}
        defaultOpen={allClaims.length > 0}
      >
        {allClaims.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No claims extracted yet. Open a paper in the Literature tab, highlight a proposition, and use "Create KB Claim" in the KB actions.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stat row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', count: allClaims.length, color: ACC },
                { label: 'Low confidence', count: allClaims.filter(c => c.confidence === 'low').length, color: '#ef4444' },
                { label: 'Reviewed', count: reviewedCount, color: '#34d399' },
                { label: 'Flagged', count: flaggedClaimIds.size, color: '#fbbf24' },
              ].filter(s => s.count > 0).map(stat => (
                <div key={stat.label} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 8,
                  background: `color-mix(in srgb, ${stat.color} 8%, transparent)`,
                  border: `1px solid ${stat.color}33`,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: stat.color }}>{stat.count}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 5 }}>
              {[
                { key: 'all',      label: `All (${allClaims.length})` },
                { key: 'low',      label: `Needs Review (${lowCount})`,       color: '#ef4444' },
                { key: 'reviewed', label: `Reviewed (${reviewedCount})`,      color: '#34d399' },
              ].map(f => (
                <button key={f.key} onClick={() => setReviewFilter(f.key)} style={{
                  padding: '3px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
                  border: `1px solid ${reviewFilter === f.key ? (f.color || ACC) : 'rgba(255,255,255,0.1)'}`,
                  background: reviewFilter === f.key ? `color-mix(in srgb, ${f.color || ACC} 12%, transparent)` : 'transparent',
                  color: reviewFilter === f.key ? (f.color || ACC) : 'var(--text-muted)',
                  fontWeight: reviewFilter === f.key ? 600 : 400,
                }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Claim list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {filteredClaims.length === 0 ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  No claims match this filter.
                </div>
              ) : filteredClaims.map(claim => {
                const reviewed = reviewedClaimIds.has(claim.id);
                const flagged  = flaggedClaimIds.has(claim.id);
                const confColor = CONF_COLORS[claim.confidence] || '#94a3b8';
                return (
                  <div key={claim.id} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: reviewed
                      ? 'color-mix(in srgb, #34d399 4%, transparent)'
                      : flagged
                      ? 'color-mix(in srgb, #fbbf24 4%, transparent)'
                      : `color-mix(in srgb, ${confColor} 4%, transparent)`,
                    border: `1px solid ${reviewed ? '#34d39933' : flagged ? '#fbbf2433' : confColor + '33'}`,
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    {/* Confidence badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, flexShrink: 0, marginTop: 1,
                      background: `color-mix(in srgb, ${confColor} 15%, transparent)`,
                      border: `1px solid ${confColor}44`, color: confColor,
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                    }}>
                      {claim.confidence || '—'}
                    </span>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 4 }}>
                        {claim.text.length > 120 ? claim.text.slice(0, 120) + '…' : claim.text}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                          color: 'var(--text-muted)',
                          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {claim.paperTitle.length > 28 ? claim.paperTitle.slice(0, 28) + '…' : claim.paperTitle}
                        </span>
                        {claim.paperRef && <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.65 }}>{claim.paperRef}</span>}
                        {claim.sourcePage && (
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 8,
                            background: `color-mix(in srgb, ${confColor} 10%, transparent)`,
                            border: `1px solid ${confColor}33`, color: confColor,
                          }}>p.{claim.sourcePage}</span>
                        )}
                        {claim.tags?.map(t => (
                          <span key={t} style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 8,
                            background: `color-mix(in srgb, ${ACC} 8%, transparent)`,
                            border: `1px solid ${ACC}33`, color: ACC,
                          }}>{t}</span>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      {!reviewed ? (
                        <>
                          <button
                            onClick={() => setReviewedClaimIds(prev => new Set([...prev, claim.id]))}
                            style={{
                              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                              border: '1px solid #34d39944', background: 'color-mix(in srgb, #34d399 8%, transparent)',
                              color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                            }}
                            title="Mark as reviewed / approved"
                          >
                            <Check size={11} /> Approve
                          </button>
                          <button
                            onClick={() => setFlaggedClaimIds(prev => {
                              const n = new Set(prev);
                              n.has(claim.id) ? n.delete(claim.id) : n.add(claim.id);
                              return n;
                            })}
                            style={{
                              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                              border: `1px solid ${flagged ? '#fbbf2466' : 'rgba(255,255,255,0.1)'}`,
                              background: flagged ? 'color-mix(in srgb, #fbbf24 10%, transparent)' : 'transparent',
                              color: flagged ? '#fbbf24' : 'var(--text-muted)', fontWeight: 600,
                            }}
                            title="Flag for further review"
                          >
                            {flagged ? '⚑ Flagged' : '⚐ Flag'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setReviewedClaimIds(prev => { const n = new Set(prev); n.delete(claim.id); return n; })}
                          style={{
                            padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                            border: '1px solid #34d39933', background: 'color-mix(in srgb, #34d399 6%, transparent)',
                            color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                          }}
                          title="Undo approval"
                        >
                          <Check size={11} /> Approved
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Readiness score ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }}>
              Governance Readiness Score
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

      {/* ── 1. Provenance Coverage ── */}
      <SectionCard icon={Fingerprint} title="Provenance Coverage"
        badge={`${provPresentCount} / ${PROVENANCE_FIELDS.length} fields`}
        defaultOpen>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Field grid */}
          <div>
            <SL>Fields Present</SL>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PROVENANCE_FIELDS.map(f => {
                const val = s.provenance.fields[f.key];
                return (
                  <div key={f.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    borderRadius: 7,
                    background: val.present ? cr(0.06) : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${val.present ? cr(0.22) : 'rgba(255,255,255,0.06)'}`,
                  }}>
                    <input type="checkbox" checked={val.present}
                      onChange={e => setProvField(f.key, { present: e.target.checked })}
                      style={{ accentColor: ACC, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontFamily: 'monospace',
                        fontWeight: val.present ? 600 : 400,
                        color: val.present ? ACC : 'var(--text-muted)' }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                        {f.desc}
                      </div>
                    </div>
                    {val.present && (
                      <input style={{ ...inputSx, width: 130, fontSize: 10,
                        fontFamily: 'monospace', padding: '3px 7px' }}
                        value={val.fieldName}
                        onChange={e => setProvField(f.key, { fieldName: e.target.value })}
                        placeholder="field name" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FL label="Provenance Granularity">
              <ToggleRow options={PROV_GRANULARITY} value={s.provenance.granularity}
                onChange={v => set('provenance', { granularity: v })} />
            </FL>
            <FL label="Storage Location">
              <input style={inputSx} value={s.provenance.storageLocation}
                onChange={e => set('provenance', { storageLocation: e.target.value })}
                placeholder="e.g. metadata JSON field, separate prov table, graph edge" />
            </FL>
            {/* Coverage summary */}
            <div style={{ padding: '12px 14px', borderRadius: 9,
              background: cr(0.05), border: `1px solid ${cr(0.18)}` }}>
              <SL>Coverage Summary</SL>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { label: 'Source traceability', keys: ['sourceFile', 'section', 'pageNumber'] },
                  { label: 'Temporal metadata',   keys: ['extractionDate'] },
                  { label: 'Extractor identity',  keys: ['extractorId'] },
                  { label: 'Quality signals',     keys: ['confidence', 'humanReviewed', 'sourceCount'] },
                  { label: 'Internal linking',    keys: ['chunkId', 'documentId'] },
                ].map(group => {
                  const present = group.keys.filter(k => s.provenance.fields[k]?.present).length;
                  const total   = group.keys.length;
                  const pct     = Math.round((present / total) * 100);
                  const col     = pct === 100 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#64748b';
                  return (
                    <div key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 150, flexShrink: 0 }}>
                        {group.label}
                      </span>
                      <div style={{ flex: 1, height: 4, borderRadius: 99,
                        background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99,
                          width: `${pct}%`, background: col }} />
                      </div>
                      <span style={{ fontSize: 10, color: col, flexShrink: 0, minWidth: 28,
                        textAlign: 'right', fontWeight: 700 }}>
                        {present}/{total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <FL label="Notes">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 52 }}
                value={s.provenance.notes}
                onChange={e => set('provenance', { notes: e.target.value })}
                placeholder="Notes on provenance implementation…" />
            </FL>
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Approval Workflow ── */}
      <SectionCard icon={GitMerge} title="Approval Workflow"
        badge={`${s.workflow.states.length} states`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Visual pipeline */}
          <div>
            <SL>Workflow States</SL>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4,
              flexWrap: 'wrap', marginBottom: 12 }}>
              {s.workflow.states.map((ws, i) => (
                <div key={ws.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 20,
                    background: `${ws.color}18`, border: `1px solid ${ws.color}55`,
                    position: 'relative',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%',
                      background: ws.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: ws.color }}>
                      {ws.label}
                    </span>
                    {ws.isTerminal && (
                      <span style={{ fontSize: 9, color: ws.color, opacity: 0.7 }}>⊗</span>
                    )}
                    <button onClick={() => setWsModal(ws)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: ws.color, opacity: 0.6, padding: '0 0 0 2px', fontSize: 11 }}>
                      ✎
                    </button>
                    <button onClick={() => removeWS(ws.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: '#ef4444', opacity: 0.5, padding: 0, fontSize: 12 }}>
                      ×
                    </button>
                  </div>
                  {i < s.workflow.states.length - 1 && (
                    <ArrowRight size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  )}
                </div>
              ))}
              <button onClick={() => setWsModal({ id: newId('ws'), label: '', color: '#38bdf8',
                description: '', isTerminal: false })}
                style={{ ...ghostBtn, padding: '5px 10px', borderStyle: 'dashed',
                  borderColor: cr(0.3), color: ACC }}>
                <Plus size={11} /> Add State
              </button>
            </div>
          </div>

          {/* State descriptions */}
          {s.workflow.states.filter(ws => ws.description).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 7 }}>
              {s.workflow.states.map(ws => ws.description && (
                <div key={ws.id} style={{ padding: '8px 10px', borderRadius: 8,
                  background: `${ws.color}0a`, border: `1px solid ${ws.color}30` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ws.color, marginBottom: 3 }}>
                    {ws.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {ws.description}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metadata toggles + tool */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SL>Metadata Fields</SL>
              {[
                { key: 'hasReviewDateTracking', label: 'Review date field',  desc: 'reviewed_at timestamp per record'         },
                { key: 'hasApproverField',      label: 'Approver field',     desc: 'approver_id or approver_name per record'  },
                { key: 'hasRejectReason',       label: 'Reject reason field', desc: 'rejection_reason when state = rejected'  },
              ].map(({ key, label, desc }) => (
                <CheckItem key={key} label={label} desc={desc}
                  checked={s.workflow[key]}
                  onChange={v => set('workflow', { [key]: v })} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FL label="Tool Integration">
                <select style={selectSx} value={s.workflow.toolIntegration}
                  onChange={e => set('workflow', { toolIntegration: e.target.value })}>
                  {WORKFLOW_TOOL_OPTIONS.map(t => <option key={t}>{t}</option>)}
                </select>
              </FL>
              <FL label="Notes">
                <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                  lineHeight: 1.5, minHeight: 60 }}
                  value={s.workflow.notes}
                  onChange={e => set('workflow', { notes: e.target.value })}
                  placeholder="Notes on approval process, SLAs, escalation paths…" />
              </FL>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── 3. Versioning + 4. Deprecation ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Versioning Model */}
        <InlinePanel icon={Clock3} title="Versioning Model">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SL>Strategy</SL>
            <ToggleRow options={VERSIONING_STRATEGIES} value={s.versioning.strategy}
              onChange={v => set('versioning', { strategy: v })} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {[
                { key: 'hasVersionField',    label: 'Version field on documents',  desc: 'version or schema_version field in records'     },
                { key: 'hasVersionHistory',  label: 'Version history table',        desc: 'Separate table tracking all past versions'      },
                { key: 'hasDiffTracking',    label: 'Diff tracking',                desc: 'Track what changed between versions'            },
                { key: 'hasMigrationScripts',label: 'Migration scripts',            desc: 'Scripts to migrate data to new schema versions' },
              ].map(({ key, label, desc }) => (
                <CheckItem key={key} label={label} desc={desc}
                  checked={s.versioning[key]}
                  onChange={v => set('versioning', { [key]: v })} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <FL label="Version Field Name">
                <input style={inputSx} value={s.versioning.versionFieldName}
                  onChange={e => set('versioning', { versionFieldName: e.target.value })}
                  placeholder="version" />
              </FL>
              <FL label="History Table">
                <input style={inputSx} value={s.versioning.historyTableName}
                  onChange={e => set('versioning', { historyTableName: e.target.value })}
                  placeholder="e.g. document_versions" />
              </FL>
            </div>
            <FL label="Notes">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 48 }}
                value={s.versioning.notes}
                onChange={e => set('versioning', { notes: e.target.value })}
                placeholder="Notes on versioning strategy…" />
            </FL>
          </div>
        </InlinePanel>

        {/* Deprecation & Expiry */}
        <InlinePanel icon={Archive} title="Deprecation & Expiry">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'hasDeprecatedAt',        label: 'deprecated_at field',        desc: 'Timestamp when content was deprecated'           },
              { key: 'hasExpiryDate',           label: 'Content expiry date',        desc: 'Absolute date after which content auto-expires'  },
              { key: 'hasStaleContentFlagging', label: 'Stale content flagging',     desc: 'Auto-flag content older than threshold'          },
              { key: 'hasSuccessorLink',        label: 'Successor link field',       desc: 'Point to the content that replaced this one'     },
            ].map(({ key, label, desc }) => (
              <CheckItem key={key} label={label} desc={desc}
                checked={s.deprecation[key]}
                onChange={v => set('deprecation', { [key]: v })} />
            ))}
            {s.deprecation.hasStaleContentFlagging && (
              <FL label="Stale Threshold (days)">
                <input style={inputSx} type="number" value={s.deprecation.staleThresholdDays}
                  onChange={e => set('deprecation', { staleThresholdDays: e.target.value })} />
              </FL>
            )}
            <FL label="Deprecation Process">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 52 }}
                value={s.deprecation.process}
                onChange={e => set('deprecation', { process: e.target.value })}
                placeholder="How content gets deprecated — who initiates, who approves, automated vs manual…" />
            </FL>
          </div>
        </InlinePanel>
      </div>

      {/* ── 5. Permissions & Confidentiality ── */}
      <SectionCard icon={Lock} title="Permissions & Confidentiality"
        badge={`${s.permissions.classificationLevels.length} levels`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Classification levels */}
          <div>
            <SL>Classification Levels</SL>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
              {s.permissions.classificationLevels.map((cl, i) => (
                <div key={cl.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  background: `${cl.color}0a`, border: `1px solid ${cl.color}33` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%',
                    background: cl.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cl.color }}>
                      {cl.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {cl.description}
                    </div>
                    {cl.accessRoles && (
                      <div style={{ fontSize: 10, fontFamily: 'monospace',
                        color: 'var(--text-muted)', marginTop: 2, opacity: 0.8 }}>
                        roles: {cl.accessRoles}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setClModal(cl)} style={{ ...ghostBtn, padding: '3px 6px' }}>
                    <Edit2 size={11} />
                  </button>
                  <button onClick={() => removeCL(cl.id)} style={{ ...dangerBtn, padding: '3px 6px' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button onClick={() => setClModal({ id: newId('cl'), label: '', color: '#38bdf8',
                description: '', accessRoles: '' })}
                style={{ ...ghostBtn, justifyContent: 'center', padding: 7,
                  borderStyle: 'dashed', borderColor: cr(0.3), color: ACC }}>
                <Plus size={13} /> Add Level
              </button>
            </div>
          </div>

          {/* Access control config */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FL label="Access Control Type">
              <ToggleRow options={ACCESS_CONTROL_TYPES} value={s.permissions.accessControlType}
                onChange={v => set('permissions', { accessControlType: v })} />
            </FL>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { key: 'hasAccessControl',     label: 'Access control enforced',     desc: 'Queries filtered by user role or attribute'        },
                { key: 'hasFieldLevelSecurity', label: 'Field-level security',        desc: 'Specific fields hidden based on classification'    },
              ].map(({ key, label, desc }) => (
                <CheckItem key={key} label={label} desc={desc}
                  checked={s.permissions[key]}
                  onChange={v => set('permissions', { [key]: v })} />
              ))}
            </div>
            <FL label="Notes">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 80 }}
                value={s.permissions.notes}
                onChange={e => set('permissions', { notes: e.target.value })}
                placeholder="Notes on access control implementation, IAM integration, row-level security…" />
            </FL>
          </div>
        </div>
      </SectionCard>

      {/* ── 6. Contradiction Detection + 7. Confidence Scoring ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Contradiction Detection */}
        <InlinePanel icon={AlertOctagon} title="Contradiction Detection"
          rightLabel={`${Object.values(s.contradictions.methods).filter(Boolean).length} methods`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {DEDUP_METHODS.map(m => (
              <CheckItem key={m.key} label={m.label} desc={m.desc}
                checked={s.contradictions.methods[m.key]}
                onChange={v => setContraMethod(m.key, v)} />
            ))}
            <CheckItem label="Resolution workflow defined" desc="Process for resolving detected conflicts"
              checked={s.contradictions.hasResolutionWorkflow}
              onChange={v => set('contradictions', { hasResolutionWorkflow: v })} />
          </div>
          {s.contradictions.hasResolutionWorkflow && (
            <FL label="Resolution Process">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 52, marginBottom: 8 }}
                value={s.contradictions.resolutionDesc}
                onChange={e => set('contradictions', { resolutionDesc: e.target.value })}
                placeholder="How conflicts are routed, reviewed, and resolved…" />
            </FL>
          )}
          <FL label="Alert Threshold">
            <input style={inputSx} value={s.contradictions.alertThreshold}
              onChange={e => set('contradictions', { alertThreshold: e.target.value })}
              placeholder="e.g. flag when similarity > 0.92" />
          </FL>
        </InlinePanel>

        {/* Confidence Scoring */}
        <InlinePanel icon={BarChart3} title="Confidence Scoring">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <FL label="Scoring Method">
              <ToggleRow options={CONFIDENCE_METHODS} value={s.confidence.scoringMethod}
                onChange={v => set('confidence', { scoringMethod: v })} />
            </FL>
            <FL label="Score Range">
              <ToggleRow options={CONFIDENCE_RANGES} value={s.confidence.range}
                onChange={v => set('confidence', { range: v })} />
            </FL>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
              {[
                { key: 'hasPerFactConfidence',  label: 'Per-fact confidence score',     desc: 'Confidence stored on every extracted fact'       },
                { key: 'hasSourceCount',         label: 'Source count per claim',        desc: 'How many sources corroborate each fact'          },
                { key: 'hasHumanReviewedFlag',   label: 'Human-reviewed flag',           desc: 'Boolean — was this fact verified by a human?'    },
                { key: 'hasAutoExtractedFlag',   label: 'Auto-extracted flag',           desc: 'Boolean — was this auto-extracted without review?' },
              ].map(({ key, label, desc }) => (
                <CheckItem key={key} label={label} desc={desc}
                  checked={s.confidence[key]}
                  onChange={v => set('confidence', { [key]: v })} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <FL label="Field Name">
                <input style={inputSx} value={s.confidence.fieldName}
                  onChange={e => set('confidence', { fieldName: e.target.value })}
                  placeholder="confidence" />
              </FL>
              <FL label="High threshold">
                <input style={inputSx} value={s.confidence.highThreshold}
                  onChange={e => set('confidence', { highThreshold: e.target.value })}
                  placeholder={s.confidence.range === '0-1' ? '≥ 0.85' : s.confidence.range === '0-100' ? '≥ 85' : '≥ 4'} />
              </FL>
              <FL label="Low threshold">
                <input style={inputSx} value={s.confidence.lowThreshold}
                  onChange={e => set('confidence', { lowThreshold: e.target.value })}
                  placeholder={s.confidence.range === '0-1' ? '< 0.5' : s.confidence.range === '0-100' ? '< 50' : '< 2'} />
              </FL>
            </div>
            <FL label="Notes">
              <textarea style={{ ...inputSx, resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.5, minHeight: 48 }}
                value={s.confidence.notes}
                onChange={e => set('confidence', { notes: e.target.value })}
                placeholder="Notes on scoring logic, calibration, review queues…" />
            </FL>
          </div>
        </InlinePanel>
      </div>

      {/* ── Modals ── */}
      {wsModal && (
        <WorkflowStateModal initial={wsModal}
          onSave={ws => { upsertWS(ws); setWsModal(null); }}
          onClose={() => setWsModal(null)} />
      )}
      {clModal && (
        <ClassLevelModal initial={clModal}
          onSave={cl => { upsertCL(cl); setClModal(null); }}
          onClose={() => setClModal(null)} />
      )}
    </div>
  );
}
