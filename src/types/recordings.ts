export type RecordingStatus =
  | 'draft'
  | 'processing'
  | 'complete'
  | 'error'
  | 'transcription_failed'
  | 'analysis_failed'

export type TranscriptQuality = 'good' | 'weak' | 'too_short' | 'unclear'
export type ExamReadiness = 'high' | 'medium' | 'low' | 'insufficient'
export type AnalysisMode = 'full' | 'fallback'

export interface TranscriptDiagnostics {
  transcript_word_count: number
  segment_count: number
  duration_seconds: number
  words_per_minute: number
  transcript_quality: TranscriptQuality
  quality_reason: string
}

export type ContentType =
  | 'lecture'
  | 'class_explanation'
  | 'meeting'
  | 'interview'
  | 'podcast'
  | 'personal_note'
  | 'random_audio'
  | 'unclear'

export type StudyRelevance = 'high' | 'medium' | 'low' | 'none'

export type RecommendedAction =
  | 'create_study_notes'
  | 'record_longer_sample'
  | 'save_as_general_note'
  | 'ignore_or_delete'
  | 'send_to_study_agent_later'

export interface AgentClassification {
  content_type: ContentType
  study_relevance: StudyRelevance
  confidence_score: number
  reason: string
  recommended_action: RecommendedAction
}

export type DetailType =
  | 'definition'
  | 'example'
  | 'warning'
  | 'exam_hint'
  | 'process'
  | 'formula'
  | 'concept'
  | 'action_item'

export interface KeyTerm {
  term: string
  definition: string
  importance_score: number
  evidence: string
  related_terms: string[]
}

export interface ImportantDetail {
  title: string
  explanation: string
  why_it_matters: string
  evidence: string
  type: DetailType
}

export interface RecordingNotes {
  title: string
  summary: string
  sections: { heading: string; content: string }[]
  key_points: string[]
  definitions: { term: string; definition: string }[]
  examples: { description: string; context: string }[]
  formulas: { expression: string; description: string }[]
  possible_exam_questions: string[]
  flashcard_seed_items: { front: string; back: string }[]
  concepts_detected: string[]
  unclear_or_low_confidence_parts: string[]
  common_mistakes: { mistake: string; correction: string }[]
  code_examples: { code: string; language: string; description: string }[]
  exam_readiness: ExamReadiness
  agent_classification?: AgentClassification
  transcript_diagnostics?: TranscriptDiagnostics
  analysis_mode?: AnalysisMode
}

export interface AgentInsight {
  key_terms_found: number
  exam_relevant_count: number
  unclear_count: number
  recommended_next: string
}

export interface Recording {
  id: string
  user_id: string
  title: string
  subject: string | null
  audio_path: string | null
  audio_url: string | null
  transcript: string | null
  transcript_segments: unknown
  key_terms: KeyTerm[] | null
  important_details: ImportantDetail[] | null
  notes: RecordingNotes | null
  summary: string | null
  duration_seconds: number | null
  status: RecordingStatus
  transcription_model: string | null
  analysis_model: string | null
  created_at: string
  updated_at: string
}

export interface ProcessRecordingInput {
  recordingId: string
  title: string
  subject: string
  audio_path: string
  duration_seconds: number
  mime_type: string
}

export interface ProcessRecordingResult {
  recording: Recording
  agent_insight: AgentInsight | null
  analysis_status: 'complete' | 'analysis_failed'
  user_message?: string
}
