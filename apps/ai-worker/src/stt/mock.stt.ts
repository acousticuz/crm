import type { SttAdapter, SttRequest, SttTranscript } from "./stt-adapter";
import type { TranscriptSegment } from "@acoustic-crm/shared";

/**
 * Deterministic mock STT — synthesizes a believable two-speaker dialog with
 * timestamps so the rest of the pipeline (Transcript, M8 analysis, QA) can
 * be exercised without a paid provider. The "language" defaults to uz but
 * honors the request hint.
 *
 * The output looks like a short Acoustic-style intake call so downstream
 * QA scoring has something to grade against.
 */
export class MockSttAdapter implements SttAdapter {
  readonly name = "mock";

  async transcribe(req: SttRequest): Promise<SttTranscript> {
    const lang = req.language ?? "uz";
    const lines: Array<{ speaker: "operator" | "customer"; text: string }> = [
      { speaker: "operator", text: "Assalomu alaykum, Acoustic call-markaziga xush kelibsiz." },
      { speaker: "customer", text: "Vaalaykum assalom, narxlarni bilmoqchi edim." },
      { speaker: "operator", text: "Albatta. Qaysi xizmat sizni qiziqtiradi?" },
      { speaker: "customer", text: "Eshitish apparati uchun." },
      { speaker: "operator", text: "Ha, bizda ikki xil model bor. Filialga tashrif buyurishni xohlaysizmi?" },
      { speaker: "customer", text: "Ha, ertaga kelaman. Rahmat." },
      { speaker: "operator", text: "Sizni ko'rganimizdan xursand bo'lamiz. Xayrli kun." },
    ];
    const segments: TranscriptSegment[] = [];
    let cursor = 0;
    for (const line of lines) {
      const duration = Math.max(1.5, Math.min(5, line.text.length * 0.07));
      segments.push({
        speaker: line.speaker,
        start: Number(cursor.toFixed(2)),
        end: Number((cursor + duration).toFixed(2)),
        text: line.text,
      });
      cursor += duration + 0.3;
    }
    const text = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
    return {
      text,
      segments,
      language: lang,
      confidence: 0.92,
    };
  }
}
