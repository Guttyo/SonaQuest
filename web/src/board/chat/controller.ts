// ボードの掲示板チャット（B-07、ADR-0047）の進め方。状態はブラウザのメモリにだけあり、保存も、ログへの出力もしない。
// 画面の外に出るのは Workers（/api/board/chat/*）への呼び出しだけで、送るのは役・欄・ボードの件数と時刻・その欄の書き込み。
// だれがいつ書くか（役と欄の順番）はルールで決め、エージェントに選ばせない。エージェントに頼むのは、その1件の文だけ。
// エージェントが使えないとき（設定が無い・失敗・上限・回数制限）は、ルールで組んだ固定の掲示に切り替える。

import {
  MAX_CONTEXT_POSTS,
  MAX_HUMAN_TEXT_LENGTH,
  type ChatChannel,
  type ChatPostBy,
  type ChatRole,
  type ChatShelter,
  type ChatStatus,
  type ChatTurnRequest,
} from "./contract";
import { CHAT_FIXED, type ChatView } from "./text";

export interface ChatPost {
  id: number;
  channel: ChatChannel;
  role: ChatRole;
  by: ChatPostBy;
  text: string;
  /** 架空の時刻（デモの時計） */
  clock: string;
}

/** intro：まだ始めていない。live：エージェントが動いている。fallback：固定の掲示に切り替えた。finished：回数の上限で止めた */
export type ChatPhase = "intro" | "live" | "fallback" | "finished";

export interface ChatSnapshot {
  phase: ChatPhase;
  /** 固定の掲示に切り替えた理由の種類（本文を含まない） */
  reason: string | null;
  posts: readonly ChatPost[];
  /** 返事を待っている役（待っていなければ null） */
  waitingFor: ChatRole | null;
}

interface Job {
  role: ChatRole;
  channel: ChatChannel;
}

export type ChatFetch = (url: string, init: RequestInit) => Promise<Response>;

/** 1ページで頼むエージェントの文の数の上限（人の書き込みへの返事も含む）。budget と回数制限に加えた画面側の上限 */
// [TODO-OWNER: 掲示板チャットの1ページあたりのエージェントの文の上限と、自動で進む回数・間隔（Claude Code の下書き：30件、自動10回、40秒ごと）]
export const MAX_AGENT_TURNS = 30;
/** 人が書き込まなくても、エージェントどうしで進める回数の上限 */
export const MAX_AUTO_TURNS = 10;
/** 自動で次の役に書いてもらう間隔 */
export const AUTO_INTERVAL_MS = 40_000;

/** 始めたときの順番：各救護所が本部へ報告し、本部が共通の欄に書く */
export const OPENING_JOBS: readonly Job[] = [
  { role: "A", channel: "A" },
  { role: "B", channel: "B" },
  { role: "C", channel: "C" },
  { role: "D", channel: "D" },
  { role: "HQ", channel: "common" },
];

/** 自動で進めるときの順番（くり返す） */
export const AUTO_JOBS: readonly Job[] = [
  { role: "HQ", channel: "B" },
  { role: "C", channel: "common" },
  { role: "HQ", channel: "D" },
  { role: "A", channel: "common" },
  { role: "B", channel: "B" },
  { role: "HQ", channel: "common" },
  { role: "D", channel: "D" },
  { role: "HQ", channel: "C" },
];

/** 共通の欄に人が書いたとき、返事をする救護所の順番 */
const COMMON_REPLIERS: readonly ChatShelter[] = ["A", "B", "C", "D"];

/** 返事が無い・捨てたときに出す固定の掲示（件数と時刻だけ） */
export function fixedText(job: Job, status: ChatStatus): string {
  if (job.role === "HQ") {
    if (job.channel === "common") return CHAT_FIXED.hqCommon(status);
    const site = status.sites.find((s) => s.site === job.channel);
    return site ? CHAT_FIXED.hqDm(site) : CHAT_FIXED.hqCommon(status);
  }
  const site = status.sites.find((s) => s.site === job.role);
  if (!site) return CHAT_FIXED.hqCommon(status);
  return job.channel === "common" ? CHAT_FIXED.siteCommon(site) : CHAT_FIXED.siteReport(site);
}

/** 最初に並べる固定の掲示（seed と同じ中身）。画面が最初に描くときにも使う */
export function openingPosts(status: ChatStatus): ChatPost[] {
  return OPENING_JOBS.map((job, i) => ({
    id: i + 1,
    channel: job.channel,
    role: job.role,
    by: "fixed" as const,
    text: fixedText(job, status),
    clock: status.clock,
  }));
}

type PostResult = { ok: true; json: Record<string, unknown> } | { ok: false; code: string };

export class ChatController {
  private snapshot: ChatSnapshot = { phase: "intro", reason: null, posts: [], waitingFor: null };
  private readonly listeners = new Set<() => void>();
  private readonly sessions: Partial<Record<ChatRole, string>> = {};
  private queue: Job[] = [];
  private running = false;
  private turns = 0;
  private autoTurns = 0;
  private autoIndex = 0;
  private replyIndex = 0;
  private seq = 0;
  private statusSource: (() => ChatStatus) | null = null;
  private readonly fetchFn: ChatFetch;

