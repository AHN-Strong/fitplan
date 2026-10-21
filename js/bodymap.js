/* 해부학 그림: wger.de의 근육 해부도(CC-BY-SA)를 앞/뒤로 겹쳐 타겟 근육을 빨간색으로 표시한다.
 * 기본 해부도 위에 근육별 빨간 레이어를 쌓는 방식이다. */
(function (root) {
  // 근육 문구(운동 DB의 muscle) → 영역
  const KEYWORDS = [
    ["가슴", "chest"], ["삼두", "triceps"], ["이두", "biceps"], ["전완", "forearms"],
    ["어깨", "delts"], ["회전근개", "delts"], ["광배근", "lats"], ["승모근", "traps"], ["능형근", "traps"],
    ["척추", "lowerback"], ["대퇴사두", "quads"], ["햄스트링", "hams"], ["둔근", "glutes"],
    ["종아리", "calves"], ["복", "abs"], ["코어", "abs"],
  ];
  // 부위(분할 편집기의 그룹) → 영역
  const GROUP_REGIONS = {
    chest: ["chest"], back: ["lats", "traps", "lowerback"], shoulders: ["delts"], quads: ["quads"],
    hamglute: ["hams", "glutes"], biceps: ["biceps", "forearms"], triceps: ["triceps"], calves: ["calves"], core: ["abs", "lowerback"],
  };
  // 영역 → wger 근육 레이어 번호 (앞면: 1,2,3,4,6,10,13,14 / 뒷면: 5,7,8,9,11,12,15)
  const WGER = {
    chest: [4, 3], delts: [2], lats: [12], traps: [9], abs: [6, 14], biceps: [1, 13], triceps: [5],
    quads: [10], hams: [11], glutes: [8], calves: [7, 15], forearms: [], lowerback: [],
  };
  const FRONT = new Set([1, 2, 3, 4, 6, 10, 13, 14]);

  function regionsFromMuscle(text) {
    const s = new Set();
    KEYWORDS.forEach(([k, r]) => { if (text.includes(k)) s.add(r); });
    return s;
  }
  function regionsFromGroups(groups) {
    const s = new Set();
    groups.forEach((g) => (GROUP_REGIONS[g] || []).forEach((r) => s.add(r)));
    return s;
  }

  // 영역 집합 → { front: [번호], back: [번호] }
  function layers(regions) {
    const front = [], back = [];
    regions.forEach((r) => (WGER[r] || []).forEach((n) => (FRONT.has(n) ? front : back).push(n)));
    return { front, back };
  }

  // 앞/뒤 해부도 한 쌍의 HTML
  function figure(regions) {
    const L = layers(regions);
    const one = (view, nums, label) =>
      `<div class="anat" role="img" aria-label="${label}"><img src="assets/wger/muscular_system_${view}.svg" alt="">` +
      nums.map((n) => `<img src="assets/wger/muscle-${n}.svg" alt="">`).join("") + `<span>${label}</span></div>`;
    return one("front", L.front, "앞면") + one("back", L.back, "뒷면");
  }

  // 회복 상태 해부도: levels = { 근육군: "rest" | "almost" } → 빨강(회복 중) / 주황(거의 회복)
  function figureLevels(levels) {
    const front = [], back = [];
    Object.keys(levels).forEach((g) => {
      (GROUP_REGIONS[g] || []).forEach((r) => (WGER[r] || []).forEach((n) => (FRONT.has(n) ? front : back).push([n, levels[g]])));
    });
    const one = (view, list, label) =>
      `<div class="anat" role="img" aria-label="${label}"><img src="assets/wger/muscular_system_${view}.svg" alt="">` +
      list.map(([n, lv]) => `<img class="lv-${lv}" src="assets/wger/muscle-${n}.svg" alt="">`).join("") + `<span>${label}</span></div>`;
    return one("front", front, "앞면") + one("back", back, "뒷면");
  }

  root.Body = { regionsFromMuscle, regionsFromGroups, layers, figure, figureLevels };
})(typeof window !== "undefined" ? window : globalThis);
