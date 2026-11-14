/**
 * Asking a model: the shape of a message, which job an ask is for (so the host can send it to the right connection),
 * and how the first JSON object in an answer is read.
 */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Which ask it is, so the host can send it to the right connection: the builder sets a game up, the reader judges and
 * reads back, the teller tells the story. ("hero" is kept for settings saved before, and is asked nothing now.)
 */
export type Role = "builder" | "hero" | "reader" | "teller";

/** What may go with an ask: the settings a chat's preset has for the model (preset.ts), for a narration under it. */
export interface AskOptions {
  parameters?: Record<string, unknown>;
}

/** Ask a model. Resolves with its text; rejects if it could not be asked. */
export type Ask = (messages: Message[], role: Role, opts?: AskOptions) => Promise<string>;

/** The first JSON object in a model's text (inside a code fence or not), or null. */
export function firstJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(t.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
