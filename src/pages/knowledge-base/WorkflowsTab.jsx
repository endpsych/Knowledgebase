/* """
src/pages/knowledge-base/WorkflowsTab.jsx
-----------------------------------------
Workflows tab for the Knowledge Base page.
Guides practitioners (and newcomers) through KB workflows, projects,
tasks, value demonstration, cost/benefit analysis, and common pitfalls.
Sub-tabs: Overview · Workflows · Projects · Task Catalog · Value & ROI · Pitfalls
""" */

import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, Circle, Clock,
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle,
  BookOpen, Database, Boxes, Workflow, FileText, ShieldCheck,
  Zap, Users, BarChart2, Target, Layers, Star, AlertCircle,
  PlayCircle, CheckSquare, Square, Filter, Search,
} from 'lucide-react';

// ─── Theme ───────────────────────────────────────────────────────────────────

const ACC = '#f59e0b';
const cr  = (a) => `rgba(245,158,11,${a})`;

// ─── Tab cross-link colors ────────────────────────────────────────────────────

const TAB_COLORS = {
  literature: '#38bdf8',
  store:      '#34d399',
  ontology:   '#a78bfa',
  ingestion:  '#fb923c',
  docs:       '#fb7185',
  governance: '#2dd4bf',
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const MATURITY_LEVELS = [
  {
    level: 0,
    label: 'Unstructured',
    shortDesc: 'Files on disk, nothing indexed',
    beginner: 'Your knowledge lives in files and folders. Finding things takes time, and when people leave, knowledge leaves with them.',
    practitioner: 'No KB artifacts present. Raw file storage with no metadata, indexing, or schema. Knowledge is non-retrievable at scale.',
    unlocks: [],
    missing: ['Document store', 'Metadata schema', 'Any indexing', 'Ontology', 'Governance'],
    next: 'Organize files into a document store with basic metadata (title, date, author).',
  },
  {
    level: 1,
    label: 'Indexed Corpus',
    shortDesc: 'Searchable documents, basic metadata',
    beginner: 'Your documents are stored and searchable. You can find things by keyword. A big step up from folders.',
    practitioner: 'Document store populated. Keyword search available. Metadata schema partially defined. No vector index or structured schema yet.',
    unlocks: ['Keyword search', 'Basic retrieval', 'File inventory'],
    missing: ['Vector index', 'Entity schema', 'Ingestion pipeline', 'Governance'],
    next: 'Add a vector index for semantic search and define entity types in an ontology.',
  },
  {
    level: 2,
    label: 'Structured Knowledge',
    shortDesc: 'Semantic search, typed entities, ingestion pipeline',
    beginner: 'You can ask questions and get relevant answers, not just exact keyword matches. The system understands what things are, not just what they say.',
    practitioner: 'Vector index operational. Ontology defines entity types. Ingestion pipeline produces enriched chunks with metadata. Semantic retrieval available.',
    unlocks: ['Semantic search', 'RAG integration', 'Entity queries', 'Automated ingestion'],
    missing: ['Approval workflow', 'Confidence scoring', 'Contradiction detection'],
    next: 'Add governance: provenance tracking, approval states, and confidence scores.',
  },
  {
    level: 3,
    label: 'Governed KB',
    shortDesc: 'Provenance, approval workflow, versioned content',
    beginner: 'Every answer can be traced to its source. Content goes through a review process before it is trusted. Old content gets flagged as stale automatically.',
    practitioner: 'Full provenance chain. Approval workflow enforced. Versioning and deprecation model in place. Confidence fields per fact. Contradiction detection active.',
    unlocks: ['Compliance-ready', 'Auditable answers', 'Stale content flagging', 'Multi-team trust'],
    missing: ['Knowledge graph', 'Relationship traversal', 'Cross-domain inference'],
    next: 'Build a knowledge graph layer to enable relationship traversal and cross-domain inference.',
  },
  {
    level: 4,
    label: 'Knowledge Graph',
    shortDesc: 'Queryable graph, cross-domain reasoning, full lifecycle',
    beginner: 'The KB can answer questions that require connecting facts across different topics — like a subject-matter expert who read everything and remembers the connections.',
    practitioner: 'Graph entity store operational. SPARQL/Cypher queries possible. Cross-domain inference via relationship traversal. Full lifecycle: ingest → govern → query → maintain.',
    unlocks: ['Cross-domain reasoning', 'Graph-based retrieval', 'Automated gap detection', 'KG-augmented LLMs'],
    missing: [],
    next: 'Maintain and grow the graph. Automate gap detection. Feed the KG into downstream LLM and analytics systems.',
  },
];

const VALUE_PATHWAYS = [
  {
    id: 'vp1',
    title: 'Faster Expert Answers',
    steps: ['Ingest domain papers & docs', 'Build vector index', 'Connect to LLM (RAG)'],
    outcome: 'Answer domain questions in seconds instead of hours',
    metric: 'Time-to-answer reduction',
    tab: 'ingestion',
    beginner: 'Instead of asking a colleague or spending an hour searching, you get an accurate answer with cited sources in under a minute.',
    practitioner: 'RAG pipeline over governed KB reduces hallucination rate and provides traceable citations for compliance-sensitive queries.',
  },
  {
    id: 'vp2',
    title: 'Onboarding Acceleration',
    steps: ['Document processes & decisions', 'Tag by role & domain', 'Surface via semantic search'],
    outcome: 'New team members become productive in days, not months',
    metric: 'Time-to-productivity for new hires',
    tab: 'store',
    beginner: 'New people can find answers themselves instead of interrupting senior colleagues with questions that have already been answered.',
    practitioner: 'Role-filtered KB retrieval surfaces relevant processes, decision logs, and domain context during onboarding without requiring senior staff time.',
  },
  {
    id: 'vp3',
    title: 'Eliminate Repeated Research',
    steps: ['Log research findings with provenance', 'Tag by topic & status', 'Surface duplicates before starting new work'],
    outcome: 'Researchers build on prior work instead of rediscovering it',
    metric: 'Duplicate research incidents prevented',
    tab: 'literature',
    beginner: 'Stop doing research that someone on your team already did. The KB tells you what is already known before you spend time finding it again.',
    practitioner: 'Literature corpus with deduplication and citation graph prevents reinvestigation of covered territory. Gap analysis surfaces true unknowns.',
  },
  {
    id: 'vp4',
    title: 'Compliant Knowledge Use',
    steps: ['Add provenance fields', 'Enforce approval workflow', 'Classify by confidentiality level'],
    outcome: 'Every KB-derived answer is auditable and access-controlled',
    metric: 'Audit pass rate, compliance incidents',
    tab: 'governance',
    beginner: 'If a regulator asks where your answer came from, you can show them exactly which document, page, and person approved it.',
    practitioner: 'Provenance chain + approval state + confidentiality classification enables post-hoc audit of any retrieved fact. Required for regulated industries.',
  },
  {
    id: 'vp5',
    title: 'Cross-Team Knowledge Sharing',
    steps: ['Define shared ontology', 'Ingest from multiple teams', 'Unify under common schema'],
    outcome: 'Teams share knowledge without losing their domain-specific context',
    metric: 'Cross-team queries resolved, schema conflicts',
    tab: 'ontology',
    beginner: 'Two teams can share their knowledge without confusion because they agree on what words mean and how things are connected.',
    practitioner: 'Shared ontology with controlled vocabulary resolves synonym conflicts across teams. Unified schema allows cross-domain queries that individual silos cannot answer.',
  },
  {
    id: 'vp6',
    title: 'Automated Knowledge Maintenance',
    steps: ['Set expiry rules', 'Schedule staleness checks', 'Trigger re-review on source change'],
    outcome: 'KB stays accurate without manual monitoring',
    metric: 'Stale content rate, re-review turnaround time',
    tab: 'governance',
    beginner: 'The KB tells you when information is getting old, so you review it before someone uses outdated facts to make a decision.',
    practitioner: 'Deprecation + expiry fields with automated staleness flagging reduces drift between KB content and ground truth. Reduces trust erosion over time.',
  },
];

const WORKFLOWS = [
  {
    id: 'wf1',
    title: 'Build a KB from Scratch',
    difficulty: 'High',
    effort: '2–4 weeks',
    outcome: 'A functioning, governed KB ready for RAG or query',
    steps: [
      { label: 'Collect sources', tab: 'literature', desc: 'Identify and catalog all source documents, papers, and references.' },
      { label: 'Define ontology', tab: 'ontology', desc: 'Specify entity types, relationships, and controlled vocabulary.' },
      { label: 'Set up ingestion', tab: 'ingestion', desc: 'Configure parsers, chunking, NER, enrichment, and provenance tagging.' },
      { label: 'Populate store', tab: 'store', desc: 'Run ingestion pipeline; verify vector index, metadata DB, and entity store.' },
      { label: 'Add governance', tab: 'governance', desc: 'Define approval states, provenance fields, confidence scoring, and permissions.' },
      { label: 'Document everything', tab: 'docs', desc: 'Write schema docs, pipeline README, and architecture diagrams.' },
    ],
  },
  {
    id: 'wf2',
    title: 'Onboard a New Research Domain',
    difficulty: 'Medium',
    effort: '3–5 days',
    outcome: 'New domain integrated into existing KB with full coverage',
    steps: [
      { label: 'Collect domain literature', tab: 'literature', desc: 'Find papers, reports, and references covering the new domain.' },
      { label: 'Extend ontology', tab: 'ontology', desc: 'Add new entity types and relationships specific to the domain.' },
      { label: 'Run ingestion', tab: 'ingestion', desc: 'Ingest domain documents through the existing pipeline.' },
      { label: 'Verify coverage', tab: 'store', desc: 'Check chunk counts, entity coverage, and knowledge unit diversity.' },
      { label: 'Review & approve', tab: 'governance', desc: 'Move new content through the approval workflow.' },
    ],
  },
  {
    id: 'wf3',
    title: 'Audit and Clean a Stale KB',
    difficulty: 'Medium',
    effort: '1–2 days',
    outcome: 'Outdated content deprecated, gaps identified, trust restored',
    steps: [
      { label: 'Run governance audit', tab: 'governance', desc: 'Flag content past expiry date or with deprecated status.' },
      { label: 'Check provenance completeness', tab: 'governance', desc: 'Identify facts with missing source, date, or extractor fields.' },
      { label: 'Review literature freshness', tab: 'literature', desc: 'Identify papers and references that need updating or replacement.' },
      { label: 'Re-ingest updated sources', tab: 'ingestion', desc: 'Re-run ingestion for updated source documents.' },
      { label: 'Update store metrics', tab: 'store', desc: 'Verify chunk counts and vector index are consistent after cleanup.' },
    ],
  },
  {
    id: 'wf4',
    title: 'Connect KB to an LLM (RAG Setup)',
    difficulty: 'High',
    effort: '1–3 days',
    outcome: 'LLM can answer domain questions from KB with citations',
    steps: [
      { label: 'Verify vector index', tab: 'store', desc: 'Confirm vector index is populated with correct distance metric and embedding model.' },
      { label: 'Review chunking strategy', tab: 'ingestion', desc: 'Ensure chunks are sized appropriately for the target LLM context window.' },
      { label: 'Check metadata fields', tab: 'store', desc: 'Confirm source, date, and confidence fields are present for citation rendering.' },
      { label: 'Set access controls', tab: 'governance', desc: 'Restrict which content the LLM can retrieve based on confidentiality level.' },
      { label: 'Document retrieval layer', tab: 'docs', desc: 'Write retrieval pipeline README and note embedding model and chunk strategy.' },
    ],
  },
  {
    id: 'wf5',
    title: 'Migrate File Share to Structured KB',
    difficulty: 'High',
    effort: '1–3 weeks',
    outcome: 'Unstructured file store converted to indexed, governed KB',
    steps: [
      { label: 'Inventory files', tab: 'store', desc: 'Catalog all files: format, size, date, owner, topic.' },
      { label: 'Define schema', tab: 'ontology', desc: 'Create entity types that match the content found in the file inventory.' },
      { label: 'Configure parsers', tab: 'ingestion', desc: 'Set up parsers for PDF, DOCX, XLSX, and other formats found.' },
      { label: 'Batch ingest with metadata', tab: 'ingestion', desc: 'Run ingestion with enrichment tags derived from folder structure and file names.' },
      { label: 'Apply governance retroactively', tab: 'governance', desc: 'Assign provenance, confidentiality, and approval status to ingested content.' },
    ],
  },
  {
    id: 'wf6',
    title: 'Demonstrate KB Value to Stakeholders',
    difficulty: 'Low',
    effort: '2–4 hours',
    outcome: 'Clear evidence of KB ROI for decision-makers',
    steps: [
      { label: 'Pull maturity score', tab: 'governance', desc: 'Show overall readiness scores across all 6 KB dimensions.' },
      { label: 'Measure retrieval quality', tab: 'store', desc: 'Run sample queries; record precision and time-to-answer.' },
      { label: 'Show coverage growth', tab: 'literature', desc: 'Show topic coverage and corpus growth over time.' },
      { label: 'Run audit report', tab: 'governance', desc: 'Produce provenance coverage report and approval state summary.' },
      { label: 'Map to business metrics', tab: null, desc: 'Translate KB metrics into hours saved, risk reduced, and decisions enabled.' },
    ],
  },
];

const PROJECT_TEMPLATES = [
  {
    id: 'pt1',
    title: 'Domain KB — Zero to Searchable',
    goal: 'Stand up a searchable, structured KB for a new domain from nothing.',
    deliverables: ['Populated document store', 'Vector index', 'Ontology with 5+ entity types', 'Ingestion pipeline', 'Basic readiness score ≥ 4/7 per tab'],
    roles: ['KB Engineer', 'Domain Expert', 'Data Engineer'],
    effort: '2–4 weeks',
    successCriteria: ['Semantic search returns relevant results for 10 test queries', 'All ingested content has source + date metadata', 'At least one entity type has > 50 records'],
    tabs: ['literature', 'ontology', 'ingestion', 'store'],
  },
  {
    id: 'pt2',
    title: 'Governance Retrofit',
    goal: 'Add governance to an existing KB that was built without it.',
    deliverables: ['Provenance fields on all existing content', 'Approval workflow defined', 'Confidentiality classification applied', 'Staleness check rules configured'],
    roles: ['KB Engineer', 'Compliance Lead', 'Content Owner'],
    effort: '1–2 weeks',
    successCriteria: ['100% of content has source field', '90%+ content has approval status', 'No content older than 1 year without review date'],
    tabs: ['governance', 'store', 'docs'],
  },
  {
    id: 'pt3',
    title: 'RAG-Ready KB',
    goal: 'Prepare an existing KB for integration with an LLM retrieval system.',
    deliverables: ['Vector index with metadata', 'Chunk strategy documented', 'Confidence fields per chunk', 'Access control layer configured', 'Retrieval pipeline README'],
    roles: ['ML Engineer', 'KB Engineer', 'Security Lead'],
    effort: '3–7 days',
    successCriteria: ['Vector search latency < 200ms at p95', 'Citation fields present on all chunks', 'Confidentiality filtering tested for all access levels'],
    tabs: ['store', 'ingestion', 'governance', 'docs'],
  },
  {
    id: 'pt4',
    title: 'KB Documentation Sprint',
    goal: 'Bring KB documentation to production quality in a focused sprint.',
    deliverables: ['Schema documentation', 'Ingestion pipeline README', 'Architecture diagram', 'API docs generated', 'Changelog current'],
    roles: ['Technical Writer', 'KB Engineer'],
    effort: '2–3 days',
    successCriteria: ['Docs readiness score ≥ 6/7', 'README passes section completeness check', 'Architecture diagram covers all major components'],
    tabs: ['docs', 'ontology', 'ingestion'],
  },
];

const TASK_CATALOG = [
  { id: 't1',  name: 'Set up document store',       tab: 'store',      effort: '2–4h',  skill: 'Technical',  depends: [],       value: 'Enables basic retrieval and inventory' },
  { id: 't2',  name: 'Configure vector index',       tab: 'store',      effort: '2–4h',  skill: 'Technical',  depends: ['t1'],    value: 'Enables semantic search and RAG' },
  { id: 't3',  name: 'Define entity types',           tab: 'ontology',   effort: '2–8h',  skill: 'Domain',     depends: [],       value: 'Foundation for structured knowledge' },
  { id: 't4',  name: 'Define relationship schema',    tab: 'ontology',   effort: '2–4h',  skill: 'Domain',     depends: ['t3'],    value: 'Enables cross-entity reasoning' },
  { id: 't5',  name: 'Build controlled vocabulary',   tab: 'ontology',   effort: '4–8h',  skill: 'Domain',     depends: ['t3'],    value: 'Removes synonym ambiguity in retrieval' },
  { id: 't6',  name: 'Configure document parsers',    tab: 'ingestion',  effort: '2–6h',  skill: 'Technical',  depends: ['t1'],    value: 'Enables automated ingestion of raw docs' },
  { id: 't7',  name: 'Define chunking strategy',      tab: 'ingestion',  effort: '1–3h',  skill: 'Technical',  depends: ['t6'],    value: 'Controls retrieval precision and recall' },
  { id: 't8',  name: 'Set up entity extraction',      tab: 'ingestion',  effort: '4–12h', skill: 'ML/NLP',     depends: ['t3','t6'], value: 'Populates entity store from raw docs' },
  { id: 't9',  name: 'Add metadata enrichment',       tab: 'ingestion',  effort: '2–4h',  skill: 'Technical',  depends: ['t6'],    value: 'Enables filtering and classification' },
  { id: 't10', name: 'Tag provenance fields',          tab: 'governance', effort: '2–4h',  skill: 'Technical',  depends: ['t6'],    value: 'Makes answers auditable and traceable' },
  { id: 't11', name: 'Define approval workflow',       tab: 'governance', effort: '2–4h',  skill: 'No-code',    depends: [],       value: 'Ensures content is reviewed before use' },
  { id: 't12', name: 'Apply confidentiality classes', tab: 'governance', effort: '1–2h',  skill: 'No-code',    depends: ['t11'],   value: 'Controls who can access what knowledge' },
  { id: 't13', name: 'Add confidence scoring',         tab: 'governance', effort: '2–4h',  skill: 'Technical',  depends: ['t10'],   value: 'Signals how much to trust each fact' },
  { id: 't14', name: 'Write schema documentation',     tab: 'docs',       effort: '2–4h',  skill: 'No-code',    depends: ['t3'],    value: 'Other teams can understand and extend the KB' },
  { id: 't15', name: 'Create architecture diagram',    tab: 'docs',       effort: '1–3h',  skill: 'No-code',    depends: [],       value: 'Reduces onboarding time for new engineers' },
  { id: 't16', name: 'Ingest literature corpus',       tab: 'literature', effort: '1–4h',  skill: 'No-code',    depends: ['t6'],    value: 'Seeds KB with domain knowledge sources' },
  { id: 't17', name: 'Configure deduplication',        tab: 'ingestion',  effort: '1–3h',  skill: 'Technical',  depends: ['t6'],    value: 'Prevents duplicate content degrading retrieval' },
  { id: 't18', name: 'Set staleness expiry rules',     tab: 'governance', effort: '1–2h',  skill: 'No-code',    depends: ['t11'],   value: 'Prevents stale content causing bad decisions' },
];

const SKILL_COLORS = {
  'No-code':  '#34d399',
  'Domain':   '#a78bfa',
  'Technical':'#38bdf8',
  'ML/NLP':   '#fb923c',
};

const COST_BENEFIT = [
  {
    activity: 'Set up ingestion pipeline',
    costDo: 'Medium — 1–2 days of engineering time',
    costSkip: 'High — manual doc loading; every new source requires manual work; no provenance',
    riskSkip: 'KB becomes stale the moment it is built; no automated updates',
    valueUnlocked: 'Automated KB growth, provenance tracking, consistent metadata',
    tab: 'ingestion',
  },
  {
    activity: 'Define ontology & entity types',
    costDo: 'Low–Medium — 4–8h of domain expert + engineer time',
    costSkip: 'High — no structured model; retrieval returns documents, not answers',
    riskSkip: 'KB can only do keyword/semantic search, not structured queries or relationship traversal',
    valueUnlocked: 'Entity queries, relationship graphs, structured answers, cross-domain reasoning',
    tab: 'ontology',
  },
  {
    activity: 'Add governance (provenance + approval)',
    costDo: 'Medium — 1–2 days to define and apply schema fields',
    costSkip: 'Very High — no audit trail; cannot answer "where did this come from?" or "was this reviewed?"',
    riskSkip: 'Compliance failure; outdated content used without awareness; no trust model',
    valueUnlocked: 'Audit readiness, compliance, trust scores, stale content flagging',
    tab: 'governance',
  },
  {
    activity: 'Maintain literature corpus',
    costDo: 'Low — periodic (weekly/monthly) updates to reading list and references',
    costSkip: 'Medium — KB misses recent findings; recommendations based on outdated science',
    riskSkip: 'Domain coverage decays; researchers make decisions without awareness of newer work',
    valueUnlocked: 'Current domain coverage, citation-grounded answers, gap awareness',
    tab: 'literature',
  },
  {
    activity: 'Configure vector index',
    costDo: 'Low — 2–4h to set up and populate',
    costSkip: 'Very High — no semantic search; only keyword matching; LLM RAG impossible',
    riskSkip: 'KB is not useful for natural language querying; cannot integrate with LLMs',
    valueUnlocked: 'Semantic search, RAG integration, similarity-based retrieval',
    tab: 'store',
  },
  {
    activity: 'Write KB documentation',
    costDo: 'Low — 1–2 days total',
    costSkip: 'Medium — new engineers cannot extend the KB without tribal knowledge',
    riskSkip: 'Bus factor risk; KB becomes unmaintainable when original authors leave',
    valueUnlocked: 'Team scalability, faster onboarding, external team adoption',
    tab: 'docs',
  },
  {
    activity: 'Set up deduplication',
    costDo: 'Low — 1–3h of engineering time',
    costSkip: 'Medium — duplicate content inflates retrieval results; wrong confidence scores',
    riskSkip: 'Users receive repeated information; stats are skewed; chunk ratio becomes meaningless',
    valueUnlocked: 'Clean retrieval, accurate coverage metrics, correct confidence scoring',
    tab: 'ingestion',
  },
  {
    activity: 'Define controlled vocabulary',
    costDo: 'Low–Medium — 4–8h with domain experts',
    costSkip: 'Medium — synonym proliferation; same concept has 5 different names across teams',
    riskSkip: 'Cross-team queries fail; ontology entities fragment by terminology rather than meaning',
    valueUnlocked: 'Unified language, cross-team retrieval, synonym resolution',
    tab: 'ontology',
  },
];

const VALUE_METRICS = [
  {
    stakeholder: 'Engineer / KB Builder',
    icon: '⚙️',
    metrics: [
      { name: 'Ingestion pipeline coverage', desc: 'Fraction of source types with configured parsers', good: '≥ 80%' },
      { name: 'Readiness score per tab', desc: 'Average across all 6 KB dimensions', good: '≥ 5/7 per tab' },
      { name: 'Chunk-to-document ratio', desc: 'Average chunks per source document', good: '5–25 chunks/doc' },
      { name: 'Provenance field coverage', desc: 'Fraction of chunks with all required provenance fields', good: '100%' },
    ],
    howToShow: 'Export readiness scores + chunk stats. Show before/after diff after each sprint.',
  },
  {
    stakeholder: 'Knowledge Manager / Researcher',
    icon: '🔍',
    metrics: [
      { name: 'Time-to-answer', desc: 'How long to answer a domain question with citations', good: '< 2 min' },
      { name: 'Topic coverage score', desc: 'Fraction of planned domain topics with ≥ 5 sources', good: '≥ 90%' },
      { name: 'Corpus growth rate', desc: 'New sources ingested per week', good: 'Positive trend' },
      { name: 'Duplicate research incidents', desc: 'Times a team started research already in the KB', good: '0 per quarter' },
    ],
    howToShow: 'Run 10 representative queries. Log time-to-answer and source quality. Compare against pre-KB baseline.',
  },
  {
    stakeholder: 'Manager / Team Lead',
    icon: '📊',
    metrics: [
      { name: 'Onboarding time reduction', desc: 'Days for new team member to reach productivity', good: '≥ 30% reduction' },
      { name: 'Senior staff interruptions', desc: 'Questions to senior staff answerable by KB', good: '↓ over time' },
      { name: 'Decisions with traceable evidence', desc: 'Fraction of team decisions citing KB source', good: 'Increasing' },
      { name: 'KB adoption rate', desc: 'Fraction of team using KB weekly', good: '≥ 70%' },
    ],
    howToShow: 'Survey new hires. Track Q&A channels. Count questions deflected by KB searches.',
  },
  {
    stakeholder: 'Executive / Compliance Officer',
    icon: '🏛️',
    metrics: [
      { name: 'Audit pass rate', desc: 'Fraction of KB facts with traceable provenance chain', good: '100%' },
      { name: 'Compliance incidents', desc: 'Decisions made with restricted/unapproved content', good: '0' },
      { name: 'Knowledge retention after departure', desc: 'Fraction of a departing team member\'s knowledge captured in KB', good: '≥ 80%' },
      { name: 'Stale content rate', desc: 'Fraction of KB content past review date', good: '< 5%' },
    ],
    howToShow: 'Run governance audit. Pull approval state breakdown. Show provenance coverage report.',
  },
];

const PITFALLS = [
  {
    id: 'p1',
    title: 'Building without governance from day one',
    severity: 'High',
    beginner: 'You build a KB, people start using it, then someone asks "is this still accurate?" — and you have no way to answer.',
    practitioner: 'Retrofitting provenance, approval states, and versioning to an ungoverned KB is exponentially harder than building them in from the start.',
    consequence: 'Trust erosion; compliance risk; stale content used without awareness.',
    fix: 'Define at minimum: source field, approval state, and review date on every content unit before the first ingestion run.',
    tab: 'governance',
  },
  {
    id: 'p2',
    title: 'Storing documents only — no entity model',
    severity: 'High',
    beginner: 'A folder of PDFs is not a knowledge base. It\'s a filing cabinet. You can search it, but you can\'t ask it questions about how things relate.',
    practitioner: 'Document-only KB supports keyword/semantic search but cannot answer structured queries or traverse relationships. Missing ontology = missing the "K" in KB.',
    consequence: 'Cannot answer "which models use which datasets?", "what policies govern this risk type?" etc.',
    fix: 'Define at least 5 entity types and 3 relationship types before populating the store.',
    tab: 'ontology',
  },
  {
    id: 'p3',
    title: 'No ingestion pipeline — manual loading only',
    severity: 'High',
    beginner: 'If adding a new document takes 30 minutes of manual work, people will stop adding documents. The KB will die from neglect.',
    practitioner: 'Manual ingestion is a single-point bottleneck. Provenance is inconsistent. Metadata is incomplete. Deduplication is absent.',
    consequence: 'KB growth stalls; quality degrades over time; content drift becomes unmanageable.',
    fix: 'Automate ingestion for at least the top 2-3 source types before launch.',
    tab: 'ingestion',
  },
  {
    id: 'p4',
    title: 'Chunking strategy not matched to retrieval use case',
    severity: 'Medium',
    beginner: 'If the system chops documents into pieces too small or too large, the answers you get back will be incomplete or full of irrelevant context.',
    practitioner: 'Fixed-size chunking without overlap loses cross-boundary context. Oversized chunks dilute semantic signal. Chunk strategy must be validated against the target query distribution.',
    consequence: 'Poor retrieval precision; LLM receives irrelevant context; hallucination rate increases.',
    fix: 'Test 3 chunking strategies against 20 representative queries. Pick the one with highest retrieval precision.',
    tab: 'ingestion',
  },
  {
    id: 'p5',
    title: 'Ontology defined once, never updated',
    severity: 'Medium',
    beginner: 'New concepts appear in your domain over time. If the KB does not have a word for them, it cannot learn about them.',
    practitioner: 'Schema drift: new entity types are shoehorned into ill-fitting existing types, or left unstructured. Relationship schema becomes incomplete. Controlled vocabulary fragments.',
    consequence: 'New domain concepts are represented inconsistently; retrieval quality degrades for new content.',
    fix: 'Schedule quarterly ontology review. Assign an ontology owner. Track schema change history.',
    tab: 'ontology',
  },
  {
    id: 'p6',
    title: 'No documentation — tribal knowledge dependency',
    severity: 'Medium',
    beginner: 'If only one person knows how the KB works, it stops working when they leave.',
    practitioner: 'Bus factor of 1 for ingestion pipeline, schema decisions, and retrieval configuration. No handover path. Undocumented design decisions accumulate.',
    consequence: 'KB becomes unmaintainable after team turnover; extension work requires archaeology.',
    fix: 'Write schema documentation, pipeline README, and architecture diagram before declaring the KB operational.',
    tab: 'docs',
  },
  {
    id: 'p7',
    title: 'Treating all content as equally trustworthy',
    severity: 'High',
    beginner: 'A user-submitted draft note should not be treated the same as a reviewed, approved policy document. Without trust levels, your KB spreads misinformation.',
    practitioner: 'Without approval states and confidence scores, auto-extracted and human-reviewed facts are indistinguishable at retrieval time. LLM presents low-confidence facts as authoritative.',
    consequence: 'Incorrect facts presented with high confidence; compliance risk; user trust collapse.',
    fix: 'Require approval state and confidence score on every ingestable content type. Filter retrieval by approval state by default.',
    tab: 'governance',
  },
  {
    id: 'p8',
    title: 'Never measuring value — KB investment not justified',
    severity: 'Medium',
    beginner: 'If you cannot show that the KB saves time or reduces mistakes, leadership will stop funding it.',
    practitioner: 'KB projects die from lack of demonstrated ROI, not technical failure. Value metrics are rarely instrumented at build time and are difficult to retrofit.',
    consequence: 'KB defunded or abandoned despite real value delivered; team switches to ad-hoc alternatives.',
    fix: 'Define 3 measurable metrics at project start. Log a baseline. Report progress at each milestone.',
    tab: null,
  },
];

// ─── Shared UI components ─────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children, defaultOpen = true, accent = ACC }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', marginBottom: 16, overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}>
        {Icon && <Icon size={15} color={accent} />}
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {open ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
      </button>
      {open && <div style={{ padding: '16px 20px' }}>{children}</div>}
    </div>
  );
}

