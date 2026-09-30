// QA types shared by the test page (client), the QA route, and the OpenAI QA service.
// Keep this file free of SDK imports so it is safe for the browser bundle.

/** "error" means the check could not be completed; it is never treated as a pass. */
export type QAStatus = "pass" | "fail" | "not_applicable" | "error";

export type QASeverity = "none" | "minor" | "major" | "critical";

export type QACategory = "productFidelity" | "aspectRatio" | "textSpelling" | "unwantedLogos" | "anatomy";

/** The four categories judged by the vision model. Aspect ratio is deterministic. */
export type AIQACategory = Exclude<QACategory, "aspectRatio">;

export type QACheck = {
  status: QAStatus;
  severity: QASeverity;
  description: string;
  evidence?: string;
  /** Aspect ratio only. */
  expected?: string;
  actual?: string;
};

/** Visual checks as returned by the QA model (validated against a strict JSON schema). */
export type AIQAChecks = Record<AIQACategory, QACheck> & {
  /** All text the model could read in the generated image, for debugging text checks. */
  visibleText: string[];
};

export type QACheckResult = QACheck & {
  /** Configured weight for this category. */
  weight: number;
  /** weight if passed, 0 if failed, null if not applicable or errored. */
  earned: number | null;
  critical: boolean;
};

export type QAResult = {
  /** 0-100, calculated on the server from the check results. null if any check errored. */
  score: number | null;
  status: "pass" | "fail" | "error";
  /** Human-readable reasons that forced a fail regardless of score. */
  criticalFailures: string[];
  checks: Record<QACategory, QACheckResult>;
  visibleText: string[];
  /** Diagnostic message when the QA model call failed (never contains the API key). */
  errorDetail?: string;
  debug: {
    model: string;
    imageDetail: string;
    durationMs: number;
    productReferenceProvided: boolean;
    requestedCopyProvided: boolean;
    inputTokens?: number;
    outputTokens?: number;
    responseId?: string;
  };
};

export type QAResponse = QAResult | { error: string };

/**
 * Expected output shape. `size` ("WIDTHxHEIGHT") is used when the provider returns exact
 * dimensions (OpenAI); otherwise only `aspectRatio` ("W:H") is compared (Gemini).
 */
export type QAExpectedOutput = { aspectRatio: string; size?: string };
