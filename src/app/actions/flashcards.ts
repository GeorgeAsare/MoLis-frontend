'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { recordUsage } from '@/app/actions/recordUsage'
import type { FlashcardSet, FlashcardItem } from '@/types/flashcard'
import type { DocumentAnalysis } from '@/types/documentAnalysis'

// ── Constants ─────────────────────────────────────────────────────────────────

const TEXT_CHAR_LIMIT = 14_000
const ADD_CARDS_MAX = 50  // safety ceiling per generation request (evidence: max_tokens:4000 ≈ 50 cards)

const SYSTEM_PROMPT = `You are an expert academic tutor creating Anki-style flashcards for university students. Generate concise, memorable flashcards that maximise retention. Always respond with a single valid JSON object. No markdown, no prose outside the JSON.`

// ── Prompt builders — initial generation ─────────────────────────────────────

function buildPromptFromAnalysis(title: string, analysis: DocumentAnalysis): string {
  const defsText = analysis.definitions
    .map((d) => `- ${d.term}: ${d.definition}`)
    .join('\n')

  const conceptsText = analysis.key_concepts
    .map((c) => `- [${c.importance}] ${c.concept}: ${c.explanation}`)
    .join('\n')

  const formulasText =
    analysis.formulas.length > 0
      ? '\n\nFORMULAS (one card per formula):\n' +
        analysis.formulas
          .map(
            (f) =>
              `- ${f.expression}: ${f.description}${f.variables ? ` (${f.variables})` : ''}`,
          )
          .join('\n')
      : ''

  const examplesText =
    analysis.examples.length > 0
      ? '\n\nEXAMPLES (use as scenario/application cards):\n' +
        analysis.examples.map((e) => `- ${e.description}`).join('\n')
      : ''

  const highTopics = analysis.likely_exam_topics
    .filter((t) => t.importance === 'high')
    .map((t) => `- ${t.topic}: related to ${t.related_concepts.join(', ')}`)
    .join('\n')

  return `Create flashcards for "${title}" from this structured document analysis.

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level}

DEFINITIONS (primary source — create a card for EVERY definition):
${defsText}

KEY CONCEPTS (create understanding and recall cards):
${conceptsText}${formulasText}${examplesText}

HIGH-PRIORITY EXAM TOPICS (ensure coverage):
${highTopics || 'None specified'}

Respond with ONLY a JSON object in this exact schema:
{
  "cards": [
    {
      "front": "Clear, concise question or term (max 120 chars)",
      "back": "Precise answer or definition (max 300 chars)",
      "topic": "Topic or category name (max 40 chars)",
      "difficulty": "easy|medium|hard",
      "image_prompt": "Description for educational diagram if useful, otherwise null"
    }
  ]
}

Rules:
- Generate 18–25 cards
- Cover ALL definitions first (one card per definition)
- Add cards for core and supporting key concepts
- Add one card per formula
- Add 1–2 application cards for each high-priority exam topic
- difficulty: easy=basic recall, medium=understanding, hard=application/analysis
- image_prompt: ONLY for concepts that genuinely need a diagram (anatomy, networks, data structures, circuits). Otherwise null.
- topic: group related cards (e.g. "Key Definitions", "Core Concepts", "Formulas", the subject area)`
}

function buildPromptFromText(title: string, text: string): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated]'
      : text

  return `Create flashcards for this document.

Title: ${title}

Content:
${body}

Respond with ONLY a JSON object in this exact schema:
{
  "cards": [
    {
      "front": "Clear, concise question or term (max 120 chars)",
      "back": "Precise answer or definition (max 300 chars)",
      "topic": "Topic or category name (max 40 chars)",
      "difficulty": "easy|medium|hard",
      "image_prompt": "Description for educational diagram if useful, otherwise null"
    }
  ]
}

Rules:
- Generate 15–20 cards covering the most important concepts
- front: a clear question or key term
- back: precise, memorable answer
- topic: group related cards
- difficulty: easy=basic recall, medium=understanding, hard=application/analysis
- image_prompt: ONLY for concepts that need a diagram. Otherwise null.`
}

