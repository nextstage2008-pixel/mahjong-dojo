// 記録から読み取る進み具合（段階4 設計書 5章・7章）：章の開き方・段の開き方・次にすること・級・今日の復習・続きから。
import { CHAPTERS, PLAYABLE, ALL_CHAPTERS, EXPERIENCES, chapterLabel, PRACTICE_COUNT, TEST_COUNT } from './chapters.js';
import { dueToday } from './reviews.js';

const chapterRec = (rec, id) => rec.chapters[id] ?? null;
export const isPassed = (rec, id) => !!chapterRec(rec, id)?.passedAt;

// 勧めた章（経験を選ぶ前は序章）
const startOf = (rec) => EXPERIENCES.find((e) => e.key === rec.experience)?.start ?? 'prologue';

// 級（設計書 7章）：合格0章は「入門」、合格した章の数 n で (11 − n) 級（序章合格で10級、全10章で1級）。飛ばした章は数えない
// 全10章に合格して卒業したら「1級・卒業」（段階4-2。段位は 4-3）
export function rankOf(rec) {
  const passed = ALL_CHAPTERS.filter((id) => isPassed(rec, id)).length;
  const label = passed ? `${11 - passed}級` : '入門';
  return { passed, label: passed === ALL_CHAPTERS.length && rec.graduation?.passedAt != null ? `${label}・卒業` : label };
}

// 卒業試験の状態（段階4-2。ホールデム道場と同じ）：open（全10章に合格）・passed・passedAt（最初に合格した日）・best（最高点）・
// inProgress（途中なら答えた数・なければ null）
export function gradState(rec) {
  const g = rec.graduation ?? { test: null, best: null, passedAt: null };
  return {
    open: ALL_CHAPTERS.every((id) => isPassed(rec, id)),
    passed: g.passedAt != null,
    passedAt: g.passedAt ?? null,
    best: g.best ?? null,
    inProgress: g.test ? g.test.answers.length : null,
  };
}

// 卒業試験の次にすること（開いていなければ null）
function gradNext(g) {
  if (!g.open) return null;
  if (g.inProgress !== null) return { kind: 'grad', label: `卒業試験の続き（${g.inProgress + 1}問目から）` };
  return { kind: 'grad', label: g.passed ? 'もう一度受ける' : '卒業試験を受ける' };
}

// 章が開く条件：遊べる章で、前の章に合格した・その章の記録がある（手をつけた章は閉じない）・経験で勧めた章の並び以下、のどれか
export function isOpen(rec, id) {
  const k = PLAYABLE.indexOf(id);
  if (k < 0) return false;
  if (k === 0 || chapterRec(rec, id) || isPassed(rec, PLAYABLE[k - 1])) return true;
  return k <= PLAYABLE.indexOf(startOf(rec));
}

// 章ごとの状態。status：'soon'（準備中）・'locked'・'open'・'passed'。steps：講義・練習・試験それぞれの { open, done, note }。
// testOnly：「試験だけ受ける」を出すか（遊べる章で、まだ合格していなくて、試験の段が開いていない）。next：次にすること
export function chapterState(rec, id) {
  const meta = CHAPTERS.find((x) => x.id === id);
  if (!meta) throw new Error(`知らない章: ${id}`);
  if (id === 'grad') {
    const g = gradState(rec);
    return { id, meta, status: g.passed ? 'passed' : g.open ? 'open' : 'locked', passed: g.passed, steps: null, testOnly: false, next: gradNext(g) };
  }
  if (!meta.playable) return { id, meta, status: 'soon', passed: false, steps: null, testOnly: false, next: null };
  const open = isOpen(rec, id);
  const c = chapterRec(rec, id);
  const passed = isPassed(rec, id);
  const lectureDone = !!c?.lectureDone;
  const practiceDone = !!c?.practiceDone;
  const page = c?.lecturePage ?? 0;
  const steps = {
    lecture: { open, done: lectureDone, note: lectureDone ? '読んだ' : page ? `${page + 1}ページ目から` : '' },
    practice: { open: open && lectureDone, done: practiceDone, note: c?.practice ? `${c.practice.index} / ${PRACTICE_COUNT}` : practiceDone ? '解いた' : '' },
    test: { open: open && practiceDone, done: passed, note: c?.test ? `${c.test.answers.length} / ${TEST_COUNT}` : c?.testBest != null ? `最高 ${c.testBest}点` : '' },
  };
  let next = null;
  if (c?.test) next = { kind: 'test', label: `章末試験の続き（${c.test.answers.length + 1}問目から）` };
  else if (open) {
    if (!lectureDone) next = { kind: 'lecture', label: page ? `講義の続き（${page + 1}ページ目から）` : '講義を読む' };
    else if (c?.practice) next = { kind: 'practice', label: `練習問題の続き（${c.practice.index + 1}問目から）` };
    else if (!practiceDone) next = { kind: 'practice', label: '練習問題を解く' };
    else if (!passed) next = { kind: 'test', label: '章末試験を受ける' };
    else next = { kind: 'practice', label: 'もう一度練習する' };
  }
  const status = passed ? 'passed' : open ? 'open' : 'locked';
  return { id, meta, status, passed, steps, testOnly: !passed && !steps.test.open, next };
}

// 今日の復習の数
export const dueCount = (rec, day) => dueToday(rec.reviews, day).length;

// 続きから：最後にしていたことが途中ならその続き。なければ最初の合格していない開いた章の次にすること。
// day を渡したときは、今日の復習がなければ復習へは行かない。全部合格なら null
export function resumeTarget(rec, day = null) {
  const r = rec.resume;
  if (r?.kind === 'review' && (day === null || dueToday(rec.reviews, day).length > 0)) return { kind: 'review', chapter: null, label: '今日の復習' };
  const g = gradState(rec);
  if (g.inProgress !== null && (r?.kind === 'grad' || g.open)) return { kind: 'grad', chapter: null, label: `卒業試験の続き（${g.inProgress + 1}問目から）` };
  if (r && r.kind !== 'review' && PLAYABLE.includes(r.chapter)) {
    const c = rec.chapters[r.chapter];
    const inProgress = { lecture: isOpen(rec, r.chapter) && !c?.lectureDone, practice: !!c?.practice, test: !!c?.test }[r.kind];
    if (inProgress) {
      const step = { lecture: '講義', practice: '練習問題', test: '章末試験' }[r.kind];
      return { kind: r.kind, chapter: r.chapter, label: `${chapterLabel(r.chapter)}・${step}` };
    }
    // 前回の章がまだ合格していなければ、その章の次にすること（最後のレビューの直し。ホールデムと同じ）
    const st = chapterState(rec, r.chapter);
    if (st.status === 'open' && st.next) return { kind: st.next.kind, chapter: r.chapter, label: `${chapterLabel(r.chapter)}・${st.next.label}` };
  }
  // 前回がなければ、勧めた章から先の合格していない開いた章（なければ前の章も探す）
  const from = PLAYABLE.indexOf(startOf(rec));
  const free = (id) => isOpen(rec, id) && !isPassed(rec, id);
  const first = PLAYABLE.slice(from).find(free) ?? PLAYABLE.find(free);
  // 開いた章が全部合格：全10章に合格して卒業していなければ卒業試験（卒業したら続きからはない）
  if (!first) return g.open && !g.passed ? { kind: 'grad', chapter: null, label: '卒業試験' } : null;
  const st = chapterState(rec, first);
  return { kind: st.next.kind, chapter: first, label: `${chapterLabel(first)}・${st.next.label}` };
}
