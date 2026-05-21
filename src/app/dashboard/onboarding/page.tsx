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

  return (
    <div className="flex flex-1 flex-col p-8 max-w-lg">
      <div className="mb-8">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-white/20">
          Setup
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Personalise MoLis
        </h1>
        <p className="mt-1.5 text-sm text-white/35">
          Help your AI operating system understand your goals and learning style.
        </p>
      </div>
      <OnboardingForm userId={user.id} />
    </div>
  )
}
