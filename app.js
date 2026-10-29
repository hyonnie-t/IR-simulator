/* 주제33 「면직물 공장을 세워라!」 산업 혁명 공장 시뮬레이션 — 로직(app.js)
 * 판정은 logic.js(순수 함수), 문구는 data.js. 화면 순서: 도입 → 준비 → 기계 → 운송 → 새 사회 → 마무리 글 */
const CONFIG = {
  SHEET_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec",
  /* 포털 커리큘럼 관리에 이 id 하나로 활동을 등록한다 */
  GAME_NAME: "33차시_산업혁명_공장시뮬레이션",
  SPIN_SECONDS: 10
};

const S = {
  sid: "", name: "", grade: 0, ban: 0, preview: false, screen: "s1",
  placed: {}, selSlot: "", tries1: 0, done1: false,
  spinTool: "wheel", spin: {}, loomSteam: false, loomOn: [], loomMax: { hand: 0, steam: 0 }, engineTried: false, done2: false,
  land: "", sea: "", ran: false, steamPicked: [], done3: false,
  roles: {}, rolesOk: false, order: SPREAD_START.slice(), done4: false,
  gear: "", copied: false, sending: false, submitted: false, padletUrl: ""
};

/* 화면 목록: 값은 위쪽 단계 막대의 data-k */
const SCREENS = { s0: "", s1: "ready", s2: "machine", s3: "move", s4: "society", s5: "wrap" };
const STAGES = ["ready", "machine", "move", "society", "wrap"];
const SAVE_KEYS = ["screen", "placed", "tries1", "done1", "spin", "loomMax", "engineTried", "done2", "land", "sea", "ran", "steamPicked", "done3", "roles", "rolesOk", "order", "done4", "gear"];

const $ = id => document.getElementById(id);
const byId = (arr, id) => arr.find(x => x.id === id);
const val = id => $(id).value.trim();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function show(key) {
  Object.keys(SCREENS).forEach(k => { $(k).hidden = (k !== key); });
  const stage = SCREENS[key];
  $("steps").hidden = !stage;
  const cur = STAGES.indexOf(stage);
  document.querySelectorAll("#steps li").forEach(li => {
    const i = STAGES.indexOf(li.dataset.k);
    li.className = i === cur ? "on" : (i < cur ? "done" : "");
    if (i === cur) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
  if (key !== "s0") { S.screen = key; save(); }
  window.scrollTo(0, 0);
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
}

function parseSid(sid) {
  if (!/^\d{5}$/.test(sid)) return null;
  return { grade: Number(sid[0]), ban: Number(sid.slice(1, 3)), num: Number(sid.slice(3)) };
}

/* ── 진행 기억: 새로고침해도 이어서. 학번별 키라 공용 태블릿에서 안 섞인다. 미리보기에선 저장하지 않는다.
 *    글 칸은 draft_guard가 따로 맡는다. */
function storeKey() { return "ir_simulator:" + CONFIG.GAME_NAME + ":" + S.sid; }

function save() {
  if (S.preview || !S.sid) return;
  const v = { ts: Date.now() };
  SAVE_KEYS.forEach(k => { v[k] = S[k]; });
  try { localStorage.setItem(storeKey(), JSON.stringify(v)); } catch (e) { /* 저장소가 막히면 메모리만 */ }
}

function load() {
  if (S.preview) return;
  try {
    const v = JSON.parse(localStorage.getItem(storeKey()) || "null");
    if (!v || Date.now() - (v.ts || 0) > 7 * 864e5) return; // 7일 지난 기록은 버린다
    SAVE_KEYS.forEach(k => { if (v[k] !== undefined) S[k] = v[k]; });
    if (!Array.isArray(S.order) || S.order.length !== SPREAD.length) S.order = SPREAD_START.slice();
  } catch (e) { /* 무시 */ }
}

function clearSave() {
  try { localStorage.removeItem(storeKey()); } catch (e) { /* 무시 */ }
}

/* ── 시트 전송 ── */
async function postToSheet(payload) {
  if (S.preview) return { result: "success", preview: true };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000); // 응답이 안 오면 30초 뒤 실패로 돌려 다시 누르게 한다
  let json;
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL, { method: "POST", body: JSON.stringify(payload), signal: ctl.signal });
    json = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (json.result !== "success") {
    const err = new Error(json.message || "저장 실패");
    err.locked = !!json.locked;
    throw err;
  }
  return json;
}

/* 패들렛 링크는 백엔드 학년정보(포트폴리오)에서 가져온다. 반 정보가 든 링크라 레포에 적지 않는다. */
function ensureUrlScheme(u) {
  u = String(u || "").trim();
  return u && !/^https?:\/\//i.test(u) ? "https://" + u : u;
}

async function loadPadletUrl(grade, ban) {
  try {
    const res = await fetch(CONFIG.SHEET_WEBAPP_URL + "?mode=curriculum");
    const json = await res.json();
    const pf = json && json.grades && json.grades[String(grade)] && json.grades[String(grade)].portfolio;
    if (!pf) return "";
    return ensureUrlScheme(pf.urlByBan ? (pf.urlByBan[ban] || pf.urlByBan[String(ban)] || "") : (pf.url || ""));
  } catch (e) {
    return "";
  }
}

/* ── 공용 조각: 버튼 대신 role=radio/checkbox div — 버튼 안은 glossary.js가 밑줄을 못 긋는다 ── */
function choiceRow(text, checked, role, onPick) {
  const row = el("div", "opt");
  row.setAttribute("role", role);
  row.tabIndex = 0;
  row.setAttribute("aria-checked", checked ? "true" : "false");
  row.appendChild(el("span", role === "checkbox" ? "opt-box sq" : "opt-box"));
  row.appendChild(el("span", "opt-text", text));
  row.addEventListener("click", () => onPick(row)); // 밑줄 낱말을 눌러도 고르기는 된다(풀이 시트도 같이 열린다)
  row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(row); } });
  return row;
}

function radioGroup(box, options, getVal, setVal) {
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  options.forEach(o => {
    const label = (o.icon ? o.icon + " " : "") + o.name;
    box.appendChild(choiceRow(label, getVal() === o.id, "radio", row => {
      setVal(o.id); save();
      box.querySelectorAll(".opt").forEach(r => r.setAttribute("aria-checked", r === row ? "true" : "false"));
    }));
  });
}

function textbookBox(labelId, textId, label, text) {
  $(labelId).textContent = label;
  $(textId).textContent = text;
}

