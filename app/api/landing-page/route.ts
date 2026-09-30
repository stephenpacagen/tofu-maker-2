import { fetchLandingPage } from "@/lib/landingPage";

export async function POST(request: Request) {
  let url: unknown;
  try {
    url = (await request.json()).url;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof url !== "string") {
    return Response.json({ error: "Enter a landing page link" }, { status: 400 });
  }

  try {
    const page = await fetchLandingPage(url);
    return Response.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that page";
    const status = /returned \d|too long to respond|redirected too many/.test(message) ? 502 : 400;
    return Response.json({ error: message }, { status });
  }
}
