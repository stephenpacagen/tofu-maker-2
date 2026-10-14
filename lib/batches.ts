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
  /** Name set on the references step. Falls back to "Group N" when blank. */
  name: string;
  count: number;
  jobs: BatchJob[];
};

/** Splits `total` into `n` near-equal parts, giving the remainder to the first parts. */
export function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}

/**
 * Pairs references into generations. One image covers both roles. When a group
 * has both roles, each generation gets one style and one format, paired in
 * order. The shorter list repeats so every reference is used.
 */
function planGroupJobs(refs: BriefReference[], variations: number): BatchJob[] {
  if (refs.length === 1) {
    const only = refs[0];
    return [{ style: only, format: only, count: variations }];
  }

  const styles = refs.filter((r) => r.role === "style");
  const formats = refs.filter((r) => r.role === "format");

  if (styles.length === 0) return formats.map((format) => ({ style: null, format, count: variations }));
  if (formats.length === 0) return styles.map((style) => ({ style, format: null, count: variations }));

  const count = Math.max(styles.length, formats.length);
  return Array.from({ length: count }, (_, i) => ({
    style: styles[i % styles.length],
    format: formats[i % formats.length],
    count: variations,
  })).filter((j) => j.count > 0);
}

/**
 * A single reference can stand in for both roles. Any other group needs at
 * least one style reference and one format reference.
 */
export function pairGap(refs: { role: BriefReference["role"] }[]): "both" | "style" | "format" | null {
  if (refs.length === 0) return "both";
  if (refs.length === 1) return null;
  const hasStyle = refs.some((r) => r.role === "style");
  const hasFormat = refs.some((r) => r.role === "format");
  if (!hasStyle) return "style";
  if (!hasFormat) return "format";
  return null;
}

/** Each reference group is a batch. `targetAds` is variations per style/format pair. */
export function planBatches(brief: Pick<AdBrief, "references" | "referenceGroups" | "targetAds">): Batch[] {
  const groups = brief.referenceGroups
    .map((g, index) => ({ ...g, index, refs: brief.references.filter((r) => r.groupId === g.id) }))
    .filter((g) => g.refs.length > 0);
  if (groups.length === 0) return [];

  return groups
    .map((group) => {
      const jobs = planGroupJobs(group.refs, brief.targetAds);
      return {
        id: group.id,
        index: group.index,
        name: group.name?.trim() || `Group ${group.index + 1}`,
        count: jobs.reduce((sum, job) => sum + job.count, 0),
        jobs,
      };
    })
    .filter((b) => b.count > 0);
}

/** Total images produced: every ad is exported in each selected dimension. */
export function countAds(brief: Pick<AdBrief, "references" | "referenceGroups" | "targetAds" | "dimensions">) {
  return planBatches(brief).reduce((sum, b) => sum + b.count, 0) * brief.dimensions.length;
}
