import type { ReferenceMetrics } from "@/lib/types";

type Signal = {
  key: string;
  label: string;
  weight: number;
  value: (m: ReferenceMetrics) => number | undefined;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Weights are relative; missing signals are dropped and the rest renormalized,
// so an ad is never penalized for a metric its platform doesn't expose.
const SIGNALS: Signal[] = [
  {
    key: "runtime",
    label: "Run time",
    weight: 40,
    value: (m) => (m.runDays === undefined ? undefined : clamp01(m.runDays / 180)),
  },
  {
    key: "active",
    label: "Still active",
    weight: 10,
    value: (m) => (m.isActive === undefined ? undefined : m.isActive ? 1 : 0),
  },
  {
    key: "duplicates",
    label: "Duplicated creative",
    weight: 25,
    value: (m) =>
      m.duplicateCount === undefined
        ? undefined
        : clamp01(Math.log2(1 + m.duplicateCount) / Math.log2(4)),
  },
  {
    key: "platforms",
    label: "Platforms",
    weight: 10,
    value: (m) => (m.platformCount === undefined ? undefined : clamp01(m.platformCount / 4)),
  },
  {
    key: "engagement",
    label: "Engagement",
    weight: 15,
    value: (m) =>
      m.engagement === undefined ? undefined : clamp01(Math.log10(1 + m.engagement) / 5),
  },
];

export type ScoreBreakdown = { key: string; label: string; contribution: number }[];

export type ReferenceScore = {
  score: number | null;
  tier: "strong" | "promising" | "weak" | "unknown";
  breakdown: ScoreBreakdown;
};

export function scoreReference(metrics: ReferenceMetrics): ReferenceScore {
  const available = SIGNALS.map((s) => ({ s, v: s.value(metrics) })).filter(
    (x): x is { s: Signal; v: number } => x.v !== undefined && Number.isFinite(x.v),
  );

  if (available.length === 0) return { score: null, tier: "unknown", breakdown: [] };

  const totalWeight = available.reduce((sum, x) => sum + x.s.weight, 0);
  const exact = available.map(({ s, v }) => ({ s, points: (s.weight / totalWeight) * v * 100 }));
  const breakdown = exact.map(({ s, points }) => ({ key: s.key, label: s.label, contribution: Math.round(points) }));
  const score = Math.min(100, Math.round(exact.reduce((sum, x) => sum + x.points, 0)));
  const tier = score >= 70 ? "strong" : score >= 40 ? "promising" : "weak";

  return { score, tier, breakdown };
}
