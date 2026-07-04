export interface StudyVisualItem {
  topic: string
  description: string         // brief explanation shown to the student
  image_prompt: string        // the prompt sent to the image model
  image_url: string | null    // Supabase Storage public URL after generation
  status: 'pending' | 'generated' | 'failed'
  // Populated on failure — safe error message for debugging (no secrets)
  error?: string
  failure_stage?: 'image_generation' | 'storage_upload'
}

export interface StudyVisualSet {
  id: string
  document_id: string
  user_id: string
  visuals: StudyVisualItem[]
  model: string
  created_at: string
}
