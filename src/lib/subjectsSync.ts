import { createClient } from '@/lib/supabase/server'

function extractSubjectName(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry.trim() || null
  }
  if (entry !== null && typeof entry === 'object' && 'name' in entry) {
    const name = (entry as { name: unknown }).name
    if (typeof name === 'string') return name.trim() || null
  }
  return null
}

export async function syncSubjectsCore(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('academic_profile')
    .eq('user_id', user.id)
    .limit(1)

  const rawSubjects: unknown[] = profiles?.[0]?.academic_profile?.subjects ?? []

  const names: string[] = []
  const seen = new Set<string>()
  for (const entry of rawSubjects) {
    const name = extractSubjectName(entry)
    if (!name) continue
    const key = name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      names.push(name)
    }
  }

  if (names.length === 0) return

  const { data: existing } = await supabase
    .from('subjects')
    .select('name')
    .eq('user_id', user.id)

  const existingNorm = new Set((existing ?? []).map((s: { name: string }) => s.name.toLowerCase().trim()))

  const toInsert = names
    .filter(n => !existingNorm.has(n.toLowerCase()))
    .map(n => ({ user_id: user.id, name: n }))

  if (toInsert.length === 0) return

  await supabase.from('subjects').insert(toInsert)
}
