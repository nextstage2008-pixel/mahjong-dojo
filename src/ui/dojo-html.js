// 道場の画面の HTML（段階4-1 作業6。ホールデム道場の screens/dojo.js・lecture.js・quiz.js と同じ並びを、縦持ちに積む）。
// 押せる所は data-dj="…"。文字は esc を通す
import { esc } from './table-html.js';
import { figureHTML, tilesHTML } from './dojo-figures.js';
import { CHAPTERS, EXPERIENCES, chapterLabel, chapterOf, PLAYABLE, ALL_CHAPTERS, PRACTICE_COUNT, TEST_COUNT, TEST_PASS, GRAD_COUNT, GRAD_PASS } from '../dojo/chapters.js';
import { chapterState, rankOf, dueCount, resumeTarget, gradState, isPassed } from '../dojo/progress.js';
import { lectureOf } from '../dojo/lectures/chapters.js';
import { tileName } from './view-model.js';

// 選択肢の言い方（文字か、牌の名前）
const sayChoice = (c) => c.text || (c.tiles || []).map(tileName).join('');

const STEP_SHORT = { lecture: '講', practice: '練', test: '試' };

// 道場の画面の形。selected：選んだ章（null なら続きの章か序章）。day：日の番号
export function buildDojoView(rec, selected, day) {
  // 続きが卒業試験なら卒業試験の段を選ぶ（段階4-2）
  const t = resumeTarget(rec);
  const sel = selected ?? (t?.kind === 'grad' ? 'grad' : t?.chapter) ?? PLAYABLE[0];
  const chapters = CHAPTERS.map((c) => {
    const st = chapterState(rec, c.id);
    const label = { passed: '合格', open: '', locked: '🔒', soon: '準備中' }[st.status];
    const steps = st.steps ? Object.keys(st.steps).map((k) => ({ short: STEP_SHORT[k], state: st.steps[k].done ? 'ok' : st.steps[k].open ? 'open' : '' })) : [];
    const clickable = c.playable || (c.id === 'grad' && st.status !== 'locked');
    return { id: c.id, seal: c.seal, title: c.title, ask: c.ask, status: st.status, label, steps, selected: c.id === sel, clickable };
  });
  const st = chapterState(rec, sel);
  const rows = st.steps ? [
    { key: 'lecture', name: '講義', sub: `めくり式・${lectureOf(sel).length}ページ` },
    { key: 'practice', name: '練習問題', sub: `${PRACTICE_COUNT}問・その場で答え合わせ` },
    { key: 'test', name: '章末試験', sub: `${TEST_COUNT}問・ヒントなし・${TEST_PASS}問正解で合格` },
  ].map((r, i) => ({ ...r, n: i + 1, state: st.steps[r.key].done ? 'ok' : st.steps[r.key].open ? 'open' : 'locked', note: st.steps[r.key].note })) : [];
  return {
    rank: rankOf(rec).label,
    reviews: dueCount(rec, day),
    chapters,
    picked: selected !== null && selected !== undefined,
    detail: { id: sel, heading: sel === 'grad' ? '卒業試験' : `${chapterLabel(sel)}　${st.meta.title}`, desc: st.meta.desc, rows, next: st.next, status: st.status, testOnly: st.testOnly, grad: sel === 'grad' ? gradInfo(rec) : null },
  };
}

// 卒業試験の段の材料（段階4-2）：最高点・合格した日・あと何章
function gradInfo(rec) {
  const g = gradState(rec);
  return { ...g, left: ALL_CHAPTERS.filter((id) => !isPassed(rec, id)).length };
}

function chapterRow(c) {
  const steps = c.steps.map((s) => `<i class="st ${s.state}">${s.short}</i>`).join('');
  const cls = ['dj-ch', c.selected && 'sel', c.status === 'soon' && 'off', c.status].filter(Boolean).join(' ');
  return `<div class="${cls}"${c.clickable ? ` data-dj="pick" data-ch="${c.id}"` : ''}>
    <span class="seal">${esc(c.seal)}</span><span class="tt">${esc(c.title)}<small>${esc(c.ask)}</small></span>
    <span class="steps">${steps}</span><span class="stt">${esc(c.label)}</span></div>`;
}

