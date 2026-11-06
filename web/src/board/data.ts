// 地域本部の医薬品ボード（試作）の架空データ（Issue #97、ADR-0042）。
// 人物・薬・数字はすべて架空。薬の名前は「降圧薬A」のような仮名で、実在の製品名を使わない。
// 数字はここにだけ持ち、画面はここから計算して出す。保存も送信もしない（ADR-0007）。

export type SiteId = "救護所A" | "救護所B" | "救護所C" | "救護所D" | "本部備蓄";

/** 救護所の並び（本部備蓄は在庫の表にだけ出す） */
export const SHELTERS: readonly SiteId[] = ["救護所A", "救護所B", "救護所C", "救護所D"];
export const HQ: SiteId = "本部備蓄";

/**
 * 地区（Issue #107）。左のペインで、本部の下に地区ごとの見出しを置き、その地区の救護所を並べる。
 * 模式図の位置（map.ts）に合わせ、東側に救護所A・D、西側に救護所B・C を置いた
 */
// [TODO-OWNER: 地区の名前と分け方（Claude Code の下書き。東地区＝救護所A・D、西地区＝救護所B・C）]
export interface District {
  id: string;
  name: string;
  sites: readonly SiteId[];
}

export const DISTRICTS: readonly District[] = [
  { id: "east", name: "東地区", sites: ["救護所A", "救護所D"] },
  { id: "west", name: "西地区", sites: ["救護所B", "救護所C"] },
];

export function districtOf(site: SiteId): District | undefined {
  return DISTRICTS.find((d) => d.sites.includes(site));
}

/** ボードの「今日」。架空の発災（2026-10-31）の5日後 */
export const BOARD_TODAY = "2026-11-05";

/**
 * 在庫でまかなえる日数の目安。これより短い救護所・品目を「切れる見込み」として色を付ける。
 * この試作で仮に置いた値で、医学的な基準ではない
 */
// [TODO-OWNER: 在庫の見込み日数の目安（Claude Code の下書き。3日）]
// → オーナー決定（2026-11-05、チャット）：「3日」は試作用の目安として表示し、判定は丸める前の値で行う。
export const COVER_GUIDE_DAYS = 3;

/** 集計の時点（架空）。見出しの直下に出す */
export const BOARD_AS_OF = "2026-11-05 09:30";

export interface StockRow {
  site: SiteId;
  item: string;
  /** 分類（慢性疾患・継続必須・外用・定期投与・急性・衛生）。画面の説明に使うだけで、判定や並び順には使わない */
  category: string;
  unit: string;
  /** 現地の在庫。null は「在庫のデータが届いていない（未確認）」で、0 とは区別する（Issue #101） */
  onHand: number | null;
  /**
   * 1日の出庫。null は「出庫のペースが分からない（見込み算出不可）」。
   * 本部備蓄は出庫のペースを持たないので 0（判定は site === HQ で分け、0 を理由にしない）
   */
  dailyUse: number | null;
}

/** 剤形（薬の名前の仮名と対で出す。規格・量は書かない） */
// → オーナー決定（2026-11-06、チャット）：仮名は「血糖降下注射薬I」、分類は「慢性疾患」、剤形は「注射」、単位は「本」、各拠点の架空の在庫と1日の出庫（救護所A 40本・3本、救護所B 30本・2本、救護所C 36本・2本、救護所D 24本・2本、本部備蓄 120本）は下書きのまま。
export const ITEM_FORMS: Readonly<Record<string, string>> = {
  降圧薬A: "錠剤",
  血糖降下薬B: "錠剤",
  抗てんかん薬C: "錠剤",
  吸入薬D: "吸入",
  貼付鎮痛薬E: "貼付",
  抗凝固薬F: "錠剤",
  "骨粗鬆症薬G（週1）": "錠剤・週1回",
  解熱鎮痛薬H: "錠剤",
  血糖降下注射薬I: "注射",
  消毒薬: "外用液",
};

export const ITEMS: readonly string[] = [
  "降圧薬A",
  "血糖降下薬B",
  "抗てんかん薬C",
  "吸入薬D",
  "貼付鎮痛薬E",
  "抗凝固薬F",
  "骨粗鬆症薬G（週1）",
  "解熱鎮痛薬H",
  "血糖降下注射薬I",
  "消毒薬",
];

