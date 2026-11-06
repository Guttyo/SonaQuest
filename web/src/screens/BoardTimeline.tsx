// 「発注・搬送」の先頭の時間軸（Issue #118、ADR-0043 の追記 13）。
// 依存を足さない。図は HTML と CSS の位置（%）で描き、文字は図の外に同じ内容を並べる（図を読めない人と、幅の狭い画面のため）。
// 色は状態の札だけ（赤＝在庫切れ、黄＝人が確かめる）。棒・印・斜線は灰と墨。「遅れ」などの判定の文は出さない。

import { Fragment, type CSSProperties } from "react";
import type { SiteId } from "../board/data";
import { clockText, type DemoState } from "../board/demo";
import { BOARD_TIMELINE as T } from "../board/text";
import { TIMELINE_DAYS, timelineRows, timelineWindow, type TimelineRow } from "../board/timeline";

const DAY = 1440;
const fmt = new Intl.NumberFormat("ja-JP");

function statusLevel(status: TimelineRow["status"]): "bad" | "warn" {
  return status === "在庫切れ" ? "bad" : "warn";
}

/** 一覧の札では「見込み算出不可」を「算出不可」と短く出す（Issue #160） */
function statusLabel(status: TimelineRow["status"]): string {
  return status === "見込み算出不可" ? "算出不可" : status;
}

/** 行の文（図と同じ内容）。図は aria-hidden にし、読み上げはこの文で行う */
export function timelineTexts(r: TimelineRow): string[] {
  const out: string[] = [];
  if (r.status === "在庫切れ") out.push(T.stock.在庫切れ);
  else if (r.status === "在庫切れ見込み" && r.stockUntil !== null) out.push(T.stock.在庫切れ見込み(clockText(r.stockUntil)));
  else if (r.status === "未確認") out.push(T.stock.未確認);
  else if (r.status === "見込み算出不可") out.push(T.stock.見込み算出不可);
  if (r.arrivals.length === 0) out.push(T.noArrival);
  for (const a of r.arrivals) {
    out.push(T.arrival(a.kind, `${fmt.format(a.qty)}${r.unit}`, a.status, a.arriveAt === null ? null : clockText(a.arriveAt)));
  }
  if (r.needBy !== null) out.push(T.need(clockText(r.needBy)));
  return out;
}

export function BoardTimeline({ state, site, showSite = true }: { state: DemoState; site?: SiteId; showSite?: boolean }) {
  const rows = timelineRows(state, site);
  const now = state.minutes;
  const { start, end } = timelineWindow(now);
  const pct = (m: number) => Math.min(100, Math.max(0, ((m - start) / (end - start)) * 100));
  const at = (m: number): CSSProperties => ({ left: `${pct(m)}%` });
  const span = (a: number, b: number): CSSProperties => ({ left: `${pct(a)}%`, width: `${Math.max(0, pct(b) - pct(a))}%` });
  const days = Array.from({ length: TIMELINE_DAYS + 1 }, (_, i) => start + i * DAY);

  return (
    <section aria-labelledby="board-timeline" className="board-timeline" data-testid="board-timeline">
      <h3 id="board-timeline">
        {T.title}{" "}
        <span className="board-count">
          {fmt.format(rows.length)} {T.rowsUnit}
        </span>
      </h3>
      <p className="board-note">{T.note}</p>
      <p className="board-note board-tl-narrow">{T.narrowNote}</p>
      <ul className="board-tl-legend" aria-hidden="true">
        <li><span className="board-tl-key stock" />{T.legendStock}</li>
        <li><span className="board-tl-key arrival">◆</span>{T.legendArrival}</li>
        <li><span className="board-tl-key transit" />{T.legendTransit}</li>
        <li><span className="board-tl-key gap" />{T.legendGap}</li>
        <li><span className="board-tl-key need" />{T.legendNeed}</li>
        <li><span className="board-tl-key undecided" />{T.legendUndecided}</li>
      </ul>
      {rows.length === 0 ? (
        <p className="board-note">{T.empty}</p>
      ) : (
        <ol className="board-tl-rows">
          <li className="board-tl-row board-tl-head" aria-hidden="true">
            <div className="board-tl-label" />
            <div className="board-tl-track">
              {days.map((d) => (
                <span key={d} className="board-tl-day" style={at(d)}>
                  {clockText(d).slice(0, 5)}
                </span>
              ))}
              <span className="board-tl-now-label" style={at(now)}>
                {T.now} {clockText(now).slice(6)}
              </span>
            </div>
          </li>
          {rows.map((r) => {
            const texts = timelineTexts(r);
            return (
              <li key={`${r.site}-${r.item}`} className="board-tl-row" data-timeline-row={`${r.site}|${r.item}`} data-stage={r.stage ?? ""}>
                <div className="board-tl-label">
                  <b>
                    {showSite && <>{r.site} </>}
                    {r.item}
                  </b>
                  <span className="board-tl-meta">
                    <span className={`board-pill ${statusLevel(r.status)}`}>{statusLabel(r.status)}</span>{" "}
                    <span className="board-tl-stage" data-testid="timeline-stage">
                      {T.stageLabel}：{r.stage === null ? T.noStage : T.stage[r.stage]}
                    </span>
                  </span>
                </div>
                <div className="board-tl-track" aria-hidden="true">
                  {days.map((d) => (
                    <span key={d} className="board-tl-grid" style={at(d)} />
                  ))}
                  {r.stockUntil !== null && r.stockUntil > now && <span className="board-tl-bar" data-mark="stock" style={span(now, r.stockUntil)} />}
                  {r.stockUntil !== null && <span className="board-tl-out" data-mark="stock-end" style={at(r.stockUntil)} />}
                  {r.gap !== null && <span className="board-tl-gap" data-mark="gap" style={span(r.gap.from, r.gap.to)} />}
                  {r.arrivals.map((a) =>
                    a.arriveAt === null ? (
                      <span key={a.id} className="board-tl-undecided" data-mark="undecided" style={span(now, end)} />
                    ) : (
                      <Fragment key={a.id}>
                        {a.departAt !== null && a.departAt < a.arriveAt && (
                          <span className="board-tl-transit" data-mark="transit" style={span(Math.max(a.departAt, start), a.arriveAt)} />
                        )}
                        <span className="board-tl-arrival" data-mark="arrival" style={at(a.arriveAt)}>
                          ◆
                        </span>
                      </Fragment>
                    ),
                  )}
                  {r.needBy !== null && <span className="board-tl-need" data-mark="need" style={at(r.needBy)} />}
                  <span className="board-tl-now" data-mark="now" style={at(now)} />
                </div>
                <p className="board-tl-text">{texts.join("／")}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
