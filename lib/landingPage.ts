import type { LandingPage } from "@/lib/types";

const MAX_TEXT_CHARS = 4000;
const MAX_HEADINGS = 12;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Extracts messaging from landing page HTML. Browser-only: relies on DOMParser, which never runs scripts. */
export function parseLandingPage(fileName: string, html: string): LandingPage {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript, svg, template").forEach((el) => el.remove());

  const meta = (selector: string) => clean(doc.querySelector(selector)?.getAttribute("content"));

  const headings = Array.from(
    new Set(Array.from(doc.querySelectorAll("h1, h2, h3")).map((el) => clean(el.textContent)).filter(Boolean)),
  ).slice(0, MAX_HEADINGS);

  return {
    fileName,
    title: clean(doc.title) || meta('meta[property="og:title"]') || headings[0] || fileName,
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    headings,
    text: clean(doc.body?.textContent).slice(0, MAX_TEXT_CHARS),
  };
}
