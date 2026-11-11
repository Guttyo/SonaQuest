// ボードの開閉できる欄（Issue #159）。一覧の欄を見出しだけにたためるようにし、見出しに件数を出す。
// 最初に開いておくかは呼び出す側が決める（急ぐもの、たとえば在庫切れや承認待ちがある欄だけ開く）。
// 開閉はブラウザの <details> だけで、状態を保存しない。
// 呼び出す側が決めるのは最初の1回だけ（Issue #296 の案A）。その後に値が変わっても、人が開け閉めした状態を上書きしない。

import { useState, type ReactNode } from "react";
import { BOARD_CASES } from "./text";

interface FoldProps {
  /** 見出し（h3）の id。section の aria-labelledby にも使う */
  id: string;
  title: ReactNode;
  /** 見出しの後ろに添える件数の文（例：「3 件」）。閉じていても見える */
  count?: ReactNode;
  /** 最初に開いておくか。最初の描画のときだけ読む（後から変わっても、開閉はブラウザと人に任せる。Issue #296） */
  defaultOpen: boolean;
  className?: string;
  testId?: string;
  sectionId?: string;
  children: ReactNode;
}

export function Fold({ id, title, count, defaultOpen, className, testId, sectionId, children }: FoldProps) {
  // 値をこの後ずっと同じにしておくと、React は DOM の open を書き換えない（人の開け閉めがそのまま残る）
  const [open] = useState(defaultOpen);
  return (
    <section aria-labelledby={id} className={`board-fold${className ? ` ${className}` : ""}`} data-testid={testId} id={sectionId}>
      <details open={open}>
        <summary>
          <h3 id={id}>
            {title}
            {count !== undefined && <> <span className="board-count">{count}</span></>}
          </h3>
        </summary>
        <div className="board-fold-body">{children}</div>
      </details>
    </section>
  );
}

/** 画面の見方・仕組みの説明。ふだんは閉じておく（Issue #113：説明文をヘルプの開閉へ。Issue #159 で別のファイルへ） */
export function Help({ children }: { children: ReactNode }) {
  return (
    <details className="board-help">
      <summary>{BOARD_CASES.help}</summary>
      <div className="board-help-body">{children}</div>
    </details>
  );
}
