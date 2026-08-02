import { getReasoningSummaryDelta } from "../app/utils/reasoning-summary";

describe("getReasoningSummaryDelta", () => {
  test("only exposes provider reasoning summaries", () => {
    const previous = new Map<string, string>();

    expect(
      getReasoningSummaryDelta(
        [
          { type: "reasoning.text", text: "hidden raw reasoning" },
          { type: "reasoning.summary", summary: "先确认问题，再给出方案。" },
        ],
        previous,
      ),
    ).toBe("先确认问题，再给出方案。");
  });

  test("deduplicates full summaries and appends streaming deltas", () => {
    const previous = new Map<string, string>();

    expect(
      getReasoningSummaryDelta(
        [{ type: "reasoning.summary", index: 0, summary: "第一步" }],
        previous,
      ),
    ).toBe("第一步");
    expect(
      getReasoningSummaryDelta(
        [{ type: "reasoning.summary", index: 0, summary: "第一步" }],
        previous,
      ),
    ).toBe("");
    expect(
      getReasoningSummaryDelta(
        [{ type: "reasoning.summary", index: 0, summary: "第二步" }],
        previous,
      ),
    ).toBe("第二步");
    expect(
      getReasoningSummaryDelta(
        [{ type: "reasoning.summary", index: 0, summary: "第一步第二步" }],
        previous,
      ),
    ).toBe("");
  });

  test("supports summary text fields from response-style payloads", () => {
    expect(
      getReasoningSummaryDelta(
        [{ type: "summary_text", text: "简短摘要" }],
        new Map<string, string>(),
      ),
    ).toBe("简短摘要");
  });
});
