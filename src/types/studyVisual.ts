export interface StudyVisualItem {
  topic: string
  image_prompt: string
  image_url: string | null
  status: 'pending' | 'generated' | 'failed'
}

export interface StudyVisualSet {
  id: string
  document_id: string
  user_id: string
  visuals: StudyVisualItem[]
  model: string
  created_at: string
}
