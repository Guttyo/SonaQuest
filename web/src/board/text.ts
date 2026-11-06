// 地域本部の医薬品ボード（試作）の固定文（Issue #97、ADR-0042）。Claude Code の下書き。
// 公的な制度の説明は書かない。薬の正誤・処方の判断に見える言い方をしない。

// [TODO-OWNER: ボードの画面の文言（Claude Code の下書き。題・説明・各欄の見出し・注意書き）]
// → オーナー決定（2026-11-05、チャット）：はじめにのボタンは「地域本部の医薬品ボードを見る（試作）」。在庫の状態は「在庫切れ」「未確認」「見込み算出不可」と文字で示し、色は補助に使う。見出しの直下は「架空データ」と集計時点を短く表示する（ほかの文言は下書きのまま、判断待ち）。
// → オーナー決定（2026-11-06、チャット）：画面の「試作」を「架空データ」に変える。はじめにのボタンは「地域本部の医薬品ボードを見る（架空データ）」。
/** 画面の題（Issue #107。オーナー「題名は SonaQuest を使い、医薬品ボードはやめる。（試作）は表示しない」） */
export const BOARD_TITLE = "SonaQuest";
export const BOARD_MOCK_BADGE = "すべてのデータは架空です";

/** 画面の副題と、左のペイン・上部タブ（Issue #107） */
// [TODO-OWNER: ボードの副題・左のペイン・上部タブ・救護所の詳細の文言（Claude Code の下書き。副題「各救護所の状況」）]
// → オーナー決定（2026-11-06、チャット）：上の帯に「架空の巨大地震災害」を入れ、副題「各救護所の状況」を外す（「架空の災害名としては遊び心を入れるところではないと思うので、「架空の巨大地震災害」とでもしておく。」）。
/** 上の帯に出す架空の災害名（Issue #143。2026-11-06 オーナー決定。副題「各救護所の状況」の代わり） */
export const BOARD_DISASTER_NAME = "架空の巨大地震災害";

/** 本部の在庫の表の凡例（Issue #143。2026-11-06 オーナー決定で「3日未満」の赤を黄にし、赤は「切れ」だけにした） */
// [TODO-OWNER: 在庫の表の凡例の文言（Claude Code の下書き。「切れ」「N日未満」「N日以上」「未確認・算出不可」）]
export const BOARD_HEAT_LEGEND = {
  out: "切れ",
  short: (days: number) => `${days}日未満`,
  enough: (days: number) => `${days}日以上`,
  none: "未確認・算出不可",
} as const;
export const BOARD_LAYOUT = {
  paneLabel: "拠点",
  /** 狭い幅（スマホ）で、左のペインの代わりに出す選択式（Issue #113） */
  paneSelect: "表示する拠点",
  hq: "本部（HQ）",
  hqSub: "本部備蓄・全体",
  tabsLabel: "表示の切り替え",
  hqSideLabel: "本部の数字",
  tabs: {
    overview: "全体",
    stock: "在庫",
    supply: "発注・搬送",
    records: "記録（カルテ）",
    demo: "デモ",
    chat: "連絡",
  },
  siteTabs: {
    overview: "詳細",
  },
  /**
   * 左のペインの印（Issue #113）。並びは固定のルール（在庫切れ → 未交付 → 記録の未着・転記待ち → 人員）で、
   * 先頭の1つ（いちばん大事な状態）だけを出し、残りは「ほか N 件」にまとめる（Issue #159 第2段。もとは2つ）。薬剤師の不足は職種を残し、ほかの印と同じ目立たせ方にする（2026-11-05 オーナー決定）
   */
  marks: {
    outOfStock: "在庫切れ",
    pharmacistsShort: (n: number) => `薬剤師 ${n}人不足`,
    undelivered: "未交付あり",
    pending: (n: number) => `記録の未着・転記待ち ${n}件`,
    proposals: "承認待ちの提案",
    more: (n: number) => `ほか ${n} 件`,
    max: 1,
  },
  detail: {
    title: "の詳細",
    shortage: "不足・確認が必要な薬",
    shortageNote: "並び順は業務のルール（在庫切れ → 未確認 → 在庫切れの見込みが近い順 → 算出不可）。臨床の緊急度は表さない。行を開くと入荷・融通と必要な数。",
    stats: "今日の様子",
    patients: "本日の延べ患者数",
    chronic: "うち処方のあった人",
    evacuees: "避難者数（見込み）",
    contact: "連絡先・受け取り",
    route: "本部からの経路",
    comms: "記録と通信",
    charts: "この救護所のカルテ",
    district: "地区",
    /** 情報の鮮度を3つに分けて出す（Issue #113） */
    times: "報告の時刻",
    stockChecked: "在庫を確認",
    recordArrived: "記録が本部に届いた",
    routeChecked: "経路を確認",
  },
  mapHint: "図の拠点を押すと、その拠点の詳細に切り替わる。",
  hqRecords: "救護所ごとのカルテの件数",
  openSite: "を開く",
  siteStockNote: "この救護所の在庫。本部の在庫は右の列に並べた。",
} as const;

