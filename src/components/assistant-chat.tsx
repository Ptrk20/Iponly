"use client";

import { Bot, CircleHelp, LoaderCircle, Send, Sparkles, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { getSafeIponlyRouteByPath } from "@/lib/ai/safety";
import { AssistantMessageText } from "@/components/assistant-message-text";
import { aiActionDisplayPayloadSchema, type AIActionType } from "@/lib/validations/ai-actions";
import type { AIActionProposalStatus } from "@/types/ai-actions";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: { href: string; label: string };
  proposal?: ChatProposal;
  actionResult?: { message: string; route?: { href: string; label: string } };
  actionNotice?: string;
}

interface ChatProposal {
  id: string;
  actionType: AIActionType;
  status: AIActionProposalStatus;
  display: ReturnType<typeof aiActionDisplayPayloadSchema.parse>;
  expiresAt: string;
}

interface StructuredReply {
  type: "read-only" | "boundary" | "action";
  reply: string;
  route?: { href: string; label: string };
  proposal?: ChatProposal | null;
}

function parseStructuredReply(value: unknown): StructuredReply | null {
  if (
    typeof value !== "object" || value === null ||
    !("type" in value) || (value.type !== "read-only" && value.type !== "boundary" && value.type !== "action") ||
    !("reply" in value) || typeof value.reply !== "string"
  ) return null;

  const route = "route" in value && typeof value.route === "object" && value.route !== null &&
    "href" in value.route && typeof value.route.href === "string" &&
    "label" in value.route && typeof value.route.label === "string"
    ? { href: value.route.href, label: value.route.label }
    : undefined;
  if ((value.type === "read-only" || value.type === "boundary") && !route) return null;
  let proposal: ChatProposal | null | undefined;
  if (value.type === "action") {
    if (!("proposal" in value) || value.proposal === null) {
      proposal = null;
    } else if (typeof value.proposal === "object" && value.proposal !== null &&
      "id" in value.proposal && typeof value.proposal.id === "string" && /^[0-9a-f-]{36}$/i.test(value.proposal.id) &&
      "actionType" in value.proposal && typeof value.proposal.actionType === "string" &&
      "status" in value.proposal && typeof value.proposal.status === "string" &&
      "display" in value.proposal && "expiresAt" in value.proposal && typeof value.proposal.expiresAt === "string") {
      const actionTypes: AIActionType[] = [
        "savings_deposit", "savings_withdrawal", "account_transfer", "budget_expense",
        "budget_income", "debt_payment", "travel_expense", "travel_todo", "itinerary_item",
      ];
      const statuses: AIActionProposalStatus[] = ["pending_confirmation", "confirmed", "executing", "completed", "cancelled", "expired", "failed", "superseded"];
      const display = aiActionDisplayPayloadSchema.safeParse(value.proposal.display);
      if (!actionTypes.includes(value.proposal.actionType as AIActionType) ||
        !statuses.includes(value.proposal.status as AIActionProposalStatus) ||
        !display.success) return null;
      proposal = {
        id: value.proposal.id,
        actionType: value.proposal.actionType as AIActionType,
        status: value.proposal.status as AIActionProposalStatus,
        display: display.data,
        expiresAt: value.proposal.expiresAt,
      };
    } else return null;
  }

  return {
    type: value.type as StructuredReply["type"],
    reply: value.reply,
    ...(route ? { route } : {}),
    ...(value.type === "action" ? { proposal } : {}),
  };
}

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi! I'm Iponly AI. I can help you understand your savings, budget, debts, analytics, and travel plans.",
};

const suggestedQuestions = [
  "How much savings do I have?",
  "What installment is due next?",
  "How much did I spend this month?",
  "What's next on my travel itinerary?",
];

function newMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function safeRoute(route: StructuredReply["route"] | undefined) {
  if (!route) return undefined;
  return getSafeIponlyRouteByPath(route.href);
}

