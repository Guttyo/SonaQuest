// 読み上げと押して話すを、React の画面につなぐ。画面を離れたら（中断の画面を含む）必ず止める（ADR-0011、ADR-0033）。

import { useEffect, useRef, useState } from "react";
import { duckBgm } from "../bgm/browser";
import { createBrowserSpeaker, registerVoiceStopper } from "./browser";
import type { Speaker, SpeakerSnapshot } from "./speaker";
import { PushToTalk, browserRecognitionFactory, type MicStatus, type TalkSnapshot } from "./talk";

const SPEAKER_IDLE: SpeakerSnapshot = { engine: "elevenlabs", loading: false, speaking: false, blocked: false };

/**
 * 読み上げ。enabled のときだけ作る。回（session）が変わったら作り直し、ElevenLabs をまた試す
 * （失敗したら、その回の残りではブラウザの読み上げ。speaker.ts）
 */
export function useSpeaker(enabled: boolean, session: number): { speaker: Speaker | null; snapshot: SpeakerSnapshot } {
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [snapshot, setSnapshot] = useState<SpeakerSnapshot>(SPEAKER_IDLE);
  useEffect(() => {
    if (!enabled) return;
    const created = createBrowserSpeaker(setSnapshot);
    setSpeaker(created);
    setSnapshot(created.snapshot);
    const unregister = registerVoiceStopper(() => created.stop());
    return () => {
      unregister();
      created.dispose();
      setSpeaker(null);
      setSnapshot(SPEAKER_IDLE);
    };
  }, [enabled, session]);
  // 読み上げの間（音声を取りに行っている間を含む）は BGM を小さくし、終わったら戻す（B-03、ADR-0039）
  const voiceActive = snapshot.speaking || snapshot.loading;
  useEffect(() => {
    duckBgm("speech", voiceActive);
    return () => duckBgm("speech", false);
  }, [voiceActive]);
  return { speaker, snapshot };
}

/** text が変わるたびに読み上げる。null なら止める。key は同じ発言を読み直さないための目印 */
export function useSpeakWhenChanged(speaker: Speaker | null, text: string | null, key: string | null): void {
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    if (speaker === null) return;
    const current = textRef.current;
    if (key === null || current === null) speaker.stop();
    else speaker.speak(current);
  }, [speaker, key]);
}

const TALK_UNSUPPORTED: TalkSnapshot = { mic: "unsupported", listening: false, interim: "", notice: null };

/**
 * 押して話す。enabled のときだけ作る。onText は確定した文（入力欄に足す）、beforeListen は読み上げを止める。
 * speaking のあいだはマイクを閉じる（読み上げが始まったら、開いていたマイクも止める）。
 * lostMic は、その回のうちにマイクが使えないと分かった状態。onMicLost で知らせ、次の質問でもその状態から始める
 */
export function usePushToTalk(
  enabled: boolean,
  speaking: boolean,
  onText: (text: string) => void,
  beforeListen: () => void,
  lostMic: MicStatus | null,
  onMicLost: (mic: MicStatus) => void,
): { talk: PushToTalk | null; snapshot: TalkSnapshot } {
  const lostRef = useRef(lostMic);
  lostRef.current = lostMic;
  const onLostRef = useRef(onMicLost);
  onLostRef.current = onMicLost;
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const beforeRef = useRef(beforeListen);
  beforeRef.current = beforeListen;
  const [talk, setTalk] = useState<PushToTalk | null>(null);
  // 最初の表示から、使えるかどうかを正しく出す（effect の前に「使えません」を一瞬出さない）
  const [snapshot, setSnapshot] = useState<TalkSnapshot>(() =>
    enabled && browserRecognitionFactory() !== null ? { ...TALK_UNSUPPORTED, mic: lostMic ?? "ready" } : TALK_UNSUPPORTED,
  );
  useEffect(() => {
    if (!enabled) return;
    const created = new PushToTalk({
      create: browserRecognitionFactory(),
      mic: lostRef.current ?? undefined,
      onText: (text) => onTextRef.current(text),
      beforeListen: () => beforeRef.current(),
      onChange: (next) => {
        setSnapshot(next);
        if (next.mic !== "ready") onLostRef.current(next.mic);
      },
    });
    setTalk(created);
    setSnapshot(created.snapshot);
    const unregister = registerVoiceStopper(() => created.abort());
    return () => {
      unregister();
      created.dispose();
      setTalk(null);
    };
  }, [enabled]);
  useEffect(() => {
    if (speaking) talk?.abort();
  }, [speaking, talk]);
  return { talk, snapshot };
}
