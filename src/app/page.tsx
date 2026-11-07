import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">
        InvestSync
      </p>
      <h1 className="text-4xl font-bold text-slate-900">Virtual Fund</h1>
      <p className="text-slate-600">
        The shared app is ready. The order, approval, and dashboard screens are
        next.
      </p>
      <nav aria-label="Demo screens" className="flex flex-wrap gap-3">
        <Link className="rounded-md bg-blue-800 px-4 py-2 text-white" href="/enter-order">
          Enter order
        </Link>
        <Link className="rounded-md border border-slate-300 px-4 py-2" href="/orders">
          Orders
        </Link>
        <Link className="rounded-md border border-slate-300 px-4 py-2" href="/dashboard">
          Dashboard
        </Link>
      </nav>
    </main>
  );
}
