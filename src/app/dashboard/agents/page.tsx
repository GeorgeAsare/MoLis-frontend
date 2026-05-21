export const metadata = {
  title: 'Agents — MoLis',
}

export default function AgentsPage() {
  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Agents</h1>
        <p className="mt-1 text-sm text-white/40">Your AI agents and their activity</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-sm text-white/30">Agents will appear here once connected to the backend</p>
      </div>
    </div>
  )
}
