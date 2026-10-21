/* 신체 지표 계산 (BMR, TDEE, BMI, 적정체중, 영양소, 목표 분석) */
(function (root) {
  const ACTIVITY = {
    1: { factor: 1.2, label: "거의 안 움직임 (사무직)" },
    2: { factor: 1.375, label: "가벼운 활동 (주 1~3회 운동)" },
    3: { factor: 1.55, label: "보통 (주 3~5회 운동)" },
    4: { factor: 1.725, label: "활발 (주 6~7회 운동)" },
    5: { factor: 1.9, label: "매우 활발 (육체노동 + 운동)" },
  };
  // 직업·평소 생활 활동 계수 (운동은 제외. 운동은 따로 더한다)
  const JOBS = {
    1: { factor: 1.2, label: "앉아서 일함 (사무직·학생)" },
    2: { factor: 1.35, label: "주로 서거나 걸어 다니며 일함 (교사·판매·서비스)" },
    3: { factor: 1.5, label: "활동량 많음 (간호·배달·조리·돌봄)" },
    4: { factor: 1.65, label: "육체노동 (건설·농업·물류)" },
  };
  // 근력 운동 한 세션의 순수 추가 소모: (MET 4.0 − 안정 시 1.0) × 체중 × 시간
  const WORKOUT_NET_MET = 3;
  const KCAL_PER_KG = 7700;
  const r1 = (x) => Math.round(x * 10) / 10;

  // Mifflin-St Jeor
  function bmr({ sex, weight, height, age }) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return Math.round(sex === "male" ? base + 5 : base - 161);
  }

  // Katch-McArdle (체지방률 % 입력 시)
  function bmrKatch({ weight, bodyFat }) {
    return Math.round(370 + 21.6 * weight * (1 - bodyFat / 100));
  }

  function tdee(bmrValue, activityLevel) {
    return Math.round(bmrValue * ACTIVITY[activityLevel].factor);
  }

  // 하루 평균 운동 소모(순수 추가분): 주당 운동 일수 × 세션당 소모 ÷ 7
  function exercisePerDay(i) {
    if (!i.days || !i.minutes) return 0;
    return (i.days * WORKOUT_NET_MET * i.weight * (i.minutes / 60)) / 7;
  }
  // 직업 계수 + 운동 + 추가 활동 목표로 구한 하루 소비 칼로리
  function tdeeJob(bmrValue, i) {
    return Math.round(bmrValue * JOBS[i.job].factor + exercisePerDay(i) + (i.extraKcal || 0));
  }
  // 기한(날짜)까지 남은 주 수 (올림). 오늘 기준
  function weeksUntil(dateISO, todayISO) {
    const d = (new Date(dateISO + "T12:00:00") - new Date(todayISO + "T12:00:00")) / 86400000;
    return Math.ceil(d / 7);
  }

  function bmi(weight, height) {
    const m = height / 100;
    return r1(weight / (m * m));
  }

  // 아시아-태평양 기준
  function bmiCategory(v) {
    if (v < 18.5) return { key: "under", label: "저체중" };
    if (v < 23) return { key: "normal", label: "정상" };
    if (v < 25) return { key: "over", label: "과체중" };
    return { key: "obese", label: "비만" };
  }

  function idealWeight(height, sex) {
    const m = height / 100;
    return {
      ideal: r1(m * m * (sex === "male" ? 22 : 21)),
      min: r1(m * m * 18.5),
      max: r1(m * m * 22.9),
    };
  }

  const DEFAULT_ADJUST = { lose: -400, muscle: 250, strength: 100 };

  // adjustOverride: 목표 체중·기간에서 계산한 일일 칼로리 조정값
  function targetCalories(tdeeValue, bmrValue, goal, adjustOverride) {
    const adj = adjustOverride != null ? adjustOverride : DEFAULT_ADJUST[goal] || 0;
    let kcal = tdeeValue + adj;
    let warning = null;
    if (kcal < bmrValue) {
      kcal = bmrValue;
      warning = "목표 칼로리가 기초대사량보다 낮아지지 않도록 조정했습니다. 기간을 늘리는 것을 권장합니다.";
    }
    return { kcal: Math.round(kcal), adjust: Math.round(kcal - tdeeValue), warning };
  }

  function macros(kcal, weight, goal) {
    const perKg = { lose: 2.0, muscle: 1.8, strength: 1.8 }[goal] || 1.6;
    const protein = Math.round(weight * perKg);
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { protein, fat, carbs };
  }

  function validate(i) {
    const e = {};
    if (!(i.height >= 100 && i.height <= 250)) e.height = "키는 100~250cm 사이로 입력하세요.";
    if (!(i.weight >= 30 && i.weight <= 300)) e.weight = "몸무게는 30~300kg 사이로 입력하세요.";
    if (!(i.age >= 14 && i.age <= 100)) e.age = "나이는 14~100세 사이로 입력하세요.";
    if (i.sex !== "male" && i.sex !== "female") e.sex = "성별을 선택하세요.";
    if (i.bodyFat != null && !(i.bodyFat >= 3 && i.bodyFat <= 60)) e.bodyFat = "체지방률은 3~60% 사이로 입력하세요.";
    if (i.targetWeight != null && !(i.targetWeight >= 30 && i.targetWeight <= 300)) e.targetWeight = "목표 체중은 30~300kg 사이로 입력하세요.";
    if (i.targetWeight != null && i.weeks != null && !(i.weeks >= 2 && i.weeks <= 104)) e.targetDate = "기한은 오늘부터 2주~2년 사이로 정해 주세요.";
    if (i.weeks != null && i.targetWeight == null && !(i.weeks >= 2 && i.weeks <= 104)) e.weeks = "기간은 2~104주 사이로 입력하세요.";
    if (i.goal === "strength") {
      const gt = i.goalType || "strength";
      if (gt === "strength") {
        if (!(i.strengthNow > 0)) e.strengthNow = "현재 3대 합계를 입력하세요.";
        if (!(i.strengthTarget > 0)) e.strengthTarget = "목표 3대 합계를 입력하세요.";
      } else if (gt === "fat") {
        if (!i.bodyFat) e.bodyFat = "체지방량 목표를 쓰려면 현재 체지방률을 입력하세요.";
        if (!(i.fatTarget > 0)) e.fatTarget = "목표 체지방량(kg)을 입력하세요.";
      } else if (gt === "smm") {
        if (!(i.smmNow > 0)) e.smmNow = "현재 골격근량을 입력하세요.";
        if (!(i.smmTarget > 0)) e.smmTarget = "목표 골격근량을 입력하세요.";
      }
    }
    return e;
  }

  const note = (level, text) => ({ level, text });

  // 목표 체중·기간·세부 목표 분석
  function goalPlan(i, bmrV, tdeeV) {
    const notes = [];
    const weeks = i.weeks || 12;
    let adjust = null, weekly = null, milestones = [];

    if (i.targetWeight != null) {
      const diff = i.targetWeight - i.weight;
      if (Math.abs(diff) < 0.1) {
        adjust = 0;
        notes.push(note("ok", "목표 체중이 현재와 같습니다. 체중 유지 칼로리로 계산했습니다."));
      } else {
        weekly = diff / weeks;
        adjust = Math.round((diff * KCAL_PER_KG) / (weeks * 7));
        const pct = (Math.abs(weekly) / i.weight) * 100;
        const word = diff < 0 ? "감량" : "증량";
        notes.push(note("info", `${i.weight}kg → ${i.targetWeight}kg (${diff > 0 ? "+" : ""}${r1(diff)}kg), ${weeks}주 동안 주당 약 ${r1(Math.abs(weekly))}kg ${word}, 하루 ${adjust > 0 ? "+" : ""}${adjust}kcal 조정이 필요합니다.`));
        if (diff < 0) {
          const minWeeks = Math.ceil(Math.abs(diff) / (i.weight * 0.01));
          if (pct > 1) notes.push(note("bad", `주당 체중의 ${r1(pct)}% 감량은 근손실 위험이 큽니다. 최소 ${minWeeks}주 이상으로 늘리세요.`));
          else if (pct > 0.75) notes.push(note("warn", `주당 ${r1(pct)}%로 빠른 편입니다. 근육 보존을 위해 단백질과 근력 운동을 유지하세요.`));
          else notes.push(note("ok", `주당 ${r1(pct)}% 감량으로 무리 없는 속도입니다.`));
        } else {
          const minWeeks = Math.ceil(diff / (i.weight * 0.005));
          if (pct > 0.5) notes.push(note("warn", `주당 ${r1(pct)}% 증량은 지방 비율이 늘기 쉽습니다. ${minWeeks}주 이상을 권장합니다.`));
          else notes.push(note("ok", `주당 ${r1(pct)}% 증량으로 린 벌크에 적합한 속도입니다.`));
        }
        if (i.goal === "lose" && diff > 0) notes.push(note("warn", "목표가 다이어트인데 목표 체중이 현재보다 높습니다. 입력을 확인하세요."));
        if (i.goal === "muscle" && diff < -0.1) notes.push(note("info", "근비대 목표에 체중 감량이 설정되었습니다. 체지방을 줄이면서 근육을 늘리는 리컴포지션 방식으로 접근하세요."));
        for (let w = 4; w < weeks; w += 4) milestones.push({ week: w, weight: r1(i.weight + weekly * w) });
        milestones.push({ week: weeks, weight: r1(i.targetWeight) });
      }
    }

    const lvl = (i.level || 1) - 1;
    if (i.goal === "strength") {
      const gt = i.goalType || "strength";
      if (gt === "strength" && i.strengthNow > 0 && i.strengthTarget > 0) {
        const total = ((i.strengthTarget - i.strengthNow) / i.strengthNow) * 100;
        const perWeek = total / weeks;
        const maxRate = [3, 1.2, 0.5][lvl];
        const need = Math.ceil(total / maxRate);
        notes.push(note("info", `3대 합계 ${i.strengthNow}kg → ${i.strengthTarget}kg (${total >= 0 ? "+" : ""}${r1(total)}%), 주당 약 ${r1(perWeek)}% 향상이 필요합니다.`));
        if (total <= 0) notes.push(note("warn", "목표가 현재 이하입니다. 입력을 확인하세요."));
        else if (perWeek > maxRate * 1.5) notes.push(note("bad", `현재 경력 기준 현실적인 향상 속도는 주 ${maxRate}% 안팎입니다. 약 ${need}주 이상으로 잡으세요.`));
        else if (perWeek > maxRate) notes.push(note("warn", `도전적인 목표입니다. 경력 기준 권장 속도는 주 ${maxRate}%, 약 ${need}주입니다.`));
        else notes.push(note("ok", "경력 대비 달성 가능한 속도입니다."));
      } else if (gt === "fat" && i.bodyFat && i.fatTarget > 0) {
        const fatNow = i.weight * (i.bodyFat / 100);
        const diff = fatNow - i.fatTarget;
        const perWeek = diff / weeks;
        const maxRate = i.weight * 0.01;
        const floor = i.weight * (i.sex === "male" ? 0.05 : 0.14);
        notes.push(note("info", `체지방량 ${r1(fatNow)}kg → ${i.fatTarget}kg (${diff > 0 ? "-" : "+"}${r1(Math.abs(diff))}kg), 주당 약 ${r1(Math.abs(perWeek))}kg 변화가 필요합니다.`));
        if (diff <= 0) notes.push(note("warn", "목표 체지방량이 현재 이상입니다. 입력을 확인하세요."));
        else if (i.fatTarget < floor) notes.push(note("bad", `목표 체지방량이 너무 낮습니다(체중 대비 ${i.sex === "male" ? 5 : 14}% 미만). 건강을 해칠 수 있습니다.`));
        else if (perWeek > maxRate) notes.push(note("bad", `주당 ${r1(perWeek)}kg은 빠릅니다. 약 ${Math.ceil(diff / maxRate)}주 이상을 권장합니다.`));
        else notes.push(note("ok", "무리 없는 감량 속도입니다."));
        if (adjust == null) adjust = Math.round((-diff * KCAL_PER_KG) / (weeks * 7));
      } else if (gt === "smm" && i.smmNow > 0 && i.smmTarget > 0) {
        const diff = i.smmTarget - i.smmNow;
        const perWeek = diff / weeks;
        const maxRate = [0.15, 0.07, 0.035][lvl];
        notes.push(note("info", `골격근량 ${i.smmNow}kg → ${i.smmTarget}kg (${diff >= 0 ? "+" : ""}${r1(diff)}kg), 주당 약 ${Math.round(perWeek * 100) / 100}kg 증가가 필요합니다.`));
        if (diff <= 0) notes.push(note("warn", "목표가 현재 이하입니다. 입력을 확인하세요."));
        else if (perWeek > maxRate * 1.5) notes.push(note("bad", `경력 기준 골격근 증가 속도는 주 ${maxRate}kg 안팎입니다. 약 ${Math.ceil(diff / maxRate)}주 이상으로 잡으세요.`));
        else if (perWeek > maxRate) notes.push(note("warn", `도전적인 목표입니다. 권장 속도는 주 ${maxRate}kg, 약 ${Math.ceil(diff / maxRate)}주입니다.`));
        else notes.push(note("ok", "경력 대비 달성 가능한 속도입니다."));
        if (adjust == null) adjust = 250;
      }
    }

    return { adjust, weekly, weeks, notes, milestones };
  }

  function analyze(i) {
    const b = bmr(i);
    // job이 있으면 직업 계수 + 운동 소모, 없으면(예전 데이터) 활동 단계 계수를 쓴다
    const t = i.job != null ? tdeeJob(b, i) : tdee(b, i.activity);
    const v = bmi(i.weight, i.height);
    const plan = goalPlan(i, b, t);
    const target = targetCalories(t, b, i.goal, plan.adjust);
    return {
      bmr: b,
      bmrKatch: i.bodyFat ? bmrKatch(i) : null,
      tdee: t,
      bmi: v,
      bmiCategory: bmiCategory(v),
      ideal: idealWeight(i.height, i.sex),
      target,
      macros: macros(target.kcal, i.weight, i.goal),
      plan,
    };
  }

  root.Calc = { JOBS, WORKOUT_NET_MET, exercisePerDay, tdeeJob, weeksUntil, ACTIVITY, bmr, bmrKatch, tdee, bmi, bmiCategory, idealWeight, targetCalories, macros, validate, goalPlan, analyze };
})(typeof window !== "undefined" ? window : globalThis);
