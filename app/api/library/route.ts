import type { NextRequest } from "next/server";
import {
  LIBRARY_PAGE_SIZE,
  LIBRARY_PLATFORMS,
  LIBRARY_SORTS,
  type LibraryPlatform,
  type LibrarySort,
} from "@/lib/references/library";
import { queryLibrary } from "@/lib/references/source";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const platform = params.get("platform");
  const sort = params.get("sort");
  const minRunDays = Number(params.get("minRunDays"));

  try {
    const page = await queryLibrary({
      q: params.get("q")?.trim() || undefined,
      brandId: params.get("brandId") || undefined,
      platform: LIBRARY_PLATFORMS.includes(platform as LibraryPlatform) ? (platform as LibraryPlatform) : undefined,
      sort: sort && sort in LIBRARY_SORTS ? (sort as LibrarySort) : undefined,
      liveOnly: params.get("liveOnly") === "true",
      minRunDays: Number.isInteger(minRunDays) && minRunDays > 0 ? minRunDays : undefined,
      cursor: params.get("cursor") || undefined,
      limit: LIBRARY_PAGE_SIZE,
    });
    return Response.json(page);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Library request failed" }, { status: 502 });
  }
}