  constructor(fetchFn?: ChatFetch) {
    // 既定は実行の時点の fetch（試験では偽物を渡す）
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ChatSnapshot => this.snapshot;

  /** ボードの今の状況を読む関数（デモの時計が進むと変わる）。画面が渡す */
  setStatusSource(source: () => ChatStatus): void {
    this.statusSource = source;
  }

  private status(): ChatStatus {
    if (this.statusSource === null) throw new Error("status source is not set");
    return this.statusSource();
  }

  private update(patch: Partial<ChatSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  private addPost(job: Job, by: ChatPostBy, text: string): void {
    this.seq += 1;
    const post: ChatPost = { id: this.seq, channel: job.channel, role: job.role, by, text, clock: this.status().clock };
    this.update({ posts: [...this.snapshot.posts, post] });
  }

  /** 最初に開いたとき、固定の掲示を並べる（エージェントを呼ばない） */
  seed(): void {
    if (this.snapshot.posts.length > 0) return;
    const posts = openingPosts(this.status());
    this.seq = posts.length;
    this.update({ posts });
  }

  /** 人が「始める」を押したときだけ、エージェントを呼び始める */
  start(): void {
    if (this.snapshot.phase !== "intro") return;
    this.update({ phase: "live" });
    this.enqueue(...OPENING_JOBS);
  }

  /** 人が本部として書き込む。エージェントにつながっていれば、その欄の相手に返事を頼む */
  sendHuman(channel: ChatChannel, raw: string): boolean {
    const text = raw.trim();
    if (text === "" || text.length > MAX_HUMAN_TEXT_LENGTH) return false;
    this.addPost({ role: "HQ", channel }, "human", text);
    if (this.snapshot.phase !== "live") return true;
    let replier: ChatShelter;
    if (channel === "common") {
      replier = COMMON_REPLIERS[this.replyIndex % COMMON_REPLIERS.length];
      this.replyIndex += 1;
    } else {
      replier = channel;
    }
    this.enqueue({ role: replier, channel });
    return true;
  }

  /** 自動で次の役に書いてもらう（画面のタイマーが呼ぶ）。待ちが無く、上限の内のときだけ */
  autoTick(): void {
    if (this.snapshot.phase !== "live" || this.running || this.queue.length > 0) return;
    if (this.autoTurns >= MAX_AUTO_TURNS) return;
    this.autoTurns += 1;
    const job = AUTO_JOBS[this.autoIndex % AUTO_JOBS.length];
    this.autoIndex += 1;
    this.enqueue(job);
  }

  /** 待ちの仕事がすべて終わるのを待つ（試験用） */
  async idle(): Promise<void> {
    while (this.running) await new Promise((r) => setTimeout(r, 0));
  }

  private enqueue(...jobs: Job[]): void {
    this.queue.push(...jobs);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0 && this.snapshot.phase === "live") {
        const job = this.queue.shift() as Job;
        this.update({ waitingFor: job.role });
        try {
          await this.run(job);
        } catch {
          // 思いがけない失敗でも、待ちのまま止めず固定の掲示に切り替える
          this.toFallback(job, "unavailable");
        }
      }
    } finally {
      this.queue = [];
      this.running = false;
      this.update({ waitingFor: null });
    }
  }

  private async post(url: string, body: unknown): Promise<PostResult> {
    try {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || json === null) {
        const code = json !== null && typeof json.error === "string" ? json.error : "unavailable";
        return { ok: false, code };
      }
      return { ok: true, json };
    } catch {
      return { ok: false, code: "network" };
    }
  }

  /** 固定の掲示に切り替える。待ちを捨て、もうエージェントを呼ばない */
  private toFallback(job: Job, code: string): void {
    this.addPost(job, "fixed", fixedText(job, this.status()));
    this.queue = [];
    this.update({ phase: "fallback", reason: code });
  }

  private async run(job: Job): Promise<void> {
    if (this.turns >= MAX_AGENT_TURNS) {
      this.queue = [];
      this.update({ phase: "finished" });
      return;
    }
    this.turns += 1;
    let sessionId = this.sessions[job.role];
    if (sessionId === undefined) {
      const created = await this.post("/api/board/chat/session", { role: job.role });
      if (!created.ok || typeof created.json.sessionId !== "string") {
        this.toFallback(job, created.ok ? "unavailable" : created.code);
        return;
      }
      sessionId = created.json.sessionId;
      this.sessions[job.role] = sessionId;
    }
    const status = this.status();
    const posts = this.snapshot.posts
      .filter((p) => p.channel === job.channel)
      .slice(-MAX_CONTEXT_POSTS)
      .map((p) => ({ role: p.role, by: p.by, text: p.text }));
    const request: ChatTurnRequest = { role: job.role, sessionId, channel: job.channel, status, posts };
    const result = await this.post("/api/board/chat/turn", request);
    if (!result.ok) {
      this.toFallback(job, result.code);
      return;
    }
    const text = result.json.text;
    // 検査で捨てた文（text が null）は、その1件だけ固定の掲示に替えて続ける
    if (typeof text === "string" && text.trim() !== "") this.addPost(job, "agent", text);
    else this.addPost(job, "fixed", fixedText(job, status));
  }
}

/**
 * 別のタブ（在庫と発注など）へ移って戻ったときに、選んでいた欄とスクロールの位置を戻すための覚え（Issue #161）。
 * ボードの画面はタブを替えると「連絡」の部品を外すので、部品の外（このメモリ）に持つ。保存はしない（タブを閉じると消える）
 */
export interface ChatViewMemory {
  view: ChatView;
  /** 欄ごとのスクロールの位置（px）。無い欄は、いちばん下（新しい書き込み）から見せる */
  scrollTop: Partial<Record<ChatView, number>>;
}

export function newViewMemory(): ChatViewMemory {
  return { view: "all", scrollTop: {} };
}

/** 画面で使う1つ（ブラウザのメモリにだけある。タブを閉じると消える） */
export const boardChatController = new ChatController();
/** 画面で使う欄とスクロールの覚え（ブラウザのメモリにだけある） */
export const boardChatViewMemory: ChatViewMemory = newViewMemory();