/**
 * 発注の提案と承認（Issue #107）。数量は在庫と未交付の算数だけで出す。薬の中身・代わりの薬・量の妥当性は判断しない。
 * 承認・却下は人（本部の担当者）が押す。保存も送信もしない
 */
// [TODO-OWNER: 発注の提案と承認の文言（Claude Code の下書き。題・算数の説明・状態の名前・ボタン）]
export const BOARD_ORDERS = {
  title: "発注の提案",
  note: "未交付や、目安の日数より早く切れる見込みの品目について、在庫の算数で必要な数量を出した提案。数量は「未交付・必要な数 ＋ 目安の日数分の出庫 − 現地の在庫 − 向かっている搬送・入荷」。錠の品目は 10錠＝1シート単位に切り上げ、100錠＝1箱として示す（デモの発注単位）。救護所ごとにまとめ、開くと1件ずつ承認・却下できる。未交付・必要な数が無いときは、1日の出庫分以上足りないときだけ出す。本部備蓄から出せる分と卸への発注分に分ける。アプリは薬の中身・代わりの薬・量の妥当性を判断しない。承認・却下は本部の担当者が押す。",
  empty: "提案はない",
  pending: "提案中",
  approved: "承認済み",
  /** 一覧では数量・調達先・状態だけを見せ、根拠の算数は開いて読む（Issue #113） */
  basisToggle: "数量の算出根拠",
  approve: "承認",
  reject: "却下",
  approveOnlyHq: "承認・却下は、本部（HQ）でログインした担当者が本部の画面で行う。",
  fromHq: "本部備蓄から",
  fromVendor: "卸への発注分",
  basisNeed: "未交付・必要な数",
  basisCover: "目安の日数分の出庫",
  basisCoverUnknown: "出庫のペース不明（0 として計算）",
  basisOnHand: "現地の在庫",
  basisIncoming: "向かっている搬送・入荷",
  newMark: "新",
  updatedMark: "更新（未交付が増えた）",
  stageNote: "承認すると本部の在庫を引き当て（引当済み）、出発で搬送中、到着で受領になり、現地の在庫に足される。卸への発注分は、承認の後は「卸への照会分」として「卸に照会中・到着未定」で、人の手配が要るので時計では動かない。",
  goSupply: "本部の発注の提案を見る",
  count: "件",
  /** 救護所ごとにまとめた欄の見出し（Issue #167） */
  groupPending: "提案中",
  groupApproved: "承認済み",
  groupNew: "新",
  roundedUp: "10錠（1シート）単位に切り上げて",
} as const;

/**
 * 発注の数量の示し方（Issue #167。2026-11-06 オーナー決定（チャット）：10錠＝1シート、100錠＝1箱。少なければシート、多ければ箱）。
 * 例：230錠 →「2箱＋3シート（230錠）」、30錠 →「3シート（30錠）」、200錠 →「2箱（200錠）」。錠以外は「12本」のまま
 */
export function orderQtyText(qty: number, unit: string): string {
  const n = new Intl.NumberFormat("ja-JP");
  if (unit !== "錠" || qty <= 0 || qty % 10 !== 0) return `${n.format(qty)}${unit}`;
  const boxes = Math.floor(qty / 100);
  const sheets = (qty % 100) / 10;
  const parts = [boxes > 0 ? `${n.format(boxes)}箱` : "", sheets > 0 ? `${sheets}シート` : ""].filter(Boolean);
  return `${parts.join("＋")}（${n.format(qty)}錠）`;
}

/**
 * 「直近1時間で変わったこと」の1行と、記録の新しさ（Issue #107。2026-11-06 オーナー決定で「前回から」をやめた）。
 * デモの記録の件数を足してルールで組み立てる固定文。Claude も文の生成も使わない。氏名・品目名・数量は入れない
 */
