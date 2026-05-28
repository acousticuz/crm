import type {
  AnalysisResult,
  CriterionGrade,
  LlmAdapter,
  QaResult,
  ScriptCriterion,
  TranscriptForLlm,
} from "./llm-adapter";

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
}

/** Pull a JSON object out of an LLM reply, tolerating ```json fences / prose. */
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM response");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

const SENTIMENTS = ["positive", "neutral", "negative", "mixed"] as const;

/**
 * Anthropic Claude adapter. Sends the transcript + (for QA) the script criteria
 * and asks for JSON-only replies, which we parse defensively.
 */
export class ClaudeLlmAdapter implements LlmAdapter {
  readonly name = "claude";

  constructor(private readonly config: { apiKey: string; model?: string }) {}

  private async call(system: string, user: string, maxTokens = 1024): Promise<string> {
    if (!this.config.apiKey) throw new Error("ClaudeLlmAdapter: ANTHROPIC_API_KEY is not set");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Claude HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as AnthropicResponse;
    return json.content?.[0]?.text ?? "";
  }

  async analyze(t: TranscriptForLlm): Promise<AnalysisResult> {
    const system =
      "Siz call-markaz suhbatlarini tahlil qiluvchi yordamchisiz. FAQAT JSON qaytaring, " +
      "boshqa hech qanday matn yozmang.";
    const user =
      `Quyidagi qo'ng'iroq transkripti (o'zbek yoki rus tilida) bo'yicha shu JSON formatda javob bering:\n` +
      `{"sentiment":"positive|neutral|negative|mixed","topic":"qisqa mavzu","summary":"qisqa xulosa (o'zbekcha)",` +
      `"nextStep":"operator uchun keyingi qadam tavsiyasi (o'zbekcha)","keyPoints":["asosiy nuqtalar"],` +
      `"suggestedTags":["mos teglar"]}\n\nTranskript:\n${t.text}`;
    const out = await this.call(system, user, 1024);
    const j = extractJson(out);
    const sentiment = SENTIMENTS.includes(j.sentiment as (typeof SENTIMENTS)[number])
      ? (j.sentiment as AnalysisResult["sentiment"])
      : "neutral";
    return {
      sentiment,
      topic: String(j.topic ?? "umumiy"),
      summary: String(j.summary ?? ""),
      nextStep: String(j.nextStep ?? ""),
      keyPoints: Array.isArray(j.keyPoints) ? j.keyPoints.map(String) : [],
      suggestedTags: Array.isArray(j.suggestedTags) ? j.suggestedTags.map(String) : [],
    };
  }

  async grade(t: TranscriptForLlm, criteria: ScriptCriterion[]): Promise<QaResult> {
    if (criteria.length === 0) return { totalScore: 0, maxScore: 0, criteriaResults: [] };
    const system =
      "Siz call-markaz sifat-nazorati (QA) baholovchisiz. Har bir mezonni transkript asosida " +
      "baholang va dalil sifatida transkriptdan iqtibos keltiring. FAQAT JSON qaytaring.";
    const user =
      `Transkript:\n${t.text}\n\nMezonlar (har biri uchun passed (true/false), score (0..maxScore), ` +
      `evidence (transkriptdan iqtibos yoki "dalil topilmadi") bering):\n` +
      `${JSON.stringify(criteria.map((c) => ({ id: c.id, text: c.text, maxScore: c.maxScore })))}\n\n` +
      `JSON format: {"criteriaResults":[{"criterionId":"...","passed":true,"score":0,"evidence":"..."}]}`;
    const out = await this.call(system, user, 2048);
    const j = extractJson(out);
    const rawResults = Array.isArray(j.criteriaResults)
      ? (j.criteriaResults as Array<Record<string, unknown>>)
      : [];
    const byId = new Map(rawResults.map((r) => [String(r.criterionId), r]));
    const criteriaResults: CriterionGrade[] = criteria.map((c) => {
      const r = byId.get(c.id);
      const passed = !!(r && r.passed);
      const rawScore = r && typeof r.score === "number" ? r.score : passed ? c.maxScore : 0;
      const score = Math.max(0, Math.min(c.maxScore, rawScore));
      return {
        criterionId: c.id,
        passed,
        score,
        evidence: String(r?.evidence ?? "dalil topilmadi"),
      };
    });
    const totalScore = criteriaResults.reduce((a, r) => a + r.score, 0);
    const maxScore = criteria.reduce((a, c) => a + c.maxScore, 0);
    return { totalScore, maxScore, criteriaResults };
  }
}
