'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import type {
  AgentClassification,
  AgentInsight,
  ExamReadiness,
  ImportantDetail,
  KeyTerm,
  ProcessRecordingInput,
  ProcessRecordingResult,
  Recording,
  RecordingNotes,
  TranscriptDiagnostics,
  TranscriptQuality,
} from '@/types/recordings'

// ── Constants ─────────────────────────────────────────────────────────────────

const ANALYSIS_MODEL = 'gpt-4o-mini'
const CHUNK_TARGET_WORDS = 900
const MAX_CHUNKS = 8

// ── Stage B: Content classification ──────────────────────────────────────────

const CLASSIFICATION_SYSTEM_PROMPT = `You are a content classifier for a student study app.
Determine the type of audio content and its study relevance.
Rules: be honest — do not classify general conversations as lectures.
If in doubt, choose the lower study_relevance.
Keep your reason under 80 characters.`

const CLASSIFICATION_SCHEMA = {
  type: 'object' as const,
  required: ['content_type', 'study_relevance', 'confidence_score', 'reason', 'recommended_action'],
  additionalProperties: false,
  properties: {
    content_type: {
      type: 'string',
      enum: ['lecture', 'class_explanation', 'meeting', 'interview', 'podcast', 'personal_note', 'random_audio', 'unclear'],
    },
    study_relevance: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
    confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string' },
    recommended_action: {
      type: 'string',
      enum: ['create_study_notes', 'record_longer_sample', 'save_as_general_note', 'ignore_or_delete', 'send_to_study_agent_later'],
    },
  },
}

// ── Stage D: Per-chunk extraction ─────────────────────────────────────────────

const CHUNK_SYSTEM_PROMPT = `You extract study facts from a short lecture segment.

Rules:
- Only use information explicitly in this chunk. Do not invent.
- Evidence must be a direct quote or close paraphrase (under 80 characters).
- No markdown fences, no triple backticks, no unescaped quotes inside strings.
- Keep all strings concise — no long paragraphs.
- If a term appears but is not defined: write "mentioned but not defined".

Limits: key_terms max 3, important_details max 4, definitions max 3,
examples max 2, possible_exam_questions max 2, flashcard_seed_items max 3,
unclear_parts max 2, common_mistakes max 1, code_examples max 1.`

const CHUNK_SCHEMA = {
  type: 'object' as const,
  required: [
    'key_terms', 'important_details', 'definitions', 'examples',
    'possible_exam_questions', 'flashcard_seed_items', 'unclear_parts',
    'common_mistakes', 'code_examples',
  ],
  additionalProperties: false,
  properties: {
    key_terms: {
      type: 'array',
      items: {
        type: 'object',
        required: ['term', 'definition', 'importance_score', 'evidence'],
        additionalProperties: false,
        properties: {
          term: { type: 'string' },
          definition: { type: 'string' },
          importance_score: { type: 'integer', minimum: 1, maximum: 5 },
          evidence: { type: 'string' },
        },
      },
    },
    important_details: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'explanation', 'evidence', 'type'],
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          explanation: { type: 'string' },
          evidence: { type: 'string' },
          type: {
            type: 'string',
            enum: ['definition', 'example', 'warning', 'exam_hint', 'process', 'formula', 'concept', 'action_item'],
          },
        },
      },
    },
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['term', 'definition'],
        additionalProperties: false,
        properties: { term: { type: 'string' }, definition: { type: 'string' } },
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description', 'context'],
        additionalProperties: false,
        properties: { description: { type: 'string' }, context: { type: 'string' } },
      },
    },
    possible_exam_questions: { type: 'array', items: { type: 'string' } },
    flashcard_seed_items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['front', 'back'],
        additionalProperties: false,
        properties: { front: { type: 'string' }, back: { type: 'string' } },
      },
    },
    unclear_parts: { type: 'array', items: { type: 'string' } },
    common_mistakes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['mistake', 'correction'],
        additionalProperties: false,
        properties: { mistake: { type: 'string' }, correction: { type: 'string' } },
      },
    },
    code_examples: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'language', 'description'],
        additionalProperties: false,
        properties: { code: { type: 'string' }, language: { type: 'string' }, description: { type: 'string' } },
      },
    },
  },
}

// ── Stage F: Final notes synthesis ────────────────────────────────────────────

const SYNTHESIS_SYSTEM_PROMPT = `You write structured study notes from extracted lecture facts.
Rules: use ONLY the facts provided — do NOT invent new terms, questions, or examples.
Keep sections concise (1-3 sentences each). No markdown fences, no unescaped quotes.`

const SYNTHESIS_SCHEMA = {
  type: 'object' as const,
  required: ['summary', 'key_points', 'sections', 'concepts_detected', 'exam_readiness', 'unclear_or_low_confidence_parts'],
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['heading', 'content'],
        additionalProperties: false,
        properties: { heading: { type: 'string' }, content: { type: 'string' } },
      },
    },
    concepts_detected: { type: 'array', items: { type: 'string' } },
    exam_readiness: { type: 'string', enum: ['high', 'medium', 'low', 'insufficient'] },
    unclear_or_low_confidence_parts: { type: 'array', items: { type: 'string' } },
  },
}

// ── Minimal fallback schema (existing, retained as last safety net) ────────────

