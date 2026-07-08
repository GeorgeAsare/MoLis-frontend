import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata = {
  title: 'Agents — MoLis',
}

export default function AgentsPage() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl">
      <PageHeader
        title="Agents"
        description="AI agents that capture, understand, and process real-world learning."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-2">
        <Link href="/dashboard/agents/recorder">
          <div className="group flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/15 hover:bg-card/90 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08] transition-colors group-hover:border-primary/40">
                <MicIcon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground/80">Lecture Recorder</p>
                <p className="text-[10px] text-foreground/30 font-semibold uppercase tracking-wider">Agent v1</p>
              </div>
            </div>
            <p className="text-xs leading-5 text-foreground/45">
              Record lectures, extract key terms and grounded study notes, and connect to your Study Agent.
            </p>
            <div className="flex items-center gap-1.5 text-[10px] text-foreground/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Active
            </div>
          </div>
        </Link>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card/30 p-5 opacity-50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/30">
              <WebIcon className="h-4.5 w-4.5 text-foreground/25" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground/40">Web Research Agent</p>
              <p className="text-[10px] text-foreground/20 font-semibold uppercase tracking-wider">Coming soon</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-foreground/30">
            Search, summarise, and connect external resources to your study documents.
          </p>
        </div>
      </div>
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  )
}

function WebIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  )
}
