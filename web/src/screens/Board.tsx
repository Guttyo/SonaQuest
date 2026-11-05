import { useEffect, useRef } from "react";
import "../board/board.css";
import {
  BOARD_TODAY,
  COVER_GUIDE_DAYS,
  DEMAND,
  HQ,
  INBOUND,
  INTAKE_RECORDS,
  ITEMS,
  PATIENTS,
  SHELTERS,
  STOCK,
  SYNC,
  type SiteId,
} from "../board/data";
import {
  criticalItems,
  heatCell,
  inboundSummary,
  levelOf,
  pendingSummary,
  shelterRows,
  todaySummary,
  trendSeries,
} from "../board/summary";
import {
  BOARD_ABOUT,
  BOARD_BACK_LABEL,
  BOARD_LEAD,
  BOARD_MOCK_BADGE,
  BOARD_SECTIONS,
  BOARD_TITLE,
  INTAKE_IMAGE,
} from "../board/text";

interface Props {
  onBack: () => void;
}

const fmt = new Intl.NumberFormat("ja-JP");
const SITE_COLORS = ["#2f7d63", "#b5541a", "#4a6fa5", "#8a5a9b"];
const short = (site: SiteId) => site.replace("救護所", "");

function Pill({ level, children }: { level: "bad" | "warn" | "ok"; children: string }) {
  return <span className={`board-pill ${level}`}>{children}</span>;
}

/** 患者数の推移の折れ線（SVG。依存を足さない）。線の右端に救護所の名前と最新の値 */
function Trend() {
  const series = trendSeries(PATIENTS);
  const dates = [...new Set(PATIENTS.map((r) => r.date))].sort();
  const max = Math.max(...PATIENTS.map((r) => r.patients)) * 1.15;
  const W = 560;
  const H = 220;
  const m = { t: 12, r: 72, b: 26, l: 36 };
  const x = (i: number) => m.l + ((W - m.l - m.r) * i) / Math.max(1, dates.length - 1);
  const y = (v: number) => H - m.b - ((H - m.t - m.b) * v) / max;
  // 右端の名前が重ならないよう、近いものを上下に広げる
  const labels = series
    .map((s, i) => ({ s, i, y: y(s.points.at(-1)?.patients ?? 0) + 4 }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) {
    if (labels[k].y - labels[k - 1].y < 13) labels[k].y = labels[k - 1].y + 13;
  }
  const ticks = [0, 20, 40, 60].filter((v) => v < max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="救護所ごとの、日ごとの延べ患者数の折れ線">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#e6dccb" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5d5a55">
            {v === 0 ? "" : v}
          </text>
        </g>
      ))}
      {dates.map((d, i) => (
        <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5d5a55">
          {d.slice(5).replace("-", "/")}
        </text>
      ))}
      {series.map((s, i) => (
        <polyline
          key={s.site}
          fill="none"
          stroke={SITE_COLORS[i]}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={s.points.map((pt) => `${x(dates.indexOf(pt.date))},${y(pt.patients)}`).join(" ")}
        />
      ))}
      {labels.map(({ s, i, y: ly }) => (
        <text key={s.site} x={x(dates.length - 1) + 6} y={ly} fontSize="11" fill={SITE_COLORS[i]}>
          {short(s.site)} {fmt.format(s.points.at(-1)?.patients ?? 0)}
        </text>
      ))}
    </svg>
  );
}

/**
 * 地域本部の医薬品ボード（試作。Issue #97、ADR-0042）。
 * 架空データ（web/src/board/data.ts）だけから計算して表示する。Claude も API も保存も使わない。
 * 救護所4か所と本部備蓄。患者個人の情報は持たず、問診の記録は架空の番号で示す
 */