const FALLBACK_SYSTEM_PROMPT = `You are a transcript summariser. Rules:
- Only use information in the transcript. Do not invent anything.
- Keep all strings short and clean: no markdown, no backticks, no unescaped quotes.
- If the transcript is too short or unclear, say so in unclear_or_low_confidence_parts.`

const FALLBACK_SCHEMA = {
  type: 'object' as const,
  required: ['summary', 'key_points', 'sections', 'unclear_or_low_confidence_parts', 'agent_classification', 'exam_readiness'],
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    key_points: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['heading', 'content'],
        additionalProperties: false,
        properties: { heading: { type: 'string' }, content: { type: 'string' } },
      },
    },
    unclear_or_low_confidence_parts: { type: 'array', items: { type: 'string' } },
    agent_classification: {
      type: 'object',
      required: ['content_type', 'study_relevance', 'confidence_score', 'reason', 'recommended_action'],
      additionalProperties: false,
      properties: {
        content_type: {
          type: 'string',
          enum: ['lecture', 'class_explanation', 'meeting', 'interview', 'podcast', 'personal_note', 'random_audio', 'unclear'],
        },
        study_relevance: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
        reason: { type: 'string' },
        recommended_action: {
          type: 'string',
          enum: ['create_study_notes', 'record_longer_sample', 'save_as_general_note', 'ignore_or_delete', 'send_to_study_agent_later'],
        },
      },
    },
    exam_readiness: { type: 'string', enum: ['high', 'medium', 'low', 'insufficient'] },
  },
}

// ── Local types ───────────────────────────────────────────────────────────────

type ClassificationOutput = AgentClassification

type TranscriptChunk = {
  text: string
  chunkIndex: number
  wordCount: number
  isPartial: boolean  // true if this chunk was cut off due to MAX_CHUNKS limit
}

type ChunkResult = {
  key_terms: { term: string; definition: string; importance_score: number; evidence: string }[]
  important_details: { title: string; explanation: string; evidence: string; type: ImportantDetail['type'] }[]
  definitions: { term: string; definition: string }[]
  examples: { description: string; context: string }[]
  possible_exam_questions: string[]
  flashcard_seed_items: { front: string; back: string }[]
  unclear_parts: string[]
  common_mistakes: { mistake: string; correction: string }[]
  code_examples: { code: string; language: string; description: string }[]
}

type MergedExtraction = ChunkResult  // same shape after merge

type SynthesisOutput = {
  summary: string
  key_points: string[]
  sections: { heading: string; content: string }[]
  concepts_detected: string[]
  exam_readiness: ExamReadiness
  unclear_or_low_confidence_parts: string[]
}

type FallbackOutput = {
  summary: string
  key_points: string[]
  sections: { heading: string; content: string }[]
  unclear_or_low_confidence_parts: string[]
  agent_classification: AgentClassification
  exam_readiness: ExamReadiness
}

type AnalysisOutput = {
  key_terms: KeyTerm[]
  important_details: ImportantDetail[]
  notes: RecordingNotes & { agent_classification: AgentClassification; exam_readiness: ExamReadiness }
  summary: string
  agent_insight: AgentInsight
}

type TranscriptAnalysisResult = {
  output: AnalysisOutput | null
  diagnostics: TranscriptDiagnostics
  mode: 'full' | 'fallback' | 'failed'
  rawError?: string
}

// ── Diagnostic helpers ────────────────────────────────────────────────────────

function computeTranscriptDiagnostics(
  transcript: string,
  segments: { start: number; text: string }[] | null,
  durationSeconds: number,
): TranscriptDiagnostics {
  const wordCount = transcript.split(/\s+/).filter(Boolean).length
  const segCount = segments?.length ?? 0
  const wpm = durationSeconds > 0 ? Math.round((wordCount / durationSeconds) * 60) : 0

  let quality: TranscriptQuality
  let qualityReason: string

  if (wordCount < 50) {
    quality = 'too_short'
    qualityReason = `Only ${wordCount} words transcribed — too short to extract reliable study material. Try recording at least 2 minutes of clear audio.`
  } else if (durationSeconds >= 60 && wpm < 30) {
    quality = 'weak'
    qualityReason = `${wordCount} words in a ${Math.round(durationSeconds)}s recording (${wpm} wpm). Expected 100–150 wpm for normal speech. The recording may not have captured audio clearly — try recording closer to the source.`
  } else if (wpm >= 60 && wordCount >= 200) {
    quality = 'good'
    qualityReason = `${wordCount} words at ~${wpm} wpm — sufficient for detailed analysis.`
  } else {
    quality = 'unclear'
    qualityReason = `${wordCount} words at ~${wpm} wpm — may yield partial notes only. More audio would improve coverage.`
  }

  return {
    transcript_word_count: wordCount,
    segment_count: segCount,
    duration_seconds: durationSeconds,
    words_per_minute: wpm,
    transcript_quality: quality,
    quality_reason: qualityReason,
  }
}

