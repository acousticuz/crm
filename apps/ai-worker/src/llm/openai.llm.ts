import type {
  AnalysisMistake,
  AnalysisResult,
  CriterionGrade,
  LlmAdapter,
  QaResult,
  ScriptContext,
  ScriptCriterion,
  TranscriptForLlm,
} from "./llm-adapter";

const SEVERITIES = ["low", "medium", "high"] as const;

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

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
 * OpenAI Chat Completions adapter. Mirrors ClaudeLlmAdapter so it can act as
 * either the primary LLM or a fallback when Anthropic is unavailable / out of
 * credit. Uses JSON response format to keep parsing robust.
 */
export class OpenAiLlmAdapter implements LlmAdapter {
  readonly name = "openai";

  constructor(
    private readonly config: { apiKey: string; baseUrl?: string; model?: string },
  ) {}

  private async call(system: string, user: string, maxTokens = 1024): Promise<string> {
    if (!this.config.apiKey) throw new Error("OpenAiLlmAdapter: OPENAI_API_KEY is not set");
    const base = (this.config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model ?? "gpt-4o-mini",
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as OpenAiResponse;
    return json.choices?.[0]?.message?.content ?? "";
  }

  async analyze(t: TranscriptForLlm, script?: ScriptContext): Promise<AnalysisResult> {
    const system =
      "Siz call-markaz suhbatlarini tahlil qiluvchi yordamchisiz. FAQAT JSON qaytaring, " +
      "boshqa hech qanday matn yozmang.";
    const scriptBlock = script
      ? `\n\nFaol sotuv skripti "${script.name}" bo'limlari va talablari:\n` +
        script.criteria
          .map((c, i) => `${i + 1}. ${c.section} — ${c.text} (${c.maxScore} ball)`)
          .join("\n") +
        `\n\n"mistakes" — operator skriptdan og'ishgan har bir holat:` +
        ` [{"section":"bo'lim nomi","severity":"low|medium|high",` +
        `"message":"nima xato bo'ldi (o'zbekcha, qisqa)","evidence":"transkriptdan iqtibos yoki 'topilmadi'"}].`
      : `\n\nFaol skript yo'q — "mistakes" ni bo'sh qator [] qilib qaytaring.`;
    const user =
      `Quyidagi qo'ng'iroq transkripti (o'zbek yoki rus tilida) bo'yicha shu JSON formatda javob bering:\n` +
      `{"sentiment":"positive|neutral|negative|mixed","topic":"qisqa mavzu","summary":"qisqa xulosa (o'zbekcha)",` +
      `"nextStep":"operator uchun keyingi qadam tavsiyasi (o'zbekcha)","keyPoints":["asosiy nuqtalar"],` +
      `"suggestedTags":["mos teglar"],"mistakes":[...]}` +
      scriptBlock +
      `\n\nTranskript:\n${t.text}`;
    const out = await this.call(system, user, 1536);
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
      mistakes: parseMistakes(j.mistakes),
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

function parseMistakes(raw: unknown): AnalysisMistake[] {
  if (!Array.isArray(raw)) return [];
  const out: AnalysisMistake[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const obj = m as Record<string, unknown>;
    const section = typeof obj.section === "string" ? obj.section : "";
    const message = typeof obj.message === "string" ? obj.message : "";
    if (!section || !message) continue;
    const sev = SEVERITIES.includes(obj.severity as (typeof SEVERITIES)[number])
      ? (obj.severity as AnalysisMistake["severity"])
      : "medium";
    out.push({
      section,
      severity: sev,
      message,
      evidence: typeof obj.evidence === "string" ? obj.evidence : undefined,
    });
  }
  return out;
}
