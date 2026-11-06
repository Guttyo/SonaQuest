import { TALK_HINT, TALK_INSERTED, TALK_LABELS, TALK_NOTICES } from "./messages";
import { TALK_STYLE, micNotice, type TalkNotice, type TalkSnapshot } from "./talk";
import "./voice.css";

/** 画面ごとに差し替える文（ボードの文字起こし。Issue #202）。省くと訓練の文 */
export interface TalkButtonTexts {
  hint: string;
  inserted: string;
  notices: Readonly<Record<TalkNotice, string>>;
}

/**
 * 「押して話す」のボタン（ADR-0033）。指・マウス・キーボード（スペース・Enter）で押せる。
 * 押している間だけマイクを開く。マイクが使えないときは、理由を文字で示し、文字入力で続ける。
 */
export function TalkButton({
  snapshot,
  inserted,
  onPress,
  onRelease,
  texts,
}: {
  snapshot: TalkSnapshot;
  /** 聞き取った文を入力欄に入れた直後か */
  inserted: boolean;
  onPress: () => void;
  onRelease: () => void;
  texts?: TalkButtonTexts;
}) {
  const labels = TALK_LABELS[TALK_STYLE];
  const usable = snapshot.mic === "ready";
  const notice = snapshot.notice ?? micNotice(snapshot.mic);
  const t = texts ?? { hint: TALK_HINT, inserted: TALK_INSERTED, notices: TALK_NOTICES };
  const status = notice !== null ? t.notices[notice] : inserted ? t.inserted : t.hint;

  return (
    <div className="talk">
      {usable && (
        <button
          type="button"
          className="talk-button"
          data-listening={snapshot.listening ? "true" : "false"}
          aria-pressed={snapshot.listening}
          aria-describedby="talk-status"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            onPress();
          }}
          onPointerUp={onRelease}
          onPointerCancel={onRelease}
          onLostPointerCapture={onRelease}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) {
              e.preventDefault();
              onPress();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onRelease();
            }
          }}
          onBlur={onRelease}
          // 長押しで出るメニューで、押している状態が切れないように
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="talk-mic" aria-hidden="true" />
          {snapshot.listening ? labels.listening : labels.idle}
        </button>
      )}
      <p id="talk-status" className="talk-status small" role="status">
        {status}
      </p>
      {snapshot.interim !== "" && (
        <p className="talk-interim small" aria-hidden="true">
          聞き取り中：{snapshot.interim}
        </p>
      )}
    </div>
  );
}
