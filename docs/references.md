# 出典一覧

アプリの固定文で公的制度や備えに触れるときは、ここにある確認済みの出典だけを使う。
「確認」が「未確認」のものは、本文を読み、該当ページと記載内容を確かめてから使う。

## 公的資料（候補）
| 内容 | 発行元 | URL | 確認 |
|---|---|---|---|
| 避難所の運営に関する指針・取組 | 内閣府（防災担当） | https://www.bousai.go.jp/taisaku/hinanjo/ | 未確認（該当ページを特定する） |
| お薬手帳・薬剤情報に関する情報 | 厚生労働省 | https://www.mhlw.go.jp/ | 未確認（該当ページを特定する） |
| マイナポータルでの薬剤情報の閲覧 | デジタル庁（マイナポータル） | https://myna.go.jp/ | 未確認（該当ページを特定する） |
| 災害時のお薬手帳の活用 | 日本薬剤師会 | https://www.nichiyaku.or.jp/ | 未確認（該当ページを特定する） |

- → オーナー（2026-11-02、チャット）：公的機関の一次資料を優先し、URLと参照日を記録する。具体的な選定は、使う段階で決める。

## 確認済み（緊急時・自傷の案内で使う。ADR-0011）
| 内容 | 発行元 | URL | 参照日 |
|---|---|---|---|
| 救急安心センター事業（♯7119）。実施地域と利用時間の一覧（全国42地域。時間は地域ごとに異なる） | 総務省消防庁 | https://www.fdma.go.jp/mission/enrichment/appropriate/appropriate007.html | 2026-11-02（ページ移転の告知あり。使う前に再確認） |
| まもろうよ こころ。電話・SNSの相談窓口の一覧 | 厚生労働省 | https://www.mhlw.go.jp/mamorouyokokoro/ | 2026-11-02 |

- 災害時のお薬手帳について、厚生労働省の一次資料は 2026-11-02 時点で見つかっていない（「災害・危機管理」のページに記載なし）。

## 技術（ADR-0004〜0008の根拠。2026-11-02に閲覧）
- ElevenLabs 料金（API）：https://elevenlabs.io/pricing/api
- ElevenLabs モデル一覧：https://elevenlabs.io/docs/overview/models
- ElevenLabs リアルタイム文字起こしのクライアント接続：https://elevenlabs.io/docs/developers/guides/cookbooks/speech-to-text/realtime/client-side-streaming
- ElevenLabs Zero Retention Mode：https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
- ElevenLabs プライバシーポリシー：https://elevenlabs.io/privacy-policy
- Web Speech API 対応状況（caniuse）：https://caniuse.com/speech-recognition
- MDN SpeechRecognition：https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- WebKit bug 250665（iOSの日本語音声）：https://bugs.webkit.org/show_bug.cgi?id=250665
- Anthropic データ保持期間：https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Claude API とデータ保持：https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Cloudflare Workers Logs：https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Cloudflare リアルタイムログ（wrangler tail）：https://developers.cloudflare.com/workers/observability/logs/real-time-logs/
- Claude Code メモリ：https://code.claude.com/docs/en/memory
