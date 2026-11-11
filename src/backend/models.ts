/**
 * Tallow's model calls through the user's Lumiverse connections.
 *
 *   text        generate.quiet with the role's connection and reasoning (src/meaning/models.ts), falling back to the
 *               default connection when the picked one fails;
 *   decisions   the Decision model (needs the "decisions" permission): quick typed answers to small questions;
 *   embeddings  texts as vectors (needs "embeddings"), kept in memory, used to pick a card's lore.
 *
 * Decisions and embeddings are extras: without them, or when they fail, the caller gets null and the game goes on with
 * an ordinary model or with its own rules. A failure backs off for a few minutes, so a missing permission costs one
 * try, not one per turn.
 *
 * Adapted from the sibling project's model layer (its src/backend/models.ts). Copied, not imported (docs/DESIGN.md, 10).
 */
import type { DecisionAnswer, DecisionQuestion, EmbeddingConnectionDTO, SpindleAPI } from "lumiverse-spindle-types";
import type { Message, Role } from "../game/prompts.js";
import type { ModelsState } from "../shared/protocol.js";
import { attemptsFor, isAbort, normalizeSettings, patchSettings, pickDecision, ROLES, type ModelsPatch, pickEmbedding, reasoningOverride, textHash, type Attempt, type DecisionConn, type LlmConn, type ModelSettings } from "../meaning/models.js";

const SETTINGS = "models.json";
const CONN_TTL = 2 * 60_000;
const BACKOFF_MS = 3 * 60_000;
const VEC_CACHE = 4000;

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const contentOf = (res: unknown): string => (typeof res === "string" ? res : ((res as { content?: string } | null)?.content ?? ""));

