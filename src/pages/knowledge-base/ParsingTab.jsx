import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FlaskConical, BookOpen, X, Network,
  FileText, Rows, AlignLeft, MessageSquare, Brackets, Type,
  Tag, Cpu, Wand2, ArrowRight, Layers, ChevronRight, ChevronLeft, RotateCcw,
  Zap, SlidersHorizontal, Box, Upload,
} from 'lucide-react';
import { pdfjs } from 'react-pdf';
import IngestionPipelineTab from './IngestionPipelineTab';

// ─── Subtab definitions ───────────────────────────────────────────────────────

const SUBTABS = [
  { id: 'bench',      label: 'Bench',      icon: FlaskConical },
  { id: 'references', label: 'References', icon: BookOpen,  modal: true },
];

// ─── Segmentation hierarchy data ─────────────────────────────────────────────

const HIERARCHY = [
  {
    id: 'document',
    label: 'Document',
    icon: FileText,
    color: '#38bdf8',
    desc: 'The full raw text output from the parser. Everything else derives from this.',
    how: null,
    badge: 'root',
    badgeColor: '#38bdf8',
  },
  {
    id: 'sections',
    label: 'Sections',
    icon: Rows,
    color: '#a78bfa',
    desc: 'Major logical divisions of the document — Introduction, Methods, Results, References, etc. Identified by isolated heading lines.',
    how: 'Heading detection (already implemented in this bench)',
    badge: 'already implemented',
    badgeColor: '#34d399',
  },
  {
    id: 'paragraphs',
    label: 'Paragraphs',
    icon: AlignLeft,
    color: '#fb923c',
    desc: 'Blocks of text separated by a blank line. Simple and reliable for clean PDFs. Complex layouts (columns, tables) may require parser-specific handling.',
    how: 'Split on double newline \\n\\n',
    badge: 'easy',
    badgeColor: '#fb923c',
  },
  {
    id: 'sentences',
    label: 'Sentences',
    icon: MessageSquare,
    color: '#fbbf24',
    desc: 'The sweet spot for entity extraction. Gives each entity enough surrounding context for disambiguation. Harder than splitting on "." — abbreviations, citations, and decimals all require proper tokenization.',
    how: 'spaCy (nlp(text).sents)  ·  pySBD  ·  NLTK sent_tokenize()',
    badge: 'recommended unit',
    badgeColor: '#fbbf24',
  },
  {
    id: 'chunks',
    label: 'Noun Chunks / Phrases',
    icon: Brackets,
    color: '#f472b6',
    desc: 'Multi-word noun phrases extracted grammatically — "the systematic review", "health literacy outcomes". Almost all named entities are noun phrases, making this a natural pre-filter before NER.',
    how: 'spaCy doc.noun_chunks (requires POS tagging)',
    badge: 'entity candidates',
    badgeColor: '#f472b6',
  },
  {
    id: 'tokens',
    label: 'Tokens / Words',
    icon: Type,
    color: '#94a3b8',
    desc: 'Individual word tokens with part-of-speech tags, dependency labels, and lemmas. Used for filtering (noun-only, verb-only), stop-word removal, and morphological normalization.',
    how: 'spaCy doc iteration  ·  NLTK word_tokenize()',
    badge: 'finest grain',
    badgeColor: '#94a3b8',
  },
];

// ─── NER tier data ───────────────────────────────────────────────────────────

const NER_TIERS = [
  {
    id: 'rule',
    label: 'Rule-based / Pattern matching',
    icon: Tag,
    color: '#34d399',
    bullets: [
      'Regex for emails, URLs, dates, phone numbers, monetary values',
      'Dictionary lookup against known term lists (drug names, gene symbols, company names)',
      'Fast, predictable, zero false positives on known patterns',
      'No generalization — misses anything not in the dictionary',
    ],
  },
  {
    id: 'statistical',
    label: 'Statistical NER models',
    icon: Cpu,
    color: '#a78bfa',
    bullets: [
      'spaCy pretrained models (en_core_web_sm/md/lg/trf): PERSON, ORG, GPE, DATE, MONEY, PRODUCT, EVENT',
      'Flair embeddings + sequence labeling: often higher accuracy than spaCy on benchmarks',
      'GLiNER — zero-shot NER: provide entity type labels at inference time, no fine-tuning needed',
      'Stanza (Stanford NLP) — strong multilingual support',
    ],
  },
  {
    id: 'llm',
    label: 'LLM-based extraction',
    icon: Wand2,
    color: '#fb923c',
    bullets: [
      'Prompt an LLM with the text + a schema of desired entity types',
      'Most flexible — handles novel entity types with no training',
      'Slower and more expensive, but quality can be very high',
      'Best for complex types: "risk factor", "methodology", "claim", "evidence"',
    ],
  },
];

const STANDARD_TYPES = [
  { type: 'PERSON',   example: '"Darren DeWalt", "Nancy Berkman"',    color: '#38bdf8' },
  { type: 'ORG',      example: '"MEDLINE", "CINAHL"',                 color: '#a78bfa' },
  { type: 'GPE',      example: '(geopolitical) "U.S.", "Boston"',     color: '#34d399' },
  { type: 'DATE',     example: '"1980 to 2003", "March 2024"',         color: '#fbbf24' },
  { type: 'CARDINAL', example: '"3,015", "684 articles", "73"',        color: '#f472b6' },
];

const DOMAIN_TYPES = [
  { type: 'METHODOLOGY', example: '"systematic review", "cross-sectional"', color: '#fb923c' },
  { type: 'MEASURE',     example: '"health literacy", "morbidity"',          color: '#38bdf8' },
  { type: 'FINDING',     example: '"1.5 to 3 times more likely"',            color: '#34d399' },
  { type: 'DATABASE',    example: '"MEDLINE", "CINAHL", "PsychInfo"',        color: '#a78bfa' },
];

// ─── Segmentation Visualization ──────────────────────────────────────────────

const LEVEL_KEYS = ['document', 'section', 'paragraph', 'sentence', 'chunk', 'token'];
const LEVEL_DEPTH = Object.fromEntries(LEVEL_KEYS.map((k, i) => [k, i]));

const VIZ_COLORS = {
  document:  { bg: 'rgba(56,189,248,0.07)',  border: 'rgba(56,189,248,0.45)',  text: '#38bdf8',  label: 'Document',    tool: 'Parser output' },
  section:   { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.45)', text: '#a78bfa',  label: 'Section',     tool: 'Heading detection' },
  paragraph: { bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.45)',  text: '#fb923c',  label: 'Paragraph',   tool: 'Split on \\n\\n' },
  sentence:  { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.40)',  text: '#fbbf24',  label: 'Sentence',    tool: 'spaCy / pySBD' },
  chunk:     { bg: 'rgba(244,114,182,0.13)', border: 'rgba(244,114,182,0.50)', text: '#f472b6',  label: 'Noun chunk',  tool: 'spaCy noun_chunks' },
  token:     { bg: 'rgba(52,211,153,0.20)',  border: 'rgba(52,211,153,0.50)',  text: '#34d399',  label: 'Token',       tool: 'spaCy tokenizer' },
};

// ─── POS tag coloring (#9) ──────────────────────────────────────────────────
const POS_COLORS = {
  DET:  { color: '#94a3b8', label: 'Determiner' },   // the, a, all
  ADJ:  { color: '#fb923c', label: 'Adjective' },     // systematic, low, multiple
  NOUN: { color: '#38bdf8', label: 'Noun' },           // study, literacy, review
  PROPN:{ color: '#a78bfa', label: 'Proper noun' },    // MEDLINE, CINAHL, Bonferroni
  NUM:  { color: '#fbbf24', label: 'Number' },          // 3,015, 1.5, 684
  VERB: { color: '#34d399', label: 'Verb' },            // examined, included, were
  ADP:  { color: '#64748b', label: 'Preposition' },     // in, for, by, across
  CCONJ:{ color: '#64748b', label: 'Conjunction' },     // and, or
  ADV:  { color: '#f472b6', label: 'Adverb' },          // independently, more, likely
  SCONJ:{ color: '#64748b', label: 'Subord. conj.' },   // when, that
  SYM:  { color: '#fbbf24', label: 'Symbol' },          // <
  PART: { color: '#64748b', label: 'Particle' },        // to
};

// Token with POS tag: { w: 'word', p: 'NOUN' }
// Chunk: array of tagged tokens
// Plain word (not in a chunk): tagged token object
// Sentence: array of chunks (arrays) or plain tokens (objects)

// Step-by-step descriptions (#8)
const STEP_DESCRIPTIONS = [
  { level: 'document',  title: 'Document',  desc: 'The raw parser output — one continuous block of text.' },
  { level: 'section',   title: 'Sections',  desc: 'Detected via isolated heading lines (all-caps, short, no punctuation). Splits the document into logical divisions.' },
  { level: 'paragraph', title: 'Paragraphs', desc: 'Split on double-newline (\\n\\n) boundaries within each section. Simple and reliable.' },
  { level: 'sentence',  title: 'Sentences',  desc: 'Sentence boundary detection via spaCy or pySBD. Handles abbreviations, decimals, and citations correctly.' },
  { level: 'chunk',     title: 'Noun Chunks', desc: 'Grammatical noun phrases extracted by spaCy — these are the natural candidates for entity extraction.' },
  { level: 'token',     title: 'Tokens',     desc: 'Individual words with POS tags, dependency labels, and lemmas. The finest unit of analysis.' },
];

// Illustrative document content with POS tags (#5 variable length, #9 POS)
const T = (w, p) => ({ w, p }); // shorthand
const SECTIONS_DATA = [
  {
    heading: 'INTRODUCTION',
    title: 'Introduction',
    paragraphs: [
      [
        // Long sentence
        [[T('The','DET'), T('systematic','ADJ'), T('review','NOUN')], T('examined','VERB'), [T('the','DET'), T('relationship','NOUN')], T('between','ADP'), [T('health','NOUN'), T('literacy','NOUN')], T('and','CCONJ'), [T('patient','NOUN'), T('outcomes','NOUN')], T('across','ADP'), [T('multiple','ADJ'), T('clinical','ADJ'), T('settings','NOUN')], T('in','ADP'), [T('developing','ADJ'), T('countries','NOUN')]],
        // Short
        [[T('Data','NOUN'), T('sources','NOUN')], T('included','VERB'), [T('MEDLINE','PROPN')], T('and','CCONJ'), [T('CINAHL','PROPN')]],
        // Medium
        [[T('Additional','ADJ'), T('databases','NOUN')], T('were','VERB'), [T('screened','VERB')], T('for','ADP'), [T('relevant','ADJ'), T('publications','NOUN')], T('through','ADP'), [T('December','PROPN'), T('2024','NUM')]],
      ],
      [
        [[T('Two','NUM'), T('reviewers','NOUN')], T('independently','ADV'), [T('assessed','VERB'), T('quality','NOUN')]],
        [[T('Disagreements','NOUN')], T('were','VERB'), [T('resolved','VERB')], T('by','ADP'), [T('consensus','NOUN')], T('or','CCONJ'), T('by','ADP'), [T('a','DET'), T('third','ADJ'), T('reviewer','NOUN')], T('when','SCONJ'), [T('necessary','ADJ')]],
      ],
    ],
  },
  {
    heading: 'METHODS',
    title: 'Methods',
    paragraphs: [
      [
        [[T('Observational','ADJ'), T('studies','NOUN')], T('that','SCONJ'), [T('reported','VERB')], [T('original','ADJ'), T('data','NOUN')], T('on','ADP'), [T('literacy','NOUN'), T('measures','NOUN')], T('and','CCONJ'), [T('health','NOUN'), T('outcomes','NOUN')], T('were','VERB'), [T('included','VERB')], T('in','ADP'), [T('the','DET'), T('analysis','NOUN')]],
        [[T('Randomized','ADJ'), T('trials','NOUN')], T('were','VERB'), [T('excluded','VERB')]],
      ],
      [
        [[T('Sample','NOUN'), T('size','NOUN')], T('was','VERB'), [T('calculated','VERB')], T('using','ADP'), [T('standard','ADJ'), T('power','NOUN'), T('formulas','NOUN')]],
        [[T('All','DET'), T('patients','NOUN')], [T('consented','VERB')]],
        [[T('Statistical','ADJ'), T('significance','NOUN')], T('was','VERB'), [T('defined','VERB')], T('as','ADP'), [T('p','NOUN'), T('<','SYM'), T('0.05','NUM')], T('after','ADP'), [T('Bonferroni','PROPN'), T('correction','NOUN')], T('for','ADP'), [T('multiple','ADJ'), T('comparisons','NOUN')]],
      ],
    ],
  },
  {
    heading: 'RESULTS',
    title: 'Results',
    paragraphs: [
      [
        [[T('A','DET'), T('total','NOUN')], T('of','ADP'), [T('3,015','NUM'), T('titles','NOUN')], T('were','VERB'), [T('screened','VERB')], T('and','CCONJ'), [T('684','NUM'), T('articles','NOUN')], [T('retrieved','VERB')]],
        [[T('Patients','NOUN')], T('with','ADP'), [T('low','ADJ'), T('literacy','NOUN')], T('were','VERB'), [T('1.5','NUM'), T('to','PART'), T('3','NUM'), T('times','NOUN')], T('more','ADV'), T('likely','ADV'), T('to','PART'), [T('experience','VERB')], [T('poor','ADJ'), T('outcomes','NOUN')], T('than','ADP'), [T('literate','ADJ'), T('controls','NOUN')]],
      ],
    ],
  },
];

// Helper: extract all words from SECTIONS_DATA as flat raw text per section
function extractRawText() {
  const lines = [];
  for (const sec of SECTIONS_DATA) {
    lines.push(sec.heading);
    lines.push('');
    for (const para of sec.paragraphs) {
      const sentTexts = para.map(sent =>
        sent.map(part => {
          if (Array.isArray(part)) return part.map(t => t.w).join(' ');
          return part.w;
        }).join(' ')
      );
      lines.push(sentTexts.join('. ') + '.');
      lines.push('');
    }
  }
  return lines;
}

// Build a flat word list with position IDs for cross-highlight (#10)
function buildWordIndex() {
  const words = []; // { word, sectionIdx, paraIdx, sentIdx, partIdx, tokenIdx, id }
  let id = 0;
  SECTIONS_DATA.forEach((sec, si) => {
    sec.paragraphs.forEach((para, pi) => {
      para.forEach((sent, sei) => {
        sent.forEach((part, pai) => {
          if (Array.isArray(part)) {
            part.forEach((tok, ti) => {
              words.push({ word: tok.w, pos: tok.p, sectionIdx: si, paraIdx: pi, sentIdx: sei, partIdx: pai, tokenIdx: ti, id: id++, isChunk: true });
            });
          } else {
            words.push({ word: part.w, pos: part.p, sectionIdx: si, paraIdx: pi, sentIdx: sei, partIdx: -1, tokenIdx: -1, id: id++, isChunk: false });
          }
        });
      });
    });
  });
  return words;
}

// ─── Real document parser (#13) ─────────────────────────────────────────────
// Converts raw text into the same SECTIONS_DATA format used by the viz.
// Uses simple heuristics: headings = isolated short ALL-CAPS lines, paragraphs = double newline,
// sentences = split on ". " / "? " / "! ", chunks = multi-word capitalized runs, tokens = words.

// Common POS guesser (heuristic, not real NLP)
const COMMON_DET = new Set(['the','a','an','this','that','these','those','each','every','all','some','any','no','my','your','his','her','its','our','their']);
const COMMON_ADP = new Set(['in','on','at','by','for','with','from','to','of','about','between','through','across','into','over','under','after','before','during','within','among','against','upon','along','toward','towards','without','since','until','beyond','around','below','above','behind','beside','besides','near','past']);
const COMMON_CCONJ = new Set(['and','or','but','nor','yet','so']);
const COMMON_SCONJ = new Set(['when','while','if','although','because','since','unless','that','than','whether','where','after','before','until','once','whereas']);
const COMMON_VERB = new Set(['is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can','could','must']);
const COMMON_ADV = new Set(['not','also','very','often','already','always','never','still','just','only','more','most','less','well','then','now','here','there','however','therefore','thus','hence','moreover','furthermore','nevertheless','nonetheless','meanwhile','instead','otherwise','accordingly','consequently','indeed','perhaps','probably','possibly','certainly','definitely','apparently','presumably','roughly','approximately','independently','likely']);

function guessPos(word) {
  const lw = word.toLowerCase();
  if (COMMON_DET.has(lw)) return 'DET';
  if (COMMON_ADP.has(lw)) return 'ADP';
  if (COMMON_CCONJ.has(lw)) return 'CCONJ';
  if (COMMON_SCONJ.has(lw)) return 'SCONJ';
  if (COMMON_VERB.has(lw)) return 'VERB';
  if (COMMON_ADV.has(lw)) return 'ADV';
  if (/^\d[\d,.]*$/.test(word)) return 'NUM';
  if (/^[A-Z]{2,}$/.test(word)) return 'PROPN';
  if (/^[A-Z][a-z]/.test(word) && word.length > 1) return 'PROPN';
  // Simple heuristic: words ending in -ly are adverbs, -ed/-ing are verbs, -tion/-ment/-ness are nouns
  if (/ly$/.test(lw) && lw.length > 3) return 'ADV';
  if (/(?:ed|ing)$/.test(lw) && lw.length > 4) return 'VERB';
  if (/(?:tion|ment|ness|ity|ence|ance|ism|ist|ure|age|ery|ory)$/.test(lw)) return 'NOUN';
  if (/(?:ive|ous|ful|less|able|ible|ical|al|ary|ent|ant)$/.test(lw) && lw.length > 4) return 'ADJ';
  return 'NOUN'; // default
}