// [TODO-OWNER: 「前回から変わったこと」の1行と、最終報告の相対時間の文言（Claude Code の下書き。ひな形・空のときの文・出来事の名前・「最終報告 N 時間前」）]
// → オーナー決定（2026-11-06、チャット）：「前回から変わったこと」は「直近1時間で変わったこと」にする（デモの時計で直前1時間の出来事だけを数え、常に出す。無いときは「ありません」）。
export const BOARD_CHANGES = {
  label: "直近1時間で変わったこと",
  /** 数える幅（分）。デモの時計の直前1時間 */
  windowMinutes: 60,
  none: "ありません",
  /** 並べる順と名前。未交付は「+N 件」、ほかは「N 件」 */
  kinds: [
    { kind: "登録", name: "登録" },
    { kind: "到着", name: "到着" },
    { kind: "未交付", name: "未交付" },
    { kind: "提案", name: "提案" },
    { kind: "承認", name: "承認" },
    { kind: "受領", name: "受領" },
    { kind: "在庫切れ", name: "在庫切れ" },
  ],
  sep: "、",
  lastReport: "最終報告",
  lastReportNote: "「最終報告」は、在庫の確認か記録が本部に届いた、新しいほうの時刻。デモの時計から数える。",
  /**
   * 最終報告が古い救護所に付ける注意（Issue #113、2026-11-05 オーナーのレビュー）。このデモで仮に置いた時間で、
   * 業務の表示のルール。臨床の緊急度や、その救護所の状況の良し悪しは表さない
   */
  staleHours: 12,
  stale: (hours: number) => `${hours}時間以上 報告なし`,
  staleNote: (hours: number) => `「${hours}時間以上 報告なし」は、このデモで仮に置いた時間を過ぎたという表示。状況の良し悪しは表さない。`,
  ago: (minutes: number) =>
    minutes < 1 ? "いま" : minutes < 60 ? `${minutes} 分前` : minutes < 48 * 60 ? `${Math.floor(minutes / 60)} 時間前` : `${Math.floor(minutes / 1440)} 日前`,
} as const;
/** 本部の全体の左上に大きく出す数（Issue #107）。救護所ごとの不足の有無を数えるだけ */
// [TODO-OWNER: 本部の全体で一番大きく出す数の題と説明（Claude Code の下書き。「不足が出ている救護所」）]
// → オーナー決定（2026-11-06、チャット）：次の案に「いいね、それで行こう。」。見出しを「救護所の不足状況」にし、数を内訳に分けて「在庫 N か所・薬剤師 N か所」と出す。「在庫」は在庫切れか切れる見込みのある救護所の数（在庫切れがあれば赤、見込みだけなら黄、0 は灰）、「薬剤師」は薬剤師が足りない救護所の数（色なし）。1024 幅で入らないときの短い見出しは「不足状況」。
export const BOARD_LEAD_TILE = {
  label: "救護所の不足状況",
  /** 1024 幅で入らないときの短い見出し（2026-11-06 オーナー決定） */
  short: "不足状況",
  stock: (n: number) => `在庫 ${n} か所`,
  pharmacists: (n: number) => `薬剤師 ${n} か所`,
  sep: "・",
} as const;

/** 本部の数字の列の、1024 幅で入らないときの短い見出し（Issue #143。2026-11-06 オーナー決定「いいね、それで行こう。」） */
export const BOARD_TILE_SHORT = {
  critical: "在庫切れ・見込み",
  proposals: "承認待ち",
  pending: "未着・転記待ち",
  stale: "報告が古い",
} as const;

/** 上の帯の短い言い方（Issue #143。2026-11-06 オーナー決定「いいね、それで行こう。」）。読み上げには全文を残す */
export const BOARD_BAND = {
  who: (site: string, staff: string) => `${site}・${staff}`,
  asOf: "集計",
  accessLog: "アクセス記録",
  back: "はじめにへ",
} as const;
/**
 * 本部の全体の上段に横一列で並べる指標（Issue #113。オーナー決定 2026-11-05「上段の横並びに戻す」）。
 * 数字の単位（件・か所・人）と、何を数えたかを札の中で読めるようにする
 */
