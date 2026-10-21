(function () {
  const $ = (s) => document.querySelector(s);
  const form = $("#form");
  const f = form.elements;
 const GROUPS = Generator.GROUP_ORDER;
  const LABEL = Generator.GROUP_LABEL;
  let seed = 0;
  let splits = Generator.defaultSplits(2); // [[group,...], ...]

  const num = (v) => (v === "" || v == null ? null : Number(v));

  // ---------- 간편 입력: 버튼형 선택 → 실제 값(숨은 select) ----------
  const PICKS = { goalPick: "goal", levelPick: "level", daysPick: "days" };
  function syncPick(name) {
    const sel = f[PICKS[name]];
    const r = form.querySelector(`input[name="${name}"]:checked`);
    if (r && sel.value !== r.value) { sel.value = r.value; sel.dispatchEvent(new Event("change")); }
  }
  function setPicksFromSelects() {
    Object.keys(PICKS).forEach((n) => {
      const r = form.querySelector(`input[name="${n}"][value="${f[PICKS[n]].value}"]`);
      if (r) r.checked = true;
    });
  }
  form.addEventListener("change", (e) => { if (PICKS[e.target.name]) syncPick(e.target.name); });

  // ---------- 분할 편집기 ----------
  function renderSplitEditor() {
    const letters = "ABCDEF";
    $("#splitEditor").innerHTML = splits.map((groups, si) => `
      <div class="split"><b>분할 ${letters[si]}</b><div>
        ${GROUPS.map((g) => `<label><input type="checkbox" data-split="${si}" data-group="${g}" ${groups.includes(g) ? "checked" : ""}> ${LABEL[g]}</label>`).join("")}
      </div></div>`).join("");
    updateSplitHint();
  }

  function updateSplitHint() {
    const days = Number(f.days.value), n = splits.length;
    const base = Math.floor(days / n), extra = days % n;
    const times = (i) => base + (i < extra ? 1 : 0);
    const parts = splits.map((_, i) => `${"ABCDEF"[i]} 주 ${times(i)}회`).join(", ");
    const rec = Generator.recommendedSplitCount(days);
    $("#splitSummary").textContent = `· ${n === 1 ? "무분할(전신)" : n + "분할"}${n === rec ? " (추천)" : ""}`;
    $("#splitHint").textContent = `주 ${days}일 ÷ ${n}분할 → ${parts}. ` +
      (base < 2 ? "같은 부위가 주 1회만 돌아옵니다. 근비대 연구는 주 2회 이상으로 볼륨을 나누는 것을 지지합니다. " : "") +
      (n !== rec ? `추천 분할 수는 ${rec}분할입니다.` : "");
  }

  function syncSplitCountOptions() {
    const days = Number(f.days.value);
    [...f.splitCount.options].forEach((o) => { o.disabled = Number(o.value) > days; });
    if (Number(f.splitCount.value) > days) f.splitCount.value = String(days);
  }

  function setSplitCount(n) {
    f.splitCount.value = String(n);
    splits = Generator.defaultSplits(n);
    renderSplitEditor();
  }

  $("#splitEditor").addEventListener("change", (e) => {
    const t = e.target;
    if (!t.dataset.group) return;
    const si = Number(t.dataset.split);
    splits[si] = GROUPS.filter((g) => (g === t.dataset.group ? t.checked : splits[si].includes(g)));
  });
  f.splitCount.addEventListener("change", () => setSplitCount(Number(f.splitCount.value)));
  f.days.addEventListener("change", () => {
    syncSplitCountOptions();
    setSplitCount(Generator.recommendedSplitCount(Number(f.days.value)) <= Number(f.days.value)
      ? Math.min(Generator.recommendedSplitCount(Number(f.days.value)), Number(f.days.value)) : 1);
  });
  $("#resetSplits").addEventListener("click", () => setSplitCount(Number(f.splitCount.value)));

  // ---------- 보유 기구 ----------
  const eqBoxes = () => [...form.querySelectorAll('input[name="eq"]')];
  function updateEquipSummary() {
    const names = eqBoxes().filter((c) => c.checked).map((c) => Exercises.EQUIP_LABEL[c.value]);
    $("#equipSummary").textContent = "· " + (names.length ? names.join(", ") : "맨몸만");
  }
  function setEquip(list) {
    eqBoxes().forEach((c) => (c.checked = list.includes(c.value)));
    updateEquipSummary();
  }
  f.location.addEventListener("change", () => setEquip(Exercises.LOCATION_EQ[f.location.value]));
  $("#equipBox").addEventListener("change", updateEquipSummary);

  function updateGoalUI() {
    $("#strengthGoal").hidden = f.goal.value !== "strength";
    form.querySelectorAll(".gt").forEach((el) => (el.hidden = el.dataset.gt !== f.goalType.value));
  }
  f.goal.addEventListener("change", updateGoalUI);
  f.goalType.addEventListener("change", updateGoalUI);

  // ---------- 읽기/쓰기/저장 ----------
  const FIELDS = ["height", "weight", "age", "bodyFat", "job", "goal", "level", "days", "minutes", "location",
    "targetWeight", "goalType", "strengthNow", "strengthTarget", "fatTarget", "smmNow", "smmTarget"];

  function read() {
    const d = {
      sex: form.querySelector('input[name="sex"]:checked').value,
      injuries: [...form.querySelectorAll('input[name="inj"]:checked')].map((x) => x.value),
      splits: splits.map((g) => [...g]),
      equip: eqBoxes().filter((c) => c.checked).map((c) => c.value),
    };
    FIELDS.forEach((k) => {
      const el = f[k];
      d[k] = el.tagName === "SELECT" ? (isNaN(Number(el.value)) ? el.value : Number(el.value)) : num(el.value);
    });
    // 달성 기한(날짜) → 남은 주 수. 목표 체중을 정했을 때만 의미가 있다
    d.targetDate = f.targetDate.value || null;
    d.weeks = d.targetDate ? Calc.weeksUntil(d.targetDate, Store.today()) : 12;
    d.extraKcal = Store.settings().extraKcal || 0;
    return d;
  }

  // ---------- 목표 체중 · 기한 ----------
  const addWeeksISO = (n) => { const x = new Date(); x.setDate(x.getDate() + n * 7); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
  function ensureDate() { if (!f.targetDate.value) f.targetDate.value = addWeeksISO(12); }
  function updateGoalHint() {
    const h = $("#goalHint");
    const tw = num(f.targetWeight.value), w = num(f.weight.value);
    if (tw == null || w == null || !f.targetDate.value) { h.textContent = "비워 두면 목표 체중 없이 계산합니다."; return; }
    const weeks = Calc.weeksUntil(f.targetDate.value, Store.today());
    const diff = Math.round((tw - w) * 10) / 10;
    h.textContent = weeks < 2 ? "기한이 너무 가깝습니다. 최소 2주 뒤로 정해 주세요."
      : `${weeks}주 동안 ${diff === 0 ? "유지" : (diff > 0 ? "+" : "") + diff + "kg"} → 주당 약 ${Math.round((Math.abs(diff) / weeks) * 100) / 100}kg`;
  }
  ["targetWeight", "targetDate", "weight"].forEach((n) => f[n].addEventListener("input", updateGoalHint));
  f.targetDate.addEventListener("change", updateGoalHint);

  function write(d) {
    form.querySelector(`input[name="sex"][value="${d.sex}"]`).checked = true;
    FIELDS.forEach((k) => { if (d[k] != null) f[k].value = d[k]; });
    if (d.job == null) f.job.value = "1";
    f.targetDate.value = d.targetDate || "";
    ensureDate(); updateGoalHint();
    setPicksFromSelects();
    form.querySelectorAll('input[name="inj"]').forEach((c) => (c.checked = (d.injuries || []).includes(c.value)));
    setEquip(Array.isArray(d.equip) ? d.equip : Exercises.LOCATION_EQ[d.location] || Exercises.LOCATION_EQ.gym);
    syncSplitCountOptions();
    if (Array.isArray(d.splits) && d.splits.length) { splits = d.splits; f.splitCount.value = String(splits.length); }
    else splits = Generator.defaultSplits(Number(f.splitCount.value));
    renderSplitEditor();
    updateGoalUI();
  }

  const save = (d) => Store.setForm(d);   // 입력값도 계정 데이터 안에 같이 저장된다
  const load = () => Store.form();

  // ---------- 렌더링 ----------
  const stat = (label, value, unit, sub) =>
    `<div class="stat"><span>${label}</span><b>${value}<small>${unit}</small></b>${sub ? `<em>${sub}</em>` : ""}</div>`;

  function render(input, r, plan) {
    const adj = r.target.adjust;
    // 요약 4개: 꼭 필요한 숫자만
    $("#stats").innerHTML =
      stat("기초대사량", r.bmr.toLocaleString(), "kcal", "가만히 있어도 쓰는 열량") +
      stat("하루 소모", r.tdee.toLocaleString(), "kcal", "직업·운동 포함") +
      stat("목표 섭취", r.target.kcal.toLocaleString(), "kcal", adj === 0 ? "유지" : `소모 대비 ${adj > 0 ? "+" : ""}${adj}`) +
      stat("BMI", r.bmi, "", r.bmiCategory.label);
    $("#macroLine").textContent = `하루 영양소 목표: 단백질 ${r.macros.protein}g · 탄수화물 ${r.macros.carbs}g · 지방 ${r.macros.fat}g`;
    const w = $("#warn"); w.hidden = !r.target.warning; w.textContent = r.target.warning || "";

    const pct = Math.min(100, Math.max(0, ((r.bmi - 15) / 20) * 100));
    $("#bmiMarker").style.left = pct + "%";
    const diff = Math.round((input.weight - r.ideal.ideal) * 10) / 10;
    $("#bmiText").textContent =
      `적정 체중 ${r.ideal.ideal}kg (건강 범위 ${r.ideal.min}~${r.ideal.max}kg) · 현재 ${input.weight}kg, ${diff > 0 ? "+" : ""}${diff}kg. ` +
      (input.weight > r.ideal.max ? `건강 범위 상한까지 ${Math.round((input.weight - r.ideal.max) * 10) / 10}kg 감량이 필요합니다.`
        : input.weight < r.ideal.min ? `건강 범위 하한까지 ${Math.round((r.ideal.min - input.weight) * 10) / 10}kg 증량이 필요합니다.`
        : "건강 체중 범위 안에 있습니다.") +
      (r.bmrKatch ? ` 체지방률로 계산한 기초대사량은 ${r.bmrKatch.toLocaleString()}kcal입니다.` : "");

    const gp = r.plan;
    $("#goalCard").hidden = !gp.notes.length;
    $("#goalNotes").innerHTML = gp.notes.map((n) => `<li class="${n.level}">${n.text}</li>`).join("");
    $("#milestones").innerHTML = gp.milestones.map((m) => `<span>${m.week}주차 ${m.weight}kg</span>`).join("");

    $("#programSummary").textContent = `${plan.splitName} · 주 ${input.days}일 · ${plan.goalLabel} · 유산소 ${plan.cardio}`;
    $("#volume").innerHTML = plan.volume.map((v) => {
      const cls = v.sets >= 10 ? "ok" : v.sets >= 5 ? "mid" : "low";
      const pctV = Math.min(100, (v.sets / 20) * 100);
      return `<div class="vol"><span class="vl">${v.label}</span><div class="vbar"><i class="${cls}" style="width:${pctV}%"></i><u style="left:50%"></u></div><span class="vn">${v.sets}세트 · 주 ${v.freq}회</span></div>`;
    }).join("");
    // 요일별 운동: 접었다 펴는 목록 (첫날만 펼침)
    $("#days").innerHTML = plan.days.map((d, di) => `
      <details class="day" ${di === 0 ? "open" : ""}>
        <summary class="dsum"><span class="badge">${d.index}일차</span><b>${d.title}</b><small>${d.items.length}개 운동</small></summary>
        <table><thead><tr><th>운동</th><th>세트×반복</th><th>휴식</th><th class="tg">타겟 부위</th></tr></thead><tbody>
        ${d.items.map((x, xi) => {
          const im = window.ExImages && ExImages[x.id];
          const thumb = im ? `<img class="thumb" src="${im.imgs[0].f}" alt="" loading="lazy">` : "";
          return `<tr class="pick" data-id="${x.id}" data-m="${x.muscle}" data-n="${x.name}"><td><div class="nm">${thumb}<span>${x.name}</span><button type="button" class="swapbtn" data-d="${d.index - 1}" data-i="${xi}" aria-label="${x.name} 교체" title="다른 운동으로 교체">⇄</button></div></td><td>${x.sets} × ${x.reps}</td><td>${x.rest}초</td><td class="tg">${x.muscle}</td></tr>`;
        }).join("")}
        </tbody></table>
      </details>`).join("");
    $("#tips").innerHTML = plan.tips.map((t) => `<li>${t}</li>`).join("");

    $("#results").hidden = false;
    $("#v3d").hidden = true; // 운동을 누를 때만 아래에서 올라오는 시트로 보인다
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function pick(el) {
    document.querySelectorAll("#days tr.sel").forEach((r) => r.classList.remove("sel"));
    let regions, name, muscle, photos = "", credit = "";
    if (el.matches("tr")) {
      el.classList.add("sel");
      regions = Body.regionsFromMuscle(el.dataset.m);
      name = el.dataset.n; muscle = "타겟: " + el.dataset.m;
      const im = window.ExImages && ExImages[el.dataset.id];
      if (im) {
        photos = im.imgs.map((x, i) => `<img src="${x.f}" alt="${esc(name)} 동작 ${i + 1}">`).join("");
        credit = "사진: " + [...new Set(im.imgs.map((x) => `${x.a || "wger.de"} (${x.l})`))].join(", ") + " · wger.de";
      } else photos = `<p class="nophoto">이 운동은 동작 사진이 없습니다. 해부도로 타겟 근육을 확인하세요.</p>`;
    } else {
      const groups = el.dataset.groups.split(",");
      regions = Body.regionsFromGroups(groups);
      name = el.dataset.name; muscle = "타겟: " + groups.map((g) => LABEL[g]).join(" · ");
      photos = `<p class="nophoto">운동 행을 누르면 동작 사진을 볼 수 있습니다.</p>`;
    }
    $("#vFig").innerHTML = Body.figure(regions);
    $("#v3dName").textContent = name;
    $("#v3dMuscle").textContent = muscle;
    $("#vPhotos").innerHTML = photos;
    $("#vCredit").textContent = credit;
  }
  // 모바일: 패널이 아래에서 올라오는 시트. 데스크톱에서는 항상 표시
  const mobileMQ = window.matchMedia("(max-width: 620px)");
  function setSheet(open) {
    $("#v3d").classList.toggle("open", open);
    document.body.classList.toggle("sheet-open", open && mobileMQ.matches);
  }
  // 패널 위치: 계획 탭에서는 프로그램 위(데스크톱) 또는 시트(모바일), 다른 탭에서는 항상 아래 시트
  const v3d = $("#v3d");
  const v3dHome = { parent: v3d.parentNode, next: v3d.nextSibling };
  function dock(floating) {
    if (floating) { if (v3d.parentNode !== document.body) document.body.appendChild(v3d); v3d.classList.add("floating"); }
    else { if (v3d.parentNode !== v3dHome.parent) v3dHome.parent.insertBefore(v3d, v3dHome.next); v3d.classList.remove("floating"); }
  }
  $("#days").addEventListener("click", (e) => {
    const sw = e.target.closest(".swapbtn");
    if (sw) { App.openSwap(Number(sw.dataset.d), Number(sw.dataset.i)); return; }
    const el = e.target.closest("tr.pick");
    if (!el) return;
    dock(true);
    pick(el);
    v3d.hidden = false;
    setSheet(true);
  });
  $("#vClose").addEventListener("click", () => setSheet(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setSheet(false); });
  mobileMQ.addEventListener && mobileMQ.addEventListener("change", () => setSheet(false));

  function run(scroll) {
    const input = read();
    const errs = Calc.validate(input);
    if (input.splits.some((g) => !g.length)) errs.splits = "각 분할에 부위를 하나 이상 선택하세요.";
    document.querySelectorAll(".err").forEach((e) => (e.textContent = errs[e.dataset.for] || ""));
    if (Object.keys(errs).length) {
      const first = document.querySelector(".err:not(:empty)");
      if (first && scroll) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    save(input);
    const plan = Generator.generate({ ...input, seed });
    Store.setProgram(input, plan);
    showProgram();
    document.dispatchEvent(new CustomEvent("fit:program"));
    if (scroll) $("#results").scrollIntoView({ behavior: "smooth" });
  }

  // 저장된 프로그램(교체 내용 포함)을 화면에 그린다
  function showProgram() {
    const p = Store.program();
    if (!p) return;
    render(p.input, Calc.analyze(p.input), p.plan);
    $("#results").hidden = false;
    collapseForm(true, p.input);
  }

  // 프로그램을 만든 뒤에는 입력 폼을 한 줄 요약으로 접는다
  const GOAL_NAME = { muscle: "근육 키우기", lose: "다이어트", strength: "힘 기르기" };
  function collapseForm(on, input) {
    form.hidden = on;
    $("#formSum").hidden = !on;
    $("#formTitle").textContent = on ? "내 정보" : "내 정보 입력";
    if (on && input) {
      $("#formSumText").textContent = `${input.sex === "female" ? "여성" : "남성"} · ${input.height}cm · ${input.weight}kg · ${input.age}세 · ${GOAL_NAME[input.goal]} · 주 ${input.days}일` +
        (input.targetWeight != null ? ` · 목표 ${input.targetWeight}kg` : "");
    }
  }
  $("#editForm").addEventListener("click", () => { collapseForm(false); f.height.focus(); });

  // ---------- 운동 교체 ----------
  let swapEl = null;
  function openSwap(dayIdx, itemIdx) {
    const p = Store.program();
    if (!p) return;
    const day = p.plan.days[dayIdx], item = day && day.items[itemIdx];
    if (!item) return;
    const alts = Generator.alternatives(item, p.input, day.items.map((x) => x.id));
    if (!swapEl) {
      swapEl = document.createElement("div");
      swapEl.className = "swapbox";
      document.body.appendChild(swapEl);
      swapEl.addEventListener("click", (e) => { if (e.target === swapEl || e.target.closest(".swapcancel")) closeSwap(); });
    }
    swapEl.innerHTML = `<div class="swapcard" role="dialog" aria-label="운동 교체">
      <h3>${esc(item.name)} 교체</h3>
      <p class="note">같은 움직임·같은 부위의 대체 운동입니다. 보유 기구와 통증 조건을 반영했습니다.</p>
      <div class="swaplist">${alts.length ? alts.map((x) => {
        const im = window.ExImages && ExImages[x.id];
        return `<button type="button" class="swapitem" data-id="${x.id}">${im ? `<img class="thumb" src="${im.imgs[0].f}" alt="">` : ""}<span><b>${x.name}</b><small>${Exercises.EQUIP_LABEL[x.eq]} · ${x.muscle}</small></span></button>`;
      }).join("") : '<p class="note">조건에 맞는 대체 운동이 없습니다. 보유 기구를 늘려 보세요.</p>'}</div>
      <button type="button" class="ghost swapcancel wide">닫기</button></div>`;
    swapEl.hidden = false;
    swapEl.querySelectorAll(".swapitem").forEach((b) => b.addEventListener("click", () => {
      const ex = Exercises.EXERCISES.find((x) => x.id === b.dataset.id);
      day.items[itemIdx] = Generator.makeItem(ex, p.input.goal, item.sets);
      p.plan.volume = Generator.volume(p.plan.days, p.input.goal, p.input.level);
      Store.updatePlan(p.plan);
      closeSwap(); showProgram();
      document.dispatchEvent(new CustomEvent("fit:program"));
      toast(`${item.name} → ${ex.name}(으)로 교체했어요`);
    }));
  }
  function closeSwap() { if (swapEl) swapEl.hidden = true; }

  // ---------- 토스트 ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- 탭 ----------
  let currentTab = "plan";
  function showTab(name) {
    currentTab = name;
    document.querySelectorAll(".tabpanel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    setSheet(false);
    dock(true);
    window.scrollTo({ top: 0 });
    document.dispatchEvent(new CustomEvent("fit:tab", { detail: name }));
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) showTab(b.dataset.tab); });

  // 다른 모듈에서 쓰는 공개 함수
  window.App = {
    toast, showTab, openSwap, esc, setSheet,
    showExercise(it) {
      const el = document.createElement("tr");
      el.dataset.id = it.id; el.dataset.m = it.muscle; el.dataset.n = it.name;
      dock(true); pick(el); $("#v3d").hidden = false; setSheet(true);
    },
    get tab() { return currentTab; },
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); seed = 0; run(true); });
  $("#regen").addEventListener("click", () => { seed++; run(false); });
  $("#startToday").addEventListener("click", () => showTab("today"));
  const printBtn = $("#print");
  if (printBtn) printBtn.addEventListener("click", () => window.print());

  // ---------- 시작: 비밀번호로 로그인한 뒤(fit:unlocked) 그 계정의 데이터로 화면을 채운다 ----------
  syncSplitCountOptions();
  function start() {
    const saved = load();
    if (saved && !["muscle", "lose", "strength"].includes(saved.goal)) saved.goal = "muscle";
    if (saved) { write(saved); if (Store.program()) showProgram(); else run(false); }
    else { setSplitCount(Generator.recommendedSplitCount(Number(f.days.value))); updateGoalUI(); setEquip(Exercises.LOCATION_EQ[f.location.value]); ensureDate(); updateGoalHint(); }
    showTab("plan");
  }
  document.addEventListener("fit:unlocked", start);

  // 오프라인 사용: 서비스 워커 (iframe·file:// 에서는 건너뜀)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && window.top === window.self) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
