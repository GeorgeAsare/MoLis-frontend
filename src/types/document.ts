export interface StudyDocument {
  id: string
  user_id: string
  title: string
  file_path: string | null
  file_type: string
  created_at: string
  extracted_text?: string | null
  subject_id?: string | null
  source_type?: string | null
  source_recording_id?: string | null
}
