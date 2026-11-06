// ボードの「連絡」タブ：掲示板チャット（B-07、Issue #121、ADR-0047）。
// 左に欄（本部のすべての欄・共通・救護所A〜DのDM）、右に吹き出し。人は本部として書き込める。
// 吹き出しは本部を右、救護所を左に分け、エージェントの書き込みには AI の訓練上の発言の印を付ける（Issue #161）。
// 状態はブラウザのメモリ（controller.ts）にだけあり、保存しない。エージェントの文は Workers の検査を通ったものだけを出す。

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { DemoState } from "../demo";
import { MAX_HUMAN_TEXT_LENGTH, type ChatChannel } from "./contract";
import {
  AUTO_INTERVAL_MS,
  boardChatController,
  boardChatViewMemory,
  openingPosts,
  type ChatController,
  type ChatPost,
  type ChatViewMemory,
} from "./controller";
import { chatStatus } from "./status";
import { CHAT_BUBBLE_TEXT, CHAT_ROLE_NAMES, CHAT_SEND_NOTICE, CHAT_TEXT, CHAT_VIEWS, type ChatView } from "./text";
import "./chat.css";

interface Props {
  state: DemoState;
  /** 試験で別の controller を渡す。ふだんは画面で1つのもの */
  controller?: ChatController;
  /** 試験で別の覚えを渡す。ふだんは画面で1つのもの（別のタブから戻ったときに欄とスクロールを戻す） */
  memory?: ChatViewMemory;
}

/** 描画の前にスクロールを戻す。DOM の無い環境（試験の文字列への描画）では useEffect にする */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** いちばん下から、これより近ければ「下を見ている」とみなし、新しい書き込みが来たら下へ送る（px） */
const NEAR_BOTTOM_PX = 48;

function viewNote(view: ChatView): string {
  if (view === "all") return CHAT_TEXT.viewNotes.all;
  if (view === "common") return CHAT_TEXT.viewNotes.common;
  return CHAT_TEXT.viewNotes.dm(CHAT_ROLE_NAMES[view]);
}

function badgeOf(post: ChatPost): string {
  return post.by === "agent" ? CHAT_BUBBLE_TEXT.aiBadge : CHAT_TEXT.badges[post.by];
}

function Post({ post, showChannel }: { post: ChatPost; showChannel: boolean }) {
  // 本部（人・エージェント・固定の掲示）は右、救護所は左
  const side = post.role === "HQ" ? "hq" : "site";
  const mine = post.by === "human";
  return (
    <li className={`board-chat-post ${post.by} side-${side}${mine ? " mine" : ""}`} data-by={post.by} data-side={side}>
      <div className="board-chat-meta">
        <span className="board-chat-name">{CHAT_ROLE_NAMES[post.role]}</span>
        <span className={`board-chat-badge ${post.by}`}>{badgeOf(post)}</span>
        {showChannel && <span className="board-chat-channel">{CHAT_TEXT.views[post.channel]}</span>}
      </div>
      <p className="board-chat-bubble">{post.text}</p>
      <span className="board-chat-time">
        {CHAT_TEXT.fictional} {post.clock}
      </span>
    </li>
  );
}

