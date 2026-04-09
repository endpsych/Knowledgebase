/* """
src/pages/KnowledgeBasePage.jsx
--------------------------------
Knowledge Base page.
Six tabs covering the full lifecycle of a formal KB system:
literature corpus, storage layer, ontology & schema, ingestion pipeline,
documentation, and trust & governance.
All tabs are placeholders — functionality developed incrementally.
""" */

import { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Boxes, Database, FileText, FileSearch,
  ShieldCheck, Workflow, Zap,
} from 'lucide-react';
import TabBar from '../components/TabBar';
import LiteratureTab, { SAMPLE_PAPERS } from './knowledge-base/LiteratureTab';
import KnowledgeStoreTab  from './knowledge-base/KnowledgeStoreTab';
import OntologySchemaTab    from './knowledge-base/OntologySchemaTab';
import IngestionPipelineTab from './knowledge-base/IngestionPipelineTab';
import ParsingTab            from './knowledge-base/ParsingTab';
import DocumentationTab     from './knowledge-base/DocumentationTab';
import TrustGovernanceTab   from './knowledge-base/TrustGovernanceTab';
import WorkflowsTab          from './knowledge-base/WorkflowsTab';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'workflows',    label: 'Workflows',            icon: Zap         },
  { id: 'literature',   label: 'Literature',           icon: BookOpen    },
  { id: 'parsing',      label: 'Parsing',              icon: FileSearch  },
  { id: 'store',        label: 'Knowledge Store',     icon: Database    },
  { id: 'ontology',     label: 'Ontology & Schema',   icon: Boxes       },
  { id: 'ingestion',    label: 'Ingestion Pipeline',  icon: Workflow    },
  { id: 'docs',         label: 'Documentation',       icon: FileText    },
  { id: 'governance',   label: 'Trust & Governance',  icon: ShieldCheck },
];

// ─── Theme palette (one per tab) ─────────────────────────────────────────────

const THEMES = {
  literature:  { color: '#38bdf8', r: 'rgba(56,189,248,'   },  // sky-400
  store:       { color: '#34d399', r: 'rgba(52,211,153,'   },  // emerald-400
  ontology:    { color: '#a78bfa', r: 'rgba(167,139,250,'  },  // violet-400
  parsing:     { color: '#38bdf8', r: 'rgba(56,189,248,'   },  // sky-400
  ingestion:   { color: '#fb923c', r: 'rgba(251,146,60,'   },  // orange-400
  docs:        { color: '#fb7185', r: 'rgba(251,113,133,'  },  // rose-400
  governance:  { color: '#2dd4bf', r: 'rgba(45,212,191,'   },  // teal-400
};

// ─── Tab content registry ─────────────────────────────────────────────────────