function formatTranscriptWithTimestamps(
  fullText: string,
  segments: { start: number; text: string }[],
): string {
  if (!segments || segments.length === 0) return fullText
  return segments
    .map(seg => {
      const mins = Math.floor(seg.start / 60)
      const secs = Math.floor(seg.start % 60)
      return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}] ${seg.text.trim()}`
    })
    .join('\n')
}

// ── Stage B: Classification ───────────────────────────────────────────────────

function buildClassificationPrompt(title: string, subject: string, sample: string): string {
  return `Classify the following audio transcript sample.

TITLE: ${title}
SUBJECT: ${subject || 'Not specified'}

TRANSCRIPT SAMPLE:
${sample}

Classify: what type of audio is this, and how study-relevant is it for a student?`
}

async function runClassification(
  openai: OpenAI,
  title: string,
  subject: string | null,
  transcript: string,
): Promise<ClassificationOutput | null> {
  // Use first ~1200 chars — enough to determine content type without large token cost
  const sample = transcript.slice(0, 1200)

  try {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'content_classification', strict: true, schema: CLASSIFICATION_SCHEMA as Record<string, unknown> },
      },
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: buildClassificationPrompt(title, subject ?? '', sample) },
      ],
    })

    const choice = completion.choices[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) return null
    const raw = choice?.message?.content ?? ''
    if (!raw) return null

    return JSON.parse(raw) as ClassificationOutput
  } catch (err) {
    console.error('[recorder] classification_failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

// ── Stage C: Chunking ────────────────────────────────────────────────────────

function chunkTranscript(
  transcript: string,
  segments: { start: number; text: string }[],
): { chunks: TranscriptChunk[]; truncated: boolean } {
  if (segments && segments.length > 0) {
    return chunkBySegments(segments)
  }
  return chunkByWords(transcript)
}

function chunkBySegments(
  segments: { start: number; text: string }[],
): { chunks: TranscriptChunk[]; truncated: boolean } {
  const chunks: TranscriptChunk[] = []
  let currentSegs: typeof segments = []
  let currentWords = 0

  for (const seg of segments) {
    const segWords = seg.text.split(/\s+/).filter(Boolean).length
    currentSegs.push(seg)
    currentWords += segWords

    if (currentWords >= CHUNK_TARGET_WORDS) {
      chunks.push({
        text: formatTranscriptWithTimestamps('', currentSegs),
        chunkIndex: chunks.length,
        wordCount: currentWords,
        isPartial: false,
      })
      currentSegs = []
      currentWords = 0
      if (chunks.length >= MAX_CHUNKS) break
    }
  }

  // Flush remaining segments
  if (currentSegs.length > 0 && chunks.length < MAX_CHUNKS) {
    chunks.push({
      text: formatTranscriptWithTimestamps('', currentSegs),
      chunkIndex: chunks.length,
      wordCount: currentWords,
      isPartial: false,
    })
  }

  const truncated = segments.reduce((sum, s) => sum + s.text.split(/\s+/).filter(Boolean).length, 0) > MAX_CHUNKS * CHUNK_TARGET_WORDS
  if (truncated && chunks.length > 0) {
    chunks[chunks.length - 1] = { ...chunks[chunks.length - 1], isPartial: true }
  }

  return { chunks, truncated }
}

function chunkByWords(transcript: string): { chunks: TranscriptChunk[]; truncated: boolean } {
  const words = transcript.split(/\s+/).filter(Boolean)
  const chunks: TranscriptChunk[] = []

  for (let i = 0; i < words.length && chunks.length < MAX_CHUNKS; i += CHUNK_TARGET_WORDS) {
    const slice = words.slice(i, i + CHUNK_TARGET_WORDS)
    chunks.push({
      text: slice.join(' '),
      chunkIndex: chunks.length,
      wordCount: slice.length,
      isPartial: i + CHUNK_TARGET_WORDS < words.length && chunks.length === MAX_CHUNKS - 1,
    })
  }

  return { chunks, truncated: words.length > MAX_CHUNKS * CHUNK_TARGET_WORDS }
}

// ── Stage D: Per-chunk extraction ────────────────────────────────────────────

function buildChunkPrompt(chunk: TranscriptChunk, totalChunks: number, title: string): string {
  return `Extract study facts from this lecture segment (chunk ${chunk.chunkIndex + 1} of ${totalChunks}).
Recording: "${title}"

${chunk.text}

Extract all terms defined, facts stated, examples given, and exam-relevant content.
Only use what is in this segment. Do not invent or add background knowledge.`
}

async function runChunkExtraction(
  openai: OpenAI,
  chunk: TranscriptChunk,
  totalChunks: number,
  title: string,
): Promise<ChunkResult | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'chunk_extraction', strict: true, schema: CHUNK_SCHEMA as Record<string, unknown> },
      },
      temperature: 0.2,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: CHUNK_SYSTEM_PROMPT },
        { role: 'user', content: buildChunkPrompt(chunk, totalChunks, title) },
      ],
    })

    const choice = completion.choices[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) return null
    const raw = choice?.message?.content ?? ''
    if (!raw) return null

    return JSON.parse(raw) as ChunkResult
  } catch (err) {
    console.error(`[recorder] chunk_analysis_failed chunk:${chunk.chunkIndex}:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

// ── Stage E: Merge and deduplicate ───────────────────────────────────────────

function mergeChunkResults(results: ChunkResult[]): MergedExtraction {
  // Key terms: deduplicate by normalised name, keep highest importance
  const termMap = new Map<string, ChunkResult['key_terms'][number]>()
  for (const r of results) {
    for (const kt of r.key_terms) {
      const key = kt.term.toLowerCase().trim()
      const ex = termMap.get(key)
      if (!ex || kt.importance_score > ex.importance_score) termMap.set(key, kt)
    }
  }
  const key_terms = Array.from(termMap.values())
    .sort((a, b) => b.importance_score - a.importance_score)
    .slice(0, 10)

  // Important details: deduplicate by normalised title
  const detailMap = new Map<string, ChunkResult['important_details'][number]>()
  for (const r of results) {
    for (const d of r.important_details) {
      const key = d.title.toLowerCase().trim()
      if (!detailMap.has(key)) detailMap.set(key, d)
    }
  }
  const important_details = Array.from(detailMap.values()).slice(0, 10)

  // Definitions: deduplicate by term
  const defMap = new Map<string, ChunkResult['definitions'][number]>()
  for (const r of results) {
    for (const d of r.definitions) {
      const key = d.term.toLowerCase().trim()
      if (!defMap.has(key)) defMap.set(key, d)
    }
  }
  const definitions = Array.from(defMap.values()).slice(0, 10)

  // Examples: collect all, dedup by description prefix
  const exSet = new Set<string>()
  const examples: ChunkResult['examples'] = []
  for (const r of results) {
    for (const ex of r.examples) {
      const key = ex.description.slice(0, 40).toLowerCase()
      if (!exSet.has(key) && examples.length < 8) { exSet.add(key); examples.push(ex) }
    }
  }

  // Exam questions: deduplicate
  const qSet = new Set<string>()
  const possible_exam_questions: string[] = []
  for (const r of results) {
    for (const q of r.possible_exam_questions) {
      const key = q.toLowerCase().trim()
      if (!qSet.has(key) && possible_exam_questions.length < 8) { qSet.add(key); possible_exam_questions.push(q) }
    }
  }

  // Flashcards: deduplicate by front
  const fcMap = new Map<string, ChunkResult['flashcard_seed_items'][number]>()
  for (const r of results) {
    for (const fc of r.flashcard_seed_items) {
      const key = fc.front.toLowerCase().trim()
      if (!fcMap.has(key)) fcMap.set(key, fc)
    }
  }
  const flashcard_seed_items = Array.from(fcMap.values()).slice(0, 10)

  // Unclear parts
  const unclear_parts = results.flatMap(r => r.unclear_parts).slice(0, 8)

  // Common mistakes: deduplicate by mistake
  const mistakeMap = new Map<string, ChunkResult['common_mistakes'][number]>()
  for (const r of results) {
    for (const m of r.common_mistakes) {
      const key = m.mistake.toLowerCase().trim()
      if (!mistakeMap.has(key)) mistakeMap.set(key, m)
    }
  }
  const common_mistakes = Array.from(mistakeMap.values()).slice(0, 6)

  // Code examples
  const code_examples = results.flatMap(r => r.code_examples).slice(0, 3)

  return {
    key_terms,
    important_details,
    definitions,
    examples,
    possible_exam_questions,
    flashcard_seed_items,
    unclear_parts,
    common_mistakes,
    code_examples,
  }
}

// ── Stage F: Final synthesis ─────────────────────────────────────────────────

function buildSynthesisPrompt(
  title: string,
  subject: string,
  merged: MergedExtraction,
  classification: ClassificationOutput,
  diagnostics: TranscriptDiagnostics,
): string {
  const termList = merged.key_terms.length > 0
    ? merged.key_terms.map(kt => `- ${kt.term}: ${kt.definition} (importance: ${kt.importance_score}/5)`).join('\n')
    : '(none extracted)'

  const detailList = merged.important_details.length > 0
    ? merged.important_details.map(d => `- [${d.type}] ${d.title}: ${d.explanation}`).join('\n')
    : '(none extracted)'

  const questionList = merged.possible_exam_questions.length > 0
    ? merged.possible_exam_questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
    : '(none extracted)'

  const unclearList = merged.unclear_parts.length > 0
    ? merged.unclear_parts.join('\n- ')
    : 'None'

  return `Write structured study notes from the facts extracted from a lecture.

RECORDING: "${title}"
SUBJECT: ${subject || 'Not specified'}
CONTENT TYPE: ${classification.content_type} | STUDY RELEVANCE: ${classification.study_relevance}
TRANSCRIPT: ~${diagnostics.transcript_word_count} words, quality: ${diagnostics.transcript_quality}

KEY TERMS EXTRACTED:
${termList}

IMPORTANT DETAILS:
${detailList}

EXAM QUESTIONS GENERATED:
${questionList}

UNCLEAR AREAS FROM TRANSCRIPT:
${unclearList}

Write:
1. summary: 2-3 sentences on the main teaching objective and takeaways.
2. key_points: 4-8 short factual statements from the extracted content.
3. sections: group the content into 2-4 logical topic sections (heading + 1-3 sentence content).
4. concepts_detected: flat list of all concept names found.
5. exam_readiness: "high" if 4+ key terms and 4+ questions and academic; "medium" if gaps; "low" if minimal; "insufficient" if non-academic or empty.
6. unclear_or_low_confidence_parts: additional gaps or uncertainties.

Use ONLY the facts above. Do NOT invent new terms, questions, or examples.`
}

async function runSynthesis(
  openai: OpenAI,
  merged: MergedExtraction,
  classification: ClassificationOutput,
  diagnostics: TranscriptDiagnostics,
  title: string,
  subject: string | null,
): Promise<SynthesisOutput | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'notes_synthesis', strict: true, schema: SYNTHESIS_SCHEMA as Record<string, unknown> },
      },
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
        { role: 'user', content: buildSynthesisPrompt(title, subject ?? '', merged, classification, diagnostics) },
      ],
    })

    const choice = completion.choices[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) {
      console.error('[recorder] synthesis_failed: output truncated or refused')
      return null
    }
    const raw = choice?.message?.content ?? ''
    if (!raw) return null

    return JSON.parse(raw) as SynthesisOutput
  } catch (err) {
    console.error('[recorder] synthesis_failed:', err instanceof Error ? err.message : String(err))
    return null
  }
}

