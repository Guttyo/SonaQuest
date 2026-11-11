// Managed Agents のセッションとのやりとりの共通の部品（Issue #294）。
// 掲示板チャット（B-07、boardChat.ts）とカルテの監査役（B-10、karteAudit.ts）の両方が使う。
// - 失敗の種類の分け方（classify）、Agent・Environment の ID の形
// - SSE を先に開いてから送り、止まるまで読む1回分の処理（runSessionTurn・collectTurn）
// - 後片付け（中断だけを送る interruptSession、中断してから削除する cleanupSession）
// ここではログを出さない。出すのは呼ぶ側で、失敗の種類・件数・所要時間・後片付けの状態だけ（ADR-0007）。

import Anthropic from "@anthropic-ai/sdk";

/** 失敗の種類。本文を含まないので、ログに出してよい */
export type SessionFailure =
  | "timeout"
  | "rate_limited"
  | "connection"
  | "bad_request"
  | "not_found"
  | "api_error"
  | "budget_reached"
  | "requires_action"
  | "retries_exhausted"
  | "refusal"
  | "terminated"
  | "no_message"
  | "incomplete"
  | "unknown";

export type TurnResult = { ok: true; text: string } | { ok: false; failure: SessionFailure };

/** 後片付けの結果（カルテの監査の返事の AuditSessionState のうちの2つと同じ値） */
export type CleanupState = "deleted" | "failed";

export const AGENT_ID_PATTERN = /^agent_[A-Za-z0-9_]{8,128}$/;
export const ENV_ID_PATTERN = /^env_[A-Za-z0-9_]{8,128}$/;

/** 後片付けの1回ごとの呼び出しを待つ上限 */
export const SESSION_CALL_TIMEOUT_MS = 5_000;
/**
 * 後片付けの全体を待つ上限。Workers の waitUntil は、応答の後 30 秒まで（その後は打ち切られる。Cloudflare の公式の文書）。
 * その内に収まるようにする
 */
export const CLEANUP_DEADLINE_MS = 20_000;
/** 中断してから止まるのを待つ回数と間隔 */
const CLEANUP_POLLS = 10;
const CLEANUP_INTERVAL_MS = 1_000;

/** SDK の例外を失敗の種類に分ける */
export function classify(error: unknown): SessionFailure {
  if (error instanceof Anthropic.APIUserAbortError) return "timeout";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "connection";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  // セッションが budget で止まっているときに user.message を送ると 400 になる（ほかの 400 と区別しない）
  if (error instanceof Anthropic.BadRequestError) return "bad_request";
  if (error instanceof Anthropic.NotFoundError) return "not_found";
  if (error instanceof Anthropic.APIError) return "api_error";
  return "unknown";
}

/** SSE の出来事。ここでは type だけを頼りにし、中身は型ガードで確かめてから読む */
export type SessionStreamEvent = { readonly type: string };

function messageTexts(event: SessionStreamEvent): string[] | null {
  if (event.type !== "agent.message" || !("content" in event)) return null;
  const content = (event as { content: unknown }).content;
  if (!Array.isArray(content)) return null;
  const texts: string[] = [];
  for (const block of content as unknown[]) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
  }
  return texts;
}

function stopReason(event: SessionStreamEvent): string | null {
  if (event.type !== "session.status_idle" || !("stop_reason" in event)) return null;
  const reason = (event as { stop_reason: unknown }).stop_reason;
  if (typeof reason !== "object" || reason === null) return "";
  const type = (reason as { type?: unknown }).type;
  return typeof type === "string" ? type : "";
}

/**
 * 送った後の出来事を、セッションが止まるまで読み、エージェントの文をつなげる。
 * 止まった（status_idle）は、この回の動き出し（status_running）かエージェントの文を見た後だけ数える。
 * 文を使うのは、end_turn で止まったのを見たときだけ（途中で切れたストリームの文は使わない）
 * （ストリームは開いた後の出来事だけを流すが、開いた時点の状態が来ても1回目で終わらないようにする）
 */