/* ── 시작 ── */
function startApp() {
  const sid = $("sid").value.trim();
  const name = $("sname").value.trim();
  const p = parseSid(sid);
  if (!p) { $("startErr").textContent = "학번은 숫자 5자리로 써 줘. (예: 20512)"; return; }
  if (!name) { $("startErr").textContent = "이름을 써 줘."; return; }
  $("startErr").textContent = "";
  S.sid = sid; S.name = name; S.grade = p.grade; S.ban = p.ban;
  FocusGuard.start({ key: CONFIG.GAME_NAME + ":" + sid }); // 작성 중 화면 이탈·붙여넣기 기록 (history26 snippets/focus_guard.js)
  if (window.DraftGuard) DraftGuard.start({ key: CONFIG.GAME_NAME, sid: sid }); // 글쓰기 칸 임시저장 (history26 v75)
  loadPadletUrl(p.grade, p.ban).then(u => { S.padletUrl = u; renderPadlet(); });
  load();
  renderAll();
  show(S.screen && SCREENS[S.screen] ? S.screen : "s1");
  setTimeout(refreshCounts, 700); // draft_guard가 글을 되살린 뒤 글자 수·요약을 다시 그린다
}

function refreshCounts() {
  $("w1c").textContent = val("w1").length + "자";
  renderSummary();
}

function renderAll() {
  renderStep1(); renderStep2(); renderStep3(); renderStep4(); renderWrap();
}

/* ── 1단: 준비 (160쪽) — 짧은 낱말 카드(공장에 필요한 것)를 긴 문장 카드에 끌어다 붙인다.
 *    끌기가 어려운 학생은 낱말 카드를 누르고 문장 카드를 눌러도 된다. S.placed = { 낱말 카드(칸)id: 카드id } ── */
function shuffled(arr, seed) {
  /* 학번으로 섞는 순서를 고정한다(새로고침해도 카드 자리가 안 바뀌게) */
  let s = Number(seed) || 7;
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function slotOfCard(cardId) {
  return Object.keys(S.placed).find(k => S.placed[k] === cardId) || "";
}

function tagEl(s, cls) {
  const t = el("div", "tag" + (cls ? " " + cls : ""));
  t.appendChild(el("span", "tag-icon", s.icon));
  t.appendChild(el("span", "tag-name", s.name));
  return t;
}

function renderStep1() {
  const tray = $("slotList"), facts = $("factList");
  tray.innerHTML = ""; facts.innerHTML = "";
  SLOTS.forEach(s => {
    if (S.placed[s.id]) return; // 붙인 낱말 카드는 위 낱말 카드 칸에서 뺀다
    const t = tagEl(s);
    t.dataset.slot = s.id;
    t.setAttribute("role", "button");
    t.tabIndex = 0;
    t.setAttribute("aria-pressed", S.selSlot === s.id ? "true" : "false");
    t.addEventListener("pointerdown", e => { if (!S.done1) dragStart(e, s.id, TAG_DRAG); });
    t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickTag(s.id); } });
    tray.appendChild(t);
  });
  if (!tray.children.length) tray.appendChild(el("p", "note", S.done1 ? "모두 붙였어!" : "낱말 카드를 모두 붙였어. «맞춰 보기»를 눌러 봐."));
  shuffled(FACT_CARDS, S.sid).forEach(c => {
    const card = el("div", "fact");
    card.dataset.card = c.id;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.appendChild(el("p", "fact-text", c.text));
    const sid = slotOfCard(c.id);
    const pocket = el("div", "pocket");
    if (sid) {
      const t = tagEl(byId(SLOTS, sid), "stuck");
      pocket.appendChild(t);
      card.classList.add("filled");
    } else {
      pocket.appendChild(el("span", "pocket-empty", S.selSlot ? "여기에 붙이기" : "낱말 카드를 여기에"));
    }
    card.appendChild(pocket);
    if (S.done1) card.classList.add("ok");
    if (S.selSlot && !sid) card.classList.add("ready");
    const act = e => { if (e.target.closest && e.target.closest(".term")) return; pickCard(c.id); };
    card.addEventListener("click", act);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickCard(c.id); } });
    facts.appendChild(card);
  });
  $("s1Check").hidden = S.done1;
  $("s1Done").hidden = !S.done1;
  $("s1Next").disabled = !S.done1;
}

function pickTag(slotId) {
  if (S.done1) return;
  S.selSlot = S.selSlot === slotId ? "" : slotId;
  $("s1Msg").textContent = "";
  renderStep1();
}

function stick(slotId, cardId) {
  const old = slotOfCard(cardId);
  if (old) delete S.placed[old]; // 카드에 이미 붙은 낱말 카드는 위로 돌려보낸다
  S.placed[slotId] = cardId;
  S.selSlot = "";
  save();
  renderStep1();
}

function pickCard(cardId) {
  if (S.done1) return;
  $("s1Msg").textContent = "";
  if (S.selSlot) { stick(S.selSlot, cardId); return; }
  const old = slotOfCard(cardId);
  if (old) { delete S.placed[old]; save(); renderStep1(); return; } // 붙은 낱말 카드를 누르면 떨어진다
  $("s1Msg").textContent = "위 낱말 카드를 먼저 골라 줘.";
}

/* 끌기: 손가락·마우스 모두 pointer 이벤트로. 조금이라도 움직여야 끌기로 보고, 안 움직이면 누르기(onTap)로 본다.
 * 1단 낱말 카드와 2단 일꾼 배치가 같이 쓴다. opt = { target: 놓을 곳 선택자, ghost: () => 끌리는 모양, onTap(id), onDrop(id, 놓은 곳), onCancel() } */
const drag = { id: "", x: 0, y: 0, ghost: null, moved: false, over: null, opt: null };

function dragStart(e, id, opt) {
  if (e.button !== undefined && e.button !== 0) return;
  drag.id = id; drag.x = e.clientX; drag.y = e.clientY; drag.moved = false; drag.over = null; drag.opt = opt;
  e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
  e.currentTarget.addEventListener("pointermove", dragMove);
  e.currentTarget.addEventListener("pointerup", dragEnd);
  e.currentTarget.addEventListener("pointercancel", dragEnd);
}

