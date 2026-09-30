import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LandingPage } from "@/lib/types";

const MAX_TEXT_CHARS = 8000;
const MAX_HEADINGS = 12;
const MAX_SECTIONS = 10;
const MAX_SECTION_CHARS = 700;
const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripBlocks(html: string, tags: string[]) {
  return tags.reduce(
    (next, tag) => next.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " "),
    html,
  );
}

function innerText(fragment: string) {
  return clean(decodeEntities(fragment.replace(/<[^>]+>/g, " ")));
}

function metaContent(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attrs.set(match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    const name = attrs.get("name") ?? attrs.get("property") ?? attrs.get("itemprop");
    if (name?.toLowerCase() === key) return clean(attrs.get("content"));
  }
  return "";
}

/** Heading plus the copy that sits under it, up to the next heading. */
function extractSections(html: string) {
  const matches = Array.from(html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi));
  const sections = [];
  for (let i = 0; i < matches.length && sections.length < MAX_SECTIONS; i++) {
    const heading = innerText(matches[i][2]);
    if (!heading) continue;
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = matches[i + 1]?.index ?? html.length;
    const text = innerText(html.slice(start, end)).slice(0, MAX_SECTION_CHARS);
    sections.push({ heading, text });
  }
  return sections;
}

/** Pulls the messaging a landing page exposes in its HTML: title, description, headings, and body copy. */
export function parseLandingPage(url: string, html: string): LandingPage {
  const withoutNoise = stripBlocks(html, ["script", "style", "noscript", "svg", "template"]);
  const titleMatch = withoutNoise.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const readable = stripBlocks(withoutNoise, ["nav", "footer", "header", "aside", "form"]);
  const region =
    readable.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ??
    readable.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] ??
    readable;
  const sections = extractSections(region);
  const headings = Array.from(new Set(sections.map((section) => section.heading))).slice(0, MAX_HEADINGS);
  const title =
    innerText(titleMatch?.[1] ?? "") ||
    metaContent(withoutNoise, "og:title") ||
    headings[0] ||
    url;

  return {
    fileName: url,
    title,
    description: metaContent(withoutNoise, "description") || metaContent(withoutNoise, "og:description"),
    headings,
    text: innerText(region).slice(0, MAX_TEXT_CHARS),
    sections,
  };
}

export function normalizeLandingUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a landing page link");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid link");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http or https link");
  if (url.username || url.password) throw new Error("Links with a username or password are not allowed");
  return url;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const normalized = ip.toLowerCase();
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (normalized === "::1" || normalized === "::") return true;
  const head = normalized.split(":")[0] ?? "";
  if (/^f[cd]/i.test(head) || /^fe[89ab]/i.test(head)) return true;
  return false;
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("That link points to a private address");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("That link points to a private address");
    return;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Could not resolve that link");
  }
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error("That link points to a private address");
  }
}

async function readHtml(start: URL) {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "TofuMaker/1.0 (landing page preview)",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("The page redirected without a destination");
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new Error("The page redirected to an unsupported link");
      }
      current = next;
      continue;
    }
    if (!res.ok) throw new Error(`The page returned ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("That link is not an HTML page");

    const reader = res.body?.getReader();
    if (!reader) {
      return { html: (await res.text()).slice(0, MAX_HTML_BYTES), finalUrl: current.toString() };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        chunks.push(value.subarray(0, value.byteLength - (total - MAX_HTML_BYTES)));
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().toLowerCase();
    const encoding = charset === "iso-8859-1" || charset === "latin1" ? "iso-8859-1" : "utf-8";
    return { html: new TextDecoder(encoding).decode(bytes), finalUrl: current.toString() };
  }
  throw new Error("The page redirected too many times");
}

/** Fetches a public landing page and returns the messaging parsed from its HTML. */
export async function fetchLandingPage(input: string): Promise<LandingPage> {
  const url = normalizeLandingUrl(input);
  let html: string;
  let finalUrl: string;
  try {
    ({ html, finalUrl } = await readHtml(url));
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("The page took too long to respond");
    }
    throw error instanceof Error ? error : new Error("Could not read that page");
  }
  const page = parseLandingPage(finalUrl, html);
  if (!page.description && page.headings.length === 0 && page.text.length < 40 && page.title === finalUrl) {
    throw new Error("Could not find readable content on that page");
  }
  return page;
}
