/* 식단 기록: 음식 검색 → 그램 입력 → 식품별 열량·탄단지 표시, 끼니별·하루 합계, 목표 칼로리 대비 */
(function () {
  const $ = (s) => document.querySelector(s);
  const card = $("#dietCard");
  // 끼니 슬롯: 하루 1~5끼, 이름은 바꿀 수 있다. 슬롯 키는 s1~s5
  const DEFAULT_NAMES = {
    1: ["식사"], 2: ["첫 끼", "마지막 끼"], 3: ["아침", "점심", "저녁"], 4: ["아침", "점심", "저녁", "간식"],
    5: ["아침", "오전 간식", "점심", "오후 간식", "저녁"],
  };
  function mealCount() {
    const s = Store.settings();
    // 이미 기록이 있는 슬롯은 끼니 수를 줄여도 숨기지 않는다
    const used = Store.mealsOn(date).reduce((m, x) => Math.max(m, Number(String(x.meal).slice(1)) || 0), 0);
    return Math.max(Math.min(5, Math.max(1, s.mealCount || 4)), used);
  }
  function mealName(i) {
    const s = Store.settings();
    const n = Math.min(5, Math.max(1, s.mealCount || 4));
    return (s.mealNames && s.mealNames[i]) || (DEFAULT_NAMES[n][i]) || DEFAULT_NAMES[5][i] || "식사 " + (i + 1);
  }
  const mealDefs = () => Array.from({ length: mealCount() }, (_, i) => ["s" + (i + 1), mealName(i)]);
  const MEAL_LABEL_OF = (k) => mealName(Number(k.slice(1)) - 1);
  let editNames = false;
  let cfgOpen = false; // 끼니 설정 펼침 상태 (다시 그려도 유지)
  document.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("mealcfgbox")) cfgOpen = e.target.open; }, true);

  let date = Store.today();
  let meal = defaultMeal();
  let query = "";
  let sel = null;      // 선택한 식품
  let grams = "";
  let showCustom = false;

  // 지금 시각에 가까운 끼니를 기본으로 고른다 (05~22시를 끼니 수로 나눔)
  function defaultMeal() {
    const n = Math.min(5, Math.max(1, Store.settings().mealCount || 4));
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const idx = Math.min(n - 1, Math.max(0, Math.floor(((h - 5) / 17) * n)));
    return "s" + (idx + 1);
  }
  const esc = (s) => App.esc(s);
  const shift = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const label = (iso) => {
    const t = Store.today();
    if (iso === t) return "오늘";
    if (iso === shift(t, -1)) return "어제";
    const d = new Date(iso + "T12:00:00");
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
  };
  const allFoods = () => Store.customFoods().concat(Foods.FOODS);
  const findFood = (id) => allFoods().find((x) => x.id === id);

  // 목표: 프로그램을 만들었으면 그 계산 결과를 쓴다
  function targets() {
    const p = Store.program();
    if (!p) return null;
    // 최근 체중·남은 기한·추가 활동 목표를 반영한 오늘 기준 목표
    const r = Calc.analyze(Energy.currentInput(p, Store.data().weights, Store.settings(), Store.today()));
    return { kcal: r.target.kcal, c: r.macros.carbs, p: r.macros.protein, f: r.macros.fat };
  }

  function totals(list) {
    return list.reduce((t, x) => ({ kcal: t.kcal + x.kcal, c: t.c + x.c, p: t.p + x.p, f: t.f + x.f }), { kcal: 0, c: 0, p: 0, f: 0 });
  }
  const r1 = (x) => Math.round(x * 10) / 10;

  // 최근에 먹은 음식 (중복 제거, 최신순)
  function recentFoods() {
    const all = Object.values(Store.data().meals).flat().sort((a, b) => b.ts - a.ts);
    const seen = new Set(), out = [];
    for (const m of all) { if (!seen.has(m.fid) && findFood(m.fid)) { seen.add(m.fid); out.push({ food: findFood(m.fid), g: m.g }); } if (out.length >= 8) break; }
    return out;
  }

  function weekAvg() {
    const days = [];
    for (let i = 0; i < 7; i++) { const l = Store.mealsOn(shift(Store.today(), -i)); if (l.length) days.push(totals(l).kcal); }
    return days.length ? { avg: Math.round(days.reduce((a, b) => a + b, 0) / days.length), n: days.length } : null;
  }

  function bar(name, v, t, unit) {
    if (!t) return `<div class="mrow"><span>${name}</span><b>${r1(v)}${unit}</b></div>`;
    const pct = Math.min(100, (v / t) * 100);
    const over = v > t * 1.1;
    return `<div class="mrow"><span>${name}</span><div class="mbar"><i class="${over ? "over" : ""}" style="width:${pct}%"></i></div><b>${Math.round(v)} / ${t}${unit}</b></div>`;
  }

  function render() {
    const list = Store.mealsOn(date);
    const tot = totals(list);
    const tg = targets();
    const left = tg ? tg.kcal - tot.kcal : null;
    const wa = weekAvg();

    card.innerHTML = `
      <div class="datebar">
        <button type="button" class="ghost nav" data-act="prev" aria-label="전날">‹</button>
        <label class="dlabel"><b>${label(date)}</b><input type="date" id="dietDate" value="${date}" aria-label="날짜 선택"></label>
        <button type="button" class="ghost nav" data-act="next" aria-label="다음날" ${date >= Store.today() ? "disabled" : ""}>›</button>
      </div>

      <div class="kcalbox">
        <div class="kbig"><b>${tot.kcal.toLocaleString()}</b><span>kcal 섭취</span></div>
        ${tg ? `<div class="kleft ${left < 0 ? "over" : ""}">${left >= 0 ? `${left.toLocaleString()} kcal 남음` : `${(-left).toLocaleString()} kcal 초과`}<small>목표 ${tg.kcal.toLocaleString()} kcal</small></div>`
             : `<div class="kleft"><small>'계획' 탭에서 프로그램을 만들면 목표 칼로리와 비교해 드려요</small></div>`}
      </div>
      ${tg ? `<div class="kbar"><i class="${left < 0 ? "over" : ""}" style="width:${Math.min(100, (tot.kcal / tg.kcal) * 100)}%"></i></div>` : ""}
      <div class="macros">${bar("탄수화물", tot.c, tg && tg.c, "g")}${bar("단백질", tot.p, tg && tg.p, "g")}${bar("지방", tot.f, tg && tg.f, "g")}</div>
      ${wa ? `<p class="note">최근 7일 중 기록한 ${wa.n}일 평균 ${wa.avg.toLocaleString()} kcal</p>` : ""}

      <div class="addbox">
        <h3>음식 추가</h3>
        <div class="seg seg4" role="radiogroup" aria-label="끼니">
          ${mealDefs().map(([k, n]) => `<label><input type="radio" name="mealPick" value="${k}" ${k === meal ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}
        </div>
        <input type="search" id="foodQ" placeholder="음식 이름 검색 (예: 닭가슴살, 밥, 바나나)" value="${esc(query)}" autocomplete="off" enterkeyhint="search">
        <div id="foodArea">${areaHTML()}</div>
      </div>

      <div class="meallist">${mealDefs().map(([k, n]) => mealHTML(k, n, list.filter((x) => x.meal === k), tg)).join("")}</div>
      <details class="fold2 mealcfgbox" ${cfgOpen ? "open" : ""}><summary>끼니 설정 <small>하루 ${Math.min(5, Math.max(1, Store.settings().mealCount || 4))}끼</small></summary><div class="mealset">${mealSettingHTML()}</div></details>
      <p class="note">열량은 국내 식품성분표 등을 바탕으로 한 100g당 근사값입니다. 조리법·브랜드에 따라 차이가 날 수 있어요.</p>`;
  }

  // 검색창 아래 영역 (검색 결과 / 선택한 음식 / 최근 음식 / 직접 추가). 검색창 자체는 다시 그리지 않는다(한글 입력 유지)
  function areaHTML() {
    const results = query ? Foods.search(query, Store.customFoods()) : [];
    const recent = query ? [] : recentFoods();
    return (sel ? selectedHTML() : results.length ? `<div class="fresults">${results.map(foodBtn).join("")}</div>`
      : query ? `<p class="note">'${esc(query)}' 검색 결과가 없습니다. 아래에서 직접 추가할 수 있어요.</p>`
      : recent.length ? `<p class="sub2">최근 먹은 음식</p><div class="fchips">${recent.map((x) => `<button type="button" class="fchip" data-food="${x.food.id}" data-g="${x.g}">${esc(x.food.name)} <small>${x.g}g</small></button>`).join("")}</div>` : "") +
      (!sel ? `<button type="button" class="linkbtn" data-act="custom">${showCustom ? "직접 추가 닫기" : "+ 목록에 없는 음식 직접 추가"}</button>` : "") +
      (showCustom && !sel ? customHTML() : "");
  }
  const renderArea = () => { const a = $("#foodArea"); if (a) a.innerHTML = areaHTML(); };

  function foodBtn(x) {
    return `<button type="button" class="fitem" data-food="${x.id}"><span><b>${esc(x.name)}</b><small>${x.cat} · ${x.serveLabel} ${x.serveG}g</small></span><em>${x.kcal}<small>kcal/100g</small></em></button>`;
  }

  function selectedHTML() {
    const g = Number(grams) || 0;
    const n = Foods.calc(sel, g);
    const quick = [[sel.serveLabel, sel.serveG], ["½" + sel.serveLabel, Math.round(sel.serveG / 2)], ["100g", 100]];
    if (sel.serveG >= 150) quick.push(["2" + sel.serveLabel.replace(/^1/, ""), sel.serveG * 2]);
    return `<div class="selfood">
      <div class="selhead"><b>${esc(sel.name)}</b><button type="button" class="ghost small" data-act="unsel">다른 음식</button></div>
      <p class="note">100g당 ${sel.kcal}kcal · 탄 ${sel.c}g · 단 ${sel.p}g · 지 ${sel.f}g</p>
      <div class="quick">${quick.map(([l, q]) => `<button type="button" class="ghost small ${Number(grams) === q ? "on" : ""}" data-g="${q}">${l === "100g" ? "100g" : `${esc(l)} ${q}g`}</button>`).join("")}</div>
      <label class="glabel">먹은 양 (g)<input type="number" id="gramIn" inputmode="decimal" min="1" step="1" value="${grams}" placeholder="그램 수"></label>
      <div class="preview"><b>${n.kcal.toLocaleString()} kcal</b><span>탄 ${n.c}g · 단 ${n.p}g · 지 ${n.f}g</span></div>
      <button type="button" class="primary" data-act="add" ${g > 0 ? "" : "disabled"}>${esc(MEAL_LABEL_OF(meal))}에 추가</button>
    </div>`;
  }

  function customHTML() {
    return `<form class="customf" id="customForm" novalidate>
      <label>음식 이름<input type="text" name="cname" required placeholder="예: 엄마표 닭볶음탕"></label>
      <div class="grid2">
        <label>100g당 열량 (kcal)<input type="number" name="ckcal" inputmode="decimal" placeholder="예: 150"></label>
        <label>1회 분량 (g) <small>(선택)</small><input type="number" name="cserve" inputmode="decimal" placeholder="예: 300"></label>
        <label>탄수화물 g/100g <small>(선택)</small><input type="number" name="cc" inputmode="decimal"></label>
        <label>단백질 g/100g <small>(선택)</small><input type="number" name="cp" inputmode="decimal"></label>
        <label>지방 g/100g <small>(선택)</small><input type="number" name="cf" inputmode="decimal"></label>
      </div>
      <p class="note">제품 포장의 영양정보를 100g 기준으로 넣으세요. 한 번 추가하면 다음부터 검색됩니다.</p>
      <button type="submit" class="primary">저장하고 선택</button>
    </form>`;
  }

  // 하루 끼니 수(1~5)와 이름 설정
  function mealSettingHTML() {
    const cnt = Math.min(5, Math.max(1, Store.settings().mealCount || 4));
    return `<div class="mealcfg"><span>하루 끼니</span>
      <div class="chips5" role="radiogroup" aria-label="하루 끼니 수">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="ghost small ${n === cnt ? "on" : ""}" data-count="${n}" aria-pressed="${n === cnt}">${n}끼</button>`).join("")}</div>
      <button type="button" class="linkbtn" data-act="names">${editNames ? "이름 입력 닫기" : "이름 바꾸기"}</button></div>
      ${editNames ? `<div class="names">${Array.from({ length: mealCount() }, (_, i) => `<label>${i + 1}번째 끼니<input type="text" class="mname" data-i="${i}" value="${esc(mealName(i))}" maxlength="10"></label>`).join("")}</div>` : ""}`;
  }

  function mealHTML(k, n, items, tg) {
    const per = tg ? Math.round(tg.kcal / mealCount()) : null;
    const hint = per ? `<small class="rec">권장 약 ${per.toLocaleString()} kcal</small>` : "";
    if (!items.length) return `<section class="meal empty"><div class="mhead"><h3>${esc(n)}</h3>${hint}</div><p class="note">기록 없음</p></section>`;
    const t = totals(items);
    return `<section class="meal"><div class="mhead"><h3>${esc(n)}</h3>${hint}<b>${t.kcal.toLocaleString()} kcal</b></div>
      <ul>${items.map((x) => `<li data-id="${x.id}">
        <div class="mi"><b>${esc(x.name)}</b><small>탄 ${x.c} · 단 ${x.p} · 지 ${x.f}g</small></div>
        <input type="number" class="gedit" inputmode="decimal" value="${x.g}" aria-label="${esc(x.name)} 그램"><span class="gu">g</span>
        <b class="mk">${x.kcal.toLocaleString()}<small>kcal</small></b>
        <button type="button" class="x" data-act="del" aria-label="${esc(x.name)} 삭제">✕</button></li>`).join("")}</ul></section>`;
  }

  // ---------- 이벤트 ----------
  function pickFood(id, g) {
    sel = findFood(id);
    grams = String(g || (sel ? sel.serveG : ""));
    renderArea();
    const gi = $("#gramIn"); if (gi) { gi.focus(); gi.select(); }
  }

  card.addEventListener("click", (e) => {
    const fb = e.target.closest("[data-food]");
    if (fb) { pickFood(fb.dataset.food, fb.dataset.g ? Number(fb.dataset.g) : null); return; }
    const cb = e.target.closest("[data-count]");
    if (cb) {
      const n = Number(cb.dataset.count);
      Store.setSettings({ mealCount: n });
      if (Number(String(meal).slice(1)) > n) meal = "s" + n;
      render(); return;
    }
    const qb = e.target.closest(".quick [data-g]");
    if (qb) { grams = qb.dataset.g; renderArea(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "prev") { date = shift(date, -1); render(); }
    else if (act === "next") { if (date < Store.today()) { date = shift(date, 1); render(); } }
    else if (act === "unsel") { sel = null; grams = ""; renderArea(); const q = $("#foodQ"); if (q) q.focus(); }
    else if (act === "custom") { showCustom = !showCustom; renderArea(); }
    else if (act === "names") { editNames = !editNames; render(); }
    else if (act === "add") {
      const g = Number(grams);
      if (!sel || !(g > 0)) return;
      const n = Foods.calc(sel, g);
      Store.addMeal(date, { meal, fid: sel.id, name: sel.name, g, ...n });
      App.toast(`${sel.name} ${g}g · ${n.kcal}kcal 추가했어요`);
      sel = null; grams = ""; query = "";
      render();
    } else if (act === "del") {
      const li = b.closest("li");
      Store.deleteMeal(date, li.dataset.id); render();
    }
  });

  card.addEventListener("input", (e) => {
    if (e.target.id === "foodQ") {
      query = e.target.value; sel = null;
      renderArea();
    } else if (e.target.id === "gramIn") {
      grams = e.target.value;
      const g = Number(grams) || 0, n = Foods.calc(sel, g);
      card.querySelector(".preview").innerHTML = `<b>${n.kcal.toLocaleString()} kcal</b><span>탄 ${n.c}g · 단 ${n.p}g · 지 ${n.f}g</span>`;
      card.querySelector('[data-act="add"]').disabled = !(g > 0);
      card.querySelectorAll(".quick [data-g]").forEach((q) => q.classList.toggle("on", Number(q.dataset.g) === g));
    }
  });

  card.addEventListener("change", (e) => {
    if (e.target.classList.contains("mname")) {
      const names = Array.from({ length: 5 }, (_, i) => mealName(i));
      names[Number(e.target.dataset.i)] = e.target.value.trim() || names[Number(e.target.dataset.i)];
      Store.setSettings({ mealNames: names });
      render(); return;
    }
    if (e.target.name === "mealPick") { meal = e.target.value; if (sel) renderArea(); }
    else if (e.target.id === "dietDate") { if (e.target.value) { date = e.target.value > Store.today() ? Store.today() : e.target.value; render(); } }
    else if (e.target.classList.contains("gedit")) {
      // 기록된 항목의 그램 수 수정 → 열량 다시 계산
      const li = e.target.closest("li");
      const it = Store.mealsOn(date).find((x) => x.id === li.dataset.id);
      const g = Number(e.target.value);
      if (!it || !(g > 0)) { render(); return; }
      const food = findFood(it.fid);
      const n = food ? Foods.calc(food, g) : { kcal: Math.round((it.kcal * g) / it.g), c: r1((it.c * g) / it.g), p: r1((it.p * g) / it.g), f: r1((it.f * g) / it.g) };
      Store.updateMeal(date, it.id, { g, ...n });
      render();
    }
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.id === "gramIn") { e.preventDefault(); const a = card.querySelector('[data-act="add"]'); if (a && !a.disabled) a.click(); }
    if (e.key === "Enter" && e.target.id === "foodQ") {
      e.preventDefault();
      const first = card.querySelector(".fresults [data-food]");
      if (first) first.click();
    }
  });

  card.addEventListener("submit", (e) => {
    if (e.target.id !== "customForm") return;
    e.preventDefault();
    const fe = e.target.elements;
    const name = fe.cname.value.trim(), kcal = Number(fe.ckcal.value);
    if (!name) { App.toast("음식 이름을 입력하세요"); return; }
    if (!(kcal >= 0 && kcal <= 950 && fe.ckcal.value !== "")) { App.toast("100g당 열량을 0~950 사이로 입력하세요"); return; }
    const serveG = Number(fe.cserve.value) || 100;
    Store.addCustomFood({ name, kcal, c: Number(fe.cc.value) || 0, p: Number(fe.cp.value) || 0, f: Number(fe.cf.value) || 0, serveLabel: "1회", serveG });
    showCustom = false; query = "";
    const qi = $("#foodQ"); if (qi) qi.value = "";
    pickFood(Store.customFoods()[0].id, serveG);
    App.toast(`'${name}'을(를) 내 음식에 추가했어요`);
  });

  document.addEventListener("fit:tab", (e) => { if (e.detail === "diet") { date = date || Store.today(); render(); } });
  document.addEventListener("fit:program", () => { if (App.tab === "diet") render(); });
})();