function dragMove(e) {
  if (!drag.id) return;
  if (!drag.moved) {
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
    drag.moved = true;
    drag.ghost = drag.opt.ghost();
    drag.ghost.classList.add("ghost");
    document.body.appendChild(drag.ghost);
    e.currentTarget.classList.add("lifted");
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + "px";
  drag.ghost.style.top = e.clientY + "px";
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const spot = under && under.closest ? under.closest(drag.opt.target) : null;
  if (drag.over !== spot) {
    if (drag.over) drag.over.classList.remove("hover");
    if (spot) spot.classList.add("hover");
    drag.over = spot;
  }
  /* 화면 끝에 닿으면 조금씩 스크롤(폰에서 아래쪽까지 끌고 갈 수 있게) */
  if (e.clientY < 70) window.scrollBy(0, -14);
  else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
}

function dragEnd(e) {
  const t = e.currentTarget;
  t.removeEventListener("pointermove", dragMove);
  t.removeEventListener("pointerup", dragEnd);
  t.removeEventListener("pointercancel", dragEnd);
  const id = drag.id, moved = drag.moved, over = drag.over, opt = drag.opt;
  if (drag.ghost) drag.ghost.remove();
  if (over) over.classList.remove("hover");
  drag.id = ""; drag.ghost = null; drag.over = null; drag.opt = null;
  t.classList.remove("lifted");
  if (!id) return;
  if (!moved) { opt.onTap(id); return; }
  if (over && e.type === "pointerup") { opt.onDrop(id, over); return; }
  opt.onCancel();
}

const TAG_DRAG = {
  target: ".fact",
  ghost: () => tagEl(byId(SLOTS, drag.id)),
  onTap: id => pickTag(id),
  onDrop: (id, card) => { $("s1Msg").textContent = ""; stick(id, card.dataset.card); },
  onCancel: () => renderStep1()
};

function checkStep1() {
  if (Object.keys(S.placed).length < SLOTS.length) { $("s1Msg").textContent = "낱말 카드 다섯 개를 모두 붙여 줘."; return; }
  const wrong = wrongSlots(S.placed, FACT_CARDS, SLOTS);
  if (wrong.length) {
    S.tries1 = (S.tries1 || 0) + 1;
    if (S.tries1 >= STEP1.maxTries) {
      S.placed = answerPlacement(FACT_CARDS); // 세 번 틀리면 정답을 보여 주고 넘어간다
      S.done1 = true; S.selSlot = ""; save();
      renderStep1();
      $("s1Msg").textContent = "";
      toast("정답을 붙여 뒀어. 문장과 낱말 카드를 한 번 더 읽어 봐.");
      $("slotList").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    wrong.forEach(id => { delete S.placed[id]; }); // 틀린 낱말 카드는 위로 돌려보낸다
    save();
    renderStep1();
    const left = STEP1.maxTries - S.tries1;
    $("s1Msg").textContent = wrong.length + "개가 달라. 틀린 낱말 카드는 위로 돌아갔어. 다시 붙여 봐. (" +
      (left === 1 ? "한 번 더 틀리면 정답을 보여 줄게" : "기회 " + left + "번 남음") + ")";
    return;
  }
  S.done1 = true; save();
  renderStep1();
  toast("공장 세울 준비 끝!");
  $("s1Done").scrollIntoView({ behavior: "smooth", block: "start" });
}

function goStep2() {
  if (!S.done1) return;
  if (val("p1").length < 1) { $("s1Err").textContent = "맨 위 칸에 떠오른 것 하나를 써 줘."; return; }
  $("s1Err").textContent = "";
  show("s2");
}

/* ── 2단: 기계 (161쪽) ── */
const spinRun = { on: false, left: 0, taps: 0, timer: null, ended: 0 };

function renderStep2() {
  const tabs = $("spinTabs");
  tabs.innerHTML = "";
  tabs.setAttribute("role", "radiogroup");
  SPINNERS.forEach((t, i) => {
    const prevDone = i === 0 || S.spin[SPINNERS[i - 1].id] !== undefined;
    const b = el("button", "spin-tab", t.name + (S.spin[t.id] !== undefined ? " ✓" : (prevDone ? "" : " 🔒")));
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", S.spinTool === t.id ? "true" : "false");
    b.disabled = !prevDone || spinRun.on;
    b.addEventListener("click", () => { S.spinTool = t.id; resetSpinFace(); renderStep2(); });
    tabs.appendChild(b);
  });
  const tool = byId(SPINNERS, S.spinTool);
  $("spinName").textContent = tool.name + " — 한 번 누르면 " + tool.perTap + "가닥";
  $("spinCap").textContent = tool.cap;
  $("spinImg").src = tool.img;
  $("spinImg").alt = tool.name + " 그림";
  renderBars();
  const allSpun = SPINNERS.every(t => S.spin[t.id] !== undefined);
  $("loomCard").hidden = !allSpun;
  if (allSpun) renderLooms();
  $("s2Done").hidden = !S.done2;
  $("s2Next").disabled = !S.done2;
}

function resetSpinFace() {
  if (spinRun.on) return;
  $("spinTime").textContent = CONFIG.SPIN_SECONDS.toFixed(1);
  $("spinCount").textContent = "0";
  $("spinBtnText").textContent = "👆 그림을 눌러 시작";
  $("spinYarn").innerHTML = "";
}

function renderBars() {
  const box = $("spinResult");
  box.innerHTML = "";
  const done = SPINNERS.filter(t => S.spin[t.id] !== undefined);
  if (!done.length) return;
  box.appendChild(el("div", "bars-title", "10초 동안 뽑은 실"));
  const max = Math.max(1, ...done.map(t => S.spin[t.id]));
  done.forEach(t => {
    const row = el("div", "bar-row");
    row.appendChild(el("span", "bar-name", t.name));
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");
    fill.style.width = Math.max(1, Math.round(S.spin[t.id] / max * 100)) + "%";
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el("span", "bar-num", S.spin[t.id].toLocaleString() + "가닥"));
    box.appendChild(row);
  });
}

/* 그림을 누를 때마다 기계가 한 번 돌고(흔들림), «+가닥 수»가 떠오르고, 아래 실 묶음이 늘어난다.
 * 많이 누를수록 많이 뽑힌다는 것을 눈으로 보게 한다(2026-10-29 «중간 버튼 대신 그림을 눌러 움직이게»). */
function spinTap() {
  if (Date.now() - spinRun.ended < 800) return; // 끝나자마자 눌린 것은 무시(새 판이 바로 시작되지 않게)
  const tool = byId(SPINNERS, S.spinTool);
  const btn = $("spinBtn");
  if (!spinRun.on) {
    spinRun.on = true; spinRun.taps = 0; spinRun.left = CONFIG.SPIN_SECONDS * 10;
    $("spinBtnText").textContent = "계속 눌러!";
    $("spinYarn").innerHTML = "";
    btn.classList.add("running");
    renderStep2();
    spinRun.timer = setInterval(() => {
      spinRun.left -= 1;
      $("spinTime").textContent = (spinRun.left / 10).toFixed(1);
      if (spinRun.left <= 0) endSpin();
    }, 100);
  }
  spinRun.taps += 1;
  $("spinCount").textContent = threads(spinRun.taps, tool.perTap).toLocaleString();
  btn.classList.remove("kick");
  void btn.offsetWidth; // 같은 움직임을 누를 때마다 다시 시작
  btn.classList.add("kick");
  const pop = el("span", "spin-pop", "+" + tool.perTap);
  pop.style.left = (25 + Math.random() * 50) + "%";
  $("spinPops").appendChild(pop);
  setTimeout(() => pop.remove(), 900);
  const yarn = $("spinYarn");
  if (yarn.children.length < 60) yarn.appendChild(el("span", "strand s-" + tool.id));
}

function endSpin() {
  clearInterval(spinRun.timer);
  spinRun.on = false; spinRun.ended = Date.now();
  $("spinBtn").classList.remove("running", "kick");
  const tool = byId(SPINNERS, S.spinTool);
  S.spin[tool.id] = threads(spinRun.taps, tool.perTap);
  const next = SPINNERS[SPINNERS.indexOf(tool) + 1];
  const moved = next && S.spin[next.id] === undefined;
  if (moved) S.spinTool = next.id;
  save();
  renderStep2();
  if (moved) { resetSpinFace(); }
  else {
    $("spinBtnText").textContent = "다시 하려면 그림을 눌러";
    $("spinTime").textContent = "0.0";
    $("spinCount").textContent = S.spin[tool.id].toLocaleString();
  }
  toast(tool.name + ": " + S.spin[tool.id].toLocaleString() + "가닥!" + (moved ? " 이제 " + next.name + "!" : ""));
}

/* 방직기: 일꾼(👷)을 끌어다 놓아 배치한다(2026-10-29 «기계를 누른다는 걸 애들이 이해 못할 듯»).
 * 증기 기관이 없으면 한 사람이 방직기 1대(자리 = 방직기). 증기 기관 공장에서는 한 사람이 한 줄(3대)을 살핀다(자리 = 줄).
 * 그래서 6대를 다 돌려도 사람이 남는다. 기관을 멈춰 보면 방직기가 모두 서는 것으로 «동력»을 느끼게 한다. */
const engine = { on: true };
let selWorker = false;

function spotsCount(steam) { return steam ? Math.ceil(LOOM.looms / LOOM.perWorkerSteam) : LOOM.looms; }
function runningNow() { return S.loomSteam && !engine.on ? 0 : runningLooms(S.loomSteam, S.loomOn.length, LOOM); }

function workerEl(cls) { return el("span", "worker" + (cls ? " " + cls : ""), "👷"); }

const WORKER_DRAG = {
  target: ".spot",
  ghost: () => workerEl(),
  onTap: () => {
    selWorker = !selWorker; renderLooms();
    if (selWorker) { const s = document.querySelector(".spot.ready"); if (s) s.focus(); } // 키보드: 고른 뒤 바로 빈자리로
  },
  onDrop: (id, spot) => placeWorker(Number(spot.dataset.spot)),
  onCancel: () => renderLooms()
};

function renderLooms() {
  const steam = S.loomSteam;
  $("loomHand").setAttribute("aria-checked", steam ? "false" : "true");
  $("loomSteam").setAttribute("aria-checked", steam ? "true" : "false");
  $("loomRule").textContent = steam ? STEP2.loomRuleSteam : STEP2.loomRuleHand;
  $("workerHow").textContent = steam ? STEP2.workerHowSteam : STEP2.workerHowHand;
  const box = $("engineBox");
  box.hidden = !steam;
  box.classList.toggle("off", !engine.on);
  box.classList.toggle("run", engine.on && S.loomOn.length > 0);
  $("engineBtn").textContent = engine.on ? STEP2.engineBtnStop : STEP2.engineBtnGo;
  $("engineBtn").disabled = steam && S.loomOn.length === 0 && engine.on;

  /* 아직 배치하지 않은 사람 */
  const w = $("workers");
  w.innerHTML = "";
  const free = LOOM.workers - S.loomOn.length;
  for (let i = 0; i < free; i++) {
    const sel = selWorker && i === 0;
    const t = workerEl("free" + (sel ? " sel" : ""));
    t.setAttribute("role", "button");
    t.tabIndex = 0;
    t.setAttribute("aria-label", "일할 사람");
    t.setAttribute("aria-pressed", sel ? "true" : "false");
    t.addEventListener("pointerdown", e => dragStart(e, "w", WORKER_DRAG));
    t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); WORKER_DRAG.onTap(); } });
    w.appendChild(t);
  }
  const allRun = S.loomOn.length === spotsCount(steam);
  w.appendChild(el("span", "worker-note",
    !free ? "남은 사람 없음" : allRun ? "방직기를 맡지 않은 사람 " + free + "명" : "기다리는 사람 " + free + "명"));
  w.classList.toggle("idle", allRun && free > 0);

  /* 방직기: 증기 기관이 없으면 방직기마다 자리, 있으면 줄마다 자리 */
  const grid = $("loomGrid");
  grid.innerHTML = "";
  grid.classList.toggle("steam", steam);
  grid.classList.toggle("halted", steam && !engine.on);
  const loomBox = (i, on) => {
    const b = el("div", "loom" + (on ? " on" : ""));
    b.innerHTML = (steam ? '<span class="belt"></span>' : "") +
      '<span class="loom-frame"><span class="cloth"></span><span class="shuttle"></span></span><span class="loom-no">' + (i + 1) + "</span>";
    return b;
  };
  const seat = staffed => {
    const s = el("span", "seat");
    s.appendChild(staffed ? workerEl("placed") : el("span", "seat-empty", "빈자리"));
    return s;
  };
  for (let k = 0; k < spotsCount(steam); k++) {
    const staffed = S.loomOn.indexOf(k) >= 0;
    const spot = el("div", "spot" + (staffed ? " staffed" : "") + (selWorker && !staffed ? " ready" : ""));
    spot.dataset.spot = k;
    spot.setAttribute("role", "button");
    spot.tabIndex = 0;
    if (steam) {
      spot.classList.add("loom-row");
      spot.setAttribute("aria-label", "방직기 줄 " + (k + 1) + (staffed ? ", 사람 있음" : ", 비어 있음"));
      spot.appendChild(seat(staffed));
      for (let j = 0; j < LOOM.perWorkerSteam; j++) {
        const i = k * LOOM.perWorkerSteam + j;
        if (i < LOOM.looms) spot.appendChild(loomBox(i, staffed));
      }
    } else {
      spot.setAttribute("aria-label", "방직기 " + (k + 1) + (staffed ? ", 사람 있음" : ", 비어 있음"));
      spot.appendChild(loomBox(k, staffed));
      spot.appendChild(seat(staffed));
    }
    spot.addEventListener("click", () => tapSpot(k));
    spot.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapSpot(k); } });
    grid.appendChild(spot);
  }
  $("loomMsg").textContent = "돌아가는 방직기 " + runningNow() + "대 / " + LOOM.looms + "대";
}

