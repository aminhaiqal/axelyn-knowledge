export default function UnauthorizedPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[color:var(--background)] px-6 py-12">
      <section className="relative w-full max-w-2xl border border-[#dce3ed] bg-[#fcfcfd] p-8 sm:p-12">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3557ff]">
          Axelyn Knowledge / protected register
        </p>
        <h1 className="mt-4 text-4xl leading-none font-semibold tracking-[-0.05em] text-slate-950 sm:text-6xl">
          Operator access required
        </h1>
        <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
          This administration surface accepts an authenticated Cloudflare Access identity. Open it
          through the protected production route or ask an administrator to grant operator access.
        </p>
        <p className="mt-8 border-t border-[#ddd5c9] pt-5 text-sm leading-7 text-slate-500">
          API clients must use a separately issued service bearer token.
        </p>
      </section>
    </main>
  );
}
