import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from '@/components/onboarding/OnboardingForm'

export const metadata = {
  title: 'Get started — MoLis',
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white">Set up your profile</h1>
          <p className="mt-1 text-sm text-white/40">
            Help MoLis personalize your AI operating system
          </p>
        </div>
        <OnboardingForm userId={user.id} />
      </div>
    </div>
  )
}
