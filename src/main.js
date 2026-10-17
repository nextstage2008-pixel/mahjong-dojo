// 入口：始めの画面・設定・対局を切り替え、対局の途中を保存する。
// ?auto=1 で自動で打つ（画面の確かめ用）。?speed=0.2 で動きを速く。?seed=数字 で牌山を決める。
// ?debug=1 で対局の中身を window.__mj に出す（画面の確かめの台本が使う）。
import { loadTileArt } from './ui/tile-art.js';
import { createAudio, bindUnlock } from './ui/audio.js';
import { createVoiceBook } from './ui/voices.js';
import { createStore } from './ui/storage.js';
import { titleHTML, settingsHTML, noticeHTML, SAVE_FAILED, resetConfirmHTML, studyClearConfirmHTML, profileCardHTML } from './ui/screens-html.js';
import { profileOf, voiceOfAvatar, profilePatch } from './core/profile.js';
import { savePreset, deletePreset } from './ui/storage.js';
import { normalizeRules, STANDARD_RULES } from './core/rule.js';
import { createTableUI } from './ui/table-ui.js';
import { LAND, landLayout, isPortraitWindow } from './ui/stage.js';
import { createMatch } from './core/match.js';
import { pickCast } from './core/cast.js';
import { freshSeed } from './core/rng.js';
import { createRunner } from './coach/runner.js';
import { createCoachSession } from './coach/session.js';
import { createReviewUI } from './ui/review-ui.js';
import { modelHand } from './core/samewall.js';
import { handJudgement } from './coach/review.js';
import { handNoteHTML } from './ui/result-html.js';
import { ingest, recordAnswer, dayOf } from './coach/problems.js';
import { createProblemsUI } from './ui/problems-ui.js';
import { createDojoUI } from './ui/dojo-ui.js';
import { dojoClearConfirmHTML } from './ui/dojo-html.js';
import { rankOf, dueCount } from './dojo/progress.js';
import { BUILD } from './ui/build-info.js';
import { isSafariTab, isInAppBrowser, shouldPersist, requestPersist, HOME_HOWTO, INAPP_HOWTO } from './ui/keep-record.js';
import { aboutHTML } from './ui/about-html.js';

// 公開（公開の設計書 4章）：記録を消されにくくする設定を頼む・iPhone の Safari のタブか・PWA の窓口（公開版だけ。src/pwa/register.js が置く）
const ENV = {
  userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0,
  standalone: navigator.standalone === true, displayStandalone: !!window.matchMedia?.('(display-mode: standalone)').matches,
};
if (shouldPersist(ENV)) requestPersist(navigator.storage);
const SAFARI_TAB = isSafariTab(ENV);
const IN_APP = isInAppBrowser(ENV);
const PWA = window.__mahjongPWA ?? null;

const stage = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const auto = params.get('auto') === '1';
const speed = Math.max(0.05, Number(params.get('speed')) || 1);

// 画面（横 760×340）を、安全な余白（ノッチ）の内側に収めて真ん中に置き、拡大・縮小する。
// 窓が縦長なら「スマホを横にしてください」の案内を出す（画面の作り直しの設計書 4章）
let currentScale = 1;
const insetProbe = document.createElement('div');
insetProbe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(insetProbe);
const insets = () => {
  const c = getComputedStyle(insetProbe);
  const n = (v) => parseFloat(v) || 0;
  return { top: n(c.paddingTop), right: n(c.paddingRight), bottom: n(c.paddingBottom), left: n(c.paddingLeft) };
};
const rotateHint = document.createElement('div');
rotateHint.className = 'rotate-hint';
rotateHint.innerHTML = '<div><b>📱↻</b><p>スマホを横にしてください</p></div>';
rotateHint.hidden = true;
document.body.appendChild(rotateHint);
function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const l = landLayout(w, h, insets());
  currentScale = l.scale;
  stage.style.width = `${LAND.w}px`;
  stage.style.height = `${LAND.h}px`;
  stage.style.left = `${l.left}px`;
  stage.style.top = `${l.top}px`;
  stage.style.transform = `scale(${currentScale})`;
  rotateHint.hidden = !isPortraitWindow(w, h);
}
fit();
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', fit);

