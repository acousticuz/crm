import type {
  AnalysisResult,
  CriterionGrade,
  LlmAdapter,
  QaResult,
  ScriptCriterion,
  TranscriptForLlm,
} from "./llm-adapter";

/**
 * Deterministic LLM mock used by tests and dev. Imitates the prompts in
 * `prompts/analysis.v1.md` and `prompts/qa-grade.v1.md` with simple keyword
 * heuristics so the output is stable run to run.
 *
 * Analysis logic:
 *   - sentiment: `shikoyat|qaytarish|jahl` → negative; `rahmat|xursand` → positive; else neutral.
 *   - topic: first matching keyword (narx/shikoyat/qaytarish/qiziqish) or "umumiy".
 *   - summary: first 2 operator/customer segments joined.
 *   - nextStep: hint based on detected topic.
 *   - keyPoints: each customer segment's text.
 *   - suggestedTags: the matched topic + sentiment tag.
 *
 * Grading logic:
 *   - For each criterion, look at its `keywords` (preferred) or the words in
 *     `text`. If at least one substring is present in the transcript, mark
 *     passed=true with full score and quote the matching line as evidence.
 *     Otherwise passed=false, score=0, evidence="evidence not found".
 *   - Total = sum of per-criterion scores; max = sum of maxScores.
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly name = "mock";

  async analyze(transcript: TranscriptForLlm): Promise<AnalysisResult> {
    const t = transcript.text.toLowerCase();
    const sentiment: AnalysisResult["sentiment"] =
      /shikoyat|qaytarish|jahl|yomon|qanoatlanmadim/.test(t)
        ? "negative"
        : /rahmat|xursand|yaxshi|tabriklayman/.test(t)
          ? "positive"
          : "neutral";

    const topics: Array<{ key: string; tag: string }> = [
      { key: "narx", tag: "narx" },
      { key: "qaytarish", tag: "qaytarish" },
      { key: "shikoyat", tag: "shikoyat" },
      { key: "filial", tag: "filial_tashrifi" },
      { key: "eshitish apparat", tag: "eshitish_apparati" },
      { key: "yoz", tag: "yozilish" },
    ];
    const matchedTopic = topics.find((t2) => t.includes(t2.key));
    const topic = matchedTopic?.key ?? "umumiy";

    const customerSegments = transcript.segments.filter((s) => s.speaker === "customer");
    const operatorSegments = transcript.segments.filter((s) => s.speaker === "operator");
    const summary = [
      operatorSegments[0]?.text ?? "",
      customerSegments[0]?.text ?? "",
      operatorSegments[1]?.text ?? "",
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 500);

    const nextStep =
      topic === "narx"
        ? "Mijoz uchun narx listini SMS ko'rinishida yuborish va keyingi qo'ng'iroqni rejalashtirish."
        : topic === "shikoyat"
          ? "Supervayzer ko'rib chiqishi uchun karta belgilash va 24 soat ichida qayta aloqaga chiqish."
          : "Operator yodga olishi: kelishilgan keyingi qadamni Task sifatida qo'shing.";

    const keyPoints = customerSegments.slice(0, 5).map((s) => s.text);
    const suggestedTags = Array.from(
      new Set([matchedTopic?.tag, sentiment === "positive" ? "qiziqish_yuqori" : undefined].filter(
        (x): x is string => !!x,
      )),
    );

    return { sentiment, topic, summary, nextStep, keyPoints, suggestedTags };
  }

  async grade(
    transcript: TranscriptForLlm,
    criteria: ScriptCriterion[],
  ): Promise<QaResult> {
    const results: CriterionGrade[] = criteria.map((c) => this.gradeOne(transcript, c));
    const totalScore = results.reduce((a, r) => a + r.score, 0);
    const maxScore = criteria.reduce((a, c) => a + c.maxScore, 0);
    return { totalScore, maxScore, criteriaResults: results };
  }

  private gradeOne(transcript: TranscriptForLlm, criterion: ScriptCriterion): CriterionGrade {
    const keywords = (
      criterion.keywords && criterion.keywords.length > 0
        ? criterion.keywords
        : criterion.text.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    ).map((k) => k.toLowerCase());
    if (keywords.length === 0) {
      return {
        criterionId: criterion.id,
        passed: false,
        score: 0,
        evidence: "evidence not found",
      };
    }
    // Search segments for any keyword. The evidence we return is the exact
    // segment line so supervisors can verify quickly.
    const lower = (s: string): string => s.toLowerCase();
    const segmentMatch = transcript.segments.find((seg) =>
      keywords.some((kw) => lower(seg.text).includes(kw)),
    );
    if (segmentMatch) {
      return {
        criterionId: criterion.id,
        passed: true,
        score: criterion.maxScore,
        evidence: `${segmentMatch.speaker}: ${segmentMatch.text}`,
      };
    }
    return {
      criterionId: criterion.id,
      passed: false,
      score: 0,
      evidence: "evidence not found",
    };
  }
}
