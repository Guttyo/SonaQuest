// ボードのアクセス記録（Issue #141、B-09、ADR-0050）を、人がした操作だけ・その操作をした人の名前で・正しい対象に残すための小さな決まり（Issue #289）。
// 画面（Board.tsx）の非同期の処理と開閉の扱いを、DOM の無い試験の環境でも確かめられるように、ここに分けて置く。
// 扱うのは救護所・記録の番号・ログインの値だけで、カルテの中身・患者の氏名をアクセス記録に入れない（氏名は記録を探すのに使うだけ）。

import type { DemoSession } from "./access";
import type { DemoRecord } from "./demo";
import type { SiteId } from "./data";

/**
 * カルテの見出し（summary）を押した時点で、親の details が閉じていれば、これから人が開く（Issue #289 の 1）。
 * open 属性による自動の開閉（いま入力したカルテ・到着したカルテを開いておく。Issue #159）では click が起きないので記録しない。
 * summary は Enter・Space でも click が起きるので、キーボードでの操作も同じ経路で拾える
 */
export function opensOnSummaryClick(details: { open: boolean } | null | undefined): boolean {
  return details != null && !details.open;
}

/**
 * 監査の結果を待った後に何をするか（Issue #289 の 2）。
 * - 画面から外れていたら何もしない（状態はもう無い）。
 * - 結果はカルテの状態に今までどおり入れる（待つ前に「AI監査中」に進めているので、捨てると戻らなくなる）。
 *   ログインが入れ替わった後の結果をどう扱うかはオーナーの判断の項目で、この Issue では今までの動きのまま。
 * - アクセス記録の「監査の結果」は、待つ前と同じログインのときだけ残す（前の担当者の名前で残さない）
 */
export function afterAuditWait(p: { mounted: boolean; sameLogin: boolean }): { apply: boolean; log: boolean } {
  return { apply: p.mounted, log: p.mounted && p.sameLogin };
}

/** 「カルテを編集した」を、実際に入った記録の番号で残すために待っている入力（Issue #289 の 3） */
export interface PendingChartEdit {
  site: SiteId;
  /** 入力した架空の氏名。記録を探すのに使うだけで、アクセス記録には入れない */
  name: string;
  who: DemoSession;
  /** 入力を渡す前からあった、同じ救護所・同じ氏名の記録の番号（同じ人の再来を取り違えない） */
  before: ReadonlySet<string>;
}

/** 人が入力した記録か（到着した架空の患者の記録だけが patientNo を持つ） */
const isEntered = (r: DemoRecord, site: SiteId, name: string) => r.site === site && r.name === name && r.patientNo === undefined;

/** 入力を reducer に渡す直前の記録から、待つ入力を作る */
export function pendingChartEdit(records: readonly DemoRecord[], site: SiteId, name: string, who: DemoSession): PendingChartEdit {
  return { site, name, who, before: new Set(records.filter((r) => isEntered(r, site, name)).map((r) => r.id)) };
}

/**
 * 待っている入力を、実際に入った記録と結び付ける。記録は先頭に足されるので、前からあった番号を除いた最初の1件が、その入力の記録。
 * 番号を作るのは reducer だけなので、待つあいだに架空の患者が同じ救護所に到着しても番号がずれない。
 * まだ入っていない入力は rest に残す
 */
export function claimChartEdits(
  pending: readonly PendingChartEdit[],
  records: readonly DemoRecord[],
): { claimed: { id: string; who: DemoSession }[]; rest: PendingChartEdit[] } {
  const used = new Set<string>();
  const claimed: { id: string; who: DemoSession }[] = [];
  const rest: PendingChartEdit[] = [];
  for (const p of pending) {
    const r = records.find((x) => isEntered(x, p.site, p.name) && !p.before.has(x.id) && !used.has(x.id));
    if (r === undefined) {
      rest.push(p);
      continue;
    }
    used.add(r.id);
    claimed.push({ id: r.id, who: p.who });
  }
  return { claimed, rest };
}

/** 画面を離れるときにまとめて消せるタイマー（見本の監査の待ち。Issue #289 の 2 の後片付け） */
export interface TimerBag {
  set: (fn: () => void, ms: number) => void;
  clearAll: () => void;
  readonly size: number;
}

export function createTimerBag(): TimerBag {
  const ids = new Set<ReturnType<typeof setTimeout>>();
  return {
    set(fn, ms) {
      const id = setTimeout(() => {
        ids.delete(id);
        fn();
      }, ms);
      ids.add(id);
    },
    clearAll() {
      for (const id of ids) clearTimeout(id);
      ids.clear();
    },
    get size() {
      return ids.size;
    },
  };
}
