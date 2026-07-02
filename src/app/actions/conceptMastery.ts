'use server'

import { createClient } from '@/lib/supabase/server'
import type { ConceptMastery, ConceptResultInput, ForgettingRisk, MistakePattern } from '@/types/conceptMastery'
import type { ConceptGraph } from '@/types/documentAnalysis'

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeForgettingRisk(mastery_score: number, last_reviewed_at: string | null): ForgettingRisk {
  if (!last_reviewed_at) return 'low'
  const hoursSince = (Date.now() - new Date(last_reviewed_at).getTime()) / 3_600_000
  if (mastery_score < 40) return hoursSince > 24 ? 'high' : 'medium'
  if (mastery_score < 70) return hoursSince > 72 ? 'high' : hoursSince > 24 ? 'medium' : 'low'
  return hoursSince > 168 ? 'medium' : 'low'
}

function computeNextReview(mastery_score: number, from: Date): Date {
  const next = new Date(from)
  if (mastery_score < 40) next.setDate(next.getDate() + 1)
  else if (mastery_score < 70) next.setDate(next.getDate() + 3)
  else next.setDate(next.getDate() + 7)
  return next
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function initConceptMastery(documentId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: analysis } = await supabase
    .from('document_analysis')
    .select('concept_graph')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .maybeSingle()

  const graph = analysis?.concept_graph as ConceptGraph | null
  if (!graph?.nodes?.length) return

  const rows = graph.nodes.map(node => ({
    user_id: user.id,
    document_id: documentId,
    concept_id: node.id,
    concept_title: node.label,
    mastery_score: 0,
    confidence_score: 0,
    exposure_count: 0,
    review_count: 0,
    correct_count: 0,
    incorrect_count: 0,
    last_reviewed_at: null,
    next_review_at: null,
    forgetting_risk: 'low' as const,
    average_response_time_ms: null,
    mistake_patterns: [],
    source: 'manual' as const,
  }))

  await supabase
    .from('concept_mastery')
    .upsert(rows, { onConflict: 'user_id,document_id,concept_id', ignoreDuplicates: true })
}

export async function recordConceptResult(
  documentId: string,
  result: ConceptResultInput,
): Promise<ConceptMastery> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: existing } = await supabase
    .from('concept_mastery')
    .select('*')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('concept_id', result.concept_id)
    .maybeSingle()

  const now = new Date()
  const correct_count = (existing?.correct_count ?? 0) + (result.correct ? 1 : 0)
  const incorrect_count = (existing?.incorrect_count ?? 0) + (result.correct ? 0 : 1)
  const review_count = (existing?.review_count ?? 0) + 1
  const exposure_count = (existing?.exposure_count ?? 0) + 1
  const total = correct_count + incorrect_count

  // Mastery score: accuracy weighted by confidence (full weight after 5 reviews)
  const accuracy = total > 0 ? correct_count / total : 0
  const confidence_weight = Math.min(1, review_count / 5)
  const mastery_score = Math.round(accuracy * confidence_weight * 100)
  const confidence_score = Math.round(accuracy * 100)

  // Running average response time
  let average_response_time_ms: number | null = existing?.average_response_time_ms ?? null
  if (result.response_time_ms != null) {
    average_response_time_ms =
      average_response_time_ms == null
        ? result.response_time_ms
        : Math.round((average_response_time_ms * (review_count - 1) + result.response_time_ms) / review_count)
  }

  // Append mistake pattern (cap at 10)
  const prior = (existing?.mistake_patterns ?? []) as MistakePattern[]
  const mistake_patterns: MistakePattern[] = [...prior]
  if (!result.correct && result.question) {
    mistake_patterns.push({
      question: result.question,
      wrong_answer: result.wrong_answer ?? null,
      correct_answer: result.correct_answer ?? '',
      timestamp: now.toISOString(),
    })
    if (mistake_patterns.length > 10) mistake_patterns.splice(0, mistake_patterns.length - 10)
  }

  const forgetting_risk = computeForgettingRisk(mastery_score, existing?.last_reviewed_at ?? null)
  const next_review_at = computeNextReview(mastery_score, now)

  const { data: saved, error } = await supabase
    .from('concept_mastery')
    .upsert(
      {
        user_id: user.id,
        document_id: documentId,
        concept_id: result.concept_id,
        concept_title: result.concept_title,
        mastery_score,
        confidence_score,
        exposure_count,
        review_count,
        correct_count,
        incorrect_count,
        last_reviewed_at: now.toISOString(),
        next_review_at: next_review_at.toISOString(),
        forgetting_risk,
        average_response_time_ms,
        mistake_patterns,
        source: result.source,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,document_id,concept_id' },
    )
    .select()
    .single()

  if (error || !saved) throw new Error(error?.message ?? 'Failed to record concept result')
  return saved as ConceptMastery
}

export async function getConceptMastery(documentId: string): Promise<ConceptMastery[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('concept_mastery')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .order('mastery_score', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as ConceptMastery[]
}
