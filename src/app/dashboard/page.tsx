import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Dashboard — MoLis',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const name = user?.user_metadata?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">
          Good to see you, {name}
        </h1>
        <p className="mt-1 text-sm text-white/40">
          Your AI operating system is ready.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard
          title="Agents"
          description="Your active AI agents"
          href="/dashboard/agents"
          status="idle"
        />
        <StatusCard
          title="Memory"
          description="What MoLis remembers"
          href="/dashboard/memory"
          status="idle"
        />
      </div>
    </div>
  )
}

function StatusCard({
  title,
  description,
  href,
  status,
}: {
  title: string
  description: string
  href: string
  status: 'active' | 'idle' | 'error'
}) {
  const statusColors = {
    active: 'bg-emerald-500',
    idle: 'bg-white/20',
    error: 'bg-red-500',
  }

  return (
    <a
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-white/20 hover:bg-white/10"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{title}</span>
        <span className={`h-2 w-2 rounded-full ${statusColors[status]}`} />
      </div>
      <p className="text-xs text-white/40">{description}</p>
    </a>
  )
}
