/* 규칙 기반 운동 프로그램 생성기
 * 근거:
 *  - Schoenfeld 2010: 근비대 3요인(기계적 장력·대사 스트레스·근손상), 6~12RM 중심, 세트 간 휴식 60~90초, 실패 지점 근처까지 수행
 *  - Schoenfeld et al. 2017: 근육군당 주간 세트 수가 많을수록 근비대 증가 (<5, 5~9, 10+ 세트 순으로 효과 증가)
 *  - Schoenfeld et al. 2019: 주간 볼륨이 같으면 빈도 자체의 영향은 작음 → 볼륨을 주 2회 이상으로 나눠 세션 피로 관리
 *
 * 사용자가 분할 수(1~6)와 분할별 부위를 직접 지정한다. 요일은 분할을 순서대로 반복해서 채운다.
 */
(function (root) {
  const { EXERCISES, LOCATION_EQ } = root.Exercises;

  const GROUP_LABEL = {
    chest: "가슴", back: "등", shoulders: "어깨", quads: "대퇴사두", hamglute: "햄스트링·둔근",
    biceps: "이두", triceps: "삼두", calves: "종아리", core: "코어",
  };
  const GROUP_ORDER = ["chest", "back", "shoulders", "quads", "hamglute", "biceps", "triceps", "calves", "core"];
  const MAJOR = ["chest", "back", "quads", "hamglute", "shoulders"];
  const ARMS = ["biceps", "triceps"];
  const PRIMARY = ["chest", "back", "quads", "hamglute"];

  // 부위별로 선택하는 움직임 카테고리 (앞쪽이 우선)
  const GROUP_SLOTS = {
    chest: ["hpush", "hpush2"],
    back: ["vpull", "hpull"],
    shoulders: ["vpush", "sidedelt", "reardelt"],
    quads: ["squat", "legacc"],
    hamglute: ["hinge", "hamacc"],
    biceps: ["biceps"],
    triceps: ["triceps"],
    calves: ["calf"],
    core: ["core"],
  };

  const FALLBACK = {
    vpull: ["hpull"], hpush2: ["hpush"], vpush: ["sidedelt"], legacc: ["squat"],
    reardelt: ["hpull"], sidedelt: ["vpush"], hinge: ["hamacc"], hamacc: ["hinge"],
  };

  function groupOf(ex) {
    switch (ex.cat) {
      case "hpush": case "hpush2": return "chest";
      case "vpush": case "sidedelt": case "reardelt": return "shoulders";
      case "vpull": case "hpull": return "back";
      case "squat": case "legacc": return "quads";
      case "hinge": case "hamacc": return "hamglute";
      case "calf": return "calves";
      default: return ex.cat; // biceps, triceps, core
    }
  }

  // 분할 수별 기본 부위 구성
  const DEFAULT_SPLITS = {
    1: [["chest", "back", "shoulders", "quads", "hamglute", "biceps", "triceps", "core"]],
    2: [["chest", "back", "shoulders", "biceps", "triceps", "core"], ["quads", "hamglute", "calves", "core"]],
    3: [["chest", "shoulders", "triceps"], ["back", "biceps", "core"], ["quads", "hamglute", "calves"]],
    4: [["chest", "triceps"], ["back", "biceps"], ["quads", "hamglute", "calves"], ["shoulders", "core"]],
    5: [["chest"], ["back"], ["quads", "calves"], ["shoulders", "biceps", "triceps"], ["hamglute", "core"]],
    6: [["chest"], ["back"], ["quads", "calves"], ["shoulders", "core"], ["hamglute"], ["biceps", "triceps"]],
  };

  const defaultSplits = (n) => DEFAULT_SPLITS[Math.min(6, Math.max(1, n))].map((g) => [...g]);
  // 모든 부위가 주 2회 안팎으로 돌도록 권장하는 분할 수
  const recommendedSplitCount = (days) => (days <= 3 ? 1 : days <= 5 ? 2 : 3);

  // 목표별 처방. major/shoulders/arms/calves: 경력(초보/중급/상급)별 근육군당 주간 목표 세트 수
  const GOAL_SCHEME = {
    muscle: {
      label: "근비대", compound: { reps: "6-10", rest: 90 }, iso: { reps: "10-15", rest: 60 },
      rir: "마지막 세트는 1~2회 남기고 종료 (실패 지점 근처)",
      major: [10, 12, 14], shoulders: [8, 10, 12], arms: [6, 8, 10], calves: [4, 6, 6],
      cardio: "주 1~2회, 20분 가볍게 (근회복 방해 최소화)",
    },
    lose: {
      label: "다이어트 (체지방 감량)", compound: { reps: "8-12", rest: 60 }, iso: { reps: "12-15", rest: 45 },
      rir: "2회 남기고 종료 (칼로리 부족 시 회복 여유 확보)",
      major: [8, 10, 10], shoulders: [6, 8, 8], arms: [4, 4, 6], calves: [4, 4, 4],
      cardio: "주 3~4회, 20~40분 (걷기·사이클·인터벌)",
    },
    strength: {
      label: "스트렝스 (근력)", compound: { reps: "3-6", rest: 180 }, iso: { reps: "8-12", rest: 90 },
      rir: "1~2회 남기고 종료, 자세 무너지기 전에 중단",
      major: [8, 10, 12], shoulders: [6, 8, 8], arms: [4, 4, 4], calves: [4, 4, 4],
      cardio: "주 1~2회, 20분 가볍게",
    },
  };

  const slotCountFor = (m) => (m <= 30 ? 4 : m <= 45 ? 5 : m <= 60 ? 6 : 7);
  const setBudgetFor = (m) => Math.floor(m / 3); // 세트당 약 3분(수행+휴식)

  // 장비 선호 순서: 바벨·머신이 있으면 우선, 없으면 덤벨 → 철봉 → 맨몸 → 밴드
  function rankOrder(eqs) {
    return eqs.includes("barbell") || eqs.includes("machine")
      ? ["barbell", "machine", "dumbbell", "bar", "body", "band"]
      : ["dumbbell", "bar", "body", "band"];
  }

  // 가능한 운동 중 장소·경력에 가장 알맞은 후보군. 변형을 위해 안 쓴 운동을 우선하되, 더 약한 운동으로 내려가지는 않는다.
  function candidates(cat, opts) {
    const eqs = root.Exercises.equipFor(opts.location, opts.equip);
    const list = EXERCISES.filter((x) =>
      x.cat === cat && eqs.includes(x.eq) && x.lv <= opts.level &&
      !x.avoid.some((a) => opts.injuries.includes(a)));
    const pref = rankOrder(eqs);
    const rank = (x) => (pref.indexOf(x.eq) + 1 || 9);
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || (opts.level >= 2 ? b.lv - a.lv : a.lv - b.lv));
    if (!sorted.length) return [];
    return sorted.filter((x) => rank(x) === rank(sorted[0]) && x.lv === sorted[0].lv);
  }

  function pick(cat, opts, used) {
    let top = candidates(cat, opts);
    if (!top.length) for (const fb of FALLBACK[cat] || []) { top = candidates(fb, opts); if (top.length) break; }
    if (!top.length) return null;
    const fresh = top.filter((x) => !used.has(x.id));
    const list = fresh.length ? fresh : top;
    return list[(opts.seed + used.size) % list.length];
  }

  function targetFor(scheme, group, level) {
    const i = level - 1;
    if (MAJOR.includes(group)) {
      const t = scheme.major[i];
      return group === "hamglute" ? t - 2 : t; // 스쿼트·로우 등에서 간접 자극
    }
    if (group === "shoulders") return scheme.shoulders[i];
    if (ARMS.includes(group)) return scheme.arms[i];
    if (group === "calves") return scheme.calves[i];
    return 0;
  }

  function weeklyVolume(days) {
    const vol = {}, freq = {};
    days.forEach((d) => {
      const seen = new Set();
      d.items.forEach((it) => { vol[it.group] = (vol[it.group] || 0) + it.sets; seen.add(it.group); });
      seen.forEach((g) => (freq[g] = (freq[g] || 0) + 1));
    });
    return { vol, freq };
  }

  // 근육군별 주간 세트 수·빈도·목표 (교체 후 재계산에도 사용)
  function volumeOf(days, goal, level) {
    const scheme = GOAL_SCHEME[goal];
    const { vol, freq } = weeklyVolume(days);
    return GROUP_ORDER.filter((g) => vol[g]).map((g) => ({
      group: g, label: GROUP_LABEL[g], sets: vol[g], freq: freq[g], target: targetFor(scheme, g, level), major: MAJOR.includes(g),
    }));
  }

  // 하루 운동의 슬롯 목록: 부위를 돌아가며 1개씩 먼저 채우고, 남는 슬롯에 부위별 2번째 운동을 넣는다
  function slotsFor(groups, maxSlots, location) {
    const slots = [];
    for (let round = 0; slots.length < maxSlots; round++) {
      let added = false;
      for (const g of groups) {
        // 집·맨몸에는 수직 당기기 복합 운동이 없어 로우를 먼저 선택
        const order = g === "back" && location !== "gym" ? ["hpull", "vpull"] : GROUP_SLOTS[g];
        const cat = order[round];
        if (cat && slots.length < maxSlots) { slots.push({ group: g, cat }); added = true; }
      }
      if (!added) break;
    }
    return slots;
  }

  function generate(input) {
    const opts = { location: input.location, equip: input.equip, level: input.level, injuries: input.injuries || [], seed: input.seed || 0 };
    const scheme = GOAL_SCHEME[input.goal];
    const splits = (input.splits && input.splits.length ? input.splits : defaultSplits(recommendedSplitCount(input.days)))
      .map((g) => GROUP_ORDER.filter((x) => g.includes(x)));
    const maxSlots = slotCountFor(input.minutes);
    const budget = setBudgetFor(input.minutes);
    const used = new Set();
    const letters = "ABCDEF";

    const days = Array.from({ length: input.days }, (_, idx) => {
      const si = idx % splits.length;
      const groups = splits[si];
      const items = [];
      const dayUsed = new Set();
      for (const slot of slotsFor(groups, maxSlots, opts.location)) {
        const ex = pick(slot.cat, opts, new Set([...used, ...dayUsed]));
        if (!ex || dayUsed.has(ex.id)) continue;
        dayUsed.add(ex.id);
        const p = ex.compound ? scheme.compound : scheme.iso;
        const g = groupOf(ex);
        items.push({
          id: ex.id, name: ex.name, muscle: ex.muscle, compound: ex.compound, group: g,
          sets: 2, reps: p.reps, rest: p.rest, cap: ex.compound ? 5 : 4,
        });
      }
      items.sort((a, b) => (b.compound ? 1 : 0) - (a.compound ? 1 : 0)); // 복합 운동 먼저 (안정 정렬)
      dayUsed.forEach((id) => used.add(id));
      const skipped = groups.filter((g) => !items.some((it) => it.group === g));
      return {
        index: idx + 1, split: letters[si], groups,
        title: groups.map((g) => GROUP_LABEL[g]).join(" · "), items, skipped,
      };
    });

    // 주간 목표 볼륨까지 세트 배분 (세션 시간 예산 내)
    const total = (d) => d.items.reduce((s, x) => s + x.sets, 0);
    const stuck = new Set();
    for (let guard = 0; guard < 800; guard++) {
      const { vol } = weeklyVolume(days);
      let worst = null, worstGap = 0;
      for (const g of [...MAJOR, ...ARMS, "calves"]) {
        if (stuck.has(g)) continue;
        const raw = targetFor(scheme, g, input.level) - (vol[g] || 0);
        // 큰 근육군(가슴·등·하체)을 어깨·팔보다 먼저 목표 볼륨까지 채운다
        const gap = raw > 0 && PRIMARY.includes(g) ? raw + 100 : raw;
        if (gap > worstGap && vol[g]) { worst = g; worstGap = gap; }
      }
      if (!worst) break;
      let best = null;
      for (const d of days) {
        if (total(d) >= budget) continue;
        for (const it of d.items) {
          if (it.group !== worst || it.sets >= it.cap) continue;
          if (!best || total(d) < best.t || (total(d) === best.t && it.sets < best.it.sets)) best = { d, it, t: total(d) };
        }
      }
      if (!best) stuck.add(worst); else best.it.sets++;
    }

    const volume = volumeOf(days, input.goal, input.level);
    const short = volume.filter((v) => v.target && v.sets < v.target).map((v) => v.label);
    const lowFreq = volume.filter((v) => v.major && v.freq < 2).map((v) => v.label);
    const skipped = [...new Set(days.flatMap((d) => d.skipped).map((g) => GROUP_LABEL[g]))];

    const splitName = splits.length === 1 ? "무분할(전신)" : `${splits.length}분할`;

    const tips = [
      `강도: ${scheme.rir}.`,
      "운동 전 5~10분 가벼운 유산소와 워밍업 세트(본 세트 무게의 50~70%)를 하세요.",
      "모든 세트에서 반복 상한을 채우면 다음 운동에서 무게를 2.5kg(하체 5kg) 올리세요. 이것이 점진적 과부하입니다.",
      "근육 성장은 주간 총 세트 수(볼륨)에 비례해 커집니다. 회복이 되면 주 1~2세트씩 천천히 늘리세요.",
      "4~6주마다 1주는 세트를 절반으로 줄이는 디로드 주간을 두세요.",
    ];
    if (input.days >= 7) tips.push("주 7일 운동은 회복이 부족해질 수 있습니다. 최소 하루는 가벼운 활동이나 휴식일로 쓰는 것을 권장합니다.");
    if (input.goal === "lose") tips.push("다이어트 중에는 근육 보존이 핵심입니다. 무게를 낮추지 말고 단백질 섭취를 유지하세요.");
    if (lowFreq.length) tips.push(`${lowFreq.join(", ")}은(는) 주 1회만 자극됩니다. 연구상 같은 볼륨이면 빈도 차이는 작지만, 한 번에 세트를 몰아서 하면 피로가 커지므로 분할 수를 줄이거나 운동 일수를 늘리는 것을 고려하세요.`);
    if (short.length) tips.push(`선택한 시간·분할로는 ${short.join(", ")}의 목표 볼륨을 다 채우지 못했습니다. 1회 시간을 늘리거나 분할당 부위 수를 줄이면 볼륨이 늘어납니다.`);
    if (skipped.length) tips.push(`1회 운동 시간이 짧아 ${skipped.join(", ")}이(가) 일부 날에 빠졌습니다. 시간을 늘리거나 분할당 부위를 줄여 보세요.`);
    if (input.injuries && input.injuries.length) tips.push("통증 부위 관련 운동은 제외했습니다. 통증이 계속되면 전문가와 상담하세요.");

    days.forEach((d) => d.items.forEach((it) => delete it.cap));
    return { splitName, goalLabel: scheme.label, cardio: scheme.cardio, days, volume, tips };
  }

  // 운동 하나를 프로그램 항목으로 만든다 (교체 기능에서 사용)
  function makeItem(ex, goal, sets) {
    const p = ex.compound ? GOAL_SCHEME[goal].compound : GOAL_SCHEME[goal].iso;
    return { id: ex.id, name: ex.name, muscle: ex.muscle, compound: ex.compound, group: groupOf(ex), sets, reps: p.reps, rest: p.rest };
  }

  // 같은 움직임 카테고리의 대체 운동 (장비·경력·부상 조건 충족, 현재 항목 제외)
  function alternatives(item, input, excludeIds) {
    const ex = EXERCISES.find((e) => e.id === item.id);
    if (!ex) return [];
    const eqs = root.Exercises.equipFor(input.location, input.equip);
    const pref = rankOrder(eqs);
    const skip = new Set(excludeIds || []);
    return EXERCISES.filter((x) =>
      x.cat === ex.cat && x.id !== ex.id && !skip.has(x.id) && eqs.includes(x.eq) && x.lv <= input.level &&
      !x.avoid.some((a) => (input.injuries || []).includes(a)))
      .sort((a, b) => (pref.indexOf(a.eq) + 1 || 9) - (pref.indexOf(b.eq) + 1 || 9));
  }

  root.Generator = {
    generate, defaultSplits, recommendedSplitCount, GOAL_SCHEME, GROUP_LABEL, GROUP_ORDER, MAJOR, groupOf,
    makeItem, alternatives, volume: volumeOf,
  };
})(typeof window !== "undefined" ? window : globalThis);
