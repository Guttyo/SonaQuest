import type { ReactNode } from "react";

/**
 * 聞き取り係の発言。光の存在として表す（ADR-0020）。
 * 発言の光は止まったまま。動くのは返事を待つ間の「考え中」だけ（Dialogue.tsx の Thinking、ADR-0030）。
 */
export function Listener({ children }: { children: ReactNode }) {
  return (
    <div className="listener">
      <span className="listener-light" aria-hidden="true" />
      <div className="listener-speech">
        <span className="listener-name">聞き取り係</span>
        {children}
      </div>
    </div>
  );
}
