import { describe, it, expect } from 'vitest'

// Re-export the private function for testing by extracting its logic here.
// The extractTopic function is not exported, so we duplicate its contract and
// test the observable behaviour through a thin wrapper that mirrors the impl.

// ── extractTopic (mirrored from weakTopics.ts) ────────────────────────────────

const QUESTION_PREFIXES = [
  /^(what (is|are|does|do|was|were))\s+/i,
  /^(which (of the following|one|approach|statement))\s+/i,
  /^(how (does|do|is|are|was|were|can))\s+/i,
  /^(why (does|do|is|are|was|were))\s+/i,
  /^(when (does|do|is|are|was|were))\s+/i,
  /^(who (is|was|are|were))\s+/i,
  /^(where (does|do|is|are|was|were))\s+/i,
  /^true or false:?\s+/i,
  /^(describe|explain|define|identify|evaluate|analyse|analyze|calculate|determine|compare)\s+/i,
  /^in (this|the|a) (following )?scenario[,.]?\s+/i,
  /^(a |an |the )/i,
]

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'on', 'at', 'by',
  'for', 'with', 'from', 'about', 'as', 'into', 'through', 'that', 'this', 'these',
  'those', 'it', 'its', 'their', 'they', 'them', 'we', 'our', 'you', 'your', 'he',
  'she', 'his', 'her', 'and', 'or', 'but', 'if', 'when', 'then', 'so', 'also',
  'not', 'no', 'nor', 'both', 'either', 'used', 'following', 'most', 'best',
  'typically', 'generally', 'often', 'usually', 'always', 'never', 'first',
])

function extractTopic(question: string): string {
  let text = question.replace(/[?!.]+$/, '').trim()
  let changed = true
  while (changed) {
    changed = false
    for (const pattern of QUESTION_PREFIXES) {
      const next = text.replace(pattern, '').trim()
      if (next !== text) { text = next; changed = true; break }
    }
  }
  const words = text.split(/\s+/)
  const meaningful = words
    .map(w => w.replace(/[^a-zA-Z0-9-]/g, ''))
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4)
  const result = meaningful.length > 0 ? meaningful.join(' ') : words.slice(0, 3).join(' ')
  return result.charAt(0).toUpperCase() + result.slice(1)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('extractTopic', () => {
  it('strips "What is" prefix', () => {
    expect(extractTopic('What is polymorphism?')).toBe('Polymorphism')
  })

  it('strips "How does" prefix', () => {
    expect(extractTopic('How does garbage collection work?')).toBe('Garbage collection')
  })

  it('strips "True or false:" prefix', () => {
    expect(extractTopic('True or false: Inheritance is a pillar of OOP')).toBe('Inheritance pillar OOP')
  })

  it('strips "Explain" prefix', () => {
    expect(extractTopic('Explain the concept of encapsulation')).toBe('Concept encapsulation')
  })

  it('strips "Which of the following" prefix', () => {
    expect(extractTopic('Which of the following describes a stack?')).toBe('Describes stack')
  })

  it('handles plain-noun questions without prefix', () => {
    const t = extractTopic('Recursion and base cases')
    expect(t).toBe('Recursion base cases')
  })

  it('capitalises first letter', () => {
    const t = extractTopic('What are neural networks?')
    expect(t[0]).toBe(t[0].toUpperCase())
  })

  it('limits to 4 meaningful words', () => {
    const t = extractTopic('What is the difference between supervised and unsupervised machine learning?')
    const wordCount = t.split(' ').length
    expect(wordCount).toBeLessThanOrEqual(4)
  })

  it('removes punctuation from words', () => {
    const t = extractTopic("What is Python's role in data science?")
    expect(t).not.toContain("'")
  })
})
