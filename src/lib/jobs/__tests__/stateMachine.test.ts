import { describe, it, expect } from 'vitest'
import {
  isLegalClientTransition,
  isTerminal,
  isActive,
  TERMINAL_STATUSES,
  ACTIVE_STATUSES,
} from '../stateMachine'
import type { JobStatus } from '../stateMachine'

const ALL_STATUSES: JobStatus[] = [
  'queued', 'processing', 'cancel_requested', 'completed', 'failed', 'cancelled',
]

describe('TERMINAL_STATUSES', () => {
  it('contains completed, failed, cancelled', () => {
    expect(TERMINAL_STATUSES.has('completed')).toBe(true)
    expect(TERMINAL_STATUSES.has('failed')).toBe(true)
    expect(TERMINAL_STATUSES.has('cancelled')).toBe(true)
  })
  it('does not contain active statuses', () => {
    expect(TERMINAL_STATUSES.has('queued')).toBe(false)
    expect(TERMINAL_STATUSES.has('processing')).toBe(false)
    expect(TERMINAL_STATUSES.has('cancel_requested')).toBe(false)
  })
})

describe('ACTIVE_STATUSES', () => {
  it('contains queued, processing, cancel_requested', () => {
    expect(ACTIVE_STATUSES.has('queued')).toBe(true)
    expect(ACTIVE_STATUSES.has('processing')).toBe(true)
    expect(ACTIVE_STATUSES.has('cancel_requested')).toBe(true)
  })
  it('does not contain terminal statuses', () => {
    expect(ACTIVE_STATUSES.has('completed')).toBe(false)
    expect(ACTIVE_STATUSES.has('failed')).toBe(false)
    expect(ACTIVE_STATUSES.has('cancelled')).toBe(false)
  })
})

describe('isTerminal', () => {
  it('returns true for terminal statuses', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
  })
  it('returns false for active statuses', () => {
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('processing')).toBe(false)
    expect(isTerminal('cancel_requested')).toBe(false)
  })
})

describe('isActive', () => {
  it('returns true for active statuses', () => {
    expect(isActive('queued')).toBe(true)
    expect(isActive('processing')).toBe(true)
    expect(isActive('cancel_requested')).toBe(true)
  })
  it('returns false for terminal statuses', () => {
    expect(isActive('completed')).toBe(false)
    expect(isActive('failed')).toBe(false)
    expect(isActive('cancelled')).toBe(false)
  })
})

describe('isLegalClientTransition — D1 model', () => {
  it('queued → cancelled is legal (direct cancel of unstarted job)', () => {
    expect(isLegalClientTransition('queued', 'cancelled')).toBe(true)
  })
  it('processing → cancel_requested is legal (request cancel of running job)', () => {
    expect(isLegalClientTransition('processing', 'cancel_requested')).toBe(true)
  })

  it('queued → cancel_requested is illegal (must go through processing first)', () => {
    expect(isLegalClientTransition('queued', 'cancel_requested')).toBe(false)
  })
  it('processing → cancelled is illegal (client cannot skip cancel_requested)', () => {
    expect(isLegalClientTransition('processing', 'cancelled')).toBe(false)
  })
  it('cancel_requested → cancelled is illegal (worker, not client, acknowledges cancel)', () => {
    expect(isLegalClientTransition('cancel_requested', 'cancelled')).toBe(false)
  })

  it('terminal statuses have no legal outbound client transitions', () => {
    const terminals: JobStatus[] = ['completed', 'failed', 'cancelled']
    for (const from of terminals) {
      for (const to of ALL_STATUSES) {
        expect(isLegalClientTransition(from, to)).toBe(false)
      }
    }
  })

  it('same-status transitions are always illegal', () => {
    for (const status of ALL_STATUSES) {
      expect(isLegalClientTransition(status, status)).toBe(false)
    }
  })

  it('active and terminal sets are disjoint and together exhaust all statuses', () => {
    for (const s of ALL_STATUSES) {
      expect(isActive(s) !== isTerminal(s)).toBe(true)
    }
    expect(ALL_STATUSES.every(s => isActive(s) || isTerminal(s))).toBe(true)
  })
})
