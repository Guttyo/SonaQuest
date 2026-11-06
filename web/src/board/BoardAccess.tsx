// ボードのデモ用ログイン・右上の表示・閲覧のみの表示・カルテの確認の操作・アクセス記録の一覧（Issue #141、ADR-0050）。
// 状態はブラウザのメモリだけ（Board の useState・useReducer）。保存・ログ出力をしない。

import { createContext, useContext, useState, type FormEvent } from "react";
import type { SiteId } from "./data";
import { clockText, type PatientChart } from "./demo";
import { LOGIN_SITES, siteLabel, staffFor, type AccessEntry, type DemoSession } from "./access";
import { ACCESS_LOG_TEXT, BOARD_LOGIN, BOARD_PERMISSION, CHART_REVIEW_TEXT } from "./accessText";
import { confirmable, type AuditFinding, type ChartReview, type ChartSummaryDraft } from "./review";
import { PLANTED_NOTICE, SAMPLE_NOTICE } from "./karte/contract";
import { findSample } from "./karte/samples";
import { AUDIT_SESSION_LABELS, KARTE_ASPECT_LABELS, KARTE_PANEL_TEXT } from "./karte/text";

export type ChartOp = "draft" | "draft_planted" | "audit" | "confirm";

/** 権限の確認の最後の結果（画面に文字で出す） */
export interface PermissionNotice {
  site: SiteId;
  allowed: boolean;
  via: "worker" | "local";
}

export interface BoardAccessValue {
  session: DemoSession;
  canEdit: (site: SiteId) => boolean;
  reviews: Readonly<Record<string, ChartReview>>;
  /** AI 要約を待っているカルテの key（Issue #148。省くと無し） */
  drafting?: ReadonlySet<string>;
  aiStopped: boolean;
  /** 権限の確認を待っている操作があるか（二重に押さないため） */
  busy: boolean;
  notice: PermissionNotice | null;
  chartOp: (chart: PatientChart, op: ChartOp) => void;
  logOpen: (chart: PatientChart) => void;
  tryWrite: (site: SiteId) => void;
}

const BoardAccessContext = createContext<BoardAccessValue | null>(null);
export const BoardAccessProvider = BoardAccessContext.Provider;
export function useBoardAccess(): BoardAccessValue | null {
  return useContext(BoardAccessContext);
}

