import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MemoryDashboard } from '@/components/memory/MemoryDashboard'
import type { UserMemory } from '@/types/userMemory'

export const metadata = {
  title: 'Memory — MoLis',
}

export default async function MemoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memories } = await supabase
    .from('user_memories')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('importance', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(100)

  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl">
      <div className="mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-foreground/25">
          Memory
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          What MoLis remembers about you
        </h1>
        <p className="mt-1.5 text-sm text-foreground/40 leading-6">
          Memories are built as you study and interact with agents. They personalise notes, tutor responses, and recommendations.
        </p>
      </div>
      <MemoryDashboard initialMemories={(memories ?? []) as UserMemory[]} />
    </div>
  )
}
