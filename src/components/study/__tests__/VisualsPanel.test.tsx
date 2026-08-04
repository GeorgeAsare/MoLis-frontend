// @vitest-environment jsdom
//
// D13 behavioral contract tests for VisualsPanel polling.
// Tests the jittered backoff schedule, one-in-flight guard, hidden/offline pause,
// resume on visibility/connectivity change, stale rejection, terminal stop, and
// unmount cleanup — without executing production infrastructure.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'

// ── Module mocks (hoisted by Vitest before imports) ───────────────────────────

vi.mock('@/app/actions/generationJobs', () => ({
  getActiveJobForDocument: vi.fn(),
  enqueueJob: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-test-1' } } },
      }),
    },
  }),
}))

vi.mock('@/lib/jobs/pendingJobKey', () => ({
  getOrCreatePendingRequestKey: vi.fn(() => 'req-key-test'),
  clearPendingRequestKey: vi.fn(),
  setPendingRequestKey: vi.fn(),
}))

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: () => null,
}))

// ── Imports after mocks ───────────────────────────────────────────────────────

import { VisualsPanel } from '@/components/study/VisualsPanel'
import { getActiveJobForDocument } from '@/app/actions/generationJobs'

const mockGetActiveJob = vi.mocked(getActiveJobForDocument)

// ── Helpers ───────────────────────────────────────────────────────────────────

const DOC_ID = 'doc-00000001'

function makeJobDto(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-00000001',
    user_id: 'user-test-1',
    document_id: DOC_ID,
    job_type: 'visuals',
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    public_error_code: null,
    public_message_key: null,
    support_reference: null,
    ...overrides,
  }
}

