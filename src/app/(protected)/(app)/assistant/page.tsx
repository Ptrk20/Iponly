import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssistantChat } from "@/components/assistant-chat";
import { getAIConfiguration } from "@/lib/ai/config";

export const metadata: Metadata = {
  title: "Iponly AI",
  description: "Ask questions about your savings, budget, debts, analytics, and travel plans.",
};

export default function AssistantPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AssistantChat providerAvailable={Boolean(getAIConfiguration())} />;
}
