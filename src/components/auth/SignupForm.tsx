'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'motion/react'
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
  const [showPassword, setShowPassword] = useState(false)
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [resendError, setResendError] = useState('')

  async function handleSignup(e: { preventDefault(): void }) {
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
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signupError) {
        setError(mapSignupError(signupError.message))
        return
      }

      // Supabase returns success even for existing emails (privacy protection).
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
        redirectTo: `${window.location.origin}/auth/callback`,
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setResending(false)
    if (err) {
      setResendStatus('error')
      setResendError(mapResendError(err.message))
    } else {
      setResendStatus('sent')
    }
  }

  // ── Email confirmation screen ─────────────────────────────────────────────

  if (emailSent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-7 text-center">
          <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">
            Check your inbox
          </h1>
          <p className="mt-1 text-[13px] text-foreground/38">A confirmation link is on its way</p>
        </div>

        <div className="rounded-2xl border border-border/55 bg-card/75 p-7 backdrop-blur-sm text-center">
          {/* Mail icon */}
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/40">
            <MailIcon className="h-5 w-5 text-foreground/35" />
          </div>

          <p className="text-sm text-foreground/55 leading-relaxed">
            If an account doesn&apos;t exist for{' '}
            <span className="font-medium text-foreground/75">{email}</span>, a confirmation
            link has been sent. Check your inbox and spam folder.
          </p>

          <div className="mt-6 border-t border-border/50 pt-5 flex flex-col gap-3">
            <p className="text-xs text-foreground/30">Didn&apos;t receive it?</p>

            {resendStatus === 'sent' ? (
              <p className="text-xs text-emerald-400">
                Confirmation email resent. Check your inbox.
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
              className="text-xs text-foreground/28 transition-colors hover:text-foreground/55"
            >
              Try a different email
            </button>
          </div>

          <p className="mt-5 text-xs text-foreground/25">
            Already confirmed?{' '}
            <Link href="/login" className="font-medium text-foreground/50 transition-colors hover:text-foreground/75">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    )
  }

  // ── Signup form ───────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Title */}
      <div className="mb-7 text-center">
        <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-foreground">
          Create your account
        </h1>
        <p className="mt-1 text-[13px] text-foreground/38">Start with MoLis Intelligence</p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-border/55 bg-card/75 p-7 backdrop-blur-sm">
        <form onSubmit={handleSignup} className="flex flex-col gap-5">
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

          {/* Password with show/hide */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground/70">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={loading}
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-3.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-150 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/28 transition-colors duration-150 hover:text-foreground/55 focus-visible:outline-none"
              >
                {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2 rounded-xl border border-red-500/18 bg-red-500/[0.07] px-3.5 py-3 text-xs text-red-400"
            >
              <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400/70" />
              <p>{error}</p>
            </motion.div>
          )}

          <Button
            type="submit"
            loading={loading}
            disabled={loading}
            size="lg"
            className="w-full mt-1"
          >
            Create account
          </Button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border/50" />
          <span className="text-[11px] text-foreground/28">or</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        {/* Google */}
        <Button
          variant="secondary"
          onClick={handleGoogleSignup}
          loading={googleLoading}
          disabled={googleLoading || loading}
          size="lg"
          className="w-full"
          type="button"
        >
          <GoogleIcon className="mr-1.5 h-4 w-4 shrink-0" />
          Continue with Google
        </Button>

        {/* Switch to login */}
        <p className="mt-5 text-center text-xs text-foreground/38">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-foreground/65 transition-colors hover:text-foreground">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
