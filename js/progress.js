/* 운동 기록 기반 계산: 시작 무게 추천, 자동 점진적 과부하(이중 점진), 추정 1RM, 근육 회복, 주간 볼륨
 * 모든 함수는 순수 함수라서 화면 없이 테스트할 수 있다.
 * 시작 무게는 체중·경력·성별로 구한 대략적인 값이다. 첫 세트로 확인하고 직접 조정하도록 안내한다. */
(function (root) {
  const { EXERCISES } = root.Exercises;
  const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

  // [초보 기준 체중 대비 비율(덤벨은 한 손 기준), 증량 단위 kg]
  const LOAD = {
    "bb-squat": [0.6, 5], "leg-press": [1.0, 5], "goblet-squat": [0.2, 2], bulgarian: [0.12, 2],
    deadlift: [0.8, 5], rdl: [0.55, 5], "db-rdl": [0.15, 2], "hip-thrust": [0.7, 5], "leg-curl": [0.25, 2.5],
    "sl-rdl": [0.1, 2], "calf-machine": [0.5, 5], "db-calf": [0.2, 2], "leg-ext": [0.3, 2.5], lunge: [0.12, 2], "step-up": [0.1, 2],
    bench: [0.4, 2.5], "chest-press": [0.35, 2.5], "db-bench": [0.15, 2], "incline-db": [0.13, 2], "pec-deck": [0.25, 2.5], "db-fly": [0.07, 1],
    ohp: [0.28, 2.5], "shoulder-press": [0.25, 2.5], "db-ohp": [0.1, 2], pulldown: [0.45, 2.5], "bb-row": [0.4, 2.5],
    "seated-row": [0.4, 2.5], "db-row": [0.16, 2], "face-pull": [0.15, 2.5], "rear-fly": [0.05, 1], "lat-raise": [0.05, 1],
    "cable-lat": [0.04, 1], "bb-curl": [0.2, 2.5], "db-curl": [0.08, 1], hammer: [0.08, 1], pushdown: [0.2, 2.5],
    "db-ext": [0.1, 2], "cable-crunch": [0.25, 2.5], pallof: [0.08, 2.5],
  };
  const BAR_MIN = { barbell: 20 }; // 빈 바 무게
  const LEVEL_MULT = [1, 1.35, 1.7];
  const UPPER = ["chest", "back", "shoulders", "biceps", "triceps"];
  const LOWER_STEP = 5; // 하체 복합 증량 단위 (LOAD에 없는 바벨·머신 기본)

  const round = (w, step) => Math.round(w / step) * step;
  const r1 = (x) => Math.round(x * 10) / 10;

  // 운동의 부하 종류: kg(무게) / bw(맨몸) / band(밴드)
  function kindOf(id) {
    const ex = byId[id];
    if (!ex) return "kg";
    if (ex.eq === "body") return "bw";
    if (ex.eq === "band") return "band";
    return "kg";
  }

  // 시작 무게 추천: { kind, weight, step, perHand }
  function startWeight(id, input) {
    const ex = byId[id];
    const kind = kindOf(id);
    if (kind !== "kg") return { kind, weight: 0, step: 0, perHand: false };
    const [ratio, step] = LOAD[id] || (ex && ex.eq === "dumbbell" ? [0.1, 2] : [0.25, 2.5]);
    const lvl = LEVEL_MULT[(input.level || 1) - 1] || 1;
    const upper = ex && UPPER.includes(root.Generator ? root.Generator.groupOf(ex) : "");
    const sex = input.sex === "female" ? (upper ? 0.6 : 0.75) : 1;
    let w = round(ratio * input.weight * lvl * sex, step);
    const min = BAR_MIN[ex && ex.eq] || step;
    if (w < min) w = min;
    return { kind, weight: w, step, perHand: !!ex && ex.eq === "dumbbell" && id !== "goblet-squat" };
  }

  function parseReps(s) {
    const [a, b] = String(s).split("-").map(Number);
    return { lo: a, hi: b || a };
  }

  // 시작일부터 몇 주차인지 (1부터)
  function weekNumber(startISO, nowISO) {
    const d = (new Date(nowISO) - new Date(startISO)) / 86400000;
    return Math.max(1, Math.floor(d / 7) + 1);
  }
  const isDeloadWeek = (week) => week >= 5 && week % 5 === 0;

  // 다음 세션 목표. history: 이 운동의 과거 기록(최신순) [{date, sets:[{w,r,done}]}]
  function nextTarget(item, history, input, opts) {
    const deload = !!(opts && opts.deload);
    const { lo, hi } = parseReps(item.reps);
    const base = startWeight(item.id, input);
    const kind = base.kind;
    const sets = deload ? Math.max(2, Math.ceil(item.sets / 2)) : item.sets;
    const out = { kind, weight: base.weight, reps: lo, sets, step: base.step, perHand: base.perHand, note: "", reason: "start" };

    const doneOf = (h) => (h ? h.sets.filter((s) => s.done && s.r > 0) : []);
    const last = doneOf(history[0]);
    if (!last.length) {
      out.note = kind === "kg"
        ? `처음이라 체중·경력으로 시작 무게를 추정했습니다. 첫 세트가 ${hi}회쯤에서 1~2회 여유가 남는 무게인지 확인하고 조정하세요.`
        : kind === "bw" ? "맨몸 운동입니다. 목표 반복 수를 채우는 데 집중하세요." : "밴드 장력은 목표 반복 수를 채울 정도로 고르세요.";
      return deload ? deloadify(out, deload, "디로드 주: 세트를 줄이고 가볍게 진행하세요.") : out;
    }

    const topW = Math.max(...last.map((s) => s.w || 0));
    if (deload) {
      // 디로드: 지난번 최고 무게의 90%로 세트를 절반만. 증량 판단은 하지 않는다.
      out.reason = "deload";
      out.weight = kind === "kg" && base.step ? Math.max(base.step, round(topW * 0.9, base.step)) : 0;
      out.note = `디로드 주: 지난번 ${topW ? topW + "kg" : "강도"}의 90%로 세트를 절반만 가볍게 하며 회복하는 주간입니다.`;
      return out;
    }
    const atTop = last.filter((s) => (s.w || 0) >= topW);
    const allHi = last.length >= item.sets && last.every((s) => s.r >= hi);
    const fails = last.filter((s) => s.r < lo).length;
    const prev = doneOf(history[1]);
    const prevFails = prev.filter((s) => s.r < lo).length;

    if (kind !== "kg") {
      out.weight = 0;
      if (allHi) { out.reps = hi; out.reason = "max"; out.note = "반복 상한을 달성했습니다. 더 어려운 변형(발 높이기, 속도 늦추기 등)으로 올려 보세요."; }
      else { out.reps = Math.min(hi, Math.max(...last.map((s) => s.r)) + 1); out.reason = "reps"; out.note = `지난번보다 1회 더 (${out.reps}회)를 목표로 하세요.`; }
    } else if (allHi) {
      out.weight = r1(topW + base.step); out.reps = lo; out.reason = "up";
      out.note = `지난번 모든 세트에서 ${hi}회를 달성했습니다. 무게를 ${base.step}kg 올리고 ${lo}회부터 다시 시작하세요.`;
    } else if (fails >= Math.ceil(last.length / 2) && prevFails >= Math.ceil(prev.length / 2) && prev.length) {
      out.weight = Math.max(base.step, round(topW * 0.9, base.step)); out.reps = lo; out.reason = "down";
      out.note = "2회 연속 목표 반복 수에 못 미쳤습니다. 무게를 10% 낮춰 자세와 반복 수를 다시 쌓으세요.";
    } else {
      const med = atTop.map((s) => s.r).sort((a, b) => a - b)[Math.floor(atTop.length / 2)];
      out.weight = topW; out.reps = Math.min(hi, Math.max(lo, med + 1)); out.reason = "hold";
      out.note = `같은 무게에서 ${out.reps}회를 목표로 하세요. 모든 세트가 ${hi}회가 되면 증량합니다.`;
    }
    return deload ? deloadify(out, deload, "디로드 주: 무게와 세트를 줄여 회복하는 주간입니다.") : out;
  }

  function deloadify(out, deload, msg) {
    if (out.kind === "kg" && out.step) out.weight = Math.max(out.step, round(out.weight * 0.9, out.step));
    out.note = msg + " " + out.note;
    out.reason = "deload";
    return out;
  }

  // 추정 1RM (Epley). 한 세트 기준
  const e1rm = (w, r) => (w > 0 && r > 0 ? r1(r === 1 ? w : w * (1 + r / 30)) : 0);

  // 세션 하나에서 운동별 최고 추정 1RM
  function sessionBest(item) {
    let best = 0;
    (item.sets || []).forEach((s) => { if (s.done) best = Math.max(best, e1rm(s.w, s.r)); });
    return best;
  }

  // 운동 id별 기록(최신순) 추출
  function historyFor(sessions, id) {
    return sessions.filter((s) => s.items.some((it) => it.id === id))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts))
      .map((s) => ({ date: s.date, sets: s.items.find((it) => it.id === id).sets }));
  }

  // 근육 회복 상태. 근육군별로 마지막 운동 이후 경과 시간과 그 세션의 세트 수로 계산
  const BIG = ["chest", "back", "quads", "hamglute", "shoulders"];
  function recovery(sessions, nowMs) {
    const last = {};
    sessions.forEach((s) => {
      const t = s.ts || new Date(s.date + "T12:00:00").getTime();
      const per = {};
      s.items.forEach((it) => { const n = (it.sets || []).filter((x) => x.done).length; if (n) per[it.group] = (per[it.group] || 0) + n; });
      Object.keys(per).forEach((g) => { if (!last[g] || t > last[g].t) last[g] = { t, sets: per[g] }; });
    });
    const out = {};
    Object.keys(last).forEach((g) => {
      const { t, sets } = last[g];
      const hours = Math.max(0, (nowMs - t) / 3600000);
      const need = (BIG.includes(g) ? 48 : 36) + Math.min(24, Math.max(0, sets - 6) * 3);
      const frac = Math.min(1, hours / need);
      out[g] = { hours: Math.round(hours), sets, need, frac, status: frac < 0.6 ? "rest" : frac < 1 ? "almost" : "ready" };
    });
    return out;
  }

  // 최근 7일 동안 근육군별로 실제 수행한 세트 수
  function weeklyActual(sessions, nowMs) {
    const out = {};
    sessions.forEach((s) => {
      const t = s.ts || new Date(s.date + "T12:00:00").getTime();
      if (nowMs - t > 7 * 86400000 || t > nowMs + 86400000) return;
      s.items.forEach((it) => { const n = (it.sets || []).filter((x) => x.done).length; if (n) out[it.group] = (out[it.group] || 0) + n; });
    });
    return out;
  }

  root.Progress = { startWeight, nextTarget, e1rm, sessionBest, historyFor, recovery, weeklyActual, weekNumber, isDeloadWeek, parseReps, kindOf, LOAD };
})(typeof window !== "undefined" ? window : globalThis);