const TAB_CONTENT = {
  literature: {
    icon:        BookOpen,
    title:       'Literature & Papers',
    description: 'Audit the documentary sources that feed the knowledge base. Detect reference managers, scan paper collections, surface reading lists and annotated bibliographies, and map topic coverage across key research areas relevant to your work.',
    planned: [
      'Reference manager detection — Zotero, Mendeley, JabRef, Paperpile; .bib / .ris citation files in project',
      'Paper collection audit — PDF corpus size, naming conventions, duplicate detection, un-annotated papers flagged',
      'arXiv / Semantic Scholar integration — saved search queries, RSS feeds, citation alert config files detected',
      'Reading list patterns — papers.md, reading-list.md, annotated bibliography files across project tree',
      'Topic coverage analysis — keyword cluster detection from BibTeX titles and filenames (transformers, GNNs, causal inference, credit risk, etc.)',
      'Citation graph — co-citation clusters, most-cited authors and venues in .bib files; gap detection by topic area',
      'Readiness score — reference manager present, reading list maintained, topic areas covered, corpus versioned',
    ],
  },
  store: {
    icon:        Database,
    title:       'Knowledge Store',
    description: 'Inventory the actual storage layer of the KB — what is stored, where, and in what form. Detect document stores, vector indexes, metadata databases, and graph entity collections. Flag KBs that store only files with no structured model of the world.',
    planned: [
      'Document store detection — raw file directories, parsed text outputs, version history; flag unstructured dumps with no metadata',
      'Vector index audit — Chroma, Pinecone, Qdrant, FAISS, Weaviate, pgvector; collection names, sizes, distance metrics configured',
      'Metadata database — PostgreSQL / SQLite / DuckDB schemas with title, source, author, date, status, confidentiality fields',
      'Graph entity store — Neo4j, PostgreSQL with entity tables, RDF triple store; entity type inventory and record counts',
      'Knowledge unit diversity — does the store contain documents only, or also entities, facts, relationships, definitions, events, processes?',
      'Chunk inventory — chunk size and overlap settings, section-aware vs. fixed chunking, chunk count vs. source document count ratio',
      'Readiness score — document store populated, vector index present, metadata schema defined, entity store detected',
    ],
  },
  ontology: {
    icon:        Boxes,
    title:       'Ontology & Schema',
    description: 'Assess the conceptual model underlying the KB. Scan for entity type definitions, relationship schemas, controlled vocabularies, and ontology files. Flag systems that store content without a structured model of what the content is about.',
    planned: [
      'Ontology file detection — .owl, .ttl (Turtle), .rdf, .n3, .jsonld, YAML/JSON schema files defining entity types',
      'Entity type inventory — Person, Organization, Project, Process, Dataset, Model, Policy, Test, Construct, Risk, Metric, Decision types',
      'Relationship schema — OWNS, GOVERNS, USES, TRAINS_ON, MEASURES, SUPPORTS, MITIGATES, DERIVED_FROM relationship definitions',
      'Controlled vocabulary — canonical term lists, glossary files, SKOS concept schemes, synonym resolution tables',
      'Domain ontology alignment — FIBO (Financial Industry Business Ontology) terms, schema.org financial types, custom bank ontologies',
      'Schema versioning — detect multiple versions of the same entity schema; flag breaking changes without migration scripts',
      'Readiness score — entity types defined, relationship schema present, controlled vocabulary maintained, domain alignment detected',
    ],
  },
  ingestion: {
    icon:        Workflow,
    title:       'Ingestion Pipeline',
    description: 'Audit the pipeline that moves raw sources into structured knowledge. This is KB-specific ingestion focused on knowledge extraction — not general data movement. Detect parsers, chunking strategies, entity extraction, enrichment steps, and provenance tagging at ingest time.',
    planned: [
      'Document parsers — PyMuPDF, pdfplumber, python-docx, BeautifulSoup, Unstructured.io, LlamaParse detection',
      'Chunking strategy — section-aware (heading-based), fixed-size with overlap, semantic splitting; RecursiveCharacterTextSplitter, semantic chunker patterns',
      'Entity extraction pipeline — spaCy NER, GLiNER, Flair, LLM-based extraction; custom entity types aligned to KB ontology',
      'Enrichment steps — metadata tagging at ingest (source, author, date, doc type, confidentiality, owner, region, status)',
      'Deduplication — content hash checking, near-duplicate detection (MinHash / SimHash), canonical URL resolution',
      'Knowledge extraction — definition extraction, fact extraction, relationship extraction, summary generation per chunk',
      'Provenance tagging — source file, section, page number, extraction date, extractor ID recorded per chunk and per fact',
      'Readiness score — parser configured, chunking strategy defined, enrichment present, provenance tagged at ingest',
    ],
  },
  docs: {
    icon:        FileText,
    title:       'Documentation',
    description: 'Measure how well the KB and its surrounding codebase are documented. Scan docstring coverage, README quality, API doc generation config, changelogs, and architecture diagrams. Good documentation is itself a form of KB content.',
    planned: [
      'Docstring coverage — functions and classes without docstrings across Python source files; coverage percentage by module',
      'README quality — presence, length, and section completeness (purpose, install, usage, examples, contributing, schema description)',
      'API docs generation — Sphinx, MkDocs, pdoc, mkdocstrings config detection; build target and output directory',
      'Changelog — CHANGELOG.md / HISTORY.md presence and recency; days since last entry flagged if stale',
      'Architecture docs — docs/ directory structure, diagram files (.drawio, .puml, Mermaid in markdown), data flow diagrams',
      'KB-specific docs — schema documentation, ontology descriptions, ingestion pipeline README, retrieval layer documentation',
      'Readiness score — README present, docstrings covered, schema documented, architecture diagrams exist, changelog current',
    ],
  },
  governance: {
    icon:        ShieldCheck,
    title:       'Trust & Governance',
    description: 'The layer that determines whether a KB stays trustworthy over time. Audit provenance fields, approval workflows, versioning and deprecation models, permission schemes, confidence scoring, and contradiction handling. Without governance, a KB rots.',
    planned: [
      'Provenance coverage — every chunk and fact traceable to source file, section, extraction date, extractor, and confidence score',
      'Approval workflow detection — draft / reviewed / approved / deprecated / archived status fields in schema; review date tracking',
      'Versioning model — document version fields, version history tables, diff tracking for updated content; schema migration scripts',
      'Deprecation & expiry — deprecated_at fields, content expiry dates, automated stale content flagging rules',
      'Permissions & confidentiality — confidentiality classification fields (public, internal, restricted, confidential); access control patterns',
      'Contradiction detection — duplicate fact detection across sources, conflicting entity attribute flags, conflict resolution workflow',
      'Confidence scoring — confidence fields per extracted fact, source count per claim, human-reviewed vs. auto-extracted distinction',
      'Readiness score — provenance present, approval states defined, versioning in place, permissions enforced, confidence scored',
    ],
  },
};