// ── Assembly: combine staged results into AnalysisOutput ──────────────────────

function buildRecommendedNext(classification: ClassificationOutput, examReadiness: ExamReadiness): string {
  if (examReadiness === 'high') return 'Review key terms and send to Study Agent when ready.'
  if (examReadiness === 'medium') return 'Review notes and consider recording more sessions on this topic.'
  if (classification.study_relevance === 'high') return 'Record a clearer or longer session for better extraction.'
  if (classification.study_relevance === 'low' || classification.study_relevance === 'none') {
    return 'This recording is not study material — no further action needed.'
  }
  return 'Review the transcript and retry analysis if needed.'
}

function assembleFromStagedAnalysis(
  merged: MergedExtraction,
  synthesis: SynthesisOutput,
  classification: ClassificationOutput,
  title: string,
): AnalysisOutput {
  const key_terms: KeyTerm[] = merged.key_terms.map(kt => ({
    term: kt.term,
    definition: kt.definition,
    importance_score: kt.importance_score,
    evidence: kt.evidence,
    related_terms: [],
  }))

  const important_details: ImportantDetail[] = merged.important_details.map(d => ({
    title: d.title,
    explanation: d.explanation,
    why_it_matters: '',
    evidence: d.evidence,
    type: d.type,
  }))

  const agent_insight: AgentInsight = {
    key_terms_found: key_terms.length,
    exam_relevant_count: merged.important_details.filter(d => d.type === 'exam_hint').length,
    unclear_count: synthesis.unclear_or_low_confidence_parts.length + merged.unclear_parts.length,
    recommended_next: buildRecommendedNext(classification, synthesis.exam_readiness),
  }

  const notes = {
    title,
    summary: synthesis.summary,
    key_points: synthesis.key_points,
    sections: synthesis.sections,
    definitions: merged.definitions,
    examples: merged.examples,
    formulas: [],
    common_mistakes: merged.common_mistakes,
    code_examples: merged.code_examples,
    possible_exam_questions: merged.possible_exam_questions,
    flashcard_seed_items: merged.flashcard_seed_items,
    concepts_detected: synthesis.concepts_detected,
    unclear_or_low_confidence_parts: [
      ...synthesis.unclear_or_low_confidence_parts,
      ...merged.unclear_parts,
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8),
    exam_readiness: synthesis.exam_readiness,
    agent_classification: classification,
  } as RecordingNotes & { agent_classification: AgentClassification; exam_readiness: ExamReadiness }

  return {
    key_terms,
    important_details,
    notes,
    summary: synthesis.summary,
    agent_insight,
  }
}

