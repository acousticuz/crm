import "reflect-metadata";

// The seed script is CommonJS (Node-runnable directly). Importing it here
// gives the test the literal QA_SCRIPT / SALES_SCRIPT shape without touching
// the database — the seed entrypoint is guarded with require.main === module
// so this import is a no-op beyond loading constants.
//
// Why a shape test exists: the hearing-aid sales script doubles as the QA
// reference. If a future edit silently drops a section, halves a score, or
// renames a section without updating the operator panel, the panel and QA
// would drift apart. This test fails before that drift ships.

interface Criterion {
  id: string;
  section: string;
  text: string;
  maxScore: number;
  keywords?: string[];
  guidance?: string[];
}

interface SeedScript {
  name: string;
  sections: string[];
  criteria: Criterion[];
}

const seed = require("../scripts/seed-acoustic.js") as {
  SALES_SCRIPT: SeedScript;
};

describe("Sales script seed (Acoustic eshitish apparatlari)", () => {
  const script = seed.SALES_SCRIPT;

  it("has the expected name surfaced in the top app panel", () => {
    expect(script.name).toBe("Sotuv skripti (Acoustic eshitish apparatlari)");
  });

  it("has exactly 7 sections in the documented order", () => {
    expect(script.sections).toEqual([
      "Salomlashish va tanishtirish",
      "Ehtiyojni aniqlash",
      "Bepul eshitish tekshiruvini taklif qilish",
      "Mahsulot/xizmat haqida ma'lumot",
      "E'tiroz bilan ishlash",
      "Keyingi qadamni belgilash",
      "Xayrlashish",
    ]);
  });

  it("has one criterion per section, each with non-empty text + guidance", () => {
    expect(script.criteria).toHaveLength(script.sections.length);
    for (const c of script.criteria) {
      expect(c.text.length).toBeGreaterThan(10);
      expect(c.guidance?.length ?? 0).toBeGreaterThan(0);
      expect(script.sections).toContain(c.section);
    }
  });

  it("criteria scores match the spec: 10/20/15/20/15/15/5 = 100", () => {
    const scoresBySection = Object.fromEntries(
      script.criteria.map((c) => [c.section, c.maxScore]),
    );
    expect(scoresBySection["Salomlashish va tanishtirish"]).toBe(10);
    expect(scoresBySection["Ehtiyojni aniqlash"]).toBe(20);
    expect(scoresBySection["Bepul eshitish tekshiruvini taklif qilish"]).toBe(15);
    expect(scoresBySection["Mahsulot/xizmat haqida ma'lumot"]).toBe(20);
    expect(scoresBySection["E'tiroz bilan ishlash"]).toBe(15);
    expect(scoresBySection["Keyingi qadamni belgilash"]).toBe(15);
    expect(scoresBySection["Xayrlashish"]).toBe(5);

    const total = script.criteria.reduce((s, c) => s + c.maxScore, 0);
    expect(total).toBe(100);
  });

  it("criterion ids are unique and stable (used as React keys + QA evidence)", () => {
    const ids = script.criteria.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