export function Board({ onBack }: Props) {
  const today = todaySummary(PATIENTS);
  const critical = criticalItems(STOCK);
  const pending = pendingSummary(SYNC);
  const inbound = inboundSummary(INBOUND);
  const rows = shelterRows(STOCK, PATIENTS, SYNC, DEMAND);
  const sites: SiteId[] = [...SHELTERS, HQ];
  const maxDays = Math.max(COVER_GUIDE_DAYS, ...DEMAND.map((d) => d.daysCovered)) * 1.15;

  // 開いたら題へ焦点を移して上から見せる（はじめにの画面から来たときに、押したボタンが消えるため）
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  return (
    <section className="screen board" aria-labelledby="board-title">
      <p>
        <span className="board-badge">{BOARD_MOCK_BADGE}</span>
      </p>
      <h1 id="board-title" ref={titleRef} tabIndex={-1}>
        {BOARD_TITLE}
      </h1>
      <p className="board-lead">{BOARD_LEAD}</p>
      <p className="board-lead">
        {BOARD_TODAY.replace(/-/g, "/")} 時点。救護所4か所の今日の患者は延べ{" "}
        <b data-testid="today-patients">{fmt.format(today.patients)}</b> 人。目安（{COVER_GUIDE_DAYS}
        日）より早く切れる見込みの薬が <b data-testid="critical-count">{fmt.format(critical.length)}</b> 件、
        本部に届いていない紙の記録が <b data-testid="pending-count">{fmt.format(pending.pending)}</b> 件。
      </p>

      <section aria-label={BOARD_SECTIONS.today}>
        <div className="board-tiles">
          <div className="board-tile">
            <span className="board-tile-label">今日の患者（延べ・4か所）</span>
            <span className="board-tile-big">{fmt.format(today.patients)}</span>
            <span className="board-tile-sub">うち普段の薬の継続で来た人 {fmt.format(today.chronic)} 人</span>
          </div>
          <div className="board-tile">
            <span className="board-tile-label">目安より早く切れる見込み</span>
            <span className="board-tile-big">{fmt.format(critical.length)}</span>
            <span className="board-tile-sub">救護所×品目の数。今の出庫のペースが続いたとき</span>
          </div>
          <div className="board-tile">
            <span className="board-tile-label">本部に届いていない記録</span>
            <span className="board-tile-big">{fmt.format(pending.pending)}</span>
            <span className="board-tile-sub">紙のまま、通信なしの救護所 {fmt.format(pending.offlineSites)} か所</span>
          </div>
          <div className="board-tile">
            <span className="board-tile-label">入荷・融通の予定</span>
            <span className="board-tile-big">{fmt.format(inbound.count)}</span>
            <span className="board-tile-sub">うち日付が決まっていないもの {fmt.format(inbound.undated)} 件</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="board-shelters">
        <h2 id="board-shelters">{BOARD_SECTIONS.shelters}</h2>
        <p className="board-note">{BOARD_SECTIONS.sheltersNote}</p>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>救護所</th>
                <th className="num">今日の患者（延べ）</th>
                <th className="num">避難者数</th>
                <th className="num">在庫でまかなえる日数</th>
                <th>目安より早く切れる見込みの薬</th>
                <th>記録の届き方</th>
                <th className="num">届いていない記録</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.site}>
                  <td>{r.site}</td>
                  <td className="num">{r.patients === null ? "—" : fmt.format(r.patients)}</td>
                  <td className="num">{r.evacuees === null ? "—" : fmt.format(r.evacuees)}</td>
                  <td className="num">
                    {r.daysCovered === null ? "—" : <Pill level={levelOf(r.daysCovered)}>{`${r.daysCovered} 日`}</Pill>}
                  </td>
                  <td>{r.critical.length === 0 ? "なし" : r.critical.join("、")}</td>
                  <td>{r.mode}</td>
                  <td className="num">{r.pending === null ? "—" : fmt.format(r.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="board-heat">
        <h2 id="board-heat">{BOARD_SECTIONS.heat}</h2>
        <p className="board-note">{BOARD_SECTIONS.heatNote}</p>
        <div className="board-legend">
          <span>
            <span className="cell bad">{COVER_GUIDE_DAYS}日未満</span>
          </span>
          <span>
            <span className="cell warn">{COVER_GUIDE_DAYS}〜{COVER_GUIDE_DAYS + 1}日</span>
          </span>
          <span>
            <span className="cell ok">{COVER_GUIDE_DAYS + 2}日以上</span>
          </span>
        </div>
        <div className="board-tablebox board-heat">
          <table>
            <thead>
              <tr>
                <th>薬（仮名）</th>
                {sites.map((s) => (
                  <th key={s} className="site">
                    {s === HQ ? "本部備蓄" : short(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item}>
                  <td className="item">{item}</td>
                  {sites.map((site) => {
                    const c = heatCell(STOCK, site, item);
                    if (c === null) return <td key={site}>—</td>;
                    const title =
                      c.level === "hq"
                        ? `${site}：${item}。在庫 ${fmt.format(c.onHand)} ${c.unit}（出庫のペースなし）`
                        : `${site}：${item}。在庫 ${fmt.format(c.onHand)} ${c.unit}、1日の出庫 ${fmt.format(c.dailyUse)} ${c.unit}`;
                    return (
                      <td key={site}>
                        <span className={`cell ${c.level}`} title={title}>
                          {c.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="board-trend">
        <h2 id="board-trend">{BOARD_SECTIONS.trend}</h2>
        <p className="board-note">{BOARD_SECTIONS.trendNote}</p>
        <div className="board-chart">
          <Trend />
        </div>
      </section>

      <section aria-labelledby="board-inbound">
        <h2 id="board-inbound">{BOARD_SECTIONS.inbound}</h2>
        <p className="board-note">{BOARD_SECTIONS.inboundNote}</p>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>薬（仮名）</th>
                <th>どこから</th>
                <th>どこへ</th>
                <th className="num">数量</th>
                <th>到着の見込み</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {INBOUND.map((r) => (
                <tr key={r.id}>
                  <td>{r.item}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td className="num">{fmt.format(r.qty)}</td>
                  <td>{r.eta === "未定" ? "未定" : r.eta.slice(5).replace("-", "/")}</td>
                  <td>
                    <Pill level={r.status === "確定" || r.status === "搬送中" ? "ok" : r.eta === "未定" ? "bad" : "warn"}>
                      {r.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="board-demand">
        <h2 id="board-demand">{BOARD_SECTIONS.demand}</h2>
        <p className="board-note">{BOARD_SECTIONS.demandNote}</p>
        <div className="board-chart board-bars">
          {DEMAND.map((d) => (
            <div key={d.site} className="board-bar-row">
              <span>{d.site}</span>
              <span
                className="board-bar-track"
                title={`避難者 ${fmt.format(d.evacuees)} 人、1日に要る量の見込み ${fmt.format(d.dailyNeed)}`}
              >
                <span
                  className={`board-bar-fill ${d.daysCovered < COVER_GUIDE_DAYS ? "bad" : ""}`}
                  style={{ width: `${(d.daysCovered / maxDays) * 100}%` }}
                />
                <span className="board-bar-guide" style={{ left: `${(COVER_GUIDE_DAYS / maxDays) * 100}%` }} />
              </span>
              <span className="board-bar-value">{d.daysCovered} 日</span>
            </div>
          ))}
          <p className="board-note">点線：{COVER_GUIDE_DAYS}日の目安（この試作で仮に置いた値）</p>
        </div>
      </section>

      <section aria-labelledby="board-sync">
        <h2 id="board-sync">{BOARD_SECTIONS.sync}</h2>
        <p className="board-note">{BOARD_SECTIONS.syncNote}</p>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>拠点</th>
                <th>記録と通信</th>
                <th>最後に届いた時刻</th>
                <th className="num">届いていない記録</th>
                <th>次の予定</th>
              </tr>
            </thead>
            <tbody>
              {SYNC.map((r) => (
                <tr key={r.site}>
                  <td>{r.site}</td>
                  <td>
                    <Pill level={r.mode === "オンライン" ? "ok" : r.mode === "紙で記録・通信なし" ? "bad" : "warn"}>
                      {r.mode}
                    </Pill>
                  </td>
                  <td>{r.lastSync}</td>
                  <td className="num">{fmt.format(r.pending)}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="board-intake">
        <h2 id="board-intake">{BOARD_SECTIONS.intake}</h2>
        <p className="board-note">{BOARD_SECTIONS.intakeNote}</p>
        <div className="board-intake">
          {INTAKE_RECORDS.map((rec) => (
            <article key={rec.id} className="board-record" aria-label={`問診の記録 ${rec.id}（架空）`}>
              <div className="board-record-head">
                <b>番号 {rec.id}</b>
                <span>{rec.site}</span>
                <span>{rec.recordedAt}</span>
                <span>元：{rec.source}</span>
              </div>
              <dl>
                {rec.items.map((it) => (
                  <div key={it.label}>
                    <dt>{it.label}</dt>
                    <dd>{it.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="board-prescription">
                <span className="label">医師の処方（医師が入力する欄。アプリは決めない）</span>
                {rec.prescription === "" ? "未入力" : rec.prescription}
              </p>
            </article>
          ))}
          <div className="board-image">
            {/* 画像は制作者が用意する（SoapVox の録音中の画面）。届くまでは枠だけ。画像を置く場所と alt は、届いたときに決める */}
            <div className="board-image-frame" role="img" aria-label={INTAKE_IMAGE.caption}>
              {INTAKE_IMAGE.placeholder}
            </div>
            <p className="board-image-caption">{INTAKE_IMAGE.caption}</p>
            <p className="board-image-caption">{INTAKE_IMAGE.qr}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="board-about">
        <h2 id="board-about">{BOARD_SECTIONS.about}</h2>
        <ul>
          {BOARD_ABOUT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <button type="button" className="secondary" onClick={onBack}>
        {BOARD_BACK_LABEL}
      </button>
    </section>
  );
}
