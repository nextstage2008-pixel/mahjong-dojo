// 道場の操作係（段階4-1 作業7）：道場の画面（経験の3択・章の一覧・講義・問題・結果）を切り替え、操作のたびに記録を保存する。
// 記録の変え方はすべて dojo/actions.js に任せ、ここでは記録を組み立てない。
// root：画面。src(code, view)：牌の絵。store：storage.js の createStore。onClose：タイトルへ。onSaved：保存の失敗を知らせる。
// notify(text)：画面の上に少しのあいだ出す知らせ。now：今の日時（日を進めて確かめるときに差し替える）
import { freshSeed } from '../core/rng.js';
import { dayOf } from '../coach/problems.js';
import { PRACTICE_COUNT, EXPERIENCES, chapterLabel } from '../dojo/chapters.js';
import { resumeTarget, chapterState } from '../dojo/progress.js';
import * as A from '../dojo/actions.js';
import { dueToday } from '../dojo/reviews.js';
import { practiceList, testList, gradeTest } from '../dojo/quiz.js';
import { cachedQuestion } from '../dojo/questions/index.js';
import { lectureOf } from '../dojo/lectures/chapters.js';
import { createClickGate } from './click-gate.js';
import { buildDojoView, dojoHTML, experienceHTML, buildLectureView, lectureHTML, quizHTML, testResultHTML, wrongList } from './dojo-html.js';