export function AssistantChat({ providerAvailable }: { providerAvailable: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [actingProposalId, setActingProposalId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLInputElement | null>(null);
  const proposalToFocusRef = useRef<string | null>(null);
  const responseTextRef = useRef("");
  const activeRequestIdRef = useRef<string | null>(null);

  async function sendMessage(value: string) {
    const content = value.trim();
    if (!content || isStreaming || !providerAvailable) return;

    const userMessage: ChatMessage = { id: newMessageId(), role: "user", content };
    const assistantMessage: ChatMessage = { id: newMessageId(), role: "assistant", content: "" };
    const assistantId = assistantMessage.id;
    const recentMessages = [...messages.filter((message) => message.id !== "welcome"), userMessage]
      .filter((message) => message.role === "user")
      .slice(-8);
    while (
      recentMessages.length > 1 &&
      recentMessages.reduce((total, message) => total + message.content.length, 0) > 12_000
    ) recentMessages.shift();
    const history = recentMessages.map(({ content: messageContent }) => ({ role: "user" as const, content: messageContent }));
    setMessages((current) => [...current.filter((message) => message.id !== "welcome"), userMessage, assistantMessage].slice(-16));
    setInput("");
    setErrorMessage("");
    setAnnouncement("");
    setIsStreaming(true);

    const controller = new AbortController();
    controllerRef.current = controller;
    activeRequestIdRef.current = assistantId;
    responseTextRef.current = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "I couldn't send that message. Please try again.";
        throw new Error(message);
      }

      if (response.headers.get("content-type")?.includes("application/json")) {
        const body = parseStructuredReply(await response.json());
        if (!body) throw new Error("I couldn't read the response. Please try again.");
        const route = safeRoute(body.route);
        if (body.proposal?.status === "pending_confirmation") {
          proposalToFocusRef.current = body.proposal.id;
        }
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: body.reply,
                ...(route ? { route } : {}),
                ...(body.proposal ? { proposal: body.proposal } : {}),
              }
            : message,
        ));
        setAnnouncement("Iponly AI finished replying.");
        return;
      }

      if (!response.body) throw new Error("I couldn't start the response. Please try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        responseTextRef.current += decoder.decode(chunk, { stream: true });
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, content: responseTextRef.current } : message,
        ));
      }
      responseTextRef.current += decoder.decode();
      if (!responseTextRef.current.trim()) {
        throw new Error("The AI provider returned no answer. Please retry or ask an administrator to check the configuration.");
      }
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, content: responseTextRef.current } : message,
      ));
      setAnnouncement("Iponly AI finished replying.");
    } catch (error) {
      if (activeRequestIdRef.current !== assistantId) return;
      if (error instanceof DOMException && error.name === "AbortError") {
        setAnnouncement("Response stopped.");
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, content: "Response stopped." } : message,
        ));
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Iponly AI couldn't answer right now. Please try again.");
        setMessages((current) => current.map((message) =>
          message.id === assistantId ? { ...message, content: "I couldn't answer that just now." } : message,
        ));
      }
    } finally {
      if (activeRequestIdRef.current === assistantId) {
        activeRequestIdRef.current = null;
        setIsStreaming(false);
        controllerRef.current = null;
      }
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function clearConversation() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRequestIdRef.current = null;
    setMessages([welcomeMessage]);
    setInput("");
    setErrorMessage("");
    setAnnouncement("Conversation cleared.");
    setIsStreaming(false);
  }

  async function respondToProposal(messageId: string, proposal: ChatProposal, action: "confirm" | "cancel"): Promise<boolean> {
    if (actingProposalId) return false;
    setActingProposalId(proposal.id);
    setErrorMessage("");
    try {
      const response = await fetch("/api/ai-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, proposalId: proposal.id }),
      });
      const body: unknown = await response.json().catch(() => null);
      const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
        ? body.message
        : typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "I couldn’t process this proposal. Please try again.";
      if (!response.ok) {
        setMessages((current) => current.map((item) =>
          item.id === messageId ? { ...item, actionNotice: message } : item,
        ));
        return false;
      }

      const nextStatus: AIActionProposalStatus = action === "confirm" ? "completed" : "cancelled";
      const href = typeof body === "object" && body !== null && "href" in body && typeof body.href === "string"
        ? safeRoute({ href: body.href, label: "Open related Iponly page" })
        : undefined;
      setMessages((current) => current.map((item) =>
        item.id === messageId
          ? {
              ...item,
              proposal: { ...proposal, status: nextStatus },
              actionResult: { message, ...(href ? { route: href } : {}) },
              actionNotice: undefined,
            }
          : item,
      ));
      setAnnouncement(action === "confirm" ? "AI action completed." : "Proposal cancelled. No changes were made.");
      return true;
    } catch {
      setMessages((current) => current.map((item) =>
        item.id === messageId ? { ...item, actionNotice: "I couldn’t reach Iponly to process this proposal. Check the relevant page before retrying." } : item,
      ));
      return false;
    } finally {
      setActingProposalId(null);
    }
  }

  async function editProposal(messageId: string, proposal: ChatProposal) {
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex <= 0) return;
    const originalRequest = messages.slice(0, messageIndex).reverse()
      .find((message) => message.role === "user")?.content;
    if (!originalRequest) return;
    if (await respondToProposal(messageId, proposal, "cancel")) {
      setInput(originalRequest);
      setAnnouncement("Proposal cancelled. Edit the request, then send it for a new proposal.");
      composerRef.current?.focus();
    }
  }

  return (
    <div className="page-stack assistant-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your money companion</p>
          <h1>Iponly AI</h1>
          <p className="page-description">Ask questions about your own Iponly records.</p>
        </div>
        <div className="page-header-actions">
          <button className="button button-secondary assistant-clear" onClick={clearConversation} type="button">
            <Trash2 aria-hidden="true" size={16} />
            Clear conversation
          </button>
          <Link className="button button-secondary" href="/assistant/history">Action history</Link>
        </div>
      </header>

      <section aria-label="Iponly AI conversation" className="panel assistant-panel">
        <div className="assistant-conversation">
          {messages.map((message) => (
            <article className={`assistant-message assistant-message-${message.role}`} key={message.id}>
              {message.role === "assistant" ? (
                <span aria-hidden="true" className="assistant-avatar"><Bot size={17} /></span>
              ) : null}
              <div className="assistant-message-body">
                <strong>{message.role === "assistant" ? "Iponly AI" : "You"}</strong>
                <p>{message.role === "assistant"
                  ? <AssistantMessageText content={message.content || (isStreaming ? " " : "")} />
                  : message.content}</p>
                {message.route ? (
                  <Link className="assistant-route-link" href={message.route.href}>{message.route.label}</Link>
                ) : null}
                {message.proposal ? (
                  <section
                    aria-labelledby={`proposal-${message.proposal.id}`}
                    className="assistant-action-card"
                    id={`proposal-card-${message.proposal.id}`}
                    ref={(element) => {
                      if (element && proposalToFocusRef.current === message.proposal!.id) {
                        element.focus();
                        proposalToFocusRef.current = null;
                      }
                    }}
                    tabIndex={-1}
                  >
                    <h2 id={`proposal-${message.proposal.id}`}>{message.proposal.display.title}</h2>
                    <p>{message.proposal.display.summary}</p>
                    <dl>
                      {message.proposal.display.details.map((detail) => (
                        <div key={`${detail.label}-${detail.value}`}>
                          <dt>{detail.label}</dt><dd>{detail.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {message.proposal.display.warning ? <p className="assistant-action-warning">{message.proposal.display.warning}</p> : null}
                    <p className="assistant-action-expiry">
                      Expires {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.proposal.expiresAt))}
                    </p>
                    {message.actionResult ? (
                      <p aria-live="polite" className="assistant-action-result" role="status">{message.actionResult.message}</p>
                    ) : null}
                    {message.actionNotice ? <p className="assistant-error" role="alert">{message.actionNotice}</p> : null}
                    {message.proposal.status === "pending_confirmation" ? (
                      <div className="assistant-action-buttons">
                        <button
                          className="button button-secondary"
                          disabled={actingProposalId === message.proposal.id}
                          onClick={() => void editProposal(message.id, message.proposal!)}
                          type="button"
                        >Edit details</button>
                        <button
                          className="button button-secondary"
                          disabled={actingProposalId === message.proposal.id}
                          onClick={() => void respondToProposal(message.id, message.proposal!, "cancel")}
                          type="button"
                        >Cancel</button>
                        <button
                          aria-label={message.proposal.display.confirmLabel}
                          className="button button-primary"
                          disabled={actingProposalId === message.proposal.id}
                          onClick={() => void respondToProposal(message.id, message.proposal!, "confirm")}
                          type="button"
                        >{actingProposalId === message.proposal.id ? "Processing…" : message.proposal.display.confirmLabel}</button>
                      </div>
                    ) : null}
                    {message.actionResult?.route ? (
                      <Link className="assistant-route-link" href={message.actionResult.route.href}>{message.actionResult.route.label}</Link>
                    ) : null}
                  </section>
                ) : null}
              </div>
            </article>
          ))}
          {isStreaming ? (
            <p className="assistant-loading" role="status"><LoaderCircle aria-hidden="true" size={15} /> Iponly AI is thinking…</p>
          ) : null}
        </div>

        {messages.length === 1 ? (
          <div className="assistant-suggestions">
            <p>Try asking</p>
            <div>
              {suggestedQuestions.map((question) => (
                <button disabled={!providerAvailable} key={question} onClick={() => void sendMessage(question)} type="button">
                  <Sparkles aria-hidden="true" size={14} />{question}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!providerAvailable ? (
          <p className="assistant-unavailable" role="status">
            <CircleHelp aria-hidden="true" size={17} />
            Iponly AI is unavailable until an administrator configures the AI provider. The rest of Iponly remains available.
          </p>
        ) : null}
        {errorMessage ? <p className="assistant-error" role="alert">{errorMessage}</p> : null}

        <form className="assistant-composer" onSubmit={submitMessage}>
          <label className="sr-only" htmlFor="assistant-message">Ask Iponly AI</label>
          <input
            autoComplete="off"
            disabled={!providerAvailable || isStreaming}
            id="assistant-message"
            maxLength={4_000}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your savings, budget, debt, or trips…"
            ref={composerRef}
            value={input}
          />
          {isStreaming ? (
            <button aria-label="Stop response" className="button button-primary assistant-send" onClick={() => controllerRef.current?.abort()} type="button">
              <Square aria-hidden="true" size={16} />
            </button>
          ) : (
            <button aria-label="Send message" className="button button-primary assistant-send" disabled={!providerAvailable || !input.trim()} type="submit">
              <Send aria-hidden="true" size={16} />
            </button>
          )}
        </form>

        <p className="assistant-privacy">
          Your message and only the information needed to prepare an action may be processed by the configured AI provider. Any proposed change requires your confirmation in Iponly; Iponly AI does not provide professional financial advice.
        </p>
        <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
      </section>
    </div>
  );
}