export function BoardChat({ state, controller = boardChatController, memory = boardChatViewMemory }: Props) {
  // 今の状況（件数と時刻だけ）。デモの時計が進むと変わるので、毎回の描画で読み直す
  const status = chatStatus(state);
  const statusRef = useRef(status);
  statusRef.current = status;
  controller.setStatusSource(() => statusRef.current);

  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [view, setViewState] = useState<ChatView>(() => memory.view);
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLOListElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const atBottomRef = useRef(true);

  const setView = (v: ChatView) => {
    memory.view = v;
    setViewState(v);
  };

  useEffect(() => {
    controller.seed();
    // 人が書き込まなくても、上限の内で、間をあけて次の役に書いてもらう。タブを見ていないときは進めない
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      controller.autoTick();
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [controller]);

  const posts = snap.posts.length > 0 ? snap.posts : openingPosts(status);
  const shown = view === "all" ? posts : posts.filter((p) => p.channel === view);
  const counts = (v: ChatView) => (v === "all" ? posts.length : posts.filter((p) => p.channel === v).length);
  const live = snap.phase === "live";
  const waiting = snap.waitingFor !== null;
  const stopped = snap.phase === "fallback" || snap.phase === "finished";
  const reason = snap.reason !== null ? (CHAT_TEXT.fallbackReasons[snap.reason] ?? CHAT_TEXT.fallbackReasons.unavailable) : null;

  // 欄を替えたとき・戻ってきたとき：覚えていた位置へ。覚えが無ければいちばん下（新しい書き込み）へ
  useIsoLayoutEffect(() => {
    // 狭い画面では欄の一覧が横に流れるので、選んでいる欄のボタンを見える位置へ（ページは動かさない）
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>(`[data-view="${view}"]`);
    if (nav && current && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, current.offsetLeft - nav.offsetLeft - 8);
    const el = logRef.current;
    if (el === null) return;
    const saved = memory.scrollTop[view];
    el.scrollTop = saved ?? el.scrollHeight;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, [view]);

  // 新しい書き込みが来たとき：下を見ていたら下へ送る。上を読んでいるときは動かさない
  useIsoLayoutEffect(() => {
    const el = logRef.current;
    if (el === null || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
    memory.scrollTop[view] = el.scrollTop;
  }, [shown.length]);

  const onScroll = () => {
    const el = logRef.current;
    if (el === null) return;
    memory.scrollTop[view] = el.scrollTop;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (view === "all" || waiting) return;
    if (controller.sendHuman(view as ChatChannel, draft)) {
      setDraft("");
      // 自分の書き込みは、上を読んでいても下へ送って見せる
      atBottomRef.current = true;
    }
  };

  return (
    <section className="board-chat" aria-labelledby="board-chat-title">
      <div className="board-chat-head">
        <h3 id="board-chat-title">{CHAT_TEXT.title}</h3>
        <p className="board-chat-lead">{CHAT_BUBBLE_TEXT.lead}</p>
        <div className="board-chat-chips">
          <p className={`board-chat-phase ${snap.phase}`} role="status" data-testid="chat-phase">
            <span className="board-chat-chip-label">{CHAT_BUBBLE_TEXT.aiStatusLabel}</span>
            {CHAT_BUBBLE_TEXT.aiStatus[snap.phase]}
          </p>
          <p className="board-chat-role" data-testid="chat-operating-role">
            <span className="board-chat-chip-label">{CHAT_BUBBLE_TEXT.operatingRoleLabel}</span>
            {CHAT_BUBBLE_TEXT.operatingRole}
          </p>
        </div>
        {stopped && (
          <p className="board-chat-stopped" data-testid="chat-stopped">
            {CHAT_TEXT.phase[snap.phase]}
            {reason !== null && <span className="board-chat-reason">{reason}</span>}
          </p>
        )}
        <details className="board-chat-about">
          <summary>{CHAT_BUBBLE_TEXT.about}</summary>
          <p>{CHAT_TEXT.lead}</p>
        </details>
      </div>

      {snap.phase === "intro" && (
        <div className="board-chat-start">
          <p>{CHAT_TEXT.startNote}</p>
          <p className="board-chat-notice">{CHAT_SEND_NOTICE}</p>
          <button type="button" className="board-chat-start-button" onClick={() => controller.start()}>
            {CHAT_TEXT.start}
          </button>
        </div>
      )}

      <div className="board-chat-body">
        <nav ref={navRef} className="board-chat-views" aria-label={CHAT_TEXT.viewsLabel}>
          {CHAT_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`board-chat-view${view === v ? " current" : ""}`}
              aria-pressed={view === v}
              data-view={v}
              onClick={() => setView(v)}
            >
              <span>{CHAT_TEXT.views[v]}</span>
              <span className="board-chat-count">{counts(v)}</span>
            </button>
          ))}
        </nav>

        <div className="board-chat-main">
          <p className="board-chat-viewnote">{viewNote(view)}</p>
          <p className="board-chat-boundary" data-testid="chat-board-unchanged">
            {CHAT_BUBBLE_TEXT.boardUnchanged}
          </p>
          {shown.length === 0 ? (
            <p className="board-note">{CHAT_TEXT.empty}</p>
          ) : (
            <ol
              ref={logRef}
              className="board-chat-log"
              role="log"
              aria-live="polite"
              aria-label={CHAT_TEXT.views[view]}
              onScroll={onScroll}
            >
              {shown.map((p) => (
                <Post key={p.id} post={p} showChannel={view === "all"} />
              ))}
            </ol>
          )}
          {snap.waitingFor !== null && (
            <p className="board-chat-waiting" data-testid="chat-waiting">
              {CHAT_ROLE_NAMES[snap.waitingFor]}：{CHAT_TEXT.sending}
            </p>
          )}

          {view === "all" ? (
            <p className="board-note">{CHAT_TEXT.chooseChannel}</p>
          ) : (
            <form className="board-chat-form" onSubmit={submit}>
              <p className="board-chat-notice" data-testid="chat-send-notice">
                {CHAT_SEND_NOTICE}
              </p>
              {!live && <p className="board-note">{CHAT_TEXT.localOnly}</p>}
              <label className="board-chat-label" htmlFor="board-chat-input">
                {CHAT_TEXT.inputLabel}（{CHAT_TEXT.views[view]}）
              </label>
              <p className="board-chat-role-note">{CHAT_BUBBLE_TEXT.operatingRoleNote}</p>
              <textarea
                id="board-chat-input"
                className="board-chat-input"
                rows={2}
                maxLength={MAX_HUMAN_TEXT_LENGTH}
                value={draft}
                placeholder={CHAT_TEXT.inputPlaceholder}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className="board-chat-send" disabled={waiting || draft.trim() === ""}>
                {CHAT_TEXT.send}
              </button>
            </form>
          )}
          <p className="board-note">{CHAT_TEXT.memoryNote}</p>
        </div>
      </div>
    </section>
  );
}
