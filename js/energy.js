/* 에너지 수지: 하루 소모 칼로리(기초대사 + 직업·일상 + 운동·활동), 활동 종류별 칼로리, 목표 달성 플래너
 * 활동 칼로리는 (MET − 1) × 체중(kg) × 시간(h) 의 순수 추가분이다. 기초대사·일상 활동은 따로 더한다. */
(function (root) {
  // [id, 이름, MET]  (MET는 신체활동 종합표 기준의 대략값)
  const ACTIVITIES = [
    ["walk-slow", "걷기 (느리게, 3km/h)", 2.3], ["walk", "걷기 (보통, 4~5km/h)", 3.5], ["walk-fast", "빠르게 걷기 (6km/h)", 4.3],
    ["hike", "등산", 6.0], ["stairs", "계단 오르기", 8.0],
    ["jog", "조깅 (8km/h)", 8.3], ["run", "달리기 (10km/h)", 9.8],
    ["bike-easy", "자전거 (가볍게)", 4.0], ["bike", "자전거 (보통)", 6.8],
    ["swim", "수영", 6.0], ["jumprope", "줄넘기", 11.0], ["hiit", "HIIT·서킷", 8.0],
    ["weights", "웨이트 트레이닝 (직접 입력)", 4.0],
    ["yoga", "요가", 2.5], ["pilates", "필라테스", 3.0], ["stretch", "스트레칭", 2.3],
    ["dance", "댄스·에어로빅", 5.5],
    ["soccer", "축구·풋살", 7.0], ["basketball", "농구", 6.5], ["badminton", "배드민턴", 5.5], ["tennis", "테니스", 7.3], ["pingpong", "탁구", 4.0],
    ["golf", "골프 (걸어서)", 4.8], ["bowling", "볼링", 3.0],
    ["housework", "집안일·청소", 3.3],
  ].map(([id, name, met]) => ({ id, name, met }));

  const byId = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

  // 활동 하나의 순수 추가 소모 칼로리
  function activityKcal(met, weightKg, minutes) {
    return Math.max(0, Math.round((met - 1) * weightKg * (minutes / 60)));
  }

  // 웨이트 세션의 운동 시간(분): 저장된 값이 없으면 세트 수로 추정
  function sessionMinutes(s) {
    if (s.minutes > 0) return s.minutes;
    const sets = (s.items || []).reduce((a, it) => a + (it.sets || []).length, 0);
    return Math.round(sets * 2.5 + 8);
  }

  // 하루 소모 칼로리. input: 프로그램 입력(job 포함), weightNow: 그날 기준 체중
  function dayBurn(input, weightNow, activities, sessions) {
    const bmr = Calc.bmr({ ...input, weight: weightNow });
    const factor = Calc.JOBS[input.job || 1].factor;
    const neat = Math.round(bmr * (factor - 1));
    const items = (activities || []).map((a) => ({ name: a.name, min: a.min, kcal: a.kcal, auto: false, id: a.id }));
    (sessions || []).forEach((s) => {
      const min = sessionMinutes(s);
      items.push({ name: "웨이트 · " + (s.title || "운동"), min, kcal: Calc.WORKOUT_NET_MET * weightNow * (min / 60) | 0, auto: true, id: s.id });
    });
    const act = items.reduce((a, x) => a + x.kcal, 0);
    return { bmr: Math.round(bmr), neat, base: Math.round(bmr) + neat, act, total: Math.round(bmr) + neat + act, items };
  }

  // 섭취 − 소모 수지로 본 예상 체중 변화(kg). 7700kcal ≈ 체지방 1kg
  const weightChange = (balanceKcal) => Math.round((balanceKcal / 7700) * 100) / 100;

  // 안전 하한: 기초대사량 이하로 먹지 않도록
  const intakeFloor = (bmr) => Math.round(bmr);

  // 오늘 기준 입력값: 가장 최근에 기록한 체중, 기한까지 남은 주 수, 추가 활동 목표를 반영한다.
  // 체중을 기록할수록, 시간이 지날수록 하루 목표 칼로리가 현실에 맞게 다시 계산된다.
  function currentInput(program, weights, settings, todayISO) {
    const i = { ...program.input };
    const logged = (weights || []).filter((w) => w.date <= todayISO);
    if (logged.length) i.weight = logged[logged.length - 1].kg;
    if (i.job == null) i.job = 1;
    i.extraKcal = (settings && settings.extraKcal) || 0;
    let expired = false;
    if (i.targetWeight != null && i.targetDate) {
      const left = Calc.weeksUntil(i.targetDate, todayISO);
      if (left < 2) expired = true;
      i.weeks = Math.max(2, left);
    }
    return Object.assign(i, { expired });
  }

  root.Energy = { ACTIVITIES, byId, activityKcal, sessionMinutes, dayBurn, weightChange, intakeFloor, currentInput };
})(typeof window !== "undefined" ? window : globalThis);