function parseRealDocument(rawText) {
  if (!rawText || !rawText.trim()) return null;

  const lines = rawText.split('\n');
  // Detect sections: isolated short lines, often ALL-CAPS or title case, no trailing punctuation
  const isHeadingLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) return false;
    if (/[.!?,;:]$/.test(trimmed)) return false;
    // Markdown headings
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    // ALL CAPS short line
    if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length < 60) return true;
    // Common heading words
    const lower = trimmed.toLowerCase().replace(/^\d+[\.\)]\s*/, '');
    const headings = ['abstract','introduction','background','methods','methodology','materials','results','discussion','conclusion','conclusions','references','acknowledgments','acknowledgements','appendix','supplementary','funding','limitations','future work','related work','literature review','data','analysis','study design','participants','procedures','measures','statistical analysis','ethics','summary','overview'];
    if (headings.some(h => lower === h || lower.startsWith(h + ' '))) return true;
    return false;
  };

  // 1) Split into sections
  const rawSections = [];
  let currentSec = { heading: '', title: 'Preamble', lines: [] };

  for (const line of lines) {
    if (isHeadingLine(line) && (currentSec.lines.some(l => l.trim()) || rawSections.length > 0)) {
      if (currentSec.lines.some(l => l.trim())) rawSections.push(currentSec);
      const clean = line.trim().replace(/^#{1,6}\s+/, '').replace(/^\d+[\.\)]\s*/, '');
      currentSec = { heading: clean.toUpperCase(), title: clean, lines: [] };
    } else {
      currentSec.lines.push(line);
    }
  }
  if (currentSec.lines.some(l => l.trim())) rawSections.push(currentSec);

  // If no sections detected, treat whole thing as one section
  if (rawSections.length === 0) {
    rawSections.push({ heading: 'DOCUMENT', title: 'Document', lines });
  }

  // 2) For each section, split into paragraphs, sentences, chunks, tokens
  // Limit to first 5 sections and ~200 tokens total to keep viz snappy
  let totalTokens = 0;
  const MAX_TOKENS = 250;
  const MAX_SECTIONS = 5;

  const sections = [];
  for (const sec of rawSections.slice(0, MAX_SECTIONS)) {
    if (totalTokens >= MAX_TOKENS) break;

    // Join lines, split into paragraphs on double newline
    const text = sec.lines.join('\n');
    const rawParas = text.split(/\n\s*\n/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean);

    const paragraphs = [];
    for (const paraText of rawParas.slice(0, 4)) {
      if (totalTokens >= MAX_TOKENS) break;

      // Split into sentences (simple heuristic)
      const rawSentences = paraText.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim());
      const sentences = [];

      for (const sentText of rawSentences.slice(0, 5)) {
        if (totalTokens >= MAX_TOKENS) break;

        const words = sentText.split(/\s+/).filter(Boolean);
        // Build sentence parts: group consecutive noun-ish words into chunks
        const parts = [];
        let currentChunk = [];

        for (const word of words.slice(0, 30)) {
          const pos = guessPos(word);
          const tok = { w: word, p: pos };

          if (pos === 'NOUN' || pos === 'ADJ' || pos === 'PROPN' || pos === 'NUM' || pos === 'DET') {
            currentChunk.push(tok);
          } else {
            if (currentChunk.length > 1) {
              parts.push(currentChunk);
              totalTokens += currentChunk.length;
            } else if (currentChunk.length === 1) {
              parts.push(currentChunk[0]);
              totalTokens += 1;
            }
            currentChunk = [];
            parts.push(tok);
            totalTokens += 1;
          }
        }
        if (currentChunk.length > 1) { parts.push(currentChunk); totalTokens += currentChunk.length; }
        else if (currentChunk.length === 1) { parts.push(currentChunk[0]); totalTokens += 1; }

        if (parts.length > 0) sentences.push(parts);
      }
      if (sentences.length > 0) paragraphs.push(sentences);
    }
    if (paragraphs.length > 0) {
      sections.push({ heading: sec.heading, title: sec.title, paragraphs });
    }
  }

  return sections.length > 0 ? sections : null;
}

// Build word index for arbitrary sections data (for live doc)
function buildWordIndexFromSections(secs) {
  const words = [];
  let id = 0;
  secs.forEach((sec, si) => {
    sec.paragraphs.forEach((para, pi) => {
      para.forEach((sent, sei) => {
        sent.forEach((part, pai) => {
          if (Array.isArray(part)) {
            part.forEach((tok, ti) => {
              words.push({ word: tok.w, pos: tok.p, sectionIdx: si, paraIdx: pi, sentIdx: sei, partIdx: pai, tokenIdx: ti, id: id++, isChunk: true });
            });
          } else {
            words.push({ word: part.w, pos: part.p, sectionIdx: si, paraIdx: pi, sentIdx: sei, partIdx: -1, tokenIdx: -1, id: id++, isChunk: false });
          }
        });
      });
    });
  });
  return words;
}

// ─── Tooltip component ──────────────────────────────────────────────────────

function VizTooltip({ text, visible, x, y }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 8,
      padding: '5px 10px', borderRadius: 6,
      background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      fontSize: 10, color: '#e2e8f0', whiteSpace: 'nowrap',
      pointerEvents: 'none', zIndex: 1000,
      lineHeight: 1.5,
    }}>
      {text}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

// (#11) Count badge — small pill showing count info on a region
function CountBadge({ text, color }) {
  return (
    <span style={{
      fontSize: 7, fontWeight: 700, color,
      padding: '0px 5px', borderRadius: 8, lineHeight: '14px',
      background: `${color}12`, border: `1px solid ${color}25`,
      whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em',
      marginLeft: 'auto',
    }}>{text}</span>
  );
}

// Scanned-mode OCR placeholder bar for a word
function OcrBar({ width }) {
  return (
    <span style={{
      display: 'inline-block', width: width || 28, height: 8, borderRadius: 2,
      background: 'rgba(148,163,184,0.22)',
    }} />
  );
}

// (#9) POS-colored token
function VToken({ tok, dimmed, revealStage, onHoverLevel, scanned, showPos, hoveredWordId, wordId, onWordHover }) {
  const c = VIZ_COLORS.token;
  const visible = revealStage >= LEVEL_DEPTH.token;
  const word = tok.w;
  const pos = tok.p;
  const barW = Math.max(16, word.length * 5.5);
  const posC = showPos && POS_COLORS[pos] ? POS_COLORS[pos].color : c.text;
  const posLabel = POS_COLORS[pos]?.label || pos;
  const crossHighlight = hoveredWordId !== null && hoveredWordId === wordId;
  return (
    <span
      onMouseEnter={(e) => {
        onHoverLevel('token', `Token: "${word}"  ·  POS: ${pos} (${posLabel})`, e);
        if (onWordHover) onWordHover(wordId);
      }}
      onMouseLeave={() => { onHoverLevel(null); if (onWordHover) onWordHover(null); }}
      style={{
        fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
        padding: '1px 5px', borderRadius: 3,
        background: crossHighlight ? 'rgba(56,189,248,0.25)' : c.bg,
        border: `1px solid ${crossHighlight ? 'rgba(56,189,248,0.6)' : c.border}`,
        color: showPos ? posC : c.text,
        whiteSpace: 'nowrap', lineHeight: 1.6,
        opacity: !visible ? 0 : dimmed ? 0.15 : 1,
        transform: visible ? 'scale(1)' : 'scale(0.7)',
        transition: 'opacity 0.35s ease, transform 0.35s ease, background 0.15s, border-color 0.15s',
        display: 'inline-flex', alignItems: 'center',
      }}
    >{scanned ? <OcrBar width={barW} /> : word}</span>
  );
}

function VChunk({ tokens, dimmed, revealStage, onHoverLevel, scanned, showPos, hoveredWordId, wordIdStart, onWordHover, showCounts }) {
  const c = VIZ_COLORS.chunk;
  const visible = revealStage >= LEVEL_DEPTH.chunk;
  const tokenCount = tokens.length;
  return (
    <span
      onMouseEnter={(e) => onHoverLevel('chunk', `Noun chunk  ·  ${tokenCount} token${tokenCount !== 1 ? 's' : ''}  ·  ${VIZ_COLORS.chunk.tool}`, e)}
      onMouseLeave={() => onHoverLevel(null)}
      style={{
        display: 'inline-flex', gap: 2, alignItems: 'center',
        padding: '2px 5px', borderRadius: 5,
        background: c.bg, border: `1px solid ${c.border}`,
        opacity: !visible ? 0 : dimmed ? 0.15 : 1,
        transform: visible ? 'scale(1)' : 'scale(0.85)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
      }}
    >
      {tokens.map((tok, i) => (
        <VToken key={i} tok={tok} dimmed={dimmed} revealStage={revealStage} onHoverLevel={onHoverLevel}
          scanned={scanned} showPos={showPos} hoveredWordId={hoveredWordId}
          wordId={wordIdStart + i} onWordHover={onWordHover} />
      ))}
      {showCounts && <CountBadge text={`${tokenCount}t`} color={c.text} />}
    </span>
  );
}

function VPlain({ tok, dimmed, revealStage, scanned, showPos, hoveredWordId, wordId, onWordHover, onHoverLevel }) {
  const visible = revealStage >= LEVEL_DEPTH.token;
  const barW = Math.max(14, tok.w.length * 5);
  const posC = showPos && POS_COLORS[tok.p] ? POS_COLORS[tok.p].color : '#475569';
  const crossHighlight = hoveredWordId !== null && hoveredWordId === wordId;
  return (
    <span
      onMouseEnter={(e) => {
        if (onHoverLevel) onHoverLevel('token', `"${tok.w}"  ·  POS: ${tok.p}`, e);
        if (onWordHover) onWordHover(wordId);
      }}
      onMouseLeave={() => { if (onHoverLevel) onHoverLevel(null); if (onWordHover) onWordHover(null); }}
      style={{
        fontSize: 9, color: posC, fontFamily: 'monospace', whiteSpace: 'nowrap',
        opacity: !visible ? 0 : dimmed ? 0.15 : 1,
        transition: 'opacity 0.35s ease, background 0.15s',
        display: 'inline-flex', alignItems: 'center',
        padding: '0 1px', borderRadius: 2,
        background: crossHighlight ? 'rgba(56,189,248,0.18)' : 'transparent',
      }}>
      {scanned ? <OcrBar width={barW} /> : tok.w}
    </span>
  );
}

// Count words in a sentence (for summary labels)
function sentWordCount(parts) {
  return parts.reduce((n, p) => n + (Array.isArray(p) ? p.length : 1), 0);
}
function sentChunkCount(parts) {
  return parts.filter(p => Array.isArray(p)).length;
}

function VSentence({ parts, dimmed, maxDepth, revealStage, onHoverLevel, scanned, showPos, hoveredWordId, wordIdStart, onWordHover, showCounts }) {
  const c = VIZ_COLORS.sentence;
  const visible = revealStage >= LEVEL_DEPTH.sentence;
  const chunkCount = sentChunkCount(parts);
  const wordCount = sentWordCount(parts);
  const showChildren = maxDepth > LEVEL_DEPTH.sentence;
  let runningId = wordIdStart;
  return (
    <div
      onMouseEnter={(e) => { e.stopPropagation(); onHoverLevel('sentence', `Sentence  ·  ${chunkCount} chunk${chunkCount !== 1 ? 's' : ''}, ${wordCount} words  ·  ${VIZ_COLORS.sentence.tool}`, e); }}
      onMouseLeave={() => onHoverLevel(null)}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center',
        padding: showChildren ? '5px 7px' : '8px 10px',
        borderRadius: 5,
        background: c.bg, border: `1px solid ${c.border}`,
        opacity: !visible ? 0 : dimmed ? 0.15 : 1,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        minHeight: showChildren ? undefined : 12,
      }}
    >
      {showChildren ? parts.map((part, i) => {
        if (Array.isArray(part)) {
          const startId = runningId;
          runningId += part.length;
          return <VChunk key={i} tokens={part} dimmed={dimmed} revealStage={revealStage} onHoverLevel={onHoverLevel}
            scanned={scanned} showPos={showPos} hoveredWordId={hoveredWordId} wordIdStart={startId} onWordHover={onWordHover} showCounts={showCounts} />;
        }
        const thisId = runningId++;
        return <VPlain key={i} tok={part} dimmed={dimmed} revealStage={revealStage} scanned={scanned}
          showPos={showPos} hoveredWordId={hoveredWordId} wordId={thisId} onWordHover={onWordHover} onHoverLevel={onHoverLevel} />;
      }) : (
        <span style={{ fontSize: 8, color: c.text, fontFamily: 'monospace', opacity: 0.7 }}>
          {wordCount} words · {chunkCount} chunks
        </span>
      )}
      {showCounts && showChildren && <CountBadge text={`${chunkCount}ch · ${wordCount}w`} color={c.text} />}
    </div>
  );
}

