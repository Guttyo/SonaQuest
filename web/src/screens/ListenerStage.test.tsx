import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAIN_PALETTE, RELIEF_PALETTE } from "../puppet3d/palette";
import type { ListenerActivity } from "../puppet3d/types";
import { ListenerStage } from "./ListenerStage";
import { Puppet2D, Puppet2DFace } from "./Puppet2D";
import { Exchange } from "./Transcript";
import { EVENTS, HANDOVER_QUESTION, MODE_OPTIONS, SCENE_INTRO } from "../flow/content";

/**
 * 試験は DOM の無い環境で動くので、文字列に描いて確かめる。
 * この環境では WebGL が無いので、"3d" を頼んでも 2D のソナになる（ADR-0032 の戻り先）。
 */
const ACTIVITIES: ListenerActivity[] = ["idle", "listening", "speaking", "thinking"];
const LABELS: Record<ListenerActivity, string> = {
  idle: "（待っています）",
  listening: "（聞いています）",
  speaking: "（話しています）",
  thinking: "（考えています）",
};

/** svg の中身だけを取り出す */
function svgOf(html: string): string {
  const start = html.indexOf("<svg");
  const end = html.indexOf("</svg>") + "</svg>".length;
  return html.slice(start, end);
}

/** タグを除いた文字（絵に文字を入れていないことを確かめる） */
function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

// もとは見本のページだけが使っていた Listener の試験。見本も ListenerStage で描くようにしたので、こちらに移した（Issue #299）
describe("ListenerStage の props（ADR-0032、2D の姿は ADR-0038）", () => {
  it("2D の待機で状態を出さないときは、2D のパペットと横に置くものだけ。光の丸も状態の文字も出さない", () => {
    const html = renderToStaticMarkup(
      <ListenerStage mode="2d" activity="idle" relief={false} showState={false} scene="tell">
        <p>質問の文</p>
      </ListenerStage>,
    );
    expect(html).toContain('class="dialogue-stage"');
    expect(html).toContain('data-activity="idle"');
    expect(html).not.toContain("listener-light");
    expect(html).not.toContain("（待っています）");
    expect(html).toContain("<p>質問の文</p>");
  });

  it("3D を頼んでも、WebGL が使えないときは 2D のソナで続け、状態を文字で示す", () => {
    const html = renderToStaticMarkup(
      <ListenerStage mode="3d" activity="speaking" relief={false} showState scene="tell">
        <p>質問の文</p>
      </ListenerStage>,
    );
    expect(html).not.toContain("canvas");
    expect(html).not.toContain("puppet3d-placeholder");
    expect(html).toContain("puppet2d-stage");
    expect(html).toContain('data-activity="speaking"');
    expect(html).toContain("（話しています）");
    expect(html).toContain("<p>質問の文</p>");
  });

  it("係の交代では、2D のパペットも別の色にする", () => {
    const html = renderToStaticMarkup(
      <ListenerStage mode="2d" activity="idle" relief showState scene="retell" />,
    );
    expect(html).toContain("puppet2d-stage-relief");
    // 舞台の背景は 3D と同じ puppet3d-stage-relief で温かい色にする（PR #78 のレビュー）
    expect(html).toContain("puppet3d-stage-relief");
    expect(html).toContain('data-relief="true"');
    expect(html).toContain(`fill="${RELIEF_PALETTE.body}"`);
  });
});

describe("対話の上のソナ（ListenerStage）の 2D の姿（Issue #47）", () => {
  it.each(ACTIVITIES)("%s：状態の印と状態の文字が変わる", (activity) => {
    const html = renderToStaticMarkup(
      <ListenerStage mode="2d" activity={activity} relief={false} showState scene="tell" />,
    );
    expect(html).toContain(`data-activity="${activity}"`);
    expect(html).toContain(LABELS[activity]);
    for (const other of ACTIVITIES.filter((a) => a !== activity)) {
      expect(html).not.toContain(`data-activity="${other}"`);
      expect(html).not.toContain(LABELS[other]);
    }
    expect(html).not.toContain("listener-light");
  });

  it("3D を頼んでも、この環境（WebGL なし）では canvas を出さず 2D の姿になる", () => {
    const html = renderToStaticMarkup(
      <ListenerStage mode="3d" activity="speaking" relief={false} showState scene="tell" />,
    );
    expect(html).not.toContain("canvas");
    expect(html).toContain("puppet2d-stage");
    expect(html).toContain("（話しています）");
  });

  it("回答を受け取ると、頭にうなずきの印が付く（0 では付かない）", () => {
    const still = renderToStaticMarkup(
      <ListenerStage mode="2d" activity="idle" relief={false} showState scene="tell" nodKey={0} />,
    );
    const nod = renderToStaticMarkup(
      <ListenerStage mode="2d" activity="idle" relief={false} showState scene="tell" nodKey={2} />,
    );
    expect(still).not.toContain("p2d-nod-on");
    expect(nod).toContain('class="p2d-nod p2d-nod-on"');
  });
});