function TabBadge({ tabId }) {
  const labels = { literature: 'Literature', store: 'Store', ontology: 'Ontology', ingestion: 'Ingestion', docs: 'Docs', governance: 'Governance' };
  if (!tabId) return null;
  const color = TAB_COLORS[tabId] || '#888';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      background: `color-mix(in srgb, ${color} 15%, transparent)`,
      color, border: `1px solid ${color}40`, letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>{labels[tabId]}</span>
  );
}

function SeverityBadge({ level }) {
  const colors = { High: '#f87171', Medium: '#fb923c', Low: '#34d399' };
  const c = colors[level] || '#888';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      background: `color-mix(in srgb, ${c} 15%, transparent)`,
      color: c, border: `1px solid ${c}40`, letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>{level}</span>
  );
}

function ProgressPill({ status, onChange }) {
  const opts = [
    { v: 'not-started', label: 'Not started', color: 'var(--text-muted)' },
    { v: 'in-progress',  label: 'In progress',  color: ACC },
    { v: 'done',         label: 'Done',          color: '#34d399' },
  ];
  const cur = opts.find(o => o.v === status) || opts[0];
  const next = opts[(opts.indexOf(cur) + 1) % opts.length];
  return (
    <button onClick={() => onChange(next.v)} style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `color-mix(in srgb, ${cur.color} 15%, transparent)`,
      color: cur.color, border: `1px solid ${cur.color}40`,
      cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>{cur.label}</button>
  );
}

function AudienceToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 20, padding: 3, border: '1px solid var(--border)' }}>
      {[['beginner', 'Beginner'], ['practitioner', 'Practitioner']].map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 16,
          border: 'none', cursor: 'pointer',
          background: value === v ? ACC : 'transparent',
          color: value === v ? '#000' : 'var(--text-muted)',
          transition: 'all 0.15s',
        }}>{l}</button>
      ))}
    </div>
  );
}

// ─── Sub-tab: Overview ────────────────────────────────────────────────────────

function OverviewSubTab({ audience, progress, setProgress }) {
  const allTasks = TASK_CATALOG.length;
  const doneTasks = TASK_CATALOG.filter(t => progress[t.id] === 'done').length;
  const inProgress = TASK_CATALOG.filter(t => progress[t.id] === 'in-progress').length;
  const doneWorkflows = WORKFLOWS.filter(w => progress[w.id] === 'done').length;

  return (
    <div>
      {/* Stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Tasks Complete', value: `${doneTasks}/${allTasks}`, icon: CheckCircle2, color: '#34d399' },
          { label: 'In Progress', value: inProgress, icon: Clock, color: ACC },
          { label: 'Workflows Done', value: `${doneWorkflows}/${WORKFLOWS.length}`, icon: PlayCircle, color: '#38bdf8' },
          { label: 'Projects Available', value: PROJECT_TEMPLATES.length, icon: Target, color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <s.icon size={13} color={s.color} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Maturity Ladder */}
      <SectionCard title="Knowledge Base Maturity Ladder" icon={Layers} defaultOpen>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'Where are you on the journey from "files on a drive" to "a KB that can reason across everything you know"? Find your level and follow the next step.'
            : 'Use this model to diagnose current KB maturity and identify the highest-leverage next action. Each level unlocks new retrieval and reasoning capabilities.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MATURITY_LEVELS.map((lvl, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, padding: '14px 16px',
              background: 'var(--bg)', borderRadius: 'var(--radius-md)',
              border: `1px solid ${cr(0.2)}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: cr(0.15), border: `2px solid ${cr(0.4)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 800, color: ACC,
              }}>{lvl.level}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{lvl.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {lvl.shortDesc}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.55 }}>
                  {audience === 'beginner' ? lvl.beginner : lvl.practitioner}
                </p>
                {lvl.unlocks.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: '#34d399', fontWeight: 600 }}>Unlocks:</span>
                    {lvl.unlocks.map(u => (
                      <span key={u} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>{u}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: ACC, fontStyle: 'italic' }}>→ {lvl.next}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Value Pathways */}
      <SectionCard title="Value Pathways" icon={TrendingUp} defaultOpen>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'Each pathway shows a concrete outcome you can achieve by completing specific KB tasks. Start with the pathway that matters most to your team.'
            : 'Concrete ROI vectors mapped to KB tabs. Use these to prioritize implementation order based on stakeholder needs.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {VALUE_PATHWAYS.map(vp => (
            <div key={vp.id} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{vp.title}</span>
                <TabBadge tabId={vp.tab} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.55 }}>
                {audience === 'beginner' ? vp.beginner : vp.practitioner}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {vp.steps.map((s, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: cr(0.1), color: ACC, border: `1px solid ${cr(0.2)}` }}>{s}</span>
                    {i < vp.steps.length - 1 && <ArrowRight size={10} color="var(--text-muted)" />}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ color: ACC, fontWeight: 600 }}>Outcome: </span>{vp.outcome}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                <span style={{ fontWeight: 600 }}>Metric: </span>{vp.metric}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Sub-tab: Workflows ───────────────────────────────────────────────────────

