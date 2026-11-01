"use client";

import { Bot, CircleHelp, LoaderCircle, Send, Sparkles, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { getSafeIponlyRouteByPath } from "@/lib/ai/safety";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  route?: { href: string; label: string };
}

interface StructuredReply {
  type: "read-only" | "boundary";
  reply: string;
  route: { href: string; label: string };
}

function parseStructuredReply(value: unknown): StructuredReply | null {
  if (
    typeof value !== "object" || value === null ||
    !("type" in value) || (value.type !== "read-only" && value.type !== "boundary") ||
    !("reply" in value) || typeof value.reply !== "string" ||
    !("route" in value) || typeof value.route !== "object" || value.route === null ||
    !("href" in value.route) || typeof value.route.href !== "string" ||
    !("label" in value.route) || typeof value.route.label !== "string"
  ) return null;

  return {
    type: value.type,
    reply: value.reply,
    route: { href: value.route.href, label: value.route.label },
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
  const controllerRef = useRef<AbortController | null>(null);
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
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? { ...message, content: body.reply, ...(route ? { route } : {}) }
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

  return (
    <div className="page-stack assistant-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your money companion</p>
          <h1>Iponly AI</h1>
          <p className="page-description">Ask questions about your own Iponly records.</p>
        </div>
        <button className="button button-secondary assistant-clear" onClick={clearConversation} type="button">
          <Trash2 aria-hidden="true" size={16} />
          Clear conversation
        </button>
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
                <p>{message.content || (isStreaming ? " " : "")}</p>
                {message.route ? (
                  <Link className="assistant-route-link" href={message.route.href}>{message.route.label}</Link>
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
          Your message and the financial information needed to answer it may be processed by the configured AI provider. Iponly AI is read-only and does not provide professional financial advice.
        </p>
        <p aria-atomic="true" aria-live="polite" className="sr-only">{announcement}</p>
      </section>
    </div>
  );
}