function VParagraph({ sentences, dimmed, maxDepth, revealStage, onHoverLevel, scanned, showPos, hoveredWordId, wordIdStart, onWordHover, showCounts }) {
  const c = VIZ_COLORS.paragraph;
  const visible = revealStage >= LEVEL_DEPTH.paragraph;
  const sentCount = sentences.length;
  const showChildren = maxDepth > LEVEL_DEPTH.paragraph;
  let runningId = wordIdStart;
  return (
    <div
      onMouseEnter={(e) => { e.stopPropagation(); onHoverLevel('paragraph', `Paragraph  ·  ${sentCount} sentence${sentCount !== 1 ? 's' : ''}  ·  ${VIZ_COLORS.paragraph.tool}`, e); }}
      onMouseLeave={() => onHoverLevel(null)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: showChildren ? '6px 8px' : '10px 12px',
        borderRadius: 6,
        background: c.bg, border: `1px solid ${c.border}`,
        opacity: !visible ? 0 : dimmed ? 0.15 : 1,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        minHeight: showChildren ? undefined : 14,
        position: 'relative',
      }}
    >
      {showCounts && showChildren && (
        <CountBadge text={`${sentCount} sent`} color={c.text} />
      )}
      {showChildren ? sentences.map((s, i) => {
        const startId = runningId;
        runningId += sentWordCount(s);
        return <VSentence key={i} parts={s} dimmed={dimmed} maxDepth={maxDepth} revealStage={revealStage}
          onHoverLevel={onHoverLevel} scanned={scanned} showPos={showPos}
          hoveredWordId={hoveredWordId} wordIdStart={startId} onWordHover={onWordHover} showCounts={showCounts} />;
      }) : (
        <span style={{ fontSize: 8, color: c.text, fontFamily: 'monospace', opacity: 0.7 }}>
          {sentCount} sentence{sentCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function VSectionBlock({ heading, title, paragraphs, dimmed, maxDepth, revealStage, onHoverLevel, scanned, showPos, hoveredWordId, wordIdStart, onWordHover, showCounts }) {
  const c = VIZ_COLORS.section;
  const visible = revealStage >= LEVEL_DEPTH.section;
  const paraCount = paragraphs.length;
  const totalSents = paragraphs.reduce((n, p) => n + p.length, 0);
  const showChildren = maxDepth > LEVEL_DEPTH.section;
  let runningId = wordIdStart;
  return (
    <div
      onMouseEnter={(e) => { e.stopPropagation(); onHoverLevel('section', `Section: "${title}"  ·  ${paraCount} paragraph${paraCount !== 1 ? 's' : ''}  ·  ${VIZ_COLORS.section.tool}`, e); }}
      onMouseLeave={() => onHoverLevel(null)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        padding: showChildren ? '8px 10px' : '10px 14px',
        borderRadius: 7,
        background: c.bg, border: `1px solid ${c.border}`,
        opacity: !visible ? 0 : dimmed ? 0.15 : 1,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        minHeight: showChildren ? undefined : 18,
      }}
    >
      {/* ── Section heading line (#7) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', borderRadius: 4,
        background: 'rgba(167,139,250,0.14)', border: '1px solid rgba(167,139,250,0.30)',
      }}>
        <span style={{
          fontSize: 7, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.12em',
          padding: '1px 5px', borderRadius: 3,
          background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.35)',
          textTransform: 'uppercase', flexShrink: 0,
        }}>HEADING</span>
        {scanned ? (
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}><OcrBar width={38} /></span>
        ) : (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#c4b5fd', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
            {heading || title.toUpperCase()}
          </span>
        )}
        {showCounts && (
          <CountBadge text={`${paraCount} para · ${totalSents} sent`} color={c.text} />
        )}
      </div>
      {showChildren ? paragraphs.map((p, i) => {
        const startId = runningId;
        const paraWords = p.reduce((n, s) => n + sentWordCount(s), 0);
        runningId += paraWords;
        return <VParagraph key={i} sentences={p} dimmed={dimmed} maxDepth={maxDepth} revealStage={revealStage}
          onHoverLevel={onHoverLevel} scanned={scanned} showPos={showPos}
          hoveredWordId={hoveredWordId} wordIdStart={startId} onWordHover={onWordHover} showCounts={showCounts} />;
      }) : (
        <span style={{ fontSize: 8, color: c.text, fontFamily: 'monospace', opacity: 0.7 }}>
          {paraCount} paragraph{paraCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ─── Raw text panel for side-by-side (#10) ──────────────────────────────────
function RawTextPanel({ wordIndex, hoveredWordId, onWordHover }) {
  // Group words by section and paragraph
  let currentSection = -1;
  let currentPara = -1;
  const elements = [];

  wordIndex.forEach((wi) => {
    if (wi.sectionIdx !== currentSection) {
      currentSection = wi.sectionIdx;
      currentPara = -1;
      if (elements.length > 0) elements.push(<div key={`gap-s-${wi.sectionIdx}`} style={{ height: 10 }} />);
      // Section heading
      elements.push(
        <div key={`head-${wi.sectionIdx}`} style={{
          fontSize: 9, fontWeight: 800, color: '#a78bfa', fontFamily: 'monospace',
          letterSpacing: '0.06em', marginBottom: 2,
        }}>
          {SECTIONS_DATA[wi.sectionIdx].heading}
        </div>
      );
    }
    if (wi.paraIdx !== currentPara) {
      if (currentPara !== -1) elements.push(<div key={`gap-p-${wi.sectionIdx}-${wi.paraIdx}`} style={{ height: 6 }} />);
      currentPara = wi.paraIdx;
    }
  });

  // Re-render with actual word spans
  const lines = [];
  let sIdx = -1, pIdx = -1;
  const wordsByLine = [];
  let currentLine = [];

  wordIndex.forEach((wi, idx) => {
    if (wi.sectionIdx !== sIdx) {
      if (currentLine.length) wordsByLine.push({ type: 'words', words: currentLine });
      currentLine = [];
      sIdx = wi.sectionIdx;
      pIdx = -1;
      wordsByLine.push({ type: 'heading', sectionIdx: wi.sectionIdx });
    }
    if (wi.paraIdx !== pIdx) {
      if (currentLine.length) wordsByLine.push({ type: 'words', words: currentLine });
      currentLine = [];
      pIdx = wi.paraIdx;
      if (idx > 0) wordsByLine.push({ type: 'paraGap' });
    }
    currentLine.push(wi);
  });
  if (currentLine.length) wordsByLine.push({ type: 'words', words: currentLine });

  return (
    <div style={{
      fontFamily: 'monospace', fontSize: 9, lineHeight: 1.7,
      color: '#64748b', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {wordsByLine.map((item, i) => {
        if (item.type === 'heading') {
          return (
            <div key={i} style={{ fontWeight: 800, color: '#a78bfa', letterSpacing: '0.06em', marginTop: i > 0 ? 10 : 0, marginBottom: 2 }}>
              {SECTIONS_DATA[item.sectionIdx].heading}
            </div>
          );
        }
        if (item.type === 'paraGap') return <div key={i} style={{ height: 6 }} />;
        return (
          <span key={i}>
            {item.words.map((wi) => {
              const isHovered = hoveredWordId === wi.id;
              return (
                <span
                  key={wi.id}
                  onMouseEnter={() => onWordHover(wi.id)}
                  onMouseLeave={() => onWordHover(null)}
                  style={{
                    cursor: 'default',
                    background: isHovered ? 'rgba(56,189,248,0.25)' : 'transparent',
                    borderRadius: 2, padding: '0 1px',
                    transition: 'background 0.1s',
                  }}
                >{wi.word}</span>
              );
            }).reduce((acc, el, idx) => idx === 0 ? [el] : [...acc, ' ', el], [])}
            {'. '}
          </span>
        );
      })}
    </div>
  );
}

// ─── Isometric 3D Visualization ──────────────────────────────────────────────

// Isometric projection helpers
// Camera presets: { xSpread, yTilt, zScale }
//   xSpread: horizontal spread factor (cos of viewing angle)
//   yTilt:   how much depth (y) contributes to vertical screen position
//   zScale:  how much height (z) lifts upward on screen
const ISO_CAMERAS = {
  standard: { xSpread: 0.866, yTilt: 0.50, zScale: 1.0, label: 'Standard' },   // classic 30° iso
  topDown:  { xSpread: 0.900, yTilt: 0.32, zScale: 0.45, label: 'Top-down' },   // flatter, floor-plan view
};

// Default projection (used by static helpers that don't have camera context)
const ISO = {
  toScreen: (x, y, z) => ({
    sx: (x - y) * 0.866,
    sy: (x + y) * 0.5 - z,
  }),
};

// Parameterized projection factory
function makeProjector(cam) {
  return (x, y, z) => ({
    sx: (x - y) * cam.xSpread,
    sy: (x + y) * cam.yTilt - z * cam.zScale,
  });
}

// Fog opacity per level — lower levels are fully opaque, higher ones fade
const FOG_OPACITY = [1.0, 0.95, 0.85, 0.72, 0.58, 0.45];

// Global counter for unique gradient IDs per IsoBox instance
let isoGradientIdCounter = 0;

// Draw an isometric box as 3 parallelogram faces (top, left, right)
// `animProgress` 0→1 controls how much the box has "grown" from its base z
// `tokenStripes` optional array of { count, borderColor } to draw stripe texture on top face
function IsoBox({ x, y, z, w, d, h, color, borderColor, opacity = 1, label, sublabel, onHover, onLeave, onClick, highlighted, dimmed, animProgress = 1, levelIdx = 0, tokenStripes, enhancedLighting = true, project }) {
  const toScreen = project || ISO.toScreen;
  // Stable unique ID for this box's gradient
  const gradIdRef = useRef(null);
  if (gradIdRef.current === null) gradIdRef.current = `isoTopGrad-${isoGradientIdCounter++}`;
  const gradId = gradIdRef.current;

  const animH = h * animProgress;

  // Apply fog: higher levels become more transparent
  const fog = FOG_OPACITY[levelIdx] || 0.45;
  const animOpacity = animProgress * fog;

  // 8 corners of the box in iso space, projected to screen
  const corners = {
    blf: toScreen(x, y, z),
    brf: toScreen(x + w, y, z),
    brb: toScreen(x + w, y + d, z),
    blb: toScreen(x, y + d, z),
    tlf: toScreen(x, y, z + animH),
    trf: toScreen(x + w, y, z + animH),
    trb: toScreen(x + w, y + d, z + animH),
    tlb: toScreen(x, y + d, z + animH),
  };

  const topFace = `${corners.tlf.sx},${corners.tlf.sy} ${corners.trf.sx},${corners.trf.sy} ${corners.trb.sx},${corners.trb.sy} ${corners.tlb.sx},${corners.tlb.sy}`;
  // North-facing walls (visible from standard camera angle)
  const leftFace = `${corners.tlf.sx},${corners.tlf.sy} ${corners.tlb.sx},${corners.tlb.sy} ${corners.blb.sx},${corners.blb.sy} ${corners.blf.sx},${corners.blf.sy}`;
  const rightFace = `${corners.trf.sx},${corners.trf.sy} ${corners.tlf.sx},${corners.tlf.sy} ${corners.blf.sx},${corners.blf.sy} ${corners.brf.sx},${corners.brf.sy}`;
  // South-facing walls (visible from below in exploded view)
  const southRightFace = `${corners.trf.sx},${corners.trf.sy} ${corners.trb.sx},${corners.trb.sy} ${corners.brb.sx},${corners.brb.sy} ${corners.brf.sx},${corners.brf.sy}`;
  const southLeftFace = `${corners.tlb.sx},${corners.tlb.sy} ${corners.trb.sx},${corners.trb.sy} ${corners.brb.sx},${corners.brb.sy} ${corners.blb.sx},${corners.blb.sy}`;

  const effectiveOpacity = dimmed ? 0.12 : opacity * animOpacity;

  const topCx = (corners.tlf.sx + corners.trf.sx + corners.trb.sx + corners.tlb.sx) / 4;
  const topCy = (corners.tlf.sy + corners.trf.sy + corners.trb.sy + corners.tlb.sy) / 4;

  const showLabel = animProgress > 0.4;

  // Top-face gradient direction: light comes from front-left, fades toward back-right
  // Use the tlf (lit corner) → trb (shadow corner) as gradient axis
  const gx1 = corners.tlf.sx;
  const gy1 = corners.tlf.sy;
  const gx2 = corners.trb.sx;
  const gy2 = corners.trb.sy;

  // Build token stripe lines on the top face if provided
  const stripeLines = [];
  if (tokenStripes && animProgress > 0.5) {
    const count = tokenStripes.count;
    const stripeColor = tokenStripes.borderColor;
    for (let i = 1; i < count; i++) {
      const t = i / count;
      const frontX = corners.tlf.sx + (corners.trf.sx - corners.tlf.sx) * t;
      const frontY = corners.tlf.sy + (corners.trf.sy - corners.tlf.sy) * t;
      const backX = corners.tlb.sx + (corners.trb.sx - corners.tlb.sx) * t;
      const backY = corners.tlb.sy + (corners.trb.sy - corners.tlb.sy) * t;
      stripeLines.push(
        <line
          key={`stripe-${i}`}
          x1={frontX} y1={frontY}
          x2={backX} y2={backY}
          stroke={stripeColor}
          strokeWidth={0.4}
          opacity={0.5 * animProgress}
          strokeDasharray="1.5,1"
        />
      );
    }
  }

  return (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Gradient definition for this box's top face (enhanced lighting only) */}
      {enhancedLighting && (
        <defs>
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse"
            x1={gx1} y1={gy1} x2={gx2} y2={gy2}
          >
            <stop offset="0%" stopColor={borderColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.35} />
          </linearGradient>
        </defs>
      )}

      {/* 1. North-facing walls rendered first (behind) */}
      <g opacity={effectiveOpacity}>
        {/* Right face (NE wall) */}
        <polygon
          points={rightFace}
          fill={color}
          stroke={borderColor}
          strokeWidth={highlighted ? 1.5 : 0.5}
          opacity={enhancedLighting ? 0.30 : 0.55}
        />
        {enhancedLighting && (
          <polygon points={rightFace} fill="#000" opacity={0.25} stroke="none" />
        )}

        {/* Left face (NW wall) */}
        <polygon
          points={leftFace}
          fill={color}
          stroke={borderColor}
          strokeWidth={highlighted ? 1.5 : 0.5}
          opacity={enhancedLighting ? 0.55 : 0.75}
        />
        {enhancedLighting && (
          <polygon points={leftFace} fill="#000" opacity={0.10} stroke="none" />
        )}
      </g>

      {/* 2. South walls + bottom face rendered AFTER north walls — fully opaque, colored */}
      {/* SE wall: colored base + dark overlay for shading */}
      <polygon points={southRightFace} fill={color} opacity={1} stroke="none" />
      <polygon points={southRightFace} fill="#000" opacity={0.3} stroke="none" />
      <polygon
        points={southRightFace}
        fill="none"
        stroke={borderColor}
        strokeWidth={highlighted ? 1.5 : 0.5}
        strokeOpacity={0.4}
        opacity={1}
      />
      {/* SW wall: colored base + darker overlay */}
      <polygon points={southLeftFace} fill={color} opacity={1} stroke="none" />
      <polygon points={southLeftFace} fill="#000" opacity={0.4} stroke="none" />
      <polygon
        points={southLeftFace}
        fill="none"
        stroke={borderColor}
        strokeWidth={highlighted ? 1.5 : 0.5}
        strokeOpacity={0.4}
        opacity={1}
      />
      {/* Bottom face */}
      <polygon
        points={`${corners.blf.sx},${corners.blf.sy} ${corners.brf.sx},${corners.brf.sy} ${corners.brb.sx},${corners.brb.sy} ${corners.blb.sx},${corners.blb.sy}`}
        fill={color}
        opacity={1}
      />
      <polygon
        points={`${corners.blf.sx},${corners.blf.sy} ${corners.brf.sx},${corners.brf.sy} ${corners.brb.sx},${corners.brb.sy} ${corners.blb.sx},${corners.blb.sy}`}
        fill="#000"
        opacity={0.7}
      />

      {/* Vertical corner edges — connects top diamond to bottom plane */}
      <line x1={corners.tlf.sx} y1={corners.tlf.sy} x2={corners.blf.sx} y2={corners.blf.sy}
        stroke={borderColor} strokeWidth={highlighted ? 1.8 : 1} opacity={0.8} />
      <line x1={corners.trf.sx} y1={corners.trf.sy} x2={corners.brf.sx} y2={corners.brf.sy}
        stroke={borderColor} strokeWidth={highlighted ? 1.8 : 1} opacity={0.8} />
      <line x1={corners.trb.sx} y1={corners.trb.sy} x2={corners.brb.sx} y2={corners.brb.sy}
        stroke={borderColor} strokeWidth={highlighted ? 1.8 : 1} opacity={0.7} />
      <line x1={corners.tlb.sx} y1={corners.tlb.sy} x2={corners.blb.sx} y2={corners.blb.sy}
        stroke={borderColor} strokeWidth={highlighted ? 1.8 : 1} opacity={0.7} />

      {/* 3. Top face + labels rendered last (on top of everything) */}
      <g opacity={effectiveOpacity}>
        <polygon
          points={topFace}
          fill={color}
          stroke={borderColor}
          strokeWidth={highlighted ? 1.5 : 0.5}
          opacity={1}
        />
        {enhancedLighting && (
          <>
            <polygon points={topFace} fill={`url(#${gradId})`} stroke="none" />
            <polygon points={topFace} fill="#fff"
              opacity={highlighted ? 0.12 : 0.05} stroke="none"
              clipPath={`inset(0 50% 50% 0)`}
            />
          </>
        )}

        {/* Token stripe texture on top face */}
        {stripeLines}
        {/* Label on top face */}
        {showLabel && label && (
          <text
            x={topCx}
            y={topCy - (sublabel ? 3 : 0)}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: Math.min(8, w * 0.14),
              fontWeight: 700,
              fill: borderColor,
              fontFamily: 'monospace',
              pointerEvents: 'none',
              letterSpacing: '0.04em',
              opacity: animProgress,
            }}
          >
            {label}
          </text>
        )}
        {showLabel && sublabel && (
          <text
            x={topCx}
            y={topCy + 6}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: Math.min(6, w * 0.10),
              fontWeight: 600,
              fill: borderColor,
              fontFamily: 'monospace',
              pointerEvents: 'none',
              opacity: 0.7 * animProgress,
            }}
          >
            {sublabel}
          </text>
        )}
      </g>
    </g>
  );
}

// Solid-color constants for the iso boxes (more opaque than the flat viz)
const ISO_COLORS = {
  document:  { fill: '#0c4a6e', border: '#38bdf8' },
  section:   { fill: '#3b1f7a', border: '#a78bfa' },
  paragraph: { fill: '#7c2d12', border: '#fb923c' },
  sentence:  { fill: '#713f12', border: '#fbbf24' },
  chunk:     { fill: '#831843', border: '#f472b6' },
  token:     { fill: '#064e3b', border: '#34d399' },
};

// Helper: check if boxKey is a descendant of ancestorKey in the key hierarchy
function isDescendantOf(boxKey, ancestorKey) {
  if (ancestorKey === 'doc') return true; // everything descends from doc
  return boxKey.startsWith(ancestorKey + '-') || boxKey === ancestorKey;
}

// ─── Page Layout Isometric Viz (OCR mode) ────────────────────────────────────
// Renders PDF text items as extruded 3D blocks at their actual page positions

function groupTextItems(items, pageWidth, pageHeight) {
  // Filter and normalize items — skip rotated text (arXiv sidebar, etc.)
  const normalized = items
    .filter(it => {
      if (!it.str || !it.str.trim()) return false;
      // Skip items with significant rotation (transform[1] or transform[2] non-zero)
      const skewX = Math.abs(it.transform[1]);
      const skewY = Math.abs(it.transform[2]);
      if (skewX > 0.1 || skewY > 0.1) return false;
      return true;
    })
    .map(it => {
      const fontSize = Math.abs(it.transform[3]) || 10;
      const x = it.transform[4];
      const y = pageHeight - it.transform[5] - fontSize; // flip to top-left origin
      const w = it.width || it.str.length * fontSize * 0.5;
      return { text: it.str, x, y, w, h: fontSize, fontSize };
    });

  if (normalized.length === 0) return [];

  // Group items into lines (same y ± tolerance)
  const lines = [];
  const sorted = [...normalized].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const item of sorted) {
    const tolerance = item.h * 0.4;
    const existingLine = lines.find(l =>
      Math.abs(l.y - item.y) < tolerance && Math.abs(l.h - item.h) < item.h * 0.6
    );
    if (existingLine) {
      existingLine.items.push(item);
      const newRight = Math.max(existingLine.x + existingLine.w, item.x + item.w);
      existingLine.x = Math.min(existingLine.x, item.x);
      existingLine.w = newRight - existingLine.x;
    } else {
      lines.push({ y: item.y, h: item.h, x: item.x, w: item.w, items: [item], fontSize: item.fontSize });
    }
  }

  // Sort lines top to bottom
  const sortedLines = [...lines].sort((a, b) => a.y - b.y);

  // Merge adjacent lines into paragraph blocks
  // Use tighter merging: same font size, similar x position, small vertical gap
  // Break on: large gaps, font size changes, significant indentation changes
  const blocks = [];

  for (const line of sortedLines) {
    const lastBlock = blocks[blocks.length - 1];
    if (!lastBlock) {
      blocks.push({
        x: line.x, y: line.y, w: line.w, h: line.h,
        text: line.items.map(i => i.text).join(' '),
        fontSize: line.fontSize,
        avgFontSize: line.fontSize,
        lineCount: 1,
      });
      continue;
    }

    const gap = line.y - (lastBlock.y + lastBlock.h);
    const lineSpacing = line.fontSize * 1.4; // normal line spacing
    const sameFontSize = Math.abs(line.fontSize - lastBlock.avgFontSize) < lastBlock.avgFontSize * 0.2;
    const sameXRegion = Math.abs(line.x - lastBlock.x) < pageWidth * 0.08;
    const isIndented = line.x > lastBlock.x + lastBlock.avgFontSize * 1.5; // paragraph indent
    const smallGap = gap < lineSpacing && gap >= 0;

    // Merge only if: small gap, same font size, similar x alignment, NOT a new paragraph indent
    // Also limit block size to ~8 lines to keep blocks readable
    if (smallGap && sameFontSize && (sameXRegion || isIndented) && lastBlock.lineCount < 8) {
      lastBlock.h = (line.y + line.h) - lastBlock.y;
      const newRight = Math.max(lastBlock.x + lastBlock.w, line.x + line.w);
      lastBlock.x = Math.min(lastBlock.x, line.x);
      lastBlock.w = newRight - lastBlock.x;
      lastBlock.text += ' ' + line.items.map(i => i.text).join(' ');
      lastBlock.lineCount++;
      lastBlock.avgFontSize = (lastBlock.avgFontSize * (lastBlock.lineCount - 1) + line.fontSize) / lastBlock.lineCount;
    } else {
      blocks.push({
        x: line.x, y: line.y, w: line.w, h: line.h,
        text: line.items.map(i => i.text).join(' '),
        fontSize: line.fontSize,
        avgFontSize: line.fontSize,
        lineCount: 1,
      });
    }
  }

  return blocks;
}

// Classify block type based on size/position for coloring
function classifyBlock(block, pageWidth, pageHeight, medianFontSize) {
  const relY = block.y / pageHeight;
  const isLargeFont = block.avgFontSize > medianFontSize * 1.3;
  const isSmallFont = block.avgFontSize < medianFontSize * 0.85;
  const relWidth = block.w / pageWidth;

  // Title: large font, near top
  if (isLargeFont && relY < 0.2) return 'title';
  // Heading: large font, single line, or bold-style short text
  if (isLargeFont && block.lineCount <= 2) return 'heading';
  // Meta: small text, single line, narrow (page numbers, footnotes)
  if (block.lineCount === 1 && (relWidth < 0.12 || isSmallFont)) return 'meta';
  // Subtitle: short centered-ish text (authors, dates)
  if (block.lineCount <= 2 && relWidth < 0.5 && relY < 0.35) return 'subtitle';
  // Body text
  return 'body';
}

const PAGE_LAYOUT_COLORS = {
  title:    { fill: '#1e3a5f', border: '#38bdf8' },
  heading:  { fill: '#3b1f7a', border: '#a78bfa' },
  subtitle: { fill: '#713f12', border: '#fbbf24' },
  body:     { fill: '#7c2d12', border: '#fb923c' },
  meta:     { fill: '#064e3b', border: '#34d399' },
};

