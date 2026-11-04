import { SPEAKER_ENGINE_NOTES, SPEAKER_LABELS } from "./messages";
import type { SpeakerSnapshot } from "./speaker";
import "./voice.css";

/** 読み上げの操作（止める・もう一度聞く）。自動再生が止められたときは「読み上げを聞く」で始める */
export function SpeakerControls({
  snapshot,
  onStop,
  onReplay,
}: {
  snapshot: SpeakerSnapshot;
  onStop: () => void;
  onReplay: () => void;
}) {
  const active = snapshot.loading || snapshot.speaking;
  const note = SPEAKER_ENGINE_NOTES[snapshot.engine];
  return (
    <div className="speaker-controls">
      {snapshot.engine !== "none" && (
        <button
          type="button"
          className={snapshot.blocked ? "speaker-button speaker-button-blocked" : "speaker-button"}
          onClick={active ? onStop : onReplay}
        >
          {active ? SPEAKER_LABELS.stop : snapshot.blocked ? SPEAKER_LABELS.blocked : SPEAKER_LABELS.replay}
        </button>
      )}
      {note !== null && <span className="small speaker-note">{note}</span>}
    </div>
  );
}
