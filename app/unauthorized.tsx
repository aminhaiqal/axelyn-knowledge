export default function UnauthorizedPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[color:var(--background)] px-6 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_28%),radial-gradient(circle_at_80%_16%,rgba(15,23,42,0.1),transparent_22%)]" />
      <section className="relative w-full max-w-2xl rounded-[32px] border border-slate-200/80 bg-white/85 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:p-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-700/70">
          Axelyn Knowledge / protected register
        </p>
        <h1 className="mt-4 font-serif text-4xl leading-none tracking-tight text-slate-950 sm:text-6xl">
          Operator access required
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
          This administration surface accepts an authenticated Cloudflare Access identity. Open it
          through the protected production route or ask an administrator to grant operator access.
        </p>
        <p className="mt-8 border-t border-slate-200/80 pt-5 text-sm leading-7 text-slate-500">
          API clients must use a separately issued service bearer token.
        </p>
      </section>
    </main>
  );
}
