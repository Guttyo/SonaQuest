// 地域本部の医薬品ボード（試作）の固定文（Issue #97、ADR-0042）。Claude Code の下書き。
// 公的な制度の説明は書かない。薬の正誤・処方の判断に見える言い方をしない。

// [TODO-OWNER: ボードの画面の文言（Claude Code の下書き。題・説明・各欄の見出し・注意書き）]
// → オーナー決定（2026-11-05、チャット）：はじめにのボタンは「地域本部の医薬品ボードを見る（試作）」。在庫の状態は「在庫切れ」「未確認」「見込み算出不可」と文字で示し、色は補助に使う。見出しの直下は「架空データ」と集計時点を短く表示する（ほかの文言は下書きのまま、判断待ち）。
/** 画面の題（Issue #107。オーナー「題名は SonaQuest を使い、医薬品ボードはやめる。（試作）は表示しない」） */
export const BOARD_TITLE = "SonaQuest";
export const BOARD_MOCK_BADGE = "架空データ";

/** 画面の副題と、左のペイン・上部タブ（Issue #107） */
// [TODO-OWNER: ボードの副題・左のペイン・上部タブ・救護所の詳細の文言（Claude Code の下書き。副題「各救護所の状況」）]
export const BOARD_SUBTITLE = "各救護所の状況";
export const BOARD_LAYOUT = {
  paneLabel: "拠点",
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
  },
  siteTabs: {
    overview: "詳細",
  },
  marks: {
    outOfStock: "在庫切れ",
    pharmacistsShort: "薬剤師 不足",
    undelivered: "未交付あり",
    pending: "記録の形になっていない",
    proposals: "提案",
  },
  detail: {
    title: "の詳細",
    shortage: "不足・確認が必要な薬",
    shortageNote: "在庫切れ → 未確認 → 在庫切れの見込みが近い順 → 見込み算出不可。行を開くと入荷・融通と必要な数。",
    stats: "今日の様子",
    patients: "今日の患者（延べ）",
    chronic: "うち普段の薬の継続",
    evacuees: "避難者数（見込み）",
    contact: "連絡先・受け取り",
    route: "本部からの経路",
    comms: "記録と通信",
    charts: "この救護所のカルテ（架空）",
    district: "地区",
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
  note: "未交付や、目安の日数より早く切れる見込みの品目について、在庫の算数で必要な数量を出した提案。数量は「未交付・必要な数 ＋ 目安の日数分の出庫 − 現地の在庫 − 向かっている搬送・入荷」。未交付・必要な数が無いときは、1日の出庫分以上足りないときだけ出す。本部備蓄から出せる分と卸へ頼む分に分ける。アプリは薬の中身・代わりの薬・量の妥当性を判断しない。承認・却下は本部の担当者が押す。",
  empty: "提案はない",
  pending: "提案中",
  approved: "承認済み",
  approve: "承認",
  reject: "却下",
  approveOnlyHq: "承認・却下は本部（HQ）の画面で行う。",
  fromHq: "本部備蓄から",
  fromVendor: "卸へ頼む",
  basisNeed: "未交付・必要な数",
  basisCover: "目安の日数分の出庫",
  basisCoverUnknown: "出庫のペース不明（0 として計算）",
  basisOnHand: "現地の在庫",
  basisIncoming: "向かっている搬送・入荷",
  newMark: "新",
  updatedMark: "更新（未交付が増えた）",
  stageNote: "承認すると本部の在庫を引き当て（引当済み）、出発で搬送中、到着で受領になり、現地の在庫に足される。卸へ頼む分は「卸に照会中・到着未定」で、人の手配が要るので時計では動かない。",
  goSupply: "本部の発注の提案を見る",
  count: "件",
} as const;

/**
 * 「前回から変わったこと」の1行と、記録の新しさ（Issue #107）。
 * デモの記録の件数を足してルールで組み立てる固定文。Claude も文の生成も使わない。氏名・品目名・数量は入れない
 */
// [TODO-OWNER: 「前回から変わったこと」の1行と、最終報告の相対時間の文言（Claude Code の下書き。ひな形・空のときの文・出来事の名前・「最終報告 N 時間前」）]
export const BOARD_CHANGES = {
  label: "前回から変わったこと",
  since: (time: string) => `${time} 以降：`,
  none: (time: string) => `${time} 以降、変わったことはありません`,
  /** 並べる順と名前。未交付は「+N 件」、ほかは「N 件」 */
  kinds: [
    { kind: "登録", name: "登録" },
    { kind: "未交付", name: "未交付" },
    { kind: "提案", name: "提案" },
    { kind: "承認", name: "承認" },
    { kind: "受領", name: "受領" },
    { kind: "在庫切れ", name: "在庫切れ" },
  ],
  sep: "、",
  lastReport: "最終報告",
  lastReportNote: "在庫の確認か記録が本部に届いた、新しいほうの時刻。デモの時計から数える",
  ago: (minutes: number) =>
    minutes < 1 ? "いま" : minutes < 60 ? `${minutes} 分前` : minutes < 48 * 60 ? `${Math.floor(minutes / 60)} 時間前` : `${Math.floor(minutes / 1440)} 日前`,
} as const;
/** 本部の全体の左上に大きく出す数（Issue #107）。救護所ごとの不足の有無を数えるだけ */
// [TODO-OWNER: 本部の全体で一番大きく出す数の題と説明（Claude Code の下書き。「不足が出ている救護所」）]
export const BOARD_LEAD_TILE = {
  label: "不足が出ている救護所",
  sub: "在庫切れ・切れる見込み・薬剤師の不足のどれかがある救護所の数",
} as const;
export const BOARD_LEAD =
  "救護所4か所の情報を本部に集める、ホワイトボードの代わりになる1枚です。実際の災害で使う形ではなく、訓練と同じ記録の項目で何が見えるかを示す試作です。";
