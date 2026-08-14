// VALIDATION ONLY — never import from application code
//
// Unit tests for the production safety guard.
// These run without any database connection (pure logic tests).
// Included in vitest via the validation/**/*.test.ts include pattern.

import { describe, it, expect } from 'vitest'
import { checkProductionGuard, assertDisposableEnvironment } from './productionGuard'

// Minimum safe environment: RUN_DATABASE_TESTS=1, a loopback API URL, and a loopback DB URL.
// All three are required by the hardened guard.
const MIN_SAFE = {
  RUN_DATABASE_TESTS:  '1' as const,
  SUPABASE_URL:        'http://127.0.0.1:54321',
  DIRECT_URL:          'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
}

describe('Production safety guard — checkProductionGuard', () => {
  // ── RUN_DATABASE_TESTS opt-in requirement ─────────────────────────────────

  it('rejects empty env — RUN_DATABASE_TESTS missing makes env unsafe', () => {
    const result = checkProductionGuard({})
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('RUN_DATABASE_TESTS')
  })

  it('rejects env with only SUPABASE_URL but no RUN_DATABASE_TESTS', () => {
    const result = checkProductionGuard({ SUPABASE_URL: 'http://127.0.0.1:54321' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('RUN_DATABASE_TESTS')
  })

  it('rejects RUN_DATABASE_TESTS=true (must be exactly "1")', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: 'true', SUPABASE_URL: 'http://127.0.0.1:54321' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('RUN_DATABASE_TESTS')
  })

  it('rejects RUN_DATABASE_TESTS=yes (must be exactly "1")', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: 'yes', SUPABASE_URL: 'http://127.0.0.1:54321' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('RUN_DATABASE_TESTS')
  })

  it('rejects RUN_DATABASE_TESTS=1 without any SUPABASE_URL', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: '1' })
    expect(result.safe).toBe(false)
    // Reason must mention a recognized API URL var name so callers know what to set
    expect(result.reason).toContain('SUPABASE_URL')
  })

  // ── Approved loopback environments ────────────────────────────────────────
  // All "safe" cases require both an approved loopback API URL and a loopback DB URL.

  it('allows 127.0.0.1 loopback via SUPABASE_URL and DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://127.0.0.1:54321',
      DIRECT_URL:         'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    })
    expect(result.safe).toBe(true)
  })

  it('allows localhost loopback via SUPABASE_URL and DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://localhost:54321',
      DIRECT_URL:         'postgresql://postgres:postgres@localhost:54322/postgres',
    })
    expect(result.safe).toBe(true)
  })

  it('allows loopback via NEXT_PUBLIC_SUPABASE_URL and DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS:        '1',
      NEXT_PUBLIC_SUPABASE_URL:  'http://localhost:54321',
      DIRECT_URL:                'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    })
    expect(result.safe).toBe(true)
  })

  it('allows loopback via E2E_SUPABASE_URL and DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      E2E_SUPABASE_URL:   'http://127.0.0.1:54321',
      DIRECT_URL:         'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    })
    expect(result.safe).toBe(true)
  })

  it('normalizes trailing slash on approved loopback URLs', () => {
    expect(checkProductionGuard({ ...MIN_SAFE, SUPABASE_URL: 'http://127.0.0.1:54321/' }).safe).toBe(true)
    expect(checkProductionGuard({ ...MIN_SAFE, SUPABASE_URL: 'http://localhost:54321/' }).safe).toBe(true)
  })

  it('allows loopback database host in DATABASE_URL (alternative to DIRECT_URL)', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://127.0.0.1:54321',
      DATABASE_URL:       'postgresql://postgres:local@127.0.0.1:54322/postgres',
    })
    expect(result.safe).toBe(true)
  })

  it('allows localhost database host in DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://localhost:54321',
      DIRECT_URL:         'postgresql://postgres:local@localhost:54322/postgres',
    })
    expect(result.safe).toBe(true)
  })

  // ── Missing DB URL is now rejected ────────────────────────────────────────

  it('rejects loopback API URL when DIRECT_URL and DATABASE_URL are both absent', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://127.0.0.1:54321',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('DIRECT_URL')
  })

  // ── SUPABASE_ACCESS_TOKEN ─────────────────────────────────────────────────

  it('rejects SUPABASE_ACCESS_TOKEN set (links to cloud)', () => {
    const result = checkProductionGuard({ ...MIN_SAFE, SUPABASE_ACCESS_TOKEN: 'sbp_xxx' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('SUPABASE_ACCESS_TOKEN')
  })

  it('rejects SUPABASE_ACCESS_TOKEN even with no API URL set', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: '1', SUPABASE_ACCESS_TOKEN: 'sbp_xxx' })
    // Fails either on SUPABASE_URL absence or on SUPABASE_ACCESS_TOKEN — either way, not safe
    expect(result.safe).toBe(false)
  })

  // ── SUPABASE_PROJECT_REF ──────────────────────────────────────────────────

  it('rejects SUPABASE_PROJECT_REF set to production ref', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      SUPABASE_PROJECT_REF: 'ujwfkhvmpdmgjausnbre',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('SUPABASE_PROJECT_REF')
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  it('allows SUPABASE_PROJECT_REF set to a different (non-production) value', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      SUPABASE_PROJECT_REF: 'localdevproject',
    })
    // Project ref is not production — passes (local project refs are unusual but valid)
    expect(result.safe).toBe(true)
  })

  // ── Production project ref in credential vars ─────────────────────────────

  it('rejects production ref in SUPABASE_SECRET_KEY', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      SUPABASE_SECRET_KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ujwfkhvmpdmgjausnbre.sig`,
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  it('rejects production ref in SUPABASE_SERVICE_ROLE_KEY', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      SUPABASE_SERVICE_ROLE_KEY: `some-key-with-ujwfkhvmpdmgjausnbre-embedded`,
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  // ── Production project ref in URL vars ────────────────────────────────────

  it('rejects production project ref in SUPABASE_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'https://ujwfkhvmpdmgjausnbre.supabase.co',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  it('rejects production project ref in NEXT_PUBLIC_SUPABASE_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS:       '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://ujwfkhvmpdmgjausnbre.supabase.co',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  it('rejects production project ref in E2E_SUPABASE_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      E2E_SUPABASE_URL:   'https://ujwfkhvmpdmgjausnbre.supabase.co',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  it('rejects production project ref in DATABASE_URL', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      DATABASE_URL: 'postgresql://postgres:pass@db.ujwfkhvmpdmgjausnbre.supabase.co:5432/postgres',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('ujwfkhvmpdmgjausnbre')
  })

  it('rejects production project ref in DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://127.0.0.1:54321',
      DIRECT_URL:         'postgresql://postgres:pass@db.ujwfkhvmpdmgjausnbre.supabase.co:5432/postgres',
    })
    expect(result.safe).toBe(false)
  })

  // ── *.supabase.co rejection ───────────────────────────────────────────────

  it('rejects any *.supabase.co URL in SUPABASE_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'https://someotherproject.supabase.co',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('.supabase.co')
  })

  it('rejects any *.supabase.co URL in DATABASE_URL', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      DATABASE_URL: 'postgresql://postgres:pass@db.someproject.supabase.co:5432/postgres',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('.supabase.co')
  })

  it('rejects URL with trailing slash pointing to production', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'https://ujwfkhvmpdmgjausnbre.supabase.co/',
    })
    expect(result.safe).toBe(false)
  })

  // ── Non-loopback API URL ──────────────────────────────────────────────────

  it('rejects non-loopback API URL (LAN IP)', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'http://192.168.1.100:54321' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('192.168.1.100')
  })

  it('rejects non-loopback API URL (named host)', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'http://supabase.internal:54321' })
    expect(result.safe).toBe(false)
  })

  it('rejects https on localhost (only http is approved for local)', () => {
    const result = checkProductionGuard({ RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'https://localhost:54321' })
    expect(result.safe).toBe(false)
  })

  // ── Non-loopback database host ────────────────────────────────────────────

  it('rejects non-loopback database host in DATABASE_URL', () => {
    const result = checkProductionGuard({
      ...MIN_SAFE,
      DATABASE_URL: 'postgresql://postgres:pass@db.example.com:5432/postgres',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('db.example.com')
  })

  it('rejects non-loopback database host in DIRECT_URL', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://127.0.0.1:54321',
      DIRECT_URL:         'postgresql://postgres:pass@external-db.example.com:5432/postgres',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('external-db.example.com')
  })

  it('rejects invalid DATABASE_URL (not a valid URL)', () => {
    const result = checkProductionGuard({ ...MIN_SAFE, DATABASE_URL: 'not-a-url' })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('not a valid URL')
  })

  it('rejects invalid DIRECT_URL (not a valid URL)', () => {
    const result = checkProductionGuard({
      RUN_DATABASE_TESTS: '1',
      SUPABASE_URL:       'http://127.0.0.1:54321',
      DIRECT_URL:         'this-is-not-a-url',
    })
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('not a valid URL')
  })

  // ── reason field presence ─────────────────────────────────────────────────

  it('always includes a reason string when safe=false', () => {
    const cases: Record<string, string | undefined>[] = [
      {},
      { SUPABASE_URL: 'http://127.0.0.1:54321' },
      { RUN_DATABASE_TESTS: '1', SUPABASE_ACCESS_TOKEN: 'tok', SUPABASE_URL: 'http://127.0.0.1:54321' },
      { RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'https://ujwfkhvmpdmgjausnbre.supabase.co' },
      { RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'https://other.supabase.co' },
      { RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'http://192.168.0.1:54321' },
      { RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'http://127.0.0.1:54321', DATABASE_URL: 'postgresql://u:p@db.example.com:5432/db' },
      { RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'http://127.0.0.1:54321' }, // missing DB URL
      { ...MIN_SAFE, SUPABASE_PROJECT_REF: 'ujwfkhvmpdmgjausnbre' },
    ]
    for (const env of cases) {
      const result = checkProductionGuard(env)
      expect(result.safe, `expected safe=false for ${JSON.stringify(env)}`).toBe(false)
      expect(typeof result.reason).toBe('string')
      expect((result.reason ?? '').length).toBeGreaterThan(0)
    }
  })
})

describe('Production safety guard — assertDisposableEnvironment', () => {
  const MIN_SAFE_ASSERT = {
    RUN_DATABASE_TESTS: '1' as const,
    SUPABASE_URL:       'http://127.0.0.1:54321',
    DIRECT_URL:         'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  }

  it('throws with [PRODUCTION GUARD] prefix on production URL', () => {
    expect(() =>
      assertDisposableEnvironment({
        RUN_DATABASE_TESTS: '1',
        SUPABASE_URL:       'https://ujwfkhvmpdmgjausnbre.supabase.co',
      }),
    ).toThrow('[PRODUCTION GUARD]')
  })

  it('throws on SUPABASE_ACCESS_TOKEN set', () => {
    expect(() =>
      assertDisposableEnvironment({ ...MIN_SAFE_ASSERT, SUPABASE_ACCESS_TOKEN: 'sbp_xxx' }),
    ).toThrow('[PRODUCTION GUARD]')
  })

  it('throws with [PRODUCTION GUARD] prefix when RUN_DATABASE_TESTS is missing', () => {
    expect(() =>
      assertDisposableEnvironment({ SUPABASE_URL: 'http://127.0.0.1:54321' }),
    ).toThrow('[PRODUCTION GUARD]')
  })

  it('throws with [PRODUCTION GUARD] prefix on empty env', () => {
    expect(() => assertDisposableEnvironment({})).toThrow('[PRODUCTION GUARD]')
  })

  it('throws when DIRECT_URL is absent (even with valid API URL)', () => {
    expect(() =>
      assertDisposableEnvironment({ RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'http://127.0.0.1:54321' }),
    ).toThrow('[PRODUCTION GUARD]')
  })

  it('does not throw on 127.0.0.1 loopback with full minimum safe env', () => {
    expect(() =>
      assertDisposableEnvironment({
        RUN_DATABASE_TESTS: '1',
        SUPABASE_URL:       'http://127.0.0.1:54321',
        DIRECT_URL:         'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      }),
    ).not.toThrow()
  })

  it('does not throw on localhost loopback with full minimum safe env', () => {
    expect(() =>
      assertDisposableEnvironment({
        RUN_DATABASE_TESTS: '1',
        SUPABASE_URL:       'http://localhost:54321',
        DIRECT_URL:         'postgresql://postgres:postgres@localhost:54322/postgres',
      }),
    ).not.toThrow()
  })

  it('throws with informative message including approved URLs', () => {
    let message = ''
    try {
      assertDisposableEnvironment({ RUN_DATABASE_TESTS: '1', SUPABASE_URL: 'https://ujwfkhvmpdmgjausnbre.supabase.co' })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('127.0.0.1:54321')
    expect(message).toContain('Refusing to create database client')
  })
})