// ── Prompt builders — additional card generation ──────────────────────────────

function buildAddPromptFromAnalysis(
  title: string,
  analysis: DocumentAnalysis,
  count: number,
  existingFronts: string,
  existingTopics: string[],
): string {
  const defsText = analysis.definitions
    .map((d) => `- ${d.term}: ${d.definition}`)
    .join('\n')

  const conceptsText = analysis.key_concepts
    .map((c) => `- [${c.importance}] ${c.concept}: ${c.explanation}`)
    .join('\n')

  const formulasText =
    analysis.formulas.length > 0
      ? '\n\nFORMULAS:\n' +
        analysis.formulas
          .map((f) => `- ${f.expression}: ${f.description}${f.variables ? ` (${f.variables})` : ''}`)
          .join('\n')
      : ''

  const examplesText =
    analysis.examples.length > 0
      ? '\n\nEXAMPLES:\n' + analysis.examples.map((e) => `- ${e.description}`).join('\n')
      : ''

  const coveredTopicsNote = existingTopics.length > 0
    ? `\n\nEXISTING TOPIC GROUPS ALREADY COVERED: ${existingTopics.join(', ')}`
    : ''

  return `Create ${count} ADDITIONAL flashcards for "${title}".

The student already has a flashcard set. You must generate new cards that expand the deck — not replace it.

SUBJECT: ${analysis.subject_area} | DIFFICULTY: ${analysis.difficulty_level}

FULL SOURCE MATERIAL:

DEFINITIONS:
${defsText}

KEY CONCEPTS:
${conceptsText}${formulasText}${examplesText}${coveredTopicsNote}

EXISTING CARDS — DO NOT CREATE SEMANTIC DUPLICATES:
${existingFronts}

Respond with ONLY a JSON object in this exact schema:
{
  "cards": [
    {
      "front": "Clear, concise question or term (max 120 chars)",
      "back": "Precise answer or definition (max 300 chars)",
      "topic": "Topic or category name (max 40 chars)",
      "difficulty": "easy|medium|hard",
      "image_prompt": "Description for educational diagram if useful, otherwise null"
    }
  ]
}

Rules:
- Generate exactly ${count} cards
- PRIORITISE concepts, sub-topics, definitions, examples, or applications NOT yet covered by the existing cards above
- Each new card must cover materially different content from all existing cards listed above
- If a topic already has cards, create deeper or more specific cards (application, analysis, edge cases)
- Stay strictly within the source document — do not introduce outside content
- difficulty: easy=basic recall, medium=understanding, hard=application/analysis
- image_prompt: only where a diagram genuinely aids understanding. Otherwise null.
- topic: use existing topic group names where appropriate, or create a new group if covering a distinct area`
}

function buildAddPromptFromText(
  title: string,
  text: string,
  count: number,
  existingFronts: string,
): string {
  const body =
    text.length > TEXT_CHAR_LIMIT
      ? text.slice(0, TEXT_CHAR_LIMIT) + '\n\n[Content truncated]'
      : text

  return `Create ${count} ADDITIONAL flashcards for this document.

Title: ${title}

The student already has a flashcard set. Generate new cards that expand it.

DOCUMENT CONTENT:
${body}

EXISTING CARDS — DO NOT CREATE SEMANTIC DUPLICATES:
${existingFronts}

Respond with ONLY a JSON object in this exact schema:
{
  "cards": [
    {
      "front": "Clear, concise question or term (max 120 chars)",
      "back": "Precise answer or definition (max 300 chars)",
      "topic": "Topic or category name (max 40 chars)",
      "difficulty": "easy|medium|hard",
      "image_prompt": "Description for educational diagram if useful, otherwise null"
    }
  ]
}

Rules:
- Generate exactly ${count} cards
- Cover concepts, definitions, or applications NOT already covered by existing cards above
- Stay strictly within the source document
- difficulty: easy=basic recall, medium=understanding, hard=application/analysis
- image_prompt: only where a diagram genuinely aids understanding. Otherwise null.`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeCards(value: unknown): FlashcardItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is FlashcardItem => {
    if (typeof x !== 'object' || x === null) return false
    const r = x as Record<string, unknown>
    return (
      typeof r.front === 'string' &&
      r.front.trim() !== '' &&
      typeof r.back === 'string' &&
      r.back.trim() !== '' &&
      typeof r.topic === 'string' &&
      (r.difficulty === 'easy' || r.difficulty === 'medium' || r.difficulty === 'hard') &&
      (r.image_prompt === null || typeof r.image_prompt === 'string')
    )
  })
}

