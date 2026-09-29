import type { NextRequest } from "next/server";
import { searchLibraryBrands } from "@/lib/references/source";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ brands: [] });

  try {
    return Response.json({ brands: await searchLibraryBrands(q) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Brand search failed" }, { status: 502 });
  }
}
