import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  // Only allow same-origin relative paths; block protocol-relative and external URLs
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/dashboard'
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // OAuth providers send error params when the user cancels or consent fails
  const oauthError = searchParams.get('error')
  const oauthErrorDesc = searchParams.get('error_description')
  if (oauthError) {
    const msg = oauthErrorDesc
      ? encodeURIComponent(oauthErrorDesc.replace(/\+/g, ' '))
      : encodeURIComponent('Google sign-in was cancelled or failed. Please try again.')
    return NextResponse.redirect(`${origin}/login?error=${msg}`)
  }

  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('No auth code received. Please try signing in again.')}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Sign-in failed. Please try again.')}`)
  }

  // Direct new OAuth users to onboarding if they haven't completed it
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('user_id', data.user.id)
    .limit(1)

  const onboardingDone = profiles?.[0]?.onboarding_completed === true
  const destination = onboardingDone ? next : '/dashboard/onboarding'

  return NextResponse.redirect(`${origin}${destination}`)
}
