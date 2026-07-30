export interface StudyVisualItem {
  topic: string
  description: string
  image_prompt: string
  // Private Storage path (e.g., "{userId}/{documentId}/{jobId}/{attempt}/{i}.png").
  // Stored in the study_visuals JSONB manifest. Never a public URL.
  // Access only via the server-side signed URL endpoint: GET /api/visuals/[documentId]
  storage_path: string | null
  // Ephemeral signed URL resolved server-side after ownership verification.
  // Not stored in the database. Populated by the /api/visuals/[documentId] endpoint
  // and valid for ~5 minutes. Null until the signed URL has been fetched.
  image_url: string | null
  status: 'pending' | 'generated' | 'failed'
  // Populated on failure — safe error code for debugging (no secrets or stack traces)
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
