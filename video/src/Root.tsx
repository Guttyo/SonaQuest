// 提出動画の Composition：1920×1080・30fps・180秒（5400フレーム）。Issue #28、ADR-0050。
import type { FC } from "react";
import { Composition } from "remotion";
import { SonaQuestVideo } from "./SonaQuestVideo";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./sections";

export const RemotionRoot: FC = () => {
  return (
    <Composition
      id="SonaQuestVideo"
      component={SonaQuestVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
