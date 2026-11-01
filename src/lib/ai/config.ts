import "server-only";

const defaultModel = "gpt-4.1-mini";

export interface AIConfiguration {
  provider: "openai" | "openrouter" | "vercel";
  apiKey: string;
  model: string;
  baseURL?: string;
}

export function getAIConfiguration(): AIConfiguration | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  const provider = process.env.AI_PROVIDER?.trim() || "openai";
  if (provider !== "openai" && provider !== "openrouter" && provider !== "vercel") return null;

  const model = process.env.AI_MODEL?.trim() || (provider === "openai" ? defaultModel : "");
  const modelPattern = provider === "openai" ? /^[\w.-]+$/ : /^[\w.-]+\/[\w.-]+(?::[\w.-]+)?$/;
  if (!apiKey || model.length > 100 || !modelPattern.test(model)) return null;

  return {
    provider,
    apiKey,
    model,
    ...(provider === "vercel" ? {} : {
      baseURL: provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1",
    }),
  };
}
