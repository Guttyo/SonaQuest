import {
  INTRO_LEAD,
  INTRO_POINTS,
  PRIVACY_EXTERNAL,
  PRIVACY_OWN,
  PROTOTYPE_NOTICE,
} from "../flow/content";

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <section className="screen" aria-labelledby="intro-title">
      <p className="tagline">もしもの時、自分の薬のことを伝えられますか？</p>
      <h1 id="intro-title">お薬の避難訓練</h1>
      <p>
        災害で普段の情報源が使えなくなったとき、自分の薬のことをどう伝えるかを、約3分の対話で体験します。
      </p>
      <p className="notice" role="note">
        {PROTOTYPE_NOTICE}
      </p>
      <p>{INTRO_LEAD}</p>
      <ul className="points">
        {INTRO_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <h2>会話の扱い</h2>
      <ul className="points">
        <li>{PRIVACY_OWN}</li>
        <li>{PRIVACY_EXTERNAL}</li>
      </ul>
      <button type="button" className="primary" onClick={onStart}>
        訓練をはじめる
      </button>
    </section>
  );
}
