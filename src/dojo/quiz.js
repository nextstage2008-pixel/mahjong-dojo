// 出題の組み立てと試験の採点（ホールデム道場の quiz.js と同じ）。練習10問・試験20問を、その章の型を均等に混ぜて
// 「型と種」の列で返す（問題そのものは questions/index.js の makeQuestion で作る）
import { chapterOf, ALL_CHAPTERS, PRACTICE_COUNT, TEST_COUNT, TEST_PASS, GRAD_PER_CHAPTER } from './chapters.js';
import { createRng, shuffleInPlace } from '../core/rng.js';
import { sceneSlotOf } from './questions/index.js';

export function questionList(chapterId, seed, count) {
  const { types } = chapterOf(chapterId);
  if (!types.length) throw new Error(`問題のない章: ${chapterId}`);
  const rng = createRng(seed >>> 0);
  const order = shuffleInPlace(Array.from({ length: count }, (_, i) => types[i % types.length]), rng);
  return withSeeds(order, rng);
}

// 型の並びに種を付ける。一覧から出す型は、同じ場面（一覧の番号）が重なったら種を引き直す（最後のレビューの直し）
function withSeeds(types, rng) {
  const used = new Set();
  return types.map((type) => {
    let seed = Math.floor(rng() * 2147483647);
    for (let t = 0; t < 64 && used.has(sceneSlotOf(type, seed)); t++) seed = Math.floor(rng() * 2147483647);
    const slot = sceneSlotOf(type, seed);
    if (slot) used.add(slot);
    return { type, seed };
  });
}

export const practiceList = (chapterId, seed) => questionList(chapterId, seed, PRACTICE_COUNT);
export const testList = (chapterId, seed) => questionList(chapterId, seed, TEST_COUNT);

// 卒業試験の出題（段階4-2。ホールデム道場の graduationList と同じ考え）：全10章から3問ずつ（章の中は型を均等に）・並びはランダム
export function graduationList(seed) {
  const rng = createRng((seed ^ 0x6a09e667) >>> 0);
  const items = [];
  for (const id of ALL_CHAPTERS) {
    const { types } = chapterOf(id);
    if (!types.length) throw new Error(`問題のない章: ${id}`);
    const start = Math.floor(rng() * types.length);
    for (let i = 0; i < GRAD_PER_CHAPTER; i++) items.push(types[(start + i) % types.length]);
  }
  return shuffleInPlace(withSeeds(items, rng), rng);
}

// 試験の採点。questions：makeQuestion の結果の列、answers：選んだ番号の列、pass：合格の数
export function gradeTest(questions, answers, pass = TEST_PASS) {
  if (questions.length !== answers.length) throw new Error('答えの数が合わない');
  const results = questions.map((q, i) => ({ type: q.type, seed: q.seed, correct: answers[i] === q.answer, chosen: answers[i] }));
  const score = results.filter((x) => x.correct).length;
  return { score, passed: score >= pass, results };
}
