// 提出動画の Composition：1920×1080・30fps・180秒（5400フレーム）。Issue #28、ADR-0051。
// BoardMapVideo：ボードの「拠点と経路の図」の約30秒の紹介動画（Issue #167 の内容。src/boardMap/）。
// PatientTableVideo：架空の患者100人の表が飛んでくる5秒の部品（Issue #261。src/patientTable/）。本編への組み込みは #262。
import type { FC } from "react";
import { Composition } from "remotion";
import { SonaQuestVideo } from "./SonaQuestVideo";
import { BOARD_MAP_TOTAL_FRAMES, BoardMapVideo } from "./boardMap/BoardMapVideo";
import { BOARD_MAP_FPS, BOARD_MAP_HEIGHT, BOARD_MAP_WIDTH } from "./boardMap/style";
import {
  PATIENT_TABLE_FPS,
  PATIENT_TABLE_HEIGHT,
  PATIENT_TABLE_TOTAL_FRAMES,
  PATIENT_TABLE_WIDTH,
  PatientTableVideo,
} from "./patientTable/PatientTableVideo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./sections";

export const RemotionRoot: FC = () => {
  return (
    <>
      <Composition
        id="SonaQuestVideo"
        component={SonaQuestVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="BoardMapVideo"
        component={BoardMapVideo}
        durationInFrames={BOARD_MAP_TOTAL_FRAMES}
        fps={BOARD_MAP_FPS}
        width={BOARD_MAP_WIDTH}
        height={BOARD_MAP_HEIGHT}
      />
      <Composition
        id="PatientTableVideo"
        component={PatientTableVideo}
        durationInFrames={PATIENT_TABLE_TOTAL_FRAMES}
        fps={PATIENT_TABLE_FPS}
        width={PATIENT_TABLE_WIDTH}
        height={PATIENT_TABLE_HEIGHT}
      />
    </>
  );
};