export function createDojoUI({ root, src, store, onClose = () => {}, onSaved = () => {}, notify = () => {}, now = () => new Date() }) {
  let rec = store.loadDojo();
  let screen = null;
  const day = () => dayOf(now());
  const newSeed = () => freshSeed() >>> 1;
  const commit = (next) => {
    rec = next;
    store.saveDojo(rec);
    onSaved();
  };
  const questionAt = (list, i) => cachedQuestion(list[i]);
  // 答えの選択肢の押しは、描いた直後とダブルクリックの2回目を受けない
  const gate = createClickGate();

  const layer = document.createElement('div');
  layer.className = 'dojo-layer';
  root.innerHTML = '';
  root.appendChild(layer);

  function show(next) {
    screen = next;
    render();
  }
  function render() {
    const s = screen;
    if (s.name === 'first') layer.innerHTML = experienceHTML();
    else if (s.name === 'dojo') layer.innerHTML = dojoHTML(buildDojoView(rec, s.selected ?? null, day()));
    else if (s.name === 'lecture') layer.innerHTML = lectureHTML(buildLectureView(s.ch, s.page), src);
    else if (s.name === 'quiz') layer.innerHTML = quizHTML({ mode: s.mode, chapterId: s.ch, index: s.index, total: s.list.length, correct: s.correct, q: s.q, chosen: s.chosen }, src);
    else if (s.name === 'result') layer.innerHTML = testResultHTML(s.view, src);
    layer.scrollTop = 0;
    gate.arm(performance.now());
  }
  // 道場の画面（選んだ章。省けば続きの章）
  const toDojo = (selected = null) => show({ name: 'dojo', selected: selected ?? screen?.ch ?? resumeTarget(rec)?.chapter ?? null });

  function goStep(ch, kind) {
    const st = chapterState(rec, ch);
    const c = rec.chapters[ch];
    if (kind === 'test' && c?.test) return goTest(ch, { only: c.test.only });
    if (!st.steps || !st.steps[kind]?.open) return toDojo(ch);
    if (kind === 'lecture') {
      const count = lectureOf(ch).length;
      const page = c?.lectureDone ? 0 : c?.lecturePage ?? 0;
      commit(A.turnLecture(rec, ch, page, count));
      show({ name: 'lecture', ch, page });
    } else if (kind === 'practice') {
      if (!c?.practice) commit(A.startPractice(rec, ch, newSeed()));
      const p = rec.chapters[ch].practice;
      const list = practiceList(ch, p.seed);
      show({ name: 'quiz', mode: 'practice', ch, list, index: p.index, correct: p.correct, chosen: null, q: questionAt(list, p.index) });
    } else if (kind === 'test') goTest(ch);
  }

  // 章末試験（only：試験だけ受ける）。途中があれば続きから
  function goTest(ch, { only = false } = {}) {
    if (!rec.chapters[ch]?.test) commit(A.startTest(rec, ch, newSeed(), { only }));
    const t = rec.chapters[ch].test;
    const list = testList(ch, t.seed);
    show({ name: 'quiz', mode: 'test', ch, list, index: t.answers.length, correct: 0, chosen: null, q: questionAt(list, t.answers.length) });
  }

  function startReview() {
    const list = dueToday(rec.reviews, day()).map(({ type, seed }) => ({ type, seed }));
    if (!list.length) return notify('今日の復習はありません。');
    show({ name: 'quiz', mode: 'review', ch: null, list, index: 0, correct: 0, chosen: null, q: questionAt(list, 0) });
  }

  function choose(i) {
    const s = screen;
    if (s.chosen !== null) return;
    const item = s.list[s.index];
    const ok = i === s.q.answer;
    if (s.mode === 'practice') commit(A.answerPractice(rec, s.ch, item, ok, day()));
    if (s.mode === 'review') commit(A.answerReviewQuestion(rec, item, ok, day()));
    if (s.mode === 'test') {
      commit(A.answerTest(rec, s.ch, i));
      if (s.index + 1 < s.list.length) return show({ ...s, index: s.index + 1, q: questionAt(s.list, s.index + 1) });
      return finishTest(s);
    }
    show({ ...s, chosen: i, correct: s.correct + (ok ? 1 : 0) });
  }

  function nextQuestion() {
    const s = screen;
    if (s.index + 1 < s.list.length) return show({ ...s, index: s.index + 1, chosen: null, q: questionAt(s.list, s.index + 1) });
    if (s.mode === 'practice') {
      toDojo(s.ch);
      notify(`練習問題を解き終えました（${PRACTICE_COUNT}問中 ${s.correct}問正解）。章末試験を受けられます。`);
    } else {
      toDojo(null);
      notify(`今日の復習は終わりです（${s.list.length}問中 ${s.correct}問正解）。`);
    }
  }

  function finishTest(s) {
    const questions = s.list.map(cachedQuestion);
    const graded = gradeTest(questions, rec.chapters[s.ch].test.answers);
    const r = A.finishTest(rec, s.ch, graded, day());
    commit(r.record);
    show({ name: 'result', ch: s.ch, view: { chapterId: s.ch, score: graded.score, passed: graded.passed, firstPass: r.firstPass, rankBefore: r.rankBefore.label, rankAfter: r.rankAfter.label, opened: r.opened, wrong: wrongList(questions, graded.results) } });
  }

  function turn(delta) {
    const s = screen;
    const count = lectureOf(s.ch).length;
    const page = Math.max(0, Math.min(s.page + delta, count - 1));
    commit(A.turnLecture(rec, s.ch, page, count));
    show({ ...s, page });
  }

  layer.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dj]');
    if (!b || b.disabled) return;
    const act = b.dataset.dj;
    if ((act === 'choose' || act === 'next') && !gate.accept(performance.now(), e.detail)) return;
    if (act === 'title') onClose();
    else if (act === 'exp') {
      commit(A.chooseExperience(rec, b.dataset.k));
      toDojo(EXPERIENCES.find((x) => x.key === b.dataset.k).start);
      notify(`${chapterLabel(EXPERIENCES.find((x) => x.key === b.dataset.k).start)}から始めましょう。`);
    } else if (act === 'pick') show({ name: 'dojo', selected: b.dataset.ch });
    else if (act === 'step') goStep(buildDojoView(rec, screen.selected ?? null, day()).detail.id, b.dataset.step);
    else if (act === 'only') goTest(b.dataset.ch, { only: true });
    else if (act === 'review') startReview();
    else if (act === 'dojo') toDojo(screen.ch ?? screen.selected ?? null);
    else if (act === 'lec-prev') turn(-1);
    else if (act === 'lec-next') turn(1);
    else if (act === 'lec-done') { turn(0); goStep(screen.ch, 'practice'); }
    else if (act === 'choose') choose(Number(b.dataset.i));
    else if (act === 'next') nextQuestion();
  });

  // 開いたとき：経験が未選択なら3択、そうでなければ章の一覧（続きの章を選んだ状態）
  if (!rec.experience) show({ name: 'first' });
  else toDojo(null);

  return {
    dispose() { layer.remove(); },
  };
}
