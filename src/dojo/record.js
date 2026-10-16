// 道場の記録の形（段階4 設計書 8章）。空の記録と、読み込んだ記録の直し（壊れた所は空に）。保存先には触らない。
// 日は coach/problems.js の dayOf（暦の日の番号）で持つ
import { CHAPTERS, EXPERIENCES, TEST_COUNT, PRACTICE_COUNT, GRAD_COUNT } from './chapters.js';
import { QUESTION_TYPES } from './questions/index.js';

// 版2（段階4-2）：卒業試験の欄を足した。版1の記録は章・復習・経験をそのまま読み、卒業試験を空にする
export const DOJO_VERSION = 2;
const READABLE = [1, 2];
const RESUME_KINDS = ['lecture', 'practice', 'test', 'review', 'grad'];
const REVIEW_STEPS = 3;
// 選択肢は4つまで（答えは 0〜3 の番号）
const MAX_CHOICES = 4;

export function emptyChapter() {
  // practice：解いている途中 { seed, index, correct }。test：受けている途中 { seed, answers（選んだ番号の列）, only（試験だけ受ける）}
  return { lecturePage: 0, lectureDone: false, practice: null, practiceDone: false, test: null, testBest: null, passedAt: null };
}

export function emptyDojo() {
  // experience：麻雀の経験（EXPERIENCES の key）。reviews：今日の復習 { type, seed, step（0〜2）, due（日の番号）}。
  // resume：最後にしていたこと { kind, chapter }（復習・卒業試験は chapter: null）。
  // graduation：卒業試験 { test（受けている途中 { seed, answers }）, best（最高点）, passedAt（最初に合格した日）}
  return { ver: DOJO_VERSION, experience: null, chapters: {}, reviews: [], resume: null, graduation: emptyGraduation() };
}

export const emptyGraduation = () => ({ test: null, best: null, passedAt: null });

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const nat = (x) => Number.isInteger(x) && x >= 0;
const natOr = (x, d) => (nat(x) ? x : d);

function practiceOf(p) {
  if (!isObj(p) || !nat(p.seed) || !nat(p.index) || !nat(p.correct) || p.index >= PRACTICE_COUNT || p.correct > p.index) return null;
  return { seed: p.seed, index: p.index, correct: p.correct };
}

function testOf(t) {
  // 答えの列に不正な値がある（取り除くと後ろの答えがずれる）・答え終えている（途中ではない）試験は、途中ごと捨てる（最後のレビューの直し）
  if (!isObj(t) || !nat(t.seed) || !Array.isArray(t.answers)) return null;
  if (!t.answers.every((x) => nat(x) && x < MAX_CHOICES) || t.answers.length >= TEST_COUNT) return null;
  return { seed: t.seed, answers: t.answers.slice(), only: t.only === true };
}

// 卒業試験の欄（壊れた途中は捨てる。最高点・合格日は正しければ残す）
function graduationOf(g) {
  if (!isObj(g)) return emptyGraduation();
  const t = g.test;
  const test = isObj(t) && nat(t.seed) && Array.isArray(t.answers) && t.answers.every((x) => nat(x) && x < MAX_CHOICES) && t.answers.length < GRAD_COUNT
    ? { seed: t.seed, answers: t.answers.slice() } : null;
  return { test, best: nat(g.best) && g.best <= GRAD_COUNT ? g.best : null, passedAt: nat(g.passedAt) ? g.passedAt : null };
}

function chapterRec(c) {
  if (!isObj(c)) return emptyChapter();
  return {
    lecturePage: natOr(c.lecturePage, 0),
    lectureDone: c.lectureDone === true,
    practice: practiceOf(c.practice),
    practiceDone: c.practiceDone === true,
    test: testOf(c.test),
    testBest: nat(c.testBest) && c.testBest <= TEST_COUNT ? c.testBest : null,
    passedAt: nat(c.passedAt) ? c.passedAt : null,
  };
}

// 読み込んだ記録を正しい形にそろえる（いつも新しい記録を返す）
export function normalizeDojo(raw) {
  if (!isObj(raw) || !READABLE.includes(raw.ver)) return emptyDojo();
  const ids = new Set(CHAPTERS.map((c) => c.id));
  const chapters = {};
  if (isObj(raw.chapters)) for (const [id, c] of Object.entries(raw.chapters)) if (ids.has(id) && id !== 'grad') chapters[id] = chapterRec(c);
  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews.filter((v) => isObj(v) && QUESTION_TYPES.includes(v.type) && nat(v.seed) && nat(v.step) && v.step < REVIEW_STEPS && nat(v.due))
      .map((v) => ({ type: v.type, seed: v.seed, step: v.step, due: v.due }))
    : [];
  const r = raw.resume;
  const resume = isObj(r) && RESUME_KINDS.includes(r.kind) && (r.chapter === null || Object.hasOwn(chapters, r.chapter)) ? { kind: r.kind, chapter: r.chapter } : null;
  return {
    ver: DOJO_VERSION,
    experience: EXPERIENCES.some((e) => e.key === raw.experience) ? raw.experience : null,
    chapters,
    reviews,
    resume,
    graduation: raw.ver === 1 ? emptyGraduation() : graduationOf(raw.graduation),
  };
}