export const BOARD_TILES = {
  critical: "在庫切れ・不足見込み",
  criticalUnit: "件（拠点×品目）",
  criticalSum: (critical: number, unconfirmed: number, noPace: number, total: number) =>
    `${critical}件 ＋ 未確認 ${unconfirmed}件 ＋ 算出不可 ${noPace}件 ＝ 確認・手配が必要な事項 ${total}件`,
  proposals: "承認待ちの発注提案",
  proposalsUnit: "件",
  proposalsSub: (approved: number) => `承認済み ${approved}件`,
  pending: "記録の未着・転記待ち",
  pendingUnit: "件",
  pendingSub: (undelivered: number, awaiting: number) =>
    `未着 ${undelivered}・転記待ち ${awaiting}。問診の記録の件数（人数ではない。最後に届いた後の分）`,
  stale: (hours: number) => `${hours}時間以上 報告がない救護所`,
  staleUnit: "か所",
  staleNone: "なし",
  activity: "今日の活動",
  activityLine: (patients: number, chronic: number, evacuees: number) =>
    `本日の延べ患者数（4か所）${patients}人、うち処方のあった人 ${chronic}人。避難者数（見込み）${evacuees}人`,
} as const;
export const BOARD_LEAD =
  "救護所4か所の情報を本部に集める、ホワイトボードの代わりになる1枚です。実際の災害で使う形ではなく、訓練と同じ記録の項目で何が見えるかを示すデモです。";
export const BOARD_BACK_LABEL = "はじめにへ戻る";

/** はじめにの画面の、ボードへ入るボタン */
export const BOARD_ENTRY_LABEL = "地域本部の医薬品ボードを見る（架空データ）";

/** 確認・手配が必要な品目の一覧（Issue #101）。画面の先頭に置く */
export const BOARD_CASES = {
  title: "確認・手配が必要な事項",
  note: "並び順は業務のルール：在庫切れ → 未確認（在庫のデータが届いていない）→ 在庫切れの見込みが近い順 → 算出不可（在庫はあるが1日あたりの出庫量が分からない）。臨床の緊急度は表さない。「在庫切れ」の表示だけで緊急度を表さない。照会中・到着未定の数量は現地の在庫に足していない。",
  /** 本部の全体の表の列（Issue #113） */
  table: { site: "拠点", what: "確認が必要なこと", now: "現在の状況", next: "次の確認" },
  /** 状態の札を短くする（折り返さないように。Issue #113） */
  daysLeft: (days: number) => `あと${days}日`,
  forecastPrefix: "在庫切れ見込み、",
  proposal: "発注の提案",
  /** 提案の状態「提案」は、承認待ちの意味 */
  awaiting: "承認待ち",
  stockCheckedAt: "在庫の確認",
  help: "この画面の見方",
  empty: "確認・手配が必要な品目はありません",
  cols: { status: "状態", where: "救護所・品目", onHand: "現地", hq: "本部", supply: "入荷・融通", next: "次の確認" },
  detail: {
    contact: "連絡先",
    pharmacists: "対応できる薬剤師",
    comms: "通信手段",
    alt: "代わりの手段",
    lastReport: "最後に記録が届いた時刻",
    stockChecked: "在庫を確認した時刻",
    need: "必要な数と時刻（救護所から）",
    siteInbound: "この救護所向けの搬送・融通",
    hqInbound: "本部向けの入荷",
    pickup: "受け取りの窓口",
    route: "本部からの経路",
    none: "なし",
  },
  guide: "「{days}日」はこのデモで仮に置いた目安。判定は丸める前の値で行う。",
} as const;

/** 救護所ごとの一枚（ホワイトボード風の一覧） */
export const BOARD_OVERVIEW = {
  title: "救護所ごとの一枚",
  note: "ホワイトボードに書く一覧の形。人員と薬の不足がひと目で分かるように、足りないものを先に出す。",
  patients: "本日の延べ患者数",
  pharmacists: "薬剤師",
  short: "不足",
  outOfStock: "在庫切れ",
  forecast: "在庫切れ見込み",
  unconfirmed: "未確認",
  noPace: "算出不可",
  route: "経路",
  comms: "通信",
  pending: "本部未反映の記録",
} as const;

/** デモ（Issue #102）：架空の時計と、架空の問診の入力。すべてブラウザのメモリだけで、保存・送信しない */
// [TODO-OWNER: デモの文言（時計・入力の案内・架空の氏名の注意。Claude Code の下書き）]
export const BOARD_DEMO = {
  title: "デモ：時計を進める",
  note: "デモの時刻が進むと、出庫のペースで在庫が減り、到着見込みを過ぎた入荷・搬送が届き、搬送便・連絡員の時刻に紙の記録が本部に届く。この画面の変化はブラウザのメモリにだけあり、タブを閉じると消える。保存も送信もしない。",
  clock: "デモの時刻",
  /** ボードの見出しの直下。集計時点と架空の時刻を1つにまとめる（Issue #113） */
  asOf: "集計時点（デモの時刻）",
  /** 時間を進める操作は消さずに、ふだん閉じた開閉にたたむ（2026-11-05 オーナー決定） */
  controls: "デモ操作",
  start: "自動で進める（2秒で1時間）",
  stop: "止める",
  hour: "1時間進める",
  day: "1日進める",
  reset: "最初に戻す",
  reducedMotion: "動きを減らす設定のため、自動では進めない。ボタンで進める。",
  logTitle: "起きたこと（新しい順）",
  logEmpty: "まだ何も起きていない",
} as const;

