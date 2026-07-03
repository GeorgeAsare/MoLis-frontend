export interface StudyVisualItem {
  topic: string
  description: string         // brief explanation shown to the student
  image_prompt: string        // the prompt sent to dall-e-3
  image_url: string | null    // Supabase Storage public URL after generation
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