function normalizeCardFront(front: string): string {
  return front.trim().toLowerCase().replace(/\s+/g, ' ')
}

function enrichWithConceptIds(
  cards: FlashcardItem[],
  graphNodes: Array<{ id: string; label: string }>,
): FlashcardItem[] {
  if (graphNodes.length === 0) return cards
  return cards.map((card) => {
    const lower = (card.front + ' ' + card.back + ' ' + card.topic).toLowerCase()
    let best: { id: string } | null = null
    let bestLen = 0
    for (const node of graphNodes) {
      if (lower.includes(node.label.toLowerCase()) && node.label.length > bestLen) {
        best = node
        bestLen = node.label.length
      }
    }
    return best ? { ...card, concept_id: best.id } : card
  })
}

async function callOpenAI(
  prompt: string,
  maxTokens: number,
): Promise<Record<string, unknown>> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Add it to your .env.local file.')
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let rawContent: string
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.35,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    })

    rawContent = completion.choices[0]?.message?.content ?? ''
    if (!rawContent) throw new Error('OpenAI returned an empty response')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('429') || msg.includes('quota')) {
      throw new Error('OpenAI rate limit reached. Please wait a moment and try again.')
    }
    if (msg.includes('401') || msg.includes('Incorrect API key')) {
      throw new Error('Invalid OpenAI API key. Check your OPENAI_API_KEY in .env.local.')
    }
    throw new Error(`OpenAI error: ${msg}`)
  }

  try {
    return JSON.parse(rawContent) as Record<string, unknown>
  } catch {
    throw new Error('OpenAI returned malformed JSON. Please try again.')
  }
}

// ── generateFlashcards — replaces entire deck ─────────────────────────────────

export async function generateFlashcards(documentId: string): Promise<FlashcardSet> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: doc } = await supabase
    .from('documents')
    .select('user_id, title, extracted_text')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')
  if (!doc.extracted_text?.trim()) {
    throw new Error('No extracted text found. Please extract text from the document first.')
  }

  const { data: analysis } = await supabase
    .from('document_analysis')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  const userPrompt = analysis
    ? buildPromptFromAnalysis(doc.title, analysis as DocumentAnalysis)
    : buildPromptFromText(doc.title, doc.extracted_text)

  const parsed = await callOpenAI(userPrompt, 2500)
  const cards = safeCards(parsed.cards)
  if (cards.length === 0) {
    throw new Error('No valid flashcards were generated. Please try again.')
  }

  const graphNodes = analysis
    ? ((analysis as DocumentAnalysis).concept_graph?.nodes ?? [])
    : []

  const enrichedCards = enrichWithConceptIds(cards, graphNodes)

  // Clear progress before replacing the card set so the new session starts fresh
  await supabase
    .from('flashcard_progress')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)

  await supabase
    .from('flashcards')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', user.id)

  const { data: saved, error: saveError } = await supabase
    .from('flashcards')
    .insert({
      document_id: documentId,
      user_id: user.id,
      cards: enrichedCards,
      model: 'gpt-4o-mini',
    })
    .select()
    .single()

  if (saveError || !saved) {
    void recordUsage({ generation_type: 'flashcards', document_id: documentId, success: false, error_type: 'save_failed', model: 'gpt-4o-mini' })
    throw new Error(saveError?.message ?? 'Failed to save flashcards')
  }

  void recordUsage({ generation_type: 'flashcards', document_id: documentId, success: true, model: 'gpt-4o-mini' })
  return saved as FlashcardSet
}