export const BOARD_INTAKE_FORM = {
  title: "救護所で問診を入力する（デモ）",
  note: "救護所で聞き取った内容を、訓練と同じ項目で記録に加える。名前は架空のものを使い、実在の人の名前や本当の服薬情報は入れない。入力はブラウザのメモリにだけあり、保存も送信もしない。文は入れたまま出し、要約も言い換えもしない。",
  site: "救護所",
  name: "氏名",
  nameNote: "実在の人の名前は入れない。下書きの名前を変えてもよい",
  items: [
    "薬の名前・量（本人の言葉のまま）",
    "何の薬か・処方元",
    "飲めていない日数・残薬",
    "記録の在りか",
    "アレルギー・副作用の経験",
    "代わりに伝えられる人",
  ],
  prescriptionTitle: "医師の処方（医師が入力する欄。アプリは候補を出さない）",
  prescriptionItem: "薬（仮名）",
  prescriptionNone: "なし（処方しない）",
  prescriptionQty: "数量",
  prescriptionDays: "日数",
  submit: "記録に加える",
  added: "の記録に加えた。在庫と需要に反映した。",
  undelivered: "在庫が足りず、未交付として需要に載せた：",
} as const;

export const BOARD_RECORDS = {
  title: "救護所の記録（カルテ）",
  note: "救護所ごとに、患者1人につき1枚。入力で加えたものは氏名付きで、同じ名前で入力すると記録の履歴が増える。最初からあるものは番号だけ。「医師の処方」は人が入力した値で、アプリは決めない。文はすべて本人の言葉のままで、要約はしない。",
  added: "画面で入力（デモ）",
  prescriptionNone: "未入力",
  undelivered: "未交付",
  visits: "記録の履歴",
  latest: "最新の記録",
  prescriptions: "医師の処方の履歴",
  flagPrescribed: "処方あり",
  flagNone: "処方なし",
  flagUndelivered: "未交付あり",
  count: "件",
  perSite: "の記録",
  empty: "記録はまだない",
  chartLabel: "カルテ",
  open: "この救護所の記録を見る",
} as const;

/**
 * カルテ入力の専用画面と、処方の累計（Issue #114）。入力は在庫管理の画面から切り分けた全画面で行い、閲覧は記録タブのまま。
 * 累計は人が入れた数量を足すだけで、量の妥当性・代わりの薬・薬効は判断しない
 */
// [TODO-OWNER: カルテ入力の専用画面と処方の累計の文言（Claude Code の下書き。ボタン・題・注意書き・表の見出し）]
export const BOARD_INTAKE_MODE = {
  open: "カルテを入力する",
  openFor: "のカルテを入力する",
  openNote: "入力は在庫の画面から切り分けた専用の画面で行う。入れた記録は、この画面のカルテに加わる。",
  title: "カルテの入力",
  back: "記録（カルテ）に戻る",
  count: "この救護所のカルテ",
  totalsTitle: "処方数量の合計",
  totalsNote: "画面で入力したカルテの「医師の処方」の数量を、品目ごとに足しただけ。最初からある記録は数量を持たないので含めない。量の妥当性・代わりの薬・薬効は判断しない。未交付の分は、発注の提案の「未交付・必要な数」に入っている。",
  totalsEmpty: "処方のあるカルテはまだない",
  colItem: "薬（仮名）",
  colPrescribed: "処方の合計",
  colDelivered: "うち渡せた数",
  colUndelivered: "うち未交付",
  colCount: "件数",
  basisFromCharts: "うちカルテの処方の未交付",
} as const;

