// 架空の患者の到着（Issue #122、ADR-0048）。本部では到着の累計・けがのある人の人数（件数だけ）・種と操作、
// 救護所ではその救護所に到着した患者の一覧を出す。状態は demo.ts の reducer のメモリだけで、保存・送信・ログ出力をしない。
// けが・体調の文は入れたまま出し、アプリは重さ・緊急度・処置を判断しない。Claude も API も使わない。

import { SHELTERS, type SiteId } from "./data";
import { arrivalRows, clockText, type DemoAction, type DemoState } from "./demo";
import { nextSeed } from "./patients";
import { BOARD_ARRIVALS } from "./text";
import { Fold, Help } from "./Fold";

const fmt = new Intl.NumberFormat("ja-JP");

interface Props {
  state: DemoState;
  /** 救護所を渡すと、その救護所に到着した患者の一覧。省くと本部の表示（累計・人数・種）。操作は ArrivalControls（デモ操作の中） */
  site?: SiteId;
}

export function PatientArrivals({ state, site }: Props) {
  if (site !== undefined) return <ArrivalList state={state} site={site} />;
  return <ArrivalSummary state={state} />;
}

/**
 * 受け入れの開始・停止と、別のパターンでやり直すボタン（Issue #170）。時計を進める操作と同じ「デモ操作」の中に置く。
 * 「自動で進める」を押すと受け入れも始まる（demo.ts の run）
 */
export function ArrivalControls({ state, dispatch }: { state: DemoState; dispatch: (a: DemoAction) => void }) {
  const a = state.arrivals;
  const done = a.arrived.length >= a.plan.length;
  return (
    <>
      {done ? (
        <span className="board-note">{BOARD_ARRIVALS.allArrived}</span>
      ) : (
        <button type="button" className="secondary" data-arrivals="toggle" onClick={() => dispatch({ type: "arrivals", active: !a.active })}>
          {a.active ? BOARD_ARRIVALS.stop : BOARD_ARRIVALS.start}
        </button>
      )}
      <button type="button" className="secondary" data-arrivals="reseed" onClick={() => dispatch({ type: "reseed", seed: nextSeed(a.seed) })}>
        {BOARD_ARRIVALS.reseed}
      </button>
    </>
  );
}

function ArrivalSummary({ state }: { state: DemoState }) {
  const a = state.arrivals;
  const rows = arrivalRows(state);
  const withCondition = rows.filter((r) => r.hasCondition).length;
  return (
    // 受け入れの最中だけ開いておく（Issue #159）。閉じた見出しにも到着の人数を出す
    <Fold
      id="board-arrivals"
      className="board-arrivals"
      testId="arrivals-summary"
      title={BOARD_ARRIVALS.title}
      count={`${fmt.format(a.arrived.length)} / ${fmt.format(a.plan.length)} ${BOARD_ARRIVALS.people}`}
      defaultOpen={a.active}
    >
      <dl className="board-stats">
        <div>
          <dt>{BOARD_ARRIVALS.arrived}</dt>
          <dd data-testid="arrivals-count">
            {fmt.format(a.arrived.length)} / {fmt.format(a.plan.length)} {BOARD_ARRIVALS.people}
          </dd>
        </div>
        <div>
          <dt>{BOARD_ARRIVALS.withCondition}</dt>
          <dd data-testid="arrivals-condition">
            {fmt.format(withCondition)} {BOARD_ARRIVALS.people}
          </dd>
        </div>
        <div>
          <dt>{BOARD_ARRIVALS.seed}</dt>
          <dd data-testid="arrivals-seed">{a.seed}</dd>
        </div>
      </dl>
      <p className="board-note" data-testid="arrivals-by-site">
        {BOARD_ARRIVALS.bySite}：
        {SHELTERS.map((s) => `${s} ${fmt.format(a.arrived.filter((x) => x.site === s).length)}`).join("、")}
      </p>
      <p className="board-note">{BOARD_ARRIVALS.controlsNote}</p>
      <p className="board-note">{BOARD_ARRIVALS.nameNote}</p>
      <Help>
        <p className="board-note">{BOARD_ARRIVALS.note}</p>
        <p className="board-note">{BOARD_ARRIVALS.memoryNote}</p>
      </Help>
    </Fold>
  );
}

function ArrivalList({ state, site }: { state: DemoState; site: SiteId }) {
  const rows = arrivalRows(state, site);
  const headingId = `board-arrivals-${site}`;
  return (
    // ふだんは閉じておく（Issue #159）。閉じた見出しにも人数を出す
    <Fold
      id={headingId}
      className="board-arrivals"
      testId="arrivals-list"
      title={BOARD_ARRIVALS.listTitle}
      count={`${fmt.format(rows.length)} ${BOARD_ARRIVALS.people}`}
      defaultOpen={false}
    >
      <p className="board-note">{BOARD_ARRIVALS.nameNote}</p>
      {rows.length === 0 ? (
        <p className="board-note">{BOARD_ARRIVALS.empty}</p>
      ) : (
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>{BOARD_ARRIVALS.cols.at}</th>
                <th>{BOARD_ARRIVALS.cols.no}</th>
                <th>{BOARD_ARRIVALS.cols.name}</th>
                <th>{BOARD_ARRIVALS.cols.sex}</th>
                <th className="num">{BOARD_ARRIVALS.cols.age}</th>
                <th>{BOARD_ARRIVALS.cols.condition}</th>
                <th>{BOARD_ARRIVALS.cols.meds}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} data-arrival={r.no}>
                  <td>{clockText(r.at)}</td>
                  <td>
                    No.{r.no}（{r.recordId}）
                  </td>
                  <td>{r.name}</td>
                  <td>{r.sex}</td>
                  <td className="num">{r.age}</td>
                  <td>{r.condition}</td>
                  <td>
                    {r.meds
                      .map(
                        (m) =>
                          `${m.item} 1日${m.perDay}${m.unit} → ${fmt.format(m.qty)}${m.unit}${m.undelivered > 0 ? `（${BOARD_ARRIVALS.undelivered} ${fmt.format(m.undelivered)}）` : ""}`,
                      )
                      .join("、")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="board-note">{BOARD_ARRIVALS.conditionNote}</p>
    </Fold>
  );
}
