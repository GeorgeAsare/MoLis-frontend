export interface RevisionNoteDefinition {
  term: string
  definition: string
}

export interface RevisionNote {
  id: string
  document_id: string
  user_id: string
  title: string
  summary: string
  key_concepts: string[]
  bullet_points: string[]
  definitions: RevisionNoteDefinition[]
  exam_tips: string[]
  model: string
  created_at: string
}
