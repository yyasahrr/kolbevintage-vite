import { validation } from "./errors";

/** Shared contract for the CRM preview and campaign eligibility.
 * A restricted audience must contain at least one distinct label. */
export type LabelAudience = { mode: "any" | "all"; labels: string[] };

export function labelAudience(value: unknown): LabelAudience {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validation("مخاطب برچسب معتبر نیست.");
  }
  const candidate = value as { mode?: unknown; labels?: unknown };
  if (Object.keys(candidate).some(key=>key!=="mode" && key!=="labels") ||
      (candidate.mode !== "any" && candidate.mode !== "all") || !Array.isArray(candidate.labels) ||
      candidate.labels.length < 1 || candidate.labels.length > 200 ||
      candidate.labels.some(id => typeof id !== "string" || !/^lbl-[a-f0-9-]{36}$/.test(id)) ||
      new Set(candidate.labels).size !== candidate.labels.length) {
    throw validation("برچسب و حالت یکی یا همه را انتخاب کنید.");
  }
  return { mode: candidate.mode, labels: [...candidate.labels].sort() };
}

/** Callers must derive actualLabels from a server-authenticated identity.
 * Unknown/deleted label definitions make a stored audience ineligible. */
export function matchesLabelAudience(audience: LabelAudience, actualLabels: readonly string[], definedLabels: readonly string[]): boolean {
  if (!audience.labels.length || !audience.labels.every(id => definedLabels.includes(id))) return false;
  const actual = new Set(actualLabels);
  return audience.mode === "all" ? audience.labels.every(id => actual.has(id)) : audience.labels.some(id => actual.has(id));
}