function PageLayoutIsoViz({ pageData }) {
  const { items, pageWidth, pageHeight } = pageData;

  const [enhancedLighting, setEnhancedLighting] = useState(true);
  const [showGroundShadow, setShowGroundShadow] = useState(true);
  const [cameraMode, setCameraMode] = useState('standard');
  const cam = ISO_CAMERAS[cameraMode];
  const project = useMemo(() => makeProjector(cam), [cam]);

  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Animation progress
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef(null);
  useEffect(() => {
    let start = null;
    const duration = 1200;
    const tick = (ts) => {
      if (!start) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      // Ease out cubic
      setAnimProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [pageData]);

  // Group text items into blocks
  const blocks = useMemo(
    () => groupTextItems(items, pageWidth, pageHeight),
    [items, pageWidth, pageHeight]
  );

  // Map page coordinates to isometric space
  const ISO_SCALE = 260 / pageWidth; // scale page to fit ~260 iso units wide
  const PAGE_D = pageHeight * ISO_SCALE;
  const PAGE_W = 260;
  const PAGE_H = 3; // base page thickness

  // Compute median font size for classification
  const medianFontSize = useMemo(() => {
    if (blocks.length === 0) return 10;
    const sizes = blocks.map(b => b.avgFontSize).sort((a, b) => a - b);
    return sizes[Math.floor(sizes.length / 2)];
  }, [blocks]);

  // Build iso boxes from blocks
  const isoBoxes = useMemo(() => {
    return blocks.map((block, i) => {
      const type = classifyBlock(block, pageWidth, pageHeight, medianFontSize);
      const bx = block.x * ISO_SCALE;
      const by = block.y * ISO_SCALE;
      const bw = Math.max(block.w * ISO_SCALE, 4);
      const bd = Math.max(block.h * ISO_SCALE, 2);
      // Extrusion height: proportional to line count, scaled modestly
      const extrudeBase = type === 'title' ? 8 : type === 'heading' ? 6 : type === 'body' ? 4 : type === 'subtitle' ? 5 : 3;
      const h = extrudeBase + Math.min(block.lineCount, 8) * 0.8;
      const colors = PAGE_LAYOUT_COLORS[type];

      // Truncate label to fit
      const maxLabelLen = Math.max(8, Math.floor(bw / 3));
      const labelText = block.text.slice(0, maxLabelLen) + (block.text.length > maxLabelLen ? '…' : '');

      return {
        key: `pblock-${i}`,
        x: bx, y: by, z: PAGE_H,
        w: bw, d: bd, h,
        color: colors.fill,
        borderColor: colors.border,
        label: labelText,
        sublabel: block.lineCount > 1 ? `${block.lineCount}L` : '',
        type,
        levelIdx: type === 'title' ? 0 : type === 'heading' ? 1 : type === 'body' ? 2 : type === 'subtitle' ? 3 : 4,
      };
    });
  }, [blocks, pageWidth, pageHeight, medianFontSize, ISO_SCALE]);

  // Compute viewBox bounds
  const viewBox = useMemo(() => {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    // Include page base
    for (const [dx, dy] of [[0,0],[PAGE_W,0],[PAGE_W,PAGE_D],[0,PAGE_D]]) {
      for (const dz of [0, PAGE_H]) {
        const { sx, sy } = project(dx, dy, dz);
        mnx = Math.min(mnx, sx); mny = Math.min(mny, sy);
        mxx = Math.max(mxx, sx); mxy = Math.max(mxy, sy);
      }
    }
    // Include all blocks at full height
    for (const b of isoBoxes) {
      for (const [dx, dy] of [[0,0],[b.w,0],[b.w,b.d],[0,b.d]]) {
        for (const dz of [0, b.h]) {
          const { sx, sy } = project(b.x + dx, b.y + dy, b.z + dz);
          mnx = Math.min(mnx, sx); mny = Math.min(mny, sy);
          mxx = Math.max(mxx, sx); mxy = Math.max(mxy, sy);
        }
      }
    }
    const pad = 25;
    return { x: mnx - pad, y: mny - pad, w: mxx - mnx + pad * 2, h: mxy - mny + pad * 2 };
  }, [isoBoxes, project, PAGE_W, PAGE_D, PAGE_H]);

  // Sort back-to-front
  const sorted = useMemo(() => {
    return [...isoBoxes].sort((a, b) => {
      const zA = a.z + a.h;
      const zB = b.z + b.h;
      if (Math.abs(zA - zB) > 0.5) return zA - zB;
      return (a.x + a.y) - (b.x + b.y);
    });
  }, [isoBoxes]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Toggles */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 6, alignSelf: 'stretch', flexWrap: 'wrap' }}>
        <button onClick={() => setEnhancedLighting(p => !p)} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${enhancedLighting ? 'rgba(251,191,36,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: enhancedLighting ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.02)',
          color: enhancedLighting ? '#fbbf24' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {enhancedLighting ? '☀ Lighting on' : '☀ Lighting off'}
        </button>
        <button onClick={() => setShowGroundShadow(p => !p)} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${showGroundShadow ? 'rgba(148,163,184,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: showGroundShadow ? 'rgba(148,163,184,0.10)' : 'rgba(255,255,255,0.02)',
          color: showGroundShadow ? '#94a3b8' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {showGroundShadow ? '◐ Shadow on' : '◐ Shadow off'}
        </button>
        <button onClick={() => setCameraMode(p => p === 'standard' ? 'topDown' : 'standard')} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${cameraMode === 'topDown' ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: cameraMode === 'topDown' ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.02)',
          color: cameraMode === 'topDown' ? '#38bdf8' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {cameraMode === 'topDown' ? '◉ Top-down' : '◎ Standard'}
        </button>
      </div>

      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        width="100%"
        style={{ maxHeight: 550, overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="plIsoBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="plIsoBlurWide" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <radialGradient id="plGroundShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#000" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ground shadow */}
        {showGroundShadow && (() => {
          const gc = project(PAGE_W / 2, PAGE_D / 2, 0);
          return (
            <>
              <ellipse cx={gc.sx} cy={gc.sy + 10} rx={PAGE_W * 0.65} ry={PAGE_D * 0.25}
                fill="url(#plGroundShadow)" filter="url(#plIsoBlurWide)" />
              <ellipse cx={gc.sx} cy={gc.sy + 5} rx={PAGE_W * 0.48} ry={PAGE_D * 0.16}
                fill="#000" opacity={0.25} filter="url(#plIsoBlur)" />
            </>
          );
        })()}

        {/* Page base (white-ish sheet) */}
        <IsoBox
          x={0} y={0} z={0}
          w={PAGE_W} d={PAGE_D} h={PAGE_H}
          color="#1e293b" borderColor="#475569"
          opacity={1} label="" sublabel=""
          animProgress={animProgress} levelIdx={0}
          enhancedLighting={enhancedLighting} project={project}
        />

        {/* Text blocks */}
        {sorted.map((b, i) => {
          const isHovered = hoveredIdx === i;
          const isDimmed = hoveredIdx !== null && hoveredIdx !== i;
          // Stagger animation per block
          const blockDelay = i / sorted.length;
          const blockProg = Math.max(0, Math.min(1, (animProgress - blockDelay * 0.4) / 0.6));

          return (
            <IsoBox
              key={b.key}
              x={b.x} y={b.y} z={b.z}
              w={b.w} d={b.d} h={b.h}
              color={b.color} borderColor={b.borderColor}
              opacity={1}
              label={b.label} sublabel={b.sublabel}
              highlighted={isHovered}
              dimmed={isDimmed}
              animProgress={blockProg}
              levelIdx={b.levelIdx}
              enhancedLighting={enhancedLighting}
              project={project}
              onHover={() => setHoveredIdx(i)}
              onLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {Object.entries(PAGE_LAYOUT_COLORS).map(([type, colors]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 10, height: 8, background: colors.fill,
              border: `1.5px solid ${colors.border}`, borderRadius: 2,
              transform: 'skewX(-10deg)',
            }} />
            <span style={{ fontSize: 8, fontWeight: 700, color: colors.border, textTransform: 'capitalize' }}>
              {type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Image Iso Viz — renders the PDF page as a flat isometric "card" with text on it ──
function PageImageIsoViz({ pageData }) {
  const { items, pageWidth, pageHeight } = pageData;

  const [cameraMode, setCameraMode] = useState('standard');
  const cam = ISO_CAMERAS[cameraMode];
  const project = useMemo(() => makeProjector(cam), [cam]);

  // Parse text items with positions
  const textItems = useMemo(() => {
    return items
      .filter(it => {
        if (!it.str || !it.str.trim()) return false;
        const skewX = Math.abs(it.transform[1]);
        const skewY = Math.abs(it.transform[2]);
        if (skewX > 0.1 || skewY > 0.1) return false;
        return true;
      })
      .map(it => {
        const fontSize = Math.abs(it.transform[3]) || 10;
        const x = it.transform[4];
        const yFlipped = pageHeight - it.transform[5]; // flip to top-left origin
        const w = it.width || it.str.length * fontSize * 0.5;
        return { text: it.str, x, y: yFlipped, w, fontSize };
      });
  }, [items, pageHeight]);

  // Scale page into isometric space
  const ISO_W = 300;
  const ISO_SCALE = ISO_W / pageWidth;
  const ISO_D = pageHeight * ISO_SCALE;
  const PAGE_THICKNESS = 2;

  // Project a 2D page point onto the isometric top face
  const pageToIso = useCallback((px, py) => {
    const ix = px * ISO_SCALE;
    const iy = py * ISO_SCALE;
    return project(ix, iy, PAGE_THICKNESS);
  }, [ISO_SCALE, project, PAGE_THICKNESS]);

  // Compute viewBox from page corners
  const viewBox = useMemo(() => {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const [dx, dy] of [[0, 0], [ISO_W, 0], [ISO_W, ISO_D], [0, ISO_D]]) {
      for (const dz of [0, PAGE_THICKNESS]) {
        const { sx, sy } = project(dx, dy, dz);
        mnx = Math.min(mnx, sx); mny = Math.min(mny, sy);
        mxx = Math.max(mxx, sx); mxy = Math.max(mxy, sy);
      }
    }
    const pad = 20;
    return { x: mnx - pad, y: mny - pad, w: mxx - mnx + pad * 2, h: mxy - mny + pad * 2 };
  }, [project, ISO_W, ISO_D, PAGE_THICKNESS]);

  // Compute the affine transform for projecting content onto the isometric top face
  // We map the page rectangle (0,0)-(pageWidth,pageHeight) to the isometric parallelogram
  const isoTransform = useMemo(() => {
    // Get 3 corners of the top face in screen space
    const origin = project(0, 0, PAGE_THICKNESS);       // top-left of page
    const xAxis = project(ISO_W, 0, PAGE_THICKNESS);    // top-right
    const yAxis = project(0, ISO_D, PAGE_THICKNESS);    // bottom-left

    // Compute the affine matrix that maps (0,0)->(origin), (1,0)->(xAxis), (0,1)->(yAxis)
    // SVG transform: matrix(a, b, c, d, e, f)
    // where (x',y') = (a*x + c*y + e, b*x + d*y + f)
    const a = (xAxis.sx - origin.sx) / ISO_W;
    const b = (xAxis.sy - origin.sy) / ISO_W;
    const c = (yAxis.sx - origin.sx) / ISO_D;
    const d = (yAxis.sy - origin.sy) / ISO_D;
    const e = origin.sx;
    const f = origin.sy;

    return { a, b, c, d, e, f };
  }, [project, ISO_W, ISO_D, PAGE_THICKNESS]);

  // Top face polygon points for the page "card"
  const topFace = useMemo(() => {
    const tl = project(0, 0, PAGE_THICKNESS);
    const tr = project(ISO_W, 0, PAGE_THICKNESS);
    const br = project(ISO_W, ISO_D, PAGE_THICKNESS);
    const bl = project(0, ISO_D, PAGE_THICKNESS);
    return `${tl.sx},${tl.sy} ${tr.sx},${tr.sy} ${br.sx},${br.sy} ${bl.sx},${bl.sy}`;
  }, [project, ISO_W, ISO_D, PAGE_THICKNESS]);

  // Side faces for the card edge
  const leftFace = useMemo(() => {
    const tl = project(0, 0, PAGE_THICKNESS);
    const bl = project(0, ISO_D, PAGE_THICKNESS);
    const blb = project(0, ISO_D, 0);
    const tlb = project(0, 0, 0);
    return `${tl.sx},${tl.sy} ${bl.sx},${bl.sy} ${blb.sx},${blb.sy} ${tlb.sx},${tlb.sy}`;
  }, [project, ISO_D, PAGE_THICKNESS]);

  const rightFace = useMemo(() => {
    const bl = project(0, ISO_D, PAGE_THICKNESS);
    const br = project(ISO_W, ISO_D, PAGE_THICKNESS);
    const brb = project(ISO_W, ISO_D, 0);
    const blb = project(0, ISO_D, 0);
    return `${bl.sx},${bl.sy} ${br.sx},${br.sy} ${brb.sx},${brb.sy} ${blb.sx},${blb.sy}`;
  }, [project, ISO_W, ISO_D, PAGE_THICKNESS]);

  const bottomEdgeFace = useMemo(() => {
    const br = project(ISO_W, ISO_D, PAGE_THICKNESS);
    const tr = project(ISO_W, 0, PAGE_THICKNESS);
    const trb = project(ISO_W, 0, 0);
    const brb = project(ISO_W, ISO_D, 0);
    return `${br.sx},${br.sy} ${tr.sx},${tr.sy} ${trb.sx},${trb.sy} ${brb.sx},${brb.sy}`;
  }, [project, ISO_W, ISO_D, PAGE_THICKNESS]);

  // Compute median font size for scaling
  const medianFontSize = useMemo(() => {
    if (textItems.length === 0) return 10;
    const sizes = textItems.map(t => t.fontSize).sort((a, b) => a - b);
    return sizes[Math.floor(sizes.length / 2)];
  }, [textItems]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Camera toggle */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 6, alignSelf: 'stretch', flexWrap: 'wrap' }}>
        <button onClick={() => setCameraMode(p => p === 'standard' ? 'topDown' : 'standard')} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${cameraMode === 'topDown' ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: cameraMode === 'topDown' ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.02)',
          color: cameraMode === 'topDown' ? '#38bdf8' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {cameraMode === 'topDown' ? '◉ Top-down' : '◎ Standard'}
        </button>
      </div>

      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        width="100%"
        style={{ maxHeight: 600, overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id="pageImageClip">
            <polygon points={topFace} />
          </clipPath>
          <filter id="piShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Ground shadow */}
        {(() => {
          const gc = project(ISO_W / 2, ISO_D / 2, 0);
          return <ellipse cx={gc.sx} cy={gc.sy + 8} rx={ISO_W * 0.55} ry={ISO_D * 0.2}
            fill="#000" opacity={0.3} filter="url(#piShadow)" />;
        })()}

        {/* Card side faces */}
        <polygon points={leftFace} fill="#8a8a7a" stroke="#bbb" strokeWidth={0.3} opacity={0.9} />
        <polygon points={rightFace} fill="#6a6a5e" stroke="#bbb" strokeWidth={0.3} opacity={0.9} />
        <polygon points={bottomEdgeFace} fill="#7a7a6e" stroke="#bbb" strokeWidth={0.3} opacity={0.9} />

        {/* Page top face — white paper */}
        <polygon points={topFace} fill="#f0ece4" stroke="#c0b8a8" strokeWidth={0.5} />

        {/* Text rendered on the isometric surface */}
        <g clipPath="url(#pageImageClip)">
          <g transform={`matrix(${isoTransform.a},${isoTransform.b},${isoTransform.c},${isoTransform.d},${isoTransform.e},${isoTransform.f})`}>
            {/* Subtle paper texture lines */}
            {[0.25, 0.5, 0.75].map(frac => (
              <line key={frac} x1={0} y1={ISO_D * frac} x2={ISO_W} y2={ISO_D * frac}
                stroke="#d8d0c4" strokeWidth={0.15} opacity={0.4} />
            ))}

            {/* Render each text item at its page position */}
            {textItems.map((item, i) => {
              const ix = item.x * ISO_SCALE;
              const iy = item.y * ISO_SCALE;
              const scaledFontSize = item.fontSize * ISO_SCALE;

              // Color based on font size
              const isTitle = item.fontSize > medianFontSize * 1.3;
              const isMeta = item.fontSize < medianFontSize * 0.85;
              const textColor = isTitle ? '#1a1a2e' : isMeta ? '#6b7280' : '#2d2d3a';
              const fontWeight = isTitle ? 700 : 400;

              return (
                <text
                  key={i}
                  x={ix}
                  y={iy + scaledFontSize * 0.85}
                  fontSize={scaledFontSize}
                  fontFamily="'Georgia', 'Times New Roman', serif"
                  fontWeight={fontWeight}
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {item.text}
                </text>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

function IsometricViz({ sections, maxDepth, revealStage, highlightLevel, onHoverLevel, tooltip, onTooltipHide }) {
  // ── Layout parameters — exploded spacing ──
  const LAYER_HEIGHTS = [8, 18, 14, 12, 10, 7];
  const LAYER_GAPS = [0, 10, 8, 6, 5, 4];
  const BASE_W = 260;
  const BASE_D = 160;

  const SEC_PAD = 10;
  const SEC_GAP = 8;
  const PARA_PAD = 6;
  const PARA_GAP = 5;
  const SENT_PAD = 4;
  const SENT_GAP = 4;
  const CHUNK_PAD = 3;
  const CHUNK_GAP = 2.5;

  // ── Visual toggle states ──
  const [enhancedLighting, setEnhancedLighting] = useState(true);
  const [showGroundShadow, setShowGroundShadow] = useState(true);
  const [cameraMode, setCameraMode] = useState('standard'); // 'standard' | 'topDown'
  const cam = ISO_CAMERAS[cameraMode];
  const project = useMemo(() => makeProjector(cam), [cam]);

  // ── Hover explode state ──
  const [hoveredBoxKey, setHoveredBoxKey] = useState(null);
  const HOVER_LIFT = 5; // z-units to lift hovered box

  // ── Click-to-drill state ──
  const [drillStack, setDrillStack] = useState([]); // array of { key, label, level }
  const drilledKey = drillStack.length > 0 ? drillStack[drillStack.length - 1].key : null;

  const handleDrill = useCallback((boxKey, boxLabel, boxLevel) => {
    // Only allow drilling into boxes that have children (not chunks)
    if (boxLevel === 'chunk') return;
    setDrillStack(prev => {
      // If clicking the already-drilled box, ignore
      if (prev.length > 0 && prev[prev.length - 1].key === boxKey) return prev;
      // If clicking an ancestor already in the stack, pop back to it
      const existingIdx = prev.findIndex(d => d.key === boxKey);
      if (existingIdx >= 0) return prev.slice(0, existingIdx + 1);
      return [...prev, { key: boxKey, label: boxLabel, level: boxLevel }];
    });
  }, []);

  const handleDrillBack = useCallback((toIdx) => {
    setDrillStack(prev => prev.slice(0, toIdx));
  }, []);

  // ── Animated progress per level (0→1) ──
  const [levelProgress, setLevelProgress] = useState([0, 0, 0, 0, 0, 0]);
  const targetDepthRef = useRef(maxDepth);
  const animFrameRef = useRef(null);
  const levelProgressRef = useRef([0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    targetDepthRef.current = maxDepth;
    const animate = () => {
      const current = levelProgressRef.current;
      let changed = false;
      const next = current.map((val, i) => {
        const target = i <= targetDepthRef.current ? 1 : 0;
        if (Math.abs(val - target) < 0.005) {
          if (val !== target) changed = true;
          return target;
        }
        changed = true;
        const distFromEdge = Math.abs(i - targetDepthRef.current);
        const speed = 0.08 - distFromEdge * 0.008;
        return val + (target - val) * Math.max(speed, 0.03);
      });
      if (changed) {
        levelProgressRef.current = next;
        setLevelProgress([...next]);
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [maxDepth]);

  // ── Cumulative nominal z for each level (without animation) ──
  const nominalBaseZForLevel = useMemo(() => {
    const arr = [0];
    for (let i = 1; i < LAYER_HEIGHTS.length; i++) {
      arr.push(arr[i - 1] + LAYER_HEIGHTS[i - 1] + LAYER_GAPS[i]);
    }
    return arr;
  }, []);

  // ── Build ALL boxes ──
  const boxes = useMemo(() => {
    const result = [];

    result.push({
      key: 'doc', levelIdx: 0, level: 'document',
      x: 0, y: 0, z: 0,
      w: BASE_W, d: BASE_D, h: LAYER_HEIGHTS[0],
      label: 'DOCUMENT',
      sublabel: `${sections.length} sections`,
    });

    const secCount = sections.length;
    const secAvailW = BASE_W - SEC_PAD * 2;
    const secW = (secAvailW - (secCount - 1) * SEC_GAP) / secCount;
    const secD = BASE_D - SEC_PAD * 2;
    const secZ = nominalBaseZForLevel[1];

    sections.forEach((sec, si) => {
      const secX = SEC_PAD + si * (secW + SEC_GAP);
      const secY = SEC_PAD;

      result.push({
        key: `sec-${si}`, levelIdx: 1, level: 'section',
        x: secX, y: secY, z: secZ,
        w: secW, d: secD, h: LAYER_HEIGHTS[1],
        label: sec.title ? sec.title.slice(0, 12) : `Sec ${si + 1}`,
        sublabel: `${sec.paragraphs.length}p`,
      });

      const paraCount = sec.paragraphs.length;
      const paraAvailD = secD - PARA_PAD * 2;
      const paraD = (paraAvailD - (paraCount - 1) * PARA_GAP) / paraCount;
      const paraW = secW - PARA_PAD * 2;
      const paraZ = nominalBaseZForLevel[2];

      sec.paragraphs.forEach((para, pi) => {
        const paraX = secX + PARA_PAD;
        const paraY = secY + PARA_PAD + pi * (paraD + PARA_GAP);

        result.push({
          key: `sec-${si}-para-${pi}`, levelIdx: 2, level: 'paragraph',
          x: paraX, y: paraY, z: paraZ,
          w: paraW, d: paraD, h: LAYER_HEIGHTS[2],
          label: `¶${pi + 1}`,
          sublabel: `${para.length}s`,
        });

        const sentCount = para.length;
        const sentAvailW = paraW - SENT_PAD * 2;
        const sentW = (sentAvailW - (sentCount - 1) * SENT_GAP) / sentCount;
        const sentD = paraD - SENT_PAD * 2;
        const sentZ = nominalBaseZForLevel[3];

        para.forEach((sent, sei) => {
          const sentX = paraX + SENT_PAD + sei * (sentW + SENT_GAP);
          const sentY = paraY + SENT_PAD;
          const wordCount = sentWordCount(sent);

          result.push({
            key: `sec-${si}-para-${pi}-sent-${sei}`, levelIdx: 3, level: 'sentence',
            x: sentX, y: sentY, z: sentZ,
            w: sentW, d: sentD, h: LAYER_HEIGHTS[3],
            label: `S${sei + 1}`,
            sublabel: `${wordCount}w`,
          });

          const allParts = [];
          sent.forEach((part, idx) => {
            if (Array.isArray(part)) allParts.push({ type: 'chunk', tokens: part, idx });
            else allParts.push({ type: 'plain', tok: part, idx });
          });
          const chunks = sent.filter(p => Array.isArray(p));
          if (chunks.length > 0) {
            const chunkAvailD = sentD - CHUNK_PAD * 2;
            const partCount = allParts.length;
            const chunkD = (chunkAvailD - (partCount - 1) * CHUNK_GAP) / Math.max(partCount, 1);
            const chunkW = sentW - CHUNK_PAD * 2;
            const chunkZ = nominalBaseZForLevel[4];

            allParts.forEach((part, pi2) => {
              if (part.type === 'chunk') {
                const chunkX = sentX + CHUNK_PAD;
                const chunkY = sentY + CHUNK_PAD + pi2 * (chunkD + CHUNK_GAP);
                result.push({
                  key: `${si}-${pi}-${sei}-ch-${pi2}`, levelIdx: 4, level: 'chunk',
                  x: chunkX, y: chunkY, z: chunkZ,
                  w: chunkW, d: Math.max(chunkD, 2), h: LAYER_HEIGHTS[4],
                  label: part.tokens.map(t => t.w).join(' ').slice(0, 14),
                  sublabel: `${part.tokens.length}t`,
                  tokenCount: part.tokens.length,
                });
              }
            });
          }
        });
      });
    });

    return result;
  }, [sections, nominalBaseZForLevel]);

  // ── Animated z and progress per box ──
  const animatedBoxes = useMemo(() => {
    const animLevelBaseZ = [0];
    for (let i = 1; i < LAYER_HEIGHTS.length; i++) {
      const prevTop = animLevelBaseZ[i - 1] + LAYER_HEIGHTS[i - 1] * levelProgress[i - 1];
      const gap = LAYER_GAPS[i] * levelProgress[i];
      animLevelBaseZ.push(prevTop + gap);
    }

    return boxes.map(b => {
      const prog = levelProgress[b.levelIdx];
      const animBaseZ = animLevelBaseZ[b.levelIdx];
      const intraOffset = b.z - nominalBaseZForLevel[b.levelIdx];
      const parentProg = b.levelIdx > 0 ? levelProgress[b.levelIdx - 1] : 1;

      // ── Hover explode: lift hovered box and spread its children ──
      let hoverLift = 0;
      if (hoveredBoxKey) {
        if (b.key === hoveredBoxKey) {
          hoverLift = HOVER_LIFT;
        } else if (isDescendantOf(b.key, hoveredBoxKey)) {
          // Children of hovered box: additional lift + spread (proportional to depth difference)
          const hoverBox = boxes.find(hb => hb.key === hoveredBoxKey);
          const depthDiff = hoverBox ? b.levelIdx - hoverBox.levelIdx : 1;
          hoverLift = HOVER_LIFT + depthDiff * 3;
        }
      }

      return {
        ...b,
        animZ: animBaseZ + intraOffset * parentProg + hoverLift,
        animProgress: prog,
      };
    });
  }, [boxes, levelProgress, nominalBaseZForLevel, hoveredBoxKey]);

  // ── Compute bounding box for drill target (or full scene) ──
  const fullBaseZ = useMemo(() => {
    const arr = [0];
    for (let i = 1; i < LAYER_HEIGHTS.length; i++) {
      arr.push(arr[i - 1] + LAYER_HEIGHTS[i - 1] + LAYER_GAPS[i]);
    }
    return arr;
  }, []);

  const computeBounds = useCallback((boxList) => {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const b of boxList) {
      const intra = b.z - nominalBaseZForLevel[b.levelIdx];
      const fz = fullBaseZ[b.levelIdx] + intra;
      for (const dz of [0, b.h]) {
        for (const [dx, dy] of [[0,0],[b.w,0],[b.w,b.d],[0,b.d]]) {
          const { sx, sy } = project(b.x + dx, b.y + dy, fz + dz);
          if (sx < mnx) mnx = sx;
          if (sy < mny) mny = sy;
          if (sx > mxx) mxx = sx;
          if (sy > mxy) mxy = sy;
        }
      }
    }
    if (!isFinite(mnx)) { mnx = 0; mny = 0; mxx = 200; mxy = 200; }
    return { mnx, mny, mxx, mxy };
  }, [nominalBaseZForLevel, fullBaseZ, project]);

  // Full scene bounds (stable)
  const fullBounds = useMemo(() => computeBounds(boxes), [boxes, computeBounds]);

  // Drill bounds — zoom to drilled box + its descendants
  const drillBounds = useMemo(() => {
    if (!drilledKey) return fullBounds;
    const relevant = boxes.filter(b => isDescendantOf(b.key, drilledKey));
    if (relevant.length === 0) return fullBounds;
    return computeBounds(relevant);
  }, [drilledKey, boxes, computeBounds, fullBounds]);

  // Animated viewBox for smooth zoom
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 200, h: 200 });
  const viewBoxTargetRef = useRef(null);
  const viewBoxAnimRef = useRef(null);
  const viewBoxRef = useRef({ x: 0, y: 0, w: 200, h: 200 });

  useEffect(() => {
    const pad = 20;
    const bounds = drilledKey ? drillBounds : fullBounds;
    viewBoxTargetRef.current = {
      x: bounds.mnx - pad,
      y: bounds.mny - pad,
      w: bounds.mxx - bounds.mnx + pad * 2,
      h: bounds.mxy - bounds.mny + pad * 2,
    };

    const animate = () => {
      const cur = viewBoxRef.current;
      const tgt = viewBoxTargetRef.current;
      if (!tgt) return;
      const speed = 0.1;
      const nx = cur.x + (tgt.x - cur.x) * speed;
      const ny = cur.y + (tgt.y - cur.y) * speed;
      const nw = cur.w + (tgt.w - cur.w) * speed;
      const nh = cur.h + (tgt.h - cur.h) * speed;
      const done = Math.abs(nx - tgt.x) < 0.3 && Math.abs(ny - tgt.y) < 0.3 &&
                   Math.abs(nw - tgt.w) < 0.3 && Math.abs(nh - tgt.h) < 0.3;
      const next = done ? { ...tgt } : { x: nx, y: ny, w: nw, h: nh };
      viewBoxRef.current = next;
      setViewBox({ ...next });
      if (!done) viewBoxAnimRef.current = requestAnimationFrame(animate);
    };
    viewBoxAnimRef.current = requestAnimationFrame(animate);
    return () => { if (viewBoxAnimRef.current) cancelAnimationFrame(viewBoxAnimRef.current); };
  }, [drilledKey, drillBounds, fullBounds]);

  // ── Sort back-to-front (painter's algorithm) ──
  const sortedBoxes = useMemo(() => {
    return [...animatedBoxes].sort((a, b) => {
      const zA = a.animZ + a.h * a.animProgress;
      const zB = b.animZ + b.h * b.animProgress;
      if (Math.abs(zA - zB) > 0.5) return zA - zB;
      return (a.x + a.y) - (b.x + b.y);
    });
  }, [animatedBoxes]);

  // ── Drop shadow helper ──
  const renderShadow = useCallback((b) => {
    if (b.animProgress < 0.05) return null;
    const parentLevelIdx = b.levelIdx - 1;
    if (parentLevelIdx < 0) return null;
    const parentBox = animatedBoxes.find(pb => pb.levelIdx === parentLevelIdx);
    if (!parentBox) return null;
    const shadowZ = parentBox.animZ + parentBox.h * parentBox.animProgress;

    const shrink = 0.5;
    const sx = b.x + shrink;
    const sy = b.y + shrink;
    const sw = b.w - shrink * 2;
    const sd = b.d - shrink * 2;

    const c1 = project(sx, sy, shadowZ);
    const c2 = project(sx + sw, sy, shadowZ);
    const c3 = project(sx + sw, sy + sd, shadowZ);
    const c4 = project(sx, sy + sd, shadowZ);

    const points = `${c1.sx},${c1.sy} ${c2.sx},${c2.sy} ${c3.sx},${c3.sy} ${c4.sx},${c4.sy}`;
    const shadowOpacity = 0.25 * b.animProgress;

    return (
      <polygon
        key={`shadow-${b.key}`}
        points={points}
        fill="#000"
        opacity={shadowOpacity}
        stroke="none"
      />
    );
  }, [animatedBoxes, project]);

  // ── Determine box visual state (hovered, drilled, dimmed) ──
  const getBoxState = useCallback((b) => {
    let isDimmed = false;
    let isHoverTarget = false;
    let isHoverChild = false;
    let isDrillFocused = true;

    // Hover explode dimming
    if (hoveredBoxKey) {
      if (b.key === hoveredBoxKey) {
        isHoverTarget = true;
      } else if (isDescendantOf(b.key, hoveredBoxKey)) {
        isHoverChild = true;
      } else if (isDescendantOf(hoveredBoxKey, b.key)) {
        // b is an ancestor of the hovered box — keep visible
      } else {
        isDimmed = true;
      }
    }

    // Drill focus dimming (additional to hover)
    if (drilledKey) {
      if (!isDescendantOf(b.key, drilledKey) && b.key !== drilledKey) {
        // Not the drilled target or its descendant — check if it's an ancestor
        if (!isDescendantOf(drilledKey, b.key)) {
          isDrillFocused = false;
        }
      }
    }

    // Legend hover
    if (highlightLevel && highlightLevel !== b.level) isDimmed = true;

    return { isDimmed: isDimmed || !isDrillFocused, isHoverTarget, isHoverChild };
  }, [hoveredBoxKey, drilledKey, highlightLevel]);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* ── Iso visual toggles ── */}
      <div style={{
        display: 'flex', gap: 5, marginBottom: 6, alignSelf: 'stretch', flexWrap: 'wrap',
      }}>
        <button onClick={() => setEnhancedLighting(p => !p)} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${enhancedLighting ? 'rgba(251,191,36,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: enhancedLighting ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.02)',
          color: enhancedLighting ? '#fbbf24' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {enhancedLighting ? '☀ Lighting on' : '☀ Lighting off'}
        </button>
        <button onClick={() => setShowGroundShadow(p => !p)} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${showGroundShadow ? 'rgba(148,163,184,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: showGroundShadow ? 'rgba(148,163,184,0.10)' : 'rgba(255,255,255,0.02)',
          color: showGroundShadow ? '#94a3b8' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {showGroundShadow ? '◐ Shadow on' : '◐ Shadow off'}
        </button>
        <button onClick={() => setCameraMode(p => p === 'standard' ? 'topDown' : 'standard')} style={{
          fontSize: 8, fontWeight: 600, padding: '2px 8px', cursor: 'pointer', borderRadius: 4,
          border: `1px solid ${cameraMode === 'topDown' ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.10)'}`,
          background: cameraMode === 'topDown' ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.02)',
          color: cameraMode === 'topDown' ? '#38bdf8' : '#475569',
          transition: 'all 0.15s', outline: 'none',
        }}>
          {cameraMode === 'topDown' ? '◉ Top-down' : '◎ Standard'}
        </button>
      </div>

      {/* ── Drill breadcrumb ── */}
      {drillStack.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8, alignSelf: 'stretch',
          padding: '5px 10px', borderRadius: 7,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button
            onClick={() => handleDrillBack(0)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
              color: '#38bdf8', fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
              borderRadius: 3,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(56,189,248,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            Document
          </button>
          {drillStack.map((item, i) => {
            const vc = VIZ_COLORS[item.level] || VIZ_COLORS.document;
            const isLast = i === drillStack.length - 1;
            return (
              <span key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <span style={{ color: '#334155', fontSize: 10, margin: '0 3px' }}>›</span>
                <button
                  onClick={() => isLast ? null : handleDrillBack(i + 1)}
                  style={{
                    background: isLast ? `${vc.text}18` : 'none',
                    border: isLast ? `1px solid ${vc.text}40` : 'none',
                    cursor: isLast ? 'default' : 'pointer', padding: '2px 6px',
                    color: vc.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                    borderRadius: 3,
                  }}
                  onMouseEnter={e => { if (!isLast) e.currentTarget.style.background = `${vc.text}18`; }}
                  onMouseLeave={e => { if (!isLast) e.currentTarget.style.background = 'none'; }}
                >
                  {item.label}
                </button>
              </span>
            );
          })}
          <button
            onClick={() => handleDrillBack(0)}
            style={{
              marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer', padding: '2px 8px', color: '#64748b', fontSize: 8,
              fontWeight: 600, borderRadius: 4, fontFamily: 'monospace',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; }}
          >
            Reset view
          </button>
        </div>
      )}

      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        width="100%"
        style={{ maxHeight: 500, overflow: 'visible' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="isoBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id="isoBlurWide" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <radialGradient id="groundShadowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#000" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ground shadow */}
        {(() => {
          const gc = project(BASE_W / 2, BASE_D / 2, 0);
          if (showGroundShadow) {
            return (
              <>
                {/* Wide ambient shadow */}
                <ellipse
                  cx={gc.sx} cy={gc.sy + 10}
                  rx={BASE_W * 0.65} ry={BASE_D * 0.25}
                  fill="url(#groundShadowGrad)"
                  filter="url(#isoBlurWide)"
                />
                {/* Tighter contact shadow */}
                <ellipse
                  cx={gc.sx} cy={gc.sy + 5}
                  rx={BASE_W * 0.48} ry={BASE_D * 0.16}
                  fill="#000" opacity={0.25}
                  filter="url(#isoBlur)"
                />
              </>
            );
          }
          // Simple fallback shadow when toggle is off
          return (
            <ellipse
              cx={gc.sx} cy={gc.sy + 6}
              rx={BASE_W * 0.52} ry={BASE_D * 0.18}
              fill="#000" opacity={0.18}
              filter="url(#isoBlur)"
            />
          );
        })()}

        {/* Shadows */}
        {sortedBoxes.map((b) => renderShadow(b))}

        {/* Boxes */}
        {sortedBoxes.map((b) => {
          if (b.animProgress < 0.01) return null;
          const ic = ISO_COLORS[b.level];
          const vc = VIZ_COLORS[b.level];
          const { isDimmed, isHoverTarget } = getBoxState(b);

          const stripes = b.level === 'chunk' && b.tokenCount
            ? { count: b.tokenCount, borderColor: ISO_COLORS.token.border }
            : undefined;

          return (
            <IsoBox
              key={b.key}
              x={b.x} y={b.y} z={b.animZ}
              w={b.w} d={b.d} h={b.h}
              color={ic.fill}
              borderColor={ic.border}
              opacity={1}
              label={b.label}
              sublabel={b.sublabel}
              highlighted={isHoverTarget}
              dimmed={isDimmed}
              animProgress={b.animProgress}
              levelIdx={b.levelIdx}
              tokenStripes={stripes}
              enhancedLighting={enhancedLighting}
              project={project}
              onHover={(e) => {
                setHoveredBoxKey(b.key);
                onHoverLevel(b.level, `${vc.label}: ${b.label || ''}  ·  ${vc.tool}  ·  click to drill`, e);
              }}
              onLeave={() => { setHoveredBoxKey(null); onTooltipHide(); }}
              onClick={() => handleDrill(b.key, b.label, b.level)}
            />
          );
        })}
      </svg>

      {/* Iso legend */}
      <div style={{
        display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {LEVEL_KEYS.map((key, i) => {
          const ic = ISO_COLORS[key];
          const vc = VIZ_COLORS[key];
          const prog = levelProgress[i];
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: prog > 0.1 ? 0.4 + prog * 0.6 : 0.15,
              transition: 'opacity 0.15s',
            }}>
              <div style={{
                width: 10, height: 8 * Math.max(prog, 0.2), background: ic.fill,
                border: `1.5px solid ${ic.border}`, borderRadius: 2,
                transform: 'skewX(-10deg)',
                transition: 'height 0.3s',
              }} />
              <span style={{ fontSize: 8, fontWeight: 700, color: vc.text }}>{vc.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Viz ───────────────────────────────────────────────────────────────

function SegmentationViz({ parsedOutputText }) {
  const dc = VIZ_COLORS.document;

  // Hover highlight: which level key is hovered in the legend
  const [highlightLevel, setHighlightLevel] = useState(null);
  // Click isolate: which level key is clicked in the legend (null = show all)
  const [isolateLevel, setIsolateLevel] = useState(null);
  // Tooltip
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  // Animated reveal stage (0–5, one per level)
  const [revealStage, setRevealStage] = useState(-1);
  const hasAnimated = useRef(false);
  // Scanned document mode (#6)
  const [scanned, setScanned] = useState(false);
  // POS tag coloring (#9)
  const [showPos, setShowPos] = useState(false);
  // Step-by-step mode (#8)
  const [stepMode, setStepMode] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  // Side-by-side view (#10)
  const [sideBySide, setSideBySide] = useState(false);
  // Cross-highlight word ID (#10)
  const [hoveredWordId, setHoveredWordId] = useState(null);
  // Live word counts (#11)
  const [showCounts, setShowCounts] = useState(false);
  // Depth ruler (#12)
  const [showRuler, setShowRuler] = useState(false);
  // Live document mode (#13)
  const [useLiveDoc, setUseLiveDoc] = useState(false);
  const [liveDocData, setLiveDocData] = useState(null);
  // Granularity slider (#14)
  const [sliderDepth, setSliderDepth] = useState(5);
  const [useSlider, setUseSlider] = useState(false);
  // Isometric 3D view (#15)
  const [showIso, setShowIso] = useState(false);
  // Page layout iso mode (#16) — OCR-style, shows PDF page structure
  const [isoMode, setIsoMode] = useState('structural'); // 'structural' | 'pageLayout' | 'pageImage'
  const [pageLayoutData, setPageLayoutData] = useState(null); // { items, pageWidth, pageHeight }

  // Active data source: live parsed doc or illustrative
  const activeSections = useLiveDoc && liveDocData ? liveDocData : SECTIONS_DATA;

  // Build word index for the active data source
  const wordIndex = useMemo(() => {
    if (useLiveDoc && liveDocData) return buildWordIndexFromSections(liveDocData);
    return buildWordIndex();
  }, [useLiveDoc, liveDocData]);

  // Handle "Analyze current document" click
  const handleAnalyzeDoc = useCallback(() => {
    if (!parsedOutputText) return;
    const parsed = parseRealDocument(parsedOutputText);
    if (parsed) {
      setLiveDocData(parsed);
      setUseLiveDoc(true);
    }
  }, [parsedOutputText]);

  // PDF upload for 3D visualization
  const pdfUploadRef = useRef(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState(null);

  const handlePdfUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    setUploadedFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      // Extract only page 1
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const pv = page.view; // [x, y, width, height]
      const pw = pv[2] - pv[0];
      const ph = pv[3] - pv[1];

      // Store raw items with bounding info for page layout mode
      setPageLayoutData({ items: content.items, pageWidth: pw, pageHeight: ph });

      // Also do structural parse
      const text = content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').trim();
      if (text) {
        const parsed = parseRealDocument(text);
        if (parsed) {
          setLiveDocData(parsed);
          setUseLiveDoc(true);
        }
      }
      // Auto-enable iso view in page layout mode
      setShowIso(true);
      setIsoMode('pageLayout');
      setUseSlider(true);
      setSliderDepth(1);
      if (stepMode) setStepMode(false);
    } catch (err) {
      console.error('PDF upload extraction failed:', err);
    } finally {
      setUploadingPdf(false);
      if (pdfUploadRef.current) pdfUploadRef.current.value = '';
    }
  }, [stepMode]);

  // Animated reveal on mount
  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    LEVEL_KEYS.forEach((_, i) => {
      setTimeout(() => setRevealStage(i), 180 + i * 200);
    });
  }, []);

  // Step mode overrides: when in step mode, force revealStage and maxDepth
  const effectiveRevealStage = stepMode ? stepIdx : (useSlider ? sliderDepth : revealStage);
  const effectiveMaxDepth = stepMode ? stepIdx : useSlider ? sliderDepth : (isolateLevel !== null ? LEVEL_DEPTH[isolateLevel] : 5);

  // Should a given level be dimmed?
  const isDimmed = useCallback((level) => {
    if (highlightLevel && highlightLevel !== level) return true;
    return false;
  }, [highlightLevel]);

  // Legend hover/click handlers
  const handleLegendEnter = (key) => setHighlightLevel(key);
  const handleLegendLeave = () => setHighlightLevel(null);
  const handleLegendClick = (key) => {
    if (!stepMode) setIsolateLevel(prev => prev === key ? null : key);
  };

  // Region hover handler for tooltips
  const handleRegionHover = useCallback((level, text, e) => {
    if (level === null) {
      setTooltip(t => ({ ...t, visible: false }));
    } else {
      setTooltip({ visible: true, text, x: e.clientX, y: e.clientY });
    }
  }, []);

  // Mouse move to follow cursor for tooltip
  const vizRef = useRef(null);
  useEffect(() => {
    const el = vizRef.current;
    if (!el) return;
    const handler = (e) => {
      setTooltip(t => t.visible ? { ...t, x: e.clientX, y: e.clientY } : t);
    };
    el.addEventListener('mousemove', handler);
    return () => el.removeEventListener('mousemove', handler);
  }, []);

  const docVisible = effectiveRevealStage >= LEVEL_DEPTH.document;

  // Count section word offsets for wordId tracking
  const sectionWordOffsets = useMemo(() => {
    const offsets = [];
    let total = 0;
    for (const sec of activeSections) {
      offsets.push(total);
      for (const para of sec.paragraphs) {
        for (const sent of para) {
          total += sentWordCount(sent);
        }
      }
    }
    return offsets;
  }, [activeSections]);

  // Toggle button helper
  const ToggleBtn = ({ active, onClick, children, style: extraStyle }) => (
    <button onClick={onClick} style={{
      fontSize: 9, fontWeight: 600, padding: '3px 9px', cursor: 'pointer',
      border: `1px solid ${active ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.10)'}`,
      background: active ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.02)',
      color: active ? '#38bdf8' : '#475569',
      transition: 'all 0.15s', outline: 'none', borderRadius: 5,
      ...extraStyle,
    }}>{children}</button>
  );

  // Segmented panel (right side or full width)
  // Total counts for document-level badge
  const totalParas = activeSections.reduce((n, s) => n + s.paragraphs.length, 0);
  const totalSentences = activeSections.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + p.length, 0), 0);

  // (#12) Depth indicator ruler component
  const DepthRuler = () => (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 4, width: 22, flexShrink: 0, userSelect: 'none',
    }}>
      {LEVEL_KEYS.map((key, i) => {
        const c = VIZ_COLORS[key];
        const active = effectiveRevealStage >= i;
        const isCurrent = stepMode ? stepIdx === i : false;
        return (
          <div key={key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            flex: 1, minHeight: 20, position: 'relative', width: '100%',
          }}>
            {/* Vertical line */}
            {i > 0 && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 2, height: '100%',
                background: active ? `${c.border}` : 'rgba(255,255,255,0.04)',
                transition: 'background 0.3s',
              }} />
            )}
            {/* Tick dot */}
            <div style={{
              position: 'relative', zIndex: 1,
              width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8,
              borderRadius: '50%',
              background: active ? c.bg : 'rgba(255,255,255,0.03)',
              border: `2px solid ${active ? c.border : 'rgba(255,255,255,0.06)'}`,
              transition: 'all 0.3s',
              marginTop: i === 0 ? 0 : 'auto',
              marginBottom: 'auto',
            }} />
            {/* Level abbreviation */}
            <span style={{
              fontSize: 6, fontWeight: 700, color: active ? c.text : '#1e293b',
              letterSpacing: '0.05em', marginTop: 1,
              transition: 'color 0.3s',
              position: 'relative', zIndex: 1,
            }}>{c.label.slice(0, 3).toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );

  const SegmentedPanel = () => (
    <div style={{ display: 'flex', gap: 0, flex: 1, minWidth: 0 }}>
      {/* Depth ruler (#12) */}
      {showRuler && <DepthRuler />}

      <div
        onMouseEnter={(e) => handleRegionHover('document', `Document  ·  ${activeSections.length} sections  ·  ${VIZ_COLORS.document.tool}`, e)}
        onMouseLeave={() => handleRegionHover(null)}
        style={{
          padding: '10px 12px', borderRadius: 9,
          background: dc.bg, border: `2px solid ${dc.border}`,
          display: 'flex', flexDirection: 'column', gap: 7,
          opacity: docVisible ? (isDimmed('document') ? 0.15 : 1) : 0,
          transform: docVisible ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
          flex: 1, minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 8, fontWeight: 800, color: dc.text,
            textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace',
          }}>
            Document
          </span>
          {showCounts && (
            <CountBadge text={`${activeSections.length} sec · ${totalParas} para · ${totalSentences} sent · ${wordIndex.length} tok`} color={dc.text} />
          )}
        </div>

        {effectiveMaxDepth >= LEVEL_DEPTH.section ? activeSections.map((sec, i) => (
          <VSectionBlock
            key={i}
            heading={sec.heading}
            title={sec.title}
            paragraphs={sec.paragraphs}
            dimmed={isDimmed('section')}
            maxDepth={effectiveMaxDepth}
            revealStage={effectiveRevealStage}
            onHoverLevel={handleRegionHover}
            scanned={scanned}
            showPos={showPos}
            hoveredWordId={hoveredWordId}
            wordIdStart={sectionWordOffsets[i]}
            onWordHover={setHoveredWordId}
            showCounts={showCounts}
          />
        )) : (
          <span style={{ fontSize: 8, color: dc.text, fontFamily: 'monospace', opacity: 0.7 }}>
            {activeSections.length} sections
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div ref={vizRef}>
      {/* ── Controls row 1: Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, alignItems: 'center' }}>
        {LEVEL_KEYS.map(key => {
          const c = VIZ_COLORS[key];
          const isIsolated = !stepMode && isolateLevel === key;
          const isStepLevel = stepMode && stepIdx === LEVEL_DEPTH[key];
          return (
            <button
              key={key}
              onMouseEnter={() => handleLegendEnter(key)}
              onMouseLeave={handleLegendLeave}
              onClick={() => handleLegendClick(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 5, cursor: stepMode ? 'default' : 'pointer',
                border: (isIsolated || isStepLevel) ? `1.5px solid ${c.border}` : '1.5px solid transparent',
                background: (isIsolated || isStepLevel) ? c.bg : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s', outline: 'none',
              }}
            >
              <div style={{
                width: 11, height: 11, borderRadius: 3,
                background: c.bg, border: `1.5px solid ${c.border}`,
                transition: 'transform 0.15s',
                transform: highlightLevel === key ? 'scale(1.3)' : 'scale(1)',
              }} />
              <span style={{
                fontSize: 10, color: c.text, fontWeight: 600,
                transition: 'opacity 0.15s',
                opacity: highlightLevel && highlightLevel !== key ? 0.35 : 1,
              }}>{c.label}</span>
              {isIsolated && <span style={{ fontSize: 8, color: c.text, opacity: 0.6 }}>isolated</span>}
            </button>
          );
        })}
      </div>

      {/* ── Controls row 2: Toggles ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        {/* Scanned toggle */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button onClick={() => setScanned(false)} style={{
            fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: '5px 0 0 5px', cursor: 'pointer',
            border: `1px solid ${!scanned ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.10)'}`,
            background: !scanned ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.02)',
            color: !scanned ? '#38bdf8' : '#475569', transition: 'all 0.15s', outline: 'none',
          }}>Text PDF</button>
          <button onClick={() => setScanned(true)} style={{
            fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: '0 5px 5px 0', cursor: 'pointer',
            border: `1px solid ${scanned ? 'rgba(148,163,184,0.45)' : 'rgba(255,255,255,0.10)'}`, borderLeft: 'none',
            background: scanned ? 'rgba(148,163,184,0.12)' : 'rgba(255,255,255,0.02)',
            color: scanned ? '#94a3b8' : '#475569', transition: 'all 0.15s', outline: 'none',
          }}>Scanned</button>
        </div>

        {/* POS coloring toggle */}
        <ToggleBtn active={showPos} onClick={() => setShowPos(p => !p)}>
          POS Colors
        </ToggleBtn>

        {/* Side-by-side toggle */}
        <ToggleBtn active={sideBySide} onClick={() => setSideBySide(p => !p)}>
          Side-by-side
        </ToggleBtn>

        {/* Step mode toggle */}
        <ToggleBtn active={stepMode} onClick={() => { setStepMode(p => !p); setStepIdx(0); setIsolateLevel(null); }}>
          Step-by-step
        </ToggleBtn>

        {/* Counts toggle (#11) */}
        <ToggleBtn active={showCounts} onClick={() => setShowCounts(p => !p)}>
          Counts
        </ToggleBtn>

        {/* Ruler toggle (#12) */}
        <ToggleBtn active={showRuler} onClick={() => setShowRuler(p => !p)}>
          Depth ruler
        </ToggleBtn>

        {/* Granularity slider toggle (#14) */}
        <ToggleBtn active={useSlider} onClick={() => { setUseSlider(p => !p); if (stepMode) { setStepMode(false); } }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <SlidersHorizontal size={10} /> Granularity
          </span>
        </ToggleBtn>

        {/* Isometric 3D toggle */}
        <ToggleBtn active={showIso} onClick={() => {
          setShowIso(p => {
            if (!p) {
              // Turning on: enable slider at depth 1 (Doc + Sections) for progressive reveal
              setUseSlider(true);
              setSliderDepth(1);
              if (stepMode) setStepMode(false);
            }
            return !p;
          });
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box size={10} /> 3D Iso
          </span>
        </ToggleBtn>

        {/* Iso mode toggles: structural | page layout | page image */}
        {showIso && pageLayoutData && (
          <div style={{ display: 'flex', gap: 0 }}>
            {[
              { key: 'structural', label: 'Structural', color: '#475569', activeColor: '#38bdf8', activeBorder: 'rgba(56,189,248,0.40)', activeBg: 'rgba(56,189,248,0.10)' },
              { key: 'pageLayout', label: 'Page layout', color: '#475569', activeColor: '#f472b6', activeBorder: 'rgba(244,114,182,0.40)', activeBg: 'rgba(244,114,182,0.10)' },
              { key: 'pageImage', label: 'Page image', color: '#475569', activeColor: '#a78bfa', activeBorder: 'rgba(167,139,250,0.40)', activeBg: 'rgba(167,139,250,0.10)' },
            ].map((mode, idx, arr) => {
              const isActive = isoMode === mode.key;
              return (
                <button key={mode.key} onClick={() => setIsoMode(mode.key)} style={{
                  fontSize: 8, fontWeight: 600, padding: '3px 8px', cursor: 'pointer',
                  borderRadius: idx === 0 ? '4px 0 0 4px' : idx === arr.length - 1 ? '0 4px 4px 0' : 0,
                  border: `1px solid ${isActive ? mode.activeBorder : 'rgba(255,255,255,0.10)'}`,
                  borderLeft: idx > 0 ? 'none' : undefined,
                  background: isActive ? mode.activeBg : 'rgba(255,255,255,0.02)',
                  color: isActive ? mode.activeColor : mode.color,
                  transition: 'all 0.15s', outline: 'none',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <FileText size={9} />
                  {mode.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Analyze current doc (#13) */}
        {parsedOutputText ? (
          <button onClick={useLiveDoc ? () => setUseLiveDoc(false) : handleAnalyzeDoc} style={{
            fontSize: 9, fontWeight: 600, padding: '3px 9px', cursor: 'pointer',
            border: `1px solid ${useLiveDoc ? 'rgba(52,211,153,0.40)' : 'rgba(250,204,21,0.40)'}`,
            background: useLiveDoc ? 'rgba(52,211,153,0.12)' : 'rgba(250,204,21,0.10)',
            color: useLiveDoc ? '#34d399' : '#fbbf24',
            transition: 'all 0.15s', outline: 'none', borderRadius: 5,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Zap size={10} />
            {useLiveDoc ? 'Back to illustrative' : 'Analyze current doc'}
          </button>
        ) : (
          <span style={{
            fontSize: 8, color: '#334155', fontStyle: 'italic', padding: '3px 9px',
          }}>Parse a document first to analyze it here</span>
        )}

        {/* Upload PDF for 3D visualization */}
        <input
          ref={pdfUploadRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handlePdfUpload}
        />
        <button
          onClick={() => pdfUploadRef.current?.click()}
          disabled={uploadingPdf}
          style={{
            fontSize: 9, fontWeight: 600, padding: '3px 9px', cursor: uploadingPdf ? 'wait' : 'pointer',
            border: '1px solid rgba(99,102,241,0.40)',
            background: uploadedFileName && useLiveDoc ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.08)',
            color: '#818cf8',
            transition: 'all 0.15s', outline: 'none', borderRadius: 5,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Upload size={10} />
          {uploadingPdf ? 'Parsing…' : uploadedFileName && useLiveDoc ? uploadedFileName : 'Upload PDF'}
        </button>

        {/* POS legend (small) */}
        {showPos && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {['DET','ADJ','NOUN','PROPN','NUM','VERB','ADV'].map(pos => (
              <span key={pos} style={{
                fontSize: 8, fontWeight: 700, color: POS_COLORS[pos].color,
                padding: '1px 5px', borderRadius: 3,
                background: `${POS_COLORS[pos].color}15`,
                border: `1px solid ${POS_COLORS[pos].color}30`,
              }}>{pos}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Step-by-step controls (#8) ── */}
      {stepMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          padding: '8px 14px', borderRadius: 8,
          background: `${VIZ_COLORS[LEVEL_KEYS[stepIdx]].bg}`,
          border: `1px solid ${VIZ_COLORS[LEVEL_KEYS[stepIdx]].border}`,
        }}>
          <button
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={stepIdx === 0}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5,
              color: stepIdx === 0 ? '#334155' : '#94a3b8', cursor: stepIdx === 0 ? 'not-allowed' : 'pointer',
              padding: '2px 6px', display: 'flex', alignItems: 'center', outline: 'none',
            }}
          ><ChevronLeft size={12} /></button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: VIZ_COLORS[LEVEL_KEYS[stepIdx]].text,
                padding: '1px 6px', borderRadius: 4,
                background: `${VIZ_COLORS[LEVEL_KEYS[stepIdx]].text}18`,
              }}>Step {stepIdx + 1}/{LEVEL_KEYS.length}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                {STEP_DESCRIPTIONS[stepIdx].title}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4 }}>
              {STEP_DESCRIPTIONS[stepIdx].desc}
            </div>
          </div>

          <button
            onClick={() => setStepIdx(Math.min(LEVEL_KEYS.length - 1, stepIdx + 1))}
            disabled={stepIdx >= LEVEL_KEYS.length - 1}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5,
              color: stepIdx >= LEVEL_KEYS.length - 1 ? '#334155' : '#94a3b8',
              cursor: stepIdx >= LEVEL_KEYS.length - 1 ? 'not-allowed' : 'pointer',
              padding: '2px 6px', display: 'flex', alignItems: 'center', outline: 'none',
            }}
          ><ChevronRight size={12} /></button>

          <button
            onClick={() => { setStepIdx(0); }}
            style={{
              background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5,
              color: '#64748b', cursor: 'pointer', padding: '2px 6px',
              display: 'flex', alignItems: 'center', outline: 'none',
            }}
            title="Reset to step 1"
          ><RotateCcw size={11} /></button>
        </div>
      )}

      {/* ── Granularity slider (#14) ── */}
      {useSlider && !stepMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          padding: '8px 14px', borderRadius: 8,
          background: `${VIZ_COLORS[LEVEL_KEYS[sliderDepth]].bg}`,
          border: `1px solid ${VIZ_COLORS[LEVEL_KEYS[sliderDepth]].border}`,
        }}>
          <SlidersHorizontal size={13} style={{ color: VIZ_COLORS[LEVEL_KEYS[sliderDepth]].text, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: VIZ_COLORS[LEVEL_KEYS[sliderDepth]].text }}>
                Granularity: {VIZ_COLORS[LEVEL_KEYS[sliderDepth]].label}
              </span>
              <span style={{ fontSize: 8, color: '#64748b' }}>Level {sliderDepth + 1} of {LEVEL_KEYS.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 7, fontWeight: 700, color: '#475569', width: 28, textAlign: 'right' }}>DOC</span>
              <input
                type="range"
                min={0}
                max={LEVEL_KEYS.length - 1}
                value={sliderDepth}
                onChange={(e) => setSliderDepth(Number(e.target.value))}
                style={{
                  flex: 1, height: 4, cursor: 'pointer',
                  accentColor: VIZ_COLORS[LEVEL_KEYS[sliderDepth]].border,
                }}
              />
              <span style={{ fontSize: 7, fontWeight: 700, color: '#475569', width: 28 }}>TOK</span>
            </div>
            {/* Tick labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 34, paddingRight: 34 }}>
              {LEVEL_KEYS.map((key, i) => (
                <span key={key} style={{
                  fontSize: 6, fontWeight: 700, width: 0, textAlign: 'center',
                  color: i <= sliderDepth ? VIZ_COLORS[key].text : '#1e293b',
                  transition: 'color 0.2s',
                }}>
                  {VIZ_COLORS[key].label.slice(0, 3).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Isolate label ── */}
      {!stepMode && isolateLevel && (
        <div style={{
          fontSize: 10, color: '#64748b', marginBottom: 10,
          padding: '4px 10px', borderRadius: 5,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          Isolated to <span style={{ color: VIZ_COLORS[isolateLevel].text, fontWeight: 700 }}>{VIZ_COLORS[isolateLevel].label}</span> level
          <button onClick={() => setIsolateLevel(null)} style={{
            background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
            fontSize: 9, padding: '1px 4px', borderRadius: 3, textDecoration: 'underline',
          }}>reset</button>
        </div>
      )}

      {/* ── Live doc indicator (#13) ── */}
      {useLiveDoc && liveDocData && (
        <div style={{
          fontSize: 10, color: '#34d399', marginBottom: 10,
          padding: '4px 10px', borderRadius: 5,
          background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Zap size={10} />
          Showing <span style={{ fontWeight: 700 }}>parsed output</span> — {liveDocData.length} sections, {wordIndex.length} tokens
          <button onClick={() => setUseLiveDoc(false)} style={{
            background: 'none', border: 'none', color: '#34d399', cursor: 'pointer',
            fontSize: 9, padding: '1px 4px', borderRadius: 3, textDecoration: 'underline', opacity: 0.7,
          }}>show illustrative</button>
        </div>
      )}

      {/* ── Main viz area ── */}
      {showIso ? (
        isoMode === 'pageImage' && pageLayoutData ? (
          <PageImageIsoViz pageData={pageLayoutData} />
        ) : isoMode === 'pageLayout' && pageLayoutData ? (
          <PageLayoutIsoViz pageData={pageLayoutData} />
        ) : (
          <IsometricViz
            sections={activeSections}
            maxDepth={effectiveMaxDepth}
            revealStage={effectiveRevealStage}
            highlightLevel={highlightLevel}
            onHoverLevel={handleRegionHover}
            tooltip={tooltip}
            onTooltipHide={() => handleRegionHover(null)}
          />
        )
      ) : sideBySide ? (
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Left: raw text */}
          <div style={{
            flex: '0 0 35%', padding: '10px 12px', borderRadius: 9,
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
            overflowY: 'auto', maxHeight: 500,
          }}>
            <div style={{
              fontSize: 8, fontWeight: 800, color: '#475569', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 8,
            }}>Raw text</div>
            <RawTextPanel wordIndex={wordIndex} hoveredWordId={hoveredWordId} onWordHover={setHoveredWordId} />
          </div>
          {/* Right: segmented */}
          <SegmentedPanel />
        </div>
      ) : (
        <SegmentedPanel />
      )}

      {/* ── Nesting depth reminder ── */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
        {LEVEL_KEYS.map((key, i) => {
          const c = VIZ_COLORS[key];
          const isActive = stepMode ? stepIdx === i : isolateLevel === key;
          const beyondStep = stepMode && i > stepIdx;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: c.text,
                padding: '2px 7px', borderRadius: 4,
                background: c.bg, border: `1px solid ${c.border}`,
                opacity: beyondStep ? 0.2 : (isolateLevel && !isActive) ? 0.3 : (highlightLevel && highlightLevel !== key) ? 0.3 : 1,
                transition: 'opacity 0.15s',
              }}>{c.label}</span>
              {i < LEVEL_KEYS.length - 1 && (
                <span style={{ color: '#334155', fontSize: 11, margin: '0 3px' }}>›</span>
              )}
            </div>
          );
        })}
      </div>

      <VizTooltip {...tooltip} />
    </div>
  );
}

// ─── Element detection helpers ────────────────────────────────────────────────

const ELEMENT_STYLES = {
  heading:  { label: 'Headings',  color: '#38bdf8', border: 'rgba(56,189,248,0.5)',  bg: 'rgba(56,189,248,0.13)',  overlay: 'rgba(56,189,248,0.18)'  },
  math:     { label: 'Math',      color: '#a78bfa', border: 'rgba(167,139,250,0.5)', bg: 'rgba(167,139,250,0.13)', overlay: 'rgba(167,139,250,0.22)' },
  citation: { label: 'Citations', color: '#fb923c', border: 'rgba(251,146,60,0.5)',  bg: 'rgba(251,146,60,0.13)',  overlay: 'rgba(251,146,60,0.22)'  },
  figure:   { label: 'Figures',   color: '#4ade80', border: 'rgba(74,222,128,0.5)',  bg: 'rgba(74,222,128,0.13)', overlay: 'rgba(74,222,128,0.20)'  },
  table:    { label: 'Tables',    color: '#fbbf24', border: 'rgba(251,191,36,0.5)',  bg: 'rgba(251,191,36,0.13)', overlay: 'rgba(251,191,36,0.20)'  },
  pagenum:  { label: 'Page №',   color: '#f472b6', border: 'rgba(244,114,182,0.5)', bg: 'rgba(244,114,182,0.13)', overlay: 'rgba(244,114,182,0.20)' },
};

const MATH_RE = /[∑∫∂∇αβγδεζηθικλμνξπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΠΡΣΤΥΦΧΨΩ×÷≤≥≠≈→←↔∈∉⊂⊃∪∩∧∨¬∀∃√∞±·°]/;

function detectDocumentElements(items, pageWidth, pageHeight) {
  const valid = items
    .filter(it => {
      if (!it.str || !it.str.trim()) return false;
      return Math.abs(it.transform[1]) <= 0.1 && Math.abs(it.transform[2]) <= 0.1;
    })
    .map(it => {
      const fontSize = Math.abs(it.transform[3]) || 10;
      const x = it.transform[4];
      const y = pageHeight - it.transform[5] - fontSize;
      const w = it.width || it.str.length * fontSize * 0.55;
      return { text: it.str.trim(), x, y, w, h: fontSize * 1.3, fontSize };
    });

  if (valid.length === 0) return [];

  const sizes = valid.map(i => i.fontSize).sort((a, b) => a - b);
  const medianSize = sizes[Math.floor(sizes.length / 2)];

  const results = [];
  for (const item of valid) {
    const t = item.text;

    // Page number: standalone integer near very top or very bottom margin
    if (/^\d+$/.test(t) && (item.y < pageHeight * 0.07 || item.y > pageHeight * 0.91)) {
      results.push({ ...item, type: 'pagenum' }); continue;
    }
    // Figure caption
    if (/^(figure|fig\.?)\s*\d+/i.test(t)) {
      results.push({ ...item, type: 'figure' }); continue;
    }
    // Table caption
    if (/^table\s*\d+/i.test(t)) {
      results.push({ ...item, type: 'table' }); continue;
    }
    // Citation: [1], [1,2,3] or tiny superscript-style digit
    if (/^\[[\d,;\s]+\]$/.test(t) || (item.fontSize < medianSize * 0.72 && /^\d+$/.test(t))) {
      results.push({ ...item, type: 'citation' }); continue;
    }
    // Math: unicode math chars, or equation-like short text with = sign
    if (MATH_RE.test(t) || (t.includes('=') && t.length > 2 && item.fontSize <= medianSize * 1.05)) {
      results.push({ ...item, type: 'math' }); continue;
    }
    // Heading: notably larger font, not too long
    if (item.fontSize > medianSize * 1.2 && t.length > 1 && t.length < 150) {
      results.push({ ...item, type: 'heading' }); continue;
    }
  }

  return results;
}

// ─── Blueprint PDF Viewer ──────────────────────────────────────────────────────

// Isometric card component — projects a dataURL image onto a flat isometric card
// rotation: 0=NE (default), 1=SE (90°CW), 2=SW (180°), 3=NW (90°CCW)
function BlueprintIsoCard({ dataUrl, imgW, imgH, cameraMode, rotation = 0 }) {
  const cam = ISO_CAMERAS[cameraMode];
  const project = useMemo(() => makeProjector(cam), [cam]);

  // For odd rotations the page is transposed, swap aspect ratio
  const isTransposed = rotation % 2 === 1;
  const ISO_W = 320;
  const aspect = isTransposed ? (imgW / imgH) : (imgH / imgW);
  const ISO_D = aspect * ISO_W;
  const THICKNESS = 3;

  const c = useCallback((x, y, z) => project(x, y, z), [project]);

  // The 4 iso corners of the top face
  const corners = useMemo(() => ({
    TL: c(0,     0,     THICKNESS),
    TR: c(ISO_W, 0,     THICKNESS),
    BR: c(ISO_W, ISO_D, THICKNESS),
    BL: c(0,     ISO_D, THICKNESS),
  }), [c, ISO_W, ISO_D]);

  // Top face polygon
  const topFace = useMemo(() => {
    const { TL, TR, BR, BL } = corners;
    return `${TL.sx},${TL.sy} ${TR.sx},${TR.sy} ${BR.sx},${BR.sy} ${BL.sx},${BL.sy}`;
  }, [corners]);

  // Side faces (edges)
  const leftFace = useMemo(() => {
    const tl = c(0, 0, THICKNESS), bl = c(0, ISO_D, THICKNESS);
    const blb = c(0, ISO_D, 0), tlb = c(0, 0, 0);
    return `${tl.sx},${tl.sy} ${bl.sx},${bl.sy} ${blb.sx},${blb.sy} ${tlb.sx},${tlb.sy}`;
  }, [c, ISO_D]);
  const rightFace = useMemo(() => {
    const tr = c(ISO_W, 0, THICKNESS), tl = c(0, 0, THICKNESS);
    const tlb = c(0, 0, 0), trb = c(ISO_W, 0, 0);
    return `${tr.sx},${tr.sy} ${tl.sx},${tl.sy} ${tlb.sx},${tlb.sy} ${trb.sx},${trb.sy}`;
  }, [c, ISO_W]);
  const swFace = useMemo(() => {
    const bl = c(0, ISO_D, THICKNESS), br = c(ISO_W, ISO_D, THICKNESS);
    const brb = c(ISO_W, ISO_D, 0), blb = c(0, ISO_D, 0);
    return `${bl.sx},${bl.sy} ${br.sx},${br.sy} ${brb.sx},${brb.sy} ${blb.sx},${blb.sy}`;
  }, [c, ISO_W, ISO_D]);
  const seFace = useMemo(() => {
    const br = c(ISO_W, ISO_D, THICKNESS), tr = c(ISO_W, 0, THICKNESS);
    const trb = c(ISO_W, 0, 0), brb = c(ISO_W, ISO_D, 0);
    return `${br.sx},${br.sy} ${tr.sx},${tr.sy} ${trb.sx},${trb.sy} ${brb.sx},${brb.sy}`;
  }, [c, ISO_W, ISO_D]);

  // Affine transform: maps image pixels onto the iso top face
  // For each rotation, pick which iso corner the image's (0,0) maps to,
  // and which corners define the x-axis and y-axis directions.
  // rotation 0: TL=origin, TR=xEnd, BL=yEnd  (NE-facing title)
  // rotation 1: BL=origin, TL=xEnd, BR=yEnd  (SE-facing title, 90°CW)
  // rotation 2: BR=origin, BL=xEnd, TR=yEnd  (SW-facing title, 180°)
  // rotation 3: TR=origin, BR=xEnd, TL=yEnd  (NW-facing title, 90°CCW)
  const transform = useMemo(() => {
    const { TL, TR, BR, BL } = corners;
    const rotMap = [
      { origin: TL, xEnd: TR, yEnd: BL },
      { origin: BL, xEnd: TL, yEnd: BR },
      { origin: BR, xEnd: BL, yEnd: TR },
      { origin: TR, xEnd: BR, yEnd: TL },
    ];
    const { origin, xEnd, yEnd } = rotMap[rotation % 4];
    const a  = (xEnd.sx - origin.sx) / imgW;
    const b  = (xEnd.sy - origin.sy) / imgW;
    const cc = (yEnd.sx - origin.sx) / imgH;
    const d  = (yEnd.sy - origin.sy) / imgH;
    return `matrix(${a},${b},${cc},${d},${origin.sx},${origin.sy})`;
  }, [corners, rotation, imgW, imgH]);

  // ViewBox bounds
  const viewBox = useMemo(() => {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const [x, y] of [[0,0],[ISO_W,0],[ISO_W,ISO_D],[0,ISO_D]]) {
      for (const z of [0, THICKNESS]) {
        const { sx, sy } = c(x, y, z);
        mnx = Math.min(mnx, sx); mny = Math.min(mny, sy);
        mxx = Math.max(mxx, sx); mxy = Math.max(mxy, sy);
      }
    }
    const pad = 24;
    return `${mnx - pad} ${mny - pad} ${mxx - mnx + pad * 2} ${mxy - mny + pad * 2}`;
  }, [c, ISO_W, ISO_D]);

  // Edge accent color
  const edgeColor = '#1e4a6e';
  const edgeBorder = '#38bdf8';

  return (
    <svg viewBox={viewBox} width="100%" style={{ maxHeight: 560, overflow: 'visible' }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="bpIsoClip">
          <polygon points={topFace} />
        </clipPath>
        <filter id="bpShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        {/* Blueprint filter applied inside SVG feComponentTransfer */}
        <filter id="bpFilter" colorInterpolationFilters="sRGB">
          {/* Invert */}
          <feComponentTransfer>
            <feFuncR type="linear" slope="-1" intercept="1" />
            <feFuncG type="linear" slope="-1" intercept="1" />
            <feFuncB type="linear" slope="-1" intercept="1" />
          </feComponentTransfer>
          {/* Tint toward cyan-blue: reduce red, boost blue */}
          <feColorMatrix type="matrix" values="
            0.1  0    0    0  0.02
            0.1  0.3  0    0  0.05
            0.2  0.5  0.9  0  0.10
            0    0    0    1  0
          " />
        </filter>
      </defs>

      {/* Ground shadow */}
      {(() => {
        const gc = c(ISO_W / 2, ISO_D / 2, 0);
        return <ellipse cx={gc.sx} cy={gc.sy + 10} rx={ISO_W * 0.55} ry={ISO_D * 0.18}
          fill="#000820" opacity={0.55} filter="url(#bpShadow)" />;
      })()}

      {/* Side faces — dark card edges */}
      <polygon points={leftFace}  fill={edgeColor} stroke={edgeBorder} strokeWidth={0.4} strokeOpacity={0.5} />
      <polygon points={rightFace} fill={edgeColor} stroke={edgeBorder} strokeWidth={0.4} strokeOpacity={0.5} />

      {/* Page top face — clipped image with blueprint filter */}
      <g clipPath="url(#bpIsoClip)">
        <image
          href={dataUrl}
          width={imgW}
          height={imgH}
          transform={transform}
          style={{ filter: 'url(#bpFilter)' }}
          preserveAspectRatio="none"
        />
      </g>

      {/* South faces rendered after north so they occlude properly */}
      <polygon points={swFace} fill={edgeColor} stroke={edgeBorder} strokeWidth={0.4} strokeOpacity={0.5} />
      <polygon points={seFace} fill={edgeColor} stroke={edgeBorder} strokeWidth={0.4} strokeOpacity={0.5} />

      {/* Top face border outline */}
      <polygon points={topFace} fill="none" stroke={edgeBorder} strokeWidth={0.6} strokeOpacity={0.6} />
    </svg>
  );
}

function BlueprintPdfViewer() {
  const uploadRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fileName, setFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);       // offscreen render canvas
  const displayCanvasRef = useRef(null); // visible canvas in flat mode
  const renderTaskRef = useRef(null);
  const [isoMode, setIsoMode] = useState(false);
  const isoModeRef = useRef(false); // stable ref so render effect reads latest value
  const [isoDataUrl, setIsoDataUrl] = useState(null);
  const [isoImgSize, setIsoImgSize] = useState({ w: 1, h: 1 });
  const [cameraMode, setCameraMode] = useState('standard');
  const [rotation, setRotation] = useState(0);

  // Pan state — shared by flat and iso mode, reset on page change
  const panRef = useRef({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Visual CSS zoom (on top of render scale) — instant feedback, no re-render
  const cssZoomRef = useRef(1);
  const [cssZoom, setCssZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const viewContainerRef = useRef(null);

  // Element detection state
  const [detectedElements, setDetectedElements] = useState([]);
  const [activeHighlights, setActiveHighlights] = useState(new Set());
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 });

  // Keep isoModeRef in sync
  useEffect(() => { isoModeRef.current = isoMode; }, [isoMode]);

  // Reset pan + cssZoom only when switching between flat/iso mode
  useEffect(() => {
    panRef.current = { x: 0, y: 0 };
    setPan({ x: 0, y: 0 });
    cssZoomRef.current = 1;
    setCssZoom(1);
  }, [isoMode]);

  // Wheel-to-zoom — attached directly to avoid passive listener conflict
  useEffect(() => {
    const el = viewContainerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      const next = Math.min(5, Math.max(0.25, cssZoomRef.current * factor));
      cssZoomRef.current = next;
      setCssZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pdfDoc, isoMode]); // re-attach when view changes

  // Drag-to-pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 || !e.ctrlKey) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startPan = { ...panRef.current };
    setIsDragging(true);

    const onMove = (me) => {
      const next = { x: startPan.x + me.clientX - startX, y: startPan.y + me.clientY - startY };
      panRef.current = next;
      setPan(next);
    };
    const onUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    setIsoMode(false);
    isoModeRef.current = false;
    setIsoDataUrl(null);
    try {
      const ab = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(ab) }).promise;
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
    } catch (err) {
      console.error('Blueprint viewer load error:', err);
    } finally {
      setLoading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }, []);

  // Render current page — always to an offscreen canvas first,
  // then copy to display canvas atomically to avoid blank flash.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    async function render() {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
        renderTaskRef.current = null;
      }
      const page = await pdfDoc.getPage(currentPage);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });

      // Render into an offscreen canvas so the display canvas never goes blank
      const offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      const offCtx = offscreen.getContext('2d');
      offCtx.fillStyle = '#ffffff';
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      const task = page.render({ canvasContext: offCtx, viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') console.error(err);
        return;
      }

      if (cancelled) return;

      // Copy to the visible display canvas (flat mode)
      const display = displayCanvasRef.current;
      if (display) {
        display.width = offscreen.width;
        display.height = offscreen.height;
        display.getContext('2d').drawImage(offscreen, 0, 0);
      }

      // Store on offscreen ref for iso capture
      canvasRef.current = offscreen;
      setCanvasDims({ w: offscreen.width, h: offscreen.height });

      // If iso mode is active, update the projected image without blanking it
      if (isoModeRef.current) {
        setIsoDataUrl(offscreen.toDataURL('image/png'));
        setIsoImgSize({ w: offscreen.width, h: offscreen.height });
      }

      // Extract text content and detect elements
      try {
        const content = await page.getTextContent();
        const pv = page.view;
        const pw = pv[2] - pv[0], ph = pv[3] - pv[1];
        const found = detectDocumentElements(content.items, pw, ph);
        setDetectedElements(found);
      } catch (_) {}
    }

    render();
    return () => { cancelled = true; };
  }, [pdfDoc, currentPage, scale]);

  // Switch to iso mode: capture current display canvas as dataURL
  // Arrow key page navigation + Ctrl key tracking for drag cursor
  useEffect(() => {
    if (!pdfDoc) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(totalPages, p + 1));
      if (e.key === 'ArrowLeft')  setCurrentPage(p => Math.max(1, p - 1));
      if (e.key === 'Control') setCtrlHeld(true);
    };
    const onKeyUp = (e) => {
      if (e.key === 'Control') setCtrlHeld(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pdfDoc, totalPages]);

  const handleIsoToggle = useCallback(() => {
    if (!isoModeRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      setIsoDataUrl(canvas.toDataURL('image/png'));
      setIsoImgSize({ w: canvas.width, h: canvas.height });
    }
    setIsoMode(p => !p);
  }, []);

  const toggleHighlight = useCallback((type) => {
    setActiveHighlights(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  // Count detected elements per type for the pill labels
  const elementCounts = useMemo(() => {
    const counts = {};
    for (const el of detectedElements) {
      counts[el.type] = (counts[el.type] || 0) + 1;
    }
    return counts;
  }, [detectedElements]);

  const btnStyle = (disabled) => ({
    fontSize: 10, fontWeight: 600, padding: '3px 10px', cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: 4, border: '1px solid rgba(56,189,248,0.25)',
    background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(56,189,248,0.08)',
    color: disabled ? '#334155' : '#38bdf8', transition: 'all 0.15s', outline: 'none',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Upload row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input ref={uploadRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleUpload} />
        <button
          onClick={() => uploadRef.current?.click()}
          style={{
            fontSize: 10, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
            borderRadius: 5, border: '1px solid rgba(56,189,248,0.35)',
            background: 'rgba(56,189,248,0.10)', color: '#38bdf8',
            display: 'flex', alignItems: 'center', gap: 5, outline: 'none',
          }}
        >
          <FileText size={11} /> Upload PDF
        </button>
        {fileName && (
          <span style={{ fontSize: 10, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
        )}
        {loading && <span style={{ fontSize: 10, color: '#38bdf8', opacity: 0.7 }}>Loading…</span>}
      </div>

      {pdfDoc && (
        <>
          {/* Navigation + scale + iso toggle row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button style={btnStyle(currentPage <= 1)} disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>‹ Prev</button>
            <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 60, textAlign: 'center' }}>
              {currentPage} / {totalPages}
            </span>
            <button style={btnStyle(currentPage >= totalPages)} disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next ›</button>

            <div style={{ marginLeft: 4, display: 'flex', gap: 4 }}>
              {[0.8, 1.0, 1.2, 1.5].map(s => (
                <button key={s} onClick={() => setScale(s)} style={{
                  fontSize: 9, fontWeight: 600, padding: '2px 6px', cursor: 'pointer',
                  borderRadius: 3, border: `1px solid ${scale === s ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.08)'}`,
                  background: scale === s ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.02)',
                  color: scale === s ? '#38bdf8' : '#475569', outline: 'none',
                }}>{Math.round(s * 100)}%</button>
              ))}
            </div>

            {/* 3D Iso toggle */}
            <button onClick={handleIsoToggle} style={{
              marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '3px 10px',
              cursor: 'pointer', borderRadius: 4, outline: 'none',
              border: `1px solid ${isoMode ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.12)'}`,
              background: isoMode ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.02)',
              color: isoMode ? '#a78bfa' : '#475569',
              display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
            }}>
              <Box size={10} /> {isoMode ? '3D On' : '3D Iso'}
            </button>

            {/* Camera toggle + rotation controls — only in iso mode */}
            {isoMode && (
              <>
                <button onClick={() => setCameraMode(p => p === 'standard' ? 'topDown' : 'standard')} style={{
                  fontSize: 9, fontWeight: 600, padding: '3px 8px', cursor: 'pointer', borderRadius: 4, outline: 'none',
                  border: `1px solid ${cameraMode === 'topDown' ? 'rgba(56,189,248,0.40)' : 'rgba(255,255,255,0.10)'}`,
                  background: cameraMode === 'topDown' ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.02)',
                  color: cameraMode === 'topDown' ? '#38bdf8' : '#475569',
                  transition: 'all 0.15s',
                }}>
                  {cameraMode === 'topDown' ? '◉ Top-down' : '◎ Standard'}
                </button>

                {/* Rotation buttons */}
                <div style={{ display: 'flex', gap: 0, marginLeft: 2 }}>
                  <button
                    onClick={() => setRotation(r => (r + 3) % 4)}
                    title="Rotate 90° counter-clockwise"
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', cursor: 'pointer',
                      borderRadius: '4px 0 0 4px', outline: 'none',
                      border: '1px solid rgba(167,139,250,0.30)',
                      background: 'rgba(167,139,250,0.07)',
                      color: '#a78bfa', transition: 'all 0.15s',
                    }}>↺</button>
                  <button
                    onClick={() => setRotation(r => (r + 1) % 4)}
                    title="Rotate 90° clockwise"
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', cursor: 'pointer',
                      borderRadius: '0 4px 4px 0', outline: 'none',
                      border: '1px solid rgba(167,139,250,0.30)', borderLeft: 'none',
                      background: 'rgba(167,139,250,0.07)',
                      color: '#a78bfa', transition: 'all 0.15s',
                    }}>↻</button>
                </div>
              </>
            )}
          </div>

          {/* Element highlight toggles — only in flat mode, only when elements exist */}
          {!isoMode && detectedElements.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#475569', fontWeight: 600, marginRight: 2 }}>HIGHLIGHT</span>
              {Object.entries(ELEMENT_STYLES).map(([type, style]) => {
                const count = elementCounts[type] || 0;
                if (count === 0) return null;
                const active = activeHighlights.has(type);
                return (
                  <button key={type} onClick={() => toggleHighlight(type)} style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 8px',
                    cursor: 'pointer', borderRadius: 12, outline: 'none',
                    border: `1px solid ${active ? style.border : 'rgba(255,255,255,0.08)'}`,
                    background: active ? style.bg : 'rgba(255,255,255,0.02)',
                    color: active ? style.color : '#475569',
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: active ? style.color : '#334155',
                      transition: 'background 0.15s',
                      flexShrink: 0,
                    }} />
                    {style.label}
                    <span style={{
                      fontSize: 8, opacity: 0.7,
                      background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                      borderRadius: 8, padding: '0 4px',
                    }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Viewer area — shared container for both flat and iso mode */}
          <div
            ref={viewContainerRef}
            onMouseDown={handleMouseDown}
            style={{
              position: 'relative',
              borderRadius: 8,
              overflow: 'hidden',
              height: 520,
              border: '1px solid rgba(56,189,248,0.15)',
              background: '#020c1b',
              cursor: isDragging ? 'grabbing' : ctrlHeld ? 'grab' : 'default',
              userSelect: 'none',
            }}
          >
            {/* Inner pan+zoom layer */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${cssZoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.05s ease-out',
              }}>
                {!isoMode ? (
                  // Flat blueprint canvas + highlight overlay
                  <div style={{ position: 'relative', display: 'block' }}>
                    <canvas
                      ref={displayCanvasRef}
                      style={{
                        display: 'block',
                        filter: 'invert(1) sepia(1) saturate(4) hue-rotate(178deg) brightness(0.92)',
                        maxWidth: 'none',
                      }}
                    />
                    {/* SVG overlay for element highlights */}
                    {activeHighlights.size > 0 && canvasDims.w > 0 && (
                      <svg
                        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                        width={canvasDims.w}
                        height={canvasDims.h}
                        viewBox={`0 0 ${canvasDims.w} ${canvasDims.h}`}
                      >
                        {detectedElements
                          .filter(el => activeHighlights.has(el.type))
                          .map((el, i) => {
                            const s = ELEMENT_STYLES[el.type];
                            return (
                              <rect
                                key={i}
                                x={el.x * scale}
                                y={el.y * scale}
                                width={Math.max(el.w * scale, 4)}
                                height={Math.max(el.h * scale, 4)}
                                fill={s.overlay}
                                stroke={s.color}
                                strokeWidth={1}
                                rx={2}
                              />
                            );
                          })}
                      </svg>
                    )}
                  </div>
                ) : isoDataUrl ? (
                  <BlueprintIsoCard
                    dataUrl={isoDataUrl}
                    imgW={isoImgSize.w}
                    imgH={isoImgSize.h}
                    cameraMode={cameraMode}
                    rotation={rotation}
                  />
                ) : null}
              </div>
            </div>

            {/* Zoom hint */}
            {cssZoom !== 1 && (
              <div style={{
                position: 'absolute', bottom: 8, right: 10,
                fontSize: 9, color: 'rgba(56,189,248,0.5)',
                pointerEvents: 'none',
              }}>
                {Math.round(cssZoom * 100)}%
              </div>
            )}
          </div>
        </>
      )}

      {!pdfDoc && !loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: '40px 20px',
          border: '1px dashed rgba(56,189,248,0.15)', borderRadius: 8,
        }}>
          <FileText size={28} color="rgba(56,189,248,0.25)" />
          <span style={{ fontSize: 11, color: '#475569' }}>Upload a PDF to view it in blueprint mode</span>
        </div>
      )}
    </div>
  );
}

// ─── References Modal ─────────────────────────────────────────────────────────

function ReferencesModal({ onClose, parsedOutputText }) {
  const [activeLevel,   setActiveLevel]   = useState(null);
  const [activeTier,    setActiveTier]    = useState(null);
  const [activeSection, setActiveSection] = useState('segmentation'); // 'segmentation' | 'ner'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 14, padding: '24px 28px', width: '100%', maxWidth: 720,
          maxHeight: '88vh', overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Network size={17} color="#38bdf8" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
            NLP Reference
          </span>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: 'rgba(56,189,248,0.12)', color: '#38bdf8',
            border: '1px solid rgba(56,189,248,0.25)', fontWeight: 600,
          }}>
            parsing · extraction
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'transparent', border: 'none',
              color: '#64748b', cursor: 'pointer', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center', transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Section pill nav ── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 20,
          padding: '4px', borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          width: 'fit-content',
        }}>
          {[
            { id: 'segmentation', label: 'Segmentation Hierarchy', icon: Network },
            { id: 'ner',          label: 'Entity Extraction Primer', icon: Tag    },
            { id: 'visual',       label: 'Visual',                   icon: Layers },
            { id: 'viewer',       label: 'Blueprint Viewer',          icon: FileText },
          ].map(({ id, label, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <button key={id} onClick={() => setActiveSection(id)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 6, border: 'none',
                background: active ? 'rgba(56,189,248,0.15)' : 'transparent',
                color: active ? '#38bdf8' : '#64748b',
                fontSize: 11, fontWeight: active ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.15s',
                outline: active ? '1px solid rgba(56,189,248,0.30)' : 'none',
              }}>
                <Icon size={11} />
                {label}
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════
            SECTION A — Segmentation Hierarchy
        ══════════════════════════════════════════════ */}
        {activeSection === 'segmentation' && (
          <>
            <p style={{
              fontSize: 12, color: '#64748b', lineHeight: 1.6,
              margin: '0 0 20px', padding: '10px 14px',
              background: 'rgba(255,255,255,0.02)', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              Parsed text can be decomposed into progressively finer units. The granularity you choose
              determines the context window available to entity extraction models.{' '}
              <span style={{ color: '#94a3b8' }}>Click any level to expand its details.</span>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {HIERARCHY.map((level, i) => {
                const isActive = activeLevel === level.id;
                const Icon = level.icon;
                const indent = i * 18;
                return (
                  <div key={level.id}>
                    {i > 0 && (
                      <div style={{ marginLeft: indent + 8, width: 1, height: 10, background: 'rgba(255,255,255,0.07)' }} />
                    )}
                    <div style={{ marginLeft: indent, display: 'flex', alignItems: 'flex-start', gap: 0 }}>
                      {i > 0 && (
                        <div style={{
                          width: 14, height: 20, flexShrink: 0,
                          borderLeft: '1px solid rgba(255,255,255,0.07)',
                          borderBottom: '1px solid rgba(255,255,255,0.07)',
                          borderBottomLeftRadius: 3, marginTop: 2, marginRight: 4,
                        }} />
                      )}
                      <button
                        onClick={() => setActiveLevel(isActive ? null : level.id)}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                          border: `1px solid ${isActive ? level.color + '40' : 'rgba(255,255,255,0.06)'}`,
                          background: isActive ? `color-mix(in srgb, ${level.color} 8%, transparent)` : 'rgba(255,255,255,0.02)',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = `${level.color}28`; } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; } }}
                      >
                        <Icon size={14} color={level.color} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{level.label}</span>
                        {level.badge && (
                          <span style={{
                            fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
                            background: `${level.badgeColor}18`, color: level.badgeColor,
                            border: `1px solid ${level.badgeColor}28`,
                            textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 2,
                          }}>{level.badge}</span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#475569', display: 'inline-block', transform: isActive ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                      </button>
                    </div>
                    {isActive && (
                      <div style={{
                        marginLeft: indent + (i > 0 ? 32 : 0),
                        marginTop: 6, marginBottom: 4,
                        padding: '10px 14px', borderRadius: 8,
                        background: `color-mix(in srgb, ${level.color} 4%, #0f172a)`,
                        border: `1px solid ${level.color}22`, borderLeft: `3px solid ${level.color}60`,
                      }}>
                        <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 8px' }}>{level.desc}</p>
                        {level.how && (
                          <div style={{ fontSize: 11, color: level.color, fontFamily: 'monospace', padding: '4px 8px', borderRadius: 5, background: `${level.color}0c` }}>
                            → {level.how}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 22, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)',
              fontSize: 11, color: '#94a3b8', lineHeight: 1.6,
            }}>
              <span style={{ color: '#fbbf24', fontWeight: 600 }}>Recommended: </span>
              Run NER at the <span style={{ color: '#fbbf24', fontWeight: 600 }}>sentence level</span> within
              each detected section. This gives models enough context for disambiguation while keeping
              results anchored to a specific part of the document.
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════
            SECTION B — Entity Extraction Primer
        ══════════════════════════════════════════════ */}
        {activeSection === 'ner' && (
          <>
            {/* Intro */}
            <p style={{
              fontSize: 12, color: '#64748b', lineHeight: 1.6,
              margin: '0 0 20px', padding: '10px 14px',
              background: 'rgba(255,255,255,0.02)', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              Entity extraction (NER) identifies and classifies spans of text into categories.
              There are three tiers of approaches — click any tier to expand it.
            </p>

            {/* ── Three tiers ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22 }}>
              {NER_TIERS.map((tier, i) => {
                const isActive = activeTier === tier.id;
                const Icon = tier.icon;
                return (
                  <div key={tier.id}>
                    <button
                      onClick={() => setActiveTier(isActive ? null : tier.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${isActive ? tier.color + '40' : 'rgba(255,255,255,0.06)'}`,
                        background: isActive ? `color-mix(in srgb, ${tier.color} 8%, transparent)` : 'rgba(255,255,255,0.02)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = `${tier.color}28`; } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; } }}
                    >
                      <span style={{
                        fontSize: 9, fontWeight: 800, color: tier.color,
                        width: 16, textAlign: 'center', flexShrink: 0,
                      }}>{i + 1}</span>
                      <Icon size={14} color={tier.color} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{tier.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 9, color: '#475569', display: 'inline-block', transform: isActive ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                    </button>
                    {isActive && (
                      <div style={{
                        marginTop: 4, marginLeft: 8,
                        padding: '10px 14px', borderRadius: 8,
                        background: `color-mix(in srgb, ${tier.color} 4%, #0f172a)`,
                        border: `1px solid ${tier.color}22`, borderLeft: `3px solid ${tier.color}60`,
                      }}>
                        {tier.bullets.map((b, bi) => (
                          <div key={bi} style={{ display: 'flex', gap: 8, marginBottom: bi < tier.bullets.length - 1 ? 6 : 0 }}>
                            <span style={{ color: tier.color, flexShrink: 0, marginTop: 1 }}>·</span>
                            <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{b}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── What gets extracted ── */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                What gets extracted
              </div>

              {/* Standard types */}
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Standard NER types</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 14 }}>
                {STANDARD_TYPES.map(({ type, example, color }) => (
                  <div key={type} style={{
                    display: 'flex', alignItems: 'baseline', gap: 10,
                    padding: '5px 10px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      color, minWidth: 90,
                      padding: '1px 6px', borderRadius: 4,
                      background: `${color}12`, border: `1px solid ${color}25`,
                    }}>{type}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{example}</span>
                  </div>
                ))}
              </div>

              {/* Domain-specific types */}
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
                Domain-specific types
                <span style={{ fontSize: 9, color: '#475569', fontWeight: 400, marginLeft: 6 }}>require custom models or LLM prompts</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {DOMAIN_TYPES.map(({ type, example, color }) => (
                  <div key={type} style={{
                    display: 'flex', alignItems: 'baseline', gap: 10,
                    padding: '5px 10px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      color, minWidth: 90,
                      padding: '1px 6px', borderRadius: 4,
                      background: `${color}12`, border: `1px solid ${color}25`,
                    }}>{type}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{example}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Architecture ── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Architecture for this app
              </div>

              {/* Flow diagram */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                padding: '14px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                overflowX: 'auto', marginBottom: 12,
              }}>
                {[
                  { label: 'Parsed text',       sub: 'output pane',         color: '#38bdf8' },
                  { label: 'Segmenter',          sub: 'sentence-level',      color: '#fbbf24' },
                  { label: 'Entity Extractor',   sub: 'spaCy / GLiNER / LLM',color: '#a78bfa' },
                  { label: 'Structured output',  sub: 'typed entities',      color: '#34d399' },
                ].map((node, ni, arr) => (
                  <div key={ni} style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '8px 12px', borderRadius: 8, minWidth: 110,
                      background: `${node.color}0e`, border: `1px solid ${node.color}30`,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: node.color }}>{node.label}</span>
                      <span style={{ fontSize: 9, color: '#475569' }}>{node.sub}</span>
                    </div>
                    {ni < arr.length - 1 && (
                      <ArrowRight size={14} color="#334155" style={{ margin: '0 4px', flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>

              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)',
                fontSize: 11, color: '#94a3b8', lineHeight: 1.6,
              }}>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>Sentence level is the sweet spot — </span>
                paragraphs are too coarse (entities lose positional precision), tokens are too fine (no context).
                Sentences give enough context for disambiguation while keeping results granular.
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════
            SECTION C — Segmentation Visual
        ══════════════════════════════════════════════ */}
        {activeSection === 'visual' && (
          <>
            <p style={{
              fontSize: 12, color: '#64748b', lineHeight: 1.6,
              margin: '0 0 18px', padding: '10px 14px',
              background: 'rgba(255,255,255,0.02)', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              Illustrative view of how a document is nested into progressively finer units.
              Each color represents one level of the hierarchy — hover over the legend to identify them.
              The content is fictional and exists only to show the nesting structure.
            </p>
            <SegmentationViz parsedOutputText={parsedOutputText} />
          </>
        )}

        {activeSection === 'viewer' && (
          <BlueprintPdfViewer />
        )}
      </div>
    </div>
  );
}

// ─── SubTabBar ────────────────────────────────────────────────────────────────

function SubTabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 2, alignItems: 'center',
      padding: '6px 8px 6px',
      background: 'rgba(255,255,255,0.015)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
    }}>
      {tabs.map(({ id, label, icon: Icon, modal }) => {
        const isActive = !modal && active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 11px', borderRadius: 6,
              border: isActive ? '1px solid rgba(56,189,248,0.30)' : '1px solid transparent',
              background: isActive ? 'rgba(56,189,248,0.13)' : 'transparent',
              color: isActive ? '#38bdf8' : '#64748b',
              fontSize: 11, fontWeight: isActive ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.color = '#94a3b8';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            {Icon && <Icon size={11} />}
            {label}
            {modal && (
              <span style={{
                fontSize: 8, padding: '1px 5px', borderRadius: 8,
                background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
                border: '1px solid rgba(167,139,250,0.25)',
                fontWeight: 700, letterSpacing: '0.04em',
              }}>
                ref
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── ParsingTab ───────────────────────────────────────────────────────────────

export default function ParsingTab({ papers, onPapersChange, onNavigate }) {
  const [activeSubtab, setActiveSubtab]   = useState('bench');
  const [showRefsModal, setShowRefsModal] = useState(false);
  const [parsedOutputText, setParsedOutputText] = useState(null);

  const handleOutputChange = useCallback((text) => {
    setParsedOutputText(text);
  }, []);

  function handleSubtabChange(id) {
    const tab = SUBTABS.find(t => t.id === id);
    if (tab?.modal) {
      setShowRefsModal(true);
    } else {
      setActiveSubtab(id);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Subtab bar ── */}
      <SubTabBar
        tabs={SUBTABS}
        active={activeSubtab}
        onChange={handleSubtabChange}
      />

      {/* ── Content ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeSubtab === 'bench' && (
          <IngestionPipelineTab
            papers={papers}
            onPapersChange={onPapersChange}
            onNavigate={onNavigate}
            mode="parsing"
            onOutputChange={handleOutputChange}
          />
        )}
      </div>

      {/* ── References modal ── */}
      {showRefsModal && (
        <ReferencesModal onClose={() => setShowRefsModal(false)} parsedOutputText={parsedOutputText} />
      )}
    </div>
  );
}
