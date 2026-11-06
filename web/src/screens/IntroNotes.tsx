import {
  AI_CONNECTED,
  INTRO_ANSWER_GROUPS,
  INTRO_ANSWER_TITLE,
  INTRO_FLOW_STEPS,
  INTRO_FLOW_TITLE,
  INTRO_LEAD,
  INTRO_POINT_TAGS,
  INTRO_POINTS,
  INTRO_POINTS_TITLE,
  PRIVACY_EXTERNAL,
  PRIVACY_HEADS,
  PRIVACY_OWN,
  PRIVACY_TITLE,
  PRIVACY_VOICE,
  PROTOTYPE_LEAD,
  type IntroAnswerGroup,
  type IntroFlowStep,
} from "../flow/content";

/**
 * はじめる前に必ず見せる説明（A-08、privacy.md「知らせたうえで」）。送信先、架空の内容で答えること、保持方針。
 * 文はマーカー付きで変えない。2画面目「はじめる前に」に全文を出す（2026-11-05 オーナー決定、ADR-0036）。
 * `<details>` に入れず、開く操作なしで全文を出す（Issue #212 でも、2026-11-07 オーナー回答「畳まず図で整理」）。
 * Issue #212：上に訓練の流れの図と答え方の3つの札を置き、各項目にアイコンと短い札・要点の1行を添えて、目で追いやすくする。
 * 図は文字の部品（リスト）で作り、絵は飾り（aria-hidden）なので、読み上げでもすべての文に届く。
 * voiceProminent：3D を選んだときは、声の送信先（PRIVACY_VOICE）を先頭の目立つ位置に出す（ADR-0033）
 */
export function IntroNotes({ voiceProminent }: { voiceProminent: boolean }) {
  return (
    <div className="intro-notes">
      {voiceProminent && (
        <div className="notice privacy-voice-notice" id="privacy-voice">
          <p className="privacy-head">
            <NotesIcon id="voice" />
            <span>{PRIVACY_HEADS.voice}</span>
          </p>
          <p>{PRIVACY_VOICE}</p>
        </div>
      )}

      <section className="intro-visual" aria-labelledby="intro-flow-title">
        <h2 id="intro-flow-title">{INTRO_FLOW_TITLE}</h2>
        <ol className="intro-flow">
          {INTRO_FLOW_STEPS.map((step) => (
            <li key={step.id} className="intro-flow-step">
              <NotesIcon id={step.id} />
              <span className="intro-flow-text">
                <span className="intro-flow-label">{step.label}</span>
                <span className="intro-flow-note">{step.note}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="intro-visual" aria-labelledby="intro-answer-title">
        <h2 id="intro-answer-title">{INTRO_ANSWER_TITLE}</h2>
        <div className="intro-answer-groups">
          {INTRO_ANSWER_GROUPS.map((group) => (
            <div key={group.id} className={`intro-answer intro-answer-${group.id}`}>
              <h3 className="intro-answer-label">
                <NotesIcon id={group.id} />
                <span>{group.label}</span>
              </h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {group.note && <p className="intro-answer-note">{group.note}</p>}
            </div>
          ))}
        </div>
      </section>

      <h2>{INTRO_POINTS_TITLE}</h2>
      {/* 送信の説明は実際の動作に合わせて一方だけを出す */}
      {AI_CONNECTED ? (
        <p>{INTRO_LEAD}</p>
      ) : (
        <p className="notice" role="note">
          {PROTOTYPE_LEAD}
        </p>
      )}
      <ul className="tagged-points">
        {INTRO_POINTS.map((point, index) => (
          <li key={point}>
            {INTRO_POINT_TAGS[index] && <span className="point-tag">{INTRO_POINT_TAGS[index]}</span>}
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <h2>{PRIVACY_TITLE}</h2>
      <ul className="privacy-items">
        <li className="privacy-item">
          <p className="privacy-head">
            <NotesIcon id="app" />
            <span>{PRIVACY_HEADS.own}</span>
          </p>
          <p>{PRIVACY_OWN}</p>
        </li>
        <li className="privacy-item">
          <p className="privacy-head">
            <NotesIcon id="send" />
            <span>{PRIVACY_HEADS.external}</span>
          </p>
          <p>{PRIVACY_EXTERNAL}</p>
        </li>
        {/* 2D のときも、3D の声の送信先の説明は全文を出す（ADR-0033） */}
        {!voiceProminent && (
          <li className="privacy-item" id="privacy-voice">
            <p className="privacy-head">
              <NotesIcon id="voice" />
              <span>{PRIVACY_HEADS.voice}</span>
            </p>
            <p>{PRIVACY_VOICE}</p>
          </li>
        )}
      </ul>
    </div>
  );
}

type NotesIconId = IntroFlowStep["id"] | IntroAnswerGroup["id"] | "app" | "send" | "voice";

/** 「はじめる前に」の絵（Issue #212。期間中に描いた SVG）。飾りで、意味は隣の文字で示す */
function NotesIcon({ id }: { id: NotesIconId }) {
  return (
    <svg
      className={`notes-icon notes-icon-${id}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {id === "arrive" && (
        <>
          {/* 救護所のテント */}
          <path d="M4 26 16 6l12 20z" />
          <path d="M16 26v-8M12 26l4-8 4 8" />
        </>
      )}
      {id === "tell" && (
        <>
          {/* 話す吹き出し */}
          <path d="M5 8a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-9l-6 5v-5H8a3 3 0 0 1-3-3z" />
          <path d="M11 12h10M11 16h6" />
        </>
      )}
      {id === "event" && (
        <>
          {/* 注意の三角 */}
          <path d="M16 4 29 27H3z" />
          <path d="M16 12v7" />
          <circle cx="16" cy="23" r="1.2" fill="currentColor" stroke="none" />
        </>
      )}
      {id === "recover" && (
        <>
          {/* 回り道の矢印 */}
          <path d="M6 22a10 10 0 1 1 4 4" />
          <path d="M5 16v7h7" />
        </>
      )}
      {id === "review" && (
        <>
          {/* 確かめの印の付いた紙 */}
          <rect x="7" y="4" width="18" height="24" rx="3" />
          <path d="m11 16 4 4 7-8" />
        </>
      )}
      {id === "never" && (
        <>
          {/* 入れない：丸に斜線 */}
          <circle cx="16" cy="16" r="12" />
          <path d="m7.5 7.5 17 17" />
        </>
      )}
      {id === "fictional" && (
        <>
          {/* 架空：薬のカプセル */}
          <rect x="4" y="11" width="24" height="10" rx="5" transform="rotate(-35 16 16)" />
          <path d="m12.6 11.2 6.8 9.6" />
        </>
      )}
      {id === "own" && (
        <>
          {/* 自分のこと：人 */}
          <circle cx="16" cy="11" r="5" />
          <path d="M6 28c1-6 5-9 10-9s9 3 10 9" />
        </>
      )}
      {id === "app" && (
        <>
          {/* このアプリ：保存しない（保存の印に斜線） */}
          <rect x="6" y="6" width="20" height="20" rx="3" />
          <path d="M11 6v6h10V6" />
          <path d="m5 27 22-22" />
        </>
      )}
      {id === "send" && (
        <>
          {/* 送る：紙飛行機 */}
          <path d="M4 15 28 5l-8 22-5-9z" />
          <path d="m15 18 13-13" />
        </>
      )}
      {id === "voice" && (
        <>
          {/* 声：マイク */}
          <rect x="12" y="4" width="8" height="15" rx="4" />
          <path d="M7 15a9 9 0 0 0 18 0M16 24v4" />
        </>
      )}
    </svg>
  );
}
