import { useEffect, useReducer, useState, type FormEvent, type ReactNode } from "react";
import "../board/board.css";
import {
  BOARD_AS_OF,
  COVER_GUIDE_DAYS,
  DEMAND,
  HQ,
  INTAKE_RECORDS,
  ITEMS,
  ITEM_FORMS,
  ROUTES,
  SHELTERS,
  SITES,
  STOCK,
  inboundKind,
  routeTo,
  siteInfo,
  type SiteId,
} from "../board/data";
import {
  DEMO_SITES,
  chartsFor,
  clockText,
  demoReducer,
  initialDemo,
  nextFictionalName,
  patientsWithExtra,
  type DemoState,
  type PatientChart,
} from "../board/demo";
import {
  caseRows,
  criticalItems,
  heatCell,
  inboundSummary,
  levelOf,
  pendingSummary,
  roundDays,
  shelterRows,
  siteOverview,
  todaySummary,
  trendSeries,
  unknownCounts,
  type CaseRow,
  type SiteOverview,
} from "../board/summary";
import {
  BOARD_ABOUT,
  BOARD_BACK_LABEL,
  BOARD_CASES,
} from "../board/text";
import { BoardMap } from "./BoardMap";
import {
  BOARD_DEMO,
  BOARD_GROUPS,
  BOARD_INTAKE_FORM,
  BOARD_LEAD,
  BOARD_MOCK_BADGE,
  BOARD_OVERVIEW,
  BOARD_RECORDS,
  BOARD_SECTIONS,
  BOARD_TITLE,
  INTAKE_IMAGE,
} from "../board/text";

interface Props {
  onBack: () => void;
  /** 試験・見本のため。省くと自動進行の判定にブラウザの設定を使う */
  reducedMotion?: boolean;
}

const fmt = new Intl.NumberFormat("ja-JP");
const SITE_COLORS = ["#2f7d63", "#b5541a", "#4a6fa5", "#8a5a9b"];
const short = (site: SiteId) => site.replace("救護所", "");
const md = (date: string) => date.slice(5).replace("-", "/");
const mdhm = (dt: string) => `${md(dt.slice(0, 10))} ${dt.slice(11)}`;
/** 在庫の数（デモで減ると小数になるので、画面は切り捨て） */
const qty = (n: number | null, unit: string) => (n === null ? "未確認" : `${fmt.format(Math.floor(n))}${unit}`);
/** 行の詳細に出す入荷・搬送の1件。到着未定は状態の文に含まれるので、日付のあるときだけ添える */
const inboundLine = (r: { from: string; to: string; qty: number; status: string; eta: string }, unit: string) =>
  `${r.from} → ${r.to} ${fmt.format(r.qty)}${unit}（${r.status}${r.eta === "未定" ? "" : `、${md(r.eta)}`}）`;

function Pill({ level, children }: { level: "bad" | "warn" | "ok" | "none"; children: string }) {
  return <span className={`board-pill ${level}`}>{children}</span>;
}

function statusLevel(status: CaseRow["status"]): "bad" | "warn" | "none" {
  if (status === "在庫切れ") return "bad";
  if (status === "在庫切れ見込み") return "warn";
  return "none";
}

function routeLevel(status: string): "ok" | "warn" | "bad" {
  return status === "通行可" ? "ok" : status === "迂回" ? "warn" : "bad";
}

