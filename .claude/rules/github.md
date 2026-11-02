# GitHub運用のルール

## 流れ
1. 作業を始める前にGitHub Issueを作る（目的・変更範囲・完了条件を書く）。
2. `main` から、Issueに対応する専用ブランチを作る。
   - 命名：`feat/12-training-flow`、`fix/15-emergency-interruption`、`docs/18-update-readme`
3. 作業が終わったらPull Requestを作り、Issueを関連付ける。PRには変更内容、確認した試験、残るリスクを書く。
4. 必要なチェックが成功し、**オーナーがチャットで明示的に承認してから** `main` へマージする。Claude Codeは承認なしにマージしない。
5. 緊急の修正も、原則として同じ流れ（Issue → Branch → PR → Merge）で行う。
6. TODO-OWNERマーカーの決定と解除も、IssueとPRで管理する。

## main の保護
- **GitHubのRulesetを正とする**。ローカルのhookは誤操作を防ぐ補助（ADR-0014）。
- `main` への直接コミット、直接push、force push、ブランチ削除をしない。
- ローカルでもコミット前フックが `main` へのコミットとマージコミットを止める。Claude Codeのhookは、force push、`main` へのpush（宛先を省いた push を含む）、PRのマージ、`main` の削除、保護設定の変更、`main` 上でのコミット・マージを止める。
- ローカルのフックで防げない経路がある：`main` 上での fast-forward マージ（gitのフックが呼ばれない）や、Claude Codeを通さない操作。Rulesetを設定するまでは、オーナーも `main` で `git merge` を実行せず、`main` の更新は GitHub上のPRのマージと `git pull --ff-only` だけにする。
- GitHub側の保護設定（Rulesets）の基本：PR必須、force push禁止、削除禁止、CI成功必須。単独開発なので、第三者のレビュー承認1件は必須にしない（自分のPRは自分で承認できず、マージできなくなるため）。
- 保護設定の作成・解除・変更はオーナーだけが判断する。Claude Codeは設定案を出すまでにとどめる。

## 承認が要る操作（オーナーの明示的な承認まで行わない）
- リポジトリの作成、push、公開の切り替え
- Issue・PRの作成など、GitHubへの書き込み全般
- PRのマージ、GitHubの設定変更

GitHub操作を自動化する場合も、この手順を省略しない。

## Dropbox上のリポジトリ（ADR-0018）
- リポジトリはDropboxで同期されており、`.git` もWindowsとmacOSの間で同期される。
- WindowsとmacOSで同時にGit操作をしない。端末を切り替える前にDropboxの同期完了を確かめる。
- GitHubにリモートを作った後はGitHubを正本とし、各端末ではGitHubからcloneした作業コピーへ移る（時期と置き場所はオーナーが決める）。

## hookの位置づけ
hookとコミット前フックは誤操作を防ぐ補助であり、セキュリティの境界ではない。hookを通らない操作（エディタでの直接編集、別のターミナル）もありうる。`SONAQUEST_OWNER_APPROVED=1` は本人確認ではなく、オーナーが自分で操作するための解除の目印にすぎない。オーナーの承認はチャットで明示され、PRに判断の記録が残ることで成立する。
