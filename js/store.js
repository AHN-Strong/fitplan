/* 기록 저장소: 브라우저 localStorage. 서버로 보내지 않는다.
 * 구조: { program, sessions[], weights[], draft } */
(function (root) {
  const KEY = "fitplan.data.v1";
  const defaultSettings = () => ({ mealCount: 4, mealNames: null, extraKcal: 0 });
  const empty = () => ({ v: 1, program: null, sessions: [], weights: [], draft: null, meals: {}, customFoods: [], activities: {}, settings: defaultSettings() });
  let mem = null;

  // 예전 끼니 키(breakfast 등)를 슬롯 키(s1~s5)로 바꾼다
  const LEGACY_MEAL = { breakfast: "s1", lunch: "s2", dinner: "s3", snack: "s4" };
  function migrate(d) {
    Object.keys(d.meals || {}).forEach((date) => d.meals[date].forEach((m) => { if (LEGACY_MEAL[m.meal]) m.meal = LEGACY_MEAL[m.meal]; }));
    d.settings = Object.assign(defaultSettings(), d.settings || {});
    d.activities = d.activities || {};
    return d;
  }

  function load() {
    if (mem) return mem;
    try { const raw = localStorage.getItem(KEY); mem = migrate(raw ? Object.assign(empty(), JSON.parse(raw)) : empty()); }
    catch (e) { mem = empty(); }
    return mem;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); return true; } catch (e) { return false; } }

  const today = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const api = {
    today,
    data: () => load(),
    // 프로그램 저장. 시작일은 기존 값을 유지한다.
    setProgram(input, plan) {
      const d = load();
      d.program = { input, plan, startDate: d.program ? d.program.startDate : today() };
      save();
    },
    program: () => load().program,
    updatePlan(plan) { const d = load(); if (d.program) { d.program.plan = plan; save(); } },
    addSession(s) {
      const d = load();
      d.sessions.push({ id: uid(), ts: Date.now(), ...s });
      d.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts));
      save();
    },
    deleteSession(id) { const d = load(); d.sessions = d.sessions.filter((s) => s.id !== id); save(); },
    addWeight(date, kg) {
      const d = load();
      d.weights = d.weights.filter((w) => w.date !== date);
      d.weights.push({ date, kg });
      d.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
      save();
    },
    // 체성분 기록: 같은 날짜면 덮어쓴다. bf(체지방률)·smm(골격근량)은 선택
    addBody(date, { kg, bf, smm }) {
      const d = load();
      d.weights = d.weights.filter((w) => w.date !== date);
      const e = { date, kg };
      if (bf != null) e.bf = bf;
      if (smm != null) e.smm = smm;
      d.weights.push(e);
      d.weights.sort((a, b) => (a.date < b.date ? -1 : 1));
      save();
    },
    deleteWeight(date) { const d = load(); d.weights = d.weights.filter((w) => w.date !== date); save(); },
    setDraft(draft) { load().draft = draft; save(); },
    // 식단: 날짜별 항목. 항목에는 그때 계산한 영양소를 함께 저장한다(식품 DB가 바뀌어도 기록 유지)
    mealsOn: (date) => (load().meals[date] || []),
    addMeal(date, entry) {
      const d = load();
      (d.meals[date] = d.meals[date] || []).push({ id: uid(), ts: Date.now(), ...entry });
      save();
    },
    updateMeal(date, id, patch) {
      const it = (load().meals[date] || []).find((x) => x.id === id);
      if (it) { Object.assign(it, patch); save(); }
    },
    deleteMeal(date, id) {
      const d = load();
      d.meals[date] = (d.meals[date] || []).filter((x) => x.id !== id);
      if (!d.meals[date].length) delete d.meals[date];
      save();
    },
    // 설정(끼니 수·이름, 추가 활동 목표)
    settings: () => load().settings,
    setSettings(patch) { const d = load(); d.settings = { ...d.settings, ...patch }; save(); },
    // 활동 기록: 날짜별 [{ id, type, name, min, kcal }]
    activitiesOn: (date) => (load().activities[date] || []),
    addActivity(date, entry) { const d = load(); (d.activities[date] = d.activities[date] || []).push({ id: uid(), ts: Date.now(), ...entry }); save(); },
    deleteActivity(date, id) {
      const d = load();
      d.activities[date] = (d.activities[date] || []).filter((x) => x.id !== id);
      if (!d.activities[date].length) delete d.activities[date];
      save();
    },
    // 프로그램 입력 일부 수정(직업 등)
    updateInput(patch) { const d = load(); if (d.program) { d.program.input = { ...d.program.input, ...patch }; save(); } },
    customFoods: () => load().customFoods,
    addCustomFood(food) { const d = load(); d.customFoods = d.customFoods.filter((x) => x.name !== food.name); d.customFoods.unshift({ ...food, id: "c-" + uid(), cat: "직접 추가", kw: "" }); save(); },
    exportJSON: () => JSON.stringify(load(), null, 2),
    importJSON(text) {
      const obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.sessions) || !Array.isArray(obj.weights)) throw new Error("형식이 올바르지 않습니다.");
      mem = migrate(Object.assign(empty(), obj));
      save();
    },
    reset() { mem = empty(); save(); },
  };
  root.Store = api;
})(typeof window !== "undefined" ? window : globalThis);
