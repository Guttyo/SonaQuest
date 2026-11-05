// ボードの「連絡」タブ：掲示板チャット（B-07、Issue #121、ADR-0047）。
// 左に欄（本部のすべての欄・共通・救護所A〜DのDM）、右に吹き出し。人は本部として書き込める。
// 状態はブラウザのメモリ（controller.ts）にだけあり、保存しない。エージェントの文は Workers の検査を通ったものだけを出す。

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { DemoState } from "../demo";
import { MAX_HUMAN_TEXT_LENGTH, type ChatChannel } from "./contract";
import { AUTO_INTERVAL_MS, boardChatController, openingPosts, type ChatController, type ChatPost } from "./controller";
import { chatStatus } from "./status";
import { CHAT_ROLE_NAMES, CHAT_SEND_NOTICE, CHAT_TEXT, CHAT_VIEWS, type ChatView } from "./text";
import "./chat.css";

interface Props {
  state: DemoState;
  /** 試験で別の controller を渡す。ふだんは画面で1つのもの */
  controller?: ChatController;
}

function viewNote(view: ChatView): string {
  if (view === "all") return CHAT_TEXT.viewNotes.all;
  if (view === "common") return CHAT_TEXT.viewNotes.common;
  return CHAT_TEXT.viewNotes.dm(CHAT_ROLE_NAMES[view]);
}

function Post({ post, showChannel }: { post: ChatPost; showChannel: boolean }) {
  const mine = post.by === "human";
  return (
    <li className={`board-chat-post ${post.by}${mine ? " mine" : ""}${post.role === "HQ" ? " hq" : ""}`} data-by={post.by}>
      <div className="board-chat-meta">
        <span className="board-chat-name">{CHAT_ROLE_NAMES[post.role]}</span>
        {showChannel && <span className="board-chat-channel">{CHAT_TEXT.views[post.channel]}</span>}
        <span className="board-chat-badge">{CHAT_TEXT.badges[post.by]}</span>
        <span className="board-chat-time">
          {CHAT_TEXT.fictional} {post.clock}
        </span>
      </div>
      <p className="board-chat-bubble">{post.text}</p>
    </li>
  );
}

export function BoardChat({ state, controller = boardChatController }: Props) {
  // 今の状況（件数と時刻だけ）。デモの時計が進むと変わるので、毎回の描画で読み直す
  const status = chatStatus(state);
  const statusRef = useRef(status);
  statusRef.current = status;
  controller.setStatusSource(() => statusRef.current);

  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [view, setView] = useState<ChatView>("all");
  const [draft, setDraft] = useState("");

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
  const reason = snap.reason !== null ? (CHAT_TEXT.fallbackReasons[snap.reason] ?? CHAT_TEXT.fallbackReasons.unavailable) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (view === "all" || waiting) return;
    if (controller.sendHuman(view as ChatChannel, draft)) setDraft("");
  };

  return (
    <section className="board-chat" aria-labelledby="board-chat-title">
      <h3 id="board-chat-title">{CHAT_TEXT.title}</h3>
      <p className="board-note">{CHAT_TEXT.lead}</p>
      <p className={`board-chat-phase ${snap.phase}`} role="status" data-testid="chat-phase">
        {CHAT_TEXT.phase[snap.phase]}
        {reason !== null && <span className="board-chat-reason">{reason}</span>}
      </p>

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
        <nav className="board-chat-views" aria-label={CHAT_TEXT.viewsLabel}>
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
          {shown.length === 0 ? (
            <p className="board-note">{CHAT_TEXT.empty}</p>
          ) : (
            <ol className="board-chat-log" role="log" aria-live="polite" aria-label={CHAT_TEXT.views[view]}>
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
