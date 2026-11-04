---
name: session-handoff
description: 作業の区切りやセッション終了時に、docs/STATUS.md を最新にし docs/KEEP-THINKING.md に日誌を追記する。「今日はここまで」「引き継ぎ」「終わる前に」などで使う。
---

# session-handoff

1. `git status` と `git log --oneline -10` で今回の変更を確かめる。
2. `docs/STATUS.md` を更新する。
   - STATUS.md はPRのマージで初めて main に入る。だから「マージ後の main の状態」として書く。「作業中」「mainには未マージ」と書かない（ADR-0023）
   - マージ済みの作業は Issue・PR の番号で書く。ブランチ名は、まだマージしない作業にだけ使う（ブランチ名が残っていると、セッション開始時の hook が知らせる）
   - 「実装済み」：コードがあり、コミット済みのもの
   - 「動作確認済み」：実際に動かして確かめたもの。確かめた方法と日付を書く
   - 「未着手」：まだ無いもの
   - 文書だけのもの、試していないものを「実装済み」「動作確認済み」に入れない。
   - 日付（「最終更新」、確かめた日）は日本時間（JST）で書く。環境の時計や画面の表示をそのまま写さない。git の時刻は `TZ=Asia/Tokyo git log --date=format-local:%Y-%m-%d --format='%h %ad'`、`gh` の時刻（`createdAt`、`mergedAt` など。UTC で出る）は9時間を足す（`--jq '.mergedAt | fromdateiso8601 + 32400 | strftime("%Y-%m-%d")'`）
3. `docs/KEEP-THINKING.md` の末尾に追記する（既存の節は書き換えない）。
   - うまくいったこと／つまずいたことと直し方／捨てた案と理由／次にやること／オーナーの判断待ち（`[TODO-OWNER]` の場所）
   - 見出しの日付は、手順2と同じ方法で JST にして書く。書くのは日付だけで、時刻は書かない（CLAUDE.md 絶対ルール8：作業の時間帯は生活の様子にあたる）
4. 今回の作業が `docs/dev-logs/README.md` の「いつ書くか」に当てはまれば、`dev-log` Skill で記録を書く。
5. 新しい設計判断があれば `docs/decisions.md` にADRを足したか確かめる。
6. 公開してはいけない情報（勤務先、経歴、作業予定や生活の様子、実在人物）を書いていないか読み返す。
7. 今いるのが作業ブランチ（`main` ではない）ことを確かめてコミットし、PRの文案（変更内容、確認した試験、残るリスク、関連Issue）を示す。push・PR作成・マージはオーナーの承認後（`.claude/rules/github.md`）。
