"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page-stack">
      <section aria-labelledby="error-title" className="panel error-state">
        <p className="eyebrow">Iponly</p>
        <h1 id="error-title">We couldn’t load this page.</h1>
        <p className="page-description">Your saved financial information has not been changed. Please try again.</p>
        <button className="button button-primary" onClick={reset} type="button">Try again</button>
      </section>
    </main>
  );
}