export function createModels(spindle: SpindleAPI) {
  const log = (m: string): void => {
    try {
      spindle.log.info(`tallow models: ${m}`);
    } catch {
      /* best effort */
    }
  };
  const settingsCache = new Map<string, { at: number; s: ModelSettings }>();
  const llmCache = new Map<string, { at: number; list: LlmConn[] | null }>();
  const decCache = new Map<string, { at: number; list: DecisionConn[] | null }>();
  const embCache = new Map<string, { at: number; list: EmbeddingConnectionDTO[] }>();
  /** `${userId}:${key}`: connections that rejected a reasoning request. */
  const noReasoning = new Set<string>();
  const backoff = new Map<string, number>();
  const vecs = new Map<string, number[]>();

  async function settings(userId: string): Promise<ModelSettings> {
    const hit = settingsCache.get(userId);
    if (hit && Date.now() - hit.at < 30_000) return hit.s;
    const s = normalizeSettings(await spindle.userStorage.getJson<unknown>(SETTINGS, { fallback: {}, userId }).catch(() => ({})));
    settingsCache.set(userId, { at: Date.now(), s });
    return s;
  }

  async function llmConns(userId: string): Promise<LlmConn[] | null> {
    const hit = llmCache.get(userId);
    if (hit && Date.now() - hit.at < CONN_TTL) return hit.list;
    let list: LlmConn[] | null;
    try {
      list = (await spindle.connections.list(userId)).map((c) => ({
        id: c.id,
        name: c.name,
        model: c.model,
        isDefault: !!c.is_default,
        boundReasoning: c.reasoning_bindings ? !!(c.reasoning_bindings as { settings?: { apiReasoning?: boolean } }).settings?.apiReasoning : null,
      }));
    } catch {
      list = null;
    }
    llmCache.set(userId, { at: Date.now(), list });
    return list;
  }

  async function decisionConns(userId: string): Promise<DecisionConn[] | null> {
    const hit = decCache.get(userId);
    if (hit && Date.now() - hit.at < CONN_TTL) return hit.list;
    let list: DecisionConn[] | null;
    try {
      list = spindle.decisions?.listConnections ? (await spindle.decisions.listConnections({ userId })).map((c) => ({ id: c.id, name: c.name, provider: c.provider, model: c.model, isDefault: !!c.is_default, hasKey: !!c.has_api_key })) : null;
    } catch {
      list = null;
    }
    decCache.set(userId, { at: Date.now(), list });
    return list;
  }

  async function embeddingConns(userId: string): Promise<EmbeddingConnectionDTO[]> {
    const hit = embCache.get(userId);
    if (hit && Date.now() - hit.at < CONN_TTL) return hit.list;
    let list: EmbeddingConnectionDTO[] = [];
    try {
      list = spindle.embeddings?.listConnections ? await spindle.embeddings.listConnections({ userId }) : [];
    } catch {
      list = [];
    }
    embCache.set(userId, { at: Date.now(), list });
    return list;
  }

  const connOf = (conns: LlmConn[] | null, a: Attempt): LlmConn | undefined => (a.connectionId ? conns?.find((c) => c.id === a.connectionId) : conns?.find((c) => c.isDefault));

  /** One quiet call for a role; the text of the first attempt that answers. Throws the last error. */
  async function quiet(userId: string, role: Role, messages: Message[]): Promise<string> {
    const [s, conns] = await Promise.all([settings(userId), llmConns(userId)]);
    const no = new Set([...noReasoning].filter((k) => k.startsWith(`${userId}:`)).map((k) => k.slice(userId.length + 1)));
    const attempts = attemptsFor(s, role, conns, no);
    let last: unknown = new Error("no connection to try");
    for (const [i, a] of attempts.entries()) {
      try {
        const text = contentOf(await spindle.generate.quiet({ type: "quiet", messages, ...(a.connectionId ? { connection_id: a.connectionId } : {}), reasoning: reasoningOverride(a, connOf(conns, a)), userId } as never));
        if (!text.trim()) throw new Error("the model gave no answer");
        return text;
      } catch (err) {
        last = err;
        if (isAbort(err)) throw err;
        if (a.reasoning) noReasoning.add(`${userId}:${a.key}`);
        log(`${role}: ${a.connectionId ? "its own connection" : "the default connection"}${a.reasoning ? " with reasoning" : ""} failed (${errText(err).slice(0, 140)})${i + 1 < attempts.length ? "; trying the next" : ""}`);
      }
    }
    throw last;
  }

  /**
   * Typed answers from the Decision model, or null when there is none, it failed, or it ran past `ms`. A failure that
   * is not a timeout backs off for a few minutes, so the callers go straight to the next way of answering.
   */
  async function decide(userId: string, state: unknown, questions: Record<string, DecisionQuestion>, ms: number, what = "decision"): Promise<Record<string, DecisionAnswer | undefined> | null> {
    if (!Object.keys(questions).length) return {};
    if (!spindle.decisions?.evaluate || (backoff.get(`${userId}:decide`) ?? 0) > Date.now()) return null;
    const [s, conns] = await Promise.all([settings(userId), decisionConns(userId)]);
    const p = pickDecision(s.decision, conns);
    if (!p.use) return null;
    const t0 = Date.now();
    try {
      const r = await spindle.decisions.evaluate({ state: state as never, questions, userId, ...(p.id ? { connection_id: p.id } : {}) }, { signal: AbortSignal.timeout(ms) });
      log(`${what}: answered by ${r.model ?? "?"} in ${Date.now() - t0} ms`);
      return r.answers as Record<string, DecisionAnswer | undefined>;
    } catch (err) {
      log(`${what}: the decision model gave no answer (${errText(err).slice(0, 140)})`);
      if (!isAbort(err)) backoff.set(`${userId}:decide`, Date.now() + BACKOFF_MS);
      return null;
    }
  }

  /** Texts as vectors, from memory when embedded before. Null when there is no embedding connection, or it fails. */
  async function embed(userId: string, texts: string[], opts: { ms: number; inputType?: "query" | "passage" }): Promise<(number[] | null)[] | null> {
    if (!texts.length || !spindle.embeddings?.embed || (backoff.get(`${userId}:embed`) ?? 0) > Date.now()) return null;
    const [s, conns] = await Promise.all([settings(userId), embeddingConns(userId)]);
    const conn = pickEmbedding(s.embedding, conns.map((c) => ({ ...c, primary: c.is_primary })));
    if (!conn) return null;
    const type = opts.inputType ?? "passage";
    const k = (t: string): string => `${conn.id}:${conn.model}:${conn.dimensions ?? "n"}:${type}:${textHash(t)}`;
    const want = [...new Set(texts.filter((t) => t.trim() && !vecs.has(k(t))))].slice(0, 256);
    if (want.length) {
      try {
        const res = await spindle.embeddings.embed({ texts: want.map((t) => t.slice(0, 8000)), connection_id: conn.id, input_type: type, userId }, { signal: AbortSignal.timeout(opts.ms) });
        want.forEach((t, i) => {
          const v = res.embeddings[i];
          if (v?.length) vecs.set(k(t), v);
        });
        while (vecs.size > VEC_CACHE) vecs.delete(vecs.keys().next().value!);
      } catch (err) {
        log(`embeddings: ${errText(err).slice(0, 140)}`);
        if (!isAbort(err)) backoff.set(`${userId}:embed`, Date.now() + BACKOFF_MS);
        return null;
      }
    }
    return texts.map((t) => vecs.get(k(t)) ?? null);
  }

  /** What the drawer shows: the choices made and the connections to pick from. */
  async function state(userId: string): Promise<ModelsState> {
    const [s, llm, dec, emb] = await Promise.all([settings(userId), llmConns(userId), decisionConns(userId), embeddingConns(userId)]);
    return {
      roles: Object.fromEntries(ROLES.map((r) => [r, { connectionId: s.roles[r]?.connectionId ?? null, reasoning: s.roles[r]?.reasoning ?? "auto" }])) as ModelsState["roles"],
      decision: s.decision ?? "auto",
      embedding: s.embedding ?? "auto",
      llm: (llm ?? []).map((c) => ({ id: c.id, name: c.name || c.model, model: c.model, isDefault: c.isDefault })),
      decisions: dec === null ? null : dec.filter((c) => c.hasKey).map((c) => ({ id: c.id, name: c.name || c.model, model: c.model, isDefault: c.isDefault })),
      embeddings: emb.filter((c) => c.enabled).map((c) => ({ id: c.id, name: c.name, model: c.model, isDefault: c.is_primary })),
    };
  }

  async function update(userId: string, patch: ModelsPatch): Promise<ModelsState> {
    const next = patchSettings(await settings(userId), patch);
    await spindle.userStorage.setJson(SETTINGS, next, { userId });
    settingsCache.set(userId, { at: Date.now(), s: next });
    // A new pick gets a fresh chance: forget failures and the lists read before.
    for (const k of [...noReasoning]) if (k.startsWith(`${userId}:`)) noReasoning.delete(k);
    backoff.delete(`${userId}:decide`);
    backoff.delete(`${userId}:embed`);
    llmCache.delete(userId);
    decCache.delete(userId);
    embCache.delete(userId);
    return state(userId);
  }

  /** Forget the connection lists, so a drawer opened after a change in Lumiverse sees it. */
  const fresh = (userId: string): void => {
    llmCache.delete(userId);
    decCache.delete(userId);
    embCache.delete(userId);
    backoff.delete(`${userId}:decide`);
    backoff.delete(`${userId}:embed`);
  };

  return { quiet, decide, embed, state, update, fresh };
}

export type Models = ReturnType<typeof createModels>;