// ── Fallback: minimal analysis (last safety net) ──────────────────────────────

function buildFallbackPrompt(
  title: string,
  subject: string,
  transcript: string,
  diagnostics: TranscriptDiagnostics,
): string {
  const snippet = transcript.length > 3000
    ? transcript.slice(0, 3000) + ' ...[trimmed for length]'
    : transcript

  return `Summarise the following transcript. Be brief and grounded.

TITLE: ${title}
SUBJECT: ${subject || 'Not specified'}
WORD COUNT: ~${diagnostics.transcript_word_count} words

TRANSCRIPT:
${snippet}

Tasks:
1. Write a 2-3 sentence summary of what was said.
2. List up to 5 key points (short, factual, only from the transcript).
3. Break into up to 3 sections with short headings and 1-2 sentence content.
4. List anything unclear or inaudible.
5. Classify content type and study relevance honestly.
6. Set exam_readiness to "insufficient" if not academic or fewer than 50 words.

Do NOT invent. Only use what is in the transcript.`
}

function fallbackToAnalysisOutput(fb: FallbackOutput, title: string): AnalysisOutput {
  return {
    key_terms: [],
    important_details: [],
    summary: fb.summary,
    agent_insight: {
      key_terms_found: 0,
      exam_relevant_count: 0,
      unclear_count: fb.unclear_or_low_confidence_parts.length,
      recommended_next: 'Basic notes generated. Record clearer or longer audio for full term extraction.',
    },
    notes: {
      title,
      summary: fb.summary,
      key_points: fb.key_points,
      sections: fb.sections,
      definitions: [],
      examples: [],
      formulas: [],
      common_mistakes: [],
      code_examples: [],
      possible_exam_questions: [],
      flashcard_seed_items: [],
      concepts_detected: [],
      unclear_or_low_confidence_parts: fb.unclear_or_low_confidence_parts,
      exam_readiness: fb.exam_readiness,
      agent_classification: fb.agent_classification,
    } as RecordingNotes & { agent_classification: AgentClassification; exam_readiness: ExamReadiness },
  }
}

