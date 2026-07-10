import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from '@/components/onboarding/OnboardingForm'

export const metadata = {
  title: 'Setup — MoLis',
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // If onboarding already completed, send user to dashboard
  const { data } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .limit(1)

  if (data?.[0]?.onboarding_completed === true) {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-1 flex-col p-8 max-w-2xl">
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-foreground/25">
          Personalisation setup
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Set up your MoLis profile
        </h1>
        <p className="mt-1.5 text-sm text-foreground/40 leading-6">
          Help MoLis understand your goals, subjects, and learning style so it can personalise everything — notes, tutor, flashcards, and recommendations.
        </p>
      </div>
      <OnboardingForm />
    </div>
  )
}