const row = (
  site: SiteId,
  item: string,
  category: string,
  unit: string,
  onHand: number | null,
  dailyUse: number | null,
): StockRow => ({ site, item, category, unit, onHand, dailyUse });

export const STOCK: readonly StockRow[] = [
  row("救護所A", "降圧薬A", "慢性疾患", "錠", 420, 60),
  row("救護所A", "血糖降下薬B", "慢性疾患", "錠", 96, 48),
  row("救護所A", "抗てんかん薬C", "継続必須", "錠", 30, 12),
  row("救護所A", "吸入薬D", "慢性疾患", "本", 9, 2),
  row("救護所A", "貼付鎮痛薬E", "外用", "枚", 70, 14),
  row("救護所A", "抗凝固薬F", "継続必須", "錠", 150, 20),
  // 出庫のペースが届いていない例（在庫はあるが見込みを出せない）
  row("救護所A", "骨粗鬆症薬G（週1）", "定期投与", "錠", 12, null),
  row("救護所A", "解熱鎮痛薬H", "急性", "錠", 800, 120),
  row("救護所A", "血糖降下注射薬I", "慢性疾患", "本", 40, 3),
  row("救護所A", "消毒薬", "衛生", "本", 25, 6),
  row("救護所B", "降圧薬A", "慢性疾患", "錠", 180, 45),
  row("救護所B", "血糖降下薬B", "慢性疾患", "錠", 210, 30),
  row("救護所B", "抗てんかん薬C", "継続必須", "錠", 8, 8),
  row("救護所B", "吸入薬D", "慢性疾患", "本", 3, 3),
  row("救護所B", "貼付鎮痛薬E", "外用", "枚", 120, 10),
  row("救護所B", "抗凝固薬F", "継続必須", "錠", 40, 16),
  row("救護所B", "骨粗鬆症薬G（週1）", "定期投与", "錠", 4, 1),
  row("救護所B", "解熱鎮痛薬H", "急性", "錠", 300, 90),
  row("救護所B", "血糖降下注射薬I", "慢性疾患", "本", 30, 2),
  row("救護所B", "消毒薬", "衛生", "本", 40, 5),
  row("救護所C", "降圧薬A", "慢性疾患", "錠", 260, 35),
  row("救護所C", "血糖降下薬B", "慢性疾患", "錠", 150, 25),
  row("救護所C", "抗てんかん薬C", "継続必須", "錠", 45, 9),
  row("救護所C", "吸入薬D", "慢性疾患", "本", 6, 2),
  row("救護所C", "貼付鎮痛薬E", "外用", "枚", 30, 12),
  row("救護所C", "抗凝固薬F", "継続必須", "錠", 90, 15),
  row("救護所C", "骨粗鬆症薬G（週1）", "定期投与", "錠", 0, 1),
  row("救護所C", "解熱鎮痛薬H", "急性", "錠", 500, 80),
  row("救護所C", "血糖降下注射薬I", "慢性疾患", "本", 36, 2),
  row("救護所C", "消毒薬", "衛生", "本", 12, 6),
  row("救護所D", "降圧薬A", "慢性疾患", "錠", 90, 30),
  row("救護所D", "血糖降下薬B", "慢性疾患", "錠", 60, 20),
  row("救護所D", "抗てんかん薬C", "継続必須", "錠", 20, 5),
  // 在庫のデータが届いていない例（0 ではなく未確認）
  row("救護所D", "吸入薬D", "慢性疾患", "本", null, 1),
  row("救護所D", "貼付鎮痛薬E", "外用", "枚", 80, 8),
  row("救護所D", "抗凝固薬F", "継続必須", "錠", 30, 12),
  row("救護所D", "骨粗鬆症薬G（週1）", "定期投与", "錠", 6, 1),
  row("救護所D", "解熱鎮痛薬H", "急性", "錠", 150, 70),
  row("救護所D", "血糖降下注射薬I", "慢性疾患", "本", 24, 2),
  row("救護所D", "消毒薬", "衛生", "本", 30, 4),
  row("本部備蓄", "降圧薬A", "慢性疾患", "錠", 3000, 0),
  row("本部備蓄", "血糖降下薬B", "慢性疾患", "錠", 1200, 0),
  row("本部備蓄", "抗てんかん薬C", "継続必須", "錠", 0, 0),
  row("本部備蓄", "吸入薬D", "慢性疾患", "本", 60, 0),
  row("本部備蓄", "貼付鎮痛薬E", "外用", "枚", 1000, 0),
  row("本部備蓄", "抗凝固薬F", "継続必須", "錠", 500, 0),
  row("本部備蓄", "骨粗鬆症薬G（週1）", "定期投与", "錠", 0, 0),
  row("本部備蓄", "解熱鎮痛薬H", "急性", "錠", 6000, 0),
  row("本部備蓄", "血糖降下注射薬I", "慢性疾患", "本", 120, 0),
  row("本部備蓄", "消毒薬", "衛生", "本", 300, 0),
];

