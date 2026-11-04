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
 * はじめに必ず見せる説明（A-08、privacy.md「知らせたうえで」）。送信先、架空の内容で答えること、保持方針。
 * 文はマーカー付きで変えない。1つの部品にまとめ、置き場所（モード選択と同じ画面か、次の画面か）は
 * オーナーの答えで決める（Issue #51、ADR-0036）。`<details>` に入れず、開く操作なしで全文を出す
 */
export function IntroNotes() {
  return (
    <div className="intro-notes">
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
        {/* 3D の対話モードの声の送信先（ADR-0033）。3D のカードから aria-describedby で参照する */}
        <li id="privacy-voice">{PRIVACY_VOICE}</li>
      </ul>
    </div>
  );
}