// ── addFlashcards — appends new cards to existing deck ───────────────────────

export async function addFlashcards(
  documentId: string,
  additionalCount: number,
): Promise<FlashcardSet> {
  if (
    !Number.isInteger(additionalCount) ||
    additionalCount < 1 ||
    additionalCount > ADD_CARDS_MAX
  ) {
    throw new Error(`Additional card count must be between 1 and ${ADD_CARDS_MAX}.`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Existing deck required
  const { data: existingSet } = await supabase
    .from('flashcards')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!existingSet) {
    throw new Error('No existing flashcard set found. Generate a deck first.')
  }

  const existingCards = existingSet.cards as FlashcardItem[]

  const { data: doc } = await supabase
    .from('documents')
    .select('user_id, title, extracted_text')
    .eq('id', documentId)
    .single()

  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')
  if (!doc.extracted_text?.trim()) throw new Error('No extracted text found.')

  const { data: analysis } = await supabase
    .from('document_analysis')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  // Build dedup context from existing cards
  const existingFronts = existingCards.map(c => `- ${c.front}`).join('\n')
  const existingTopics = [...new Set(existingCards.map(c => c.topic))]

  const userPrompt = analysis
    ? buildAddPromptFromAnalysis(doc.title, analysis as DocumentAnalysis, additionalCount, existingFronts, existingTopics)
    : buildAddPromptFromText(doc.title, doc.extracted_text, additionalCount, existingFronts)

  // Scale max_tokens with requested count; cap at 4000 to stay well within gpt-4o-mini limits
  const maxTokens = Math.min(4000, additionalCount * 100 + 600)
  const parsed = await callOpenAI(userPrompt, maxTokens)
  const newRawCards = safeCards(parsed.cards)
  if (newRawCards.length === 0) {
    throw new Error('No additional flashcards were generated. Please try again.')
  }

  const graphNodes = analysis
    ? ((analysis as DocumentAnalysis).concept_graph?.nodes ?? [])
    : []

  const enrichedNew = enrichWithConceptIds(newRawCards, graphNodes)

  // App-layer normalized dedup: remove exact and near-exact front duplicates before persistence.
  // Catches whitespace/case variants. Does not catch semantic duplicates (different wording, same
  // concept) — those require embedding infrastructure deferred to a later phase.
  const existingNormalized = new Set(existingCards.map(c => normalizeCardFront(c.front)))
  const deduplicatedNew = enrichedNew.filter(c => !existingNormalized.has(normalizeCardFront(c.front)))

  if (deduplicatedNew.length === 0) {
    throw new Error(
      'All generated cards were exact duplicates of existing cards. Try requesting different topics or difficulty.',
    )
  }

  const { data: updated, error: rpcError } = await supabase.rpc('append_flashcards', {
    p_document_id:    documentId,
    p_new_cards:      deduplicatedNew,
    p_expected_count: existingCards.length,
  })

  if (rpcError) {
    if (rpcError.message.includes('Concurrent modification')) {
      throw new Error('Your deck was updated by another request. Please try again.')
    }
    void recordUsage({ generation_type: 'flashcards', document_id: documentId, success: false, error_type: 'save_failed', model: 'gpt-4o-mini' })
    throw new Error(rpcError.message ?? 'Failed to save extended flashcard set')
  }

  void recordUsage({ generation_type: 'flashcards', document_id: documentId, success: true, model: 'gpt-4o-mini' })
  return (updated as unknown) as FlashcardSet
}
