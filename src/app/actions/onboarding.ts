'use server'

import { createClient } from '@/lib/supabase/server'
import type { SaveOnboardingInput, StudentProfileRow } from '@/types/user'

export async function saveOnboardingProfile(input: SaveOnboardingInput): Promise<{ success: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (
    !input.academic_profile ||
    !input.study_preferences ||
    !input.personalisation_profile ||
    !Array.isArray(input.academic_profile.subjects)
  ) {
    throw new Error('Invalid onboarding data — required fields missing.')
  }

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      {
        user_id: user.id,
        academic_profile: input.academic_profile,
        study_preferences: input.study_preferences,
        personalisation_profile: input.personalisation_profile,
        onboarding_completed: true,
        onboarding_completed_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    if (
      error.message.includes('relation "user_profiles" does not exist') ||
      error.message.includes('does not exist')
    ) {
      throw new Error(
        'DATABASE_SETUP_REQUIRED: The user_profiles table does not exist. ' +
        'Run the setup SQL in your Supabase project (SQL Editor → New query) before using personalisation.',
      )
    }
    throw new Error(`Failed to save profile: ${error.message}`)
  }

  return { success: true }
}

export async function getOnboardingStatus(): Promise<{
  completed: boolean
  profile: StudentProfileRow | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { completed: false, profile: null }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)

  if (error || !data?.length) return { completed: false, profile: null }

  const row = data[0] as StudentProfileRow
  return { completed: row.onboarding_completed ?? false, profile: row }
}
