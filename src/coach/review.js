// 感想戦（段階3-1 設計書 4章・6章・7章）：分かれ目・判断で失った分・今日の課題・課題の結果を、指南の記録から決める。
// 画面に触らない。

const MISTAKE = new Set(['dubious', 'bad']);
const isMistake = (e) => MISTAKE.has(e.grade);

// 型の問いの順（課題が同点のときに先の問いを選ぶ）
const TASK_ORDER = ['speed', 'shape', 'value', 'safety', 'hand', 'threat', 'danger', 'compare'];

// 課題の目安の一言（24字以内）
export const TASK_TIPS = {
  speed: '受け入れ枚数の多い方を残す',
  shape: '両面が残る形を選ぶ',
  value: 'ドラと役を残して打点を上げる',
  safety: '危ない牌は早めに整理しておく',
  hand: '2向聴以下はほぼ降り、良形の聴牌は押す',
  threat: '親や2人の脅威には一段慎重に',
  danger: '現物と筋を先に探す',
  compare: '押す得と振り込む損を比べる',
};

// 分かれ目：疑問手・悪手のうち、卓を作り直せる（位置 at がある）ものを損の大きい順に n 件まで（同じ損なら先の判断から）
export function turningPoints(log, n = 5) {
  return log
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => isMistake(e) && Number.isInteger(e.at))
    .sort((a, b) => b.e.loss - a.e.loss || a.i - b.i)
    .slice(0, n)
    .map(({ e }) => e);
}

// 判断で失った分（約）：疑問手・悪手の損の合計と回数
export function lossTotal(log) {
  const out = { loss: 0, bad: 0, dubious: 0 };
  for (const e of log) {
    if (!isMistake(e)) continue;
    out.loss += e.loss || 0;
    out[e.grade]++;
  }
  return out;
}

// 今日の課題：疑問手・悪手の損を決め手の問い（right）ごとに足し、いちばん大きい問い。同じなら回数の多い方、
// それも同じなら型の順で先の問い。決め手の問いのない記録は数えない。返すもの：{ reason, tip } か null
export function chooseTask(log) {
  const sum = new Map();
  for (const e of log) {
    if (!isMistake(e) || !TASK_ORDER.includes(e.right)) continue;
    const s = sum.get(e.right) || { loss: 0, count: 0 };
    s.loss += e.loss || 0;
    s.count++;
    sum.set(e.right, s);
  }
  if (!sum.size) return null;
  const [reason] = [...sum.entries()].sort(([ra, a], [rb, b]) => b.loss - a.loss || b.count - a.count || TASK_ORDER.indexOf(ra) - TASK_ORDER.indexOf(rb))[0];
  return { reason, tip: TASK_TIPS[reason] };
}

// 課題の結果：課題の問いが決め手になった場面（記録の task）の数と、そのうち最善・許容の数
export function taskResult(log, task) {
  const scenes = log.filter((e) => e.task === true);
  return { scenes: scenes.length, correct: scenes.filter((e) => e.grade === 'best' || e.grade === 'ok').length };
}

// この局の判断（段階3-2 設計書 4章）：where（{ zhuangfeng, jushu, changbang }）の局の考えどころの数・最善と許容の数
// （半荘のまとめと同じく、ヒントを見た判断とはっきりした差がない判断は数えない）と、損のいちばん大きい疑問手・悪手の記録。
// その局の記録がなければ null
export function handJudgement(log, where) {
  const mine = log.filter((e) => e.zhuangfeng === where.zhuangfeng && e.jushu === where.jushu && e.changbang === where.changbang);
  if (!mine.length) return null;
  const counted = mine.filter((e) => !e.hinted && e.clear !== false);
  const worst = mine.filter(isMistake).sort((a, b) => b.loss - a.loss)[0] || null;
  return { total: counted.length, correct: counted.filter((e) => e.grade === 'best' || e.grade === 'ok').length, worst };
}
