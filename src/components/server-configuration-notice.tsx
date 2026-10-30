import { CircleAlert, Database } from "lucide-react";

export function ServerConfigurationNotice() {
  return (
    <main className="configuration-page">
      <section aria-labelledby="configuration-title" className="configuration-panel">
        <span aria-hidden="true" className="configuration-icon"><Database size={22} /></span>
        <p className="eyebrow">Local setup needed</p>
        <h1 id="configuration-title">Connect Iponly to its database.</h1>
        <p className="configuration-copy">Authentication and private pages stay unavailable until the server configuration is complete. No financial fixture data has been loaded as account data.</p>
        <div className="configuration-callout" role="status">
          <CircleAlert aria-hidden="true" size={17} />
          <span>Copy `.env.example` to `.env.local`, enter your Neon connection string and local auth URLs, then restart the dev server.</span>
        </div>
        <ul className="configuration-list">
          <li><code>DATABASE_URL</code><span>Neon PostgreSQL connection string</span></li>
          <li><code>BETTER_AUTH_SECRET</code><span>At least 32 random characters</span></li>
          <li><code>BETTER_AUTH_URL</code><span>For local development: http://localhost:3000</span></li>
          <li><code>NEXT_PUBLIC_APP_URL</code><span>For local development: http://localhost:3000</span></li>
        </ul>
        <p className="configuration-footnote">After configuration, apply the schema with <code>npm run db:migrate</code>.</p>
      </section>
    </main>
  );
}