// 問題集の画面（段階3-3 設計書 4章〜8章）：今日の問題・種類ごと・傾向・成績の推移を出し、選んだ5問を感想戦と同じ問い直し
// （ui/question.js）で順に解かせ、解いた結果を復習の段と日に当てて保存する。卓は書庫の半荘から作り直す（作り直せない問題は飛ばす）。
import { problemsHomeHTML, problemBarHTML, problemAskHTML, problemVerdictHTML, problemResultHTML, prevLineOf } from './problems-html.js';
import { createQuestion } from './question.js';
import { pickToday, pickByKind, pickByTendency, recentEntries, answer, titleOf, isPending, GROUPS, groupOf, dayOf } from '../coach/problems.js';
import { tendencies, countable, tendencyOf, TENDENCIES } from '../coach/tendency.js';

const GROUP_NAME = { choice: '何切る', riichi: 'リーチ', pushfold: '押し引き', call: '鳴き' };
const TYPE_NAME = { speed: '速さ', shape: '形', value: '打点', pushfold: '押し引き', call: '鳴き', riichi: 'リーチ' };
const DISCARD = new Set(['choice', 'off']);
// 傾向を出すのに要る、数える判断の数
const ENOUGH = 20;

// その問題の傾向：その向きに間違えた傾向。なければ（何切る以外は）その傾向が起きうる場面の傾向。何切るの正解は傾向なし
export function tendencyIdOf(entry) {
  const miss = TENDENCIES.find((t) => tendencyOf(entry, t.id).miss);
  if (miss) return miss.id;
  if (DISCARD.has(entry.kind)) return null;
  const chance = TENDENCIES.find((t) => tendencyOf(entry, t.id).chance);
  return chance ? chance.id : null;
}

// 推移：直近20半荘の「ヒント」「なし」の段の判断の正答率・理由の正答率と、型ごとの正解の数
function trendOf(history) {
  const recent = history.slice(-20);
  const points = [];
  const byType = {};
  for (const h of recent) {
    const s = h.summary || {};
    const parts = [s.hint, s.none].filter(Boolean);
    const dec = parts.reduce((a, x) => a + x.decisions, 0);
    if (!dec) continue;
    const asked = parts.reduce((a, x) => a + x.asked, 0);
    points.push({ rate: parts.reduce((a, x) => a + x.correct, 0) / dec, reasonRate: asked ? parts.reduce((a, x) => a + x.reasonOk, 0) / asked : null });
    for (const x of parts) {
      for (const [k, [n, ok]] of Object.entries(x.byType || {})) {
        byType[k] = byType[k] || { n: 0, ok: 0 };
        byType[k].n += n;
        byType[k].ok += ok;
      }
    }
  }
  return { points, byType: Object.entries(byType).filter(([, v]) => v.n > 0).map(([k, v]) => ({ name: TYPE_NAME[k] || k, ...v })) };
}