/** 品目の1行（2タップ目）。一覧の行（summary）と、開いたときの連絡に要るもの */
function CaseItem({ c, state }: { c: CaseRow; state: DemoState }) {
  const info = siteInfo(c.site);
  const route = routeTo(c.site);
  const sync = state.sync.find((s) => s.site === c.site);
  const offline = sync?.mode === "紙で記録・通信なし";
  const start = STOCK.find((s) => s.site === c.site && s.item === c.item)?.onHand ?? null;
  const changed = start !== null && c.onHand !== null && Math.floor(start) !== Math.floor(c.onHand);
  const statusText =
    c.status === "在庫切れ見込み" && c.days !== null ? `在庫切れ見込み（あと${roundDays(c.days)}日）` : c.status;
  return (
    <li className="board-case">
      <details>
        <summary>
          <span className="board-case-row">
            <span className="board-case-status">
              <Pill level={statusLevel(c.status)}>{statusText}</Pill>
            </span>
            <span className="board-case-where">
              {c.item}
              <span className="board-case-form">（{ITEM_FORMS[c.item] ?? "—"}）</span>
            </span>
            <span className="board-case-num">
              <span className="k">{BOARD_CASES.cols.onHand}</span> {qty(c.onHand, c.unit)}
              {changed && <span className="board-delta">（開始時 {qty(start, c.unit)}）</span>}
            </span>
            <span className="board-case-num">
              <span className="k">{BOARD_CASES.cols.hq}</span> {c.hqOnHand === null ? "—" : qty(c.hqOnHand, c.unit)}
            </span>
            <span className="board-case-supply">
              <span className="k">{BOARD_CASES.cols.supply}</span> {c.supply}
            </span>
            <span className="board-case-next">
              <span className="k">{BOARD_CASES.cols.next}</span> {c.next}
            </span>
          </span>
        </summary>
        <div className="board-case-detail">
          <dl>
            {offline && info && (
              <div>
                <dt>{BOARD_CASES.detail.alt}</dt>
                <dd>{info.altMeans}</dd>
              </div>
            )}
            {info && (
              <>
                <div>
                  <dt>{BOARD_CASES.detail.contact}</dt>
                  <dd>
                    {info.phone}
                    <br />
                    {BOARD_CASES.detail.pickup}：{info.pickup}（{info.status}）
                  </dd>
                </div>
                <div>
                  <dt>{BOARD_CASES.detail.pharmacists}</dt>
                  <dd>{fmt.format(info.pharmacists)} 人</dd>
                </div>
              </>
            )}
            {sync && (
              <div>
                <dt>{BOARD_CASES.detail.comms}</dt>
                <dd>{sync.mode}</dd>
              </div>
            )}
            {!offline && info && (
              <div>
                <dt>{BOARD_CASES.detail.alt}</dt>
                <dd>{info.altMeans}</dd>
              </div>
            )}
            {sync && (
              <div>
                <dt>{BOARD_CASES.detail.lastReport}</dt>
                <dd>{mdhm(sync.lastSync)}</dd>
              </div>
            )}
            {info && (
              <div>
                <dt>{BOARD_CASES.detail.stockChecked}</dt>
                <dd>{mdhm(info.stockCheckedAt)}</dd>
              </div>
            )}
            {route && (
              <div>
                <dt>{BOARD_CASES.detail.route}</dt>
                <dd>
                  <Pill level={routeLevel(route.status)}>{route.status}</Pill> {route.via}
                  {route.minutes !== null && `（約${fmt.format(route.minutes)}分）`}。確認 {mdhm(route.checkedAt)}
                </dd>
              </div>
            )}
            <div>
              <dt>{BOARD_CASES.detail.need}</dt>
              <dd>{c.need ? `${fmt.format(c.need.qty)}${c.unit}（${mdhm(c.need.by)} まで）` : BOARD_CASES.detail.none}</dd>
            </div>
            <div>
              <dt>{BOARD_CASES.detail.siteInbound}</dt>
              <dd>{c.siteInbound.length === 0 ? BOARD_CASES.detail.none : c.siteInbound.map((r) => inboundLine(r, c.unit)).join("。")}</dd>
            </div>
            <div>
              <dt>{BOARD_CASES.detail.hqInbound}</dt>
              <dd>{c.hqInbound.length === 0 ? BOARD_CASES.detail.none : c.hqInbound.map((r) => inboundLine(r, c.unit)).join("。")}</dd>
            </div>
          </dl>
        </div>
      </details>
    </li>
  );
}

