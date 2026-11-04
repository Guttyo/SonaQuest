import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVENTS, SHIFT_LOST_PREFIX, SHIFT_NONE_LOST } from "../flow/content";
import type { EventId } from "../flow/types";
import { SceneBar } from "./ListenerStage";
import { LOST_BY_EVENT, sourceLabel, type DrawnSource } from "./SourceIcon";
import { SHIFT_SOURCES, SourceShift } from "./SourceShift";
import { Stopped } from "./Stopped";

const EVENT_IDS = Object.keys(EVENTS) as EventId[];
const CHOICES: readonly (DrawnSource | null)[] = [...SHIFT_SOURCES, null];

function render(event: EventId, chosen: DrawnSource | null): string {
  return renderToStaticMarkup(<SourceShift event={event} chosen={chosen} />);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("出来事のあとの情報源の並び（B-02）", () => {
  it("③確認の5つの情報源を、出来事に関係なく同じ並びで出す", () => {
    expect(SHIFT_SOURCES).toEqual(["smartphone", "online", "notebook", "family", "clinic"]);
    for (const event of EVENT_IDS) {
      expect(count(render(event, null), 'class="source-shift-item')).toBe(5);
    }
  });

  it("使えなくなったものにだけ斜線を引き、文字でも「使えない」と示す", () => {
    for (const event of EVENT_IDS) {
      for (const chosen of CHOICES) {
        const html = render(event, chosen);
        const lost = LOST_BY_EVENT[event];
        expect(count(html, "source-shift-slash")).toBe(lost.length);
        expect(count(html, "source-shift-lost")).toBe(lost.length);
        expect(count(html, "source-shift-kept")).toBe(5 - lost.length);
        for (const s of SHIFT_SOURCES) {
          const state = lost.includes(s) ? "使えない" : "この出来事では使えなくなっていない";
          expect(html).toContain(`${sourceLabel(s)}：`);
          expect(html).toMatch(new RegExp(`${sourceLabel(s)}：[^<]*${state}`));
        }
      }
    }
  });

  it("見える文は、使えなくなったものの名前か、何も使えなくなっていないこと", () => {
    expect(render("battery", null)).toContain(
      `${SHIFT_LOST_PREFIX}${sourceLabel("smartphone")}、${sourceLabel("online")}`,
    );
    expect(render("network", null)).toContain(`${SHIFT_LOST_PREFIX}${sourceLabel("online")}`);
    const handover = render("handover", "family");
    expect(handover).toContain(SHIFT_NONE_LOST);
    expect(handover).not.toContain("source-shift-slash");
  });

  it("頼りにしていたもの（③確認で本人が選んだもの）だけを囲む。選ばなかったときは囲まない", () => {
    expect(count(render("battery", "smartphone"), "source-shift-chosen")).toBe(1);
    expect(render("battery", "smartphone")).toContain("スマートフォン：頼りにしていた・使えない");
    expect(render("battery", "notebook")).toContain(
      `${sourceLabel("notebook")}：頼りにしていた・この出来事では使えなくなっていない`,
    );
    expect(render("battery", null)).not.toContain("source-shift-chosen");
  });

  it("絵は読み上げから外し、意味は文字で示す", () => {
    const html = render("notebook_home", "notebook");
    expect(count(html, '<span class="source-shift-icon" aria-hidden="true">')).toBe(5);
    expect(count(html, 'class="visually-hidden"')).toBe(5);
    expect(html).toContain('role="group"');
  });

  it("点数・合否・達成率に見える表示を出さない（数・%・星・正解の言葉が無い）", () => {
    for (const event of EVENT_IDS) {
      for (const chosen of CHOICES) {
        // 属性（SVG の座標など）を除いた、人が読む文だけを見る
        const text = render(event, chosen)
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ");
        expect(text).not.toMatch(/[0-9０-９%％★☆]|点|合格|不合格|正解|残り|達成/);
      }
    }
  });

  it("中断の画面には出ない", () => {
    for (const reason of ["manual", "symptom", "self_harm"] as const) {
      const html = renderToStaticMarkup(<Stopped reason={reason} onRestart={() => {}} />);
      expect(html).not.toContain("source-shift");
      expect(html).not.toContain("scene-dot");
    }
  });
});

describe("場面の点（B-02）", () => {
  it("進み具合は点の形だけで示し、数や割合を出さない", () => {
    for (const scene of ["arrive", "tell", "event", "retell", "review"] as const) {
      const html = renderToStaticMarkup(<SceneBar scene={scene} />);
      expect(count(html, 'aria-current="step"')).toBe(1);
      const text = html.replace(/<[^>]*>/g, " ");
      expect(text).not.toMatch(/%|％|\/\s*5|点中/);
    }
  });
});
