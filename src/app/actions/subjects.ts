'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { syncSubjectsCore } from '@/lib/subjectsSync'
import type { Subject, SubjectWithCounts } from '@/types/subject'
import type { StudyDocument } from '@/types/document'
import type { Recording } from '@/types/recordings'

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('subjects')
    .select('id, user_id, name, created_at')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    if (error.message.includes('does not exist')) {
      throw new Error('DATABASE_SETUP_REQUIRED: subjects table not found. Run the Subject Spaces SQL setup first.')
    }
    throw new Error(error.message)
  }
  return (data ?? []) as Subject[]
}

export async function getSubjectsWithCounts(): Promise<SubjectWithCounts[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const [subjectsRes, docsRes, recsRes] = await Promise.all([
    supabase.from('subjects').select('id, user_id, name, created_at').eq('user_id', user.id).order('name'),
    supabase.from('documents').select('subject_id').eq('user_id', user.id).not('subject_id', 'is', null),
    supabase.from('recordings').select('subject_id').eq('user_id', user.id).not('subject_id', 'is', null),
  ])

  if (subjectsRes.error) {
    if (subjectsRes.error.message.includes('does not exist')) {
      throw new Error('DATABASE_SETUP_REQUIRED: subjects table not found. Run the Subject Spaces SQL setup first.')
    }
    throw new Error(subjectsRes.error.message)
  }

  const docCounts = new Map<string, number>()
  for (const doc of docsRes.data ?? []) {
    if (doc.subject_id) docCounts.set(doc.subject_id, (docCounts.get(doc.subject_id) ?? 0) + 1)
  }
  const recCounts = new Map<string, number>()
  for (const rec of recsRes.data ?? []) {
    if (rec.subject_id) recCounts.set(rec.subject_id, (recCounts.get(rec.subject_id) ?? 0) + 1)
  }

  return (subjectsRes.data ?? []).map(s => ({
    ...(s as Subject),
    document_count: docCounts.get(s.id) ?? 0,
    recording_count: recCounts.get(s.id) ?? 0,
  }))
}

export async function createSubject(name: string): Promise<Subject> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Subject name is required.')
  if (trimmed.length > 120) throw new Error('Subject name must be under 120 characters.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('subjects')
    .insert({ user_id: user.id, name: trimmed })
    .select('id, user_id, name, created_at')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('You already have a subject with that name.')
    throw new Error(error.message)
  }
  return data as Subject
}

export async function deleteSubject(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}

export async function getSubjectWithResources(id: string): Promise<{
  subject: Subject
  documents: StudyDocument[]
  recordings: Recording[]
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const [subjectRes, docsRes, recsRes] = await Promise.all([
    supabase.from('subjects').select('id, user_id, name, created_at').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('documents').select('id, user_id, title, file_path, file_type, created_at, subject_id').eq('subject_id', id).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('recordings').select('id, user_id, title, subject, subject_id, audio_path, audio_url, transcript, key_terms, important_details, notes, summary, duration_seconds, status, transcription_model, analysis_model, created_at, updated_at').eq('subject_id', id).eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  if (subjectRes.error || !subjectRes.data) {
    throw new Error('Subject not found.')
  }

  return {
    subject: subjectRes.data as Subject,
    documents: (docsRes.data ?? []) as StudyDocument[],
    recordings: (recsRes.data ?? []) as Recording[],
  }
}

export async function syncSubjectsFromOnboarding(): Promise<void> {
  await syncSubjectsCore()
  revalidatePath('/dashboard/subjects')
}

export async function createDocument(input: {
  title: string
  file_path: string
  file_type: string
  subject_id: string | null
}): Promise<{ success: true; documentId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!input.file_path.startsWith(user.id + '/')) {
    throw new Error('Not authorized: file path does not belong to this user.')
  }

  if (input.subject_id) {
    const { data: sub } = await supabase
      .from('subjects')
      .select('id')
      .eq('id', input.subject_id)
      .eq('user_id', user.id)
      .single()
    if (!sub) throw new Error('Subject not found.')
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      title: input.title,
      file_path: input.file_path,
      file_type: input.file_type,
      subject_id: input.subject_id,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to create document record.')
  return { success: true, documentId: data.id }
}

export async function assignDocumentToSubject(documentId: string, subjectId: string | null): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (subjectId) {
    const { data: sub } = await supabase
      .from('subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()
    if (!sub) throw new Error('Subject not found.')
  }

  const { error } = await supabase
    .from('documents')
    .update({ subject_id: subjectId })
    .eq('id', documentId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}