function gradDetailHTML(d) {
  const g = d.grad;
  const sub = `${GRAD_COUNT}問・ヒントなし・${GRAD_PASS}問正解で卒業`;
  const note = d.status === 'locked' ? `<p class="dj-soon">全10章に合格すると受けられます（あと${g.left}章）。</p>`
    : `<div class="dj-step ${d.status === 'passed' ? 'ok' : 'open'}"><span class="n">${d.status === 'passed' ? '✓' : '卒'}</span><span><b>卒業試験</b><small>${esc(sub)}</small></span><span class="r">${g.best != null ? `最高 ${g.best}点` : ''}</span></div>`;
  const go = d.next ? `<button class="btn primary dj-go" data-dj="grad">${esc(d.next.label)}</button>` : '';
  return `<div class="dj-det"><h5>${esc(d.heading)}</h5><p>${esc(d.desc)}</p>${note}${go}</div>`;
}

function detailHTML(d) {
  if (d.id === 'grad') return gradDetailHTML(d);
  if (d.status === 'soon') return `<div class="dj-det"><h5>${esc(d.heading)}</h5><p>${esc(d.desc)}</p><p class="dj-soon">この章は準備中です。</p></div>`;
  const rows = d.rows.map((r) => `<div class="dj-step ${r.state}"${r.state !== 'locked' ? ` data-dj="step" data-step="${r.key}"` : ''}>
      <span class="n">${r.state === 'ok' ? '✓' : r.n}</span><span><b>${r.name}</b><small>${esc(r.sub)}</small></span>
      <span class="r">${r.state === 'locked' ? '🔒' : esc(r.note)}</span></div>`).join('');
  const go = d.next ? `<button class="btn primary dj-go" data-dj="step" data-step="${d.next.kind}">${esc(d.next.label)}</button>` : '';
  const only = d.testOnly ? `<button class="btn dj-only" data-dj="only" data-ch="${d.id}">試験だけ受ける<small>受かればこの章は合格</small></button>` : '';
  return `<div class="dj-det"><h5>${esc(d.heading)}</h5><p>${esc(d.desc)}</p>${rows}${go}${only}</div>`;
}

// 縦持ちでは、選んだ章の中身を一覧の上に出す（一覧の下だと画面の外に出る。段階4-1 作業8）
export function dojoHTML(v) {
  return `<div class="dj">
  <div class="dj-bar"><button class="back" data-dj="title">◀ タイトル</button><h4>道 場</h4>
    <span class="dj-rank">${esc(v.rank)}</span>
    <button class="dj-rev" data-dj="review"${v.reviews ? '' : ' disabled'}>今日の復習 <em>${v.reviews}問</em></button></div>
  <div class="dj-body">${detailHTML(v.detail)}<div class="dj-chs">${v.chapters.map(chapterRow).join('')}</div></div>
</div>`;
}

// 初めて道場を開いたとき：麻雀の経験の3択
export function experienceHTML() {
  const buttons = EXPERIENCES.map((e) => `<button class="btn dj-exp" data-dj="exp" data-k="${e.key}"><b>${esc(e.label)}</b><small>${esc(e.note)}（${chapterLabel(e.start)}から）</small></button>`).join('');
  return `<div class="dj dj-first"><div class="dj-bar"><button class="back" data-dj="title">◀ タイトル</button><h4>道 場</h4></div>
  <div class="dj-firstbody"><h3>麻雀は打てますか？</h3><p>始める章をおすすめします。どの章も、章末試験だけ受けて合格すれば飛ばせます。</p>${buttons}</div></div>`;
}