export const BOARD_BACK_LABEL = "はじめにへ戻る";

/** はじめにの画面の、ボードへ入るボタン */
export const BOARD_ENTRY_LABEL = "地域本部の医薬品ボードを見る（試作）";

/** 確認・手配が必要な品目の一覧（Issue #101）。画面の先頭に置く */
export const BOARD_CASES = {
  title: "確認・手配が必要な品目",
  note: "並びは、在庫切れ → 未確認（在庫のデータが届いていない）→ 在庫切れの見込みが近い順 → 見込み算出不可（在庫はあるが出庫のペースが分からない）。照会中・到着未定の数量は現地の在庫に足していない。行を開くと、連絡に要るものが出る。",
  empty: "確認・手配が必要な品目はありません",
  cols: { status: "状態", where: "救護所・品目", onHand: "現地", hq: "本部", supply: "入荷・融通", next: "次の確認" },
  detail: {
    contact: "連絡先（架空）",
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
  guide: "「{days}日」はこの試作で仮に置いた目安。判定は丸める前の値で行う。",
} as const;

/** 救護所ごとの一枚（ホワイトボード風の一覧） */
export const BOARD_OVERVIEW = {
  title: "救護所ごとの一枚",
  note: "ホワイトボードに書く一覧の形。人員と薬の不足がひと目で分かるように、足りないものを先に出す。",
  patients: "今日の患者（延べ）",
  pharmacists: "薬剤師",
  short: "不足",
  outOfStock: "在庫切れ",
  forecast: "切れる見込み",
  unconfirmed: "未確認",
  noPace: "算出不可",
  route: "経路",
  comms: "通信",
  pending: "記録の形になっていないもの",
} as const;

/** デモ（Issue #102）：架空の時計と、架空の問診の入力。すべてブラウザのメモリだけで、保存・送信しない */
// [TODO-OWNER: デモの文言（時計・入力の案内・架空の氏名の注意。Claude Code の下書き）]
export const BOARD_DEMO = {
  title: "デモ：時計を進める",
  note: "架空の時刻が進むと、出庫のペースで在庫が減り、到着見込みを過ぎた入荷・搬送が届き、搬送便・連絡員の時刻に紙の記録が本部に届く。この画面の変化はブラウザのメモリにだけあり、タブを閉じると消える。保存も送信もしない。",
  clock: "架空の時刻",
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
  title: "救護所で問診を入力する（デモ・架空）",
  note: "救護所で聞き取った内容を、訓練と同じ項目で記録に加える。名前は架空のものを使い、実在の人の名前や本当の服薬情報は入れない。入力はブラウザのメモリにだけあり、保存も送信もしない。文は入れたまま出し、要約も言い換えもしない。",
  site: "救護所",
  name: "架空の氏名",
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
  submit: "記録に加える（架空）",
  added: "の記録に加えた（架空）。在庫と需要に反映した。",
  undelivered: "在庫が足りず、未交付として需要に載せた：",
} as const;

export const BOARD_RECORDS = {
  title: "救護所の記録（カルテ・架空）",
  note: "救護所ごとに、患者1人につき1枚。入力で加えたものは架空の氏名付きで、同じ名前で入力すると記録の履歴が増える。最初からあるものは架空の番号だけ。「医師の処方」は人が入力した値で、アプリは決めない。文はすべて本人の言葉のままで、要約はしない。",
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
  totalsTitle: "カルテの処方の累計",
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
  mock: "模式図・架空",
  svgTitle: "架空の町の模式図。本部と救護所4か所、本部からの経路の状態（通行可・迂回・通行止め）、拠点の不足の印",
  svgNote: "架空の町の模式図。実在の地名・道路・施設ではない。外部の地図は使っていない",
  legendOk: "通行可",
  legendDetour: "迂回（点線が迂回の道）",
  legendBlocked: "通行止め",
  legendHq: "本部",
  legendSite: "救護所",
  outOfStock: "在庫切れ",
  pharmacistsShort: "薬剤師 不足",
  statusTitle: "本部の周りの状況（架空）",
  temp: "気温",
  snow: "積雪",
  rain: "天気",
  evacuees: "避難者数（4か所）",
  routesTitle: "本部からの経路",
  notesTitle: "このエリアの最新情報（架空）",
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
    "避難者数と、普段の薬を続けている人の割合（見込み）から1日に要る量を見積もり、在庫でまかなえる日数にした。点線はこの試作で仮に置いた目安。",
  sync: "記録の届き方（通信の状態）",
  syncNote:
    "現場は紙が優先。通信が戻ったとき、または搬送便・連絡員で紙が本部に届いたときに、ここに反映される。「記録の形になっていない」は、紙が届いていない（未着）ものと、届いたが転記していない（転記待ち）ものの合計。",
  sites: "拠点・連絡先・経路（架空）",
  sitesNote:
    "番号はすべて架空で、表示だけ。人の名前は持たない。経路は本部から各救護所への道の状態（通行可・迂回・通行止め）で、地図は出さない（地図の表示は将来構想）。",
  intake: "問診の記録（架空）",
  intakeNote:
    "救護所で聞き取った内容を、訓練と同じ項目に整えたもの。値は本人の言葉のままで、要約も言い換えもしない。名前は持たず、架空の番号だけ。「医師の処方」は医師が入力する欄で、アプリは決めない。",
  about: "この試作の考え方",
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
