'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

function mapSignupError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit') || m.includes('email rate'))
    return 'Too many confirmation emails sent. Wait a few minutes before trying again.'
  if (m.includes('invalid') && m.includes('email'))
    return 'Please enter a valid email address.'
  if (m.includes('password') && (m.includes('short') || m.includes('weak') || m.includes('least')))
    return 'Password must be at least 8 characters.'
  if (m.includes('already registered') || m.includes('already in use'))
    return 'An account with this email already exists. Try signing in instead.'
  if (m.includes('signup') && m.includes('disabled'))
    return 'New signups are temporarily disabled. Please try again later.'
  return message
}

function mapResendError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit')) return 'Too many resend attempts. Wait a few minutes.'
  return 'Could not resend. Please try again.'
}

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [resendError, setResendError] = useState('')

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        },
      })

      if (signupError) {
        setError(mapSignupError(signupError.message))
        return
      }

      // Supabase returns success even for existing emails (privacy protection).
      // We cannot distinguish "new user" from "already registered" here.
      setEmailSent(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignup() {
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
  }

  async function handleResend() {
    if (resending) return
    setResending(true)
    setResendStatus('idle')
    setResendError('')

    const supabase = createClient()
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
    })

    setResending(false)
    if (err) {
      setResendStatus('error')
      setResendError(mapResendError(err.message))
    } else {
      setResendStatus('sent')
    }
  }

  if (emailSent) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center flex flex-col gap-4">
        <div>
          <div className="mb-3 text-2xl">📬</div>
          <h2 className="text-sm font-medium text-white">Confirmation email requested</h2>
          <p className="mt-1.5 text-xs text-white/40 leading-5">
            If an account does not already exist for{' '}
            <span className="text-white/60">{email}</span>, a confirmation link
            has been sent. Check your inbox and spam folder.
          </p>
        </div>

        <div className="border-t border-white/8 pt-4 flex flex-col gap-3">
          <p className="text-xs text-white/35">Didn&apos;t receive it?</p>

          {resendStatus === 'sent' ? (
            <p className="text-xs text-green-400">
              Confirmation email resent. Check your inbox and spam folder.
            </p>
          ) : (
            <Button
              variant="secondary"
              onClick={handleResend}
              loading={resending}
              disabled={resending}
              className="w-full"
              type="button"
            >
              {resending ? 'Sending…' : 'Resend confirmation email'}
            </Button>
          )}

          {resendStatus === 'error' && resendError && (
            <p className="text-xs text-red-400">{resendError}</p>
          )}

          <button
            type="button"
            onClick={() => {
              setEmailSent(false)
              setResendStatus('idle')
              setResendError('')
            }}
            className="text-xs text-white/35 hover:text-white/60 transition-colors"
          >
            Try a different email
          </button>
        </div>

        <p className="text-xs text-white/25 leading-5">
          Already confirmed?{' '}
          <Link href="/login" className="text-white/50 hover:text-white/80 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        <Input
          id="full_name"
          label="Full name"
          type="text"
          placeholder="Your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          disabled={loading}
        />
        <Input
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading}
        />
        <Input
          id="password"
          label="Password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          disabled={loading}
        />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} disabled={loading} className="w-full mt-1">
          Create account
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/30">or</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <Button
        variant="secondary"
        onClick={handleGoogleSignup}
        loading={googleLoading}
        disabled={googleLoading || loading}
        className="w-full"
        type="button"
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.45 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </Button>

      <p className="mt-4 text-center text-xs text-white/40">
        Already have an account?{' '}
        <Link href="/login" className="text-white/70 hover:text-white transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  )
}
