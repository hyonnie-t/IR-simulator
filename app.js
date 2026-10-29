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

/* ── 1단: 준비 (160쪽) — 짧은 꼬리표(공장에 필요한 것)를 긴 문장 카드에 끌어다 붙인다.
 *    끌기가 어려운 학생은 꼬리표를 누르고 카드를 눌러도 된다. S.placed = { 꼬리표(칸)id: 카드id } ── */
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
    if (S.placed[s.id]) return; // 붙인 꼬리표는 위 꼬리표 칸에서 뺀다
    const t = tagEl(s);
    t.dataset.slot = s.id;
    t.setAttribute("role", "button");
    t.tabIndex = 0;
    t.setAttribute("aria-pressed", S.selSlot === s.id ? "true" : "false");
    t.addEventListener("pointerdown", e => dragStart(e, s.id));
    t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickTag(s.id); } });
    tray.appendChild(t);
  });
  if (!tray.children.length) tray.appendChild(el("p", "note", S.done1 ? "모두 붙였어!" : "꼬리표를 모두 붙였어. «맞춰 보기»를 눌러 봐."));
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
      pocket.appendChild(el("span", "pocket-empty", S.selSlot ? "여기에 붙이기" : "꼬리표를 여기에"));
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
  if (old) delete S.placed[old]; // 카드에 이미 붙은 꼬리표는 위로 돌려보낸다
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
  if (old) { delete S.placed[old]; save(); renderStep1(); return; } // 붙은 꼬리표를 누르면 떨어진다
  $("s1Msg").textContent = "위 꼬리표를 먼저 골라 줘.";
}

/* 끌기: 손가락·마우스 모두 pointer 이벤트로. 조금이라도 움직여야 끌기로 보고, 안 움직이면 누르기(pickTag)로 본다. */
const drag = { id: "", x: 0, y: 0, ghost: null, moved: false, over: null };

function dragStart(e, slotId) {
  if (S.done1 || (e.button !== undefined && e.button !== 0)) return;
  drag.id = slotId; drag.x = e.clientX; drag.y = e.clientY; drag.moved = false; drag.over = null;
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
    drag.ghost = tagEl(byId(SLOTS, drag.id), "ghost");
    document.body.appendChild(drag.ghost);
    e.currentTarget.classList.add("lifted");
  }
  e.preventDefault();
  drag.ghost.style.left = e.clientX + "px";
  drag.ghost.style.top = e.clientY + "px";
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const card = under && under.closest ? under.closest(".fact") : null;
  if (drag.over !== card) {
    if (drag.over) drag.over.classList.remove("hover");
    if (card) card.classList.add("hover");
    drag.over = card;
  }
  /* 화면 끝에 닿으면 조금씩 스크롤(폰에서 아래 카드까지 끌고 갈 수 있게) */
  if (e.clientY < 70) window.scrollBy(0, -14);
  else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
}

function dragEnd(e) {
  const t = e.currentTarget;
  t.removeEventListener("pointermove", dragMove);
  t.removeEventListener("pointerup", dragEnd);
  t.removeEventListener("pointercancel", dragEnd);
  const id = drag.id, moved = drag.moved, over = drag.over;
  if (drag.ghost) drag.ghost.remove();
  drag.id = ""; drag.ghost = null; drag.over = null;
  t.classList.remove("lifted");
  if (!id) return;
  if (!moved) { pickTag(id); return; }
  if (over && e.type === "pointerup") { $("s1Msg").textContent = ""; stick(id, over.dataset.card); return; }
  renderStep1();
}