export async function collectTurn(stream: AsyncIterable<SessionStreamEvent>): Promise<TurnResult> {
  const texts: string[] = [];
  let started = false;
  let ended = false;
  for await (const event of stream) {
    const message = messageTexts(event);
    if (message !== null) {
      started = true;
      texts.push(...message);
      continue;
    }
    if (event.type === "session.status_running") {
      started = true;
      continue;
    }
    const reason = stopReason(event);
    if (reason !== null) {
      if (!started) continue;
      if (reason === "end_turn") {
        ended = true;
        break;
      }
      if (reason === "budget_reached") return { ok: false, failure: "budget_reached" };
      if (reason === "requires_action") return { ok: false, failure: "requires_action" };
      if (reason === "retries_exhausted") return { ok: false, failure: "retries_exhausted" };
      if (reason === "refusal") return { ok: false, failure: "refusal" };
      return { ok: false, failure: "unknown" };
    }
    if (event.type === "session.status_terminated") return { ok: false, failure: "terminated" };
  }
  // 止まった（end_turn）を見ないままストリームが終わったときは、文が途中かもしれないので使わない
  if (!ended) return { ok: false, failure: "incomplete" };
  const text = texts.join("").trim();
  return text === "" ? { ok: false, failure: "no_message" } : { ok: true, text };
}

/**
 * 1回分：SSE を先に開いてから user.message を送り、collectTurn で読む（開く前の出来事は流れてこないため）。
 * signal が止まったときは timeout にする。ストリームを閉じるのは、signal を持つ呼ぶ側（読み終えたら abort する）
 */
export async function runSessionTurn(client: Anthropic, sessionId: string, message: string, signal: AbortSignal): Promise<TurnResult> {
  try {
    const stream = await client.beta.sessions.events.stream(sessionId, {}, { signal });
    await client.beta.sessions.events.send(
      sessionId,
      { events: [{ type: "user.message", content: [{ type: "text", text: message }] }] },
      { signal },
    );
    return await collectTurn(stream);
  } catch (error) {
    return { ok: false, failure: signal.aborted ? "timeout" : classify(error) };
  }
}

/** セッションの操作のうち、後片付けで使うもの（試験では偽物を渡す） */
export interface SessionOps {
  delete(sessionId: string): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  status(sessionId: string): Promise<string>;
  sleep(ms: number): Promise<void>;
}

/** 本物の後片付けの操作。どの呼び出しにも短い上限（SESSION_CALL_TIMEOUT_MS）を付ける */
export function makeSessionOps(client: Anthropic, callTimeoutMs = SESSION_CALL_TIMEOUT_MS): SessionOps {
  const options = () => ({ signal: AbortSignal.timeout(callTimeoutMs) });
  return {
    async delete(id) {
      await client.beta.sessions.delete(id, {}, options());
    },
    async interrupt(id) {
      await client.beta.sessions.events.send(id, { events: [{ type: "user.interrupt" }] }, options());
    },
    async status(id) {
      return (await client.beta.sessions.retrieve(id, {}, options())).status;
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/** 中断だけを送る（セッションと履歴は残す）。送れたら true */
export async function interruptSession(ops: SessionOps, sessionId: string): Promise<boolean> {
  try {
    await ops.interrupt(sessionId);
    return true;
  } catch {
    return false;
  }
}

async function cleanupSteps(ops: SessionOps, sessionId: string, expired: () => boolean): Promise<CleanupState> {
  try {
    await ops.delete(sessionId);
    return "deleted";
  } catch {
    // 動いている間は削除できないので、中断してから続ける
  }
  if (expired()) return "failed";
  // 中断を送れなくても、止まるのを待ってみる
  await interruptSession(ops, sessionId);
  for (let i = 0; i < CLEANUP_POLLS; i++) {
    if (expired()) return "failed";
    await ops.sleep(CLEANUP_INTERVAL_MS);
    if (expired()) return "failed";
    let status = "";
    try {
      status = await ops.status(sessionId);
    } catch {
      continue;
    }
    if (status === "idle" || status === "terminated") {
      try {
        await ops.delete(sessionId);
        return "deleted";
      } catch {
        return "failed";
      }
    }
  }
  return "failed";
}

/**
 * 時間切れなどで、セッションが動いているかもしれないときの後片付け。
 * まず削除を試し、だめなら中断を送って、止まる（idle か terminated）のを待ってから削除する。
 * 全体を deadlineMs で打ち切り、超えたら "failed"（呼び出しが返らないままでも待ち続けない）
 */
export async function cleanupSession(ops: SessionOps, sessionId: string, deadlineMs = CLEANUP_DEADLINE_MS): Promise<CleanupState> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<CleanupState>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve("failed");
    }, deadlineMs);
  });
  try {
    return await Promise.race([cleanupSteps(ops, sessionId, () => expired), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
