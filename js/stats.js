/* 기록·분석 탭: 근육 회복 해부도, 주간 볼륨, 체중 그래프, 1RM 추이, 기록 목록, 백업 */
(function () {
  const $ = (s) => document.querySelector(s);
  const LABEL = Generator.GROUP_LABEL;
  const fmtDate = (iso) => { const d = new Date(iso + "T12:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const day = (iso) => new Date(iso + "T12:00:00").getTime();

  // ---------- 간단한 SVG 선 그래프 ----------
  // series: [{ pts:[{t(ms), v}], cls, dashed }]
  function lineChart(series, unit) {
    series = series.filter((s) => s.pts.length); // 점이 없는 계열은 그리지 않는다
    const all = series.flatMap((s) => s.pts);
    if (all.length < 1) return `<p class="note">아직 기록이 없습니다.</p>`;
    const W = 340, H = 170, L = 34, R = 10, T = 12, B = 24;
    let t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
    if (t1 === t0) t1 = t0 + 86400000;
    let v0 = Math.min(...all.map((p) => p.v)), v1 = Math.max(...all.map((p) => p.v));
    const pad = Math.max(0.5, (v1 - v0) * 0.15); v0 -= pad; v1 += pad;
    const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
    const y = (v) => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B);
    const ticks = [0, 1, 2, 3].map((i) => v0 + ((v1 - v0) * i) / 3);
    const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="cg"/><text x="${L - 4}" y="${y(v) + 3}" class="ct" text-anchor="end">${Math.round(v * 10) / 10}</text>`).join("");
    const d0 = new Date(t0), d1 = new Date(t1);
    const xl = `<text x="${L}" y="${H - 6}" class="ct">${d0.getMonth() + 1}/${d0.getDate()}</text><text x="${W - R}" y="${H - 6}" class="ct" text-anchor="end">${d1.getMonth() + 1}/${d1.getDate()}</text>`;
    const lines = series.map((s) => {
      const p = s.pts.slice().sort((a, b) => a.t - b.t);
      const path = p.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)},${y(q.v).toFixed(1)}`).join(" ");
      const dots = s.dashed ? "" : p.map((q) => `<circle cx="${x(q.t).toFixed(1)}" cy="${y(q.v).toFixed(1)}" r="3.2" class="cd ${s.cls}"/>`).join("");
      const last = p[p.length - 1];
      const lab = s.dashed ? "" : `<text x="${Math.min(W - R, x(last.t) + 2).toFixed(1)}" y="${(y(last.v) - 7).toFixed(1)}" class="cl ${s.cls}" text-anchor="end">${last.v}${unit}</text>`;
      return `<path d="${path}" class="cp ${s.cls}${s.dashed ? " dash" : ""}" fill="none"/>${dots}${lab}`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="lc" role="img">${grid}${xl}${lines}</svg>`;
  }

  window.Charts = { lineChart };
  function summary() {
    const d = Store.data(), p = d.program;
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const wk = d.sessions.filter((s) => (s.ts || day(s.date)) >= weekAgo);
    const goalDays = p ? p.input.days : 0;
    const streak = streakWeeks(d.sessions, goalDays);
    $("#logSummary").innerHTML = `<h2>요약</h2><div class="stats">
      <div class="stat"><span>이번 주 운동</span><b>${wk.length}<small>/ ${goalDays || "-"}회</small></b></div>
      <div class="stat"><span>누적 운동</span><b>${d.sessions.length}<small>회</small></b></div>
      <div class="stat"><span>현재 주차</span><b>${p ? Progress.weekNumber(p.startDate, Store.today()) : "-"}<small>주차</small></b></div>
      <div class="stat"><span>목표 달성 주</span><b>${streak}<small>주 연속</small></b></div></div>`;
  }
  // 최근 주부터 거꾸로, 주간 목표 일수를 채운 주가 연속된 횟수 (진행 중인 이번 주는 건너뜀)
  function streakWeeks(sessions, goal) {
    if (!goal) return 0;
    const now = Date.now(); let n = 0;
    for (let w = 1; w < 52; w++) {
      const hi = now - (w - 1) * 7 * 86400000, lo = hi - 7 * 86400000;
      const c = sessions.filter((s) => { const t = s.ts || day(s.date); return t > lo && t <= hi; }).length;
      if (w === 1 && c < goal) continue; // 이번 주는 아직 진행 중
      if (c >= goal) n++; else break;
    }
    return n;
  }

  function recoverySection() {
    const rec = Progress.recovery(Store.data().sessions, Date.now());
    const groups = Object.keys(rec);
    if (!groups.length) { $("#recoveryBox").innerHTML = `<p class="note">운동을 기록하면 근육별 회복 상태가 해부도에 표시됩니다.</p>`; return; }
    const lv = {};
    groups.forEach((g) => { if (rec[g].status !== "ready") lv[g] = rec[g].status; });
    const rows = groups.sort((a, b) => rec[a].frac - rec[b].frac).map((g) => {
      const r = rec[g];
      const txt = r.status === "ready" ? "회복 완료" : r.status === "almost" ? "거의 회복" : "회복 중";
      const left = Math.max(0, Math.round(r.need - r.hours));
      return `<div class="rrow ${r.status}"><span class="rn">${LABEL[g]}</span><div class="rbar"><i style="width:${Math.round(r.frac * 100)}%"></i></div><span class="rt">${txt}${left ? ` · 약 ${left}시간` : ""}</span></div>`;
    }).join("");
    $("#recoveryBox").innerHTML = `<div class="recwrap"><div class="vfig">${Body.figureLevels(lv)}</div><div class="reclist">${rows}
      <p class="note"><span class="dot rest"></span>빨강: 회복 중 <span class="dot almost"></span>주황: 거의 회복 · 색이 없으면 회복 완료입니다. 마지막 운동 후 경과 시간과 그때 수행한 세트 수로 추정한 값이라 참고용입니다.</p></div></div>`;
  }

  function weeklySection() {
    const p = Store.program();
    const act = Progress.weeklyActual(Store.data().sessions, Date.now());
    const vol = p ? p.plan.volume : [];
    const groups = [...new Set([...vol.map((v) => v.group), ...Object.keys(act)])];
    if (!groups.length) { $("#weeklyBox").innerHTML = `<p class="note">아직 이번 주 기록이 없습니다.</p>`; return; }
    $("#weeklyBox").innerHTML = groups.map((g) => {
      const planned = (vol.find((v) => v.group === g) || {}).sets || 0;
      const target = (vol.find((v) => v.group === g) || {}).target || planned;
      const a = act[g] || 0;
      const max = Math.max(target, planned, a, 1);
      const cls = a >= planned && planned ? "ok" : a >= planned * 0.5 ? "mid" : "low";
      return `<div class="vol"><span class="vl">${LABEL[g]}</span><div class="vbar"><i class="${cls}" style="width:${Math.min(100, (a / max) * 100)}%"></i><u style="left:${Math.min(100, (planned / max) * 100)}%"></u></div><span class="vn">${a} / ${planned}세트</span></div>`;
    }).join("") + `<p class="note">막대가 눈금(이번 주 계획 세트 수)에 닿으면 계획한 볼륨을 채운 것입니다.</p>`;
  }

  // ---------- 체성분 ----------
  // 기록: { date, kg, bf(체지방률 %), smm(골격근량 kg) }. 체지방량 = 체중 × 체지방률
  const METRICS = {
    kg: { label: "체중", unit: "kg", good: -1, get: (w) => w.kg },
    smm: { label: "골격근량", unit: "kg", good: 1, get: (w) => w.smm },
    fat: { label: "체지방량", unit: "kg", good: -1, get: (w) => (w.bf != null ? Math.round((w.kg * w.bf) / 10) / 10 : null) },
    bf: { label: "체지방률", unit: "%", good: -1, get: (w) => w.bf },
  };
  let metric = "kg";

  function series(key) {
    return Store.data().weights.map((w) => ({ date: w.date, v: METRICS[key].get(w) })).filter((x) => x.v != null && x.v > 0);
  }

  function tile(key) {
    const m = METRICS[key], s = series(key);
    if (!s.length) return `<div class="stat dim"><span>${m.label}</span><b>-</b><em>기록 없음</em></div>`;
    const last = s[s.length - 1].v, first = s[0].v;
    const d = Math.round((last - first) * 10) / 10;
    const cls = d === 0 ? "" : (d > 0 ? 1 : -1) === m.good ? "good" : "bad";
    const ch = s.length > 1 ? `<em class="${cls}">${d > 0 ? "▲" : d < 0 ? "▼" : ""} ${Math.abs(d)}${m.unit} <small>첫 기록 대비</small></em>` : `<em>${fmtDate(s[0].date)} 기록</em>`;
    return `<div class="stat"><span>${m.label}</span><b>${Math.round(last * 10) / 10}<small>${m.unit}</small></b>${ch}</div>`;
  }

  function bodySection() {
    const d = Store.data(), p = d.program;
    $("#bodyTiles").innerHTML = ["kg", "smm", "fat", "bf"].map(tile).join("");
    const m = METRICS[metric];
    const pts = series(metric).map((x) => ({ t: day(x.date), v: x.v }));
    const lines = [{ pts, cls: "a" }];
    let goalNote = "";
    if (p) {
      const i = p.input, startT = day(p.startDate);
      if (metric === "kg" && i.targetWeight != null) {
        const endT = i.targetDate ? day(i.targetDate) : startT + (i.weeks || 12) * 7 * 86400000;
        const startV = pts.length ? pts[0].v : i.weight;
        lines.push({ pts: [{ t: Math.min(startT, pts.length ? pts[0].t : startT), v: startV }, { t: endT, v: i.targetWeight }], cls: "b", dashed: true });
        goalNote = `점선은 목표 체중 ${i.targetWeight}kg까지의 예상 경로입니다.`;
      } else if (metric === "smm" && i.goal === "strength" && i.goalType === "smm" && i.smmTarget) {
        lines.push({ pts: [{ t: pts.length ? pts[0].t : startT, v: i.smmTarget }, { t: startT + (i.weeks || 12) * 7 * 86400000, v: i.smmTarget }], cls: "b", dashed: true });
        goalNote = `점선은 목표 골격근량 ${i.smmTarget}kg입니다.`;
      } else if (metric === "fat" && i.goal === "strength" && i.goalType === "fat" && i.fatTarget) {
        lines.push({ pts: [{ t: pts.length ? pts[0].t : startT, v: i.fatTarget }, { t: startT + (i.weeks || 12) * 7 * 86400000, v: i.fatTarget }], cls: "b", dashed: true });
        goalNote = `점선은 목표 체지방량 ${i.fatTarget}kg입니다.`;
      }
    }
    $("#weightChart").innerHTML = pts.length
      ? lineChart(lines, m.unit) + (goalNote ? `<p class="note">${goalNote}</p>` : "")
      : `<p class="note">${m.label} 기록이 아직 없습니다.${metric === "kg" ? "" : " 체성분 측정 결과를 기록하면 그래프가 그려집니다."}</p>`;
    const recent = d.weights.slice(-5).reverse();
    $("#bodyChips").innerHTML = recent.length ? `<div class="chips">${recent.map((w) => `<span class="chip">${fmtDate(w.date)} ${w.kg}kg${w.bf != null ? ` · ${w.bf}%` : ""}${w.smm != null ? ` · 근육 ${w.smm}kg` : ""} <button type="button" class="x" data-wdel="${w.date}" aria-label="${fmtDate(w.date)} 기록 삭제">✕</button></span>`).join("")}</div>` : "";
  }
  // 체성분 분석표(막대 그래프)와 상태 평가
  const LV = { low: "낮음", normal: "표준", high: "높음" };
  function analysisSection() {
    const d = Store.data(), p = d.program, box = $("#bodyAnalysis"), st = $("#bodyStatus");
    if (!p || !d.weights.length) { box.innerHTML = ""; st.innerHTML = ""; return; }
    const input = Energy.currentInput(p, d.weights, Store.settings(), Store.today());
    const rec = d.weights[d.weights.length - 1];
    const a = BodyComp.analysis(rec, input);
    const [s0, s1] = BodyComp.SCALE, span = s1 - s0;
    const pos = (v) => Math.max(0, Math.min(100, ((v - s0) / span) * 100));
    const rows = a.rows.map((r) => {
      if (r.value == null) return `<div class="arow"><span class="al">${r.label}</span><div class="abar dim"></div><span class="av">측정값 없음</span></div>`;
      const [lo, hi] = r.range;
      return `<div class="arow"><span class="al">${r.label}</span>
        <div class="abar" role="img" aria-label="${r.label} 표준 대비 ${r.pct}%"><i class="zone" style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></i><i class="fill ${r.level}" style="width:${pos(r.pct)}%"></i><u style="left:${pos(100)}%"></u></div>
        <span class="av"><b>${r.value}kg</b> <small>${r.pct}% · ${LV[r.level]}</small></span></div>`;
    }).join("");
    const scale = `<div class="ascale"><span style="left:${pos(70)}%">70</span><span style="left:${pos(100)}%">100</span><span style="left:${pos(130)}%">130</span><span style="left:${pos(160)}%">160</span><span style="left:${pos(190)}%">190</span></div>`;
    box.innerHTML = `<h3 class="sub3">체성분 분석 <small>${fmtDate(rec.date)} 기록 · 표준 대비 %</small></h3>
      <div class="abars">${scale}${rows}</div>
      ${a.type ? `<p class="atype"><b>${a.type.name}</b> ${a.type.tip}</p>` : `<p class="note">골격근량과 체지방률을 함께 기록하면 체형 분석이 나와요.</p>`}
      <p class="note">초록 띠는 표준 범위입니다. 표준값은 키와 성별로 구한 표준체중에 일반적인 비율을 곱한 근사값이라, 인바디 같은 기기 결과와 다를 수 있어요.</p>`;

    const s = BodyComp.status(d.weights, input, Store.today());
    const icon = { perfect: "완벽", ok: "적정", warn: "경고", none: "대기" }[s.level];
    st.innerHTML = `<div class="bstatus ${s.level}"><div class="bbadge">${icon}</div><div class="bwhy"><b>${s.level === "none" ? "아직 평가할 기록이 부족해요" : "최근 체성분 변화 평가"}</b>
      <ul>${s.reasons.map((r) => `<li class="${r.lv || "none"}">${r.t || r}</li>`).join("")}</ul></div></div>`;
  }
  const weightSection = () => { bodySection(); analysisSection(); };
  $("#bodyMetric").addEventListener("change", (e) => { if (e.target.name === "bodyMetric") { metric = e.target.value; bodySection(); } });

  function e1Section() {
    const s = Store.data().sessions;
    const names = {};
    s.forEach((x) => x.items.forEach((it) => { if (Progress.sessionBest(it)) names[it.id] = it.name; }));
    const sel = $("#e1Select"), cur = sel.value;
    const ids = Object.keys(names);
    sel.innerHTML = ids.length ? ids.map((id) => `<option value="${id}">${names[id]}</option>`).join("") : `<option value="">기록 없음</option>`;
    if (ids.includes(cur)) sel.value = cur;
    drawE1();
  }
  function drawE1() {
    const id = $("#e1Select").value;
    if (!id) { $("#e1Chart").innerHTML = `<p class="note">무게를 입력한 운동을 기록하면 추정 1RM 추이가 나타납니다.</p>`; return; }
    const pts = Store.data().sessions.filter((s) => s.items.some((it) => it.id === id))
      .map((s) => ({ t: day(s.date), v: Progress.sessionBest(s.items.find((it) => it.id === id)) })).filter((p) => p.v > 0);
    $("#e1Chart").innerHTML = lineChart([{ pts, cls: "a" }], "kg") + `<p class="note">추정 1RM = 무게 × (1 + 반복 수 ÷ 30). 실제로 한 번만 들 수 있는 무게의 추정치입니다.</p>`;
  }
  $("#e1Select").addEventListener("change", drawE1);

  function historySection() {
    const s = Store.data().sessions.slice().reverse().slice(0, 12);
    if (!s.length) { $("#historyBox").innerHTML = `<p class="note">아직 저장된 운동이 없습니다. '오늘 운동' 탭에서 시작하세요.</p>`; return; }
    $("#historyBox").innerHTML = s.map((x) => {
      const sets = x.items.reduce((a, it) => a + it.sets.length, 0);
      const vol = Math.round(x.items.reduce((a, it) => a + it.sets.reduce((b, st) => b + (st.w || 0) * st.r, 0), 0));
      return `<details class="hist"><summary><b>${fmtDate(x.date)}</b> ${App.esc(x.title || "")} <small>${sets}세트 · ${vol.toLocaleString()}kg</small></summary>
        <ul>${x.items.map((it) => `<li>${App.esc(it.name)}: ${it.sets.map((st) => (st.w ? `${st.w}×${st.r}` : `${st.r}회`)).join(", ")}</li>`).join("")}</ul>
        <button type="button" class="ghost small" data-sdel="${x.id}">이 기록 삭제</button></details>`;
    }).join("");
  }

  function renderAll() { summary(); recoverySection(); weeklySection(); weightSection(); e1Section(); historySection(); }

  // ---------- 이벤트 ----------
  $("#wDate").value = Store.today();
  $("#weightForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const kg = parseFloat($("#wKg").value), date = $("#wDate").value || Store.today();
    const bf = $("#wBf").value === "" ? null : parseFloat($("#wBf").value);
    const smm = $("#wSmm").value === "" ? null : parseFloat($("#wSmm").value);
    if (!(kg >= 30 && kg <= 300)) { App.toast("체중은 30~300kg 사이로 입력하세요"); return; }
    if (bf != null && !(bf >= 3 && bf <= 60)) { App.toast("체지방률은 3~60% 사이로 입력하세요"); return; }
    if (smm != null && !(smm >= 10 && smm < kg)) { App.toast("골격근량은 10kg 이상, 체중보다 작게 입력하세요"); return; }
    const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
    Store.addBody(date, { kg: r1(kg), bf: r1(bf), smm: r1(smm) });
    ["wKg", "wBf", "wSmm"].forEach((id) => ($("#" + id).value = ""));
    weightSection(); summary(); App.toast("체성분을 기록했어요");
  });
  $("#tab-log").addEventListener("click", (e) => {
    const wd = e.target.closest("[data-wdel]");
    if (wd) { Store.deleteWeight(wd.dataset.wdel); weightSection(); return; }
    const sd = e.target.closest("[data-sdel]");
    if (sd) {
      if (sd.dataset.armed !== "1") { sd.dataset.armed = "1"; sd.textContent = "한 번 더 누르면 삭제됩니다"; setTimeout(() => { sd.dataset.armed = ""; sd.textContent = "이 기록 삭제"; }, 3000); return; }
      Store.deleteSession(sd.dataset.sdel); renderAll(); App.toast("기록을 삭제했어요");
    }
  });

  // 백업·복원
  $("#exportBtn").addEventListener("click", () => {
    const text = Store.exportJSON();
    $("#backupText").value = text;
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = "fitplan-backup-" + Store.today() + ".json";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {}
    App.toast("백업을 만들었어요. 파일이 안 받아지면 아래 내용을 복사해 두세요");
  });
  $("#importBtn").addEventListener("click", () => {
    const text = $("#backupText").value.trim();
    if (!text) { $("#importFile").click(); return; }
    try {
      Store.importJSON(text);
      const p = Store.program();
      if (p) Store.setForm(p.input);
      App.toast("복원했어요. 화면을 새로고침합니다");
      setTimeout(() => location.reload(), 900);
    } catch (e) { App.toast("복원 실패: " + e.message); }
  });
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { $("#backupText").value = String(r.result); App.toast("파일을 불러왔어요. '복원하기'를 한 번 더 누르세요"); };
    r.readAsText(f);
  });

  // 계정 · 보안
  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const o = $("#pwOld").value, n = $("#pwNew").value;
    if (n.length < 4) { App.toast("새 비밀번호는 4자 이상으로 정해 주세요"); return; }
    try { await Vault.changePassword(o, n); $("#pwOld").value = ""; $("#pwNew").value = ""; App.toast("비밀번호를 바꿨어요"); }
    catch (er) { App.toast(er.message); }
  });
  $("#delAccount").addEventListener("click", (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "정말 삭제할까요? 한 번 더 누르면 모든 기록이 지워져요"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "이 기기에서 내 계정과 기록 삭제"; }, 4000); return; }
    Vault.deleteCurrent();
  });

  document.addEventListener("fit:tab", (e) => { if (e.detail === "log") renderAll(); });
  document.addEventListener("fit:logchange", renderAll);
})();