function checkStep1() {
  if (Object.keys(S.placed).length < SLOTS.length) { $("s1Msg").textContent = "꼬리표 다섯 개를 모두 붙여 줘."; return; }
  const wrong = wrongSlots(S.placed, FACT_CARDS, SLOTS);
  if (wrong.length) {
    S.tries1 = (S.tries1 || 0) + 1;
    if (S.tries1 >= STEP1.maxTries) {
      S.placed = answerPlacement(FACT_CARDS); // 세 번 틀리면 정답을 보여 주고 넘어간다
      S.done1 = true; S.selSlot = ""; save();
      renderStep1();
      $("s1Msg").textContent = "";
      toast("정답을 붙여 뒀어. 문장과 꼬리표를 한 번 더 읽어 봐.");
      $("slotList").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    wrong.forEach(id => { delete S.placed[id]; }); // 틀린 꼬리표는 위로 돌려보낸다
    save();
    renderStep1();
    const left = STEP1.maxTries - S.tries1;
    $("s1Msg").textContent = wrong.length + "개가 달라. 틀린 꼬리표는 위로 돌아갔어. 다시 붙여 봐. (" +
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
  $("spinName").textContent = tool.name + " — 한 번에 " + tool.perTap + "가닥";
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
  $("spinBtnText").textContent = "눌러서 시작";
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

function spinTap() {
  if (Date.now() - spinRun.ended < 800) return; // 끝나자마자 눌린 것은 무시(새 판이 바로 시작되지 않게)
  const tool = byId(SPINNERS, S.spinTool);
  if (!spinRun.on) {
    spinRun.on = true; spinRun.taps = 0; spinRun.left = CONFIG.SPIN_SECONDS * 10;
    $("spinBtnText").textContent = "계속 눌러!";
    renderStep2();
    spinRun.timer = setInterval(() => {
      spinRun.left -= 1;
      $("spinTime").textContent = (spinRun.left / 10).toFixed(1);
      if (spinRun.left <= 0) endSpin();
    }, 100);
  }
  spinRun.taps += 1;
  $("spinCount").textContent = threads(spinRun.taps, tool.perTap).toLocaleString();
  const w = $("spinWheel");
  w.style.transform = "rotate(" + (spinRun.taps * 40) + "deg)";
}

function endSpin() {
  clearInterval(spinRun.timer);
  spinRun.on = false; spinRun.ended = Date.now();
  const tool = byId(SPINNERS, S.spinTool);
  S.spin[tool.id] = threads(spinRun.taps, tool.perTap);
  $("spinBtnText").textContent = "다시 하려면 눌러";
  const next = SPINNERS[SPINNERS.indexOf(tool) + 1];
  if (next && S.spin[next.id] === undefined) S.spinTool = next.id;
  save();
  renderStep2();
  $("spinTime").textContent = "0.0";
  $("spinCount").textContent = S.spin[tool.id].toLocaleString();
  toast(tool.name + ": " + S.spin[tool.id].toLocaleString() + "가닥!" + (next && S.spinTool === next.id ? " 이제 " + next.name + "!" : ""));
}

/* 방직기: 증기 기관이 없으면 한 사람이 1대씩. 증기 기관 공장에서는 기관 → 축 → 벨트로 힘이 가고,
 * 기관을 멈춰 보면 방직기가 모두 서는 것으로 «동력»이 무엇인지 느끼게 한다(2026-10-29 «증기 기관 역할이 안 느껴짐»). */
const engine = { on: true };

function renderLooms() {
  const steam = S.loomSteam;
  $("loomHand").setAttribute("aria-checked", steam ? "false" : "true");
  $("loomSteam").setAttribute("aria-checked", steam ? "true" : "false");
  $("loomRule").textContent = steam ? STEP2.loomRuleSteam : STEP2.loomRuleHand;
  const limit = loomLimit(steam, LOOM.workers, LOOM.looms);
  const box = $("engineBox");
  box.hidden = !steam;
  box.classList.toggle("off", !engine.on);
  box.classList.toggle("run", engine.on && S.loomOn.length > 0);
  $("engineBtn").textContent = engine.on ? STEP2.engineBtnStop : STEP2.engineBtnGo;
  $("engineBtn").disabled = steam && S.loomOn.length === 0 && engine.on;
  const w = $("workers");
  w.innerHTML = "";
  for (let i = 0; i < LOOM.workers; i++) {
    const busy = !steam && i < S.loomOn.length;
    w.appendChild(el("span", "worker" + (busy ? " busy" : ""), "👷"));
  }
  w.appendChild(el("span", "worker-note", steam ? "기계를 살피는 사람" : "방직기를 맡을 수 있는 사람"));
  const grid = $("loomGrid");
  grid.innerHTML = "";
  grid.classList.toggle("steam", steam);
  grid.classList.toggle("halted", steam && !engine.on);
  for (let i = 0; i < LOOM.looms; i++) {
    const on = S.loomOn.indexOf(i) >= 0;
    const b = el("button", "loom" + (on ? " on" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", "방직기 " + (i + 1) + (on ? " 돌아가는 중" : " 멈춤"));
    b.innerHTML = (steam ? '<span class="belt"></span>' : "") +
      '<span class="loom-frame"><span class="cloth"></span><span class="shuttle"></span></span><span class="loom-no">' + (i + 1) + "</span>";
    b.addEventListener("click", () => toggleLoom(i, limit));
    grid.appendChild(b);
  }
  $("loomMsg").textContent = "돌아가는 방직기 " + (steam && !engine.on ? 0 : S.loomOn.length) + "대 / " + LOOM.looms + "대";
}

function toggleLoom(i, limit) {
  if (S.loomSteam && !engine.on) { $("loomMsg").textContent = "증기 기관이 멈춰 있어서 방직기를 돌릴 힘이 없어. 증기 기관을 다시 돌려 봐."; return; }
  const k = S.loomOn.indexOf(i);
  if (k >= 0) S.loomOn.splice(k, 1);
  else if (S.loomOn.length < limit) S.loomOn.push(i);
  else { renderLooms(); $("loomMsg").textContent = "방직기를 맡을 사람이 모자라! (" + S.loomOn.length + "대에서 멈춤)"; return; }
  const mode = S.loomSteam ? "steam" : "hand";
  S.loomMax[mode] = Math.max(S.loomMax[mode], S.loomOn.length);
  renderLooms();
  if (!S.loomSteam && S.loomOn.length === limit && !S.loomMax.steam) $("loomMsg").textContent += " — 이번엔 «증기 기관 공장»으로 바꿔 봐.";
  if (S.loomSteam && S.loomOn.length === LOOM.looms && !S.engineTried) $("loomMsg").textContent = "같은 " + LOOM.workers + "명으로 방직기 " + LOOM.looms + "대가 돌아가! " + STEP2.engineAsk;
  save();
  checkDone2();
}

function toggleEngine() {
  engine.on = !engine.on;
  renderLooms();
  if (!engine.on) {
    $("loomMsg").textContent = STEP2.engineStopped;
    if (S.loomOn.length === LOOM.looms && !S.engineTried) { S.engineTried = true; save(); }
  }
  checkDone2();
}

/* 두 공장을 다 돌려 보고, 증기 기관을 멈춰 본 뒤에 교과서 정리를 연다(순서는 상관없다) */
function checkDone2() {
  if (S.done2 || !S.engineTried || S.loomMax.hand < loomLimit(false, LOOM.workers, LOOM.looms) || S.loomMax.steam < LOOM.looms) return;
  const msg = $("loomMsg").textContent;
  S.done2 = true; save();
  renderStep2();
  $("loomMsg").textContent = msg;
  setTimeout(() => $("s2Done").scrollIntoView({ behavior: "smooth", block: "start" }), 1200);
}

function setLoomMode(steam) {
  if (S.loomSteam === steam) return;
  S.loomSteam = steam; S.loomOn = []; engine.on = true;
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
  radioGroup($("landPick"), VEHICLES.land, () => S.land, v => { S.land = v; });
  radioGroup($("seaPick"), VEHICLES.sea, () => S.sea, v => { S.sea = v; });
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

function runRoute() {
  if (!S.land || !S.sea) { $("routeMsg").textContent = "육지와 바다에서 탈 것을 하나씩 골라 줘."; return; }
  const land = byId(VEHICLES.land, S.land), sea = byId(VEHICLES.sea, S.sea);
  const go = (runner, v, delay) => {
    const r = $(runner);
    r.textContent = v.icon;
    r.style.transition = "none"; r.style.left = "0%";
    void r.offsetWidth; // 위치를 처음으로 되돌린 뒤 다시 움직인다
    const sec = v.fast ? 1.2 : 4; // 그림 속 빠르기 차이일 뿐 실제 시간이 아니다
    r.style.transition = "left " + sec + "s linear " + delay + "s";
    r.style.left = "calc(100% - 2em)";
    return sec;
  };
  $("goBtn").disabled = true;
  const t1 = go("landRunner", land, 0);
  const t2 = go("seaRunner", sea, t1);
  $("routeMsg").textContent = "가는 중…";
  setTimeout(() => {
    $("goBtn").disabled = false;
    const bothSteam = land.fast && sea.fast, noneSteam = !land.fast && !sea.fast;
    $("routeMsg").textContent = land.name + "와 " + sea.name + "(으)로 보냈어. " +
      (bothSteam ? "말이나 바람 대신 무엇의 힘으로 갔을까?" : noneSteam ? "다른 탈 것으로도 보내서 비교해 봐." : "나머지 하나도 바꿔서 비교해 봐.");
    if (!S.ran) { S.ran = true; save(); renderStep3(); }
  }, (t1 + t2) * 1000 + 200);
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

/* 복사 글: 학번·이름 한 줄과 [꼬리표] 한 줄만 붙이고 나머지는 학생이 쓴 글 */
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
  $("bodyCount").textContent = "내가 쓴 글 " + n + "자 (꼬리표 제외)" + (short ? " — " + WRAP.minChars + "자 이상 써 보자." : "");
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
  $("engineImg").src = ENGINE_IMG;
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
  Glossary.start({ terms: GLOSSARY, unique: true, skip: ["#steps", ".tag", ".engine-box", ".spin-tab", ".loom", ".route", ".order-item", ".gear-name", ".role-pick", ".opt-row", ".toast"] }); // 어려운 낱말 풀이 (glossary.js). unique: 앱 전체에서 낱말마다 처음 한 번만 밑줄(2026-10-29 «너무 자주 나와 읽기 어렵다»)
}

init();
