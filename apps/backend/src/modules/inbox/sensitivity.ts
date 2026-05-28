/**
 * Sensitivity detector for inbox auto-replies. CLAUDE.md §5.10 mandates:
 *
 *   "Tibbiy/narx/yuridik javoblar HECH QACHON avtomatik yuborilmaydi.
 *    Hammasi audit'ga yoziladi."
 *
 * If ANY category is detected, the AI draft must be flagged and never
 * auto-sent. Operator must read, edit, and approve.
 *
 * Keywords cover both Uzbek and Russian terms an Acoustic-style audience
 * might use. We err on the side of more flagging — false positives only
 * cost an operator review, false negatives could ship harmful content.
 */

// Word-prefix matching (no closing \b) so Uzbek suffixes like "narxlari"
// and "tibbiy" pass through. We err on the side of false positives —
// operator review is cheap; missing a harmful auto-send is not.
const KEYWORDS: Record<"medical" | "pricing" | "legal", RegExp> = {
  medical:
    /\b(shifo|davo|dori|tibbi|kasal|simptom|diagnoz|jarroh|retsept|dorixona|tabib|operatsiya|приём|симптом|диагноз|лекарств|болезн|операци)/i,
  pricing:
    /\b(narx|summa|so'm|sum\s|chegirma|aksiya|to'lov|tolov|kredit|naqd|цена|цены|стоимост|скидк|оплат|кредит|акци)/i,
  legal:
    /\b(yuridik|qonun|sud\b|shartnoma|advokat|kompensatsiya|da'vo|pretenziya|jarima|неустойк|претензи|иск|закон|юрид|адвокат|договор)/i,
};

export type SensitiveCategory = keyof typeof KEYWORDS;

export function detectSensitiveCategories(text: string): SensitiveCategory[] {
  const matches: SensitiveCategory[] = [];
  for (const [category, regex] of Object.entries(KEYWORDS) as Array<[SensitiveCategory, RegExp]>) {
    if (regex.test(text)) matches.push(category);
  }
  return matches;
}
