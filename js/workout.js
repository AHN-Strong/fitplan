/* 오늘의 운동: 세트별 무게·반복 기록, 휴식 타이머, 자동 증량 목표, 운동 교체, 완료 저장 */
(function () {
  const $ = (s) => document.querySelector(s);
  const card = $("#todayCard");
  let selDay = null; // 선택한 요일(프로그램 day index)
  let draft = null;  // 진행 중인 세션
  let lastSummary = null;

  const fmtDate = (iso) => { const d = new Date(iso + "T12:00:00"); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
  const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; };

  function program() { return Store.program(); }

  // 다음에 할 요일: 마지막 기록의 다음 요일, 없으면 1일차
  function nextDayIndex(p) {
    const s = Store.data().sessions;
    const last = s.length ? s[s.length - 1] : null;
    if (!last || last.dayIndex == null) return 0;
    return (last.dayIndex + 1) % p.plan.days.length;
  }

  function buildDraft(p, dayIdx) {
    const day = p.plan.days[dayIdx];
    const sessions = Store.data().sessions;
    const week = Progress.weekNumber(p.startDate, Store.today());
    const deload = Progress.isDeloadWeek(week);
    const items = day.items.map((it) => {
      const hist = Progress.historyFor(sessions, it.id);
      const t = Progress.nextTarget(it, hist, p.input, { deload });
      const prev = hist[0] ? hist[0] : null;
      return {
        id: it.id, name: it.name, group: it.group, muscle: it.muscle, reps: it.reps, rest: it.rest,
        target: t, prev: prev ? { date: prev.date, sets: prev.sets.filter((x) => x.done) } : null,
        sets: Array.from({ length: t.sets }, () => ({ w: t.kind === "kg" ? t.weight : 0, r: t.reps, done: false })),
      };
    });
    return { dayIndex: dayIdx, date: Store.today(), title: day.title, week, deload, startedAt: Date.now(), items };
  }

  function saveDraft() { Store.setDraft(draft); }

  // ---------- 휴식 타이머 ----------
  let restEnd = 0, restTick = null;
  function startRest(sec) {
    restEnd = Date.now() + sec * 1000;
    $("#restTimer").hidden = false;
    $("#restLabel").textContent = "휴식";
    clearInterval(restTick);
    restTick = setInterval(tickRest, 250);
    tickRest();
  }
  function tickRest() {
    const left = Math.ceil((restEnd - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(restTick); restTick = null;
      $("#restClock").textContent = "0:00";
      $("#restLabel").textContent = "휴식 끝! 다음 세트";
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
      beep();
      setTimeout(() => { if (!restTick) $("#restTimer").hidden = true; }, 5000);
      return;
    }
    $("#restClock").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  }
  let audio;
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.25);
    } catch (e) {}
  }
  $("#restAdd").addEventListener("click", () => { restEnd += 15000; if (!restTick) restTick = setInterval(tickRest, 250); tickRest(); });
  $("#restSkip").addEventListener("click", () => { clearInterval(restTick); restTick = null; $("#restTimer").hidden = true; });

  // ---------- 화면 ----------
  function targetLine(it) {
    const t = it.target;
    const w = t.kind === "kg" ? `${t.weight}kg${t.perHand ? "(한 손)" : ""} × ` : "";
    return `목표 ${t.sets}세트 · ${w}${it.reps}회${t.kind === "kg" && t.reason !== "start" ? ` (목표 반복 ${t.reps}회)` : ""}`;
  }
  function prevLine(it) {
    if (!it.prev || !it.prev.sets.length) return "";
    return `지난번(${fmtDate(it.prev.date)}): ` + it.prev.sets.map((s) => (s.w ? `${s.w}kg×${s.r}` : `${s.r}회`)).join(", ");
  }

  function render() {
    const p = program();
    if (!p) {
      card.innerHTML = `<h2>오늘 운동</h2><p class="note">먼저 '계획' 탭에서 프로그램을 만들어 주세요.</p><button type="button" class="primary" data-go="plan">프로그램 만들러 가기</button>`;
      return;
    }
    if (lastSummary) { card.innerHTML = summaryHTML(); return; }
    const stored = Store.data().draft;
    if (!draft && stored && stored.items && p.plan.days[stored.dayIndex]) { draft = stored; selDay = stored.dayIndex; }
    if (selDay == null || selDay >= p.plan.days.length) selDay = nextDayIndex(p);
    if (!draft || draft.dayIndex !== selDay) { draft = buildDraft(p, selDay); saveDraft(); }

    const days = p.plan.days;
    const done = draft.items.reduce((s, it) => s + it.sets.filter((x) => x.done).length, 0);
    const total = draft.items.reduce((s, it) => s + it.sets.length, 0);
    card.innerHTML = `
      <div class="row"><h2>오늘 운동</h2><span class="pill">${done}/${total} 세트</span></div>
      <label>운동할 날
        <select id="daySel">${days.map((d, i) => `<option value="${i}" ${i === selDay ? "selected" : ""}>${d.index}일차 · ${d.title}</option>`).join("")}</select>
      </label>
      <p class="note">${draft.week}주차${draft.deload ? " · <b>디로드 주간</b> (세트·무게를 줄여 회복하는 주)" : ""} · ${fmtDate(draft.date)}</p>
      <div id="exList">${draft.items.map(exCard).join("")}</div>
      <button type="button" class="primary" id="finishBtn">운동 완료하고 저장</button>
      <button type="button" class="ghost wide" id="resetDraft">이 운동 처음부터 다시</button>`;
  }

  function exCard(it, ei) {
    const im = window.ExImages && ExImages[it.id];
    const thumb = im ? `<img class="thumb" src="${im.imgs[0].f}" alt="">` : "";
    const kg = it.target.kind === "kg";
    const noteCls = it.target.reason === "up" ? "up" : it.target.reason === "down" ? "down" : "";
    return `<article class="ex" data-e="${ei}">
      <div class="exhead">
        <button type="button" class="exname" data-act="info">${thumb}<span><b>${it.name}</b><small>${it.muscle}</small></span></button>
        <button type="button" class="swapbtn" data-act="swap" aria-label="${it.name} 교체" title="교체">⇄</button>
      </div>
      <p class="goal">${targetLine(it)}</p>
      <p class="tnote ${noteCls}">${it.target.note}</p>
      ${prevLine(it) ? `<p class="prev">${prevLine(it)}</p>` : ""}
      <div class="sets">
        <div class="setrow head"><span>세트</span><span>${kg ? "kg" : "&nbsp;"}</span><span>회</span><span>완료</span></div>
        ${it.sets.map((s, si) => `<div class="setrow ${s.done ? "done" : ""}" data-s="${si}">
          <span class="sn">${si + 1}</span>
          ${kg ? `<input type="number" inputmode="decimal" step="any" value="${s.w || ""}" data-f="w" aria-label="${si + 1}세트 무게">` : `<span class="dash">맨몸</span>`}
          <input type="number" inputmode="numeric" value="${s.r || ""}" data-f="r" aria-label="${si + 1}세트 반복 수">
          <button type="button" class="chk ${s.done ? "on" : ""}" data-act="done" aria-label="${si + 1}세트 완료" aria-pressed="${s.done}">✓</button>
        </div>`).join("")}
      </div>
      <button type="button" class="ghost addset" data-act="add">+ 세트 추가</button>
    </article>`;
  }

  function summaryHTML() {
    const s = lastSummary;
    return `<h2>운동 완료</h2>
      <div class="stats">
        <div class="stat"><span>수행 세트</span><b>${s.sets}<small>세트</small></b></div>
        <div class="stat"><span>총 볼륨</span><b>${s.volume.toLocaleString()}<small>kg</small></b></div>
        <div class="stat"><span>운동 시간</span><b>${s.minutes}<small>분</small></b></div>
        <div class="stat"><span>달성한 운동</span><b>${s.exercises}<small>개</small></b></div>
      </div>
      ${s.prs.length ? `<ul class="gnotes">${s.prs.map((x) => `<li class="ok">신기록: ${x.name} 추정 1RM ${x.prev ? x.prev + "kg → " : ""}${x.now}kg</li>`).join("")}</ul>` : ""}
      <p class="note">기록은 '기록·분석' 탭에서 볼 수 있고, 다음 운동의 목표 무게에 자동으로 반영됩니다.</p>
      <button type="button" class="primary" data-go="log">기록·분석 보기</button>
      <button type="button" class="ghost wide" id="nextWorkout">다음 운동 준비</button>`;
  }

  // ---------- 이벤트 ----------
  card.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { if (go.dataset.go === "plan" || go.dataset.go === "log") { lastSummary = go.dataset.go === "log" ? null : lastSummary; App.showTab(go.dataset.go); } return; }
    if (e.target.id === "nextWorkout") { lastSummary = null; selDay = null; draft = null; Store.setDraft(null); render(); return; }
    if (e.target.id === "resetDraft") {
      draft = buildDraft(program(), selDay); saveDraft(); render(); return;
    }
    if (e.target.id === "finishBtn") { finish(); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const ex = btn.closest(".ex");
    const ei = ex ? Number(ex.dataset.e) : -1;
    const it = draft && draft.items[ei];
    if (!it) return;
    const act = btn.dataset.act;
    if (act === "info") { App.showExercise(it); return; }
    if (act === "swap") { swapExercise(ei); return; }
    if (act === "add") {
      const lastSet = it.sets[it.sets.length - 1] || { w: 0, r: 0 };
      it.sets.push({ w: lastSet.w, r: lastSet.r, done: false }); saveDraft(); keepScroll(render); return;
    }
    if (act === "done") {
      const row = btn.closest(".setrow");
      const si = Number(row.dataset.s);
      const s = it.sets[si];
      s.w = num(row.querySelector('[data-f="w"]') ? row.querySelector('[data-f="w"]').value : 0);
      s.r = num(row.querySelector('[data-f="r"]').value);
      if (!s.done && !(s.r > 0)) { App.toast("반복 수를 입력해 주세요"); return; }
      s.done = !s.done;
      saveDraft();
      row.classList.toggle("done", s.done); btn.classList.toggle("on", s.done); btn.setAttribute("aria-pressed", s.done);
      if (s.done) startRest(it.rest);
      updateCount();
    }
  });
  card.addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-f]");
    if (!inp) return;
    const row = inp.closest(".setrow"), ex = inp.closest(".ex");
    const s = draft.items[Number(ex.dataset.e)].sets[Number(row.dataset.s)];
    s[inp.dataset.f] = num(inp.value);
    saveDraft();
  });
  card.addEventListener("change", (e) => {
    if (e.target.id === "daySel") { selDay = Number(e.target.value); draft = null; Store.setDraft(null); render(); }
  });

  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }
  function updateCount() {
    const done = draft.items.reduce((s, it) => s + it.sets.filter((x) => x.done).length, 0);
    const total = draft.items.reduce((s, it) => s + it.sets.length, 0);
    const pill = card.querySelector(".pill"); if (pill) pill.textContent = `${done}/${total} 세트`;
  }

  // 오늘 운동 중 교체: 같은 움직임의 대체 운동으로 바꾸고 목표를 다시 계산
  function swapExercise(ei) {
    const p = program();
    const it = draft.items[ei];
    const dayIdx = draft.dayIndex;
    const idx = p.plan.days[dayIdx].items.findIndex((x) => x.id === it.id);
    if (idx < 0) return;
    App.openSwap(dayIdx, idx);
    // 교체가 끝나면 fit:program 이벤트로 draft를 다시 만든다 (진행 중인 세트는 유지하지 않음)
  }

  function finish() {
    const items = draft.items.map((it) => ({ id: it.id, name: it.name, group: it.group, muscle: it.muscle, sets: it.sets.filter((s) => s.done).map((s) => ({ w: s.w || 0, r: s.r, done: true })) }))
      .filter((it) => it.sets.length);
    if (!items.length) { App.toast("완료한 세트가 없습니다. 세트의 ✓를 눌러 주세요"); return; }
    // 신기록 판정 (이번 세션 이전 기록과 비교)
    const before = Store.data().sessions;
    const prs = [];
    items.forEach((it) => {
      const now = Progress.sessionBest(it);
      if (!now) return;
      const prevBest = Math.max(0, ...Progress.historyFor(before, it.id).map((h) => Progress.sessionBest({ sets: h.sets })));
      if (now > prevBest && prevBest > 0) prs.push({ name: it.name, prev: prevBest, now });
    });
    const volume = Math.round(items.reduce((s, it) => s + it.sets.reduce((a, x) => a + (x.w || 0) * x.r, 0), 0));
    const sets = items.reduce((s, it) => s + it.sets.length, 0);
    const mins = Math.max(1, Math.round((Date.now() - draft.startedAt) / 60000));
    Store.addSession({ date: draft.date, dayIndex: draft.dayIndex, title: draft.title, week: draft.week, minutes: Math.min(mins, 180), items });
    Store.setDraft(null);
    lastSummary = { sets, volume, exercises: items.length, minutes: mins, prs };
    draft = null; selDay = null;
    $("#restTimer").hidden = true; clearInterval(restTick); restTick = null;
    App.toast("운동 기록을 저장했어요");
    document.dispatchEvent(new CustomEvent("fit:logchange"));
    render();
  }

  document.addEventListener("fit:tab", (e) => { if (e.detail === "today") render(); });
  // 프로그램이 바뀌면(교체·재생성) 오늘 draft를 새로 만든다
  document.addEventListener("fit:program", () => {
    const old = draft; draft = null;
    const p = program();
    if (old && p && p.plan.days[old.dayIndex]) {
      // 이미 입력한 운동은 유지하고 바뀐 운동만 새로 만든다
      const nd = buildDraft(p, old.dayIndex);
      nd.items = nd.items.map((n) => old.items.find((o) => o.id === n.id) || n);
      nd.startedAt = old.startedAt; draft = nd; selDay = old.dayIndex; saveDraft();
    }
    if (App.tab === "today") render();
  });
})();
