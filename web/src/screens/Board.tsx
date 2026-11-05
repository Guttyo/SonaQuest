import { useEffect, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import "../board/board.css";
import {
  COVER_GUIDE_DAYS,
  DEMAND,
  DISTRICTS,
  HQ,
  INTAKE_RECORDS,
  ITEMS,
  ITEM_FORMS,
  ROUTES,
  SHELTERS,
  SITES,
  STOCK,
  districtOf,
  inboundKind,
  routeTo,
  siteInfo,
  type SiteId,
} from "../board/data";
import {
  DEMO_SITES,
  chartUndelivered,
  chartsFor,
  clockText,
  demoReducer,
  initialDemo,
  nextFictionalName,
  patientsWithExtra,
  prescriptionTotals,
  proposalStage,
  changesSince,
  stampMinutes,
  type DemoAction,
  type DemoInbound,
  type DemoState,
  type OrderProposal,
  type PatientChart,
} from "../board/demo";
import {
  caseRows,
  criticalItems,
  daysLeft,
  heatCell,
  levelOf,
  pendingSummary,
  roundDays,
  shelterRows,
  siteOverview,
  stockStatus,
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
  BOARD_DEMO,
  BOARD_GROUPS,
  BOARD_INTAKE_FORM,
  BOARD_INTAKE_MODE,
  BOARD_LAYOUT,
  BOARD_LEAD,
  BOARD_MOCK_BADGE,
  BOARD_ORDERS,
  BOARD_CHANGES,
  BOARD_LEAD_TILE,
  BOARD_OVERVIEW,
  BOARD_RECORDS,
  BOARD_SECTIONS,
  BOARD_SUBTITLE,
  BOARD_TILES,
  BOARD_TITLE,
  INTAKE_IMAGE,
} from "../board/text";
import { BoardMap } from "./BoardMap";

/** 上部タブ（Issue #107） */
export type BoardTab = "overview" | "stock" | "supply" | "records" | "demo";
const TABS: readonly BoardTab[] = ["overview", "stock", "supply", "records", "demo"];

interface Props {
  onBack: () => void;
  /** 試験・見本のため。省くと自動進行の判定にブラウザの設定を使う */
  reducedMotion?: boolean;
  /** 最初に選ぶ拠点とタブ（試験のため。DOM の無い試験で画面の切り替えを確かめる）。省くと本部・全体 */
  initialSite?: SiteId;
  initialTab?: BoardTab;
  /** 最初のデモの状態（試験のため） */
  initialState?: DemoState;
  /** 最初からカルテ入力の専用画面で開く（initialSite の救護所。URL の ?view=intake&site=…。Issue #114） */
  initialIntake?: boolean;
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

function Pill({ level, children }: { level: "bad" | "warn" | "ok" | "none"; children: ReactNode }) {
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

/**
 * 状態の札の中身。在庫切れ見込みは「あと2.1日」だけを見せて折り返さないようにし、読み上げには状態の名前を添える（Issue #113）
 */
function StatusText({ c }: { c: CaseRow }) {
  if (c.status === "在庫切れ見込み" && c.days !== null) {
    return (
      <>
        <span className="visually-hidden">{BOARD_CASES.forecastPrefix}</span>
        {BOARD_CASES.daysLeft(roundDays(c.days))}
      </>
    );
  }
  return <>{c.status}</>;
}

/**
 * 本部の全体の「確認・手配が必要な事項」の1行（Issue #113）。並びは caseRows の業務のルールのまま（臨床の緊急度を表さない）。
 * 「現在の状況」「次の確認」は、在庫・入荷・提案・最終報告の既存の状態から固定文だけで組み立てる。Claude は使わない
 */
function ActionRow({ c, state, onSelect }: { c: CaseRow; state: DemoState; onSelect: (site: SiteId) => void }) {
  const info = siteInfo(c.site);
  const proposal = state.proposals.find((p) => p.site === c.site && p.item === c.item);
  return (
    <tr data-case={`${c.site}|${c.item}`}>
      <td className="board-action-site">
        <span className="board-action-k" aria-hidden="true">{BOARD_CASES.table.site}</span>
        <button type="button" className="board-link" onClick={() => onSelect(c.site)} aria-label={`${c.site}${BOARD_LAYOUT.openSite}`}>
          {c.site}
        </button>
        <StaleMark state={state} site={c.site} />
      </td>
      <td>
        <span className="board-action-k" aria-hidden="true">{BOARD_CASES.table.what}</span>
        <Pill level={statusLevel(c.status)}>
          <StatusText c={c} />
        </Pill>{" "}
        <span className="board-action-item">
          {c.item}
          <span className="board-case-form">（{ITEM_FORMS[c.item] ?? "—"}）</span>
        </span>
      </td>
      <td className="board-action-now">
        <span className="board-action-k" aria-hidden="true">{BOARD_CASES.table.now}</span>
        <span>
          {BOARD_CASES.cols.onHand} {qty(c.onHand, c.unit)}・{BOARD_CASES.cols.hq} {c.hqOnHand === null ? "—" : qty(c.hqOnHand, c.unit)}
        </span>
        <span>
          {BOARD_CASES.cols.supply}：{c.supply}
        </span>
        {proposal && (
          <span>
            {BOARD_CASES.proposal}：{proposal.status === "提案" ? BOARD_CASES.awaiting : proposalStage(proposal, state.inbound)}
          </span>
        )}
        {c.status === "未確認" && info && (
          <span>
            {BOARD_CASES.stockCheckedAt}：{mdhm(info.stockCheckedAt)}
          </span>
        )}
      </td>
      <td>
        <span className="board-action-k" aria-hidden="true">{BOARD_CASES.table.next}</span>
        {c.next}
      </td>
    </tr>
  );
}

/** 品目の1行（2タップ目）。一覧の行（summary）と、開いたときの連絡に要るもの */
function CaseItem({ c, state }: { c: CaseRow; state: DemoState }) {
  const info = siteInfo(c.site);
  const route = routeTo(c.site);
  const sync = state.sync.find((s) => s.site === c.site);
  const offline = sync?.mode === "紙で記録・通信なし";
  const start = STOCK.find((s) => s.site === c.site && s.item === c.item)?.onHand ?? null;
  const changed = start !== null && c.onHand !== null && Math.floor(start) !== Math.floor(c.onHand);
  return (
    <li className="board-case">
      <details>
        <summary>
          <span className="board-case-row">
            <span className="board-case-status">
              <Pill level={statusLevel(c.status)}>
                <StatusText c={c} />
              </Pill>
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


/**
 * 架空の問診の入力（カルテに登録する。デモ）。送信先は無く、reducer に渡すだけ。
 * fixedSite を渡すと救護所を選ぶ欄を出さない（救護所の「記録（カルテ）」のタブ）
 */
function IntakeForm({
  state,
  onAdd,
  fixedSite,
  defaultSite,
  onGoSupply,
}: {
  state: DemoState;
  onAdd: (a: DemoAction) => void;
  fixedSite?: SiteId;
  defaultSite?: SiteId;
  onGoSupply?: () => void;
}) {
  const [chosen, setChosen] = useState<SiteId>(defaultSite ?? DEMO_SITES[0]);
  const site = fixedSite ?? chosen;
  const [name, setName] = useState(() => nextFictionalName(state.records.length));
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
        {fixedSite === undefined && (
          <label>
            <span>{BOARD_INTAKE_FORM.site}</span>
            <select value={site} onChange={(e) => setChosen(e.target.value as SiteId)}>
              {DEMO_SITES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
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
      {message !== "" && onGoSupply && (
        <button type="button" className="secondary" onClick={onGoSupply}>
          {BOARD_ORDERS.goSupply}
        </button>
      )}
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

const siteName = (site: SiteId) => (site === HQ ? BOARD_LAYOUT.hq : site);

/** 発注の提案の状態の色 */
function stageLevel(stage: string): "bad" | "warn" | "ok" | "none" {
  if (stage === "提案") return "warn";
  if (stage === "卸に照会中" || stage === "一部受領・卸に照会中") return "bad";
  if (stage === "受領") return "none";
  return "ok";
}

/** 入荷・搬送の状態の色（照会中・到着未定は赤、融通の調整中は黄） */
function inboundLevel(r: DemoInbound): "bad" | "warn" | "ok" {
  if (r.status === "受領" || r.status === "確定" || r.status === "搬送中" || r.status === "引当済み") return "ok";
  return r.eta === "未定" ? "bad" : "warn";
}

/**
 * 発注の提案の一覧（Issue #107）。数量の算数の内訳を並べ、承認・却下は本部の画面だけで押せる。
 * 承認済みは、搬送の状態（引当済み → 搬送中 → 受領）を出す
 */
function ProposalList({
  state,
  proposals,
  canDecide,
  dispatch,
  showSite = true,
}: {
  state: DemoState;
  proposals: readonly OrderProposal[];
  canDecide: boolean;
  dispatch: (a: DemoAction) => void;
  showSite?: boolean;
}) {
  if (proposals.length === 0) return <p className="board-note">{BOARD_ORDERS.empty}</p>;
  return (
    <ol className="board-orders">
      {proposals.map((p) => {
        const stage = proposalStage(p, state.inbound);
        const isNew = p.status === "提案" && p.createdRev > 0 && p.createdRev === state.rev;
        const isUpdated = !isNew && p.status === "提案" && p.rev > 0 && p.rev === state.rev;
        const b = p.basis;
        const fromCharts = chartUndelivered(state.records, p.site, p.item);
        return (
          <li key={p.id} className={`board-order ${p.status === "提案" ? "pending" : "approved"}`} data-proposal={p.id}>
            <div className="board-order-head">
              <span className="board-record-id">{p.id}</span>
              {isNew && <span className="board-new">{BOARD_ORDERS.newMark}</span>}
              {isUpdated && <span className="board-new">{BOARD_ORDERS.updatedMark}</span>}
              {showSite && <b>{p.site}</b>}
              <span className="board-order-item">
                {p.item}
                <span className="board-case-form">（{ITEM_FORMS[p.item] ?? "—"}）</span>
              </span>
              <span className="board-order-qty">
                {fmt.format(p.qty)}
                {p.unit}
              </span>
              <Pill level={stageLevel(stage)}>{stage}</Pill>
            </div>
            <p className="board-order-split">
              {BOARD_ORDERS.fromHq} {fmt.format(p.fromHq)}
              {p.unit}・{BOARD_ORDERS.fromVendor} {fmt.format(p.fromVendor)}
              {p.unit}
            </p>
            <details className="board-order-basis-box">
              <summary>{BOARD_ORDERS.basisToggle}</summary>
            <p className="board-order-basis">
              {BOARD_ORDERS.basisNeed} {fmt.format(b.need)}
              {fromCharts > 0 && `（${BOARD_INTAKE_MODE.basisFromCharts} ${fmt.format(fromCharts)}）`} ＋ {b.cover === null ? BOARD_ORDERS.basisCoverUnknown : `${BOARD_ORDERS.basisCover} ${fmt.format(b.cover)}`} −{" "}
              {BOARD_ORDERS.basisOnHand} {fmt.format(Math.floor(b.onHand))} − {BOARD_ORDERS.basisIncoming} {fmt.format(b.incoming)} ＝ {fmt.format(p.qty)}
              {p.unit}
            </p>
            </details>
            {p.status === "提案" && canDecide && (
              <div className="board-order-actions">
                <button type="button" className="board-approve" onClick={() => dispatch({ type: "approve_proposal", id: p.id })}>
                  {BOARD_ORDERS.approve}
                </button>
                <button type="button" className="secondary" onClick={() => dispatch({ type: "reject_proposal", id: p.id })}>
                  {BOARD_ORDERS.reject}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** 入荷・搬送の表。rows を絞って救護所の画面でも使う */
function InboundTable({ rows }: { rows: readonly DemoInbound[] }) {
  if (rows.length === 0) return <p className="board-note">{BOARD_CASES.detail.none}</p>;
  return (
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
          {rows.map((r) => (
            <tr key={r.id} data-inbound={r.id}>
              <td>
                {inboundKind(r)}
                {r.forSite && `（${r.forSite} 向け）`}
              </td>
              <td>{r.item}</td>
              <td>{r.from}</td>
              <td>{r.to}</td>
              <td className="num">{fmt.format(r.qty)}</td>
              <td>{r.arriveAt !== undefined ? clockText(r.arriveAt) : r.eta === "未定" ? "未定" : md(r.eta)}</td>
              <td>
                <Pill level={inboundLevel(r)}>{r.status}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 左のペインの1行に付ける短い印 */
function PaneMarks({ marks }: { marks: { text: string; level: "bad" | "warn" | "none" }[] }) {
  if (marks.length === 0) return null;
  return (
    <span className="board-pane-marks">
      {marks.map((m) => (
        <span key={m.text} className={`board-pane-mark ${m.level}`}>
          {m.text}
        </span>
      ))}
    </span>
  );
}

/** 救護所の詳細（Issue #107）：今日の様子、不足薬、連絡先、経路、通信、提案、カルテ */
/** 最終報告（Issue #107）：在庫の確認か、記録が本部に届いた、新しいほうの時刻（BOARD_AS_OF からの分）。無ければ null */
export function lastReportMinutes(state: DemoState, site: SiteId): number | null {
  const times: number[] = [];
  const checked = siteInfo(site)?.stockCheckedAt;
  if (checked) times.push(stampMinutes(checked));
  const synced = state.sync.find((s) => s.site === site)?.lastSync;
  if (synced) times.push(stampMinutes(synced));
  return times.length > 0 ? Math.max(...times) : null;
}

/** 「最終報告 3 時間前」の時間の部分。デモの時計が進むと増える */
function lastReportText(state: DemoState, site: SiteId): string {
  const at = lastReportMinutes(state, site);
  return at === null ? "—" : BOARD_CHANGES.ago(Math.max(0, state.minutes - at));
}

/**
 * 最終報告が、この試作で仮に置いた時間（BOARD_CHANGES.staleHours）より古いか（Issue #113）。
 * 業務の表示のルールで、臨床の緊急度やその救護所の状況の良し悪しは表さない。報告の時刻が無いときは付けない
 */
export function isStaleReport(state: DemoState, site: SiteId): boolean {
  const at = lastReportMinutes(state, site);
  return at !== null && state.minutes - at >= BOARD_CHANGES.staleHours * 60;
}

/** 最終報告の注意の印（色だけに頼らず文字を付ける） */
function StaleMark({ state, site }: { state: DemoState; site: SiteId }) {
  if (!isStaleReport(state, site)) return null;
  return <span className="board-stale">{BOARD_CHANGES.stale(BOARD_CHANGES.staleHours)}</span>;
}

/** 画面の見方の説明。ふだんは閉じておく（Issue #113：説明文をヘルプの開閉へ） */
function Help({ children }: { children: ReactNode }) {
  return (
    <details className="board-help">
      <summary>{BOARD_CASES.help}</summary>
      <div className="board-help-body">{children}</div>
    </details>
  );
}

/** 「前回から変わったこと」の1行（Issue #107）。デモの記録の件数をルールで並べるだけ（氏名・品目名・数量は入れない） */
export function changeLineText(state: DemoState, site?: SiteId): string {
  const counts = changesSince(state.log, site);
  const since = clockText(0).slice(6);
  const parts = BOARD_CHANGES.kinds
    .filter((k) => counts[k.kind] > 0)
    .map((k) => `${k.name} ${k.kind === "未交付" ? "+" : ""}${fmt.format(counts[k.kind])} 件`);
  return parts.length === 0 ? BOARD_CHANGES.none(since) : `${BOARD_CHANGES.since(since)}${parts.join(BOARD_CHANGES.sep)}`;
}

/** カルテの処方の累計の表（Issue #114）。人が入れた数量を足しただけで、量の妥当性は判断しない */
function PrescriptionTotals({ state, site, headingId }: { state: DemoState; site: SiteId; headingId: string }) {
  const totals = prescriptionTotals(state.records, site);
  return (
    <section aria-labelledby={headingId} className="board-rx-totals">
      <h3 id={headingId}>
        {BOARD_INTAKE_MODE.totalsTitle} <span className="board-count">{fmt.format(totals.length)} 品目</span>
      </h3>
      {totals.length === 0 ? (
        <p className="board-note">{BOARD_INTAKE_MODE.totalsEmpty}</p>
      ) : (
        <div className="board-tablebox">
          <table data-testid="rx-totals">
            <thead>
              <tr>
                <th>{BOARD_INTAKE_MODE.colItem}</th>
                <th className="num">{BOARD_INTAKE_MODE.colPrescribed}</th>
                <th className="num">{BOARD_INTAKE_MODE.colDelivered}</th>
                <th className="num">{BOARD_INTAKE_MODE.colUndelivered}</th>
                <th className="num">{BOARD_INTAKE_MODE.colCount}</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.item}>
                  <td>{t.item}</td>
                  <td className="num">{`${fmt.format(t.prescribed)}${t.unit}`}</td>
                  <td className="num">{`${fmt.format(t.delivered)}${t.unit}`}</td>
                  <td className="num">
                    {t.undelivered > 0 ? <Pill level="bad">{`${fmt.format(t.undelivered)}${t.unit}`}</Pill> : `0${t.unit}`}
                  </td>
                  <td className="num">{fmt.format(t.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="board-note">{BOARD_INTAKE_MODE.totalsNote}</p>
    </section>
  );
}

function SiteDetail({
  site,
  state,
  overview,
  cases,
  charts,
  latestAddedKey,
  dispatch,
}: {
  site: SiteId;
  state: DemoState;
  overview: SiteOverview | undefined;
  cases: CaseRow[];
  charts: PatientChart[];
  latestAddedKey: string | null;
  dispatch: (a: DemoAction) => void;
}) {
  const info = siteInfo(site);
  const route = routeTo(site);
  const sync = state.sync.find((s) => s.site === site);
  const patients = patientsWithExtra(state);
  const date = todaySummary(patients).date;
  const today = patients.find((r) => r.date === date && r.site === site);
  const demand = DEMAND.find((d) => d.site === site);
  const proposals = state.proposals.filter((p) => p.site === site);
  return (
    <div className="board-detail">
      <section aria-labelledby="board-detail-stats">
        <h3 id="board-detail-stats">{BOARD_LAYOUT.detail.stats}</h3>
        <dl className="board-stats">
          <div>
            <dt>{BOARD_LAYOUT.detail.patients}</dt>
            <dd data-testid="site-patients">{today ? `${fmt.format(today.patients)} 人` : "—"}</dd>
          </div>
          <div>
            <dt>{BOARD_LAYOUT.detail.chronic}</dt>
            <dd>{today ? `${fmt.format(today.chronic)} 人` : "—"}</dd>
          </div>
          <div>
            <dt>{BOARD_OVERVIEW.pharmacists}</dt>
            <dd>
              {info ? `${fmt.format(info.pharmacists)} 人` : "—"}
              {/* 職種は残し、目立たせ方は抑える（赤にしない。2026-11-05 オーナー決定） */}
              {overview && overview.pharmacistsShort > 0 && <Pill level="none">{BOARD_LAYOUT.marks.pharmacistsShort(overview.pharmacistsShort)}</Pill>}
            </dd>
          </div>
          <div className={overview && overview.outOfStock > 0 ? "short" : ""}>
            <dt>{BOARD_OVERVIEW.outOfStock}</dt>
            <dd>{fmt.format(overview?.outOfStock ?? 0)}</dd>
          </div>
          <div>
            <dt>{BOARD_OVERVIEW.forecast}</dt>
            <dd>{fmt.format(overview?.forecast ?? 0)}</dd>
          </div>
          <div>
            <dt>{BOARD_LAYOUT.detail.evacuees}</dt>
            <dd>{demand ? `${fmt.format(demand.evacuees)} 人` : "—"}</dd>
          </div>
          <div className={isStaleReport(state, site) ? "stale" : ""}>
            <dt>{BOARD_CHANGES.lastReport}</dt>
            <dd>
              <span data-testid="site-last-report">{lastReportText(state, site)}</span>
              <StaleMark state={state} site={site} />
            </dd>
          </div>
        </dl>
        {/* 情報の鮮度を3つに分けて出す（Issue #113）：在庫の確認・記録が本部に届いた・経路の確認 */}
        <dl className="board-times" aria-label={BOARD_LAYOUT.detail.times}>
          <div>
            <dt>{BOARD_LAYOUT.detail.stockChecked}</dt>
            <dd data-testid="time-stock">{info ? mdhm(info.stockCheckedAt) : "—"}</dd>
          </div>
          <div>
            <dt>{BOARD_LAYOUT.detail.recordArrived}</dt>
            <dd data-testid="time-record">{sync ? mdhm(sync.lastSync) : "—"}</dd>
          </div>
          <div>
            <dt>{BOARD_LAYOUT.detail.routeChecked}</dt>
            <dd data-testid="time-route">{route ? mdhm(route.checkedAt) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="board-detail-shortage">
        <h3 id="board-detail-shortage">
          {BOARD_LAYOUT.detail.shortage} <span className="board-count">{fmt.format(cases.length)} 件</span>
        </h3>
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
            <ol className="board-cases" aria-label={`${site} の${BOARD_LAYOUT.detail.shortage}`}>
              {cases.map((c) => (
                <CaseItem key={`${c.site}-${c.item}`} c={c} state={state} />
              ))}
            </ol>
          </>
        )}
        <Help>
          <p className="board-note">{BOARD_LAYOUT.detail.shortageNote}</p>
          <p className="board-note">{BOARD_CHANGES.lastReportNote}</p>
          <p className="board-note">{BOARD_CHANGES.staleNote(BOARD_CHANGES.staleHours)}</p>
        </Help>
      </section>

      <div className="board-detail-cols">
        <section aria-labelledby="board-detail-contact">
          <h3 id="board-detail-contact">{BOARD_LAYOUT.detail.contact}</h3>
          {info && (
            <dl className="board-dl">
              <div>
                <dt>{BOARD_CASES.detail.contact}</dt>
                <dd>{info.phone}</dd>
              </div>
              <div>
                <dt>{BOARD_CASES.detail.pickup}</dt>
                <dd>
                  {info.pickup}（{info.status}）
                </dd>
              </div>
              <div>
                <dt>{BOARD_CASES.detail.alt}</dt>
                <dd>{info.altMeans}</dd>
              </div>
            </dl>
          )}
        </section>
        <section aria-labelledby="board-detail-route">
          <h3 id="board-detail-route">{BOARD_LAYOUT.detail.route}</h3>
          {route && (
            <p className="board-route">
              <Pill level={routeLevel(route.status)}>{route.status}</Pill> {route.via}
              {route.minutes !== null && `（約${fmt.format(route.minutes)}分）`}。確認 {mdhm(route.checkedAt)}
            </p>
          )}
          <h3>{BOARD_LAYOUT.detail.comms}</h3>
          {sync && (
            <dl className="board-dl">
              <div>
                <dt>{BOARD_CASES.detail.comms}</dt>
                <dd>{sync.mode}</dd>
              </div>
              <div>
                <dt>{BOARD_CASES.detail.lastReport}</dt>
                <dd>{mdhm(sync.lastSync)}</dd>
              </div>
              <div>
                <dt>{BOARD_OVERVIEW.pending}</dt>
                <dd>
                  {fmt.format(sync.pending)} 件（{sync.pendingKind}）
                </dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <PrescriptionTotals state={state} site={site} headingId="board-detail-rx" />

      <section aria-labelledby="board-detail-orders">
        <h3 id="board-detail-orders">
          {BOARD_ORDERS.title} <span className="board-count">{fmt.format(proposals.length)} {BOARD_ORDERS.count}</span>
        </h3>
        <ProposalList state={state} proposals={proposals} canDecide={false} dispatch={dispatch} showSite={false} />
        {proposals.some((p) => p.status === "提案") && <p className="board-note">{BOARD_ORDERS.approveOnlyHq}</p>}
      </section>

      <section aria-labelledby="board-detail-charts" id="board-intake">
        <h3 id="board-detail-charts">
          {BOARD_LAYOUT.detail.charts} <span className="board-count">{fmt.format(charts.length)} {BOARD_RECORDS.count}</span>
        </h3>
        <p className="board-note">{BOARD_RECORDS.note}</p>
        {charts.length === 0 ? (
          <p className="board-note">{BOARD_RECORDS.empty}</p>
        ) : (
          <ul className="board-chart-list">
            {charts.map((c) => (
              <ChartCard key={c.key} chart={c} open={c.key === latestAddedKey} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * 地域本部のボード（Issue #97、#101、#102、#105、#107、ADR-0042・ADR-0043）。
 * 左のペインに本部（HQ）→ 地区 → 救護所、右のメインに上部タブ（全体・在庫・発注・搬送・記録・デモ）。
 * 架空データ（web/src/board/data.ts）から始め、デモの reducer（demo.ts）でメモリの中だけ動かす。Claude も API も保存も使わない。
 * 焦点は App の画面遷移の処理（[data-scroll-target]）に任せる
 */
export function Board({ onBack, reducedMotion, initialSite = HQ, initialTab = "overview", initialState, initialIntake = false }: Props) {
  const [state, dispatch] = useReducer(demoReducer, initialState, (s) => s ?? initialDemo());
  const [selected, setSelected] = useState<SiteId>(initialSite);
  // カルテ入力の専用画面で開いている救護所（Issue #114）。開いているあいだはボード全体をこの画面にする
  const startIntake = initialIntake && initialSite !== HQ ? initialSite : null;
  const [intake, setIntake] = useState<SiteId | null>(startIntake);
  const [tab, setTab] = useState<BoardTab>(startIntake !== null ? "records" : initialTab);
  const panelRef = useRef<HTMLDivElement>(null);
  const intakeTitleRef = useRef<HTMLHeadingElement>(null);
  const intakeOpenRef = useRef<HTMLButtonElement>(null);
  const prevIntake = useRef<SiteId | null>(startIntake);
  const noAuto = reducedMotion ?? prefersReducedMotion();

  // 自動進行：2秒で架空の1時間。止めるか、画面を離れると止まる
  useEffect(() => {
    if (!state.running || noAuto) return;
    const id = window.setInterval(() => dispatch({ type: "tick", hours: 1 }), 2000);
    return () => window.clearInterval(id);
  }, [state.running, noAuto]);

  // 拠点・タブを切り替えたら、メインの枠の先頭から見せる
  useEffect(() => {
    panelRef.current?.scrollTo?.({ top: 0 });
  }, [selected, tab]);

  // 専用画面に入ったら題へ、戻ったら「カルテを入力する」のボタンへ焦点を移す（最初の表示は App の処理に任せる）
  useEffect(() => {
    if (prevIntake.current === intake) return;
    prevIntake.current = intake;
    window.scrollTo?.({ top: 0 });
    if (intake !== null) intakeTitleRef.current?.focus();
    else (intakeOpenRef.current ?? panelRef.current)?.focus();
  }, [intake]);

  const isHq = selected === HQ;
  const patients = patientsWithExtra(state);
  const today = todaySummary(patients);
  const critical = criticalItems(state.stock);
  const unknown = unknownCounts(state.stock);
  const pending = pendingSummary(state.sync);
  const cases = caseRows(state.stock, state.inbound, state.needs, SITES, state.sync);
  const rows = shelterRows(state.stock, patients, state.sync, DEMAND);
  const overview = siteOverview(state.stock, patients, SITES, state.sync, ROUTES);
  const charts = chartsFor(state, INTAKE_RECORDS);
  const latestAddedKey = state.records.length > 0 ? `${state.records[0].site}|${state.records[0].name}` : null;
  const pendingProposals = state.proposals.filter((p) => p.status === "提案");
  const sites: SiteId[] = [...SHELTERS, HQ];
  const maxDays = Math.max(COVER_GUIDE_DAYS, ...DEMAND.map((d) => d.daysCovered)) * 1.15;

  function select(site: SiteId) {
    setSelected(site);
  }
  function goSupplyHq() {
    setIntake(null);
    setSelected(HQ);
    setTab("supply");
  }
  function openIntake(site: SiteId) {
    setSelected(site);
    setTab("records");
    setIntake(site);
  }

  // 印の並びは固定のルール（在庫切れ → 未交付 → 記録の未着・転記待ち → 人員）。先頭の2つだけを出し、残りは「ほか N 件」（Issue #113）
  const marksFor = (site: SiteId) => {
    const o = overview.find((x) => x.site === site);
    const m: { text: string; level: "bad" | "warn" | "none" }[] = [];
    if (!o) return m;
    if (o.outOfStock > 0) m.push({ text: `${BOARD_LAYOUT.marks.outOfStock} ${fmt.format(o.outOfStock)}`, level: "bad" });
    if (charts.some((c) => c.site === site && c.undelivered > 0)) m.push({ text: BOARD_LAYOUT.marks.undelivered, level: "bad" });
    if (o.pending !== null && o.pending > 0) m.push({ text: BOARD_LAYOUT.marks.pending(o.pending), level: "warn" });
    if (o.pharmacistsShort > 0) m.push({ text: BOARD_LAYOUT.marks.pharmacistsShort(o.pharmacistsShort), level: "none" });
    const max = BOARD_LAYOUT.marks.max;
    return m.length <= max ? m : [...m.slice(0, max), { text: BOARD_LAYOUT.marks.more(m.length - max), level: "none" as const }];
  };
  const staleSites = SHELTERS.filter((s) => isStaleReport(state, s));

  // 不足が出ている救護所の数（在庫切れ・切れる見込み・薬剤師の不足のどれかがある。siteOverview からの算数だけ）
  const sitesShort = overview.filter((o) => o.outOfStock > 0 || o.forecast > 0 || o.pharmacistsShort > 0).length;

  // 救護所の「詳細」のタブでは、題の横に同じ「詳細」を重ねない（Issue #113）
  const showPanelTab = tab !== "overview";
  // 「前回から変わったこと」が空のときは小さな補助表示にする（更新が無いことと、問題が無いことを分ける。Issue #113）
  const changeLine = changeLineText(state, isHq ? undefined : selected);
  const changesEmpty = changeLine === BOARD_CHANGES.none(clockText(0).slice(6));
  const tabLabel = (t: BoardTab) => (t === "overview" && !isHq ? BOARD_LAYOUT.siteTabs.overview : BOARD_LAYOUT.tabs[t]);

  const siteStock = state.stock.filter((r) => r.site === selected);
  const siteInbound = state.inbound.filter((r) => r.to === selected || r.from === selected || r.forSite === selected);

  if (intake !== null) {
    const siteCharts = charts.filter((c) => c.site === intake);
    const back = (
      <button type="button" className="secondary board-intake-back" onClick={() => setIntake(null)}>
        {BOARD_INTAKE_MODE.back}
      </button>
    );
    return (
      <section className="screen board board-intake-screen" aria-labelledby="board-intake-title" data-intake={intake}>
        <header className="board-intake-head">
          {back}
          <h1 id="board-intake-title" data-scroll-target tabIndex={-1} ref={intakeTitleRef}>
            {intake}
            <span className="board-intake-title-sub">{BOARD_INTAKE_MODE.title}</span>
          </h1>
          <p className="board-asof">
            <span className="board-badge">{BOARD_MOCK_BADGE}</span>
            {districtOf(intake) && <span>{districtOf(intake)?.name}</span>}
            <span>
              {BOARD_DEMO.clock} <b data-testid="demo-clock">{clockText(state.minutes)}</b>
            </span>
          </p>
        </header>
        <div className="board-intake-body">
          <IntakeForm key={intake} state={state} onAdd={dispatch} fixedSite={intake} onGoSupply={goSupplyHq} />
          <PrescriptionTotals state={state} site={intake} headingId="board-intake-rx" />
          <p className="board-note" data-testid="intake-chart-count">
            {BOARD_INTAKE_MODE.count} {fmt.format(siteCharts.length)} {BOARD_RECORDS.count}
          </p>
          {back}
        </div>
      </section>
    );
  }

  return (
    <section className="screen board" aria-labelledby="board-title">
      <header className="board-head">
        <div className="board-head-title">
          <h1 id="board-title" data-scroll-target tabIndex={-1}>
            {BOARD_TITLE}
          </h1>
          <span className="board-subtitle">{BOARD_SUBTITLE}</span>
        </div>
        {/* 集計時点と架空の時刻は1つにまとめる（Issue #113）。デモの時計の表示と「架空データ」の印は常に見せる */}
        <p className="board-asof">
          <span className="board-badge">{BOARD_MOCK_BADGE}</span>
          <span>
            {BOARD_DEMO.asOf} <b data-testid="demo-clock">{clockText(state.minutes)}</b>
          </span>
        </p>
        <button type="button" className="secondary board-back" onClick={onBack}>
          {BOARD_BACK_LABEL}
        </button>
        {/* 時間を進める操作は消さずに「デモ操作」にたたむ。ふだんは閉じておく（2026-11-05 オーナー決定） */}
        <details className="board-demo-box">
          <summary>
            {BOARD_DEMO.controls}
            {state.running && <span className="board-demo-running">{BOARD_DEMO.stop}</span>}
          </summary>
        <div className="board-demo-controls" aria-label={BOARD_DEMO.title} role="group">
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
        </details>
      </header>

      <div className="board-body">
        {/* 狭い幅（スマホ）では、左のペインの横スクロールの代わりに選択式で拠点を選ぶ（Issue #113）。CSS で出し分ける */}
        <label className="board-pane-select">
          <span>{BOARD_LAYOUT.paneSelect}</span>
          <select value={selected} onChange={(e) => select(e.target.value as SiteId)}>
            <option value={HQ}>{BOARD_LAYOUT.hq}</option>
            {DISTRICTS.map((d) => (
              <optgroup key={d.id} label={d.name}>
                {d.sites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {isStaleReport(state, s) ? `（${BOARD_CHANGES.stale(BOARD_CHANGES.staleHours)}）` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <nav className="board-pane" aria-label={BOARD_LAYOUT.paneLabel}>
          <button
            type="button"
            className={`board-pane-item hq${isHq ? " current" : ""}`}
            aria-current={isHq ? "true" : undefined}
            data-pane={HQ}
            onClick={() => select(HQ)}
          >
            <span className="board-pane-name">{BOARD_LAYOUT.hq}</span>
            <span className="board-pane-sub">{BOARD_LAYOUT.hqSub}</span>
            <PaneMarks
              marks={pendingProposals.length > 0 ? [{ text: `${BOARD_LAYOUT.marks.proposals} ${fmt.format(pendingProposals.length)}`, level: "warn" }] : []}
            />
          </button>
          {DISTRICTS.map((d) => (
            <details key={d.id} className="board-pane-district" open>
              <summary className="board-pane-district-name" id={`board-district-${d.id}`}>
                {d.name}
              </summary>
              <div className="board-pane-district-sites">
                {d.sites.map((s) => {
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`board-pane-item${selected === s ? " current" : ""}${isStaleReport(state, s) ? " stale" : ""}`}
                      aria-current={selected === s ? "true" : undefined}
                      data-pane={s}
                      onClick={() => select(s)}
                    >
                      <span className="board-pane-name">{s}</span>
                      <span className="board-pane-sub board-pane-report" data-report={s}>
                        {BOARD_CHANGES.lastReport} {lastReportText(state, s)}
                        <StaleMark state={state} site={s} />
                      </span>
                      <PaneMarks marks={marksFor(s)} />
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </nav>

        <div className="board-main">
          <div className="board-tabs" role="tablist" aria-label={BOARD_LAYOUT.tabsLabel}>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`board-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="board-panel"
                className={`board-tab${tab === t ? " current" : ""}`}
                onClick={() => setTab(t)}
              >
                {tabLabel(t)}
                {t === "supply" && pendingProposals.length > 0 && <span className="board-tab-count">{fmt.format(pendingProposals.length)}</span>}
              </button>
            ))}
          </div>
          <p className={`board-changes${changesEmpty ? " empty" : ""}`} data-testid="board-changes">
            <span className="board-changes-label">{BOARD_CHANGES.label}</span>
            <span>{changeLine}</span>
          </p>

          <div className="board-panel" id="board-panel" role="tabpanel" aria-labelledby={`board-tab-${tab}`} ref={panelRef} tabIndex={-1}>
            {/* 本部の全体では題の行を見せない（左のペインとタブで分かる。オーナー「本部に限っては要らない」）。読み上げ用には残す */}
            <h2
              className={`board-panel-title${isHq && tab === "overview" ? " visually-hidden" : ""}`}
              id="board-panel-title"
              data-panel={`${selected}|${tab}`}
            >
              {siteName(selected)}
              {!isHq && districtOf(selected) && <span className="board-count">{districtOf(selected)?.name}</span>}
              {showPanelTab && <span className="board-panel-tab">{tabLabel(tab)}</span>}
            </h2>

            {/* 本部・全体（Issue #113）：見る順は 数字 → 確認・手配が必要な事項 → 地図。指標の札は上段に横一列 */}
            {isHq && tab === "overview" && (
              <>
                <section aria-label={BOARD_LAYOUT.hqSideLabel} className="board-kpis">
                  <div className="board-tiles board-kpi-row">
                    <div className="board-tile board-tile-lead">
                      <span className="board-tile-label">{BOARD_LEAD_TILE.label}</span>
                      <span className="board-tile-big" data-testid="sites-short">
                        {fmt.format(sitesShort)}
                        <span className="board-tile-of"> / {fmt.format(SHELTERS.length)} か所</span>
                      </span>
                      <span className="board-tile-sub">{BOARD_LEAD_TILE.sub}</span>
                    </div>
                    <div className="board-tile board-tile-major">
                      <span className="board-tile-label">{BOARD_TILES.critical}</span>
                      <span className="board-tile-big">
                        <span data-testid="critical-count">{fmt.format(critical.length)}</span>
                        <span className="board-tile-of"> {BOARD_TILES.criticalUnit}</span>
                      </span>
                      <span className="board-tile-sub" data-testid="critical-sum">
                        {BOARD_TILES.criticalSum(critical.length, unknown.unconfirmed, unknown.noPace, cases.length)}
                      </span>
                    </div>
                    <div className="board-tile">
                      <span className="board-tile-label">{BOARD_TILES.proposals}</span>
                      <span className="board-tile-big">
                        <span data-testid="proposal-count">{fmt.format(pendingProposals.length)}</span>
                        <span className="board-tile-of"> {BOARD_TILES.proposalsUnit}</span>
                      </span>
                      <span className="board-tile-sub">{BOARD_TILES.proposalsSub(state.proposals.length - pendingProposals.length)}</span>
                    </div>
                    <div className="board-tile">
                      <span className="board-tile-label">{BOARD_TILES.pending}</span>
                      <span className="board-tile-big">
                        <span data-testid="pending-count">{fmt.format(pending.pending)}</span>
                        <span className="board-tile-of"> {BOARD_TILES.pendingUnit}</span>
                      </span>
                      <span className="board-tile-sub">{BOARD_TILES.pendingSub(pending.undelivered, pending.awaiting)}</span>
                    </div>
                    <div className={`board-tile${staleSites.length > 0 ? " stale" : ""}`}>
                      <span className="board-tile-label">{BOARD_TILES.stale(BOARD_CHANGES.staleHours)}</span>
                      <span className="board-tile-big">
                        <span data-testid="stale-count">{fmt.format(staleSites.length)}</span>
                        <span className="board-tile-of"> {BOARD_TILES.staleUnit}</span>
                      </span>
                      <span className="board-tile-sub">
                        {staleSites.length === 0 ? BOARD_TILES.staleNone : staleSites.map((s) => `${s}（${lastReportText(state, s)}）`).join("、")}
                      </span>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="board-cases" className="board-actions">
                  <h3 id="board-cases">
                    {BOARD_CASES.title} <span className="board-count">{fmt.format(cases.length)} 件</span>
                  </h3>
                  {cases.length === 0 ? (
                    <p className="board-note">{BOARD_CASES.empty}</p>
                  ) : (
                    <div className="board-tablebox">
                      <table className="board-action-table" data-testid="action-table">
                        <caption className="visually-hidden">{BOARD_CASES.title}</caption>
                        <thead>
                          <tr>
                            <th>{BOARD_CASES.table.site}</th>
                            <th>{BOARD_CASES.table.what}</th>
                            <th>{BOARD_CASES.table.now}</th>
                            <th>{BOARD_CASES.table.next}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cases.map((c) => (
                            <ActionRow key={`${c.site}-${c.item}`} c={c} state={state} onSelect={select} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Help>
                    <p className="board-note">{BOARD_CASES.note}</p>
                    <p className="board-note">{BOARD_CASES.guide.replace("{days}", String(COVER_GUIDE_DAYS))}</p>
                    <p className="board-note">{BOARD_CHANGES.lastReportNote}</p>
                    <p className="board-note">{BOARD_CHANGES.staleNote(BOARD_CHANGES.staleHours)}</p>
                  </Help>
                </section>

                <section aria-labelledby="board-hq-orders">
                  <h3 id="board-hq-orders">
                    {BOARD_TILES.proposals} <span className="board-count">{fmt.format(pendingProposals.length)} {BOARD_ORDERS.count}</span>
                  </h3>
                  <ProposalList state={state} proposals={pendingProposals} canDecide dispatch={dispatch} />
                </section>

                <div className="board-overview-map">
                  <BoardMap overview={overview} onSelect={select} selected={selected} />
                  <p className="board-note">{BOARD_LAYOUT.mapHint}</p>
                </div>

                <section aria-labelledby="board-activity">
                  <h3 id="board-activity">{BOARD_TILES.activity}</h3>
                  <p className="board-activity-line" data-testid="today-activity">
                    {BOARD_TILES.activityLine(today.patients, today.chronic, DEMAND.reduce((a, d) => a + d.evacuees, 0))}
                  </p>
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
                          <th className="num">記録の未着・転記待ち（件）</th>
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

                <More id="board-trend" title={BOARD_SECTIONS.trend} note={BOARD_SECTIONS.trendNote}>
                  <div className="board-chart">
                    <Trend state={state} />
                  </div>
                </More>
                </section>
              </>
            )}

            {/* 救護所・詳細：不足薬、患者人数、連絡先、経路、カルテ */}
            {!isHq && tab === "overview" && (
              <SiteDetail
                site={selected}
                state={state}
                overview={overview.find((o) => o.site === selected)}
                cases={cases.filter((c) => c.site === selected)}
                charts={charts.filter((c) => c.site === selected)}
                latestAddedKey={latestAddedKey}
                dispatch={dispatch}
              />
            )}

            {/* 在庫 */}
            {isHq && tab === "stock" && (
              <>
                <p className="board-note">{BOARD_SECTIONS.heatNote}</p>
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
                <More id="board-demand" title={BOARD_SECTIONS.demand} note={BOARD_SECTIONS.demandNote}>
                  <div className="board-chart board-bars">
                    {DEMAND.map((d) => (
                      <div key={d.site} className="board-bar-row">
                        <span>{d.site}</span>
                        <span className="board-bar-track" title={`避難者 ${fmt.format(d.evacuees)} 人、1日に要る量の見込み ${fmt.format(d.dailyNeed)}`}>
                          <span className={`board-bar-fill ${d.daysCovered < COVER_GUIDE_DAYS ? "bad" : ""}`} style={{ width: `${(d.daysCovered / maxDays) * 100}%` }} />
                          <span className="board-bar-guide" style={{ left: `${(COVER_GUIDE_DAYS / maxDays) * 100}%` }} />
                        </span>
                        <span className="board-bar-value">{d.daysCovered} 日</span>
                      </div>
                    ))}
                    <p className="board-note">点線：{COVER_GUIDE_DAYS}日の目安（仮に置いた値）。この見込みは架空データの開始時の値で、デモでは動かない。</p>
                  </div>
                </More>
              </>
            )}
            {!isHq && tab === "stock" && (
              <>
                <p className="board-note">{BOARD_LAYOUT.siteStockNote}</p>
                <div className="board-tablebox">
                  <table>
                    <thead>
                      <tr>
                        <th>薬（仮名）</th>
                        <th className="num">現地の在庫</th>
                        <th className="num">1日の出庫</th>
                        <th className="num">残り日数</th>
                        <th>状態</th>
                        <th className="num">本部の在庫</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteStock.map((r) => {
                        const d = daysLeft(r);
                        const st = stockStatus(r);
                        const hq = state.stock.find((x) => x.site === HQ && x.item === r.item);
                        return (
                          <tr key={r.item}>
                            <td>
                              {r.item}
                              <span className="board-case-form">（{ITEM_FORMS[r.item] ?? "—"}）</span>
                            </td>
                            <td className="num">{qty(r.onHand, r.unit)}</td>
                            <td className="num">{r.dailyUse === null ? "不明" : `${fmt.format(r.dailyUse)}${r.unit}`}</td>
                            <td className="num">{d === null ? "—" : `${roundDays(d)} 日`}</td>
                            <td>
                              <Pill level={st === "在庫切れ" ? "bad" : st === "在庫切れ見込み" ? "warn" : st === "余裕あり" ? "ok" : "none"}>{st}</Pill>
                            </td>
                            <td className="num">{hq ? qty(hq.onHand, hq.unit) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* 発注・搬送 */}
            {tab === "supply" && (
              <>
                <section aria-labelledby="board-orders">
                  <h3 id="board-orders">
                    {BOARD_ORDERS.title}{" "}
                    <span className="board-count">
                      {BOARD_ORDERS.pending} {fmt.format((isHq ? pendingProposals : pendingProposals.filter((p) => p.site === selected)).length)} {BOARD_ORDERS.count}
                    </span>
                  </h3>
                  <p className="board-note">{BOARD_ORDERS.note}</p>
                  <ProposalList
                    state={state}
                    proposals={isHq ? state.proposals : state.proposals.filter((p) => p.site === selected)}
                    canDecide={isHq}
                    dispatch={dispatch}
                    showSite={isHq}
                  />
                  {!isHq && <p className="board-note">{BOARD_ORDERS.approveOnlyHq}</p>}
                  <p className="board-note">{BOARD_ORDERS.stageNote}</p>
                </section>
                <section aria-labelledby="board-inbound">
                  <h3 id="board-inbound">{BOARD_SECTIONS.inbound}</h3>
                  <p className="board-note">{BOARD_SECTIONS.inboundNote}</p>
                  <InboundTable rows={isHq ? state.inbound : siteInbound} />
                  <p className="board-note">照会中・到着未定の数量は、どの在庫にも足していない。</p>
                </section>
              </>
            )}

            {/* 記録（カルテ） */}
            {isHq && tab === "records" && (
              <>
                <section aria-labelledby="board-hq-charts">
                  <h3 id="board-hq-charts">{BOARD_LAYOUT.hqRecords}</h3>
                  <ul className="board-site-cards">
                    {SHELTERS.map((s) => {
                      const list = charts.filter((c) => c.site === s);
                      return (
                        <li key={s} className="board-site-card">
                          <button
                            type="button"
                            className="board-site-card-button"
                            onClick={() => {
                              setSelected(s);
                              setTab("records");
                            }}
                          >
                            <span className="board-site-card-head">
                              <b>{s}</b>
                              <span className="board-pane-sub">
                                {BOARD_RECORDS.chartLabel} {fmt.format(list.length)} {BOARD_RECORDS.count}
                              </span>
                            </span>
                            {list.some((c) => c.undelivered > 0) && <PaneMarks marks={[{ text: BOARD_RECORDS.flagUndelivered, level: "bad" }]} />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section aria-labelledby="board-sync">
                  <h3 id="board-sync">{BOARD_SECTIONS.sync}</h3>
                  <p className="board-note">{BOARD_SECTIONS.syncNote}</p>
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
                </section>
              </>
            )}
            {!isHq && tab === "records" && (
              <>
                <section aria-labelledby="board-intake-open" className="board-intake-open">
                  <h3 id="board-intake-open">{BOARD_INTAKE_FORM.title}</h3>
                  <p className="board-note">{BOARD_INTAKE_MODE.openNote}</p>
                  <button type="button" className="board-approve board-intake-button" ref={intakeOpenRef} onClick={() => openIntake(selected)}>
                    {BOARD_INTAKE_MODE.open}
                  </button>
                </section>
                <section aria-labelledby="board-site-charts">
                  <h3 id="board-site-charts">
                    {BOARD_LAYOUT.detail.charts}{" "}
                    <span className="board-count">
                      {fmt.format(charts.filter((c) => c.site === selected).length)} {BOARD_RECORDS.count}
                    </span>
                  </h3>
                  <p className="board-note">{BOARD_RECORDS.note}</p>
                  <ul className="board-chart-list">
                    {charts
                      .filter((c) => c.site === selected)
                      .map((c) => (
                        <ChartCard key={c.key} chart={c} open={c.key === latestAddedKey} />
                      ))}
                  </ul>
                  {charts.every((c) => c.site !== selected) && <p className="board-note">{BOARD_RECORDS.empty}</p>}
                </section>
              </>
            )}

            {/* デモ：入力と起きたこと */}
            {tab === "demo" && (
              <>
                <p className="board-note">{BOARD_DEMO.note}</p>
                <section aria-labelledby="board-demo-intake" className="board-intake-open">
                  <h3 id="board-demo-intake">{BOARD_INTAKE_FORM.title}</h3>
                  <p className="board-note">{BOARD_INTAKE_MODE.openNote}</p>
                  <div className="board-intake-launch">
                    {(isHq ? DEMO_SITES : [selected]).map((s) => (
                      <button key={s} type="button" className="secondary board-intake-button" data-intake-open={s} onClick={() => openIntake(s)}>
                        {s}
                        {BOARD_INTAKE_MODE.openFor}
                      </button>
                    ))}
                  </div>
                </section>
                <section aria-labelledby="board-log">
                  <h3 id="board-log">
                    {BOARD_DEMO.logTitle} <span className="board-count">{fmt.format(state.log.length)} 件</span>
                  </h3>
                  {state.log.length === 0 ? (
                    <p className="board-note">{BOARD_DEMO.logEmpty}</p>
                  ) : (
                    <ul className="board-log">
                      {state.log.slice(0, 30).map((l, i) => (
                        <li key={`${l.at}-${i}`}>
                          <span className="board-log-at">{clockText(l.at)}</span> {l.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {/* 画像は制作者が用意する（SoapVox の録音中の画面）。届くまでは枠ごと出さない（Issue #101） */}
                {INTAKE_IMAGE.src !== "" && (
                  <figure className="board-image">
                    <img src={INTAKE_IMAGE.src} alt={INTAKE_IMAGE.caption} />
                    <figcaption className="board-image-caption">{INTAKE_IMAGE.caption}</figcaption>
                    <p className="board-image-caption">{INTAKE_IMAGE.qr}</p>
                  </figure>
                )}
                <More id="board-about" title={BOARD_SECTIONS.about}>
                  <p className="board-note">{BOARD_LEAD}</p>
                  <ul>
                    {BOARD_ABOUT.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </More>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