async function runFallbackAnalysis(
  openai: OpenAI,
  title: string,
  subject: string | null,
  transcript: string,
  diagnostics: TranscriptDiagnostics,
): Promise<{ output: AnalysisOutput | null; rawError?: string }> {
  try {
    const completion = await openai.chat.completions.create({
      model: ANALYSIS_MODEL,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'lecture_analysis_fallback', strict: true, schema: FALLBACK_SCHEMA as Record<string, unknown> },
      },
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: FALLBACK_SYSTEM_PROMPT },
        { role: 'user', content: buildFallbackPrompt(title, subject ?? '', transcript, diagnostics) },
      ],
    })

    const choice = completion.choices[0]
    if (choice?.finish_reason === 'length' || choice?.message?.refusal) {
      return { output: null, rawError: 'fallback_truncated_or_refused' }
    }
    const raw = choice?.message?.content ?? ''
    if (!raw) return { output: null, rawError: 'fallback_empty_response' }

    const fb = JSON.parse(raw) as FallbackOutput
    return { output: fallbackToAnalysisOutput(fb, title) }
  } catch (err) {
    console.error('[recorder] fallback_analysis_failed:', err instanceof Error ? err.message : String(err))
    return { output: null, rawError: err instanceof Error ? err.message : String(err) }
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Staged analysis pipeline:
 * B (classify) → C (chunk) → D (extract per-chunk) → E (merge) → F (synthesise)
 * Falls back to simple analysis if pipeline fails.
 * Never throws.
 */
async function analyseTranscript(
  openai: OpenAI,
  title: string,
  subject: string | null,
  transcript: string,
  transcriptSegments: unknown,
  durationSeconds: number,
): Promise<TranscriptAnalysisResult> {
  const segs = (transcriptSegments as { start: number; text: string }[] | null) ?? []
  const diagnostics = computeTranscriptDiagnostics(transcript, segs, durationSeconds)

  // ── Skip to fallback for very short/weak transcripts
  if (diagnostics.transcript_quality === 'too_short' || diagnostics.transcript_quality === 'weak') {
    const { output, rawError } = await runFallbackAnalysis(openai, title, subject, transcript, diagnostics)
    if (output) {
      ;(output.notes as RecordingNotes).analysis_mode = 'fallback'
      console.error('[recorder] fallback_used: weak/short transcript')
      return { output, diagnostics, mode: 'fallback' }
    }
    return { output: null, diagnostics, mode: 'failed', rawError }
  }

  // ── Stage B: Classify content type
  const classification = await runClassification(openai, title, subject, transcript)

  if (!classification) {
    console.error('[recorder] classification_failed — using fallback')
    const { output, rawError } = await runFallbackAnalysis(openai, title, subject, transcript, diagnostics)
    if (output) {
      ;(output.notes as RecordingNotes).analysis_mode = 'fallback'
      return { output, diagnostics, mode: 'fallback' }
    }
    return { output: null, diagnostics, mode: 'failed', rawError }
  }

  // ── Non-study content: skip detailed extraction
  if (classification.study_relevance === 'low' || classification.study_relevance === 'none') {
    const { output, rawError } = await runFallbackAnalysis(openai, title, subject, transcript, diagnostics)
    if (output) {
      // Override fallback classification with the more reliable Stage B result
      output.notes.agent_classification = classification
      ;(output.notes as RecordingNotes).analysis_mode = 'fallback'
      return { output, diagnostics, mode: 'fallback' }
    }
    return { output: null, diagnostics, mode: 'failed', rawError }
  }

  // ── Stage C: Chunk transcript
  const { chunks, truncated } = chunkTranscript(transcript, segs)

  if (chunks.length === 0) {
    // Shouldn't happen if quality check passed, but guard anyway
    const { output, rawError } = await runFallbackAnalysis(openai, title, subject, transcript, diagnostics)
    if (output) {
      output.notes.agent_classification = classification
      ;(output.notes as RecordingNotes).analysis_mode = 'fallback'
      return { output, diagnostics, mode: 'fallback' }
    }
    return { output: null, diagnostics, mode: 'failed', rawError: rawError ?? 'no_chunks' }
  }

  // ── Stage D: Extract from each chunk (parallel)
  const chunkPromises = chunks.map(chunk => runChunkExtraction(openai, chunk, chunks.length, title))
  const settled = await Promise.allSettled(chunkPromises)

  const chunkResults: ChunkResult[] = []
  let failedCount = 0

  settled.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value) {
      chunkResults.push(res.value)
    } else {
      console.error(`[recorder] chunk_analysis_failed chunk:${i}`)
      failedCount++
    }
  })

  // If ALL chunks failed, fall back
  if (chunkResults.length === 0) {
    console.error('[recorder] all_chunks_failed — using fallback')
    const { output, rawError } = await runFallbackAnalysis(openai, title, subject, transcript, diagnostics)
    if (output) {
      output.notes.agent_classification = classification
      ;(output.notes as RecordingNotes).analysis_mode = 'fallback'
      console.error('[recorder] fallback_used')
      return { output, diagnostics, mode: 'fallback' }
    }
    return { output: null, diagnostics, mode: 'failed', rawError: rawError ?? 'all_chunks_failed' }
  }

  // ── Stage E: Merge chunk results
  const merged = mergeChunkResults(chunkResults)

  // Add partial-analysis note if some chunks or transcript was truncated
  if (failedCount > 0) {
    merged.unclear_parts.push(`Note: ${failedCount} of ${chunks.length} transcript segments could not be fully analysed.`)
  }
  if (truncated) {
    merged.unclear_parts.push('Note: This transcript was long — only the first portion was analysed in detail.')
  }

  // ── Stage F: Synthesis
  const synthesis = await runSynthesis(openai, merged, classification, diagnostics, title, subject)

  if (!synthesis) {
    console.error('[recorder] synthesis_failed — assembling from extracted facts only')
    // Synthesis failed but we have extracted facts — build a minimal but useful output
    const minimalSynthesis: SynthesisOutput = {
      summary: `Lecture on "${title}" — notes extracted from transcript.`,
      key_points: merged.key_terms.map(kt => `${kt.term}: ${kt.definition}`).slice(0, 6),
      sections: merged.definitions.length > 0
        ? [{ heading: 'Key Definitions', content: merged.definitions.slice(0, 3).map(d => `${d.term}: ${d.definition}`).join('. ') }]
        : [],
      concepts_detected: merged.key_terms.map(kt => kt.term),
      exam_readiness: merged.key_terms.length >= 4 ? 'medium' : 'low',
      unclear_or_low_confidence_parts: [
        'Note: Automatic note synthesis was unavailable. Key terms and details were extracted directly from the transcript.',
        ...merged.unclear_parts,
      ],
    }
    const output = assembleFromStagedAnalysis(merged, minimalSynthesis, classification, title)
    ;(output.notes as RecordingNotes).analysis_mode = 'fallback'
    console.error('[recorder] fallback_used: synthesis_failed')
    return { output, diagnostics, mode: 'fallback' }
  }

  // ── Assemble final output
  const output = assembleFromStagedAnalysis(merged, synthesis, classification, title)
  ;(output.notes as RecordingNotes).analysis_mode = 'full'
  return { output, diagnostics, mode: 'full' }
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function cleanUserMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)

  if (
    raw.startsWith('DATABASE_SETUP_REQUIRED') ||
    raw.startsWith('STORAGE_SETUP_REQUIRED') ||
    raw.startsWith('Not authenticated') ||
    raw.startsWith('Not authorized') ||
    raw.startsWith('No transcript')
  ) return raw

  if (raw.includes('429') || raw.toLowerCase().includes('rate limit') || raw.includes('quota')) {
    return 'AI service rate limit reached. Please wait a moment and try again.'
  }

  if (
    raw.includes("Expected '") ||
    raw.includes('Unexpected token') ||
    raw.includes('JSON') ||
    raw.toLowerCase().includes('parse error') ||
    raw === 'output_truncated'
  ) {
    return 'AI analysis returned an unexpected format. Your transcript has been saved — click "Retry analysis" to try again.'
  }

  if (raw.includes('empty text') || raw.includes('no speech') || raw.toLowerCase().includes('transcription returned')) {
    return 'No speech detected in this recording. Try recording closer to the audio source, or check that your microphone is working.'
  }

  return raw
}

