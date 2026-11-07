// 11番「モデルの使い分け」の一枚の中身（Issue #262）。web/worker/ の実装に合わせた。
// モデルの札は、どのファイルのどの定数から来たかを書く。scripts/narration-lib.test.mjs が、
// その定数の値と modelId が同じかを確かめる（実装を変えたらこの表も直す）。
//
// 取り違えないこと（Issue #262 の完了条件）：
// - 在庫・残り日数・発注の提案はコードの計算で、Claude ではない
// - 掲示板の文は掲示板専用の検査（web/worker/boardChatChecks.ts）だけを通り、監査役（Haiku 5.5）を通らない
// - HQ の文字起こしの要約は、コードでの確認だけで、Managed Agents の監査に回らない（web/worker/karte.ts）
// - カルテの要約のモデルは既定の値（KARTE_SUMMARY_MODEL は Workers の vars で替えられる）

export type ChipKind = "claude" | "agent" | "code" | "browser" | "human";

export type ModelRef = {
  /** モデルの ID（web/worker の定数の値と同じ） */
  modelId: string;
  /** 定数のあるファイル（リポジトリの直下から） */
  source: string;
  /** 定数の名前 */
  constant: string;
};

export type Chip = {
  kind: ChipKind;
  /** 札の上の小さな文（「Managed Agents ×5」など）。無ければ出さない */
  over?: string;
  /** 札の主な文。model があるときは model から作るので書かない */
  title?: string;
  model?: ModelRef;
  /** 札の下の小さな文 */
  sub?: string;
};

export type ModelRow = {
  /** 何をするところか */
  role: string;
  /** 左から右へ流れる札 */
  chain: Chip[];
  /** 行の下に添える注意（取り違えやすい点） */
  note?: string;
};

export type ModelColumn = {
  title: string;
  rows: ModelRow[];
};

/** claude-opus-5-5 → Claude Opus 5.5 */
export const modelLabel = (modelId: string): string => {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(modelId);
  if (!m) return modelId;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Claude ${family} ${m[2]}.${m[3]}`;
};

export const chipTitle = (chip: Chip): string => (chip.model ? modelLabel(chip.model.modelId) : (chip.title ?? ""));

export const MODEL_MAP_TITLE = "目的ごとに、モデルを使い分ける";

export const MODEL_COLUMNS: ModelColumn[] = [
  {
    title: "お薬の避難訓練",
    rows: [
      {
        role: "質問の言い回し・受け止め・判定・振り返りの一言",
        chain: [
          { kind: "claude", model: { modelId: "claude-opus-5-5", source: "web/worker/claude.ts", constant: "MODEL" }, sub: "構造化出力" },
          { kind: "code", title: "Workers の検査", sub: "コード" },
        ],
      },
      {
        role: "画面に出す前の監査役",
        chain: [
          { kind: "claude", over: "監査役", model: { modelId: "claude-haiku-5-5", source: "web/worker/audit.ts", constant: "AUDIT_MODEL" } },
          { kind: "code", title: "止めたら固定文", sub: "コード" },
        ],
        note: "利用者の回答は監査役に送らない",
      },
    ],
  },
  {
    title: "本部のボード（架空データ）",
    rows: [
      {
        role: "在庫・残り日数・発注の提案",
        chain: [{ kind: "code", title: "コードの計算", sub: "Claude ではない" }],
      },
      {
        role: "掲示板：本部と救護所A〜Dの5つの役",
        chain: [
          { kind: "agent", over: "Managed Agents ×5", model: { modelId: "claude-opus-5-5", source: "web/worker/boardChatAgents.ts", constant: "BOARD_CHAT_MODEL" } },
          { kind: "code", title: "掲示板専用の検査", sub: "コード" },
        ],
        note: "監査役は通らない",
      },
      {
        role: "カルテ：見本の会話から抽出型の要約",
        chain: [
          { kind: "claude", model: { modelId: "claude-sonnet-5-5", source: "web/worker/karteSummary.ts", constant: "KARTE_SUMMARY_MODEL" } },
          { kind: "code", title: "コードでの確認" },
          { kind: "agent", over: "Managed Agents 監査", model: { modelId: "claude-opus-5-5", source: "web/worker/karteAuditAgent.ts", constant: "KARTE_AUDIT_MODEL" } },
          { kind: "human", title: "人が確かめる" },
        ],
      },
      {
        role: "HQ：聞き取りの文字起こし → 要約",
        chain: [
          { kind: "browser", title: "ブラウザの音声認識" },
          { kind: "claude", model: { modelId: "claude-sonnet-5-5", source: "web/worker/karteSummary.ts", constant: "KARTE_SUMMARY_MODEL" } },
          { kind: "code", title: "コードでの確認" },
        ],
        note: "監査には回さない",
      },
    ],
  },
];

/** 下の帯：開発 */
export const DEVELOPMENT_ROW = {
  title: "開発",
  body: "Claude Code：設計・実装・審査。hook と Skill で決まりを守り、別のセッションに任せる",
} as const;
