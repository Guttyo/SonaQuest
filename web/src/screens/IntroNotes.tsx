import {
  AI_CONNECTED,
  INTRO_LEAD,
  INTRO_POINTS,
  PRIVACY_EXTERNAL,
  PRIVACY_OWN,
  PRIVACY_VOICE,
  PROTOTYPE_LEAD,
} from "../flow/content";

/**
 * はじめる前に必ず見せる説明（A-08、privacy.md「知らせたうえで」）。送信先、架空の内容で答えること、保持方針。
 * 文はマーカー付きで変えない。2画面目「はじめる前に」に全文を出す（2026-11-05 オーナー決定、ADR-0036）。
 * `<details>` に入れず、開く操作なしで全文を出す。
 * voiceProminent：3D を選んだときは、声の送信先（PRIVACY_VOICE）を先頭の目立つ位置に出す（ADR-0033）
 */
export function IntroNotes({ voiceProminent }: { voiceProminent: boolean }) {
  return (
    <div className="intro-notes">
      {voiceProminent && (
        <p className="notice" id="privacy-voice">
          {PRIVACY_VOICE}
        </p>
      )}
      {/* 送信の説明は実際の動作に合わせて一方だけを出す */}
      {AI_CONNECTED ? (
        <p>{INTRO_LEAD}</p>
      ) : (
        <p className="notice" role="note">
          {PROTOTYPE_LEAD}
        </p>
      )}
      <ul className="points">
        {INTRO_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <h2>会話の扱い</h2>
      <ul className="points">
        <li>{PRIVACY_OWN}</li>
        <li>{PRIVACY_EXTERNAL}</li>
        {/* 2D のときも、3D の声の送信先の説明は全文を出す（ADR-0033） */}
        {!voiceProminent && <li id="privacy-voice">{PRIVACY_VOICE}</li>}
      </ul>
    </div>
  );
}