export interface PatientRow {
  date: string;
  site: SiteId;
  /** 延べ人数 */
  patients: number;
  /** うち、処方のあった人（Issue #160。2026-11-06 オーナー決定で見出しを「うち処方のあった人」に。デモで足す分は処方が1つ以上ある記録を数える） */
  chronic: number;
}

const p = (date: string, site: SiteId, patients: number, chronic: number): PatientRow => ({
  date,
  site,
  patients,
  chronic,
});

export const PATIENTS: readonly PatientRow[] = [
  p("2026-11-01", "救護所A", 38, 21),
  p("2026-11-01", "救護所B", 22, 12),
  p("2026-11-01", "救護所C", 19, 10),
  p("2026-11-01", "救護所D", 14, 8),
  p("2026-11-02", "救護所A", 51, 30),
  p("2026-11-02", "救護所B", 36, 20),
  p("2026-11-02", "救護所C", 27, 15),
  p("2026-11-02", "救護所D", 21, 12),
  p("2026-11-03", "救護所A", 63, 39),
  p("2026-11-03", "救護所B", 44, 26),
  p("2026-11-03", "救護所C", 35, 21),
  p("2026-11-03", "救護所D", 28, 16),
  p("2026-11-04", "救護所A", 58, 37),
  p("2026-11-04", "救護所B", 47, 29),
  p("2026-11-04", "救護所C", 33, 20),
  p("2026-11-04", "救護所D", 31, 19),
  p("2026-11-05", "救護所A", 55, 36),
  p("2026-11-05", "救護所B", 40, 25),
  p("2026-11-05", "救護所C", 30, 19),
  p("2026-11-05", "救護所D", 29, 18),
];

export interface InboundRow {
  id: string;
  item: string;
  from: string;
  to: SiteId;
  qty: number;
  /** 到着の見込み。日付が決まっていなければ「未定」 */
  eta: string;
  /**
   * 状態（表示だけ。画面から変えられない）。
   * 本部向けの入荷：卸に照会中・到着未定 → 確定。現地向けの搬送：引当済み → 搬送中 → 受領。救護所どうしの融通：融通の調整中。
   * 照会中・到着未定の数量は、どの在庫にも足さない
   */
  status: "卸に照会中・到着未定" | "確定" | "引当済み" | "搬送中" | "受領" | "融通の調整中";
}

/** 入荷・融通の種類。本部向けの入荷と、現地向けの搬送・融通を区別する（Issue #101） */
export type InboundKind = "本部向けの入荷" | "現地向けの搬送" | "救護所どうしの融通";

export function inboundKind(r: InboundRow): InboundKind {
  if (r.to === HQ) return "本部向けの入荷";
  if (r.from === HQ) return "現地向けの搬送";
  return "救護所どうしの融通";
}

