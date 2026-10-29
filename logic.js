/* 판정·계산 로직(logic.js) — 화면과 떨어진 순수 함수. tests/logic.test.mjs가 node로 검사한다. */

/* 1단: placed = { 칸id: 카드id }. 틀린 칸 id 목록을 돌려준다(빈 칸도 틀린 것으로 센다). */
function wrongSlots(placed, cards, slots) {
  return slots.map(s => s.id).filter(sid => {
    const c = cards.find(x => x.id === placed[sid]);
    return !c || c.slot !== sid;
  });
}

/* 1단: 정해진 횟수만큼 틀리면 정답을 보여 주고 넘어간다. 정답 배치 { 칸id: 카드id } */
function answerPlacement(cards) {
  const out = {};
  cards.forEach(c => { out[c.slot] = c.id; });
  return out;
}

/* 2단: 실 뽑기 — 누른 횟수 × 한 번에 뽑는 가닥 수 */
function threads(taps, perTap) {
  return Math.max(0, Math.floor(taps)) * perTap;
}

/* 2단: 방직기 — 배치한 사람 수로 돌아가는 방직기 대수. 증기 기관이 없으면 한 사람이 1대,
 * 증기 기관 공장에서는 한 사람이 loom.perWorkerSteam대를 살핀다. */
function runningLooms(steam, staffed, loom) {
  return Math.min(loom.looms, Math.max(0, staffed) * (steam ? loom.perWorkerSteam : 1));
}

/* 3단: 증기 기관 고르기 — 고른 id 목록이 정답 집합과 꼭 같은가 */
function steamCorrect(pickedIds, items) {
  const want = items.filter(i => i.steam).map(i => i.id).sort().join(",");
  return [...new Set(pickedIds)].sort().join(",") === want;
}

/* 4단: 자본가/노동자 — picks = { 카드id: 역할id }. 틀리거나 안 고른 카드 id 목록 */
function wrongRoles(picks, cards) {
  return cards.filter(c => picks[c.id] !== c.role).map(c => c.id);
}

/* 4단: 순서 — 지금 순서가 정답 순서와 같은가 */
function orderCorrect(current, answer) {
  return current.length === answer.length && current.every((id, i) => id === answer[i]);
}

/* 순서 바꾸기(▲▼): i번째를 d(-1/+1)만큼 옮긴 새 배열 */
function moveItem(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr.slice();
  const out = arr.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { wrongSlots, answerPlacement, threads, runningLooms, steamCorrect, wrongRoles, orderCorrect, moveItem };
}
