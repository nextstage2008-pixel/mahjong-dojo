// 道場の記録を進める操作（段階4 設計書 5章）。どれも記録を書き換えず、新しい記録を返す（保存は画面の側がする）。
// day：日の番号（coach/problems.js の dayOf）
import { emptyChapter } from './record.js';
import { PRACTICE_COUNT, TEST_COUNT, PLAYABLE, EXPERIENCES } from './chapters.js';
import { chapterState, rankOf } from './progress.js';
import { addMistake, answerReview } from './reviews.js';

function withChapter(rec, id, fn) {
  if (!PLAYABLE.includes(id)) throw new Error(`遊べない章: ${id}`);
  return { ...rec, chapters: { ...rec.chapters, [id]: fn({ ...(rec.chapters[id] ?? emptyChapter()) }) } };
}

function mustOpen(rec, id, step) {
  const st = chapterState(rec, id);
  if (!st.steps || !st.steps[step].open) throw new Error(`${id} の ${step} はまだ開いていない`);
}

// 麻雀の経験を選ぶ（選び直しでも合格や途中は消さない）
export function chooseExperience(rec, key) {
  if (!EXPERIENCES.some((e) => e.key === key)) throw new Error(`知らない経験: ${key}`);
  return { ...rec, experience: key };
}

// 講義のページをめくった（page は 0 から）。最後のページを開いたら読み終えた扱い
export function turnLecture(rec, id, page, pageCount) {
  mustOpen(rec, id, 'lecture');
  const p = Math.max(0, Math.min(page, pageCount - 1));
  const next = withChapter(rec, id, (c) => ({ ...c, lecturePage: p, lectureDone: c.lectureDone || p === pageCount - 1 }));
  return { ...next, resume: { kind: 'lecture', chapter: id } };
}

export function startPractice(rec, id, seed) {
  mustOpen(rec, id, 'practice');
  const next = withChapter(rec, id, (c) => ({ ...c, practice: { seed, index: 0, correct: 0 } }));
  return { ...next, resume: { kind: 'practice', chapter: id } };
}

// 練習で1問答えた。q：{ type, seed }。10問目を答えたら解き終えた扱い。間違えた問題は今日の復習へ
export function answerPractice(rec, id, q, correct, day) {
  const cur = rec.chapters[id]?.practice;
  if (!cur) throw new Error('練習を始めていない');
  const index = cur.index + 1;
  const done = index >= PRACTICE_COUNT;
  const next = withChapter(rec, id, (c) => ({
    ...c, practice: done ? null : { ...cur, index, correct: cur.correct + (correct ? 1 : 0) }, practiceDone: c.practiceDone || done,
  }));
  return { ...next, reviews: correct ? rec.reviews : addMistake(rec.reviews, q, day), resume: { kind: 'practice', chapter: id } };
}

// 試験を始める。only：試験だけ受ける（段の関門を見ない。遊べる章だけ）。途中の試験があっても新しい種で最初から
export function startTest(rec, id, seed, { only = false } = {}) {
  if (!only) mustOpen(rec, id, 'test');
  const next = withChapter(rec, id, (c) => ({ ...c, test: { seed, answers: [], only } }));
  return { ...next, resume: { kind: 'test', chapter: id } };
}

export function answerTest(rec, id, choice) {
  const cur = rec.chapters[id]?.test;
  if (!cur) throw new Error('試験を始めていない');
  if (cur.answers.length >= TEST_COUNT) throw new Error('試験はもう答え終えた');
  return withChapter(rec, id, (c) => ({ ...c, test: { ...cur, answers: [...cur.answers, choice] } }));
}

// 試験を終えた。graded：quiz.js の gradeTest の結果。返す値：{ record, firstPass, rankBefore, rankAfter, opened（新しく開いた章か null）}
export function finishTest(rec, id, graded, day) {
  const cur = rec.chapters[id]?.test;
  if (!cur || cur.answers.length !== TEST_COUNT) throw new Error('試験をまだ答え終えていない');
  const before = rankOf(rec);
  const wasPassed = !!rec.chapters[id]?.passedAt;
  let reviews = rec.reviews;
  for (const r of graded.results) if (!r.correct) reviews = addMistake(reviews, r, day);
  let next = withChapter(rec, id, (c) => ({
    ...c, test: null, testBest: Math.max(c.testBest ?? 0, graded.score), passedAt: c.passedAt ?? (graded.passed ? day : null),
  }));
  next = { ...next, reviews, resume: null };
  const firstPass = graded.passed && !wasPassed;
  const k = PLAYABLE.indexOf(id);
  const opened = firstPass && k + 1 < PLAYABLE.length && !rec.chapters[PLAYABLE[k + 1]]?.passedAt ? PLAYABLE[k + 1] : null;
  return { record: next, firstPass, rankBefore: before, rankAfter: rankOf(next), opened };
}

// 復習で1問答えた
export function answerReviewQuestion(rec, q, correct, day) {
  return { ...rec, reviews: answerReview(rec.reviews, q, correct, day), resume: { kind: 'review', chapter: null } };
}