/** 架空の町の模式図（Issue #105）。外部の地図は使わない */
// [TODO-OWNER: 模式図の文言（題・凡例・状況の欄・最新情報の固定文。Claude Code の下書き）]
export const BOARD_MAP = {
  title: "拠点と経路の図",
  mock: "模式図",
  svgTitle: "町の模式図。本部と救護所4か所、本部からの経路の状態（通行可・迂回・通行止め）、拠点の不足の印",
  svgNote: "町の模式図。実在の地名・道路・施設ではない。外部の地図は使っていない",
  legendOk: "通行可",
  legendDetour: "迂回（点線が迂回の道）",
  legendBlocked: "通行止め",
  legendHq: "本部",
  legendSite: "救護所",
  outOfStock: "在庫切れ",
  /** 職種は残し、在庫切れより目立たせない（2026-11-05 オーナー決定） */
  pharmacistsShort: (n: number) => `薬剤師 ${n}人不足`,
  statusTitle: "本部の周りの状況",
  temp: "気温",
  snow: "積雪",
  rain: "天気",
  evacuees: "避難者数（4か所）",
  routesTitle: "本部からの経路",
  notesTitle: "このエリアの最新情報",
} as const;

/** 救護所ごとの一覧（1タップ目：救護所、2タップ目：品目） */
export const BOARD_GROUPS = {
  note: "救護所ごとにまとめた。救護所の行を開くと確認・手配が必要な品目、品目の行を開くと連絡先・入荷・経路。並びは、在庫切れと不足が多い順。",
  empty: "確認・手配が必要な品目はない",
  items: "品目",
} as const;

/** 下部にまとめる詳細の見出し */
export const BOARD_MORE_LABEL = "詳細を開く";

/**
 * 問診モードの押せない表示（PRD「Coming soon の表示の決まり」。C-01 と同じ扱い）。
 * 完成済み・開発着手済みに見える言葉を使わない
 */
// [TODO-OWNER: 問診モードの Coming soon の文言（Claude Code の下書き）]
export const COMING_SOON_INTAKE =
  "災害時の問診モード（Coming soon）— 将来構想で、提供の時期は決まっていません。訓練と同じ記録の項目で、救護所の問診を記録する構想です";

export const BOARD_SECTIONS = {
  today: "今日の数字",
  shelters: "救護所ごとの状況",
  sheltersNote: "本部に集まる、各救護所の今日の人数・切れそうな薬・記録の届き方。並びは、在庫でまかなえる日数が短い順。",
  heat: "在庫の見込み日数（救護所×薬）",
  heatNote:
    "今の出庫のペースで、あと何日分あるか。本部備蓄は出庫のペースを持たないので日数は出さず、在庫の有無だけを示す。",
  trend: "救護所ごとの患者数の推移（延べ・1日）",
  trendNote: "発災翌日からの日ごとの延べ人数。線の右端が救護所の名前。",
  inbound: "入荷・融通の予定",
  inboundNote: "供給元からの納品、本部備蓄からの搬送、救護所どうしの融通。",
  demand: "需要の見込みと在庫",
  demandNote:
    "避難者数と、普段の薬を続けている人の割合（見込み）から1日に要る量を見積もり、在庫でまかなえる日数にした。点線はこのデモで仮に置いた目安。",
  sync: "記録の届き方（通信の状態）",
  syncNote:
    "現場は紙が優先。通信が戻ったとき、または搬送便・連絡員で紙が本部に届いたときに、ここに反映される。「本部未反映の記録」は、紙が届いていない（未着）ものと、届いたが転記していない（転記待ち）ものの合計。",
  sites: "拠点・連絡先・経路",
  sitesNote:
    "番号は表示だけ。人の名前は持たない。経路は本部から各救護所への道の状態（通行可・迂回・通行止め）で、地図は出さない（地図の表示は将来構想）。",
  intake: "問診の記録",
  intakeNote:
    "救護所で聞き取った内容を、訓練と同じ項目に整えたもの。値は本人の言葉のままで、要約も言い換えもしない。名前は持たず、番号だけ。「医師の処方」は医師が入力する欄で、アプリは決めない。",
  about: "このデモの考え方",
} as const;

export const BOARD_ABOUT: readonly string[] = [
  "現場（救護所）は紙と通信なしを前提にする。本部に届いた紙や写真を、通信のある拠点で記録の形に整えて、このボードに載せる。",
  "載せるのは、患者の延べ人数、薬の在庫と出庫のペース、入荷と融通の予定、記録の届き方だけ。患者個人の情報は持たない。",
  "平時の供給不足の場面でも同じボードを使う。普段使っていない道具は、災害のときには使えない。",
  "患者向けの訓練「お薬の避難訓練」と、聞き取りの項目（薬の名前・量・処方元、飲めていない日数、記録の在りか）をそろえる。",
];