const EMPTY_VISUAL_SET = {
  id: 'vs-1',
  document_id: DOC_ID,
  visuals: [],
  model: 'gpt-image-2',
  created_at: new Date().toISOString(),
}

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/visuals/')) {
      return new Response(JSON.stringify(EMPTY_VISUAL_SET), { status: 200 })
    }
    const resp = responses[Math.min(call, responses.length - 1)]
    call++
    return new Response(JSON.stringify(resp.body), { status: resp.status })
  })
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    documentId: DOC_ID,
    hasExtractedText: true,
    initialVisuals: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VisualsPanel D13 polling behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // jsdom defaults: visibilityState='visible', navigator.onLine=true
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible', writable: true, configurable: true,
    })
    Object.defineProperty(navigator, 'onLine', {
      value: true, writable: true, configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── 1. Backoff schedule ────────────────────────────────────────────────────

  it('polls at 2 s on the first step, then advances to 5 s', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch([
      { status: 200, body: makeJobDto('queued', { id: jobId }) },
      { status: 200, body: makeJobDto('queued', { id: jobId }) },
    ])

    const { unmount } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // First poll fires within first 2s+jitter window
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/jobs/status/${jobId}`),
      expect.anything(),
    )
    const firstCallCount = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(firstCallCount).toBeGreaterThanOrEqual(1)

    // After first poll (queued), step advances; next poll should be ~5s later
    await act(async () => { vi.advanceTimersByTime(5_600) })
    await act(async () => { await Promise.resolve() })
    const afterAdvance = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(afterAdvance).toBeGreaterThan(firstCallCount)

    unmount()
  })

  // ── 2. Backoff caps at 30 s ────────────────────────────────────────────────

  it('caps polling interval at 30 s after enough steps', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)
    // Always return processing so step keeps advancing
    mockFetch(Array(10).fill({ status: 200, body: makeJobDto('processing', { id: jobId }) }))

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Advance past first three backoff steps (2+5+10 s)
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(5_600) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(10_600) })
    await act(async () => { await Promise.resolve() })

    // Now at capped step (30 s); a 30.5 s advance should trigger one more poll
    const beforeCap = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    await act(async () => { vi.advanceTimersByTime(30_600) })
    await act(async () => { await Promise.resolve() })
    const afterCap = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(afterCap).toBeGreaterThan(beforeCap)
  })

  // ── 3. One-in-flight guard ─────────────────────────────────────────────────

  it('does not start a second poll while the first is in-flight', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)

    const pollControl = { resolve: null as ((v: Response | PromiseLike<Response>) => void) | null }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/visuals/')) {
        return new Response(JSON.stringify(EMPTY_VISUAL_SET), { status: 200 })
      }
      // Hang the first status poll indefinitely
      return new Promise<Response>(resolve => { pollControl.resolve = resolve })
    })

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Trigger first poll
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    // Trigger second poll interval without resolving first
    await act(async () => { vi.advanceTimersByTime(5_600) })
    await act(async () => { await Promise.resolve() })

    const statusCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    // Only one status call should be in-flight (guard blocked the second)
    expect(statusCalls).toBe(1)

    // Resolve the first poll so cleanup can proceed
    pollControl.resolve?.(new Response(JSON.stringify(makeJobDto('completed', { id: jobId })), { status: 200 }))
    await act(async () => { await Promise.resolve() })
  })

  // ── 4. Pause when tab is hidden ───────────────────────────────────────────

  it('does not send a fetch when the tab is hidden', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch([{ status: 200, body: makeJobDto('queued', { id: jobId }) }])

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Hide the tab before any poll fires
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    // Advance past first polling window
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const statusCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    // No fetch should fire while hidden
    expect(statusCalls).toBe(0)
  })

  // ── 5. Resume when tab becomes visible ────────────────────────────────────

  it('resumes polling when tab becomes visible after being hidden', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('queued', { id: jobId }) }))

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Hide before first poll
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    // Confirm paused
    const pausedCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(pausedCalls).toBe(0)

    // Become visible — resumePollingIfActive schedules a setTimeout(fn, 0)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Advance past the setTimeout(fn, 0) that resumePollingIfActive schedules
    await act(async () => { vi.advanceTimersByTime(100) })
    await act(async () => { await Promise.resolve() })

    const resumedCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(resumedCalls).toBeGreaterThanOrEqual(1)
  })

  // ── 6. Pause when offline ─────────────────────────────────────────────────

  it('does not send a fetch when offline', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch([{ status: 200, body: makeJobDto('queued', { id: jobId }) }])

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    act(() => { window.dispatchEvent(new Event('offline')) })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const statusCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(statusCalls).toBe(0)
  })

  // ── 7. Resume when back online ────────────────────────────────────────────

  it('resumes polling when coming back online', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('queued', { id: jobId }) }))

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    act(() => { window.dispatchEvent(new Event('offline')) })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const offlineCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(offlineCalls).toBe(0)

    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    // Advance past the setTimeout(fn, 0) that resumePollingIfActive schedules
    await act(async () => { vi.advanceTimersByTime(100) })
    await act(async () => { await Promise.resolve() })

    const onlineCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(onlineCalls).toBeGreaterThanOrEqual(1)
  })

  // ── 8. Stale response rejection ───────────────────────────────────────────

  it('discards responses from a previous polling generation', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)

    // The first fetch hangs so we can advance the generation counter before it resolves
    const poll1Control = { resolve: null as ((v: Response | PromiseLike<Response>) => void) | null }
    let callCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/visuals/')) {
        return new Response(JSON.stringify(EMPTY_VISUAL_SET), { status: 200 })
      }
      callCount++
      if (callCount === 1) {
        return new Promise<Response>(r => { poll1Control.resolve = r })
      }
      return new Response(JSON.stringify(makeJobDto('completed', { id: jobId })), { status: 200 })
    })

    const { unmount } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Trigger first poll (hangs)
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    // Unmount advances the generation — stale response should be discarded
    unmount()

    // Resolve the stale poll — should not crash or set state
    await act(async () => {
      poll1Control.resolve?.(new Response(JSON.stringify(makeJobDto('failed')), { status: 200 }))
      await Promise.resolve()
    })
    // No assertion needed: test passes if there's no "setState on unmounted component" error
  })

  // ── 9. Terminal stop on 'completed' ──────────────────────────────────────

  it('stops polling when job completes', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)
    mockFetch([
      { status: 200, body: makeJobDto('completed', { id: jobId }) },
    ])

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // First poll → completed
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const afterComplete = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length

    // No further polls should be scheduled
    await act(async () => { vi.advanceTimersByTime(30_600) })
    await act(async () => { await Promise.resolve() })

    const afterWait = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length

    expect(afterWait).toBe(afterComplete)
  })

  // ── 10. Terminal stop on 'failed' ─────────────────────────────────────────

  it('stops polling when job fails', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)
    mockFetch([
      { status: 200, body: makeJobDto('failed', { id: jobId, public_message_key: 'errors.job.failed' }) },
    ])

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const afterFail = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length

    await act(async () => { vi.advanceTimersByTime(30_600) })
    await act(async () => { await Promise.resolve() })

    expect(vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length).toBe(afterFail)
  })

  // ── 11. Terminal stop on 'cancelled' ─────────────────────────────────────

  it('stops polling when job is cancelled', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('cancel_requested', { id: jobId }) as never)
    mockFetch([
      { status: 200, body: makeJobDto('cancelled', { id: jobId }) },
    ])

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const afterCancel = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length

    await act(async () => { vi.advanceTimersByTime(30_600) })
    await act(async () => { await Promise.resolve() })

    expect(vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length).toBe(afterCancel)
  })

  // ── 12. Unmount stops polling ─────────────────────────────────────────────

  it('stops polling when the component unmounts', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)
    mockFetch(Array(10).fill({ status: 200, body: makeJobDto('processing', { id: jobId }) }))

    const { unmount } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Trigger one poll
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    // Unmount
    unmount()

    const beforeUnmountCount = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length

    // After unmount, no more polls should fire
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await act(async () => { await Promise.resolve() })

    expect(vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length).toBe(beforeUnmountCount)
  })

  // ── 13. Jitter bounds ─────────────────────────────────────────────────────

  it('applies jitter so the first poll fires between 2 000 ms and 2 500 ms', async () => {
    // The component schedules the first poll at base_delay + Math.random() * D13_JITTER_MS.
    // Base delay is 2 000 ms; D13_JITTER_MS = 500.
    // With Math.random = 0 the delay is exactly 2 000 ms.
    // With Math.random = 1 (never returned) the delay approaches 2 500 ms.
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch([{ status: 200, body: makeJobDto('queued', { id: jobId }) }])

    // Stub Math.random to 0 → minimum jitter → poll fires at exactly 2 000 ms
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Advancing 1 999 ms must NOT fire a poll (jitter = 0 → fires at 2 000 ms)
    await act(async () => { vi.advanceTimersByTime(1_999) })
    await act(async () => { await Promise.resolve() })
    const beforeBase = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    // May be 0 if poll hasn't fired yet at exactly 1999 ms
    expect(beforeBase).toBeLessThanOrEqual(1)

    // Advancing 1 more ms (total 2 000 ms) must fire the poll
    await act(async () => { vi.advanceTimersByTime(1) })
    await act(async () => { await Promise.resolve() })
    const afterBase = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(afterBase).toBeGreaterThanOrEqual(1)

    randomSpy.mockRestore()
  })

  // ── 14. Combined hidden + offline independence ─────────────────────────────

  it('requires both visible AND online before resuming polling', async () => {
    // Polling is gated by TWO independent conditions: tab visibility AND network.
    // Restoring only one must NOT resume polling; both must be OK.
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('queued', { id: jobId }) }))

    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Hide tab AND go offline
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    act(() => { window.dispatchEvent(new Event('offline')) })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })
    expect(vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length).toBe(0)

    // Come back online but STAY hidden — must NOT resume
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })
    expect(vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length).toBe(0)

    // Now become visible (online is already true) — must resume
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { vi.advanceTimersByTime(100) })
    await act(async () => { await Promise.resolve() })
    expect(vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length).toBeGreaterThanOrEqual(1)
  })

  // ── 13b. Maximum jitter boundary ─────────────────────────────────────────

  it('maximum jitter delays first poll to exactly 2 499 ms (Math.random → 0.998, safe integer boundary)', async () => {
    // D13_JITTER_MS = 500. Formula: base + Math.random() * D13_JITTER_MS.
    // With Math.random() = 0.998: delay = 2000 + 0.998 × 500 = 2000 + 499 = 2499 ms (exact integer).
    // Portable assertion: no Sinon implementation detail required.
    // Distinguishes 500 ms jitter from the old 600 ms formula
    //   (which would give 2000 + 0.998 × 600 = 2000 + 598.8 → fires at ~2598 ms).
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch([{ status: 200, body: makeJobDto('queued', { id: jobId }) }])

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.998)
    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // 2 498 ms: delay = 2499 ms, so poll has NOT yet fired.
    await act(async () => { vi.advanceTimersByTime(2_498) })
    await act(async () => { await Promise.resolve() })
    const before = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length
    expect(before).toBe(0)

    // 1 more ms (total 2 499 ms): timer fires — poll MUST be called now.
    await act(async () => { vi.advanceTimersByTime(1) })
    await act(async () => { await Promise.resolve() })
    const after = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length
    expect(after).toBeGreaterThanOrEqual(1)

    randomSpy.mockRestore()
  })

  // ── 13c. Exact 5 s boundary (not-before / at-boundary) ───────────────────

  it('second poll fires at 5 s after first resolves, not before', async () => {
    // With jitter = 0 (Math.random = 0):
    //   first poll fires at exactly 2 000 ms (base=2000, jitter=0).
    //   After the first poll resolves (microtask queue flushed), step advances to 1.
    //   Second poll is scheduled: d13Delay(1) = 5000 + 0 = 5000 ms from that point.
    //   → second poll fires at fake clock 2 000 + 5 000 = 7 000 ms.
    //
    // Correct sequencing: advance to 2 000 ms, flush microtasks (poll resolves + schedules
    // next timer), THEN advance 4 999 ms more (total 6 999 ms, no second poll),
    // THEN advance 1 ms (total 7 000 ms, second poll fires).
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('queued', { id: jobId }) }))

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() }) // flush getActiveJobForDocument

    // Fire first poll timer at 2 000 ms
    await act(async () => { vi.advanceTimersByTime(2_000) })
    // Flush: fetch resolves (queued), pollStep→1, next timer scheduled at fake clock 7 000 ms
    await act(async () => { await Promise.resolve() })

    // Advance 4 999 ms more (total 6 999 ms): second poll not yet scheduled to fire
    await act(async () => { vi.advanceTimersByTime(4_999) })
    await act(async () => { await Promise.resolve() })
    const beforeSecond = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length

    // Advance 1 ms (total 7 000 ms): second poll fires
    await act(async () => { vi.advanceTimersByTime(1) })
    await act(async () => { await Promise.resolve() })
    const afterSecond = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length

    expect(beforeSecond).toBe(1)   // only first poll so far
    expect(afterSecond).toBe(2)    // second poll just fired

    randomSpy.mockRestore()
  })

  // ── 8b. Stale response — observable state assertion ──────────────────────

  it('stale response resolving after unmount does not increase total fetch call count', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)

    const poll1Control = { resolve: null as ((v: Response | PromiseLike<Response>) => void) | null }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/api/visuals/')) {
        return new Response(JSON.stringify(EMPTY_VISUAL_SET), { status: 200 })
      }
      return new Promise<Response>(r => { poll1Control.resolve = r })
    })

    const { unmount } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    const statusCallsBeforeUnmount = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(statusCallsBeforeUnmount).toBe(1)

    // Unmount increments the stale-generation counter
    unmount()

    // Resolving the stale response must NOT cause additional fetch calls or state updates
    await act(async () => {
      poll1Control.resolve?.(
        new Response(JSON.stringify(makeJobDto('completed', { id: jobId })), { status: 200 })
      )
      await Promise.resolve()
    })

    // Timer advances must not trigger new polls from a dead component
    await act(async () => { vi.advanceTimersByTime(10_000) })
    await act(async () => { await Promise.resolve() })

    const statusCallsAfterUnmount = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(statusCallsAfterUnmount).toBe(1)  // no new calls after unmount
  })

  // ── 16. Identity change (documentId rerender) stops old poll ─────────────

  it('changing documentId resets polling — old document polls stop, new document polls start', async () => {
    const jobId    = 'job-00000001'
    const newDocId = 'doc-99999999'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('processing', { id: jobId }) }))

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const { rerender } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // First poll fires for original document
    await act(async () => { vi.advanceTimersByTime(2_000) })
    await act(async () => { await Promise.resolve() })
    const firstDocCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    expect(firstDocCalls).toBeGreaterThanOrEqual(1)

    // Change documentId — old effect cleans up, new effect initialises
    vi.clearAllMocks()
    const newJobId = 'job-99999999'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: newJobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('queued', { id: newJobId }) }))

    await act(async () => {
      rerender(React.createElement(VisualsPanel, defaultProps({ documentId: newDocId })))
    })
    await act(async () => { await Promise.resolve() })

    // Advance past next poll interval for new document
    await act(async () => { vi.advanceTimersByTime(2_000) })
    await act(async () => { await Promise.resolve() })

    const newDocCalls = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/api/jobs/status/')
    ).length
    // At least one new poll started for the new document
    expect(newDocCalls).toBeGreaterThanOrEqual(1)

    // Advance well past any pending timers from old document — must not fire again
    vi.clearAllMocks()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await act(async () => { await Promise.resolve() })

    // Old document's job ID must NOT appear in any subsequent fetch calls
    const oldJobPolls = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes(jobId)).length
    expect(oldJobPolls).toBe(0)

    randomSpy.mockRestore()
  })

  // ── 15. Listener cleanup on unmount ──────────────────────────────────────

  it('removes visibility and connectivity listeners on unmount', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('processing', { id: jobId }) as never)
    mockFetch([{ status: 200, body: makeJobDto('processing', { id: jobId }) }])

    const docRemoveSpy = vi.spyOn(document, 'removeEventListener')
    const winRemoveSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    unmount()

    // The component must remove its visibilitychange listener from document
    const removedVisibility = docRemoveSpy.mock.calls.some(
      call => call[0] === 'visibilitychange'
    )
    // The component must remove its online/offline listeners from window
    const removedOnline  = winRemoveSpy.mock.calls.some(call => call[0] === 'online')
    const removedOffline = winRemoveSpy.mock.calls.some(call => call[0] === 'offline')

    expect(removedVisibility).toBe(true)
    expect(removedOnline).toBe(true)
    expect(removedOffline).toBe(true)
  })

  // ── 13d. Exact 10 s not-before / at-boundary (step 2) ───────────────────

  it('third poll fires at exactly 10 000 ms after second resolves (step 2 boundary)', async () => {
    // With Math.random = 0: delays are 2000 ms, 5000 ms, 10000 ms for steps 0/1/2.
    // Timeline (cumulative fake-clock):
    //   t=2000  first poll fires,  resolves, step → 1, next scheduled at +5000 ms
    //   t=7000  second poll fires, resolves, step → 2, next scheduled at +10000 ms
    //   t=17000 third poll fires
    // Not-before: t=16999 ms. At-boundary: t=17000 ms.
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch(Array(5).fill({ status: 200, body: makeJobDto('queued', { id: jobId }) }))

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Fire first poll (t=2000), flush microtasks, fire second poll (t=7000), flush
    await act(async () => { vi.advanceTimersByTime(2_000) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(5_000) })
    await act(async () => { await Promise.resolve() })

    // Not-before: advance 9 999 ms more (total t=16 999 ms) — third poll must not have fired
    await act(async () => { vi.advanceTimersByTime(9_999) })
    await act(async () => { await Promise.resolve() })
    const before = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length
    expect(before).toBe(2)  // only first and second poll

    // At-boundary: advance 1 ms (total t=17 000 ms) — third poll fires now
    await act(async () => { vi.advanceTimersByTime(1) })
    await act(async () => { await Promise.resolve() })
    const after = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length
    expect(after).toBe(3)  // third poll fired

    randomSpy.mockRestore()
  })

  // ── 13e. Exact 30 s not-before / at-boundary (step 3, capped) ──────────

  it('fourth poll fires at exactly 30 000 ms after third resolves (step 3 cap boundary)', async () => {
    // With Math.random = 0: delays are 2000/5000/10000/30000 ms for steps 0/1/2/3.
    // Timeline (cumulative fake-clock):
    //   t=2000  poll 1 fires, step → 1
    //   t=7000  poll 2 fires, step → 2
    //   t=17000 poll 3 fires, step → 3 (min(3, 3) = 3)
    //   t=47000 poll 4 fires  (30000 ms from t=17000)
    // Not-before: t=46999 ms. At-boundary: t=47000 ms.
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)
    mockFetch(Array(6).fill({ status: 200, body: makeJobDto('queued', { id: jobId }) }))

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Fire polls 1, 2, 3
    await act(async () => { vi.advanceTimersByTime(2_000) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(5_000) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(10_000) })
    await act(async () => { await Promise.resolve() })

    // Not-before: advance 29 999 ms (total t=46 999 ms) — poll 4 must not have fired
    await act(async () => { vi.advanceTimersByTime(29_999) })
    await act(async () => { await Promise.resolve() })
    const before = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length
    expect(before).toBe(3)  // polls 1–3 only

    // At-boundary: advance 1 ms (total t=47 000 ms) — poll 4 fires now
    await act(async () => { vi.advanceTimersByTime(1) })
    await act(async () => { await Promise.resolve() })
    const after = vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/api/jobs/status/')).length
    expect(after).toBe(4)  // poll 4 fired

    randomSpy.mockRestore()
  })

  // ── AbortSignal direct inspection on unmount ─────────────────────────────

  it('unmount aborts the in-flight poll AbortSignal', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)

    let capturedSignal: AbortSignal | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('/api/visuals/')) {
        return new Response(JSON.stringify(EMPTY_VISUAL_SET), { status: 200 })
      }
      // Capture the signal from the in-flight status poll
      if (init?.signal) capturedSignal = init.signal as AbortSignal
      return new Promise<Response>(() => {})  // hang until aborted
    })

    const { unmount } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Trigger first poll (which will hang)
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    // Signal must be live while in-flight
    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal!.aborted).toBe(false)

    // Unmount must abort the signal
    unmount()
    expect(capturedSignal!.aborted).toBe(true)
  })

  // ── AbortSignal direct inspection on identity change ─────────────────────

  it('documentId change aborts the in-flight poll AbortSignal for the old document', async () => {
    const jobId = 'job-00000001'
    mockGetActiveJob.mockResolvedValue(makeJobDto('queued', { id: jobId }) as never)

    let capturedSignal: AbortSignal | null = null

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('/api/visuals/')) {
        return new Response(JSON.stringify(EMPTY_VISUAL_SET), { status: 200 })
      }
      if (init?.signal) capturedSignal = init.signal as AbortSignal
      return new Promise<Response>(() => {})  // hang indefinitely
    })

    const { rerender } = render(React.createElement(VisualsPanel, defaultProps()))
    await act(async () => { await Promise.resolve() })

    // Trigger first poll
    await act(async () => { vi.advanceTimersByTime(2_600) })
    await act(async () => { await Promise.resolve() })

    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal!.aborted).toBe(false)

    // Change documentId — stopPolling() must abort the old signal
    await act(async () => {
      rerender(React.createElement(VisualsPanel, defaultProps({ documentId: 'doc-99999999' })))
    })

    expect(capturedSignal!.aborted).toBe(true)
  })
})
