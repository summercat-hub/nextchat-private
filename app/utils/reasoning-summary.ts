export interface ReasoningDetail {
  type?: string;
  id?: string | null;
  index?: number;
  summary?: string;
  text?: string;
}

function getSummaryText(detail: ReasoningDetail) {
  const type = typeof detail.type === "string" ? detail.type : "";

  if (typeof detail.summary === "string") {
    return detail.summary;
  }

  return type.includes("summary") && typeof detail.text === "string"
    ? detail.text
    : "";
}

function mergeIncrementalText(previous: string, incoming: string) {
  if (!previous || incoming.startsWith(previous)) return incoming;
  if (!incoming || previous.endsWith(incoming)) return previous;

  const maxOverlap = Math.min(previous.length, incoming.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (previous.endsWith(incoming.slice(0, length))) {
      return previous + incoming.slice(length);
    }
  }

  return previous + incoming;
}

export function getReasoningSummaryDelta(
  details: unknown,
  previousSummaries: Map<string, string>,
) {
  if (!Array.isArray(details)) return "";

  return details
    .map((entry, position) => {
      if (!entry || typeof entry !== "object") return "";

      const detail = entry as ReasoningDetail;
      const type = typeof detail.type === "string" ? detail.type : "";
      const summary = getSummaryText(detail);
      if (!summary || (!type.includes("summary") && !detail.summary)) {
        return "";
      }

      const key = `${detail.id ?? "summary"}:${detail.index ?? position}`;
      const previous = previousSummaries.get(key) ?? "";
      const merged = mergeIncrementalText(previous, summary);
      previousSummaries.set(key, merged);
      return merged.slice(previous.length);
    })
    .join("");
}
