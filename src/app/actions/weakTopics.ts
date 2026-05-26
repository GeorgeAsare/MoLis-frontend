'use server'

import { createClient } from '@/lib/supabase/server'
import type { MissedQuestionData, WeakTopicEvidence } from '@/types/weakTopic'

// ── Topic extraction ──────────────────────────────────────────────────────────
// Strips common question prefixes and stop words, then returns the first
// 2–4 meaningful words as a normalised topic label.

const QUESTION_PREFIXES = [
  /^(what (is|are|does|do|was|were))\s+/i,
  /^(which (of the following|one|approach|statement))\s+/i,
  /^(how (does|do|is|are|was|were|can))\s+/i,
  /^(why (does|do|is|are|was|were))\s+/i,
  /^(when (does|do|is|are|was|were))\s+/i,
  /^(who (is|was|are|were))\s+/i,
  /^(where (does|do|is|are|was|were))\s+/i,
  /^true or false:?\s+/i,
  /^(describe|explain|define|identify|evaluate|analyse|analyze|calculate|determine|compare)\s+/i,
  /^in (this|the|a) (following )?scenario[,.]?\s+/i,
  /^(a |an |the )/i,
]

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'with', 'from', 'about', 'as', 'into', 'through', 'that', 'this', 'these',
  'those', 'it', 'its', 'their', 'they', 'them', 'we', 'our', 'you', 'your', 'he',
  'she', 'his', 'her', 'and', 'or', 'but', 'if', 'when', 'then', 'so', 'also',
  'not', 'no', 'nor', 'both', 'either', 'used', 'following', 'most', 'best',
  'typically', 'generally', 'often', 'usually', 'always', 'never', 'first',
])

function extractTopic(question: string): string {
  let text = question.replace(/[?!.]+$/, '').trim()

  // Strip question starters — repeat until stable (handles chained prefixes)
  let changed = true
  while (changed) {
    changed = false
    for (const pattern of QUESTION_PREFIXES) {
      const next = text.replace(pattern, '').trim()
      if (next !== text) {
        text = next
        changed = true
        break
      }
    }
  }

  const words = text.split(/\s+/)
  const meaningful = words
    .map((w) => w.replace(/[^a-zA-Z0-9-]/g, ''))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4)

  const result =
    meaningful.length > 0 ? meaningful.join(' ') : words.slice(0, 3).join(' ')
  return result.charAt(0).toUpperCase() + result.slice(1)
}

// ── Server Action ─────────────────────────────────────────────────────────────

export async function saveWeakTopics(
  documentId: string,
  missed: MissedQuestionData[],
): Promise<void> {
  if (missed.length === 0) return

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify document ownership
  const { data: doc } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()
  if (!doc || doc.user_id !== user.id) throw new Error('Not authorized')

  const recordedAt = new Date().toISOString()

  // Group missed questions by extracted topic so one quiz session → one
  // weakness_score increment per topic, even if multiple questions were missed.
  const byTopic = new Map<string, WeakTopicEvidence[]>()
  for (const m of missed) {
    const topic = extractTopic(m.question)
    if (!byTopic.has(topic)) byTopic.set(topic, [])
    byTopic.get(topic)!.push({
      question: m.question,
      question_type: m.questionType,
      selected_answer: m.selectedAnswer,
      correct_answer: m.correctAnswer,
      explanation: m.explanation,
      recorded_at: recordedAt,
    })
  }

  // Upsert each topic — one round-trip per unique topic (typically 3–10 per quiz)
  for (const [topic, newEvidence] of byTopic) {
    const { data: existing } = await supabase
      .from('weak_topics')
      .select('id, weakness_score, evidence')
      .eq('user_id', user.id)
      .eq('document_id', documentId)
      .eq('topic', topic)
      .maybeSingle()

    if (existing) {
      const currentEvidence = Array.isArray(existing.evidence)
        ? (existing.evidence as WeakTopicEvidence[])
        : []
      await supabase
        .from('weak_topics')
        .update({
          weakness_score: existing.weakness_score + 1,
          evidence: [...currentEvidence, ...newEvidence],
          last_seen: recordedAt,
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('weak_topics').insert({
        user_id: user.id,
        document_id: documentId,
        topic,
        weakness_score: 1,
        evidence: newEvidence,
        last_seen: recordedAt,
      })
    }
  }
}
