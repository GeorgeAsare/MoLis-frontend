'use client'

interface Props {
  hasExtractedText: boolean
  hasNotes: boolean
  hasQuiz: boolean
}

export function AIActionsSection({ hasExtractedText, hasNotes, hasQuiz }: Props) {
  function handleGenerateNotes() {
    window.dispatchEvent(new CustomEvent('molis:generate-notes'))
    document
      .getElementById('revision-notes')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleGenerateQuiz() {
    window.dispatchEvent(new CustomEvent('molis:generate-quiz'))
    document
      .getElementById('quiz-panel')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/20">
        AI Actions
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleGenerateNotes}
          disabled={!hasExtractedText}
          className={[
            'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5',
            'text-left text-sm font-medium transition-colors',
            hasNotes
              ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400/80 hover:bg-emerald-500/[0.09]'
              : !hasExtractedText
                ? 'cursor-not-allowed border-white/[0.08] bg-white/[0.03] text-white/30 opacity-50'
                : 'border-violet-500/20 bg-violet-500/[0.08] text-violet-300 hover:border-violet-500/30 hover:bg-violet-500/[0.12]',
          ].join(' ')}
        >
          <SparklesIcon className="h-4 w-4 shrink-0" />
          {hasNotes ? 'Regenerate Notes' : 'Generate Revision Notes'}
        </button>

        <button
          onClick={handleGenerateQuiz}
          disabled={!hasExtractedText}
          className={[
            'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5',
            'text-left text-sm font-medium transition-colors',
            hasQuiz
              ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400/80 hover:bg-emerald-500/[0.09]'
              : !hasExtractedText
                ? 'cursor-not-allowed border-white/[0.08] bg-white/[0.03] text-white/30 opacity-50'
                : 'border-violet-500/20 bg-violet-500/[0.08] text-violet-300 hover:border-violet-500/30 hover:bg-violet-500/[0.12]',
          ].join(' ')}
        >
          <QuizIcon className="h-4 w-4 shrink-0" />
          {hasQuiz ? 'Regenerate Quiz' : 'Generate Quiz'}
        </button>
      </div>

      {!hasExtractedText && (
        <p className="mt-2.5 text-center text-[11px] text-white/15">
          Extract text first to enable AI
        </p>
      )}
    </section>
  )
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  )
}

function QuizIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
      />
    </svg>
  )
}