// 講義の画面の形
export function buildLectureView(chapterId, page) {
  const pages = lectureOf(chapterId);
  const p = Math.max(0, Math.min(page, pages.length - 1));
  const data = pages[p];
  return {
    chapterId, page: p, count: pages.length, last: p === pages.length - 1,
    heading: `${chapterLabel(chapterId)}　${chapterOf(chapterId).title}`,
    title: data.title, text: data.text ?? [], key: data.key ?? null, summary: data.summary ?? null, figure: data.figure ?? null,
  };
}

export function lectureHTML(v, src) {
  const dots = Array.from({ length: v.count }, (_, i) => `<i${i === v.page ? ' class="on"' : ''}></i>`).join('');
  const body = v.summary
    ? `<ol class="dj-sum">${v.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
    : `<div class="dj-txt">${v.text.map((t) => `<p>${esc(t)}</p>`).join('')}</div>${v.key ? `<div class="dj-key"><strong>ここが大事</strong>${esc(v.key)}</div>` : ''}`;
  return `<div class="dj dj-lec">
  <div class="dj-bar"><button class="back" data-dj="dojo">◀ 道場</button><h4>講 義</h4><span class="dj-who">${esc(v.heading)}</span></div>
  <div class="dj-page">${figureHTML(v.figure, src)}<h6>${v.page + 1} / ${v.count}</h6><h3>${esc(v.title)}</h3>${body}</div>
  <div class="dj-nav"><button class="btn" data-dj="lec-prev"${v.page === 0 ? ' disabled' : ''}>◀ 前へ</button><span class="dots">${dots}</span>
    ${v.last ? '<button class="btn primary" data-dj="lec-done">練習問題へ ▶</button>' : '<button class="btn primary" data-dj="lec-next">次へ ▶</button>'}</div>
</div>`;
}

const MODE = { practice: '練習問題', review: '今日の復習', test: '章末試験', grad: '卒業試験' };
const exam = (mode) => mode === 'test' || mode === 'grad';

function choiceHTML(c, src) {
  if (c.tiles && c.tiles.length) {
    const scale = Math.min(1, 300 / (c.tiles.length * 26));
    return `<span class="dj-tiles">${tilesHTML(c.tiles, src, { scale })}</span>${c.text ? `<span>${esc(c.text)}</span>` : ''}`;
  }
  return esc(c.text);
}

// 問題の画面。v：{ mode, chapterId, index, total, correct, q（makeQuestion の結果）, chosen（選んだ番号か null）}
export function quizHTML(v, src) {
  const { q } = v;
  const head = v.mode === 'review' ? '今日の復習' : v.mode === 'grad' ? '全10章の総合問題' : `${chapterLabel(v.chapterId)}　${chapterOf(v.chapterId).title}`;
  const answered = v.chosen !== null;
  const showResult = answered && !exam(v.mode);
  const choices = q.choices.map((c, i) => {
    let cls = 'dj-op';
    if (showResult) cls += i === q.answer ? ' right' : i === v.chosen ? ' wrong' : ' dim';
    if (c.tiles && c.tiles.length > 1) cls += ' wide';
    return `<button class="${cls}" data-dj="choose" data-i="${i}"${answered ? ' disabled' : ''}>${choiceHTML(c, src)}${showResult && i === q.answer ? ' ✓' : ''}</button>`;
  }).join('');
  const ok = v.chosen === q.answer;
  const right = q.choices[q.answer];
  const rightText = right.tiles && right.tiles.length > 1 ? '' : sayChoice(right);
  const fb = showResult ? `<div class="dj-fb ${ok ? 'ok' : 'ng'}">
      <h4>${ok ? '正解！' : '残念…'}${rightText ? ` 正解は「${esc(rightText)}」` : ''}</h4>
      ${q.explain.map((e) => `<p>${esc(e)}</p>`).join('')}
      <button class="btn primary" data-dj="next">${v.index + 1 < v.total ? '次の問題へ ▶' : '終わる'}</button></div>` : '';
  const counter = exam(v.mode) ? '<span class="dj-cnt">ヒントも正誤も出ません</span>' : `<span class="dj-cnt">正解 ${v.correct}</span>`;
  return `<div class="dj dj-quiz">
  <div class="dj-bar"><button class="back" data-dj="dojo">◀ 道場</button><h4>${esc(MODE[v.mode])}</h4><span class="dj-who">${esc(head)}</span></div>
  <div class="dj-q"><div class="dj-qhead"><span>${v.index + 1} / ${v.total}</span>${counter}</div>
    ${figureHTML(q.figure, src)}<p class="dj-prompt">${esc(q.prompt)}</p>
    <div class="dj-ops">${choices}</div>${fb}</div>
</div>`;
}

// 間違えた問題の一覧（試験の結果に出す）。questions：makeQuestion の結果の列、results：gradeTest の results
export const wrongList = (questions, results) => results.map((x, k) => ({ x, k })).filter(({ x }) => !x.correct).map(({ x, k }) => {
  const q = questions[k];
  return { no: k + 1, prompt: q.prompt, figure: q.figure, chosen: sayChoice(q.choices[x.chosen] ?? { text: '' }), right: sayChoice(q.choices[q.answer]), why: q.explain };
});

// 試験の結果。v：{ grad（卒業試験か）, chapterId, score, passed, firstPass, rankBefore, rankAfter, opened, wrong }。src を渡すと間違えた問題の図も出す
export function testResultHTML(v, src = null) {
  const [count, pass] = v.grad ? [GRAD_COUNT, GRAD_PASS] : [TEST_COUNT, TEST_PASS];
  const head = v.passed ? `合格！ ${v.score} / ${count}問` : `不合格… ${v.score} / ${count}問（あと${pass - v.score}問）`;
  const rank = v.rankBefore !== v.rankAfter ? `<p class="dj-rankup">${esc(v.rankBefore)} → <b>${esc(v.rankAfter)}</b></p>` : '';
  const opened = v.grad ? (v.firstPass ? '<p class="dj-rankup">卒業です！ おめでとうございます。続きは指南なしの対局で腕を磨きましょう。</p>' : '') : v.opened ? `<p>${esc(chapterLabel(v.opened))}が開きました。</p>` : '';
  const wrong = v.wrong.map((w) => `<div class="dj-wrong-item"><b>${w.no}問目</b> ${esc(w.prompt)}${src && w.figure ? figureHTML(w.figure, src) : ''}<small>あなた：${esc(w.chosen)}・正解：${esc(w.right)}</small>${w.why.map((e) => `<p>${esc(e)}</p>`).join('')}</div>`).join('');
  return `<div class="dj dj-result">
  <div class="dj-bar"><button class="back" data-dj="dojo">◀ 道場</button><h4>${v.grad ? '卒業試験の結果' : '章末試験の結果'}</h4><span class="dj-who">${v.grad ? '全10章' : esc(chapterLabel(v.chapterId))}</span></div>
  <div class="dj-res ${v.passed ? 'ok' : 'ng'}"><h3>${esc(head)}</h3>${rank}${opened}
    ${v.wrong.length ? `<h5>間違えた問題（今日の復習に入れました）</h5>${wrong}` : '<p>全問正解です。</p>'}
    <button class="btn primary" data-dj="dojo">道場に戻る</button></div>
</div>`;
}

// 道場の記録を消す確かめの窓
export function dojoClearConfirmHTML() {
  return `<div class="confirm-layer"><div class="confirm" role="dialog" aria-modal="true">
  <p>道場の記録を消しますか？<small>章の進み具合・級・今日の復習が消えます。元に戻せません。</small></p>
  <div class="row"><button class="btn" data-dj="clear-no">やめる</button><button class="btn primary" data-dj="clear-yes">消す</button></div>
</div></div>`;
}
