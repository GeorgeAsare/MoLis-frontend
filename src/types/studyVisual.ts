export interface StudyVisualItem {
  // Server-generated immutable identifier; also used as the PNG filename.
  id: string
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
  mime_type: 'image/png' | null
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

// PublicVisualItem and PublicVisualSet are the safe shapes returned to the client.
// storage_path and image_prompt are omitted — they must never be serialized to the client.
// image_url is a short-lived signed URL resolved server-side (null until fetched via the API endpoint).
export interface PublicVisualItem {
  id: string
  topic: string
  description: string
  image_url: string | null
  status: 'pending' | 'generated' | 'failed'
  error?: string
  failure_stage?: 'image_generation' | 'storage_upload'
}

export interface PublicVisualSet {
  id: string
  document_id: string
  visuals: PublicVisualItem[]
  model: string
  created_at: string
}
