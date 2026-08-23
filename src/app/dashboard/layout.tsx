import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? ''
  const firstName = fullName.split(' ')[0] ?? ''
  const email = user.email ?? ''

  return (
    <DashboardShell user={{ name: firstName, email }}>
      {children}
    </DashboardShell>
  )
}