/** 救護所の1行（1タップ目）。人員と薬の不足を先に出し、開くと品目の行とカルテへの入口 */
function SiteGroup({
  o,
  cases,
  state,
  charts,
  onOpenRecords,
}: {
  o: SiteOverview;
  cases: CaseRow[];
  state: DemoState;
  charts: PatientChart[];
  onOpenRecords: () => void;
}) {
  const undelivered = charts.reduce((a, c) => a + c.undelivered, 0);
  return (
    <li className="board-group">
      <details>
        <summary>
          <span className="board-group-row">
            <span className="board-group-site">
              <b>{o.site}</b>
              <span className="board-group-sub">
                {BOARD_OVERVIEW.patients} {o.patients === null ? "—" : fmt.format(o.patients)} 人
              </span>
            </span>
            <span className={`board-group-cell ${o.pharmacistsShort > 0 ? "short" : ""}`}>
              <span className="k">{BOARD_OVERVIEW.pharmacists}</span> {o.pharmacists === null ? "—" : `${fmt.format(o.pharmacists)} 人`}
              {o.pharmacistsShort > 0 && <Pill level="bad">{`${BOARD_OVERVIEW.short} ${fmt.format(o.pharmacistsShort)} 人`}</Pill>}
            </span>
            <span className={`board-group-cell ${o.outOfStock > 0 ? "short" : ""}`}>
              <span className="k">{BOARD_OVERVIEW.outOfStock}</span> {fmt.format(o.outOfStock)}
            </span>
            <span className={`board-group-cell ${o.forecast > 0 ? "warn" : ""}`}>
              <span className="k">{BOARD_OVERVIEW.forecast}</span> {fmt.format(o.forecast)}
            </span>
            <span className="board-group-cell">
              <span className="k">
                {BOARD_OVERVIEW.unconfirmed}・{BOARD_OVERVIEW.noPace}
              </span>{" "}
              {fmt.format(o.unconfirmed)}・{fmt.format(o.noPace)}
            </span>
            <span className="board-group-cell">
              <span className="k">{BOARD_OVERVIEW.route}</span> <Pill level={routeLevel(o.routeStatus)}>{o.routeStatus}</Pill>
            </span>
            <span className="board-group-cell">
              <span className="k">{BOARD_OVERVIEW.comms}</span> {o.mode}
              {o.pending !== null && o.pending > 0 && `（${BOARD_OVERVIEW.pending} ${fmt.format(o.pending)}）`}
            </span>
            <span className={`board-group-cell ${undelivered > 0 ? "short" : ""}`}>
              <span className="k">{BOARD_RECORDS.chartLabel}</span> {fmt.format(charts.length)} {BOARD_RECORDS.count}
              {undelivered > 0 && <Pill level="bad">{`${BOARD_RECORDS.flagUndelivered}`}</Pill>}
            </span>
          </span>
        </summary>
        <div className="board-group-body">
          <button type="button" className="secondary board-group-open" onClick={onOpenRecords}>
            {BOARD_RECORDS.open}（{fmt.format(charts.length)} {BOARD_RECORDS.count}）
          </button>
          {cases.length === 0 ? (
            <p className="board-note">{BOARD_GROUPS.empty}</p>
          ) : (
            <>
              <div className="board-cases-head" aria-hidden="true">
                <span>{BOARD_CASES.cols.status}</span>
                <span>{BOARD_GROUPS.items}</span>
                <span>{BOARD_CASES.cols.onHand}</span>
                <span>{BOARD_CASES.cols.hq}</span>
                <span>{BOARD_CASES.cols.supply}</span>
                <span>{BOARD_CASES.cols.next}</span>
              </div>
              <ol className="board-cases" aria-label={`${o.site} の${BOARD_CASES.title}`}>
                {cases.map((c) => (
                  <CaseItem key={`${c.site}-${c.item}`} c={c} state={state} />
                ))}
              </ol>
            </>
          )}
        </div>
      </details>
    </li>
  );
}