// root：画面（問題集の画面と、解く画面の卓をここに描く）。store：保存（loadStudy・saveStudy）。run：試し。
// onClose()：閉じたとき。onSaved()：保存したとき（失敗の知らせを出すため）
export function createProblemsUI({ root, art, run, store, me, now = () => new Date(), onClose = () => {}, onSaved = () => {} }) {
  const src = (c, v) => art.src(c, v);
  let question = null;
  let disposed = false;

  const stop = () => {
    if (question) question.dispose();
    question = null;
  };

  // 問題集の画面
  function home() {
    stop();
    const state = store.loadStudy();
    const day = dayOf(now());
    const entries = recentEntries(state, 20);
    const tl = tendencies(entries);
    const enough = entries.filter(countable).length >= ENOUGH;
    const today = pickToday(state.problems, day, enough ? tl.slice(0, 3).map((t) => t.id) : []);
    const kinds = Object.keys(GROUPS).map((g) => {
      const ps = state.problems.filter((p) => groupOf(p) === g);
      return { group: g, name: GROUP_NAME[g], open: ps.filter(isPending).length, mastered: ps.filter((p) => p.mastered).length, total: ps.length };
    });
    root.innerHTML = `<div class="settings-layer problems-layer">${problemsHomeHTML({ today: today.length, kinds, tendencies: tl, trend: trendOf(state.history), enough })}</div>`;
    const on = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    on('[data-pb="today"]', () => start(today));
    on('[data-pb="kind"]', (b) => start(pickByKind(state.problems, b.dataset.g, day)));
    on('[data-pb="tendency"]', (b) => start(pickByTendency(state.problems, b.dataset.t, day)));
    on('[data-pb="close"]', () => {
      disposed = true;
      onClose();
    });
  }

  // 選んだ問題を順に解く
  function start(list) {
    if (!list.length) return home();
    stop();
    root.innerHTML = '<div class="mj rv pb"><div class="mj-top"></div><div class="mj-feltbox"><div class="mj-felt"></div></div><div class="mj-band"><div class="cbox"></div><span class="msg"></span></div><div class="mj-acts"><span class="btns"></span></div><div class="mj-me"></div><div class="mj-bottom rv-bottom"></div><div class="mj-overlay"></div></div>';
    const mj = root.querySelector('.mj');
    const $ = (s) => mj.querySelector(s);
    const bar = $('.mj-bottom');
    const overlay = $('.mj-overlay');
    question = createQuestion({ root: mj, els: { top: $('.mj-top'), felt: $('.mj-felt'), band: $('.mj-band'), meEl: $('.mj-me') }, src, run, me });
    const archive = store.loadStudy().archive;
    const results = [];
    let i = -1;

    const next = () => {
      i++;
      if (disposed) return;
      if (i >= list.length) return result();
      const p = list[i];
      const game = archive.find((g) => g.id === p.gameId);
      // 書庫にない（捨てた）半荘の問題は飛ばす
      if (!game) return next();
      const title = titleOf(p.entry);
      const prev = prevLineOf(p);
      const tid = tendencyIdOf(p.entry);
      const tendency = tid ? { name: TENDENCIES.find((t) => t.id === tid).name } : null;
      bar.innerHTML = problemBarHTML({ index: i, count: list.length, title });
      bar.querySelector('[data-pb="quit"]').addEventListener('click', home);
      question.ask({
        record: { seed: game.seed, cast: game.cast, rules: game.rules, log: game.log },
        entry: p.entry,
        askHTML: () => problemAskHTML({ title, prev }),
        verdictHTML: ({ mine, before, ok }) => problemVerdictHTML({ mine, before, ok, tendency }),
        onGraded: ({ ok, key, mine }) => {
          // 解いた結果を復習の段と日に当てて保存する
          const st = store.loadStudy();
          const k = st.problems.findIndex((x) => x.id === p.id);
          if (k >= 0) {
            st.problems[k] = answer(st.problems[k], ok, dayOf(now()), { chosen: key, grade: mine ? mine.grade : ok ? 'ok' : 'bad' });
            store.saveStudy(st);
            onSaved();
          }
          results.push({ p, ok });
          bar.innerHTML = problemBarHTML({ index: i, count: list.length, title, next: i === list.length - 1 ? '結果へ' : '次へ' });
          bar.querySelector('[data-pb="quit"]').addEventListener('click', home);
          bar.querySelector('[data-pb="next"]').addEventListener('click', next);
        },
        // 卓を作り直せない問題は飛ばす
        onError: next,
      });
    };

    const result = () => {
      stop();
      const byTendency = [];
      for (const r of results) {
        const id = tendencyIdOf(r.p.entry);
        if (!id) continue;
        let row = byTendency.find((x) => x.id === id);
        const t = TENDENCIES.find((x) => x.id === id);
        if (!row) byTendency.push((row = { id, name: t.name, tip: t.tip, n: 0, ok: 0 }));
        row.n++;
        if (r.ok) row.ok++;
      }
      overlay.innerHTML = problemResultHTML({ total: results.length, correct: results.filter((r) => r.ok).length, byTendency });
      overlay.classList.add('show');
      overlay.querySelector('[data-pb="home"]').addEventListener('click', home);
    };

    next();
  }

  home();
  return {
    dispose() {
      disposed = true;
      stop();
    },
  };
}
