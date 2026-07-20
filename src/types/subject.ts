export interface Subject {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface SubjectWithCounts extends Subject {
  document_count: number
  recording_count: number
}