function storageArea() {
  try {
    const k = '__mj_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
}

const store = createStore(storageArea());
let settings = store.loadSettings();

// 保存に失敗したら、画面の上に一度だけ知らせる（何度も出すと打つ邪魔になる）
let warnedSave = false;
function warnIfSaveFailed() {
  if (!store.takeFailure() || warnedSave) return;
  warnedSave = true;
  document.body.insertAdjacentHTML('beforeend', noticeHTML(SAVE_FAILED));
  const el = document.body.lastElementChild;
  setTimeout(() => el.remove(), 8000);
}
const audio = createAudio();
audio.setSilentPlay(settings.silentPlay);
bindUnlock(document, audio);

stage.innerHTML = '<div class="loading">読み込み中…</div>';
const [art, manifest] = await Promise.all([
  loadTileArt(),
  fetch('assets/voice/manifest.json').then((r) => r.json()),
]);
const voices = createVoiceBook(manifest);
let current = null; // 対局中のもの { m, ui, save }

if (auto) startMatch(null);
else showTitle();

function showTitle() {
  current = null;
  // 問題集（段階3-3）：問題があればボタン。復習の日が来た問題の数を添える
  const study = store.loadStudy();
  const day = dayOf(new Date());
  const due = study.problems.filter((p) => !p.mastered && p.tries.length && p.due <= day).length;
  // 道場（段階4）：記録があれば級と今日の復習の数（記録がなくても「道場で学ぶ」は出す）
  const dj = store.loadDojo();
  const dojo = dj.experience || Object.keys(dj.chapters).length ? { label: rankOf(dj).label, due: dueCount(dj, day) } : null;
  PWA?.check();
  stage.innerHTML = titleHTML({ canResume: !!store.loadMatch(), rules: settings.rules, canReview: !!store.loadLast(), study: study.problems.length ? { due } : null, dojo, build: BUILD, update: !!PWA?.hasUpdate(), safariTab: SAFARI_TAB, inApp: IN_APP });
  const upd = stage.querySelector('[data-act="update"]');
  if (upd) upd.addEventListener('click', () => PWA?.apply());
  const howto = stage.querySelector('[data-act="home-howto"]');
  if (howto) howto.addEventListener('click', () => showHowto(HOME_HOWTO));
  const inapp = stage.querySelector('[data-act="inapp-howto"]');
  if (inapp) inapp.addEventListener('click', () => showHowto(INAPP_HOWTO));
  // 名前とアバターの札をまだ出していなければ、対局の前に1回だけ出す（画面の作り直し 段3。後で決めるでも出したことにする）
  const withProfile = (fn) => (settings.profileAsked ? fn() : askProfile(stage, { first: true }, fn));
  // はじめから：途中の対局と、前の半荘（感想戦の記録）を消す
  const fresh = () => withProfile(() => { store.clearMatch(); store.clearLast(); startMatch(null); });
  // 途中の対局があれば、押し間違いで消さないよう確かめる
  stage.querySelector('[data-act="new"]').addEventListener('click', () => {
    if (!store.loadMatch()) return fresh();
    stage.insertAdjacentHTML('beforeend', resetConfirmHTML());
    const layer = stage.lastElementChild;
    layer.querySelector('[data-act="reset-yes"]').addEventListener('click', fresh);
    layer.querySelector('[data-act="reset-no"]').addEventListener('click', () => layer.remove());
  });
  const resume = stage.querySelector('[data-act="resume"]');
  if (resume) resume.addEventListener('click', () => withProfile(() => startMatch(store.loadMatch())));
  stage.querySelector('[data-act="settings"]').addEventListener('click', () => showSettings(stage, false, showTitle));
  const reviewLast = stage.querySelector('[data-act="review-last"]');
  if (reviewLast) reviewLast.addEventListener('click', () => { const r = store.loadLast(); if (r) showReview(r); else showTitle(); });
  const problems = stage.querySelector('[data-act="problems"]');
  if (problems) problems.addEventListener('click', showProblems);
  stage.querySelector('[data-act="dojo"]').addEventListener('click', showDojo);
}

// 名前とアバターの札（画面の作り直し 段3）。host の上に重ねる。first：はじめての対局の前（「後で決める」）。
// done：決めた・後で決めたのあと（設定から開いて「戻る」なら呼ばない）
function askProfile(host, { first }, done) {
  // 二重に開かない（キーボードの Enter で後ろのボタンをもう一度押せてしまうため）
  if (host.querySelector('.profile-layer')) return;
  host.insertAdjacentHTML('beforeend', profileCardHTML({ name: settings.playerName, avatar: settings.avatar, first }));
  const layer = host.lastElementChild;
  const before = settings.avatar;
  let avatar = before;
  layer.querySelectorAll('[data-av]').forEach((b) => b.addEventListener('click', () => {
    avatar = b.dataset.av || null;
    // 絵を選ぶと声も決まる：その人の声で「リーチ」を鳴らす（「なし」は鳴らさない）
    if (avatar) { audio.unlock(); audio.play(voices.male(voiceOfAvatar(avatar), 'riichi')); }
    layer.querySelectorAll('[data-av]').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
  }));
  const close = (patch) => {
    if (patch) {
      settings = { ...settings, ...patch };
      store.saveSettings(settings);
      warnIfSaveFailed();
    }
    layer.remove();
  };
  layer.querySelector('[data-pf="ok"]').addEventListener('click', () => {
    // 絵を変えたときだけ、自分の声もその人の声にする（profilePatch）
    close(profilePatch({ input: layer.querySelector('[data-pf-name]').value, avatar, before }));
    done();
  });
  const later = layer.querySelector('[data-pf="later"]');
  if (later) later.addEventListener('click', () => { close({ profileAsked: true }); done(); });
  const cancel = layer.querySelector('[data-pf="cancel"]');
  if (cancel) cancel.addEventListener('click', () => close(null));
  // 開いたら名前の欄へ（後ろのボタンを選んだまま残さない）
  layer.querySelector('[data-pf-name]').focus();
}

// やり方の札（iPhone の Safari のタブ：ホーム画面に追加／アプリの中のブラウザ：Safari・Chrome で開く）
function showHowto(h) {
  stage.insertAdjacentHTML('beforeend', `<div class="confirm-layer"><div class="confirm" role="dialog" aria-modal="true"><p>${h.title}</p><div class="howto">${h.body}</div><div class="row"><button class="btn primary" data-act="howto-close">閉じる</button></div></div></div>`);
  const layer = stage.lastElementChild;
  layer.querySelector('[data-act="howto-close"]').addEventListener('click', () => layer.remove());
}
// 新しい版が待ちに入ったら、タイトルの画面なら描き直す（知らせの1行を出す）
// 設定・このゲームについて・確かめの窓を開いているときは描き直さない（開いているものを消さない。閉じてタイトルに戻るときに知らせが出る）
PWA?.onChange(() => { if (!current && stage.querySelector('.title') && !stage.querySelector('.settings-layer, .confirm-layer')) showTitle(); });

// 画面の上に少しのあいだ出す知らせ
function notify(text) {
  document.body.insertAdjacentHTML('beforeend', noticeHTML(text));
  const el = document.body.lastElementChild;
  setTimeout(() => el.remove(), 4000);
}

// 道場（段階4）：講義・練習問題・章末試験
function showDojo() {
  current = null;
  createDojoUI({ root: stage, src: (c, v) => art.src(c, v), store, onClose: showTitle, onSaved: warnIfSaveFailed, notify });
}

// 問題集（段階3-3）：問題集の画面と、選んだ問題を解く画面。試しは裏の作業場所で動かす
function showProblems() {
  current = null;
  const runner = createRunner();
  createProblemsUI({
    root: stage,
    art,
    run: runner.run,
    store,
    me: profileOf(settings),
    onClose: () => { runner.dispose(); showTitle(); },
    onSaved: warnIfSaveFailed,
  });
}

// 感想戦（段階3-1）：前の半荘の分かれ目を問い直す。試しは裏の作業場所で動かす。決まった今日の課題を保存する
function showReview(record) {
  current = null;
  stage.innerHTML = '<div class="mj rv"></div>';
  const runner = createRunner();
  createReviewUI({
    root: stage.querySelector('.mj'),
    art,
    record,
    run: runner.run,
    me: profileOf(settings),
    prevTask: record.task,
    onTask: (t) => { store.saveTask({ reason: t.reason }); warnIfSaveFailed(); },
    onClose: () => { runner.dispose(); showTitle(); },
    onPractice: (from, done) => showPractice(record, from, done),
    // 選び直しも、その問題を解いた記録に入れる（段階3-3）
    onAnswered: ({ at, ok, chosen, grade }) => {
      if (!record.savedAt) return;
      store.saveStudy(recordAnswer(store.loadStudy(), record.savedAt, at, ok, dayOf(new Date()), { chosen, grade }));
      warnIfSaveFailed();
    },
  });
}

// 打ち直し（段階3-2 設計書 6章）：感想戦の画面の上に対局の画面を重ね、記録をその場面まで再生して局の終わりまで打つ。
// 指南なし・保存なし（本番の半荘の点数・成績・前の半荘の記録・課題に触らない）。局が終わったら done(増減) で感想戦へ戻る
function showPractice(record, { at, startDefen }, done) {
  const layer = document.createElement('div');
  layer.className = 'mj practice';
  stage.appendChild(layer);
  let m2 = null;
  let ended = false;
  const finish = (delta) => {
    if (ended) return;
    ended = true;
    if (m2) m2.stop();
    ui2.dispose();
    layer.remove();
    if (delta !== null) done(delta);
  };
  const ui2 = createTableUI({
    root: layer, art, audio, voices, cast: record.cast, speed,
    coach: null,
    matchSeed: record.seed,
    getSettings: () => settings,
    scale: () => currentScale,
    // 下の段の「打ち直しをやめる」で感想戦に戻る
    onMenu: (what) => { if (what === 'quit') finish(null); },
    practice: { startDefen, onEnd: (delta) => finish(delta) },
  });
  m2 = createMatch({ seed: record.seed, cast: record.cast, rules: record.rules, agent: ui2.agent, saved: record.log.map((a) => a.slice(0, at)) });
  m2.human.view = ui2.view;
  ui2.attach(m2.human, m2.recorder.replaying);
  m2.recorder.onLive = () => ui2.goLive();
  m2.start();
}

// 設定の画面。host の中に出し、閉じたら onClose
function showSettings(host, inGame, onClose) {
  const box = document.createElement('div');
  box.className = 'settings-layer';
  host.appendChild(box);
  const apply = (patch) => {
    settings = { ...settings, ...patch };
    store.saveSettings(settings);
    warnIfSaveFailed();
    audio.setSilentPlay(settings.silentPlay);
  };
  // 組み合わせの保存・呼び出し・消すのあとは、画面を描き直す（読んでいた場所はそのまま）
  const render = () => {
    const top = box.scrollTop;
    box.innerHTML = settingsHTML(settings, { inGame });
    box.scrollTop = top;
    bind();
  };
  render();
  function bind() {
    box.querySelectorAll('input[name="maleVoice"]').forEach((r) => r.addEventListener('change', () => {
      apply({ maleVoice: r.value });
      if (r.value !== 'none') audio.play(voices.male(r.value, 'riichi'));
    }));
    box.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      audio.unlock();
      audio.play(voices.male(b.dataset.sample, ['riichi', 'ron', 'tsumo'][Math.floor(Math.random() * 3)]));
    }));
    box.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const v = b.dataset.v;
      const seg = g.dataset.seg;
      // ルールの5項目（段階2-3）：赤ドラは数、喰いタン・オカは on/off、ほかは文字のまま
      if (seg.startsWith('rule.')) {
        const k = seg.slice(5);
        const value = k === 'red' ? Number(v) : k === 'kuitan' || k === 'oka' ? v === 'on' : v;
        apply({ rules: normalizeRules({ ...settings.rules, [k]: value }) });
      } else if (['chatter', 'coachLevel'].includes(seg)) apply({ [seg]: v });
      else apply({ [seg]: v === 'on' });
    }));
    box.querySelector('[data-act="rules-standard"]').addEventListener('click', () => {
      apply({ rules: { ...STANDARD_RULES } });
      render();
    });
    box.querySelector('[data-act="preset-save"]').addEventListener('click', () => {
      const name = box.querySelector('[data-preset-name]').value;
      apply({ presets: savePreset(settings.presets, name, settings.rules) });
      render();
    });
    box.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      const p = settings.presets.find((x) => x.name === b.dataset.preset);
      if (p) apply({ rules: normalizeRules(p.rules) });
      render();
    }));
    box.querySelectorAll('[data-preset-del]').forEach((b) => b.addEventListener('click', () => {
      apply({ presets: deletePreset(settings.presets, b.dataset.presetDel) });
      render();
    }));
    // 問題集と成績を消す（段階3-3）：確かめてから。確かめの窓は、流れる設定の画面の中でなく画面全体の上に重ねる（流した先でも見えるように）
    box.querySelector('[data-act="study-clear"]').addEventListener('click', () => {
      host.insertAdjacentHTML('beforeend', studyClearConfirmHTML());
      const layer = host.lastElementChild;
      layer.querySelector('[data-act="study-yes"]').addEventListener('click', () => { store.clearStudy(); layer.remove(); });
      layer.querySelector('[data-act="study-no"]').addEventListener('click', () => layer.remove());
    });
    // 道場（段階4）：経験を選び直す（次に開くと聞き直す。合格や途中は消さない）・記録を消す（確かめてから）
    box.querySelector('[data-act="dojo-exp"]').addEventListener('click', () => {
      store.saveDojo({ ...store.loadDojo(), experience: null });
      warnIfSaveFailed();
      notify('次に道場を開くと、麻雀の経験を聞き直します。');
    });
    box.querySelector('[data-act="dojo-clear"]').addEventListener('click', () => {
      host.insertAdjacentHTML('beforeend', dojoClearConfirmHTML());
      const layer = host.lastElementChild;
      layer.querySelector('[data-dj="clear-yes"]').addEventListener('click', () => { store.clearDojo(); layer.remove(); notify('道場の記録を消しました。'); });
      layer.querySelector('[data-dj="clear-no"]').addEventListener('click', () => layer.remove());
    });
    // 名前とアバター（画面の作り直し 段3）：決めたら設定の画面を描き直す
    box.querySelector('[data-act="profile"]').addEventListener('click', () => askProfile(host, { first: false }, render));
    // このゲームについて（公開）
    box.querySelector('[data-act="about"]').addEventListener('click', () => {
      host.insertAdjacentHTML('beforeend', aboutHTML(BUILD));
      const layer = host.lastElementChild;
      layer.querySelector('[data-act="about-close"]').addEventListener('click', () => layer.remove());
    });
    box.querySelector('[data-act="close"]').addEventListener('click', () => { box.remove(); onClose(); });
  }
}