describe("Puppet2D の絵（ADR-0038）", () => {
  it("絵は aria-hidden で、文字を含まない", () => {
    for (const activity of ACTIVITIES) {
      const svg = svgOf(renderToStaticMarkup(<Puppet2D activity={activity} relief={false} />));
      expect(svg).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(svg).toContain('focusable="false"');
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain("<title");
      expect(textOf(svg).trim()).toBe("");
    }
  });

  it("色は 3D と同じ palette.ts から取り、交代で体と襟の色が変わる", () => {
    const main = renderToStaticMarkup(<Puppet2D activity="idle" relief={false} />);
    const relief = renderToStaticMarkup(<Puppet2D activity="idle" relief />);
    expect(main).toContain(`fill="${MAIN_PALETTE.body}"`);
    expect(main).toContain(`fill="${MAIN_PALETTE.accent}"`);
    expect(main).toContain('data-relief="false"');
    expect(relief).toContain(`fill="${RELIEF_PALETTE.body}"`);
    expect(relief).not.toContain(`fill="${MAIN_PALETTE.body}"`);
  });

  it("2D も 3D と同じ案C（どうぶつ風。Issue #164）：丸い耳と、口まわり・おなかの色がある", () => {
    const html = renderToStaticMarkup(<Puppet2D activity="idle" relief={false} />);
    expect(html).toContain(`fill="${MAIN_PALETTE.extra}"`);
    // 耳は左右に2つずつ（外側と内側）
    expect(html.match(/<circle cx="(40|80)" cy="25"/g)?.length).toBe(4);
    const relief = renderToStaticMarkup(<Puppet2D activity="idle" relief />);
    expect(relief).toContain(`fill="${RELIEF_PALETTE.extra}"`);
  });

  it("吹き出しの横の小さな顔も、文字を含まない飾り", () => {
    const html = renderToStaticMarkup(<Puppet2DFace activity="thinking" />);
    expect(html).toContain('data-activity="thinking"');
    expect(svgOf(html)).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(textOf(html).trim()).toBe("");
  });

  it("吹き出しの横の小さな顔は、状態の動きを止める印（puppet2d-static）を持つ。舞台の大きな姿は持たない", () => {
    const face = renderToStaticMarkup(<Puppet2DFace activity="thinking" />);
    expect(svgOf(face)).toMatch(/class="puppet2d puppet2d-static"/);
    const stage = renderToStaticMarkup(<Puppet2D activity="thinking" relief={false} />);
    expect(stage).not.toContain("puppet2d-static");
  });
});

describe("話し相手の名前（Issue #164。旧称「聞き取り係」）", () => {
  it("ふだんはソナ、係の交代の後はクエと出す", () => {
    const sona = renderToStaticMarkup(
      <ListenerStage mode="2d" activity="idle" relief={false} showState scene="tell" />,
    );
    const que = renderToStaticMarkup(<ListenerStage mode="2d" activity="idle" relief showState scene="retell" />);
    expect(sona).toContain("ソナ");
    expect(sona).not.toContain("クエ");
    expect(que).toContain("クエ");
    expect(que).not.toContain("ソナ");
  });

  it("吹き出しの名前も、交代の後のやり取りだけクエにする", () => {
    const answer = { questionId: "second_handover", half: "second", text: "x", prompt: "y", kind: "answer", recall: true } as const;
    const before = renderToStaticMarkup(<Exchange answer={answer} />);
    const after = renderToStaticMarkup(<Exchange answer={answer} relief />);
    expect(before.match(/ソナ/g)?.length).toBe(2);
    expect(before).not.toContain("クエ");
    expect(after.match(/クエ/g)?.length).toBe(2);
    expect(after).not.toContain("ソナ");
  });

  it("古い呼び方が画面の文に残っていない", () => {
    const texts = [SCENE_INTRO, HANDOVER_QUESTION.text, EVENTS.handover.text, ...MODE_OPTIONS.map((o) => o.description)];
    for (const t of texts) {
      expect(t).not.toMatch(/聞き取り係|係の人|新しい係/);
    }
  });
});
