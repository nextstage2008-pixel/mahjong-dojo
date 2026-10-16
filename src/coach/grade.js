// 採点（設計書 4.4）と正しい理由（4.5）、成績のまとめ（5.6）。
import { summaryOf, diffOf } from './sim.js';
import { groupOf } from './spot.js';

// 判定の線引き。50点・300点は最初の値（通しの試験で配分を見て直す。設計書 4.4）
export const GRADE = { seK: 2, okPoints: 50, badPoints: 300 };
export const GRADE_NAME = { best: '最善', ok: '許容', dubious: '疑問手', bad: '悪手' };
export const REASON_NAME = {
  speed: '①速さ', shape: '②形', value: '③打点', safety: '④安全',
  // 押し引きの型（段階2-2 設計書 3.3）
  hand: '①自分の手', threat: '②相手の脅威', danger: '③牌の危なさ', compare: '④比べる',
};
export const isCorrect = (grade) => grade === 'best' || grade === 'ok';

const plain = (key) => key.replace(/[*!]/g, '');

// 試した候補のうち、あなたの候補にあたるもの（同じ組なら代表の数字を使う。リーチの '*' は残す）
export function simKeyOf(sim, spot, chosen) {
  // 押し引き：降りる牌と同じ牌を切ったら、押す（その牌）と降りる（!）の良い方をあなたの判断とみる（どちらのつもりか分からないため）
  const fk = plain(chosen) + '!';
  if (spot.spot === 'pushfold' && !chosen.endsWith('*') && sim.keys.includes(fk)) {
    const g = groupOf(spot, plain(chosen));
    const push = sim.keys.includes(plain(chosen)) ? plain(chosen) : g && sim.keys.includes(g.rep.key) ? g.rep.key : null;
    if (!push) return fk;
    return summaryOf(sim, push).ev >= summaryOf(sim, fk).ev ? push : fk;
  }
  if (sim.keys.includes(chosen)) return chosen;
  const g = groupOf(spot, plain(chosen));
  const star = chosen.endsWith('*') ? '*' : '';
  return g && sim.keys.includes(g.rep.key + star) ? g.rep.key + star : null;
}

// 最善が比べる相手より勝っている問いのうち、型の順でいちばん先のもの（設計書 4.5）
export function reasonOf(cands, sim, bestKey, refKey) {
  const find = (k) => cands.find((c) => c.key === plain(k));
  const a = find(bestKey);
  const b = find(refKey);
  if (a && b) {
    if (a.x < b.x || a.n - b.n >= 2) return 'speed';
    if (a.shape && b.shape && (a.shape.good - b.shape.good >= 0.1 || a.shape.avg - b.shape.avg >= 1)) return 'shape';
    if (a.wait && b.wait && a.wait.kinds.length >= 2 && b.wait.kinds.length < 2) return 'shape';
  }
  const sa = summaryOf(sim, bestKey);
  const sb = summaryOf(sim, refKey);
  if (sa.avgWin > 0 && sa.avgWin >= sb.avgWin * 1.1) return 'value';
  return sa.win > sb.win ? 'speed' : 'value';
}

// 押し引きの正しい理由（段階2-2 設計書 4.5）：型の順に当てはめる。spot：考えどころ（minX・threatLevel・dangers）
export function pushfoldReason(spot, cands, best, ref) {
  const fold = (k) => k.endsWith('!');
  const b = cands.find((c) => c.key === plain(best));
  if (fold(best) && spot.minX >= 2) return 'hand';
  if (!fold(best) && b && b.x === 0 && b.wait && b.wait.kinds.length >= 2) return 'hand';
  const tl = spot.threatLevel || {};
  if (fold(best) && (tl.dealer || tl.count >= 2)) return 'threat';
  if (!fold(best) && !fold(ref)) {
    const d = spot.dangers || {};
    return Math.abs((d[plain(best)] || 0) - (d[plain(ref)] || 0)) >= 0.02 ? 'danger' : 'hand';
  }
  return 'compare';
}

// 鳴きの正しい理由（段階2-2 設計書 4.5）。cands：'skip' と面子ごとの { key, x（鳴いた後の向聴数） }
export function callReason(cands, sim, best, ref) {
  const a = cands.find((c) => c.key === best);
  const b = cands.find((c) => c.key === ref);
  if (best !== 'skip' && a && b && a.x < b.x) return 'speed';
  const sa = summaryOf(sim, best);
  const sb = summaryOf(sim, ref);
  if (best === 'skip' && ref !== 'skip' && (sim.wins[ref] === 0 || sb.avgWin < sa.avgWin * 0.9)) return 'value';
  return sa.win > sb.win ? 'speed' : 'value';
}