function startMatch(saved) {
  const seed = saved ? saved.seed : params.get('seed') ? Number(params.get('seed')) >>> 0 : freshSeed();
  const cast = saved ? saved.cast : pickCast(seed);
  // 続きからは始めたときのルールで打つ（あとで設定を変えても変わらない。段階2-3）
  const rules = saved ? saved.rules : settings.rules;
  const type = rules.length;
  stage.innerHTML = '<div class="mj"></div>';
  const root = stage.querySelector('.mj');
  // 指南（段階2-1）：試しは裏の作業場所で動かす。続きからはそれまでの記録を引き継ぐ。自動で打つときは出さない
  const runner = auto ? null : createRunner();
  // 今日の課題（段階3-1）：始めたときの課題で、決め手が同じ場面を帯に知らせる（設定で消せる）
  const task = store.loadTask();
  const coach = runner ? createCoachSession({ run: runner.run, getLevel: () => settings.coachLevel, log: saved && saved.coach ? saved.coach.slice() : [], getTask: () => task, getTaskNotice: () => settings.taskNotice }) : null;
  const ui = createTableUI({
    root, art, audio, voices, cast, auto, speed, coach,
    matchSeed: seed,
    getSettings: () => settings,
    setCoachLevel: (level) => {
      settings = { ...settings, coachLevel: level };
      store.saveSettings(settings);
      warnIfSaveFailed();
    },
    scale: () => currentScale,
    // 自分への知らせの何番目か（感想戦で卓を作り直すため）
    getPosition: () => m.recorder.log[0].length,
    // 局の結果の画面の「この局」（段階3-2）：この局の判断と、同じ山のお手本の結果。設定で消せる・指南のない対局では出さない
    getHandNote: ({ start, where, mine }) => {
      if (!coach || !settings.handReview || start === null) return null;
      const model = modelHand({ seed, cast, rules, log: m.recorder.snapshot() }, start);
      return handNoteHTML({ judgement: handJudgement(coach.log, where), mine, model });
    },
    onMenu: (what) => {
      if (what === 'settings') showSettings(root, true, () => ui.coachLevelChanged());
      if (what === 'title') { saveNow(); m.stop(); ui.dispose(); if (runner) runner.dispose(); showTitle(); }
    },
  });
  const m = createMatch({
    seed, cast, rules, agent: ui.agent, saved: saved ? saved.log : null,
    onEnd: (paipu) => {
      // やめた対局の終局で、今の対局の保存を消さない
      if (!current || current.m !== m) return;
      if (runner) runner.dispose();
      store.clearMatch();
      if (auto) return startMatch(null);
      // 前の半荘として残す（感想戦のため。段階3-1）
      // savedAt は前の半荘と問題集の書庫で同じ名前にする（感想戦の選び直しを問題の記録に入れるため。段階3-3）
      const record = { seed, cast, rules, log: m.recorder.snapshot(), coach: coach ? coach.log : [], defen: paipu.defen, task, savedAt: new Date().toISOString() };
      store.saveLast(record);
      // 問題集（段階3-3）：判断が分かれた場面を問題に、半荘を書庫に、推移の要約を足す（指南のある対局だけ）
      if (coach) store.saveStudy(ingest(store.loadStudy(), record, dayOf(new Date())));
      warnIfSaveFailed();
      if (ui.endChoice() === 'review') showReview(store.loadLast() || { ...record, task: task ? { reason: task.reason } : null });
      else showTitle();
    },
  });
  m.human.view = ui.view;
  ui.attach(m.human, m.recorder.replaying);
  m.recorder.onLive = () => ui.goLive();
  let timer = null;
  let rounds = m.recorder.completeRounds();
  const saveNow = () => {
    if (!current || current.m !== m) return;
    clearTimeout(timer);
    timer = null;
    store.saveMatch({ seed, cast, type, rules, log: m.recorder.snapshot(), coach: coach ? coach.log : [] });
    warnIfSaveFailed();
  };
  m.recorder.onReply = () => {
    const n = m.recorder.completeRounds();
    if (n === rounds) return;
    rounds = n;
    if (!timer) timer = setTimeout(saveNow, 400);
  };
  current = { m, ui, saveNow };
  if (params.get('debug') === '1') window.__mj = { match: m };
  m.start();
}

window.addEventListener('pagehide', () => { if (current) current.saveNow(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && current) current.saveNow(); });