// ─── Placeholder tab component ────────────────────────────────────────────────

function PlaceholderTab({ tabId }) {
  const cfg   = TAB_CONTENT[tabId];
  const theme = THEMES[tabId];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div style={{ padding: '0 2px' }}>
      {/* Header card */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '24px 28px', marginBottom: 20,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: `color-mix(in srgb, ${theme.color} 12%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={theme.color} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              {cfg.title}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 20,
              border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--bg)',
            }}>
              In Development
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            {cfg.description}
          </p>
        </div>
      </div>

      {/* Planned features card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '20px 24px',
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--text-muted)', marginBottom: 14,
        }}>
          Planned features
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cfg.planned.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                background: theme.color, opacity: 0.5,
              }} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState('workflows');

  // ── Papers state (shared across Literature + Knowledge Store tabs) ──────────
  const [papers,      setPapers]      = useState(SAMPLE_PAPERS);

  // ── Cross-tab navigation (e.g. "Save to paper" → jump to Literature) ────────
  const [focusLiteraturePaperId, setFocusLiteraturePaperId] = useState(null);
  const handleNavigate = ({ tab, paperId }) => {
    setActiveTab(tab);
    if (tab === 'literature' && paperId) setFocusLiteraturePaperId(paperId);
  };
  const persistReady = useRef(false);

  useEffect(() => {
    window.electronAPI?.readPapers?.().then(saved => {
      if (Array.isArray(saved) && saved.length > 0) setPapers(saved);
    }).catch(() => {}).finally(() => { persistReady.current = true; });
  }, []);

  useEffect(() => {
    if (!persistReady.current) return;
    window.electronAPI?.writePapers?.(papers);
  }, [papers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar sits flush at the top with only horizontal padding */}
      <div style={{ padding: '0 28px 0', flexShrink: 0 }}>
        <TabBar
          tabs={TABS}
          active={activeTab}
          onChange={setActiveTab}
          edgeBleedX={28}
          edgeBleedTop={0}
          stickyTop={0}
        />
      </div>
      {/* Content area — overflow hidden; each tab owns its own scrolling */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Full-height tabs (manage their own scroll) */}
        {['literature', 'store', 'ontology', 'parsing', 'ingestion', 'docs', 'governance', 'workflows'].map(id => {
          const TabComponent = {
            literature:  LiteratureTab,
            store:       KnowledgeStoreTab,
            ontology:    OntologySchemaTab,
            parsing:     ParsingTab,
            ingestion:   IngestionPipelineTab,
            docs:        DocumentationTab,
            governance:  TrustGovernanceTab,
            workflows:   WorkflowsTab,
          }[id];
          const tabProps = id === 'literature'
            ? { papers, onPapersChange: setPapers, focusPaperId: focusLiteraturePaperId }
            : id === 'ingestion' || id === 'parsing'
            ? { papers, onPapersChange: setPapers, onNavigate: handleNavigate }
            : id === 'store' || id === 'ontology' || id === 'governance'
            ? { papers, onPapersChange: setPapers }
            : {};
          return (
            <div key={id} style={{
              display: activeTab === id ? 'flex' : 'none',
              flexDirection: 'column', height: '100%',
              padding: '0 28px 24px',
              overflowY: 'auto',
            }}>
              <TabComponent {...tabProps} />
            </div>
          );
        })}

        {/* Placeholder tabs — simple scrollable content */}
        {!['literature', 'store', 'ontology', 'parsing', 'ingestion', 'docs', 'governance', 'workflows'].includes(activeTab) && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '0 28px 24px' }}>
            <PlaceholderTab tabId={activeTab} />
          </div>
        )}

      </div>
    </div>
  );
}
