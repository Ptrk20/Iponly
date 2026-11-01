import { z } from "zod";

export const MAX_CHAT_MESSAGES = 8;
export const MAX_CHAT_MESSAGE_LENGTH = 4_000;

const chatMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
}).strict();

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(MAX_CHAT_MESSAGES),
}).strict().superRefine(({ messages }, context) => {
  const totalCharacters = messages.reduce((total, message) => total + message.content.length, 0);
  if (totalCharacters > 12_000) {
    context.addIssue({ code: "custom", path: ["messages"], message: "Conversation is too long." });
  }
});

const writeRequestPatterns = [
  /^\s*(?:please\s+)?(?:add|create|make|record|save|log|enter|transfer|move|withdraw|delete|remove|edit|update|change|set|archive|restore|reverse|complete|finish|cancel)\b/i,
  /\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:add|create|make|record|save|log|enter|transfer|move|withdraw|delete|remove|edit|update|change|set|archive|restore|reverse|complete|finish|cancel)\b/i,
  /\b(?:i want|i need|help me|please)\s+(?:to\s+)?(?:add|create|make|record|save|log|enter|transfer|move|withdraw|delete|remove|edit|update|change|set|archive|restore|reverse|complete|finish|cancel)\b/i,
  /\bmark\b.{0,60}\b(?:paid|complete|completed|done)\b/i,
];

export function isWriteRequest(message: string): boolean {
  return writeRequestPatterns.some((pattern) => pattern.test(message));
}

const adviceRequestPattern = /\b(?:should i|what should i|how should i|recommend(?:ation)?s?|financial advice|investment advice|tax advice|legal advice|credit advice|best investment|which investment|pay off first|refinance|invest in)\b/i;

export function isProfessionalAdviceRequest(message: string): boolean {
  return adviceRequestPattern.test(message);
}

const iponlyRoutes = {
  home: { href: "/", label: "Home" },
  savings: { href: "/savings", label: "Savings" },
  debt: { href: "/debt", label: "Debt" },
  budget: { href: "/budget", label: "Budget" },
  analytics: { href: "/analytics", label: "Analytics" },
  travel: { href: "/travel", label: "Travel" },
  settings: { href: "/settings", label: "Settings" },
} as const;

export type IponlyRouteKey = keyof typeof iponlyRoutes;

export function getSafeIponlyRoute(key: IponlyRouteKey) {
  return iponlyRoutes[key];
}

export function getSafeIponlyRouteByPath(path: string) {
  return Object.values(iponlyRoutes).find((route) => route.href === path);
}

export function isSafeIponlyRoute(value: string): boolean {
  return getSafeIponlyRouteByPath(value) !== undefined;
}

export function routeForWriteRequest(message: string): IponlyRouteKey {
  if (/\b(currency|settings|preference|theme)\b/i.test(message)) return "settings";
  if (/\b(trip|travel|hotel|flight|itinerary|packing|passport|travel task)\b/i.test(message)) return "travel";
  if (/\b(debt|installment|loan|payment|paid)\b/i.test(message)) return "debt";
  if (/\b(budget|expense|grocer|income|salary|category)\b/i.test(message)) return "budget";
  if (/\b(transaction|savings|account|deposit|withdraw|transfer|maya|gcash|bdo|bpi)\b/i.test(message)) return "savings";
  return "home";
}
