export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">MoLis</h1>
          <p className="mt-1 text-sm text-white/40">AI-powered student operating system</p>
        </div>
        {children}
      </div>
    </div>
  )
}