function tapSpot(k) {
  const at = S.loomOn.indexOf(k);
  if (at >= 0) { S.loomOn.splice(at, 1); renderLooms(); save(); return; } // 배치한 사람을 누르면 위로 돌아간다
  if (selWorker) { placeWorker(k); return; }
  $("loomMsg").textContent = S.loomOn.length < LOOM.workers
    ? "위의 사람(👷)을 끌어다 여기에 놓아 줘. 사람을 먼저 누르고 여기를 눌러도 돼."
    : "일할 사람이 모자라! 남은 사람이 없어.";
}

function placeWorker(k) {
  selWorker = false;
  if (S.loomSteam && !engine.on) { renderLooms(); $("loomMsg").textContent = "증기 기관이 멈춰 있어서 방직기를 돌릴 힘이 없어. 증기 기관을 다시 돌려 봐."; return; }
  if (S.loomOn.indexOf(k) >= 0) { renderLooms(); return; }
  if (S.loomOn.length >= LOOM.workers) { renderLooms(); $("loomMsg").textContent = "일할 사람이 모자라! 남은 사람이 없어."; return; }
  S.loomOn.push(k);
  const mode = S.loomSteam ? "steam" : "hand";
  S.loomMax[mode] = Math.max(S.loomMax[mode], runningLooms(S.loomSteam, S.loomOn.length, LOOM));
  renderLooms();
  const msg = $("loomMsg");
  if (!S.loomSteam && S.loomOn.length === LOOM.workers) {
    msg.textContent += " — 사람이 모두 일하는데 방직기 " + (LOOM.looms - LOOM.workers) + "대는 멈춰 있어." + (S.loomMax.steam ? "" : " 이번엔 «증기 기관 공장»으로 바꿔 봐.");
  }
  if (S.loomSteam && runningNow() === LOOM.looms) {
    const left = LOOM.workers - S.loomOn.length;
    msg.textContent = "방직기 " + LOOM.looms + "대가 모두 돌아가! " + S.loomOn.length + "명이면 충분했어. 남은 " + left + "명은 이 공장에서 맡을 방직기가 없어." +
      (S.engineTried ? "" : " " + STEP2.engineAsk);
  }
  save();
  checkDone2();
}

