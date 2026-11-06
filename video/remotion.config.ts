// Remotion の設定（Issue #28、ADR-0051）。書き出しの形だけを決める。
// 大きさ・fps・長さは src/Root.tsx の Composition で決める。
import { Config } from "@remotion/cli/config";

// 静止画の書き出しの形式（Studio の中の一時的な絵）。動画は H.264 の mp4。
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
// 書き出しのたびに古い出力を上書きする（video/out/ は Git の対象外）
Config.setOverwriteOutput(true);
