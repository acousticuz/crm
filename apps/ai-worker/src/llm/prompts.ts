import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Loads versioned prompt files from the repo's top-level `prompts/`
 * directory. Real adapters (Claude/GPT) inject the loaded text as the
 * system message; the mock adapter doesn't need it but we still expose
 * the loader so prompts can be audited from one place.
 *
 * Filename convention: `<purpose>.v<N>.md` — bump the version when
 * editing the prompt; older callers can pin to the previous version
 * during gradual rollouts.
 */
const PROMPTS_DIR = path.resolve(__dirname, "../../../../prompts");

export async function loadPrompt(name: string): Promise<string> {
  const full = path.join(PROMPTS_DIR, name);
  return fs.readFile(full, "utf-8");
}

export async function safeLoadPrompt(name: string, fallback: string): Promise<string> {
  try {
    return await loadPrompt(name);
  } catch {
    return fallback;
  }
}
