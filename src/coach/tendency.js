// 傾向と成績の推移（段階3-3 設計書 6章・7章）：指南の記録から、どちらへ間違えやすいか（傾向）と、
// 半荘ごとの正答率の要約を数える。画面に触らない。
import { RULES } from './explain.js';
import { TASK_TIPS } from './review.js';

const isMistake = (e) => e.grade === 'bad' || e.grade === 'dubious';
const isCorrect = (e) => e.grade === 'best' || e.grade === 'ok';
const DISCARD = new Set(['choice', 'off']);
const PUSHFOLD = new Set(['pushfold', 'pfoff']);
const CALL = new Set(['call', 'calloff']);
const isFold = (key) => typeof key === 'string' && key.endsWith('!');
const isRiichi = (key) => typeof key === 'string' && key.endsWith('*');
const folded = (e) => !!(e.facts && e.facts.folded === true);

// 傾向と成績に数える判断：指南「ヒント」「なし」の段だけ（先生が決めた）。ヒントの表を開いた判断・はっきりした差がない判断は数えない
export function countable(e) {
  return (e.level === 'hint' || e.level === 'none') && !e.hinted && e.clear !== false;
}

// 傾向。chance：その傾向が起きうる場面か。miss：その向きに間違えたか（chance のうち）。tip：直す目安（確かめ済みの文だけ）
export const TENDENCIES = [
  { id: 'push', name: '押しすぎ', chance: (e) => PUSHFOLD.has(e.kind) && isFold(e.best), miss: (e) => isMistake(e) && !folded(e), tip: `${RULES.fold2}。${RULES.oneShanten}` },
  { id: 'fold', name: '降りすぎ', chance: (e) => PUSHFOLD.has(e.kind) && !isFold(e.best), miss: (e) => isMistake(e) && folded(e), tip: RULES.pushGood },
  { id: 'callMore', name: '鳴きすぎ', chance: (e) => CALL.has(e.kind) && e.best === 'skip', miss: (e) => isMistake(e) && e.chosen !== 'skip', tip: RULES.callMenzen },
  { id: 'callLess', name: '鳴かなすぎ', chance: (e) => CALL.has(e.kind) && e.best !== 'skip', miss: (e) => isMistake(e) && e.chosen === 'skip', tip: RULES.callSpeed },
  { id: 'riichiMore', name: 'リーチしすぎ', chance: (e) => e.kind === 'riichi' && !isRiichi(e.best), miss: (e) => isMistake(e) && isRiichi(e.chosen), tip: RULES.damaBig },
  { id: 'damaMore', name: 'ダマにしすぎ', chance: (e) => e.kind === 'riichi' && isRiichi(e.best), miss: (e) => isMistake(e) && !isRiichi(e.chosen), tip: RULES.riichi },
  { id: 'speed', name: '速さを落とす', chance: (e) => DISCARD.has(e.kind), miss: (e) => isMistake(e) && e.right === 'speed', tip: TASK_TIPS.speed },
  { id: 'shape', name: '形を崩す', chance: (e) => DISCARD.has(e.kind), miss: (e) => isMistake(e) && e.right === 'shape', tip: TASK_TIPS.shape },
  { id: 'value', name: '打点を手放す', chance: (e) => DISCARD.has(e.kind), miss: (e) => isMistake(e) && e.right === 'value', tip: TASK_TIPS.value },
  // 手の形の印（段階3-3 から記録に書く。印のない前の記録は機会にも数えない）
  { id: 'ryanmen', name: '両面を崩しやすい', chance: (e) => DISCARD.has(e.kind) && Array.isArray(e.tags), miss: (e) => isMistake(e) && e.tags.includes('ryanmen'), tip: RULES.shape },
  { id: 'honor', name: '浮いた字牌を残しすぎ', chance: (e) => DISCARD.has(e.kind) && Array.isArray(e.tags), miss: (e) => isMistake(e) && e.tags.includes('honor'), tip: RULES.isolated },
  { id: 'dora', name: 'ドラを早く手放す', chance: (e) => DISCARD.has(e.kind) && Array.isArray(e.tags), miss: (e) => isMistake(e) && e.tags.includes('dora'), tip: RULES.value },
];

// その判断が当たる傾向（機会と間違い）
export function tendencyOf(e, id) {
  const t = TENDENCIES.find((x) => x.id === id);
  if (!t || !t.chance(e)) return { chance: false, miss: false };
  return { chance: true, miss: t.miss(e) };
}

// 傾向の一覧：間違いが1回以上ある傾向を、損の合計の大きい順（同じなら間違いの多い順・一覧の順）。
// 返すもの：[{ id, name, chances, misses, loss, tip }]
export function tendencies(entries) {
  const list = entries.filter(countable);
  return TENDENCIES.map((t, order) => {
    const chances = list.filter(t.chance);
    const misses = chances.filter(t.miss);
    return { id: t.id, name: t.name, chances: chances.length, misses: misses.length, loss: misses.reduce((a, e) => a + (e.loss || 0), 0), tip: t.tip, order };
  })
    .filter((t) => t.misses > 0)
    .sort((a, b) => b.loss - a.loss || b.misses - a.misses || a.order - b.order)
    .map(({ order, ...t }) => t);
}

// 判断の型（推移の型ごとの得意と苦手）：何切るは決め手の問い、ほかは種類
function typeOf(e) {
  if (DISCARD.has(e.kind)) return ['speed', 'shape', 'value'].includes(e.right) ? e.right : null;
  if (PUSHFOLD.has(e.kind)) return 'pushfold';
  if (CALL.has(e.kind)) return 'call';
  if (e.kind === 'riichi') return 'riichi';
  return null;
}

// 半荘の推移の要約：指南の段ごとに { decisions, correct, asked, reasonOk, byType: { 型: [回数, 正解] } }。
// はっきりした差がある判断だけ。ヒントの表を開いた判断は数えない
export function summarize(entries) {
  const empty = () => ({ decisions: 0, correct: 0, asked: 0, reasonOk: 0, byType: { speed: [0, 0], shape: [0, 0], value: [0, 0], pushfold: [0, 0], call: [0, 0], riichi: [0, 0] } });
  const out = { all: empty(), hint: empty(), none: empty() };
  for (const e of entries) {
    if (e.clear === false || e.hinted) continue;
    const s = out[e.level] || out.all;
    s.decisions++;
    if (isCorrect(e)) s.correct++;
    if (e.asked) s.asked++;
    if (e.reasonOk === true) s.reasonOk++;
    const t = typeOf(e);
    if (t) {
      s.byType[t][0]++;
      if (isCorrect(e)) s.byType[t][1]++;
    }
  }
  return out;
}
