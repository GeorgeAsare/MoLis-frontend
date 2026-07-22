'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function mapLoginError(message: string): { text: string; unconfirmed?: boolean } {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return { text: 'Incorrect email or password.' }
  if (m.includes('email not confirmed') || m.includes('not confirmed'))
    return { text: 'Your email is not confirmed yet.', unconfirmed: true }
  if (m.includes('too many requests') || m.includes('rate limit'))
    return { text: 'Too many sign-in attempts. Wait a few minutes and try again.' }
  if (m.includes('user not found'))
    return { text: 'No account found with that email.' }
  return { text: message }
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(() => searchParams.get('error') ?? '')
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent' | 'error'>('idle')

  async function handleEmailLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading || navigating) return
    setError('')
    setUnconfirmedEmail('')
    setResendStatus('idle')
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        const mapped = mapLoginError(authError.message)
        setError(mapped.text)
        if (mapped.unconfirmed) setUnconfirmedEmail(email)
        return
      }

      setNavigating(true)
      router.push('/dashboard')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    if (googleLoading) return
    setError('')
    setGoogleLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message)
      setGoogleLoading(false)
    }
    // On success the browser navigates away — no need to reset googleLoading
  }

  async function handleResendConfirmation() {
    if (resending || !unconfirmedEmail) return
    setResending(true)
    setResendStatus('idle')

    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    })

    setResending(false)
    setResendStatus(resendError ? 'error' : 'sent')
  }

  const busy = loading || navigating

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
        <Input
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={busy}
          data-testid="email-input"
        />
        <Input
          id="password"
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={busy}
          data-testid="password-input"
        />

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs text-red-400 space-y-2">
            <p>{error}</p>
            {unconfirmedEmail && (
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resending}
                  className="underline underline-offset-2 hover:text-red-300 disabled:opacity-50 transition-colors"
                >
                  {resending ? 'Sending…' : 'Resend confirmation email'}
                </button>
                {resendStatus === 'sent' && (
                  <span className="text-green-400">Sent — check your inbox.</span>
                )}
                {resendStatus === 'error' && (
                  <span>Failed to resend. Try again.</span>
                )}
              </div>
            )}
          </div>
        )}

        <Button
          type="submit"
          loading={busy}
          disabled={busy}
          className="w-full mt-1"
          data-testid="login-submit"
        >
          {navigating ? 'Signing you in…' : 'Sign in'}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/30">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <Button
        variant="secondary"
        onClick={handleGoogleLogin}
        loading={googleLoading}
        disabled={googleLoading || busy}
        className="w-full"
        type="button"
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </Button>

      <p className="mt-4 text-center text-xs text-white/40">
        No account?{' '}
        <Link href="/signup" className="text-white/70 hover:text-white transition-colors">
          Sign up
        </Link>
      </p>
    </div>
  )
}
