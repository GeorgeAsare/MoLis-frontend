export const metadata = {
  title: 'Memory — MoLis',
}

export default function MemoryPage() {
  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Memory</h1>
        <p className="mt-1 text-sm text-white/40">What MoLis Intelligence remembers about you</p>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-sm text-white/30">Memory records will appear here once connected to the backend</p>
      </div>
    </div>
  )
}
