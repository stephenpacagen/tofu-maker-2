import type { AdBrief, BriefReference } from "@/lib/types";

/** One generator call: a style/format pairing and how many variants to make from it. */
export type BatchJob = {
  style: BriefReference | null;
  format: BriefReference | null;
  count: number;
};

/** A batch is everything generated from one reference group. */
export type Batch = {
  id: string;
  /** Position of the group in the brief, for display ("Group 1"). */
  index: number;
  count: number;
  jobs: BatchJob[];
};

/** Splits `total` into `n` near-equal parts, giving the remainder to the first parts. */
export function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}

/**
 * Within a group, the ads are split evenly across style references, and each
 * style's share is split evenly across the format references. A group with
 * only one kind of reference splits across that kind alone.
 */
function planGroupJobs(refs: BriefReference[], count: number): BatchJob[] {
  const styles = refs.filter((r) => r.role === "style");
  const formats = refs.filter((r) => r.role === "format");

  const jobs: BatchJob[] =
    styles.length === 0
      ? splitEvenly(count, formats.length).map((n, j) => ({ style: null, format: formats[j], count: n }))
      : formats.length === 0
        ? splitEvenly(count, styles.length).map((n, i) => ({ style: styles[i], format: null, count: n }))
        : splitEvenly(count, styles.length).flatMap((n, i) =>
            splitEvenly(n, formats.length).map((m, j) => ({ style: styles[i], format: formats[j], count: m })),
          );
  return jobs.filter((j) => j.count > 0);
}

/** Each non-empty reference group is a batch; the target is split evenly across them. */
export function planBatches(brief: Pick<AdBrief, "references" | "referenceGroups" | "targetAds">): Batch[] {
  const groups = brief.referenceGroups
    .map((g, index) => ({ ...g, index, refs: brief.references.filter((r) => r.groupId === g.id) }))
    .filter((g) => g.refs.length > 0);
  if (groups.length === 0) return [];

  return splitEvenly(brief.targetAds, groups.length)
    .map((count, i) => ({ id: groups[i].id, index: groups[i].index, count, jobs: planGroupJobs(groups[i].refs, count) }))
    .filter((b) => b.count > 0);
}

/** Total images produced: every ad is exported in each selected dimension. */
export function countAds(brief: Pick<AdBrief, "references" | "referenceGroups" | "targetAds" | "dimensions">) {
  return planBatches(brief).reduce((sum, b) => sum + b.count, 0) * brief.dimensions.length;
}
