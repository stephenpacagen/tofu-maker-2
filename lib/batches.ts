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
 * Every reference image in the group gets `variations` outputs. When a group
 * has both style and format references, each style/format pairing gets that many.
 * A group with a single image uses that image for both style and layout.
 */
function planGroupJobs(refs: BriefReference[], variations: number): BatchJob[] {
  if (refs.length === 1) {
    const only = refs[0];
    return [{ style: only, format: only, count: variations }];
  }

  const styles = refs.filter((r) => r.role === "style");
  const formats = refs.filter((r) => r.role === "format");

  const jobs: BatchJob[] =
    styles.length === 0
      ? formats.map((format) => ({ style: null, format, count: variations }))
      : formats.length === 0
        ? styles.map((style) => ({ style, format: null, count: variations }))
        : styles.flatMap((style) => formats.map((format) => ({ style, format, count: variations })));
  return jobs.filter((j) => j.count > 0);
}

/** Each non-empty reference group is a batch. `targetAds` is variations per reference image, not a run total. */
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
