import { describe, it, expect } from 'vitest'

// ── Pure helpers mirrored from tutor.ts ───────────────────────────────────────

const ACK_WORDS = new Set([
  'okay', 'ok', 'yes', 'yeah', 'yep', 'yup', 'got it', 'makes sense',
  'understood', 'alright', 'cool', 'thanks', 'thank you', 'i see',
  'i get it', 'sure', 'nice', 'great', 'perfect', 'sounds good',
  'good', 'fair enough', 'right', 'gotcha', 'noted', 'k',
])

function isAcknowledgement(q: string): boolean {
  const normalized = q.toLowerCase().trim().replace(/[.!?,]+$/, '')
  return ACK_WORDS.has(normalized)
}

const CLARIFICATION_PHRASES = [
  'explain again', 'explain differently', "don't get it", 'dont get it',
  "don't understand", 'dont understand', 'what do you mean', 'simpler',
  'give me an example', 'give an example', 'show me code', 'show code',
  'give code', 'code example', 'different explanation', 'different way',
  "i still don't", 'i still dont', 'not clear', 'confused', 'lost me',
  'one more example', 'another example', 'can you elaborate',
]

function needsClarification(q: string): boolean {
  const normalized = q.toLowerCase().trim()
  return CLARIFICATION_PHRASES.some(p => normalized.includes(p))
}

const META_HELP_PHRASES = [
  'who are you', 'what are you', 'what can you do', 'how can you help',
  'how do you work', 'what is molis', 'what is this app',
]

function isMetaHelp(q: string): boolean {
  const normalized = q.toLowerCase().trim()
  return META_HELP_PHRASES.some(p => normalized.includes(p))
}

function parseActionTag(text: string): {
  answer: string
  suggestedAction: { type: string; concept_title?: string; label: string } | null
} {
  const match = text.match(/^ACTION:\s*(\w+)\s*\|\s*([^|\n]*)\s*\|\s*(.+)$/m)
  if (!match) return { answer: text.trim(), suggestedAction: null }

  const VALID = new Set(['open_notes', 'open_flashcards', 'open_quiz', 'open_visuals', 'open_weak_topics', 'continue_tutor'])
  const type = match[1].trim()
  if (!VALID.has(type)) return { answer: text.trim(), suggestedAction: null }

  const concept_title = match[2].trim() || undefined
  const label = match[3].trim()
  const answer = text.replace(/\n?ACTION:[^\n]+$/m, '').trim()
  return { answer, suggestedAction: { type, concept_title, label } }
}

// ── isAcknowledgement ─────────────────────────────────────────────────────────

describe('isAcknowledgement', () => {
  it('detects simple ack words', () => {
    expect(isAcknowledgement('ok')).toBe(true)
    expect(isAcknowledgement('thanks')).toBe(true)
    expect(isAcknowledgement('got it')).toBe(true)
    expect(isAcknowledgement('gotcha')).toBe(true)
  })

  it('strips trailing punctuation before matching', () => {
    expect(isAcknowledgement('thanks!')).toBe(true)
    expect(isAcknowledgement('okay.')).toBe(true)
    expect(isAcknowledgement('great?')).toBe(true)
  })

  it('returns false for real questions', () => {
    expect(isAcknowledgement('What is inheritance?')).toBe(false)
    expect(isAcknowledgement('explain polymorphism')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isAcknowledgement('OK')).toBe(true)
    expect(isAcknowledgement('Understood')).toBe(true)
  })
})

// ── needsClarification ────────────────────────────────────────────────────────

describe('needsClarification', () => {
  it('detects clarification requests', () => {
    expect(needsClarification('can you explain again?')).toBe(true)
    expect(needsClarification('I am confused about this')).toBe(true)
    expect(needsClarification('give me an example')).toBe(true)
    expect(needsClarification('show me code')).toBe(true)
    expect(needsClarification('i dont get it')).toBe(true)
  })

  it('returns false for new questions', () => {
    expect(needsClarification('What is a binary tree?')).toBe(false)
    expect(needsClarification('ok, I understand')).toBe(false)
  })
})

// ── isMetaHelp ────────────────────────────────────────────────────────────────

describe('isMetaHelp', () => {
  it('detects meta questions about the tutor', () => {
    expect(isMetaHelp('who are you?')).toBe(true)
    expect(isMetaHelp('what can you do?')).toBe(true)
    expect(isMetaHelp('what is molis?')).toBe(true)
  })

  it('returns false for study questions', () => {
    expect(isMetaHelp('explain recursion')).toBe(false)
    expect(isMetaHelp('what is polymorphism?')).toBe(false)
  })
})

// ── parseActionTag ────────────────────────────────────────────────────────────

describe('parseActionTag', () => {
  it('parses a valid ACTION tag', () => {
    const text = 'Here is my explanation.\nACTION: open_flashcards | Recursion | Study Recursion flashcards'
    const { answer, suggestedAction } = parseActionTag(text)
    expect(answer).toBe('Here is my explanation.')
    expect(suggestedAction).not.toBeNull()
    expect(suggestedAction!.type).toBe('open_flashcards')
    expect(suggestedAction!.concept_title).toBe('Recursion')
    expect(suggestedAction!.label).toBe('Study Recursion flashcards')
  })

  it('strips the ACTION line from the answer', () => {
    const text = 'Explanation text.\nACTION: open_quiz | Trees | Take Trees quiz'
    const { answer } = parseActionTag(text)
    expect(answer).not.toContain('ACTION:')
  })

  it('returns null action for invalid type', () => {
    const text = 'text\nACTION: open_browser | thing | label'
    const { suggestedAction } = parseActionTag(text)
    expect(suggestedAction).toBeNull()
  })

  it('handles empty concept_title', () => {
    const text = 'text\nACTION: open_weak_topics |  | See weak topics'
    const { suggestedAction } = parseActionTag(text)
    expect(suggestedAction).not.toBeNull()
    expect(suggestedAction!.concept_title).toBeUndefined()
  })

  it('returns full text as answer when no ACTION tag', () => {
    const text = 'Just a plain response with no action.'
    const { answer, suggestedAction } = parseActionTag(text)
    expect(answer).toBe(text)
    expect(suggestedAction).toBeNull()
  })
})