function toggleEngine() {
  engine.on = !engine.on;
  renderLooms();
  if (!engine.on) {
    $("loomMsg").textContent = STEP2.engineStopped;
    if (runningLooms(true, S.loomOn.length, LOOM) === LOOM.looms && !S.engineTried) { S.engineTried = true; save(); }
  }
  checkDone2();
}

/* 두 공장을 다 돌려 보고, 증기 기관을 멈춰 본 뒤에 교과서 정리를 연다(순서는 상관없다) */
function checkDone2() {
  if (S.done2 || !S.engineTried || S.loomMax.hand < runningLooms(false, LOOM.workers, LOOM) || S.loomMax.steam < LOOM.looms) return;
  const msg = $("loomMsg").textContent;
  S.done2 = true; save();
  renderStep2();
  $("loomMsg").textContent = msg;
  setTimeout(() => $("s2Done").scrollIntoView({ behavior: "smooth", block: "start" }), 1200);
}

function setLoomMode(steam) {
  if (S.loomSteam === steam) return;
  S.loomSteam = steam; S.loomOn = []; engine.on = true; selWorker = false;
  renderLooms();
}

function goStep3() {
  if (!S.done2) return;
  if (val("w1").length < 2) { $("s2Err").textContent = "달라진 점을 한 문장 써 줘."; return; }
  $("s2Err").textContent = "";
  show("s3");
}

/* ── 3단: 운송 (161쪽) ── */
function renderStep3() {
  radioGroup($("landPick"), VEHICLES.land, () => S.land, v => { S.land = v; clearRace(); });
  radioGroup($("seaPick"), VEHICLES.sea, () => S.sea, v => { S.sea = v; clearRace(); });
  $("steamCard").hidden = !S.ran;
  const list = $("steamList");
  list.innerHTML = "";
  STEAM_ITEMS.forEach(it => {
    list.appendChild(choiceRow(it.name, S.steamPicked.indexOf(it.id) >= 0, "checkbox", row => {
      if (S.done3) return;
      const k = S.steamPicked.indexOf(it.id);
      if (k >= 0) S.steamPicked.splice(k, 1); else S.steamPicked.push(it.id);
      row.setAttribute("aria-checked", k >= 0 ? "false" : "true");
      $("steamMsg").textContent = "";
      save();
    }));
  });
  $("steamCheck").hidden = S.done3;
  $("s3Done").hidden = !S.done3;
  $("s3Next").disabled = !S.done3;
}

/* 출발하면 네 가지 길(육지 2 × 바다 2)을 한 번에 달려 내가 고른 길과 비교한다(2026-10-29 «매번 눌러 보지 않을 것»).
 * 빠르기(초)는 그림 속 비교용일 뿐 실제 걸린 시간이 아니다. */
function legSec(v) { return v.fast ? 1.2 : 4; }

/* 탈것을 바꾸면 지난 결과(내 선택·순위)를 지운다. 달리는 중이면 그대로 둔다. */
function clearRace() {
  if ($("goBtn").disabled) return;
  $("race").hidden = true; $("race").innerHTML = ""; $("routeMsg").textContent = "";
}

