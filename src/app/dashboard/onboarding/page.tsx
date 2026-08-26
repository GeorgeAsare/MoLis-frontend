import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NeuralOrb } from '@/components/ui/NeuralOrb'
import { OnboardingForm } from '@/components/onboarding/OnboardingForm'

export const metadata = {
  title: 'Getting started — MoLis',
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .limit(1)

  if (data?.[0]?.onboarding_completed === true) {
    redirect('/dashboard')
  }

  return (
    <div className="w-full max-w-2xl px-6 py-10 lg:px-10 lg:py-12">

      {/* Header */}
      <div className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <NeuralOrb size="xs" pulse />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/30">
            MoLis
          </span>
        </div>
        <h1 className="text-[1.65rem] font-semibold tracking-[-0.025em] leading-[1.1] text-foreground mb-2.5">
          Let&apos;s get to know you.
        </h1>
        <p className="text-sm text-foreground/40 leading-relaxed max-w-[440px]">
          A few questions let MoLis adapt to how you study — your subjects, schedule, and goals. Takes about two minutes.
        </p>
      </div>

      <OnboardingForm />
    </div>
  )
}