/**
 * 文字起こしのイメージの枠。画像は制作者が別のアプリ（SoapVox。制作者の既存のアプリで、この提出物には含まれない）の
 * 録音中の画面を撮って用意する。画像が届くまでは枠だけを出す。QR での連携は構想で、実装していない
 */
// [TODO-OWNER: 文字起こしのイメージ画像（SoapVox の録音中の画面）の差し込みと、その説明の文言]
export const INTAKE_IMAGE = {
  /** 画像の場所（`web/public/` 以下）。空のうちは枠ごと出さない（Issue #101） */
  src: "",
  caption: "文字起こしのイメージ：別のアプリ（SoapVox。制作者の既存のアプリで、この提出物には含まれません）の録音中の画面",
  qr: "QR コードで、文字起こしの結果をこのボードの記録の項目に渡す（構想。実装していません）",
} as const;

// ===== 動く地図（Issue #128）=====
/** 光る救護所・道筋・搬送便と医療チームの車の文言。光る条件は既存の状態だけで、緊急度や優先順位を言わない */
// [TODO-OWNER: 動く地図の文言（Claude Code の下書き。凡例・道筋の案内・動いているものの説明・「架空・模擬」の書き方）]
export const BOARD_MAP_LIVE = {
  legendGlowBad: "光（赤）：在庫切れがある",
  legendGlowWarn: "光（黄）：在庫切れ見込み・薬剤師の不足・最終報告が古い",
  legendShipment: "便：搬送中の便",
  legendVehicle: "車：医療チームの車（模擬）",
  glowReason: {
    在庫切れ: (n: number) => `在庫切れ ${n}`,
    切れる見込み: (n: number) => `在庫切れ見込み ${n}`,
    薬剤師の不足: (n: number) => `薬剤師 不足 ${n}`,
    最終報告が古い: (h: number) => `最終報告 ${h} 時間前`,
  },
  glowTitle: "要確認の救護所",
  glowNone: "要確認の救護所はない",
  /** 最終報告が古いとみなす時間（仮の値）の注記 */
  staleNote: (h: number) => `「最終報告が古い」は ${h} 時間以上たったもの（デモの仮の目安）。光は状態を知らせるだけで、優先順位は決めない。`,
  routeHint: "拠点にカーソルを置くか焦点を当てる、または「本部からの経路」の行を押すと、本部からの道筋が浮かび上がる。",
  routeLine: (site: string, status: string, via: string, minutes: number | null) =>
    `本部 → ${site}：${status}。${via}${minutes !== null ? `（約${minutes}分）` : ""}`,
  moversTitle: "搬送便・医療チーム（模擬）",
  moversNote: "位置はデモ時計と到着見込みから求めた模擬の位置で、実際の現在地ではない。",
  vehicleName: "医療チームの車（模擬）",
  vehicleMoving: (to: string, eta: string) => `${to}へ移動中。到着見込み ${eta}`,
  vehicleStopped: (at: string, to: string, eta: string) => `${at}で停車中。次の行き先 ${to}（到着見込み ${eta}）`,
  shipment: (mode: string, item: string, qty: number, to: string, eta: string) => `${mode}：${item} ${qty} → ${to}（到着見込み ${eta}）`,
  noShipment: "搬送中の便はない",
  pressHint: "下の一覧の行か、図の「便」「車」を押すと、図の印を太くし、行き先と到着見込みをここに出す。",
} as const;

/**
 * 架空の患者の到着（Issue #122、ADR-0048）。架空の患者 100 人が種（seed）とルールで救護所に到着し、
 * 服薬の品目の在庫を 3 日分ずつ減らす。Claude も API も使わない。けがの重さ・緊急度・処置は判断しない
 */
