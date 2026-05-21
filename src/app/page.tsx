import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">
          The AI that understands student life
        </p>

        <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
          Your intelligent student operating system.
        </h1> 

        <p className="mt-6 max-w-2xl text-lg text-white/50">
          MoLis helps students study smarter, manage wellbeing, track money,
          and organise daily life through intelligent AI automation.
        </p>

        <div className="mt-8 flex gap-4">
          <Link
            href="/signup"
            className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/80"
          >
            Get started
          </Link>

          <Link
            href="/login"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}