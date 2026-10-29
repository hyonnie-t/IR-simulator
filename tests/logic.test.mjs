// logic.js 단위 테스트: node tests/logic.test.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const L = require("../logic.js");

// data.js를 읽어 실제 데이터로도 검사한다(const 선언이라 끝에 꺼내는 줄을 붙인다)
const ctx = {};
vm.runInNewContext(fs.readFileSync(new URL("../data.js", import.meta.url), "utf8") +
  ";this.D={STEP1,SLOTS,FACT_CARDS,STEAM_ITEMS,ROLE_CARDS,SPREAD,SPREAD_START,LOOM,SPINNERS};", ctx);
const D = JSON.parse(JSON.stringify(ctx.D)); // vm 쪽 배열은 원형이 달라 deepEqual이 실패하므로 이쪽 객체로 옮긴다
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("1단: 정답 배치면 틀린 칸 0", () => {
  const placed = Object.fromEntries(D.FACT_CARDS.map(c => [c.slot, c.id]));
  assert.deepEqual(L.wrongSlots(placed, D.FACT_CARDS, D.SLOTS), []);
});
t("1단: 빈 칸·바뀐 칸은 틀림", () => {
  const placed = { goods: "f1", raw: "f3", market: "f2" };
  assert.deepEqual(L.wrongSlots(placed, D.FACT_CARDS, D.SLOTS), ["raw", "market", "capital", "labor"]);
});
t("1단: 카드마다 칸이 하나씩, 칸마다 카드가 하나씩", () => {
  assert.equal(new Set(D.FACT_CARDS.map(c => c.slot)).size, D.SLOTS.length);
  D.FACT_CARDS.forEach(c => assert.ok(D.SLOTS.some(s => s.id === c.slot)));
});
t("1단: 세 번 틀린 뒤 보여 주는 정답 배치는 틀린 칸 0", () => {
  assert.equal(D.STEP1.maxTries, 3);
  assert.deepEqual(L.wrongSlots(L.answerPlacement(D.FACT_CARDS), D.FACT_CARDS, D.SLOTS), []);
});
t("예시 문구(placeholder)에 1단 칸 이름이 들어가지 않는다", () => {
  D.SLOTS.forEach(sl => sl.name.split(" ").filter(w => w.length > 1).forEach(w => assert.ok(!D.STEP1.guessPh.includes(w), w)));
});
t("2단: 도구마다 그림 파일이 있다", () => {
  D.SPINNERS.forEach(sp => assert.ok(fs.existsSync(new URL("../" + sp.img, import.meta.url)), sp.img));
});
t("2단: 실 가닥 수", () => {
  assert.equal(L.threads(5, 120), 600);
  assert.equal(L.threads(-3, 8), 0);
  assert.deepEqual(D.SPINNERS.map(s => s.perTap), [1, 8, 120]);
});
t("2단: 방직기 한도", () => {
  assert.equal(L.loomLimit(false, D.LOOM.workers, D.LOOM.looms), 3);
  assert.equal(L.loomLimit(true, D.LOOM.workers, D.LOOM.looms), 6);
});
t("3단: 증기 기관 고르기", () => {
  assert.ok(L.steamCorrect(["s5", "s2", "s3"], D.STEAM_ITEMS));
  assert.ok(L.steamCorrect(["s2", "s3", "s5", "s3"], D.STEAM_ITEMS)); // 중복은 무시
  assert.ok(!L.steamCorrect(["s2", "s3"], D.STEAM_ITEMS));
  assert.ok(!L.steamCorrect(["s1", "s2", "s3", "s5"], D.STEAM_ITEMS));
});
t("4단: 자본가/노동자", () => {
  const ok = Object.fromEntries(D.ROLE_CARDS.map(c => [c.id, c.role]));
  assert.deepEqual(L.wrongRoles(ok, D.ROLE_CARDS), []);
  assert.deepEqual(L.wrongRoles({ ...ok, r2: "capitalist" }, D.ROLE_CARDS), ["r2"]);
  assert.deepEqual(L.wrongRoles({}, D.ROLE_CARDS).length, D.ROLE_CARDS.length);
});
t("4단: 순서·옮기기", () => {
  const ans = D.SPREAD.map(s => s.id);
  assert.ok(!L.orderCorrect(D.SPREAD_START, ans)); // 처음 순서가 정답이면 안 된다
  let cur = D.SPREAD_START.slice();
  cur = L.moveItem(cur, 0, 1); // rujp uk euus → uk rujp euus
  cur = L.moveItem(cur, 1, 1); // → uk euus rujp
  assert.ok(L.orderCorrect(cur, ans));
  assert.deepEqual(L.moveItem(["a", "b"], 0, -1), ["a", "b"]);
});
console.log(n + " passed");
