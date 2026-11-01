import type { Metadata } from "next";
import Link from "next/link";
import { AssistantActionHistory } from "@/components/assistant-action-history";
import { requireUser } from "@/lib/auth-session";
import { getAIActionHistory } from "@/services/ai-action-service";

export const metadata: Metadata = {
  title: "AI Action History | Iponly",
  description: "Review actions prepared and completed by Iponly AI.",
};

export const instant = false;

export default async function AssistantHistoryPage() {
  const user = await requireUser();
  const entries = await getAIActionHistory(user.id);
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Iponly AI</p>
          <h1>Action history</h1>
          <p className="page-description">Review proposals, confirmations, and outcomes. AI action proposals expire after five minutes.</p>
        </div>
        <Link className="button button-secondary" href="/assistant">Back to Iponly AI</Link>
      </header>
      <AssistantActionHistory initialEntries={entries} />
    </div>
  );
}