// 最善との差 d（diffOf の結果）から判定を決める
export function gradeOfDiff(d) {
  if (d.mean <= GRADE.seK * d.se || d.mean < GRADE.okPoints) return 'ok';
  return d.mean < GRADE.badPoints ? 'dubious' : 'bad';
}

// 採点。sim：simulate の結果（あなたの候補の代表を含む）。spot：spotOf の結果。cands：countCandidates の結果。
// chosen：あなたの候補（リーチなら '*' 付き）。mineDiff：最善とあなたの候補の差を、別の試し（悪手と言う前の確かめ）で
// 測り直した値（diffOf の形）。あれば判定と損はこれで決める（設計書 12章）。
// 正しい理由は「はっきり劣る候補」と比べて決める：あなたの牌が疑問手・悪手ならあなたの牌、
// 正答（最善・許容）なら最善より疑問手・悪手になる候補のうちいちばん上。どれとも差が許容の範囲なら理由は null
export function judge(sim, spot, cands, chosen, { mineDiff = null } = {}) {
  const ranking = sim.keys.map((key) => ({ key, ...summaryOf(sim, key) })).sort((a, b) => b.ev - a.ev);
  const best = ranking[0].key;
  const mine = simKeyOf(sim, spot, chosen) || chosen;
  let grade = 'best';
  let loss = 0;
  let se = 0;
  if (mine !== best) {
    const d = mineDiff || diffOf(sim, best, mine);
    loss = d.mean;
    se = d.se;
    grade = gradeOfDiff(d);
  }
  let ref = null;
  if (!isCorrect(grade)) ref = mine;
  else ref = ranking.slice(1).map((r) => r.key).find((k) => k !== mine && !isCorrect(gradeOfDiff(diffOf(sim, best, k)))) || null;
  // 最善との差が許容の範囲のほかの候補（正解は1つとは限らない）
  const alsoOk = ranking.slice(1).map((r) => r.key).filter((k) => isCorrect(gradeOfDiff(diffOf(sim, best, k))));
  const why = (r) => (spot.spot === 'pushfold' ? pushfoldReason(spot, cands, best, r) : spot.spot === 'call' ? callReason(cands, sim, best, r) : reasonOf(cands, sim, best, r));
  // chosen：あなたが選んだそのもの（答え合わせの呼び方に使う。mine は試した組の代表）
  const out = { best, mine, chosen, grade, loss, se, ranking, ref, alsoOk, reason: ref ? why(ref) : null };
  // 段階3-7（設計書 5章）：リーチの人がいない押し引き（quiet）の正しい理由は何切るの言葉。降りが最善か、
  // 押し引きの理由が②相手の脅威・③牌の危なさなら④安全。ほかは何切るの理由の決め方。もとの押し引きの理由は pfReason
  if (spot.spot === 'pushfold' && spot.quiet && ref) {
    out.pfReason = out.reason;
    out.reason = best.endsWith('!') || out.pfReason === 'threat' || out.pfReason === 'danger' ? 'safety' : reasonOf(cands, sim, best, ref);
  }
  return out;
}

// 記録の種類から、成績の欄の種類へ（段階2-2 設計書 5.6）
export const KIND_GROUP = { choice: 'discard', riichi: 'discard', off: 'discard', pushfold: 'pushfold', pfoff: 'pushfold', call: 'call', calloff: 'call' };

// 数えた判断の並びの、回数・正答率・理由の正答率
function statsOf(counted) {
  const correct = counted.filter((e) => isCorrect(e.grade)).length;
  // 理由の正答率は、理由を聞いて正否が決まった判断で数える（どれを切っても差がない場面は数えない）。
  // ヒントの段は帯に「この場面は○で差がつきます」（正しい理由）を見せた後に聞くので数えない
  const asked = counted.filter((e) => e.asked && e.reasonOk !== null && e.level !== 'hint');
  const reasonOk = asked.filter((e) => e.reasonOk).length;
  return {
    decisions: counted.length,
    correct,
    rate: counted.length ? correct / counted.length : null,
    asked: asked.length,
    reasonOk,
    reasonRate: asked.length ? reasonOk / asked.length : null,
  };
}

// 成績のまとめ（考えどころの記録の並びから。ヒントを見た判断と、はっきりした差がない判断は数えない）。
// byKind：種類別（何切る・リーチ＝discard／押し引き＝pushfold／鳴き＝call）
export function summarize(log) {
  const counted = log.filter((e) => !e.hinted && e.clear !== false);
  const byKind = {};
  for (const g of ['discard', 'pushfold', 'call']) byKind[g] = statsOf(counted.filter((e) => (KIND_GROUP[e.kind] || 'discard') === g));
  return {
    ...statsOf(counted),
    bad: log.filter((e) => e.grade === 'bad').length,
    hinted: log.filter((e) => e.hinted).length,
    byKind,
  };
}