// ── Server Actions ─────────────────────────────────────────────────────────────

export async function processRecording(
  input: ProcessRecordingInput,
): Promise<ProcessRecordingResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!input.audio_path.startsWith(user.id + '/')) {
    throw new Error('Not authorized: audio path does not belong to this user')
  }

  const { error: insertError } = await supabase
    .from('recordings')
    .insert({
      id: input.recordingId,
      user_id: user.id,
      title: input.title.trim(),
      subject: input.subject.trim() || null,
      audio_path: input.audio_path,
      duration_seconds: input.duration_seconds,
      status: 'processing',
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.message.includes('relation "recordings" does not exist')) {
      throw new Error(
        'DATABASE_SETUP_REQUIRED: The recordings table does not exist. ' +
        'Run the SQL setup in your Supabase project before using the Recorder Agent.',
      )
    }
    throw new Error(`Database error: ${insertError.message}`)
  }

  const setStatus = async (status: string) => {
    await supabase
      .from('recordings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', input.recordingId)
      .eq('user_id', user.id)
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'whisper-1'
  let transcriptSaved = false

  try {
    const { data: signed, error: signedError } = await supabase.storage
      .from('recordings')
      .createSignedUrl(input.audio_path, 120)

    if (signedError || !signed?.signedUrl) {
      const storageMsg = signedError instanceof Error ? signedError.message : String(signedError ?? '')
      throw new Error(
        !signed
          ? 'STORAGE_SETUP_REQUIRED: The recordings storage bucket does not exist or is not accessible.'
          : `Storage error: ${storageMsg}`,
      )
    }

    const audioResponse = await fetch(signed.signedUrl)
    if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`)
    const audioBuffer = await audioResponse.arrayBuffer()

    const mimeExt = input.mime_type.includes('mp4') ? 'mp4'
      : input.mime_type.includes('mpeg') ? 'mp3'
      : input.mime_type.includes('wav') ? 'wav'
      : input.mime_type.includes('m4a') ? 'm4a'
      : 'webm'
    const audioFile = new File([audioBuffer], `recording.${mimeExt}`, { type: input.mime_type })

    const transcriptionResult = await openai.audio.transcriptions.create({
      file: audioFile,
      model: transcriptionModel,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    })

    const transcript = transcriptionResult.text ?? ''
    const transcriptSegments = transcriptionResult.segments ?? null

    if (!transcript.trim()) {
      await setStatus('transcription_failed')
      throw new Error('Transcription returned empty text. The audio may be too quiet, too short, or contain no speech.')
    }

    // PHASE 1: Persist transcript before analysis — analysis failure can never lose this
    await supabase
      .from('recordings')
      .update({
        transcript,
        transcript_segments: transcriptSegments,
        transcription_model: transcriptionModel,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.recordingId)
      .eq('user_id', user.id)
    transcriptSaved = true

    // PHASE 2: Staged analysis pipeline
    const { output, diagnostics, rawError } = await analyseTranscript(
      openai,
      input.title,
      input.subject,
      transcript,
      transcriptSegments,
      input.duration_seconds,
    )

    if (!output) {
      await setStatus('analysis_failed')
      const { data: partial } = await supabase
        .from('recordings')
        .select('id, user_id, title, subject, audio_path, audio_url, transcript, key_terms, important_details, notes, summary, duration_seconds, status, transcription_model, analysis_model, created_at, updated_at')
        .eq('id', input.recordingId)
        .single()
      const userMsg = rawError
        ? cleanUserMessage(new Error(rawError))
        : 'Transcript saved, but AI note analysis failed. Click "Retry analysis" to try again.'
      return {
        recording: (partial ?? { id: input.recordingId, status: 'analysis_failed' }) as Recording,
        agent_insight: null,
        analysis_status: 'analysis_failed',
        user_message: userMsg,
      }
    }

    // PHASE 3: Persist complete results
    const notesForDb = {
      ...(output.notes as RecordingNotes),
      transcript_diagnostics: diagnostics,
      analysis_mode: (output.notes as RecordingNotes).analysis_mode ?? 'full',
    }

    const { data: updated, error: updateError } = await supabase
      .from('recordings')
      .update({
        key_terms: output.key_terms,
        important_details: output.important_details,
        notes: notesForDb,
        summary: output.summary,
        status: 'complete',
        analysis_model: ANALYSIS_MODEL,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.recordingId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) throw new Error(`Failed to save results: ${updateError.message}`)

    return {
      recording: updated as Recording,
      agent_insight: output.agent_insight,
      analysis_status: 'complete',
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await setStatus(transcriptSaved ? 'analysis_failed' : 'error')
    if (errMsg.startsWith('DATABASE_SETUP_REQUIRED') || errMsg.startsWith('STORAGE_SETUP_REQUIRED')) throw err
    throw new Error(cleanUserMessage(err))
  }
}

export async function retryAnalysis(recordingId: string): Promise<ProcessRecordingResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rec, error: fetchError } = await supabase
    .from('recordings')
    .select('id, user_id, title, subject, transcript, transcript_segments, duration_seconds, status')
    .eq('id', recordingId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !rec) throw new Error('Recording not found.')
  if (!rec.transcript) {
    throw new Error('No transcript available. Please record again — the original audio could not be transcribed.')
  }

  await supabase
    .from('recordings')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', recordingId)
    .eq('user_id', user.id)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const { output, diagnostics, rawError } = await analyseTranscript(
    openai,
    rec.title as string,
    rec.subject as string | null,
    rec.transcript as string,
    rec.transcript_segments,
    (rec.duration_seconds as number | null) ?? 0,
  )

  if (!output) {
    await supabase
      .from('recordings')
      .update({ status: 'analysis_failed', updated_at: new Date().toISOString() })
      .eq('id', recordingId)
      .eq('user_id', user.id)
    const userMsg = rawError
      ? cleanUserMessage(new Error(rawError))
      : 'Analysis failed again. Your transcript is still saved. Please try again in a moment.'
    const { data: partial } = await supabase
      .from('recordings')
      .select('id, user_id, title, subject, audio_path, audio_url, transcript, key_terms, important_details, notes, summary, duration_seconds, status, transcription_model, analysis_model, created_at, updated_at')
      .eq('id', recordingId)
      .single()
    return {
      recording: (partial ?? { id: recordingId, status: 'analysis_failed' }) as Recording,
      agent_insight: null,
      analysis_status: 'analysis_failed',
      user_message: userMsg,
    }
  }

  const notesForDb = {
    ...(output.notes as RecordingNotes),
    transcript_diagnostics: diagnostics,
    analysis_mode: (output.notes as RecordingNotes).analysis_mode ?? 'full',
  }

  const { data: updated, error: updateError } = await supabase
    .from('recordings')
    .update({
      key_terms: output.key_terms,
      important_details: output.important_details,
      notes: notesForDb,
      summary: output.summary,
      status: 'complete',
      analysis_model: ANALYSIS_MODEL,
      updated_at: new Date().toISOString(),
    })
    .eq('id', recordingId)
    .eq('user_id', user.id)
    .select()
    .single()

  if (updateError) throw new Error(`Failed to save retry results: ${updateError.message}`)

  return {
    recording: updated as Recording,
    agent_insight: output.agent_insight,
    analysis_status: 'complete',
  }
}

export async function getRecentRecordings(): Promise<Recording[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('recordings')
    .select(
      'id, user_id, title, subject, audio_path, audio_url, transcript, key_terms, important_details, notes, summary, duration_seconds, status, transcription_model, analysis_model, created_at, updated_at',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return []
  return (data ?? []) as Recording[]
}

export async function deleteRecording(recordingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: rec } = await supabase
    .from('recordings')
    .select('audio_path, user_id')
    .eq('id', recordingId)
    .single()

  if (!rec || rec.user_id !== user.id) throw new Error('Not found')

  if (rec.audio_path) {
    await supabase.storage.from('recordings').remove([rec.audio_path])
  }

  await supabase.from('recordings').delete().eq('id', recordingId).eq('user_id', user.id)
}
