export default function UnauthorizedPage() {
  return (
    <main className="auth-boundary">
      <section aria-labelledby="access-title">
        <p className="eyebrow">Axelyn Knowledge / protected register</p>
        <h1 id="access-title">Operator access required</h1>
        <p>
          This administration surface accepts an authenticated Cloudflare Access identity. Open it
          through the protected production route or ask an administrator to grant operator access.
        </p>
        <small>API clients must use a separately issued service bearer token.</small>
      </section>
    </main>
  );
}
