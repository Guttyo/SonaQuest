// 提出動画の Composition：1920×1080・30fps・180秒（5400フレーム）。Issue #28、ADR-0051。
// BoardMapVideo：ボードの「拠点と経路の図」の約30秒の紹介動画（Issue #167 の内容。src/boardMap/）。
import type { FC } from "react";
import { Composition } from "remotion";
import { SonaQuestVideo } from "./SonaQuestVideo";
import { BOARD_MAP_TOTAL_FRAMES, BoardMapVideo } from "./boardMap/BoardMapVideo";
import { BOARD_MAP_FPS, BOARD_MAP_HEIGHT, BOARD_MAP_WIDTH } from "./boardMap/style";
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
    </>
  );
};
