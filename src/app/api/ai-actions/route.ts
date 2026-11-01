import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-session";
import { consumeAIActionRequest } from "@/lib/ai/action-rate-limit";
import { getUserPreferences } from "@/services/preferences-service";
import { cancelAIActionProposal, confirmAIActionProposal } from "@/services/ai-action-service";
import { findAIActionProposalForUser } from "@/repositories/ai-action-repository";

const requestSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
  proposalId: z.string().uuid(),
}).strict();
const maximumBodyBytes = 2_000;

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

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return { tooLarge: false, text: "" };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBodyBytes) {
      await reader.cancel();
      return { tooLarge: true, text: "" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { tooLarge: false, text: new TextDecoder().decode(bytes) };
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for an AI action.");
    return Response.json({ error: "Your session could not be verified. Please sign in again." }, { status: 500 });
  }
  if (!user) return Response.json({ error: "Please sign in to confirm this action." }, { status: 401 });
  if (!isAllowedOrigin(request)) return Response.json({ error: "This request could not be verified." }, { status: 403 });

  const rateLimit = consumeAIActionRequest(user.id);
  if (!rateLimit.allowed) {
    return Response.json({ error: "You're sending confirmation requests too quickly. Please wait and try again." }, {
      status: 429,
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBodyBytes) {
    return Response.json({ error: "This confirmation request is too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const boundedBody = await readBoundedBody(request);
    if (boundedBody.tooLarge) {
      return Response.json({ error: "This confirmation request is too large." }, { status: 413 });
    }
    body = JSON.parse(boundedBody.text);
  } catch {
    return Response.json({ error: "Send a valid confirmation request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "This proposal request is invalid." }, { status: 400 });

  try {
    if (parsed.data.action === "confirm") {
      const proposal = await findAIActionProposalForUser(parsed.data.proposalId, user.id);
      const preferences = proposal?.status === "executing" ? null : await getUserPreferences(user.id);
      if (preferences && !preferences.aiActionsEnabled) {
        return Response.json({ error: "AI Actions are disabled in Settings." }, { status: 403 });
      }
    }

    const result = parsed.data.action === "confirm"
      ? await confirmAIActionProposal(user.id, parsed.data.proposalId)
      : await cancelAIActionProposal(user.id, parsed.data.proposalId);

    if (result.ok && parsed.data.action === "confirm") {
      for (const path of ["/", "/savings", "/budget", "/debt", "/travel", "/analytics"]) revalidatePath(path);
    }
    return Response.json(result, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Iponly could not process a confirmation request.", { category: "ai-action-request" });
    return Response.json({ error: "I couldn’t process this action. Please check the related Iponly page before trying again." }, { status: 500 });
  }
}
