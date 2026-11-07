// 振り返りの一言の、観点と決まった言い回しのつなぎ方の検査（ADR-0064。2026-11-07 オーナー、チャット：
// 「振り返りの一言は、観点ごとに使う文を限定してください」「決まった言い回しなら、どの観点につないでもよい、という扱いにはしないでください」）。
// 長さ・禁止表現・知らない言葉の検査（checks.ts の remarkTextProblem）の後に重ねる。本文はログに出さない。

import { HANDOVER_ALTERNATIVE, VIEWPOINT_LABELS, VIEWPOINT_SHORT_LABELS } from "../src/flow/content";
import type { EventId, Judgment, ViewpointId } from "../src/flow/types";

/**
 * 決まった言い回しの使い方。
 * - viewpoint：その観点にだけつないでよい言い回し。null はどの観点にもつなげる共通の言い回し
 * - when：つないだ観点の判定。confirmed＝確認できたものだけ、open＝まだ確認できていないもの（未確認と気づいた・確認していない）だけ、
 *   null＝観点をつながない言い回し（あいさつ・前置き）
 * - notOnHandover：係の交代のときは使わない（交代は「いつもの方法が使えない」出来事ではない）
 */
export interface RemarkPhrase {
  text: string;
  viewpoint: ViewpointId | null;
  when: "confirmed" | "open" | null;
  notOnHandover?: boolean;
}

// 言い回しの文そのものは prompt.ts の REMARK_PHRASES（オーナーの決定の行はそこにある）。ここは観点と判定への割り当てだけ
// [TODO-OWNER: 振り返りの一言の言い回しごとの、つないでよい観点と判定の割り当て（Claude Code の下書き。ADR-0064 の4）]
export const REMARK_PHRASE_RULES: readonly RemarkPhrase[] = [
  { text: "お話しくださってありがとうございました", viewpoint: null, when: null },
  { text: "今回の訓練では", viewpoint: null, when: null },
  { text: "話せていました", viewpoint: null, when: "confirmed" },
  { text: "自分のお薬情報がどこに記録されているのか把握できていましたね", viewpoint: "location", when: "confirmed" },
  {
    text: "いつもの確認方法が使えないとき、ほかの方法でお薬の情報を確認できるか",
    viewpoint: "alternative",
    when: "open",
    notOnHandover: true,
  },
  { text: "今のうちに確かめておくと安心です", viewpoint: null, when: "open" },
];

/** その回で使ってよい観点の名前（係の交代のときは「代わりの手段」の名前を替える）。長い名前から照合する */
export function remarkLabels(event: EventId | null): { viewpoint: ViewpointId; label: string }[] {
  const out: { viewpoint: ViewpointId; label: string }[] = [];
  for (const v of Object.keys(VIEWPOINT_LABELS) as ViewpointId[]) {
    if (v === "alternative" && event === "handover") {
      out.push({ viewpoint: v, label: HANDOVER_ALTERNATIVE.label }, { viewpoint: v, label: HANDOVER_ALTERNATIVE.shortLabel });
    } else {
      out.push({ viewpoint: v, label: VIEWPOINT_LABELS[v] }, { viewpoint: v, label: VIEWPOINT_SHORT_LABELS[v] });
    }
  }
  return out.sort((a, b) => b.label.length - a.label.length);
}

/** 係の交代のときに使わない名前（いつもの方法の代わりの手段の名前） */
const NOT_ON_HANDOVER_LABELS = [VIEWPOINT_LABELS.alternative, VIEWPOINT_SHORT_LABELS.alternative];

type Found = { at: number; end: number } & ({ kind: "label"; viewpoint: ViewpointId } | { kind: "phrase"; phrase: RemarkPhrase });

/** 重ならないように、長いものから順に場所を取る */
function locate(text: string, event: EventId | null): Found[] {
  const taken = new Array<boolean>(text.length).fill(false);
  const found: Found[] = [];
  const take = (needle: string, make: (at: number) => Found) => {
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at < 0) return;
      from = at + 1;
      if (taken.slice(at, at + needle.length).some(Boolean)) continue;
      for (let i = at; i < at + needle.length; i++) taken[i] = true;
      found.push(make(at));
    }
  };
  const phrases = [...REMARK_PHRASE_RULES].sort((a, b) => b.text.length - a.text.length);
  for (const p of phrases) take(p.text, (at) => ({ kind: "phrase", phrase: p, at, end: at + p.text.length }));
  for (const l of remarkLabels(event)) take(l.label, (at) => ({ kind: "label", viewpoint: l.viewpoint, at, end: at + l.label.length }));
  return found.sort((a, b) => a.at - b.at);
}

const isOpen = (j: Judgment) => j === "aware_unconfirmed" || j === "not_mentioned";

/**
 * 観点の名前と決まった言い回しのつなぎ方を確かめる。合わなければ true（その一言を捨てる）。
 * 一言を「観点をつなぐ言い回し」ごとの区切りに分け、区切りの中の観点の名前を、その言い回しにつないだものとして見る：
 * - 観点ごとの言い回しには、その観点の名前だけをつなげる（例：「記録に載っていないことは、いつもの確認方法が使えないとき、…」は捨てる）
 * - つないだ観点の判定が、言い回しの when と合う（確認できていない観点に「話せていました」を付けない）
 * - 観点ごとの言い回しは、名前を省いても、その観点の判定と合う
 * - 係の交代のときは「代わりの手段」の名前と、いつもの方法の代わりを聞く言い回しを使わない
 * - どの言い回しにもつながらない観点の名前（終わりに名前だけが残るもの）は捨てる
 */
export function remarkPairingProblem(
  text: string,
  judgments: Readonly<Record<ViewpointId, Judgment>>,
  event: EventId | null,
): boolean {
  if (event === "handover" && NOT_ON_HANDOVER_LABELS.some((l) => text.includes(l))) {
    // 名前の一部に「代わりの手段」を含む交代の名前は無いので、そのまま見てよい
    return true;
  }
  let pending: ViewpointId[] = [];
  for (const f of locate(text, event)) {
    if (f.kind === "label") {
      pending.push(f.viewpoint);
      continue;
    }
    const p = f.phrase;
    if (p.when === null) continue; // あいさつ・前置きは区切りにしない
    if (p.notOnHandover === true && event === "handover") return true;
    if (p.viewpoint !== null && pending.some((v) => v !== p.viewpoint)) return true;
    const attached = p.viewpoint === null ? pending : [p.viewpoint];
    for (const v of attached) {
      if (p.when === "confirmed" && judgments[v] !== "confirmed") return true;
      if (p.when === "open" && !isOpen(judgments[v])) return true;
    }
    pending = [];
  }
  return pending.length > 0;
}