export const INBOUND: readonly InboundRow[] = [
  { id: "1", item: "抗てんかん薬C", from: "供給元（卸）", to: "本部備蓄", qty: 200, eta: "2026-11-06", status: "確定" },
  { id: "2", item: "吸入薬D", from: "本部備蓄", to: "救護所B", qty: 12, eta: "2026-11-06", status: "搬送中" },
  { id: "3", item: "血糖降下薬B", from: "本部備蓄", to: "救護所A", qty: 300, eta: "2026-11-06", status: "搬送中" },
  { id: "4", item: "抗凝固薬F", from: "救護所A", to: "救護所B", qty: 60, eta: "2026-11-06", status: "融通の調整中" },
  { id: "5", item: "骨粗鬆症薬G（週1）", from: "供給元（卸）", to: "本部備蓄", qty: 30, eta: "未定", status: "卸に照会中・到着未定" },
  { id: "6", item: "降圧薬A", from: "供給元（卸）", to: "本部備蓄", qty: 2000, eta: "2026-11-08", status: "確定" },
  { id: "7", item: "解熱鎮痛薬H", from: "本部備蓄", to: "救護所D", qty: 600, eta: "2026-11-07", status: "引当済み" },
  { id: "8", item: "消毒薬", from: "本部備蓄", to: "救護所C", qty: 40, eta: "2026-11-06", status: "引当済み" },
  { id: "9", item: "貼付鎮痛薬E", from: "救護所B", to: "救護所C", qty: 40, eta: "2026-11-06", status: "融通の調整中" },
  { id: "10", item: "降圧薬A", from: "本部備蓄", to: "救護所D", qty: 150, eta: "2026-11-05", status: "受領" },
];

/**
 * 必要な数と時刻（架空）。救護所から届いた「いつまでに、いくつ要るか」。
 * 在庫切れ・切れる見込みの行に添えて出すだけで、量の妥当性は判断しない
 */
export interface NeedRow {
  site: SiteId;
  item: string;
  qty: number;
  /** いつまでに（架空の日時） */
  by: string;
}

export const NEEDS: readonly NeedRow[] = [
  { site: "救護所C", item: "骨粗鬆症薬G（週1）", qty: 3, by: "2026-11-08 09:00" },
  { site: "救護所B", item: "抗てんかん薬C", qty: 24, by: "2026-11-06 08:00" },
  { site: "救護所B", item: "吸入薬D", qty: 6, by: "2026-11-06 12:00" },
];

/**
 * 拠点・連絡先（架空）。行を開いたときに、連絡に要るものをそろえて出す（Issue #101）。
 * 番号はすべて架空で、表示だけ（リンクにしない）。人の名前は持たない
 */
export interface SiteInfo {
  site: SiteId;
  /** 稼働の状態（文字で示す） */
  status: "稼働中" | "縮小して稼働" | "本部";
  /** 今対応できる薬剤師の人数 */
  pharmacists: number;
  /** 救護所が求めている薬剤師の人数（架空）。足りない分は人員の支援の目安 */
  pharmacistsNeeded: number;
  /** 業務用の連絡先（架空の番号。表示だけ） */
  phone: string;
  /** 受け取りの窓口 */
  pickup: string;
  /** 通信が使えないときの代わりの手段（搬送便・連絡員など） */
  altMeans: string;
  /** 在庫を確認した時刻（記録が届いた時刻とは別） */
  stockCheckedAt: string;
}

export const SITES: readonly SiteInfo[] = [
  {
    site: "救護所A",
    status: "稼働中",
    pharmacists: 2,
    pharmacistsNeeded: 3,
    phone: "000-0000-0001",
    pickup: "体育館入口の受付",
    altMeans: "朝夕の搬送便（本部発 07:00・16:00）",
    stockCheckedAt: "2026-11-05 07:30",
  },
  {
    site: "救護所B",
    status: "稼働中",
    pharmacists: 1,
    pharmacistsNeeded: 2,
    phone: "000-0000-0002（通信なしのため不通）",
    pickup: "公民館の事務室",
    altMeans: "夕方の搬送便（本部発 16:00）で紙を回収・物を届ける",
    stockCheckedAt: "2026-11-04 18:00",
  },
  {
    site: "救護所C",
    status: "稼働中",
    pharmacists: 2,
    pharmacistsNeeded: 2,
    phone: "000-0000-0003（携帯が断続的）",
    pickup: "校舎1階の保健室",
    altMeans: "連絡員が午前と午後に本部へ往復",
    stockCheckedAt: "2026-11-05 08:10",
  },
  {
    site: "救護所D",
    status: "縮小して稼働",
    pharmacists: 1,
    pharmacistsNeeded: 2,
    phone: "000-0000-0004（通信なしのため不通）",
    pickup: "集会所の玄関",
    altMeans: "連絡員が本部へ持ち帰る（午後）",
    stockCheckedAt: "2026-11-04 12:00",
  },
  {
    site: "本部備蓄",
    status: "本部",
    pharmacists: 3,
    pharmacistsNeeded: 3,
    phone: "000-0000-0000",
    pickup: "本部の集積所",
    altMeans: "—",
    stockCheckedAt: "2026-11-05 09:30",
  },
];

