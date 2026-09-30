import OpenAI from "openai";

let client: OpenAI | undefined;

/** Shared server-side OpenAI client, used by image generation and image QA. */
export function getOpenAIClient() {
  // The API key is read here, on the server only, from process.env.OPENAI_API_KEY
  // (loaded by Next.js from .env.local). It has no NEXT_PUBLIC_ prefix, so Next.js
  // never inlines it into client bundles, and this module is only imported by API routes.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server.");
  client ??= new OpenAI({ apiKey });
  return client;
}

/** Turns SDK errors into a message worth showing on the test page. */
export function describeOpenAIError(err: unknown, fallback = "OpenAI request failed"): { message: string; status: number } {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 502;
    const detail = err.message || "Unknown OpenAI error";
    return { message: `OpenAI API error${err.status ? ` (${err.status})` : ""}: ${detail}`, status };
  }
  return { message: err instanceof Error ? err.message : fallback, status: 500 };
}
