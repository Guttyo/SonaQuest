import "./record.css";
import { RECORD_EMPTY, RECORD_NOTE, RECORD_TITLE, recordRows } from "../flow/record";
import type { Answer } from "../flow/types";

interface Props {
  answers: readonly Answer[];
}

/**
 * 振り返りの「救護所に渡す記録の形」（Issue #97、ADR-0042）。
 * 固定の質問ごとの回答を、聞き取りの項目に並べる。回答は原文のまま（要約・言い換えなし。ADR-0009）。
 * 端末のメモリにある回答から描くだけで、保存も送信もしない（ADR-0007）
 */
export function RecordCard({ answers }: Props) {
  const rows = recordRows(answers);
  return (
    <div className="record-card">
      <h2>{RECORD_TITLE}</h2>
      <p className="record-note">{RECORD_NOTE}</p>
      <dl className="record-items">
        {rows.map((row) => (
          <div key={row.id} className="record-item">
            <dt>{row.label}</dt>
            {row.values.length === 0 ? (
              <dd className="record-empty">{RECORD_EMPTY}</dd>
            ) : (
              row.values.map((v, i) => (
                <dd key={`${row.id}-${i}`} className="record-value">
                  {v}
                </dd>
              ))
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
