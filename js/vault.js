/* 비밀번호 보관함: 이름 + 비밀번호로 내 기록을 이 기기의 브라우저에 암호화해서 보관한다.
 * - 비밀번호에서 PBKDF2(SHA-256, 20만 회)로 키를 만들고 AES-GCM으로 암호화한다. 비밀번호 자체는 저장하지 않는다.
 * - 서버가 없으므로 같은 기기·같은 브라우저에서만 다시 열 수 있다. 다른 기기로 옮길 때는 '기록' 탭의 백업을 쓴다.
 * - 비밀번호를 잊으면 복구할 방법이 없다(복구 서버가 없기 때문). */
(function (root) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const PROFILES = "fitplan.profiles", LAST = "fitplan.last", PREFIX = "fitplan.vault.";
  const ITER = 200000;
  const supported = !!(root.crypto && root.crypto.subtle && root.TextEncoder);

  // ---------- 암호화 ----------
  function b64(buf) {
    const a = new Uint8Array(buf); let s = "";
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(password, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptJSON(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12);
    return b64(out);
  }
  async function decryptJSON(key, text) {
    const buf = unb64(text);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
    return JSON.parse(dec.decode(pt));
  }
  async function idOf(name) {
    const h = await crypto.subtle.digest("SHA-256", enc.encode(name.trim().toLowerCase()));
    return Array.from(new Uint8Array(h)).slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  // ---------- 저장 ----------
  const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const profiles = () => readJSON(PROFILES, []);
  let session = null; // { id, name, key, rec }
  let timer = null, pending = false;

  async function flush() {
    if (!session || !pending) return;
    pending = false;
    try {
      session.rec.data = await encryptJSON(session.key, Store.data());
      localStorage.setItem(PREFIX + session.id, JSON.stringify(session.rec));
    } catch (e) {
      pending = true;
      if (root.App && App.toast) App.toast("저장 공간이 부족하거나 저장에 실패했어요. 백업을 받아 두세요");
    }
  }
  function schedule() {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }

  // ---------- 계정 만들기 · 열기 ----------
  async function create(name, password) {
    name = name.trim();
    const id = await idOf(name);
    if (profiles().some((p) => p.id === id)) throw new Error("이미 있는 이름이에요. '열기'에서 비밀번호로 열어 주세요.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt, ITER);
    // 비밀번호 도입 전 기록이 이 기기에 있으면 이 계정으로 옮긴다
    const legacy = Store.legacy();
    const data = legacy || {};
    const rec = { v: 1, name, salt: b64(salt), iter: ITER, data: "" };
    session = { id, name, key, rec };
    Store.attach(data, schedule);
    await (pending = true, flush());
    localStorage.setItem(PROFILES, JSON.stringify(profiles().concat([{ id, name }])));
    localStorage.setItem(LAST, id);
    if (legacy) Store.clearLegacy();
    return { migrated: !!legacy };
  }

  async function unlock(id, password) {
    const rec = readJSON(PREFIX + id, null);
    if (!rec) throw new Error("계정을 찾을 수 없어요.");
    const key = await deriveKey(password, unb64(rec.salt), rec.iter || ITER);
    let data;
    try { data = await decryptJSON(key, rec.data); } catch (e) { throw new Error("비밀번호가 맞지 않아요."); }
    session = { id, name: rec.name, key, rec };
    Store.attach(data, schedule);
    localStorage.setItem(LAST, id);
    return true;
  }

  function lock() {
    flush().finally(() => { session = null; Store.detach(); location.reload(); });
  }

  function deleteCurrent() {
    if (!session) return;
    const id = session.id;
    localStorage.removeItem(PREFIX + id);
    localStorage.setItem(PROFILES, JSON.stringify(profiles().filter((p) => p.id !== id)));
    if (localStorage.getItem(LAST) === id) localStorage.removeItem(LAST);
    session = null; Store.detach();
    location.reload();
  }

  // 비밀번호 바꾸기: 새 비밀번호로 다시 암호화한다
  async function changePassword(oldPw, newPw) {
    if (!session) throw new Error("로그인되어 있지 않아요.");
    const rec = readJSON(PREFIX + session.id, null);
    const oldKey = await deriveKey(oldPw, unb64(rec.salt), rec.iter || ITER);
    try { await decryptJSON(oldKey, rec.data); } catch (e) { throw new Error("현재 비밀번호가 맞지 않아요."); }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(newPw, salt, ITER);
    session.key = key;
    session.rec = { ...session.rec, salt: b64(salt), iter: ITER };
    await (pending = true, flush());
  }

  // ---------- 첫 화면 ----------
  const $ = (s) => document.querySelector(s);
  let mode = "open"; // open | create

  function showGate() {
    const list = profiles();
    mode = list.length ? "open" : "create";
    renderGate();
  }

  function renderGate() {
    const g = $("#gate");
    const list = profiles();
    const last = localStorage.getItem(LAST);
    const lastP = list.find((p) => p.id === last) || list[0];
    g.hidden = false;
    document.body.classList.add("locked");
    const tabs = list.length ? `<div class="seg segm" role="tablist"><label><input type="radio" name="gateMode" value="open" ${mode === "open" ? "checked" : ""}><span>열기</span></label><label><input type="radio" name="gateMode" value="create" ${mode === "create" ? "checked" : ""}><span>새로 만들기</span></label></div>` : "";
    let body;
    if (mode === "open") {
      body = list.length === 1
        ? `<p class="gname">${esc(lastP.name)} <small>님의 기록</small></p><input type="hidden" id="gId" value="${lastP.id}">`
        : `<label>이름<select id="gId">${list.map((p) => `<option value="${p.id}" ${lastP && p.id === lastP.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`;
      body += `<label>비밀번호<input type="password" id="gPw" autocomplete="current-password" placeholder="비밀번호" required></label>`;
    } else {
      body = `<p class="note">이름과 비밀번호를 정하면 내 기록이 그 비밀번호로 잠겨서 이 기기에 저장돼요. 다음에 같은 비밀번호로 열면 모든 기록이 그대로 있어요.</p>
        <label>이름 <small>(내 기록을 구분하는 이름)</small><input type="text" id="gName" maxlength="20" autocomplete="username" placeholder="예: 민수"></label>
        <label>비밀번호 <small>(4자 이상)</small><input type="password" id="gPw" autocomplete="new-password" placeholder="비밀번호"></label>
        <label>비밀번호 확인<input type="password" id="gPw2" autocomplete="new-password" placeholder="한 번 더"></label>` +
        (Store.legacy() ? `<p class="note ok">이 기기에 이미 있는 기록은 새 계정으로 옮겨 드려요.</p>` : "");
    }
    g.innerHTML = `<form class="gatecard" id="gateForm" novalidate>
      <div class="glogo">핏플랜</div>
      <h1>${mode === "open" ? "비밀번호를 입력하세요" : "내 기록 보관함 만들기"}</h1>
      ${tabs}${body}
      <p class="err gerr" id="gErr" role="alert"></p>
      <button type="submit" class="primary" id="gGo">${mode === "open" ? "열기" : "시작하기"}</button>
      <p class="note gwarn">비밀번호를 잊으면 기록을 복구할 수 없어요. 기록은 서버로 보내지 않고 이 기기의 이 브라우저에만 저장됩니다. 다른 기기에서 쓰려면 '기록' 탭의 백업을 사용하세요.</p>
    </form>`;
    const pw = $("#gPw"); if (pw) pw.focus();
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function unlocked() {
    const g = $("#gate");
    g.hidden = true; g.innerHTML = "";
    document.body.classList.remove("locked");
    const who = $("#whoName"); if (who) who.textContent = session ? session.name : "";
    document.dispatchEvent(new CustomEvent("fit:unlocked"));
  }

  function wireGate() {
    const g = $("#gate");
    g.addEventListener("change", (e) => { if (e.target.name === "gateMode") { mode = e.target.value; renderGate(); } });
    g.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#gErr"), go = $("#gGo");
      err.textContent = "";
      const pw = $("#gPw").value;
      try {
        if (mode === "create") {
          const name = $("#gName").value.trim();
          if (!name) throw new Error("이름을 입력하세요.");
          if (pw.length < 4) throw new Error("비밀번호는 4자 이상으로 정해 주세요.");
          if (pw !== $("#gPw2").value) throw new Error("비밀번호 확인이 달라요.");
          go.disabled = true; go.textContent = "만드는 중…";
          const r = await create(name, pw);
          unlocked();
          if (r.migrated && root.App) App.toast("이 기기에 있던 기록을 새 계정으로 옮겼어요");
        } else {
          if (!pw) throw new Error("비밀번호를 입력하세요.");
          go.disabled = true; go.textContent = "여는 중…";
          await unlock($("#gId").value, pw);
          unlocked();
        }
      } catch (er) {
        err.textContent = er.message;
        go.disabled = false; go.textContent = mode === "open" ? "열기" : "시작하기";
      }
    });
    const lockBtn = $("#lockBtn"); if (lockBtn) lockBtn.addEventListener("click", lock);
    // 탭을 닫기 전에 마지막 변경을 저장
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    window.addEventListener("pagehide", () => { flush(); });
  }

  function init() {
    if (!document.getElementById("gate")) return; // 화면이 없는 환경(테스트 페이지 등)
    if (!supported) {
      // 암호화를 쓸 수 없는 환경: 보관함 없이 이 기기의 localStorage에 그대로 저장한다
      document.body.classList.remove("locked");
      const legacy = Store.legacy() || {};
      Store.attach(legacy, () => { try { localStorage.setItem("fitplan.data.v1", JSON.stringify(Store.data())); } catch (e) {} });
      const lb = $("#lockBtn"); if (lb) lb.hidden = true;
      document.dispatchEvent(new CustomEvent("fit:unlocked"));
      return;
    }
    wireGate();
    showGate();
  }

  root.Vault = { supported, init, lock, create, unlock, deleteCurrent, changePassword, profiles, current: () => session && { id: session.id, name: session.name }, _crypto: { deriveKey, encryptJSON, decryptJSON, idOf } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0)); else setTimeout(init, 0);
})(typeof window !== "undefined" ? window : globalThis);