function WorkflowsSubTab({ audience, progress, setProgress }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <SectionCard title="Workflow Library" icon={Workflow} defaultOpen>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'Step-by-step guides for common KB tasks. Pick the workflow that matches your goal, follow the steps in order, and track your progress.'
            : 'Structured workflow definitions linking ordered KB activities across tabs. Each workflow maps to a concrete deliverable.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WORKFLOWS.map(wf => {
            const isOpen = expanded === wf.id;
            const diffColors = { High: '#f87171', Medium: ACC, Low: '#34d399' };
            const dc = diffColors[wf.difficulty] || '#888';
            return (
              <div key={wf.id} style={{
                background: 'var(--bg)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)', overflow: 'hidden',
              }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : wf.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
                >
                  {isOpen ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{wf.title}</span>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: `color-mix(in srgb, ${dc} 12%, transparent)`, color: dc, border: `1px solid ${dc}40`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{wf.difficulty}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {wf.effort}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{wf.outcome}</div>
                  </div>
                  <ProgressPill status={progress[wf.id] || 'not-started'} onChange={v => setProgress(p => ({ ...p, [wf.id]: v }))} />
                </div>
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {wf.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: cr(0.12), border: `1px solid ${cr(0.3)}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800, color: ACC,
                          }}>{i + 1}</div>
                          <div style={{ flex: 1, paddingTop: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{step.label}</span>
                              {step.tab && <TabBadge tabId={step.tab} />}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>{step.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Project Templates" icon={Target} defaultOpen>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'Ready-made project plans you can hand to a team. Each template defines the goal, what to deliver, who is needed, and how to know if it worked.'
            : 'Project skeletons with defined deliverables, success criteria, and role requirements. Use as starting points for sprint planning.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {PROJECT_TEMPLATES.map(pt => (
            <div key={pt.id} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{pt.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pt.effort}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>{pt.goal}</p>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Deliverables</div>
                {pt.deliverables.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: ACC, opacity: 0.6, marginTop: 5, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{d}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Success Criteria</div>
                {pt.successCriteria.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
                    <CheckCircle2 size={11} color="#34d399" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{c}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {pt.tabs.map(t => <TabBadge key={t} tabId={t} />)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ fontWeight: 600 }}>Roles: </span>{pt.roles.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Sub-tab: Task Catalog ────────────────────────────────────────────────────

function TaskCatalogSubTab({ audience, progress, setProgress }) {
  const [search, setSearch]     = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [filterSkill, setFilterSkill] = useState('all');

  const tabs = ['all', 'literature', 'store', 'ontology', 'ingestion', 'docs', 'governance'];
  const skills = ['all', 'No-code', 'Domain', 'Technical', 'ML/NLP'];

  const visible = useMemo(() => TASK_CATALOG.filter(t => {
    if (filterTab !== 'all' && t.tab !== filterTab) return false;
    if (filterSkill !== 'all' && t.skill !== filterSkill) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.value.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [search, filterTab, filterSkill]);

  const donePct = Math.round((TASK_CATALOG.filter(t => progress[t.id] === 'done').length / TASK_CATALOG.length) * 100);

  return (
    <div>
      {/* Progress bar */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Overall progress</span>
        <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${donePct}%`, background: '#34d399', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: ACC }}>{donePct}%</span>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: 16,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 160 }}>
          <Search size={13} color="var(--text-muted)" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 12, color: 'var(--text)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setFilterTab(t)} style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
              border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
              background: filterTab === t ? (TAB_COLORS[t] || ACC) : 'var(--bg)',
              color: filterTab === t ? '#000' : 'var(--text-muted)',
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {skills.map(s => {
            const c = SKILL_COLORS[s] || ACC;
            return (
              <button key={s} onClick={() => setFilterSkill(s)} style={{
                fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                border: filterSkill === s ? 'none' : `1px solid var(--border)`,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
                background: filterSkill === s ? c : 'transparent',
                color: filterSkill === s ? '#000' : 'var(--text-muted)',
              }}>{s}</button>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        {visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No tasks match the current filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Task', 'Tab', 'Effort', 'Skill', 'Value Generated', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((task, i) => {
                const sc = SKILL_COLORS[task.skill] || '#888';
                return (
                  <tr key={task.id} style={{ borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none', background: progress[task.id] === 'done' ? 'rgba(52,211,153,0.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: progress[task.id] === 'done' ? 'var(--text-muted)' : 'var(--text)', textDecoration: progress[task.id] === 'done' ? 'line-through' : 'none' }}>{task.name}</td>
                    <td style={{ padding: '10px 14px' }}><TabBadge tabId={task.tab} /></td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>{task.effort}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: `color-mix(in srgb, ${sc} 12%, transparent)`, color: sc, border: `1px solid ${sc}40`, fontWeight: 700 }}>{task.skill}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', maxWidth: 240 }}>{task.value}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <ProgressPill status={progress[task.id] || 'not-started'} onChange={v => setProgress(p => ({ ...p, [task.id]: v }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Sub-tab: Value & ROI ─────────────────────────────────────────────────────

function ValueSubTab({ audience }) {
  return (
    <div>
      {/* Cost/Benefit Matrix */}
      <SectionCard title="Cost / Benefit Matrix" icon={BarChart2} defaultOpen>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'For each KB activity: what does it cost to do it, what is the cost of skipping it, and what do you get if you do it right.'
            : 'ROI analysis per KB activity. Use to justify prioritization decisions and make the case to stakeholders who question KB investment.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COST_BENEFIT.map((row, i) => (
            <div key={i} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{row.activity}</span>
                <TabBadge tabId={row.tab} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '8px 12px', background: 'rgba(52,211,153,0.06)', borderRadius: 8, border: '1px solid rgba(52,211,153,0.15)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Cost of Doing It</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{row.costDo}</div>
                </div>
                <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.06)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Cost of Skipping It</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{row.costSkip}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.04)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.1)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Risk if Skipped</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{row.riskSkip}</div>
                </div>
                <div style={{ padding: '8px 12px', background: `${cr(0.05)}`, borderRadius: 8, border: `1px solid ${cr(0.15)}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Value Unlocked</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{row.valueUnlocked}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Value Demonstration Guide */}
      <SectionCard title="Value Demonstration Guide" icon={TrendingUp} defaultOpen={false}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'How to prove the KB is working — what to measure, who to show it to, and what evidence looks convincing to each type of person.'
            : 'Stakeholder-specific metric sets for demonstrating KB ROI. Instrument these at project start; baseline before vs. after to produce evidence.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {VALUE_METRICS.map(sm => (
            <div key={sm.stakeholder} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>{sm.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{sm.stakeholder}</div>
              {sm.metrics.map((m, i) => (
                <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < sm.metrics.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{m.name}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)', whiteSpace: 'nowrap', fontWeight: 700 }}>Target: {m.good}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{m.desc}</div>
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                <span style={{ color: ACC, fontWeight: 600 }}>How to show it: </span>{sm.howToShow}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Sub-tab: Pitfalls ────────────────────────────────────────────────────────

function PitfallsSubTab({ audience }) {
  return (
    <div>
      <SectionCard title="Common Pitfalls" icon={AlertTriangle} defaultOpen>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {audience === 'beginner'
            ? 'The most common ways KB projects fail — and what to do instead. Read these before you start, not after something breaks.'
            : 'Failure mode catalog for KB implementations. Use during design review and retrospectives.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PITFALLS.map((p, i) => (
            <div key={p.id} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertCircle size={14} color={p.severity === 'High' ? '#f87171' : p.severity === 'Medium' ? '#fb923c' : '#34d399'} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{p.title}</span>
                <SeverityBadge level={p.severity} />
                {p.tab && <TabBadge tabId={p.tab} />}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.55 }}>
                {audience === 'beginner' ? p.beginner : p.practitioner}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'rgba(248,113,113,0.05)', borderRadius: 6, border: '1px solid rgba(248,113,113,0.12)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Consequence</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{p.consequence}</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'rgba(52,211,153,0.05)', borderRadius: 6, border: '1px solid rgba(52,211,153,0.12)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Fix</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>{p.fix}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SUB_TABS = [
  { id: 'overview',   label: 'Overview',           icon: Layers    },
  { id: 'workflows',  label: 'Workflows & Projects', icon: Workflow  },
  { id: 'tasks',      label: 'Task Catalog',        icon: CheckSquare },
  { id: 'value',      label: 'Value & ROI',         icon: TrendingUp },
  { id: 'pitfalls',   label: 'Pitfalls',            icon: AlertTriangle },
];

export default function WorkflowsTab() {
  const [subTab,    setSubTab]   = useState('overview');
  const [audience,  setAudience] = useState('beginner');
  const [progress,  setProgress] = useState({});

  return (
    <div style={{ padding: '0 2px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 16,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
          background: cr(0.12), display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={20} color={ACC} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Workflows & Value Guide</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            How to use the Knowledge Base tools to deliver real value. Structured workflows, project templates, a task catalog with progress tracking, ROI analysis, and a pitfall guide for every stage of KB work.
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          <AudienceToggle value={audience} onChange={setAudience} />
        </div>
      </div>

      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 6,
      }}>
        {SUB_TABS.map(st => {
          const active = subTab === st.id;
          return (
            <button key={st.id} onClick={() => setSubTab(st.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 10px', borderRadius: 'var(--radius-md)',
              border: 'none', cursor: 'pointer',
              background: active ? cr(0.15) : 'transparent',
              color: active ? ACC : 'var(--text-muted)',
              fontWeight: active ? 700 : 500, fontSize: 12,
              outline: active ? `1px solid ${cr(0.3)}` : 'none',
              transition: 'all 0.15s',
            }}>
              <st.icon size={13} />
              {st.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div style={{ display: subTab === 'overview'  ? 'block' : 'none' }}><OverviewSubTab  audience={audience} progress={progress} setProgress={setProgress} /></div>
      <div style={{ display: subTab === 'workflows' ? 'block' : 'none' }}><WorkflowsSubTab audience={audience} progress={progress} setProgress={setProgress} /></div>
      <div style={{ display: subTab === 'tasks'     ? 'block' : 'none' }}><TaskCatalogSubTab audience={audience} progress={progress} setProgress={setProgress} /></div>
      <div style={{ display: subTab === 'value'     ? 'block' : 'none' }}><ValueSubTab      audience={audience} /></div>
      <div style={{ display: subTab === 'pitfalls'  ? 'block' : 'none' }}><PitfallsSubTab   audience={audience} /></div>
    </div>
  );
}