/** 架空の問診の入力（デモ）。送信先は無く、reducer に渡すだけ */
function IntakeForm({ state, onAdd }: { state: DemoState; onAdd: (a: Parameters<typeof demoReducer>[1]) => void }) {
  const [site, setSite] = useState<SiteId>(DEMO_SITES[0]);
  const [name, setName] = useState(() => nextFictionalName(0));
  const [values, setValues] = useState<string[]>(() => BOARD_INTAKE_FORM.items.map(() => ""));
  const [item, setItem] = useState("");
  const [count, setCount] = useState("");
  const [days, setDays] = useState("");
  const [message, setMessage] = useState("");
  const unit = STOCK.find((s) => s.site === site && s.item === item)?.unit ?? "";

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(count);
    const d = Number(days);
    const prescription = item !== "" && n > 0 ? { item, qty: Math.floor(n), days: d > 0 ? Math.floor(d) : 0 } : null;
    onAdd({
      type: "add_record",
      site,
      name: name.trim() === "" ? nextFictionalName(state.records.length) : name.trim(),
      items: BOARD_INTAKE_FORM.items.map((label, i) => ({ label, value: values[i].trim() === "" ? "（未記入）" : values[i] })),
      prescription,
    });
    const before = state.stock.find((s) => s.site === site && s.item === item)?.onHand ?? 0;
    const undelivered = prescription ? Math.max(0, prescription.qty - Math.floor(before)) : 0;
    setMessage(
      `${site}${BOARD_INTAKE_FORM.added}${undelivered > 0 ? ` ${BOARD_INTAKE_FORM.undelivered}${item} ${fmt.format(undelivered)}${unit}` : ""}`,
    );
    setName(nextFictionalName(state.records.length + 1));
    setValues(BOARD_INTAKE_FORM.items.map(() => ""));
    setItem("");
    setCount("");
    setDays("");
  }

  return (
    <form className="board-form" onSubmit={submit}>
      <p className="board-note">{BOARD_INTAKE_FORM.note}</p>
      <div className="board-form-grid">
        <label>
          <span>{BOARD_INTAKE_FORM.site}</span>
          <select value={site} onChange={(e) => setSite(e.target.value as SiteId)}>
            {DEMO_SITES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            {BOARD_INTAKE_FORM.name}
            <small>{BOARD_INTAKE_FORM.nameNote}</small>
          </span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        {BOARD_INTAKE_FORM.items.map((label, i) => (
          <label key={label} className="wide">
            <span>{label}</span>
            <input
              type="text"
              value={values[i]}
              onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
              autoComplete="off"
            />
          </label>
        ))}
      </div>
      <fieldset className="board-form-rx">
        <legend>{BOARD_INTAKE_FORM.prescriptionTitle}</legend>
        <div className="board-form-grid">
          <label>
            <span>{BOARD_INTAKE_FORM.prescriptionItem}</span>
            <select value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">{BOARD_INTAKE_FORM.prescriptionNone}</option>
              {ITEMS.map((it) => (
                <option key={it} value={it}>
                  {it}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {BOARD_INTAKE_FORM.prescriptionQty}
              {unit !== "" && `（${unit}）`}
            </span>
            <input type="number" min={0} step={1} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} disabled={item === ""} />
          </label>
          <label>
            <span>{BOARD_INTAKE_FORM.prescriptionDays}</span>
            <input type="number" min={0} step={1} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} disabled={item === ""} />
          </label>
        </div>
      </fieldset>
      <button type="submit" className="secondary">
        {BOARD_INTAKE_FORM.submit}
      </button>
      <p className="board-form-message" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

/**
 * カルテ（患者1人につき1枚・架空）。見出しに架空の氏名か番号と印（処方あり・未交付あり）、
 * 開くと記録の履歴、最新の記録の6項目（本人の言葉のまま）、医師の処方の履歴
 */
function ChartCard({ chart, open }: { chart: PatientChart; open: boolean }) {
  const latest = chart.visits[0];
  const title = chart.name === null ? `番号 ${chart.id}` : `${chart.name}（架空）`;
  return (
    <li className={`board-chart-card ${chart.added ? "board-chart-added" : ""}`}>
      <details open={open}>
        <summary>
          <span className="board-chart-head">
            <b>{title}</b>
            {chart.name !== null && <span className="board-record-id">{chart.id}</span>}
            <span className="board-chart-flags">
              <Pill level={chart.hasPrescription ? "ok" : "none"}>{chart.hasPrescription ? BOARD_RECORDS.flagPrescribed : BOARD_RECORDS.flagNone}</Pill>
              {chart.undelivered > 0 && <Pill level="bad">{BOARD_RECORDS.flagUndelivered}</Pill>}
            </span>
            <span className="board-chart-sub">
              {BOARD_RECORDS.visits} {fmt.format(chart.visits.length)} {BOARD_RECORDS.count}・{latest.at}
            </span>
          </span>
        </summary>
        <div className="board-chart-body">
          <section aria-label={BOARD_RECORDS.visits}>
            <h4>{BOARD_RECORDS.visits}</h4>
            <ol className="board-chart-visits">
              {chart.visits.map((v) => (
                <li key={v.id}>
                  <span className="board-log-at">{v.at}</span> {v.id}・{v.source}
                  {v.prescription !== "" && `・${v.prescription}`}
                  {v.undelivered > 0 && `（${BOARD_RECORDS.undelivered} ${fmt.format(v.undelivered)}）`}
                </li>
              ))}
            </ol>
          </section>
          <section aria-label={BOARD_RECORDS.latest}>
            <h4>
              {BOARD_RECORDS.latest}（{latest.at}・{latest.source}）
            </h4>
            <dl>
              {latest.items.map((it) => (
                <div key={it.label}>
                  <dt>{it.label}</dt>
                  <dd>{it.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-label={BOARD_RECORDS.prescriptions}>
            <h4>{BOARD_RECORDS.prescriptions}</h4>
            <p className="board-prescription">
              <span className="label">医師の処方（医師が入力する欄。アプリは決めない）</span>
              {chart.visits.some((v) => v.prescription !== "")
                ? chart.visits
                    .filter((v) => v.prescription !== "")
                    .map((v) => `${v.at}：${v.prescription}${v.undelivered > 0 ? `（${BOARD_RECORDS.undelivered} ${fmt.format(v.undelivered)}）` : ""}`)
                    .join(" ／ ")
                : BOARD_RECORDS.prescriptionNone}
            </p>
          </section>
        </div>
      </details>
    </li>
  );
}

/** 患者数の推移の折れ線（SVG。依存を足さない）。線の右端に救護所の名前と最新の値。数字の表を下に添える */
function Trend({ state }: { state: DemoState }) {
  const patients = patientsWithExtra(state);
  const series = trendSeries(patients);
  const dates = [...new Set(patients.map((r) => r.date))].sort();
  const max = Math.max(...patients.map((r) => r.patients)) * 1.15;
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
    <>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
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
            {md(d)}
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
      {/* 図と同じ数字の表（図を読めない人のため） */}
      <div className="board-tablebox board-trend-table">
        <table>
          <caption className="visually-hidden">救護所ごとの、日ごとの延べ患者数</caption>
          <thead>
            <tr>
              <th>救護所</th>
              {dates.map((d) => (
                <th key={d} className="num">
                  {md(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.site}>
                <td>{s.site}</td>
                {s.points.map((pt) => (
                  <td key={pt.date} className="num">
                    {fmt.format(pt.patients)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 下部の詳細。閉じた状態で置き、開くと中身が出る */
function More({ id, title, note, children, open }: { id: string; title: string; note?: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="board-more" open={open}>
      <summary>
        <h2 id={id}>{title}</h2>
      </summary>
      <div className="board-more-body">
        {note && <p className="board-note">{note}</p>}
        {children}
      </div>
    </details>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 地域本部の医薬品ボード（試作。Issue #97、#101、#102、ADR-0042）。
 * 架空データ（web/src/board/data.ts）から始め、デモの reducer（demo.ts）でメモリの中だけ動かす。Claude も API も保存も使わない。
 * 先頭に救護所ごとの一覧（1タップ目：救護所、2タップ目：品目）、デモの時計と入力、集計、残りは閉じた詳細。
 * 焦点は App の画面遷移の処理（[data-scroll-target]）に任せる
 */
export function Board({ onBack, reducedMotion }: Props) {
  const [state, dispatch] = useReducer(demoReducer, undefined, initialDemo);
  const noAuto = reducedMotion ?? prefersReducedMotion();
  const [recordsOpen, setRecordsOpen] = useState(false);

  // 自動進行：2秒で架空の1時間。止めるか、画面を離れると止まる
  useEffect(() => {
    if (!state.running || noAuto) return;
    const id = window.setInterval(() => dispatch({ type: "tick", hours: 1 }), 2000);
    return () => window.clearInterval(id);
  }, [state.running, noAuto]);

  const patients = patientsWithExtra(state);
  const today = todaySummary(patients);
  const critical = criticalItems(state.stock);
  const unknown = unknownCounts(state.stock);
  const pending = pendingSummary(state.sync);
  const inbound = inboundSummary(state.inbound);
  const cases = caseRows(state.stock, state.inbound, state.needs, SITES, state.sync);
  const rows = shelterRows(state.stock, patients, state.sync, DEMAND);
  const overview = siteOverview(state.stock, patients, SITES, state.sync, ROUTES).sort(
    (a, b) => b.outOfStock - a.outOfStock || b.pharmacistsShort - a.pharmacistsShort || b.forecast - a.forecast || b.unconfirmed - a.unconfirmed,
  );
  const sites: SiteId[] = [...SHELTERS, HQ];
  const maxDays = Math.max(COVER_GUIDE_DAYS, ...DEMAND.map((d) => d.daysCovered)) * 1.15;
  const openInbound = state.inbound.filter((r) => r.status !== "受領");
  const charts = chartsFor(state, INTAKE_RECORDS);
  const latestAddedKey = state.records.length > 0 ? `${state.records[0].site}|${state.records[0].name}` : null;
  function openRecords() {
    setRecordsOpen(true);
    document.getElementById("board-intake")?.scrollIntoView({ block: "start" });
  }

  return (
    <section className="screen board" aria-labelledby="board-title">
      <h1 id="board-title" data-scroll-target tabIndex={-1}>
        {BOARD_TITLE}
      </h1>
      <p className="board-asof">
        <span className="board-badge">{BOARD_MOCK_BADGE}</span>
        <span>集計 {mdhm(BOARD_AS_OF)} 時点</span>
        {state.minutes > 0 && (
          <span>
            → {BOARD_DEMO.clock} <b data-testid="demo-clock">{clockText(state.minutes)}</b>
          </span>
        )}
      </p>

      <section aria-labelledby="board-cases">
        <h2 id="board-cases">
          {BOARD_CASES.title} <span className="board-count">{fmt.format(cases.length)} 件</span>
        </h2>
        <ol className="board-groups" aria-label={BOARD_CASES.title}>
          {overview.map((o) => (
            <SiteGroup
              key={o.site}
              o={o}
              cases={cases.filter((c) => c.site === o.site)}
              state={state}
              charts={charts.filter((c) => c.site === o.site)}
              onOpenRecords={openRecords}
            />
          ))}
        </ol>
        <p className="board-note">{BOARD_GROUPS.note}</p>
        <p className="board-note">{BOARD_CASES.note}</p>
        <p className="board-note">{BOARD_CASES.guide.replace("{days}", String(COVER_GUIDE_DAYS))}</p>
      </section>

      <BoardMap overview={overview} />

      <section aria-labelledby="board-demo" className="board-demo">
        <h2 id="board-demo">{BOARD_DEMO.title}</h2>
        <p className="board-note">{BOARD_DEMO.note}</p>
        <div className="board-demo-controls">
          <span className="board-demo-clock">
            {BOARD_DEMO.clock} <b data-testid="demo-clock-main">{clockText(state.minutes)}</b>
          </span>
          {noAuto ? (
            <span className="board-note">{BOARD_DEMO.reducedMotion}</span>
          ) : (
            <button type="button" className="secondary" onClick={() => dispatch({ type: "run", running: !state.running })}>
              {state.running ? BOARD_DEMO.stop : BOARD_DEMO.start}
            </button>
          )}
          <button type="button" className="secondary" onClick={() => dispatch({ type: "tick", hours: 1 })}>
            {BOARD_DEMO.hour}
          </button>
          <button type="button" className="secondary" onClick={() => dispatch({ type: "tick", hours: 24 })}>
            {BOARD_DEMO.day}
          </button>
          <button type="button" className="secondary" onClick={() => dispatch({ type: "reset" })}>
            {BOARD_DEMO.reset}
          </button>
        </div>
        <details className="board-more">
          <summary>
            <h3>{BOARD_INTAKE_FORM.title}</h3>
          </summary>
          <div className="board-more-body">
            <IntakeForm
              state={state}
              onAdd={(a) => {
                dispatch(a);
                setRecordsOpen(true);
              }}
            />
          </div>
        </details>
        <details className="board-more">
          <summary>
            <h3>
              {BOARD_DEMO.logTitle} <span className="board-count">{fmt.format(state.log.length)} 件</span>
            </h3>
          </summary>
          <div className="board-more-body">
            {state.log.length === 0 ? (
              <p className="board-note">{BOARD_DEMO.logEmpty}</p>
            ) : (
              <ul className="board-log">
                {state.log.map((l, i) => (
                  <li key={`${l.at}-${i}`}>
                    <span className="board-log-at">{clockText(l.at)}</span> {l.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>

      <section aria-label={BOARD_SECTIONS.today}>
        <div className="board-tiles">
          <div className="board-tile">
            <span className="board-tile-label">今日の患者（延べ・4か所）</span>
            <span className="board-tile-big" data-testid="today-patients">
              {fmt.format(today.patients)}
            </span>
            <span className="board-tile-sub">うち普段の薬の継続で来た人 {fmt.format(today.chronic)} 人</span>
          </div>
          <div className="board-tile">
            <span className="board-tile-label">在庫切れ・目安より早く切れる見込み</span>
            <span className="board-tile-big" data-testid="critical-count">
              {fmt.format(critical.length)}
            </span>
            <span className="board-tile-sub">
              救護所×品目の数。別に、未確認 {fmt.format(unknown.unconfirmed)}、見込み算出不可 {fmt.format(unknown.noPace)}
            </span>
          </div>
          <div className="board-tile">
            <span className="board-tile-label">本部で記録の形になっていないもの</span>
            <span className="board-tile-big" data-testid="pending-count">
              {fmt.format(pending.pending)}
            </span>
            <span className="board-tile-sub">
              未着 {fmt.format(pending.undelivered)}・転記待ち {fmt.format(pending.awaiting)}。通信なしの救護所 {fmt.format(pending.offlineSites)} か所
            </span>
          </div>
          <div className="board-tile">
            <span className="board-tile-label">入荷・融通の予定（受領済みを除く）</span>
            <span className="board-tile-big">{fmt.format(inbound.count)}</span>
            <span className="board-tile-sub">うち到着が未定のもの {fmt.format(inbound.undated)} 件</span>
          </div>
        </div>
      </section>

      <More id="board-intake" title={BOARD_RECORDS.title} note={BOARD_RECORDS.note} open={recordsOpen}>
        <div className="board-charts">
          {SHELTERS.map((site) => {
            const list = charts.filter((c) => c.site === site);
            return (
              <section key={site} className="board-charts-site" aria-labelledby={`board-charts-${site}`}>
                <h3 id={`board-charts-${site}`}>
                  {site}
                  {BOARD_RECORDS.perSite} <span className="board-count">{fmt.format(list.length)} {BOARD_RECORDS.count}</span>
                </h3>
                {list.length === 0 ? (
                  <p className="board-note">{BOARD_RECORDS.empty}</p>
                ) : (
                  <ul className="board-chart-list">
                    {list.map((c) => (
                      <ChartCard key={c.key} chart={c} open={c.key === latestAddedKey} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {/* 画像は制作者が用意する（SoapVox の録音中の画面）。届くまでは枠ごと出さない（Issue #101） */}
          {INTAKE_IMAGE.src !== "" && (
            <figure className="board-image">
              <img src={INTAKE_IMAGE.src} alt={INTAKE_IMAGE.caption} />
              <figcaption className="board-image-caption">{INTAKE_IMAGE.caption}</figcaption>
              <p className="board-image-caption">{INTAKE_IMAGE.qr}</p>
            </figure>
          )}
        </div>
      </More>

      <More id="board-sites" title={BOARD_SECTIONS.sites} note={BOARD_SECTIONS.sitesNote}>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>拠点</th>
                <th>稼働</th>
                <th className="num">薬剤師</th>
                <th>連絡先（架空）</th>
                <th>受け取りの窓口</th>
                <th>代わりの手段</th>
                <th>本部からの経路</th>
                <th>在庫を確認した時刻</th>
              </tr>
            </thead>
            <tbody>
              {SITES.map((s) => {
                const route = routeTo(s.site);
                return (
                  <tr key={s.site}>
                    <td>{s.site}</td>
                    <td>{s.status}</td>
                    <td className="num">{fmt.format(s.pharmacists)}</td>
                    <td>{s.phone}</td>
                    <td>{s.pickup}</td>
                    <td>{s.altMeans}</td>
                    <td>
                      {route ? (
                        <>
                          <Pill level={routeLevel(route.status)}>{route.status}</Pill> {route.via}
                          {route.minutes !== null && `（約${fmt.format(route.minutes)}分）`}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{mdhm(s.stockCheckedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </More>

      <More id="board-shelters" title={BOARD_SECTIONS.shelters} note={BOARD_SECTIONS.sheltersNote}>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>救護所</th>
                <th className="num">今日の患者（延べ）</th>
                <th className="num">避難者数</th>
                <th className="num">在庫でまかなえる日数</th>
                <th>在庫切れ・切れる見込みの薬</th>
                <th>記録の届き方</th>
                <th className="num">記録の形になっていないもの</th>
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
      </More>

      <More id="board-heat" title={BOARD_SECTIONS.heat} note={BOARD_SECTIONS.heatNote}>
        <div className="board-legend">
          <span>
            <span className="cell bad">{COVER_GUIDE_DAYS}日未満・切れ</span>
          </span>
          <span>
            <span className="cell warn">
              {COVER_GUIDE_DAYS}日以上{COVER_GUIDE_DAYS + 2}日未満
            </span>
          </span>
          <span>
            <span className="cell ok">{COVER_GUIDE_DAYS + 2}日以上</span>
          </span>
          <span>
            <span className="cell none">未確認・算出不可</span>
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
                    const c = heatCell(state.stock, site, item);
                    if (c === null) return <td key={site}>—</td>;
                    const onHand = c.onHand === null ? "在庫 未確認" : `在庫 ${fmt.format(Math.floor(c.onHand))} ${c.unit}`;
                    const pace =
                      site === HQ ? "出庫のペースなし" : c.dailyUse === null ? "1日の出庫 不明" : `1日の出庫 ${fmt.format(c.dailyUse)} ${c.unit}`;
                    return (
                      <td key={site}>
                        <span className={`cell ${c.level}`} title={`${site}：${item}。${onHand}、${pace}`}>
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
      </More>

      <More id="board-inbound" title={BOARD_SECTIONS.inbound} note={BOARD_SECTIONS.inboundNote}>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>種類</th>
                <th>薬（仮名）</th>
                <th>どこから</th>
                <th>どこへ</th>
                <th className="num">数量</th>
                <th>到着の見込み</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {state.inbound.map((r) => (
                <tr key={r.id}>
                  <td>{inboundKind(r)}</td>
                  <td>{r.item}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td className="num">{fmt.format(r.qty)}</td>
                  <td>{r.eta === "未定" ? "未定" : md(r.eta)}</td>
                  <td>
                    <Pill
                      level={
                        r.status === "受領" || r.status === "確定" || r.status === "搬送中" || r.status === "引当済み"
                          ? "ok"
                          : r.eta === "未定"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {r.status}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="board-note">受領済みを除いた件数：{fmt.format(openInbound.length)}。照会中・到着未定の数量は、どの在庫にも足していない。</p>
      </More>

      <More id="board-demand" title={BOARD_SECTIONS.demand} note={BOARD_SECTIONS.demandNote}>
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
          <p className="board-note">点線：{COVER_GUIDE_DAYS}日の目安（この試作で仮に置いた値）。この見込みは架空データの開始時の値で、デモでは動かない。</p>
        </div>
      </More>

      <More id="board-trend" title={BOARD_SECTIONS.trend} note={BOARD_SECTIONS.trendNote}>
        <div className="board-chart">
          <Trend state={state} />
        </div>
      </More>

      <More id="board-sync" title={BOARD_SECTIONS.sync} note={BOARD_SECTIONS.syncNote}>
        <div className="board-tablebox">
          <table>
            <thead>
              <tr>
                <th>拠点</th>
                <th>記録と通信</th>
                <th>最後に記録が届いた時刻</th>
                <th className="num">記録の形になっていないもの</th>
                <th>内訳</th>
                <th>次の予定</th>
              </tr>
            </thead>
            <tbody>
              {state.sync.map((r) => (
                <tr key={r.site}>
                  <td>{r.site}</td>
                  <td>
                    <Pill level={r.mode === "オンライン" ? "ok" : r.mode === "紙で記録・通信なし" ? "bad" : "warn"}>{r.mode}</Pill>
                  </td>
                  <td>{mdhm(r.lastSync)}</td>
                  <td className="num">{fmt.format(r.pending)}</td>
                  <td>{r.pendingKind}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </More>

      <More id="board-about" title={BOARD_SECTIONS.about}>
        <p className="board-note">{BOARD_LEAD}</p>
        <ul>
          {BOARD_ABOUT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </More>

      <button type="button" className="secondary" onClick={onBack}>
        {BOARD_BACK_LABEL}
      </button>
    </section>
  );
}
