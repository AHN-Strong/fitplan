/* 활동 탭: 직업·활동 기록 → 하루 총 소모 칼로리, 섭취와의 수지, 목표 체중 달성 플래너 */
(function () {
  const $ = (s) => document.querySelector(s);
  const card = $("#energyCard");
  const esc = (s) => App.esc(s);
  const r1 = (x) => Math.round(x * 10) / 10;

  let date = Store.today();
  let actId = "walk";
  let minutes = "30";

  const shift = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const label = (iso) => {
    const t = Store.today();
    if (iso === t) return "오늘";
    if (iso === shift(t, -1)) return "어제";
    const d = new Date(iso + "T12:00:00");
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
  };

  // 그 날짜 기준 체중: 그 날짜까지 기록한 가장 최근 체중, 없으면 프로그램 입력 체중
  function weightOn(p, iso) {
    const w = Store.data().weights.filter((x) => x.date <= iso);
    return w.length ? w[w.length - 1].kg : p.input.weight;
  }
  const sessionsOn = (iso) => Store.data().sessions.filter((s) => s.date === iso);
  const intakeOn = (iso) => Store.mealsOn(iso).reduce((a, x) => a + x.kcal, 0);

  function burnOn(p, iso) {
    return Energy.dayBurn(p.input, weightOn(p, iso), Store.activitiesOn(iso), sessionsOn(iso));
  }

  function empty() {
    card.innerHTML = `<h2>활동</h2><p class="note">먼저 '계획' 탭에서 키·몸무게·나이를 넣고 프로그램을 만들어 주세요. 그 정보로 하루 소모 칼로리를 계산합니다.</p><button type="button" class="primary" data-go="plan">프로그램 만들러 가기</button>`;
  }

  function render() {
    const p = Store.program();
    if (!p) { empty(); return; }
    const input = Energy.currentInput(p, Store.data().weights, Store.settings(), Store.today());
    const b = burnOn(p, date);
    const intake = intakeOn(date);
    const balance = intake - b.total;
    const hasIntake = Store.mealsOn(date).length > 0;
    const act = Energy.byId[actId];
    const min = Number(minutes) || 0;
    const w = weightOn(p, date);
    const prevKcal = act ? Energy.activityKcal(act.met, w, min) : 0;

    card.innerHTML = `
      <div class="datebar">
        <button type="button" class="ghost nav" data-act="prev" aria-label="전날">‹</button>
        <label class="dlabel"><b>${label(date)}</b><input type="date" id="enDate" value="${date}" aria-label="날짜 선택"></label>
        <button type="button" class="ghost nav" data-act="next" aria-label="다음날" ${date >= Store.today() ? "disabled" : ""}>›</button>
      </div>

      <div class="kcalbox">
        <div class="kbig"><b>${b.total.toLocaleString()}</b><span>kcal 하루 총 소모</span></div>
        <div class="kleft ${hasIntake ? (balance > 0 ? "over" : "") : ""}">${hasIntake ? `섭취 ${intake.toLocaleString()} kcal<small>수지 ${balance > 0 ? "+" : ""}${balance.toLocaleString()} kcal</small>` : `<small>식단을 기록하면 수지를 계산해요</small>`}</div>
      </div>
      <div class="burnstack" role="img" aria-label="소모 칼로리 구성">
        <i class="s1" style="flex:${b.bmr}"></i><i class="s2" style="flex:${b.neat}"></i><i class="s3" style="flex:${Math.max(b.act, 1)}"></i>
      </div>
      <ul class="legend2">
        <li><i class="s1"></i>기초대사량 <b>${b.bmr.toLocaleString()}</b></li>
        <li><i class="s2"></i>직업·일상 활동 <b>${b.neat.toLocaleString()}</b></li>
        <li><i class="s3"></i>운동·활동 <b>${b.act.toLocaleString()}</b></li>
      </ul>
      ${hasIntake ? `<p class="note">${balanceNote(balance)}</p>` : ""}

      <div class="addbox">
        <h3>운동·활동 기록</h3>
        <label>활동 종류
          <select id="actSel">${Energy.ACTIVITIES.map((a) => `<option value="${a.id}" ${a.id === actId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
        </label>
        <label>시간 (분)<input type="number" id="actMin" inputmode="numeric" min="1" step="1" value="${minutes}" placeholder="분"></label>
        <div class="quick">${[15, 30, 45, 60, 90].map((m) => `<button type="button" class="ghost small ${Number(minutes) === m ? "on" : ""}" data-min="${m}">${m}분</button>`).join("")}</div>
        <div class="preview"><b id="actPrev">${prevKcal.toLocaleString()} kcal</b><span>체중 ${r1(w)}kg · MET ${act ? act.met : "-"} 기준</span></div>
        <button type="button" class="primary" data-act="add" ${min > 0 ? "" : "disabled"}>활동 추가</button>
        ${b.items.length ? `<ul class="actlist">${b.items.map((x) => `<li><span class="an"><b>${esc(x.name)}</b><small>${x.min}분${x.auto ? " · 운동 기록에서 자동 반영" : ""}</small></span><b class="ak">${x.kcal.toLocaleString()}<small>kcal</small></b>${x.auto ? `<span class="x"></span>` : `<button type="button" class="x" data-del="${x.id}" aria-label="${esc(x.name)} 삭제">✕</button>`}</li>`).join("")}</ul>` : `<p class="note">아직 기록이 없습니다. 걷기, 달리기 같은 활동을 추가해 보세요. 웨이트는 '운동' 탭에서 완료하면 자동으로 들어옵니다.</p>`}
      </div>

      ${plannerHTML(p, input)}

      <details class="fold2">
        <summary>직업·평소 활동 <small>${esc(Calc.JOBS[input.job].label)}</small></summary>
        <select id="jobSel" aria-label="직업·평소 활동">${Object.keys(Calc.JOBS).map((k) => `<option value="${k}" ${Number(k) === input.job ? "selected" : ""}>${esc(Calc.JOBS[k].label)}</option>`).join("")}</select>
        <p class="note">직업과 평소 생활 활동은 하루 ${b.neat.toLocaleString()} kcal로 계산했어요(기초대사량의 ${Math.round((Calc.JOBS[input.job].factor - 1) * 100)}%). 운동은 위에서 따로 기록합니다.</p>
      </details>
      <details class="fold2">
        <summary>최근 14일 섭취 · 소모 그래프</summary>
        <div class="chart" id="energyChart"></div>
        <p class="note">소모는 (MET − 1) × 체중 × 시간으로 계산한 추정값이고, 식사 후 열 발생 등은 포함하지 않았습니다.</p>
      </details>`;
    drawChart(p);
  }

  function balanceNote(b) {
    if (Math.abs(b) < 150) return "섭취와 소모가 비슷해 체중은 거의 유지될 거예요.";
    const kg = Math.abs(Energy.weightChange(b * 7));
    return b < 0 ? `하루 ${(-b).toLocaleString()} kcal 부족 → 이 상태가 일주일 이어지면 약 ${kg}kg 감량` : `하루 ${b.toLocaleString()} kcal 초과 → 이 상태가 일주일 이어지면 약 ${kg}kg 증량`;
  }

  // ---------- 목표 달성 플래너 ----------
  function plannerHTML(p, input) {
    if (input.targetWeight == null) {
      return `<div class="addbox"><h3>목표 체중 플래너</h3><p class="note">'계획' 탭에서 목표 체중과 달성 기한을 정하면, 기한에 맞춰 하루에 얼마나 먹고 움직여야 하는지 계산해 드려요.</p><button type="button" class="ghost wide" data-go="plan">목표 체중 정하러 가기</button></div>`;
    }
    const r = Calc.analyze(input);
    const gp = r.plan;
    const now = input.weight, tw = input.targetWeight;
    const diff = r1(tw - now);
    const leftDays = Math.max(0, Math.round((new Date(input.targetDate + "T12:00:00") - new Date(Store.today() + "T12:00:00")) / 86400000));
    // 실제 페이스: 최근 14일 중 섭취·활동 기록이 있는 날의 평균 수지
    const days = [];
    for (let i = 0; i < 14; i++) {
      const iso = shift(Store.today(), -i);
      if (Store.mealsOn(iso).length) days.push(intakeOn(iso) - burnOn(p, iso).total);
    }
    const avg = days.length >= 3 ? Math.round(days.reduce((a, c) => a + c, 0) / days.length) : null;
    let eta = "";
    if (avg != null && Math.abs(diff) > 0.1) {
      const perWeek = Energy.weightChange(avg * 7);
      const toward = (diff < 0 && perWeek < 0) || (diff > 0 && perWeek > 0);
      eta = toward ? `최근 ${days.length}일 평균 수지(${avg > 0 ? "+" : ""}${avg.toLocaleString()} kcal/일)로는 목표까지 약 ${Math.ceil(Math.abs(diff) / Math.abs(perWeek))}주 걸려요.`
        : `최근 ${days.length}일 평균 수지(${avg > 0 ? "+" : ""}${avg.toLocaleString()} kcal/일)가 목표 방향과 반대예요. 아래 권장 섭취량에 맞춰 보세요.`;
    }
    const extra = input.extraKcal || 0;
    return `<div class="addbox planner">
      <h3>목표 체중 플래너</h3>
      <div class="goalline"><span>${r1(now)}kg</span><div class="gbar"><i style="width:${progress(p, now, tw)}%"></i></div><span>${tw}kg</span></div>
      <p class="note">${input.expired ? "<b>기한이 지났어요.</b> '계획' 탭에서 새 기한을 정해 주세요. 지금은 2주 뒤 기한으로 계산한 값입니다." : `기한 ${input.targetDate} (D-${leftDays}) · ${diff === 0 ? "유지" : (diff > 0 ? "+" : "") + diff + "kg"}`}</p>
      <div class="stats">
        <div class="stat"><span>하루 권장 섭취</span><b>${r.target.kcal.toLocaleString()}<small>kcal</small></b><em>${r.target.adjust === 0 ? "유지" : "소모 대비 " + (r.target.adjust > 0 ? "+" : "") + r.target.adjust}</em></div>
        <div class="stat"><span>하루 예상 소모</span><b>${r.tdee.toLocaleString()}<small>kcal</small></b><em>운동 일정과 추가 활동 포함</em></div>
      </div>
      ${r.target.warning ? `<p class="warn">${r.target.warning}</p>` : ""}
      <ul class="gnotes">${gp.notes.filter((n) => n.level !== "info" || true).map((n) => `<li class="${n.level}">${n.text}</li>`).join("")}</ul>
      ${eta ? `<p class="note">${eta}</p>` : ""}
      ${plansHTML(input)}
      <label class="slider">매일 활동으로 더 태울 칼로리: <b id="exVal">${extra}</b> kcal
        <input type="range" id="extraRange" min="0" max="800" step="50" value="${extra}">
      </label>
      <p class="note">슬라이더를 올리면 같은 기한을 지키면서 먹을 수 있는 양이 늘어요. 예를 들어 하루 30분 빠르게 걷기는 약 ${Energy.activityKcal(4.3, now, 30)} kcal입니다. 이 값은 식단 탭의 목표 칼로리에도 반영됩니다.</p>
    </div>`;
  }

  // ---------- 다이어트 가속 플랜 3가지 + 내 감량 상태 ----------
  function plansHTML(input) {
    const pl = BodyComp.plans(input, input.weight, Store.today());
    if (!pl.ok) return `<p class="note">${esc(pl.reason)}</p>`;
    const s = BodyComp.status(Store.data().weights, input, Store.today());
    const stat = s.level === "none" ? "" : `<div class="bstatus mini ${s.level}"><div class="bbadge">${BodyComp.LEVEL_LABEL[s.level]}</div><div class="bwhy"><b>내 감량 속도 · 체성분 평가</b><ul>${s.reasons.slice(0, 2).map((r) => `<li class="${r.lv}">${r.t}</li>`).join("")}</ul></div></div>`;
    return `<h3 class="sub3">다이어트 가속 플랜 <small>${input.weight}kg → ${input.targetWeight}kg (${pl.diff}kg)</small></h3>
      ${stat}
      <div class="plans">${pl.list.map((x) => {
        const on = input.targetDate && x.dateISO === input.targetDate;
        return `<div class="plan ${on ? "on" : ""}">
          <div class="phead"><b>${x.name}</b><span class="ptag">${x.tag}</span></div>
          <div class="pnums">
            <div><span>주당</span><b>${x.weekly}<small>kg</small></b><small>체중의 ${x.pct}%</small></div>
            <div><span>하루 섭취</span><b>${x.intake.toLocaleString()}<small>kcal</small></b><small>소모 −${x.deficit}</small></div>
            <div><span>도달</span><b>${x.days}<small>일</small></b><small>${x.dateISO}</small></div>
          </div>
          ${x.limited ? `<p class="warn">이 속도를 지키면서 기초대사량 아래로 먹지 않으려면 하루 ${x.extra}kcal(빠르게 걷기 약 ${x.walkMin}분)를 활동으로 더 태워야 해요.</p>` : ""}
          <details><summary>근거 보기</summary><p class="note">${esc(x.basis)}</p></details>
          <button type="button" class="${on ? "primary" : "ghost"} small wideb" data-plan="${x.id}">${on ? "적용 중인 플랜" : "이 플랜으로 기한 정하기"}</button>
        </div>`;
      }).join("")}</div>
      <p class="note">플랜의 속도는 체중 변화 속도를 기준으로 한 일반적인 연구 근거이고, 개인차가 큽니다. 어지럽거나 컨디션이 크게 떨어지면 속도를 늦추세요.</p>`;
  }

  // 시작 체중(프로그램 입력)에서 목표까지 진행률 (0~100)
  function progress(p, now, target) {
    const start = p.input.weight;
    if (start === target) return 100;
    return Math.max(0, Math.min(100, Math.round(((start - now) / (start - target)) * 100)));
  }

  function drawChart(p) {
    const intake = [], burn = [];
    for (let i = 13; i >= 0; i--) {
      const iso = shift(Store.today(), -i), t = new Date(iso + "T12:00:00").getTime();
      if (Store.mealsOn(iso).length) intake.push({ t, v: intakeOn(iso) });
      burn.push({ t, v: burnOn(p, iso).total });
    }
    const el = $("#energyChart");
    if (!el || !window.Charts) return;
    el.innerHTML = window.Charts.lineChart([{ pts: burn, cls: "a" }, ...(intake.length ? [{ pts: intake, cls: "b" }] : [])], "") +
      `<p class="note"><span class="dot a"></span>소모 <span class="dot b"></span>섭취 (기록한 날만)</p>`;
  }

  // ---------- 이벤트 ----------
  card.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { App.showTab(go.dataset.go); return; }
    const pb = e.target.closest("[data-plan]");
    if (pb) {
      const pr = Store.program();
      const input = Energy.currentInput(pr, Store.data().weights, Store.settings(), Store.today());
      const pl = BodyComp.plans(input, input.weight, Store.today());
      const x = pl.ok && pl.list.find((q) => q.id === pb.dataset.plan);
      if (!x) return;
      // 기한은 최소 2주 뒤로
      let date = x.dateISO;
      if (Calc.weeksUntil(date, Store.today()) < 2) date = shift(Store.today(), 14);
      Store.updateInput({ targetDate: date, weeks: Calc.weeksUntil(date, Store.today()) });
      if (x.extra > (Store.settings().extraKcal || 0)) Store.setSettings({ extraKcal: Math.min(800, Math.ceil(x.extra / 50) * 50) }); // 필요한 추가 활동을 목표에 반영
      const saved = Store.form();
      if (saved) { saved.targetDate = date; Store.setForm(saved); }
      const df = document.querySelector('input[name="targetDate"]'); if (df) df.value = date;
      App.toast(`'${x.name}'으로 정했어요. 목표 기한은 ${date}입니다`);
      render(); document.dispatchEvent(new CustomEvent("fit:settings"));
      return;
    }
    const mb = e.target.closest("[data-min]");
    if (mb) { minutes = mb.dataset.min; render(); return; }
    const del = e.target.closest("[data-del]");
    if (del) { Store.deleteActivity(date, del.dataset.del); render(); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "prev") { date = shift(date, -1); render(); }
    else if (act === "next") { if (date < Store.today()) { date = shift(date, 1); render(); } }
    else if (act === "add") {
      const p = Store.program(), a = Energy.byId[actId], m = Number(minutes);
      if (!p || !a || !(m > 0)) return;
      const kcal = Energy.activityKcal(a.met, weightOn(p, date), m);
      Store.addActivity(date, { type: a.id, name: a.name, min: m, kcal });
      App.toast(`${a.name} ${m}분 · ${kcal}kcal 추가했어요`);
      render();
    }
  });

  card.addEventListener("input", (e) => {
    if (e.target.id === "actMin") {
      minutes = e.target.value;
      const p = Store.program(), a = Energy.byId[actId], m = Number(minutes) || 0;
      $("#actPrev").textContent = Energy.activityKcal(a.met, weightOn(p, date), m).toLocaleString() + " kcal";
      card.querySelector('[data-act="add"]').disabled = !(m > 0);
      card.querySelectorAll("[data-min]").forEach((q) => q.classList.toggle("on", Number(q.dataset.min) === m));
    } else if (e.target.id === "extraRange") {
      $("#exVal").textContent = e.target.value;
    }
  });

  card.addEventListener("change", (e) => {
    if (e.target.id === "actSel") { actId = e.target.value; render(); }
    else if (e.target.id === "enDate") { if (e.target.value) { date = e.target.value > Store.today() ? Store.today() : e.target.value; render(); } }
    else if (e.target.id === "jobSel") {
      Store.updateInput({ job: Number(e.target.value) });
      syncJobToForm(Number(e.target.value));
      render(); document.dispatchEvent(new CustomEvent("fit:settings"));
    } else if (e.target.id === "extraRange") {
      Store.setSettings({ extraKcal: Number(e.target.value) });
      render(); document.dispatchEvent(new CustomEvent("fit:settings"));
    }
  });

  // 활동 탭에서 직업을 바꾸면 '계획' 탭의 입력값과 저장된 폼 값도 같이 바꾼다
  function syncJobToForm(job) {
    const sel = document.querySelector('select[name="job"]');
    if (sel) sel.value = String(job);
    const saved = Store.form();
    if (saved) { saved.job = job; Store.setForm(saved); }
  }

  document.addEventListener("fit:tab", (e) => { if (e.detail === "energy") render(); });
  document.addEventListener("fit:program", () => { if (App.tab === "energy") render(); });
  document.addEventListener("fit:logchange", () => { if (App.tab === "energy") render(); });
})();