export function siteInfo(site: SiteId): SiteInfo | undefined {
  return SITES.find((s) => s.site === site);
}

/**
 * 本部から各救護所への経路（架空）。災害時は通れる道路が限られるので、どの経路が使えるかを届け方と一緒に見る。
 * 地図は出さない（文字だけ。地図の表示は将来構想。docs/roadmap.md）
 */
export interface RouteRow {
  to: SiteId;
  status: "通行可" | "迂回" | "通行止め";
  /** 使う経路と、通れないときの代わり（架空の呼び名。実在の道路名は使わない） */
  via: string;
  /** 本部からの所要時間の目安（分） */
  minutes: number | null;
  checkedAt: string;
}

export const ROUTES: readonly RouteRow[] = [
  { to: "救護所A", status: "通行可", via: "幹線道路（東回り）", minutes: 25, checkedAt: "2026-11-05 07:00" },
  { to: "救護所B", status: "迂回", via: "川沿いの道が通行止め。山側の道で迂回（搬送便は往復2時間）", minutes: 70, checkedAt: "2026-11-05 06:30" },
  { to: "救護所C", status: "通行可", via: "幹線道路（西回り）。橋は片側交互通行", minutes: 40, checkedAt: "2026-11-05 08:00" },
  { to: "救護所D", status: "迂回", via: "山すその道が土砂で通行止め。南の幹線から回って迂回", minutes: 45, checkedAt: "2026-11-05 08:30" },
];

export function routeTo(site: SiteId): RouteRow | undefined {
  return ROUTES.find((r) => r.to === site);
}

export interface DemandRow {
  site: SiteId;
  evacuees: number;
  /** 普段の薬を続けている人の割合（見込み） */
  chronicShare: number;
  /** 1日に要る量の見込み（錠・本・枚を合わせた数。試作の目安） */
  dailyNeed: number;
  /** 在庫でまかなえる日数（見込み） */
  daysCovered: number;
}

export const DEMAND: readonly DemandRow[] = [
  { site: "救護所A", evacuees: 620, chronicShare: 0.31, dailyNeed: 282, daysCovered: 3.4 },
  { site: "救護所B", evacuees: 380, chronicShare: 0.34, dailyNeed: 208, daysCovered: 2.1 },
  { site: "救護所C", evacuees: 450, chronicShare: 0.29, dailyNeed: 165, daysCovered: 4.0 },
  { site: "救護所D", evacuees: 300, chronicShare: 0.36, dailyNeed: 151, daysCovered: 2.6 },
];

export type SyncMode = "オンライン" | "紙で記録・衛星回線で日報" | "紙で記録・携帯が断続的" | "紙で記録・通信なし";

export interface SyncRow {
  site: SiteId;
  mode: SyncMode;
  /** 最後に記録が本部に届いた時刻（在庫を確認した時刻は SITES.stockCheckedAt） */
  lastSync: string;
  /** 本部で記録の形になっていない数 */
  pending: number;
  /** その内訳。未着（紙が届いていない）か、転記待ち（届いたが記録の形にしていない） */
  pendingKind: "未着" | "転記待ち" | "なし";
  note: string;
}

