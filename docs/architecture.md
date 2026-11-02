# 構成（案）

状態：すべて設計段階。実装はまだない。確定事項は docs/decisions.md を正とする。

```
[iPhone Safari]  React + TypeScript (Vite)
   │  文字 / 音声認識の結果（ADR-0004）
   │  音声合成（ADR-0005）
   ▼ HTTPS
[Cloudflare Workers + Hono]  ← secrets: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY
   ├─ /api/turn    1ターン分の判定と次の手を返す
   ├─ /api/stt-token  （ElevenLabsを使う場合のみ）1回限りのトークン
   └─ 保存なし・本文のログ出力なし（ADR-0007）
   ▼
[Claude API]  [ElevenLabs]（採用した場合）
```

## 状態の持ち方
- 会話の状態はブラウザのメモリにだけ持つ。Workersは毎回、必要な分を受け取って返すだけ（状態を持たない）。
- ブラウザの永続ストレージに保存しない。

## /api/turn の入出力（案）
入力：これまでの回答（最大6件）、出来事を起こしたか、現在のターン番号
出力（Claudeに構造化出力で返させる）：
```json
{
  "emergency": false,
  "viewpoints": {"location": "confirmed|not_confirmed|unknown", "alternative": "...", "current": "...", "unrecorded": "...", "proxy": "..."},
  "next": {"type": "ask|clarify|event|finish", "question_id": "q3", "event_id": "e2"}
}
```
- 画面に出す質問文・聞き返し文・出来事の文は、IDから固定文を引く。自由文を返させるかは未確定（安全検査とセットでADRを書く）。
- 出力が形式どおりでない、時間切れ、失敗のときは固定の進行に切り替える（ADR-0012）。
- `emergency: true` か、語の照合で緊急と判定したら中断画面へ（ADR-0011）。

## 安全の層
1. プロンプト：しないことを明記し、出力を構造化データに限る
2. 出力検査：形式の検証。自由文を許す場合は禁止表現の検査
3. 画面：利用者の回答は原文表示、判定は観点ごとの可否だけ
4. 緊急：Claudeと語の照合の二重
