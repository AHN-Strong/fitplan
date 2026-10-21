/* 운동 DB
 * cat: 움직임 카테고리 (생성기 슬롯과 매칭)
 * eq: gym(헬스장 기구) | dumbbell | band | body(맨몸)
 * lv: 최소 경력 1=초보 2=중급 3=상급
 * avoid: 이 부위 통증이 있으면 제외 (knee, back, shoulder, wrist, elbow)
 */
(function (root) {
  const E = (id, name, cat, eq, lv, compound, avoid, muscle) => ({ id, name, cat, eq, lv, compound, avoid: avoid || [], muscle });

  const EXERCISES = [
    // 스쿼트 계열
    E("bb-squat", "바벨 백 스쿼트", "squat", "gym", 2, true, ["knee", "back"], "대퇴사두·둔근"),
    E("leg-press", "레그 프레스", "squat", "gym", 1, true, ["knee"], "대퇴사두·둔근"),
    E("goblet-squat", "고블릿 스쿼트", "squat", "dumbbell", 1, true, ["knee"], "대퇴사두·둔근"),
    E("bw-squat", "맨몸 스쿼트", "squat", "body", 1, true, ["knee"], "대퇴사두·둔근"),
    E("band-squat", "밴드 스쿼트", "squat", "band", 1, true, ["knee"], "대퇴사두·둔근"),
    E("bulgarian", "불가리안 스플릿 스쿼트", "squat", "dumbbell", 3, true, ["knee"], "대퇴사두·둔근"),
    // 힌지 계열
    E("deadlift", "바벨 데드리프트", "hinge", "gym", 3, true, ["back"], "햄스트링·둔근·척추기립근"),
    E("rdl", "루마니안 데드리프트", "hinge", "gym", 2, true, ["back"], "햄스트링·둔근"),
    E("db-rdl", "덤벨 루마니안 데드리프트", "hinge", "dumbbell", 1, true, ["back"], "햄스트링·둔근"),
    E("glute-bridge", "글루트 브릿지", "hinge", "body", 1, false, [], "둔근·햄스트링"),
    E("band-gm", "밴드 굿모닝", "hinge", "band", 1, true, ["back"], "햄스트링·둔근"),
    E("hip-thrust", "바벨 힙 쓰러스트", "hinge", "gym", 2, true, [], "둔근"),
    // 하체 보조
    E("leg-curl", "레그 컬", "hamacc", "gym", 1, false, [], "햄스트링"),
    E("slide-curl", "슬라이딩 레그 컬(수건)", "hamacc", "body", 1, false, [], "햄스트링"),
    E("band-leg-curl", "밴드 레그 컬", "hamacc", "band", 1, false, [], "햄스트링"),
    E("sl-rdl", "싱글레그 덤벨 RDL", "hamacc", "dumbbell", 2, true, ["back"], "햄스트링·둔근"),
    E("calf-machine", "스탠딩 카프 레이즈 머신", "calf", "gym", 1, false, [], "종아리"),
    E("db-calf", "덤벨 카프 레이즈", "calf", "dumbbell", 1, false, [], "종아리"),
    E("leg-ext", "레그 익스텐션", "legacc", "gym", 1, false, ["knee"], "대퇴사두"),
    E("lunge", "덤벨 런지", "legacc", "dumbbell", 1, true, ["knee"], "대퇴사두·둔근"),
    E("bw-lunge", "맨몸 런지", "legacc", "body", 1, true, ["knee"], "대퇴사두·둔근"),
    E("calf-raise", "맨몸 카프 레이즈", "calf", "body", 1, false, [], "종아리"),
    E("step-up", "스텝 업", "legacc", "dumbbell", 1, true, ["knee"], "대퇴사두·둔근"),
    // 수평 밀기
    E("bench", "바벨 벤치 프레스", "hpush", "gym", 2, true, ["shoulder"], "가슴·삼두"),
    E("chest-press", "체스트 프레스 머신", "hpush", "gym", 1, true, ["shoulder"], "가슴·삼두"),
    E("db-bench", "덤벨 벤치 프레스", "hpush", "dumbbell", 1, true, ["shoulder"], "가슴·삼두"),
    E("pushup", "푸시업", "hpush", "body", 1, true, ["wrist"], "가슴·삼두"),
    E("knee-pushup", "무릎 푸시업", "hpush", "body", 1, true, [], "가슴·삼두"),
    E("band-press", "밴드 체스트 프레스", "hpush", "band", 1, true, [], "가슴·삼두"),
    E("incline-db", "인클라인 덤벨 프레스", "hpush2", "dumbbell", 2, true, ["shoulder"], "상부 가슴"),
    E("pec-deck", "펙덱 플라이", "hpush2", "gym", 1, false, [], "가슴"),
    E("db-fly", "덤벨 플라이", "hpush2", "dumbbell", 2, false, ["shoulder"], "가슴"),
    E("decline-pushup", "디클라인 푸시업", "hpush2", "body", 2, true, ["wrist", "shoulder"], "상부 가슴·어깨"),
    E("band-fly", "밴드 플라이", "hpush2", "band", 1, false, [], "가슴"),
    // 수직 밀기
    E("ohp", "바벨 오버헤드 프레스", "vpush", "gym", 3, true, ["shoulder", "back"], "어깨·삼두"),
    E("shoulder-press", "숄더 프레스 머신", "vpush", "gym", 1, true, ["shoulder"], "어깨"),
    E("db-ohp", "덤벨 숄더 프레스", "vpush", "dumbbell", 1, true, ["shoulder"], "어깨·삼두"),
    E("pike-pushup", "파이크 푸시업", "vpush", "body", 2, true, ["shoulder", "wrist"], "어깨"),
    E("band-ohp", "밴드 숄더 프레스", "vpush", "band", 1, true, ["shoulder"], "어깨"),
    // 수직 당기기
    E("pulldown", "랫 풀다운", "vpull", "gym", 1, true, [], "광배근·이두"),
    E("pullup", "풀업", "vpull", "gym", 3, true, ["shoulder", "elbow"], "광배근·이두"),
    E("band-pulldown", "밴드 풀다운", "vpull", "band", 1, true, [], "광배근"),
    E("prone-pulldown", "프론 랫 풀다운(바닥 엎드려)", "vpull", "body", 1, false, [], "광배근"),
    // 수평 당기기
    E("bb-row", "바벨 로우", "hpull", "gym", 2, true, ["back"], "광배근·승모근"),
    E("seated-row", "시티드 케이블 로우", "hpull", "gym", 1, true, [], "광배근·능형근"),
    E("db-row", "원암 덤벨 로우", "hpull", "dumbbell", 1, true, [], "광배근·능형근"),
    E("band-row", "밴드 로우", "hpull", "band", 1, true, [], "광배근·능형근"),
    E("inv-row", "인버티드 로우(테이블/바)", "hpull", "body", 1, true, [], "광배근·능형근"),
    // 후면 어깨
    E("face-pull", "페이스 풀", "reardelt", "gym", 1, false, [], "후면 어깨·회전근개"),
    E("rear-fly", "덤벨 리어 델트 플라이", "reardelt", "dumbbell", 1, false, [], "후면 어깨"),
    E("band-pull-apart", "밴드 풀 어파트", "reardelt", "band", 1, false, [], "후면 어깨"),
    E("prone-y", "프론 Y 레이즈", "reardelt", "body", 1, false, [], "후면 어깨·승모근"),
    // 측면 어깨
    E("lat-raise", "사이드 레터럴 레이즈", "sidedelt", "dumbbell", 1, false, ["shoulder"], "측면 어깨"),
    E("cable-lat", "케이블 레터럴 레이즈", "sidedelt", "gym", 1, false, ["shoulder"], "측면 어깨"),
    E("band-lat", "밴드 레터럴 레이즈", "sidedelt", "band", 1, false, ["shoulder"], "측면 어깨"),
    // 이두
    E("bb-curl", "바벨 컬", "biceps", "gym", 1, false, ["elbow", "wrist"], "이두"),
    E("db-curl", "덤벨 컬", "biceps", "dumbbell", 1, false, ["elbow"], "이두"),
    E("hammer", "해머 컬", "biceps", "dumbbell", 1, false, [], "이두·전완"),
    E("band-curl", "밴드 컬", "biceps", "band", 1, false, [], "이두"),
    // 삼두
    E("pushdown", "케이블 푸시다운", "triceps", "gym", 1, false, ["elbow"], "삼두"),
    E("db-ext", "덤벨 오버헤드 익스텐션", "triceps", "dumbbell", 1, false, ["elbow", "shoulder"], "삼두"),
    E("bench-dip", "벤치 딥", "triceps", "body", 1, false, ["shoulder", "wrist"], "삼두"),
    E("band-ext", "밴드 트라이셉스 익스텐션", "triceps", "band", 1, false, [], "삼두"),
    // 코어
    E("plank", "플랭크", "core", "body", 1, false, [], "복근·코어"),
    E("deadbug", "데드버그", "core", "body", 1, false, [], "복근·코어"),
    E("crunch", "크런치", "core", "body", 1, false, [], "복직근"),
    E("leg-raise", "레그 레이즈", "core", "body", 2, false, ["back"], "하복부"),
    E("cable-crunch", "케이블 크런치", "core", "gym", 2, false, [], "복직근"),
    E("pallof", "팔로프 프레스", "core", "band", 1, false, [], "코어(항회전)"),
    E("bird-dog", "버드독", "core", "body", 1, false, [], "코어·척추 안정"),
  ];

  // 장비 세분화: 헬스장 기구(gym)를 바벨 / 머신·케이블 / 철봉으로 나눈다
  const BARBELL = ["bb-squat", "deadlift", "rdl", "hip-thrust", "bench", "ohp", "bb-row", "bb-curl"];
  EXERCISES.forEach((x) => {
    if (x.eq !== "gym") return;
    x.eq = BARBELL.includes(x.id) ? "barbell" : x.id === "pullup" ? "bar" : "machine";
  });

  const EQUIP_LABEL = {
    barbell: "바벨·랙", machine: "머신·케이블", dumbbell: "덤벨", bar: "철봉", band: "밴드", body: "맨몸",
  };
  const EQUIP_ORDER = ["barbell", "machine", "dumbbell", "bar", "band", "body"];

  // 장소별 기본 장비 (사용자가 직접 바꿀 수 있음)
  const LOCATION_EQ = {
    gym: ["barbell", "machine", "dumbbell", "bar", "band", "body"],
    home: ["dumbbell", "band", "body"],
    body: ["body", "band"],
  };

  // 선택한 장비 목록(없으면 장소 기본값). 맨몸 운동은 항상 가능.
  function equipFor(location, equip) {
    const list = equip && equip.length ? equip : LOCATION_EQ[location] || LOCATION_EQ.gym;
    return list.includes("body") ? list : [...list, "body"];
  }

  root.Exercises = { EXERCISES, LOCATION_EQ, EQUIP_LABEL, EQUIP_ORDER, equipFor };
})(typeof window !== "undefined" ? window : globalThis);
