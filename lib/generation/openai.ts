import type { Dimension } from "@/lib/types";
import { orderedImages, type AdGenerator } from "./types";

// The images API only supports a few fixed sizes, so 4x5 and 9x16 come back
// as 2:3 rather than their exact ratio.
const SIZES: Record<Dimension, string> = {
  "9x16": "1024x1536",
  "4x5": "1024x1536",
  "1x1": "1024x1024",
};

export const openaiGenerator: AdGenerator = {
  name: "openai",
  async generate(job) {
    const { dimension, count, prompt } = job;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", SIZES[dimension]);
    form.append("n", String(count));
    for (const img of orderedImages(job)) {
      form.append("image[]", new Blob([img.bytes], { type: img.type }), img.name);
    }

    const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI image generation failed (${res.status}): ${await res.text()}`);

    const json = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
    return json.data.map((d) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url!));
  },
};
