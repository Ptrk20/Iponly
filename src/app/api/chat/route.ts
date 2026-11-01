import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, createGateway, stepCountIs, streamText } from "ai";
import { createReadOnlyTools } from "@/ai/tools";
import { iponlyAISystemGuidance } from "@/ai/system-guidance";
import { getAIConfiguration } from "@/lib/ai/config";
import { consumeAIRequest } from "@/lib/ai/rate-limit";
import {
  chatRequestSchema,
  getSafeIponlyRoute,
  isProfessionalAdviceRequest,
  isWriteRequest,
  routeForWriteRequest,
} from "@/lib/ai/safety";
import { getCurrentUser } from "@/lib/auth-session";
import { getUserPreferences } from "@/services/preferences-service";

export const maxDuration = 30;
const maximumRequestBytes = 50_000;

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}

function providerErrorDetails(error: unknown) {
  let current = error;
  let status: number | undefined;
  let htmlResponse = false;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    if ("statusCode" in current && typeof current.statusCode === "number" && Number.isInteger(current.statusCode)) {
      status ??= current.statusCode;
    }
    if (APICallError.isInstance(current)) {
      htmlResponse ||= Boolean(current.responseHeaders?.["content-type"]?.toLowerCase().includes("text/html"));
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return { status, htmlResponse };
}

function providerErrorMessage(error: unknown) {
  const { status, htmlResponse } = providerErrorDetails(error);
  if (status === 403 && htmlResponse) {
    return "The AI connection was blocked by a network or proxy access policy. Ask your network administrator to allow the configured AI provider endpoint.";
  }
  switch (status) {
    case 401:
    case 403:
      return "The AI provider rejected access. Ask an administrator to check the API key and model permissions.";
    case 402:
      return "The AI provider requires credits. Ask an administrator to check the provider's billing balance.";
    case 404:
      return "The configured AI model is unavailable. Ask an administrator to check the model identifier and provider availability.";
    case 400:
      return "The AI provider rejected the request. Ask an administrator to check the model's tool-calling support and configuration.";
    case 429:
      return "The AI provider's rate or usage limit was reached. Please wait and try again.";
    default:
      return "The AI provider couldn't complete the response. Please try again.";
  }
}

async function readBoundedRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumRequestBytes) {
    return { tooLarge: true as const, text: "" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { tooLarge: false as const, text: "" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumRequestBytes) {
      await reader.cancel();
      return { tooLarge: true as const, text: "" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { tooLarge: false as const, text: new TextDecoder().decode(bytes) };
}

function isAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const applicationUrl = process.env.BETTER_AUTH_URL;
  if (!applicationUrl) return false;

  try {
    return new URL(origin).origin === new URL(applicationUrl).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Please sign in to use Iponly AI.", 401);
    if (!isAllowedOrigin(request)) return jsonError("This request could not be verified.", 403);

    const rateLimit = consumeAIRequest(user.id);
    if (!rateLimit.allowed) {
      return jsonError("You're sending requests too quickly. Please wait a moment and try again.", 429, {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      });
    }

    const body = await readBoundedRequestBody(request);
    if (body.tooLarge) return jsonError("This chat request is too large.", 413);

    let requestBody: unknown;
    try {
      requestBody = JSON.parse(body.text);
    } catch {
      return jsonError("Send a valid chat message and try again.", 400);
    }

    const parsedRequest = chatRequestSchema.safeParse(requestBody);
    if (!parsedRequest.success) return jsonError("This message is too long or the conversation is invalid.", 400);

    const latestMessage = parsedRequest.data.messages.at(-1)!.content;
    if (isWriteRequest(latestMessage)) {
      const route = getSafeIponlyRoute(routeForWriteRequest(latestMessage));
      return Response.json({
        type: "read-only",
        reply: `I can view and explain your financial information, but I can't make changes yet. Open ${route.label} to record this yourself.`,
        route,
      });
    }
    if (isProfessionalAdviceRequest(latestMessage)) {
      return Response.json({
        type: "boundary",
        reply: "I can describe the information recorded in Iponly, but I can't provide personalized financial, investment, tax, legal, or credit advice.",
        route: getSafeIponlyRoute("analytics"),
      });
    }

    const configuration = getAIConfiguration();
    if (!configuration) return jsonError("Iponly AI is not configured right now. You can continue using the rest of Iponly.", 503);

    const preferences = await getUserPreferences(user.id);
    const model = configuration.provider === "vercel"
      ? createGateway({ apiKey: configuration.apiKey })(configuration.model)
      : createOpenAI({ apiKey: configuration.apiKey, baseURL: configuration.baseURL }).chat(configuration.model);
    const result = streamText({
      model,
      system: iponlyAISystemGuidance,
      messages: parsedRequest.data.messages.map(({ role, content }) => ({ role, content })),
      tools: createReadOnlyTools({
        userId: user.id,
        timezone: preferences.timezone,
        defaultCurrencyCode: preferences.defaultCurrencyCode,
      }),
      stopWhen: stepCountIs(5),
      maxOutputTokens: 700,
      abortSignal: request.signal,
      onError: ({ error }) => {
        console.error("Iponly AI stream failed.", {
          category: "provider-stream",
          provider: configuration.provider,
          ...providerErrorDetails(error),
        });
      },
    });

    const reader = result.fullStream.getReader();
    async function readNextText(): Promise<string | null> {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return null;
        if (value.type === "error" || value.type === "tool-error") throw value.error;
        if (value.type === "abort") throw new Error("AI response aborted.");
        if (value.type === "text-delta" && value.text) return value.text;
      }
    }

    let firstText: string | null;
    try {
      firstText = await readNextText();
    } catch (error) {
      await reader.cancel();
      return jsonError(providerErrorMessage(error), 502);
    }
    if (firstText === null) {
      console.error("Iponly AI returned no answer.", { category: "empty-response", provider: configuration.provider });
      return jsonError("The AI model returned no answer. Please retry or ask an administrator to check the model configuration.", 502);
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(firstText));
      },
      async pull(controller) {
        try {
          const text = await readNextText();
          if (text === null) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(text));
        } catch {
          console.error("Iponly AI response interrupted.", { category: "response-stream" });
          controller.error(new Error("The AI response was interrupted."));
          await reader.cancel();
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return new Response(responseStream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Iponly AI request failed.", {
      category: error instanceof Error ? "request" : "unknown",
    });
    return jsonError("Iponly AI couldn't answer right now. Please try again.", 500);
  }
}
