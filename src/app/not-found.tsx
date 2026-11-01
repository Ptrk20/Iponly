import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-stack">
      <section aria-labelledby="not-found-title" className="panel error-state">
        <p className="eyebrow">Iponly</p>
        <h1 id="not-found-title">We couldn’t find that page.</h1>
        <p className="page-description">The page may have moved, or it may not be available.</p>
        <Link className="button button-primary" href="/">Go to Iponly</Link>
      </section>
    </main>
  );
}
