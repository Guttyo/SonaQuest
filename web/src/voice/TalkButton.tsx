import { useId, type ButtonHTMLAttributes } from "react";
import { TALK_HINT, TALK_INSERTED, TALK_LABELS, TALK_NOTICES } from "./messages";
import { TALK_STYLE, micNotice, type TalkNotice, type TalkSnapshot, type TalkStyle } from "./talk";
import "./voice.css";

/** 画面ごとに差し替える文（ボードの文字起こし。Issue #202）。省くと訓練の文 */
export interface TalkButtonTexts {
  hint: string;
  inserted: string;
  notices: Readonly<Record<TalkNotice, string>>;
}

/** 押し方ごとに、ボタンに付ける事件のハンドラー */
export type TalkButtonHandlers = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onKeyDown" | "onKeyUp" | "onBlur"
>;

/**
 * 押し方ごとのハンドラー（Issue #295）。どちらの押し方でも、1回押すと onPress がちょうど1回呼ばれる。
 * - tap：click だけで聞き始める（指・マウスは離したとき、Enter・Space はボタンの既定の動きで click になる）。
 *   click だけを送る支援技術（読み上げの閲覧モードの一部、スイッチ操作など）でも押せる。
 *   pointerdown も付けると、1回押すたびに press() が2回呼ばれて、すぐ止まってしまうので付けない。
 *   tap の onRelease は talk.ts の側で何もしないので付けない。
 * - hold：押している間だけ聞く。pointerdown・Enter・Space の keydown で聞き始め、離したら止める。click は付けない。
 */
export function talkButtonHandlers(style: TalkStyle, onPress: () => void, onRelease: () => void): TalkButtonHandlers {
  if (style === "tap") return { onClick: () => onPress() };
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onPress();
    },
    onPointerUp: onRelease,
    onPointerCancel: onRelease,
    onLostPointerCapture: onRelease,
    onKeyDown: (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        onPress();
      }
    },
    onKeyUp: (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onRelease();
      }
    },
    onBlur: onRelease,
  };
}

/**
 * 「押して話す」のボタン（ADR-0033）。指・マウス・キーボード（スペース・Enter）で押せる。
 * tap（既定）は1回押すとマイクを開き、話し終わると自動で止まる。hold は押している間だけ開く。マイクが使えないときは、理由を文字で示し、文字入力で続ける。
 */
export function TalkButton({
  snapshot,
  inserted,
  onPress,
  onRelease,
  texts,
  style = TALK_STYLE,
}: {
  snapshot: TalkSnapshot;
  /** 聞き取った文を入力欄に入れた直後か */
  inserted: boolean;
  onPress: () => void;
  onRelease: () => void;
  texts?: TalkButtonTexts;
  /** 押し方。PushToTalk に渡したものと同じにする */
  style?: TalkStyle;
}) {
  const labels = TALK_LABELS[style];
  const usable = snapshot.mic === "ready";
  const notice = snapshot.notice ?? micNotice(snapshot.mic);
  const t = texts ?? { hint: TALK_HINT, inserted: TALK_INSERTED, notices: TALK_NOTICES };
  const status = notice !== null ? t.notices[notice] : inserted ? t.inserted : t.hint;
  // 状態の文の id は部品ごとに作る（同じ画面に2つ並んでも、それぞれ自分の状態の文を指す。Issue #295）
  const statusId = useId();

  return (
    <div className="talk">
      {usable && (
        <button
          type="button"
          className="talk-button"
          data-listening={snapshot.listening ? "true" : "false"}
          aria-pressed={snapshot.listening}
          aria-describedby={statusId}
          {...talkButtonHandlers(style, onPress, onRelease)}
          // 長押しで出るメニューで、押している状態が切れないように
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="talk-mic" aria-hidden="true" />
          {snapshot.listening ? labels.listening : labels.idle}
        </button>
      )}
      <p id={statusId} className="talk-status small" role="status">
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
