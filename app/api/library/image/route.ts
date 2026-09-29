import type { NextRequest } from "next/server";

const ALLOWED_HOSTS = [".fbcdn.net", ".facebook.com", ".cdninstagram.com"];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((h) => url.hostname.endsWith(h))) {
    return new Response("Host not allowed", { status: 400 });
  }

  const upstream = await fetch(url);
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    return new Response("Image unavailable", { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=21600" },
  });
}
