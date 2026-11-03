// docs/safety-test-plan.md「2. 緊急時の中断」の E1〜E3・E5〜E9 を、語の照合の単体試験にしたもの。
// 入力はすべて架空。E4（「訓練をやめる」ボタン）は画面の操作で確かめる。

import { describe, expect, it } from "vitest";
import { detectDistress, normalizeForMatch } from "./emergency";

describe("体調の訴えの検出（ADR-0011）", () => {
  it("E1：今の体調の訴えで中断する", () => {
    expect(detectDistress("今、胸が苦しい")).toBe("symptom");
  });

  it("E2：訓練の中の役か区別しにくい訴えは中断する側に倒す", () => {
    expect(detectDistress("訓練の話だけど、本当に息が苦しい気がする")).toBe("symptom");
  });

  it("E3：Claude を使わず、語の照合だけで決まる", () => {
    // detectDistress は外部を呼ばない純粋な関数。API が止まっていても同じ結果になる
    expect(detectDistress("さっきから吐き気がする")).toBe("symptom");
  });

  it("E5：自傷のほのめかしは自傷用の扱いにする", () => {
    expect(detectDistress("もう死にたい")).toBe("self_harm");
    expect(detectDistress("生きているのがつらい")).toBe("self_harm");
    expect(detectDistress("薬を大量に飲んで終わりにしたい")).toBe("self_harm");
  });

  it("E6：想定の話では中断しない", () => {
    expect(detectDistress("もし薬が切れたら困る")).toBeNull();
  });

  it("E8：「飲めていない、今つらい」は中断する", () => {
    expect(detectDistress("飲めていない、今つらい")).toBe("symptom");
  });

  it("E9：過去の話や否定では中断しない", () => {
    expect(detectDistress("以前、具合が悪くなった薬はない")).toBeNull();
    expect(detectDistress("薬で気分が悪くなったことはありません")).toBeNull();
    expect(detectDistress("胸は苦しくないです")).toBeNull();
  });

  it("被災の場面の話や、ふだんの回答では中断しない", () => {
    for (const text of [
      "お薬手帳です",
      "A薬を朝に1錠、B錠を夜に2錠飲んでいます",
      "お薬手帳は家にあるけど、棚が倒れて取り出せない",
      "スマホの電池が切れたので、紙のメモを見せます",
      "妻が知っています",
      "名前は覚えていない",
      "特にありません",
    ]) {
      expect(detectDistress(text), text).toBeNull();
    }
  });

  it("表記の違い（全角・カタカナ・空白）をそろえて照合する", () => {
    expect(normalizeForMatch("ドキドキ　する")).toBe("どきどきする");
    expect(detectDistress("ムネガ クルシイ")).toBe("symptom");
    expect(detectDistress("タスケテ")).toBe("symptom");
  });
});

// E7：同じ訴えの言い換え（話し言葉、方言、遠回しな表現、音声認識の誤変換）。
// 見逃しは語の一覧を見直す材料。見逃しがある前提で「訓練をやめる」ボタンを残す。
// 見逃しの件数は docs/safety-test-plan.md の「実施の記録」に書く。
const E7_DETECTED: readonly string[] = [
  "胸がぎゅっとして息がしづらいです",
  "頭ががんがんする",
  "めっちゃしんどい",
  "お腹が痛くて動けない",
  "薬が切れて今かなりつらい",
  "胸がドキドキして止まらない",
  "手足がしびれてる",
  "もう限界です",
  "息が詰まる感じがする",
  "具合わるい",
  "ちょっと胸が痛む",
  "冷や汗が出てきた",
  "意識が飛びそう",
  "ろれつが回らない",
  "けいれんしている",
  "倒れそうです",
  "咳が止まらない",
  "体がだるくて起き上がれない",
  "熱っぽくてふらふらする",
  "目が回る",
  "気持ち悪い",
  "たすけてください",
];

const E7_MISSED: readonly string[] = [
  "えらい、もうあかん", // 方言の「えらい（つらい）」
  "胸が来るしい", // 音声認識の誤変換
  "体調があんまりよくない", // 間に語が入る遠回しな言い方
  "頭が重い感じ", // 弱い言い方
];

describe("E7：言い換えの見逃し", () => {
  it.each(E7_DETECTED)("検出する：%s", (text) => {
    expect(detectDistress(text)).not.toBeNull();
  });

  // 見逃しとして記録している言い換え。検出できるように語を足したら、上の一覧へ移す
  it.each(E7_MISSED)("見逃し（記録済み）：%s", (text) => {
    expect(detectDistress(text)).toBeNull();
  });

  it("言い換えは20件以上ある", () => {
    expect(E7_DETECTED.length + E7_MISSED.length).toBeGreaterThanOrEqual(20);
  });
});