// [TODO-OWNER: 架空の患者の到着の文言（Claude Code の下書き。題・説明・ボタン・表の見出し・氏名の注意・けがの注意）]
export const BOARD_ARRIVALS = {
  title: "患者の到着（デモ）",
  note: "患者 100 人が、時計が進むと救護所に到着する。到着すると、その人の服薬の品目ごとに 1日の量 × 3日分 を現地の在庫から引き、足りない分は未交付として需要に載せる（災害時は長期の処方ができず、数日分ずつ渡していたという聞き取りをもとにした動き）。到着の順番・救護所・1時間の人数は、パターン番号と乱数で決める。同じパターン番号なら同じ動きになる。",
  nameNote: "氏名は北海道の地名から作った名前で、実在の人とは関係がない。",
  conditionNote: "けが・体調は決まった文をそのまま出すだけで、アプリは重さ・緊急度・処置を判断しない。",
  memoryNote: "状態はブラウザのメモリにだけあり、保存も送信もしない。",
  // 2026-11-06 オーナー（チャット）が「到着を始める」「別の並びで」を不自然と指摘し、下の言い方を選んだ
  start: "患者の受け入れを始める",
  stop: "受け入れを止める",
  allArrived: "100人全員を受け入れた",
  /** 受け入れの操作は上の「デモ操作」にある（Issue #170） */
  controlsNote: "上の「デモ操作」で「自動で進める」を押すと、患者の受け入れも始まる。止める・別のパターンでやり直すのも「デモ操作」から。",
  reseed: "別のパターンでやり直す",
  seed: "パターン番号",
  arrived: "到着の累計",
  withCondition: "うち、けが・体調の記載がある人",
  people: "人",
  bySite: "救護所ごとの到着",
  listTitle: "到着した患者",
  empty: "まだ誰も到着していない。上の「デモ操作」で「自動で進める」を押すと、受け入れが始まる。",
  cols: {
    at: "到着",
    no: "番号",
    name: "氏名",
    sex: "性別",
    age: "年齢",
    condition: "けが・体調",
    meds: "服薬の品目（1日の量 → 3日分）",
  },
  undelivered: "未交付",
} as const;

/**
 * 本部の在庫タブの、国の医薬品供給状況への外部リンク（Issue #143、計画書 4.6）。
 * 2026-11-06 オーナーの指示の文言のまま（言い換えない）。データの取得・取り込みはしない。押したときに利用者のブラウザが開くだけ。
 * 確認済みの出典を、発行元・題・URL・確認日とともに固定で持つ（ADR-0044 と同じ考え）。新しい情報提供サイトへのリンクは足さない
 */
export const BOARD_SUPPLY_LINK = {
  label: "国の医薬品供給状況（厚生労働省）",
  url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryou/kouhatu-iyaku/04_00003.html",
  note: "メーカーの出荷状況です。救護所の在庫ではありません",
  newTab: "（新しいタブで開く）",
  checkedOn: "2026-11-06",
  checkedLabel: "確認日",
} as const;

// ===== 発注・搬送の時間軸（Issue #118、ADR-0043 の追記 13）=====
/** 在庫が持つ見込み・到着の見込み・発注の段階を、救護所×品目の行ごとに並べる。「遅れ」などの判定の文は作らない */
// [TODO-OWNER: 発注・搬送の時間軸の文言（Claude Code の下書き。題・説明・凡例・行の文・段階の短い名前）]
export const BOARD_TIMELINE = {
  title: "時間軸（いまから3日先まで）",
  note: "行は「確認・手配が必要な事項」と同じ並び（業務のルール。臨床の緊急度は表さない）。灰の棒は今の在庫が持つ見込み、◆は到着の見込み。棒の終わりと◆の間が空くときは斜線で示す（時刻の比較だけ）。デモの時計を進めると動く。",
  narrowNote: "幅の狭い画面では、図を出さずに文字だけで並べる。",
  rowsUnit: "行",
  now: "いま",
  legendStock: "灰の棒：在庫が持つ見込み",
  legendArrival: "到着の見込み",
  legendTransit: "線：出発から到着まで",
  legendGap: "斜線：在庫が切れる見込みから到着の見込みまで",
  legendNeed: "縦の短い線：救護所が必要とする時刻",
  legendUndecided: "点線：到着未定",
  empty: "確認・手配が必要な行はない",
  stock: {
    在庫切れ: "在庫切れ（いま）",
    在庫切れ見込み: (at: string) => `在庫切れ見込み ${at}`,
    未確認: "在庫のデータが届いていない（区間なし）",
    見込み算出不可: "1日あたりの出庫量が分からず、見込みを出せない（区間なし）",
  },
  arrival: (kind: string, qty: string, status: string, at: string | null) =>
    at === null ? `${kind} ${qty}（${status}）：到着未定` : `${kind} ${qty}（${status}）：到着見込み ${at}`,
  noArrival: "向かっている搬送・融通はない",
  need: (at: string) => `必要な時刻 ${at}`,
  /** 発注の段階の短い名前（行の頭に文字で出す） */
  stage: {
    提案: "承認待ち",
    "承認済み（引当済み）": "引当済み",
    搬送中: "搬送中",
    受領: "受領",
    卸に照会中: "卸に照会中",
    "一部受領・卸に照会中": "一部受領・卸に照会中",
  },
  stageLabel: "発注",
  noStage: "提案なし",
} as const;