function runRoute() {
  if (!S.land || !S.sea) { $("routeMsg").textContent = "육지와 바다에서 탈 것을 하나씩 골라 줘."; return; }
  const combos = [];
  VEHICLES.land.forEach(l => VEHICLES.sea.forEach(s => combos.push({ land: l, sea: s, mine: l.id === S.land && s.id === S.sea })));
  combos.sort((a, b) => b.mine - a.mine); // 내 선택을 맨 위에
  const race = $("race");
  race.innerHTML = "";
  race.hidden = false;
  const ends = el("div", "race-ends");
  ["공장", "항구", "먼 시장"].forEach(t => ends.appendChild(el("span", "", t)));
  race.appendChild(ends);
  combos.forEach(c => {
    c.total = legSec(c.land) + legSec(c.sea);
    const lane = el("div", "lane" + (c.mine ? " mine" : ""));
    const name = el("div", "lane-name");
    if (c.mine) name.appendChild(el("b", "mine-badge", "내 선택"));
    name.appendChild(el("span", "", c.land.name + " → " + c.sea.name));
    c.rank = el("span", "lane-rank", "");
    name.appendChild(c.rank);
    lane.appendChild(name);
    const track = el("div", "lane-track");
    track.appendChild(el("span", "leg-land"));
    track.appendChild(el("span", "leg-sea"));
    c.runner = el("span", "runner");
    c.img = el("img");
    c.img.alt = "";
    c.runner.appendChild(c.img);
    track.appendChild(c.runner);
    lane.appendChild(track);
    race.appendChild(lane);
  });
  const ranks = combos.map(c => 1 + combos.filter(o => o.total < c.total).length);
  $("goBtn").disabled = true;
  $("routeMsg").textContent = "가는 중…";
  /* 움직임 줄이기 설정이면 달리는 모습 없이 바로 도착 결과를 보여 준다 */
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const t0 = performance.now() - (still ? 60000 : 0);
  const longest = Math.max(...combos.map(c => c.total));
  const frame = now => {
    const t = (now - t0) / 1000;
    combos.forEach((c, i) => {
      const onLand = t < legSec(c.land);
      const v = onLand ? c.land : c.sea;
      const p = onLand ? 0.5 * t / legSec(c.land) : 0.5 + 0.5 * Math.min(1, (t - legSec(c.land)) / legSec(c.sea));
      if (c.img.dataset.v !== v.id) { c.img.src = v.img; c.img.dataset.v = v.id; c.runner.classList.toggle("smoke", v.fast); }
      c.runner.style.left = "calc((100% - var(--runner-w)) * " + p.toFixed(4) + ")";
      if (p >= 1 && !c.done) { c.done = true; c.runner.classList.remove("smoke"); c.rank.textContent = ranks[i] + "등 도착"; }
    });
    if (t < longest + 0.1) requestAnimationFrame(frame);
    else finishRoute(combos, ranks);
  };
  requestAnimationFrame(frame);
}

function finishRoute(combos, ranks) {
  $("goBtn").disabled = false;
  const k = combos.findIndex(c => c.mine), mine = combos[k];
  const best = combos.find((c, i) => ranks[i] === 1);
  $("routeMsg").textContent = mine === best
    ? "내가 고른 길이 가장 먼저 도착했어! 말이나 바람 대신 무엇의 힘으로 갔을까?"
    : "내가 고른 길은 " + ranks[k] + "등으로 도착했어. 가장 먼저 도착한 길은 " + best.land.name + " → " + best.sea.name + "이야. 둘은 무엇이 달랐을까?";
  if (!S.ran) { S.ran = true; save(); renderStep3(); }
}