export const SYNC: readonly SyncRow[] = [
  { site: "救護所A", mode: "紙で記録・衛星回線で日報", lastSync: "2026-11-05 06:00", pending: 0, pendingKind: "なし", note: "朝の定時報告で届いた" },
  { site: "救護所B", mode: "紙で記録・通信なし", lastSync: "2026-11-04 18:00", pending: 42, pendingKind: "未着", note: "夕方の搬送便で紙を回収する予定" },
  { site: "救護所C", mode: "紙で記録・携帯が断続的", lastSync: "2026-11-05 08:10", pending: 6, pendingKind: "転記待ち", note: "写真で届いた記録の転記待ち" },
  { site: "救護所D", mode: "紙で記録・通信なし", lastSync: "2026-11-04 12:00", pending: 55, pendingKind: "未着", note: "連絡員が本部へ持ち帰る予定" },
  { site: "本部備蓄", mode: "オンライン", lastSync: "2026-11-05 09:30", pending: 0, pendingKind: "なし", note: "本部で入力" },
];

/**
 * 問診の記録（架空）。救護所で聞き取った内容を、記録の項目に整えたもの。
 * 患者の名前は持たず、架空の番号だけ。値は本人の言葉のままで、要約・言い換えをしない形を示す。
 * 「医師の処方」は人（医師）が入力する欄で、アプリも Claude も決めない
 */
// [TODO-OWNER: 問診の記録の架空の文（「医師の処方」の欄の文を含む）と、薬の仮名（薬効の分類名を仮名に使っている。Claude Code の下書き）]
export interface IntakeRecord {
  /** 架空の番号（名前は使わない） */
  id: string;
  site: SiteId;
  recordedAt: string;
  /** 記録の元。紙の問診票か、文字起こし（別のアプリの画面のイメージ） */
  source: "紙の問診票" | "文字起こし（別のアプリ）";
  items: readonly { label: string; value: string }[];
  /** 医師が入力した処方（架空）。空なら未入力 */
  prescription: string;
}

export const INTAKE_RECORDS: readonly IntakeRecord[] = [
  {
    id: "A-012",
    site: "救護所A",
    recordedAt: "2026-11-05 09:40",
    source: "文字起こし（別のアプリ）",
    items: [
      { label: "薬の名前・量（本人の言葉のまま）", value: "血圧の薬を朝に1錠。名前は分からない。白くて小さい" },
      { label: "何の薬か・処方元", value: "血圧。駅前の内科でもらっている" },
      { label: "飲めていない日数・残薬", value: "3日飲めていない。手元に無い" },
      { label: "記録の在りか", value: "お薬手帳は自宅。スマホに薬の袋の写真がある（電池切れ）" },
      { label: "アレルギー・副作用の経験", value: "なし" },
      { label: "代わりに伝えられる人", value: "妻。電話はつながらない" },
    ],
    prescription: "医師が入力：本部備蓄の降圧薬A を7日分",
  },
  {
    id: "B-007",
    site: "救護所B",
    recordedAt: "2026-11-05 08:15",
    source: "紙の問診票",
    items: [
      { label: "薬の名前・量（本人の言葉のまま）", value: "抗てんかん薬C を朝晩。1回1錠" },
      { label: "何の薬か・処方元", value: "てんかん。県立病院の神経内科" },
      { label: "飲めていない日数・残薬", value: "今日の朝の分が無い。残り0" },
      { label: "記録の在りか", value: "お薬手帳を持っている（最新）" },
      { label: "アレルギー・副作用の経験", value: "薬で発疹が出たことがある（名前は手帳に）" },
      { label: "代わりに伝えられる人", value: "息子。手帳の置き場所を知っている" },
    ],
    prescription: "",
  },
  {
    id: "D-003",
    site: "救護所D",
    recordedAt: "2026-11-04 16:50",
    source: "紙の問診票",
    items: [
      { label: "薬の名前・量（本人の言葉のまま）", value: "骨の薬を週に1回、日曜日に。貼り薬も使っている" },
      { label: "何の薬か・処方元", value: "骨粗鬆症と腰の痛み。近所の整形外科" },
      { label: "飲めていない日数・残薬", value: "次の日曜日の分が無い" },
      { label: "記録の在りか", value: "薬の袋が自宅。手帳は作っていない" },
      { label: "アレルギー・副作用の経験", value: "分からない" },
      { label: "代わりに伝えられる人", value: "いない" },
    ],
    prescription: "医師が入力：貼付鎮痛薬E を5日分。週1回の薬は供給元に照会中",
  },
];