export function BoardLogin({ onLogin, onBack }: { onLogin: (site: SiteId, staff: string) => void; onBack: () => void }) {
  const [site, setSite] = useState<SiteId>(LOGIN_SITES[0]);
  const [staff, setStaff] = useState(staffFor(LOGIN_SITES[0])[0]);
  function submit(e: FormEvent) {
    e.preventDefault();
    onLogin(site, staff);
  }
  return (
    <section className="screen board board-login" aria-labelledby="board-login-title">
      <form className="board-login-card" onSubmit={submit}>
        <h1 id="board-login-title" data-scroll-target tabIndex={-1}>
          {BOARD_LOGIN.title}
        </h1>
        <p className="board-login-notice" role="note">
          {BOARD_LOGIN.notice}
        </p>
        <p className="board-note">{BOARD_LOGIN.lead}</p>
        <fieldset className="board-login-sites">
          <legend>{BOARD_LOGIN.site}</legend>
          {LOGIN_SITES.map((s) => (
            <label key={s} className={`board-login-site${site === s ? " current" : ""}`}>
              <input
                type="radio"
                name="board-login-site"
                value={s}
                checked={site === s}
                onChange={() => {
                  setSite(s);
                  setStaff(staffFor(s)[0]);
                }}
              />
              {siteLabel(s)}
            </label>
          ))}
        </fieldset>
        <label className="board-login-staff">
          <span>{BOARD_LOGIN.staff}</span>
          <select value={staff} onChange={(e) => setStaff(e.target.value)}>
            {staffFor(site).map((n) => (
              <option key={n} value={n}>
                {n}（架空）
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="board-approve board-login-submit">
          {BOARD_LOGIN.submit}
        </button>
        <p className="board-note">{BOARD_LOGIN.memory}</p>
        <button type="button" className="secondary" onClick={onBack}>
          {BOARD_LOGIN.back}
        </button>
      </form>
    </section>
  );
}

/** 画面右上に常に出す「救護所A／担当：○○（架空）」とログアウト */
export function SessionBar({ session, onLogout }: { session: DemoSession; onLogout: () => void }) {
  return (
    <div className="board-session" data-testid="board-session">
      <span className="board-session-who">{BOARD_LOGIN.who(siteLabel(session.site), session.staff)}</span>
      <button type="button" className="secondary board-session-logout" onClick={onLogout}>
        {BOARD_LOGIN.logout}
      </button>
    </div>
  );
}

/** 救護所の画面の上に出す、編集できるか・閲覧のみかの表示（色だけにせず文字で示す）と、拒否の確認のボタン */
export function PermissionNote({ site }: { site: SiteId }) {
  const a = useBoardAccess();
  if (a === null) return null;
  const editable = a.canEdit(site);
  const notice = a.notice !== null && a.notice.site === site ? a.notice : null;
  return (
    <div className={`board-permission ${editable ? "editable" : "readonly"}`} data-permission={editable ? "edit" : "read"} role="note">
      <p className="board-permission-line">
        <b>{editable ? BOARD_PERMISSION.editable(site) : BOARD_PERMISSION.readOnly(site)}</b>
        {!editable && <span> {BOARD_PERMISSION.readOnlyWhy(a.session.site)}</span>}
      </p>
      {!editable && (
        <details className="board-permission-try">
          <summary>{BOARD_PERMISSION.tryTitle}</summary>
          <p className="board-note">{BOARD_PERMISSION.tryNote}</p>
          <button type="button" className="secondary" disabled={a.busy} onClick={() => a.tryWrite(site)} data-try-write={site}>
            {BOARD_PERMISSION.tryButton(site)}
          </button>
          <p className="board-note">{BOARD_PERMISSION.limit}</p>
        </details>
      )}
      <PermissionResult notice={notice} />
    </div>
  );
}

/** 権限の確認の結果（拒否と、Worker に接続できず画面側の判定だけで進めたこと） */
export function PermissionResult({ notice }: { notice: PermissionNotice | null }) {
  if (notice === null) return null;
  if (!notice.allowed) {
    return (
      <p className="board-permission-result denied" role="alert" data-denied={notice.via}>
        {BOARD_PERMISSION.denied(notice.site)} {notice.via === "worker" ? BOARD_PERMISSION.deniedWorker : BOARD_PERMISSION.deniedLocal}
      </p>
    );
  }
  if (notice.via === "local") {
    return (
      <p className="board-permission-result local" role="status">
        {BOARD_PERMISSION.localOnly}
      </p>
    );
  }
  return null;
}

function statusText(review: ChartReview | undefined): string {
  if (review === undefined) return CHART_REVIEW_TEXT.status.none;
  if (review.status === "audited") {
    return review.findings.length > 0 ? CHART_REVIEW_TEXT.status.audited_findings(review.findings.length) : CHART_REVIEW_TEXT.status.audited_clean;
  }
  return CHART_REVIEW_TEXT.status[review.status];
}

/** 確認状態の見た目（Issue #143、計画書 2.2）：監査の指摘ありは赤、ほかの確認待ちは黄、確認済み・下書きなしは色なし */
function statusClass(review: ChartReview | undefined): "stop" | "wait" | "done" | "none" {
  if (review === undefined) return "none";
  if (review.status === "human_confirmed") return "done";
  if (review.status === "audited" && review.findings.length > 0) return "stop";
  return "wait";
}

/** カルテの中の、AI 下書き・監査・人の確認の欄 */
function FindingList({ title, findings }: { title: string; findings: readonly AuditFinding[] }) {
  return (
    <div className="board-review-findings">
      <h5>{title}</h5>
      <ul>
        {findings.map((f, i) => (
          <li key={`${f.where}-${i}`}>
            <span>
              {CHART_REVIEW_TEXT.findingWhere}：{f.where}
            </span>
            <span>
              {CHART_REVIEW_TEXT.findingKind}：{f.kind}
            </span>
            <span>
              {CHART_REVIEW_TEXT.findingReason}：{f.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 下書きの表示。抽出型の要約（Issue #148）は、行ごとに原文（quote）を添え、1段目（コード）と2段目（監査役）の指摘を
 * 該当する行の下に出す。行に結びつかない指摘（抜けている観点など）は下にまとめる。誤りを混ぜた例は必ず明示する
 */
function DraftView({ draft, findings }: { draft: ChartSummaryDraft; findings: readonly AuditFinding[] }) {
  if (draft.source !== "extractive") {
    return (
      <>
        {draft.source === "sample_fallback" && <p className="board-note">{KARTE_PANEL_TEXT.summaryFallback}</p>}
        <p className="board-note">{CHART_REVIEW_TEXT.sampleNote}</p>
        <dl className="board-review-draft">
          {draft.lines.map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd>{l.text}</dd>
            </div>
          ))}
        </dl>
      </>
    );
  }
  const code = draft.codeFindings ?? [];
  const onLine = (list: readonly AuditFinding[], i: number) => list.filter((f) => f.line === i);
  const sample = draft.sampleId === undefined ? undefined : findSample(draft.sampleId);
  return (
    <>
      {draft.planted && (
        <p className="board-review-planted" data-planted-notice>
          {PLANTED_NOTICE}
        </p>
      )}
      <p className="board-note">{SAMPLE_NOTICE}</p>
      <ol className="board-review-draft board-review-lines">
        {draft.lines.map((l, i) => {
          const hits = [...onLine(code, i), ...onLine(findings, i)];
          // 会話に見つからなかった引用は「原文」と呼ばない（モデルが作った文かもしれない。safety-review）
          const unsupported = (draft.unsupportedLines ?? []).includes(i);
          return (
            <li key={`${l.label}-${i}`} className={hits.length > 0 ? "has-finding" : undefined} data-line={i} data-finding={hits.length > 0 ? "" : undefined}>
              <span className="board-review-label">{l.label}</span>
              <span>{l.text}</span>
              {l.quote !== undefined && (
                <span className="board-note">
                  {unsupported ? KARTE_PANEL_TEXT.quoteUnsupported : KARTE_PANEL_TEXT.quote}：「{l.quote}」
                </span>
              )}
              {hits.map((f, j) => (
                <span key={j} className="board-review-hit">
                  {f.kind}：{f.reason}
                </span>
              ))}
            </li>
          );
        })}
      </ol>
      {draft.summary !== undefined && draft.summary.not_covered.length > 0 && (
        <p className="board-note">
          {KARTE_PANEL_TEXT.notCovered}：{draft.summary.not_covered.map((v) => KARTE_ASPECT_LABELS[v]).join("・")}
        </p>
      )}
      {code.length > 0 && <FindingList title={KARTE_PANEL_TEXT.codeFindings} findings={code} />}
      {findings.length > 0 && <FindingList title={KARTE_PANEL_TEXT.auditFindings} findings={findings} />}
      {sample !== undefined && (
        <details className="board-review-conversation">
          <summary>{KARTE_PANEL_TEXT.conversation}</summary>
          <p className="board-note">{sample.title}</p>
          <ul>
            {sample.turns.map((t, i) => (
              <li key={i}>
                <span className="board-review-label">{t.speaker === "staff" ? KARTE_PANEL_TEXT.staff : KARTE_PANEL_TEXT.patient}</span>
                {t.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function ChartReviewPanel({ chart }: { chart: PatientChart }) {
  const a = useBoardAccess();
  if (a === null) return null;
  const review = a.reviews[chart.key];
  const editable = a.canEdit(chart.site);
  const status = review?.status;
  return (
    <section className="board-review" aria-label={CHART_REVIEW_TEXT.title} data-review={status ?? "none"}>
      <h4>
        {CHART_REVIEW_TEXT.title}
        <span className={`board-review-status ${statusClass(review)}`} data-testid="review-status">
          {statusText(review)}
        </span>
      </h4>
      {review !== undefined && <DraftView draft={review.draft} findings={review.findings} />}
      {review !== undefined && review.draft.source !== "extractive" && review.findings.length > 0 && (
        <FindingList title={CHART_REVIEW_TEXT.findings} findings={review.findings} />
      )}
      {a.drafting?.has(chart.key) && (
        <p className="board-note" role="status">
          {KARTE_PANEL_TEXT.drafting}
        </p>
      )}
      {status === "ai_auditing" && <p className="board-note" role="status">{CHART_REVIEW_TEXT.auditing}</p>}
      {review?.auditFailure && KARTE_PANEL_TEXT.failure[review.auditFailure] && (
        <p className="board-note" data-testid="audit-failure">
          {KARTE_PANEL_TEXT.failure[review.auditFailure]}
        </p>
      )}
      {review?.session && (
        <p className="board-note" data-testid="audit-session" data-session={review.session}>
          {AUDIT_SESSION_LABELS[review.session]}
        </p>
      )}
      {(status === "audit_unavailable" || (review?.auditedAs === "audit_unavailable" && status === "human_confirmed")) && (
        <p className="board-note">{CHART_REVIEW_TEXT.unavailable}</p>
      )}
      {review?.confirmedBy && review.confirmedAt !== null && (
        <p className="board-review-confirmed" data-testid="review-confirmed">
          {CHART_REVIEW_TEXT.confirmedBy(review.confirmedBy.staff, review.confirmedBy.site, clockText(review.confirmedAt))}
        </p>
      )}
      {status !== "human_confirmed" && review !== undefined && <p className="board-note">{CHART_REVIEW_TEXT.waiting}</p>}
      {editable ? (
        <div className="board-review-actions">
          {status === undefined && !a.drafting?.has(chart.key) && (
            <>
              <button type="button" className="secondary" disabled={a.busy} onClick={() => a.chartOp(chart, "draft")}>
                {a.aiStopped ? CHART_REVIEW_TEXT.makeDraft : KARTE_PANEL_TEXT.makeSummary}
              </button>
              <button type="button" className="secondary" disabled={a.busy} data-planted-draft onClick={() => a.chartOp(chart, "draft_planted")}>
                {KARTE_PANEL_TEXT.makePlanted}
              </button>
            </>
          )}
          {status === "ai_draft" && (
            <button type="button" className="secondary" disabled={a.busy} onClick={() => a.chartOp(chart, "audit")}>
              {CHART_REVIEW_TEXT.sendAudit}
            </button>
          )}
          {confirmable(review) && (
            <button type="button" className="board-approve" disabled={a.busy} onClick={() => a.chartOp(chart, "confirm")}>
              {CHART_REVIEW_TEXT.confirm}
            </button>
          )}
          {a.aiStopped && status !== "human_confirmed" && <span className="board-note">{CHART_REVIEW_TEXT.aiStopNote}</span>}
        </div>
      ) : (
        <p className="board-note" data-readonly-review>
          {BOARD_PERMISSION.readOnly(chart.site)}。{CHART_REVIEW_TEXT.readOnly}
        </p>
      )}
    </section>
  );
}

/** 画面の端の、開閉できるアクセス記録の一覧 */
export function AccessLogPanel({ log, defaultOpen = false }: { log: readonly AccessEntry[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <aside className={`board-access-log${open ? " open" : ""}`} aria-label={ACCESS_LOG_TEXT.title}>
      <button type="button" className="secondary board-access-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? ACCESS_LOG_TEXT.close : ACCESS_LOG_TEXT.open}（{log.length} 件）
      </button>
      {open && (
        <div className="board-access-body">
          <h2>{ACCESS_LOG_TEXT.title}</h2>
          <p className="board-access-notice">{ACCESS_LOG_TEXT.notice}</p>
          <p className="board-note">{ACCESS_LOG_TEXT.note}</p>
          {log.length === 0 ? (
            <p className="board-note">{ACCESS_LOG_TEXT.empty}</p>
          ) : (
            <div className="board-tablebox">
              <table data-testid="access-log">
                <thead>
                  <tr>
                    <th>{ACCESS_LOG_TEXT.head.at}</th>
                    <th>{ACCESS_LOG_TEXT.head.site}</th>
                    <th>{ACCESS_LOG_TEXT.head.staff}</th>
                    <th>{ACCESS_LOG_TEXT.head.kind}</th>
                    <th>{ACCESS_LOG_TEXT.head.target}</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l, i) => (
                    <tr key={`${l.at}-${i}`} data-kind={l.kind}>
                      <td>{clockText(l.at)}</td>
                      <td>{siteLabel(l.site)}</td>
                      <td>{l.staff}</td>
                      <td>{ACCESS_LOG_TEXT.kinds[l.kind]}</td>
                      <td>{l.target === "" ? ACCESS_LOG_TEXT.noTarget : l.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