function checkSteam() {
  if (!steamCorrect(S.steamPicked, STEAM_ITEMS)) {
    $("steamMsg").textContent = S.steamPicked.length ? "아직 달라. 힌트를 보고 다시 골라 봐." : "하나 이상 골라 줘.";
    return;
  }
  S.done3 = true; save();
  renderStep3();
  toast("천이 먼 시장에 도착했어!");
  $("s3Done").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── 4단: 새 사회 (162쪽) ── */
function renderStep4() {
  const box = $("roleList");
  box.innerHTML = "";
  ROLE_CARDS.forEach(c => {
    const row = el("div", "role-row");
    row.dataset.card = c.id;
    row.appendChild(el("p", "role-text", c.text));
    const pick = el("div", "role-pick");
    pick.setAttribute("role", "radiogroup");
    pick.setAttribute("aria-label", c.text);
    ROLES.forEach(r => {
      pick.appendChild(choiceRow(r.name, S.roles[c.id] === r.id, "radio", rowEl => {
        if (S.rolesOk) return;
        S.roles[c.id] = r.id; save();
        pick.querySelectorAll(".opt").forEach(x => x.setAttribute("aria-checked", x === rowEl ? "true" : "false"));
        row.classList.remove("wrong");
        $("roleMsg").textContent = "";
      }));
    });
    row.appendChild(pick);
    box.appendChild(row);
  });
  $("roleCheck").hidden = S.rolesOk;
  $("orderCard").hidden = !S.rolesOk;
  renderOrder();
  $("s4Done").hidden = !S.done4;
  $("s4Next").disabled = !S.done4;
}

function checkRoles() {
  const wrong = wrongRoles(S.roles, ROLE_CARDS);
  document.querySelectorAll(".role-row").forEach(r => r.classList.toggle("wrong", wrong.indexOf(r.dataset.card) >= 0));
  if (wrong.length) { $("roleMsg").textContent = wrong.length + "개가 달라. 표시된 줄을 다시 골라 봐."; return; }
  S.rolesOk = true; save();
  renderStep4();
  $("orderCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderOrder() {
  const ol = $("orderList");
  ol.innerHTML = "";
  S.order.forEach((id, i) => {
    const item = byId(SPREAD, id);
    const li = el("li", "order-item");
    li.appendChild(el("span", "order-no", String(i + 1)));
    li.appendChild(el("span", "order-name", item.name + (S.done4 ? " — " + item.when : "")));
    if (!S.done4) {
      const up = el("button", "btn btn-ghost btn-sm", "▲");
      up.type = "button"; up.disabled = i === 0; up.setAttribute("aria-label", item.name + " 위로");
      up.addEventListener("click", () => { S.order = moveItem(S.order, i, -1); $("orderMsg").textContent = ""; save(); renderOrder(); });
      const dn = el("button", "btn btn-ghost btn-sm", "▼");
      dn.type = "button"; dn.disabled = i === S.order.length - 1; dn.setAttribute("aria-label", item.name + " 아래로");
      dn.addEventListener("click", () => { S.order = moveItem(S.order, i, 1); $("orderMsg").textContent = ""; save(); renderOrder(); });
      li.appendChild(up); li.appendChild(dn);
    }
    ol.appendChild(li);
  });
  $("orderCheck").hidden = S.done4;
}

function checkOrder() {
  if (!orderCorrect(S.order, SPREAD.map(s => s.id))) { $("orderMsg").textContent = "아직 달라. 이 공장이 처음 세워진 나라가 어디였지?"; return; }
  S.done4 = true; save();
  renderStep4();
  toast("산업 혁명이 퍼져 나갔어!");
  $("s4Done").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── 마무리: 톱니바퀴 고르기 + 글 ── */
const GEAR_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path class="gear-body" d="M43 6h14l2 11 8 3 9-7 10 10-7 9 3 8 11 2v14l-11 2-3 8 7 9-10 10-9-7-8 3-2 11H43l-2-11-8-3-9 7-10-10 7-9-3-8-11-2V43l11-2 3-8-7-9 10-10 9 7 8-3z"/><circle cx="50" cy="50" r="13" class="gear-hole"/></svg>';

function renderWrap() {
  const box = $("gearList");
  box.innerHTML = "";
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-labelledby", "wrapQ");
  GEARS.forEach(g => {
    const card = el("div", "gear");
    card.setAttribute("role", "radio");
    card.tabIndex = 0;
    card.setAttribute("aria-checked", S.gear === g.id ? "true" : "false");
    const icon = el("span", "gear-icon");
    icon.innerHTML = GEAR_SVG;
    card.appendChild(icon);
    const t = el("span", "gear-text");
    t.appendChild(el("b", "gear-name", g.name));
    t.appendChild(el("span", "gear-sub", g.sub));
    card.appendChild(t);
    const pick = () => {
      if (S.submitted) return; // 제출 뒤에는 고르기를 잠근다(시트에 간 글과 복사 글이 어긋나지 않게)
      S.gear = g.id; save();
      box.querySelectorAll(".gear").forEach(x => x.setAttribute("aria-checked", x === card ? "true" : "false"));
      $("s5Err").textContent = "";
      renderSummary();
    };
    card.addEventListener("click", pick);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    box.appendChild(card);
  });
  renderSummary();
}

/* 복사 글: 학번·이름 한 줄과 [고른 톱니바퀴] 한 줄만 붙이고 나머지는 학생이 쓴 글 */
function gearName() { const g = byId(GEARS, S.gear); return g ? g.name : "(아직 안 고름)"; }
function bodyText() { return "[고른 톱니바퀴] " + gearName() + "\n" + val("w2"); }
function buildOutText() { return S.sid + " " + S.name + "\n" + bodyText(); }
function studentChars() { return val("w2").length; }

function renderSummary() {
  const box = $("summary");
  box.innerHTML = "";
  box.appendChild(el("p", "sum-head", "[고른 톱니바퀴] " + gearName()));
  box.appendChild(el("p", "sum-line", val("w2") || "(아직 글이 없어)"));
  const n = studentChars();
  const short = n < WRAP.minChars;
  $("bodyCount").textContent = "내가 쓴 글 " + n + "자 ([고른 톱니바퀴] 줄 제외)" + (short ? " — " + WRAP.minChars + "자 이상 써 보자." : "");
  $("bodyCount").classList.toggle("warn", short);
  $("w2c").textContent = n + "자";
  $("submitBtn").disabled = S.submitted || S.sending;
  $("submitBtn").textContent = S.submitted ? "제출 완료" : "제출";
  renderPadlet();
}

function renderPadlet() {
  const a = $("padletBtn");
  if (S.padletUrl) {
    a.href = S.padletUrl; a.hidden = false; $("padletMsg").textContent = "";
  } else {
    a.hidden = true; $("padletMsg").textContent = "패들렛 링크는 선생님이 알려 준 곳을 써 줘.";
  }
}

function goWrap() {
  if (!S.done4) return;
  renderSummary();
  show("s5");
}

async function submitAll() {
  if (S.sending || S.submitted) return;
  $("outErr").textContent = "";
  if (!S.gear) { $("s5Err").textContent = "톱니바퀴를 하나 골라 줘."; $("gearList").scrollIntoView({ behavior: "smooth" }); return; }
  if (studentChars() < 10) { $("s5Err").textContent = "글을 조금 더 써 줘."; return; }
  if (studentChars() < WRAP.minChars && !confirm("아직 " + studentChars() + "자야. " + WRAP.minChars + "자보다 짧은데 그래도 제출할까?")) return;
  S.sending = true; $("submitBtn").disabled = true; $("submitBtn").textContent = "보내는 중…";
  const payload = {
    studentId: S.sid, studentName: S.name, gameName: CONFIG.GAME_NAME,
    choiceSummary: gearName(),
    diffSummary: "",
    reflection: bodyText(), // 시트 G열: 마무리 글
    choicesJson: JSON.stringify({
      sid: S.sid, name: S.name, ban: S.ban,
      guess: val("p1"), machineLine: val("w1"), spin: S.spin,
      land: S.land, sea: S.sea, gear: S.gear, writing: val("w2"),
      ts: new Date().toISOString()
    })
  };
  Object.assign(payload, FocusGuard.payload());
  try {
    await postToSheet(payload);
  } catch (e) {
    $("outErr").textContent = e.locked ? e.message : "저장이 안 됐어. 인터넷을 확인하고 다시 눌러 줘.";
    S.sending = false; renderSummary();
    return;
  }
  S.sending = false; S.submitted = true;
  if (!S.preview) { // 미리보기는 기본 학번(20512)이라 그 학번 학생의 기기 기록을 지우지 않는다
    if (window.DraftGuard) DraftGuard.clear(); // 저장 성공 → 임시저장 삭제
    clearSave();
  }
  ["p1", "w1", "w2"].forEach(id => { $(id).readOnly = true; }); // 제출 뒤 수정 잠금
  renderSummary();
  $("outMsg").textContent = S.preview ? "미리보기라 저장하지 않았어." : (S.copied ? "제출했어! 복사한 글을 패들렛에 올려 줘." : "제출했어! 이제 글을 복사해서 패들렛에 올려 줘.");
}

async function copyOut() {
  if (!S.gear || studentChars() < 1) { $("s5Err").textContent = "톱니바퀴를 고르고 글을 쓴 다음 복사해 줘."; return; }
  const text = buildOutText();
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (e) {
    const ta = el("textarea");
    ta.value = text; ta.setAttribute("data-no-draft", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
    ta.remove();
  }
  if (!ok) { $("outMsg").textContent = "복사가 안 됐어. 한 번 더 눌러 줘."; return; }
  S.copied = true;
  $("outMsg").textContent = S.submitted ? "복사했어. 패들렛에 붙여넣기 해." : "복사했어. 제출 버튼도 꼭 눌러 줘!";
  $("exampleBtn").disabled = false;
  $("exampleLock").hidden = true;
}

function renderExamples() {
  const box = $("examples");
  box.innerHTML = "";
  EXAMPLES.forEach(ex => {
    const card = el("div", "example");
    card.appendChild(el("div", "badge", "비교해 볼 예시 글 · " + ex.title));
    ex.lines.forEach(l => card.appendChild(el("p", "", l)));
    box.appendChild(card);
  });
}

function toggleExamples() {
  if (!S.copied) return;
  const box = $("examples");
  box.hidden = !box.hidden;
  $("exampleBtn").setAttribute("aria-expanded", box.hidden ? "false" : "true");
}

/* ── 부팅 (모든 함수 선언 뒤, 파일 맨 마지막) ── */
function init() {
  const q = new URLSearchParams(location.search);
  S.preview = q.get("preview") === "1";
  let sid = (q.get("sid") || "").trim(), name = (q.get("name") || "").trim();
  if (S.preview) {
    $("previewBar").hidden = false;
    if (!sid) sid = "20512";
    if (!name) name = "미리보기";
  }
  $("sid").value = sid; $("sname").value = name;

  $("appTitle").textContent = INTRO.title;
  $("introQ").textContent = INTRO.question;
  textbookBox("coreLabel", "coreText", INTRO.core.label, INTRO.core.text);

  $("s1Q").textContent = STEP1.q;
  $("s1GuessQ").textContent = STEP1.guessQ;
  $("p1").placeholder = STEP1.guessPh;
  $("s1MatchQ").textContent = STEP1.matchQ;
  $("s1How").textContent = STEP1.matchHow;
  $("s1Hint").textContent = STEP1.hint;
  textbookBox("s1DoneLabel", "s1DoneText", STEP1_DONE.label, STEP1_DONE.text);
  $("encLabel").textContent = STEP1_DONE.enclosureLabel;
  $("encText").textContent = STEP1_DONE.enclosure;

  $("s2Q").textContent = STEP2.q;
  $("s2Rule").textContent = STEP2.rule;
  $("loomQ").textContent = STEP2.loomQ;
  $("spinPicNote").textContent = PIC_NOTE;
  $("enginePicNote").textContent = PIC_NOTE;
  $("s2WriteQ").textContent = STEP2.writeQ;
  $("w1").placeholder = STEP2.writePh;
  $("s2Hint").textContent = STEP2.hint;
  textbookBox("s2DoneLabel", "s2DoneText", STEP2_DONE.wattLabel, STEP2_DONE.loomCap + " " + STEP2_DONE.watt);

  $("s3Q").textContent = STEP3.q;
  $("landQ").textContent = STEP3.landQ;
  $("seaQ").textContent = STEP3.seaQ;
  $("goBtn").textContent = STEP3.goBtn;
  $("steamQ").textContent = STEP3.steamQ;
  $("s3Hint").textContent = STEP3.hint;
  textbookBox("s3DoneLabel", "s3DoneText", STEP3_DONE.label, STEP3_DONE.text);

  $("s4Q").textContent = STEP4.q;
  $("s4Hint").textContent = STEP4.hint;
  $("orderQ").textContent = STEP4.orderQ;
  textbookBox("s4DoneLabel", "s4DoneText", STEP4_DONE.label, STEP4_DONE.text);
  $("s4DoneSpread").textContent = STEP4_DONE.spread;

  $("wrapQ").textContent = WRAP.q;
  $("wrapWriteQ").textContent = WRAP.writeQ;
  $("wrapMust").textContent = WRAP.must;
  $("w2").placeholder = WRAP.writePh;
  $("wrapHint").textContent = WRAP.hint;
  $("wrapGuide").textContent = WRAP.guide;
  $("copyBtn").textContent = WRAP.copyBtn;
  $("padletBtn").textContent = WRAP.padletBtn;
  $("exampleBtn").textContent = WRAP.exampleBtn;
  renderExamples();

  $("startBtn").addEventListener("click", startApp);
  $("s1Check").addEventListener("click", checkStep1);
  $("s1Next").addEventListener("click", goStep2);
  $("spinBtn").addEventListener("click", spinTap);
  $("loomHand").addEventListener("click", () => setLoomMode(false));
  $("loomSteam").addEventListener("click", () => setLoomMode(true));
  $("engineBtn").addEventListener("click", toggleEngine);
  ["loomHand", "loomSteam"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLoomMode(id === "loomSteam"); } }));
  $("w1").addEventListener("input", () => { $("w1c").textContent = val("w1").length + "자"; $("s2Err").textContent = ""; });
  $("s2Back").addEventListener("click", () => show("s1"));
  $("s2Next").addEventListener("click", goStep3);
  $("goBtn").addEventListener("click", runRoute);
  $("steamCheck").addEventListener("click", checkSteam);
  $("s3Back").addEventListener("click", () => show("s2"));
  $("s3Next").addEventListener("click", () => { if (S.done3) show("s4"); });
  $("roleCheck").addEventListener("click", checkRoles);
  $("orderCheck").addEventListener("click", checkOrder);
  $("s4Back").addEventListener("click", () => show("s3"));
  $("s4Next").addEventListener("click", goWrap);
  $("w2").addEventListener("input", () => { $("s5Err").textContent = ""; renderSummary(); });
  $("s5Back").addEventListener("click", () => show("s4"));
  $("copyBtn").addEventListener("click", copyOut);
  $("submitBtn").addEventListener("click", submitAll);
  $("exampleBtn").addEventListener("click", toggleExamples);
  $("p1").addEventListener("input", () => { $("s1Err").textContent = ""; });
  Glossary.start({ terms: GLOSSARY, unique: true, skip: ["#steps", ".tag", ".engine-box", ".spin-tab", ".spot", ".race", ".order-item", ".gear-name", ".role-pick", ".opt-row", ".toast"] }); // 어려운 낱말 풀이 (glossary.js). unique: 앱 전체에서 낱말마다 처음 한 번만 밑줄(2026-10-29 «너무 자주 나와 읽기 어렵다»)
}

init();
