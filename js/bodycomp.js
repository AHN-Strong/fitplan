/* 체성분 분석과 감량 플랜
 * - 체성분 분석: 체중·골격근량·체지방량을 표준값 대비 %로 막대에 표시 (인바디 결과지와 비슷한 방식의 근사치)
 * - 상태 평가: 최근 체성분 변화로 경고 / 적정 / 완벽
 * - 감량 플랜 3가지: 주당 감량 속도(체중 대비 %)로 목표 도달 일수 계산
 * 표준 골격근량·체지방량은 표준체중에 일반적인 비율을 곱한 근사값이다. 측정기기 결과와 다를 수 있다. */
(function (root) {
  const r1 = (x) => Math.round(x * 10) / 10;
  const DAY = 86400000;
  const day = (iso) => new Date(iso + "T12:00:00").getTime();

  // 정상 범위(표준 대비 %)와 막대 눈금 범위
  const RANGE = { kg: [85, 115], smm: [90, 110], fat: [80, 160] };
  const SCALE = [55, 205];
  const LABEL = { kg: "체중", smm: "골격근량", fat: "체지방량" };

  function standards(input) {
    const male = input.sex !== "female";
    const ideal = Calc.idealWeight(input.height, input.sex).ideal;
    return { kg: ideal, smm: r1(ideal * (male ? 0.48 : 0.4)), fat: r1(ideal * (male ? 0.15 : 0.23)), bf: male ? 15 : 23 };
  }

  // 기록 하나를 분석표 행으로
  function analysis(rec, input) {
    const st = standards(input);
    const fat = rec.bf != null ? (rec.kg * rec.bf) / 100 : null;
    const row = (key, v) => {
      if (v == null) return { key, label: LABEL[key], value: null, std: st[key], range: RANGE[key] };
      const pct = Math.round((v / st[key]) * 100);
      const [lo, hi] = RANGE[key];
      return { key, label: LABEL[key], value: r1(v), std: st[key], pct, range: RANGE[key], level: pct < lo ? "low" : pct > hi ? "high" : "normal" };
    };
    const rows = [row("kg", rec.kg), row("smm", rec.smm), row("fat", fat)];
    return { rows, type: bodyType(rows) };
  }

  // 간단한 체형 판정 (골격근량·체지방량 수준 조합)
  function bodyType(rows) {
    const m = rows[1].level, f = rows[2].level;
    if (!m || !f) return null;
    if (m === "low" && f === "high") return { name: "근육 부족 · 체지방 과다형", tip: "근력 운동으로 근육을 늘리면서 체지방을 줄이는 것이 우선입니다." };
    if (m !== "low" && f === "high") return { name: "체지방 과다형", tip: "근육은 충분합니다. 식단 조절로 체지방을 줄이는 데 집중하세요." };
    if (m === "low" && f !== "high") return { name: "근육 부족형", tip: "체중보다 근육량을 늘리는 데 집중하세요. 단백질과 근력 운동이 핵심입니다." };
    if (m === "high" && f !== "high") return { name: "근육형", tip: "근육이 많고 체지방이 적정한 이상적인 체형입니다." };
    return { name: "표준형", tip: "근육과 체지방이 모두 표준 범위입니다." };
  }

  // ---------- 상태 평가: 경고 / 적정 / 완벽 ----------
  const RANK = { perfect: 0, ok: 1, warn: 2 };
  const LEVEL_LABEL = { perfect: "완벽", ok: "적정", warn: "경고", none: "평가 대기" };
  const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b);

  function status(weights, input, todayISO) {
    const recs = (weights || []).filter((w) => w.date <= todayISO);
    if (recs.length < 2) return { level: "none", label: LEVEL_LABEL.none, reasons: ["체성분을 1주 이상 간격으로 2번 이상 기록하면 평가해 드려요."] };
    const last = recs[recs.length - 1], lastT = day(last.date);
    const cands = recs.filter((w) => lastT - day(w.date) >= 7 * DAY);
    if (!cands.length) return { level: "none", label: LEVEL_LABEL.none, reasons: ["첫 기록 후 1주가 지나면 변화를 평가해 드려요."] };
    // 비교 기준: 4주 전에 가장 가까운 기록
    const base = cands.reduce((b, w) => (Math.abs(lastT - day(w.date) - 28 * DAY) < Math.abs(lastT - day(b.date) - 28 * DAY) ? w : b));
    const weeks = (lastT - day(base.date)) / (7 * DAY);
    const dW = last.kg - base.kg;
    const ratePct = (dW / base.kg) * 100 / weeks; // 음수 = 감량
    const hasSmm = last.smm != null && base.smm != null;
    const dSmm = hasSmm ? r1(last.smm - base.smm) : null;
    const hasBf = last.bf != null && base.bf != null;
    const dFat = hasBf ? r1((last.kg * last.bf) / 100 - (base.kg * base.bf) / 100) : null;
    const lossGoal = input.targetWeight != null ? input.targetWeight < base.kg : input.goal === "lose";
    const reasons = [];
    let level = "perfect";
    const wk = Math.round(weeks * 10) / 10;
    const perWeekKg = Math.round(Math.abs(dW / weeks) * 100) / 100;
    const rateTxt = `최근 ${wk}주 동안 주당 ${perWeekKg}kg(체중의 ${Math.abs(Math.round(ratePct * 100) / 100)}%) ${dW < 0 ? "감량" : "증가"}`;

    if (lossGoal) {
      const loss = -ratePct;
      if (loss > 1.0) { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `${rateTxt}: 너무 빠릅니다. 주당 체중의 1%를 넘으면 근육 손실 위험이 커져요.` }); }
      else if (loss >= 0.5) reasons.push({ lv: "perfect", t: `${rateTxt}: 권장 속도(체중의 0.5~1.0%) 안에 있어요.` });
      else if (loss >= 0.25) { level = worse(level, "ok"); reasons.push({ lv: "ok", t: `${rateTxt}: 권장 속도보다 조금 느립니다.` }); }
      else if (loss >= 0) { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `${rateTxt}: 감량이 거의 멈췄어요(정체기). 섭취 기록을 점검하거나 활동량을 늘려 보세요.` }); }
      else { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `${rateTxt}: 감량 목표와 반대로 체중이 늘고 있어요.` }); }

      if (hasSmm) {
        if (dSmm >= -0.1) reasons.push({ lv: "perfect", t: `골격근량 ${dSmm >= 0 ? "+" : ""}${dSmm}kg: 근육을 잘 지키고 있어요.` });
        else {
          const share = dW < 0 ? Math.round((-dSmm / -dW) * 100) : 100;
          if (share <= 25) { level = worse(level, "ok"); reasons.push({ lv: "ok", t: `골격근량 ${dSmm}kg: 빠진 체중의 ${share}%가 근육입니다. 단백질과 근력 운동을 유지하세요.` }); }
          else { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `골격근량 ${dSmm}kg: 빠진 체중의 ${share}%가 근육입니다. 감량 속도를 늦추고 단백질을 늘리세요.` }); }
        }
      }
      if (hasBf) {
        if (dFat < 0) reasons.push({ lv: "perfect", t: `체지방량 ${dFat}kg: 체지방이 줄고 있어요.` });
        else { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `체지방량 +${dFat}kg: 체지방이 줄지 않고 있어요.` }); }
      }
    } else {
      // 증량·유지 목표: 근육은 늘고 체지방은 크게 늘지 않는 것이 좋다
      if (ratePct > 0.75) { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `${rateTxt}: 너무 빨리 늘고 있어요. 체지방이 함께 늘기 쉽습니다(권장 주당 0.25~0.5%).` }); }
      else if (ratePct >= -0.25) reasons.push({ lv: "perfect", t: `${rateTxt}: 적당한 속도예요.` });
      else { level = worse(level, "ok"); reasons.push({ lv: "ok", t: `${rateTxt}: 체중이 줄고 있어요. 근육을 늘리려면 섭취를 조금 늘리세요.` }); }
      if (hasSmm) {
        if (dSmm > 0) reasons.push({ lv: "perfect", t: `골격근량 +${dSmm}kg: 근육이 늘고 있어요.` });
        else { level = worse(level, "ok"); reasons.push({ lv: "ok", t: `골격근량 ${dSmm}kg: 근육이 늘지 않고 있어요. 운동 볼륨과 단백질을 점검하세요.` }); }
      }
      if (hasBf && dW > 0 && dFat / dW > 0.7) { level = worse(level, "warn"); reasons.push({ lv: "warn", t: `늘어난 체중의 ${Math.round((dFat / dW) * 100)}%가 체지방입니다.` }); }
    }
    if (!hasSmm && level === "perfect") { level = "ok"; reasons.push({ lv: "ok", t: "골격근량도 함께 기록하면 근육 손실까지 확인해 '완벽' 여부를 평가할 수 있어요." }); }
    return { level, label: LEVEL_LABEL[level], reasons, ratePct: Math.round(ratePct * 100) / 100, weeks: wk, dW: r1(dW), dSmm, dFat, base, last, lossGoal };
  }

  // ---------- 감량 플랜 3가지 ----------
  const PLANS = [
    {
      id: "ideal", name: "근육 보존 플랜", tag: "가장 이상적", rate: 0.005, minKg: 0, maxKg: 1.0,
      basis: "스포츠 영양학 근거: 엘리트 선수 대상 무작위 연구(Garthe et al., 2011)에서 주당 체중의 0.7%씩 천천히 뺀 군이 1.4%씩 빼는 군보다 제지방을 더 잘 지켰습니다(다만 천천히 뺀 군이 식단 기간이 더 길어 그 영향도 있다는 지적이 있습니다). 체급 선수 감량 리뷰들은 주당 체중의 0.5~1.0%를 권장합니다. 그중 근육 손실 위험이 가장 낮은 하한 0.5%로 계산했습니다.",
    },
    {
      id: "standard", name: "의학 표준 플랜", tag: "의학적 권장", rate: 0.007, minKg: 0.5, maxKg: 1.0,
      basis: "주당 0.5~1.0kg 감량(체중의 약 0.7%)을 의학적 권장 표준으로 보는 기준입니다. 요청하신 NCBI StatPearls(체중 감량 정체기 관리) 문서는 본문이 가입 후에만 보여서 이 수치가 그 문서에 있는지는 확인하지 못했습니다. 같은 범위는 많은 임상 가이드라인에서 쓰이는 일반적인 기준입니다. 체중의 0.7%를 0.5~1.0kg 범위로 맞춰 계산했습니다.",
    },
    {
      id: "fast", name: "가속 플랜", tag: "빠르게", rate: 0.01, minKg: 0, maxKg: 1.5,
      basis: "Purcell et al.(2014, Lancet Diabetes & Endocrinology): 비만 성인 약 200명을 12주 빠른 감량과 36주 점진 감량으로 나눈 무작위 시험에서, 체중 12.5% 감량 목표를 달성한 비율이 빠른 군 81%, 점진 군 50%였고, 감량 후 체중이 다시 늘어난 정도(약 71%)는 두 군이 비슷했습니다. 12주에 12.5%는 주당 약 1%입니다. 이 시험은 비만(BMI 30~45) 대상이고 식단을 매우 낮은 열량으로 짠 연구라, 근육 손실 위험은 위 두 플랜보다 큽니다. 요청하신 유럽비만학회(ECO) 노르웨이 284명 RCT는 원문을 찾지 못해 반영하지 않았습니다.",
    },
  ];
  // weightNow에서 input.targetWeight까지. 하루 섭취가 기초대사량 아래로 내려가지 않도록 제한
  function plans(input, weightNow, todayISO) {
    if (input.targetWeight == null) return { ok: false, reason: "목표 체중을 정하면 플랜을 계산해 드려요." };
    const diff = r1(weightNow - input.targetWeight);
    if (diff <= 0) return { ok: false, reason: "감량 목표(목표 체중이 현재보다 낮을 때)에서 사용할 수 있어요." };
    const base = { ...input, weight: weightNow, targetWeight: null };
    const a = Calc.analyze(base);
    const tdee = a.tdee, bmr = a.bmr;
    const list = PLANS.map((pl) => {
      // 플랜의 감량 속도는 그대로 두고, 섭취가 기초대사량 아래로 내려가면 모자란 만큼을 "추가 활동"으로 채우게 안내한다
      const weekly = Math.min(pl.maxKg, Math.max(pl.minKg, pl.rate * weightNow));
      const deficit = Math.round((weekly * 7700) / 7);
      const raw = tdee - deficit;
      const limited = raw < bmr;
      const intake = limited ? bmr : raw;
      const extra = limited ? Math.round(bmr - raw) : 0;
      const walkMin = extra ? Math.ceil(extra / (Energy.activityKcal(4.3, weightNow, 60) / 60)) : 0;
      const days = weekly > 0 ? Math.ceil((diff / weekly) * 7) : null;
      const d = new Date(todayISO + "T12:00:00"); if (days) d.setDate(d.getDate() + days);
      const dateISO = days ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : null;
      return { ...pl, weekly: Math.round(weekly * 100) / 100, pct: Math.round((weekly / weightNow) * 1000) / 10, deficit, intake: Math.round(intake), days, dateISO, limited, extra, walkMin };
    });
    return { ok: true, diff, tdee, bmr, list };
  }

  root.BodyComp = { standards, analysis, status, plans, PLANS, RANGE, SCALE, LEVEL_LABEL };
})(typeof window !== "undefined" ? window : globalThis);
