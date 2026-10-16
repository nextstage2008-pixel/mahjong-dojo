// 考えどころ（設計書 4.2）と、試す候補の選び方（4.3）。数えた結果（count.js）だけで決める。
import Majiang from '../../vendor/majiang-core.js';
import { keyOf, doraKindsOf } from './count.js';
import { kindOf, yakuOutlook } from '../core/ai.js';
import { handDirection, STYLES } from '../core/styles.js';
import { dangerAll } from './danger.js';
import { handCounts, lowValue } from './sim.js';
import { readOf } from './read.js';

const { Shoupai, Util } = Majiang;

// 考えどころにする手の遠さの上限。3向聴以上の序盤はどれを切っても差が小さく、試しの誤差も大きいので流す
// （通しの試験で、3向聴以上を入れると1半荘あたり約24回増えた）
export const SPOT_MAX_SHANTEN = 2;

// ①速さと②形の印。これが同じ候補は「どれを切っても同じ」とみなす
const speedShape = (c) => [
  c.x,
  c.n,
  c.shape ? `${c.shape.avg.toFixed(3)}/${c.shape.good.toFixed(3)}` : '',
  c.wait ? `${c.wait.n}:${c.wait.kinds.join('')}` : '',
].join('|');

// 候補を「数字が同じもの」どうしの組にまとめる（①速さ・②形・残るドラの枚数がすべて同じ）。
// 組の代表は手の並びで最初の候補。extra(c)：組分けに足す印（押し引きでは放銃率。危なさの違う牌を同じ組にしない）
export function groupCandidates(cands, extra = null) {
  const groups = new Map();
  for (const c of cands) {
    const ss = speedShape(c);
    const sig = `${ss}|${c.dora}${extra ? '|' + extra(c) : ''}`;
    if (!groups.has(sig)) groups.set(sig, { rep: c, keys: [], ss });
    groups.get(sig).keys.push(c.key);
  }
  return [...groups.values()];
}

// 順位で答えが変わりうる場面（段階2-2 設計書 3.1）：オーラスで、自分とほかのだれかの点差が8,000点以内
export const LAST_GAP = 8000;
export function rankSensitive(scene) {
  if (!scene.last || !scene.scores) return false;
  const me = scene.scores[scene.menfeng];
  return scene.scores.some((v, l) => l !== scene.menfeng && Math.abs(v - me) <= LAST_GAP);
}

// 場面の手の牌を切ったときの危なさ（設計書 4.1・段階3-7 設計書 3章）。key：候補の名前（赤5は '0'）。
// 相手の材料のある場面は読みの値（警戒している全員への 1−Π(1−1人ずつ)。リーチの人だけなら今の放銃率と同じ）。
// 相手の材料のない古い場面は、リーチの人みんなへの放銃率（dangerAll）。read：読み（呼ぶ側が持っていれば渡す）
export function dangerIn(scene, read = null) {
  if (scene.opponents && scene.opponents.length) {
    const r = read || readOf(scene);
    return (key) => (r.dangers[key.replace(/[*!]/g, '')] ? r.dangers[key.replace(/[*!]/g, '')].p : 0);
  }
  const ctx = { visible: scene.visible, own: handCounts(Shoupai.fromString(scene.hand)), turn: scene.turn + 1 };
  return (key) => dangerAll(kindOf(key), scene.threats || [], ctx).p;
}

// 警戒している人の数と、その中に親がいるか（正しい理由の②相手の脅威に使う）。相手の材料のない古い場面はリーチの人
function threatLevelOf(scene, read) {
  if (read && scene.opponents && scene.opponents.length) {
    const a = read.opponents.filter((o) => o.alert);
    return { count: a.length, dealer: a.some((o) => o.dealer) };
  }
  const ts = scene.threats || [];
  return { count: ts.length, dealer: ts.some((t) => t.dealer) };
}

// 場面が考えどころか。spot：'riichi'（聴牌してリーチできる）・'choice'（切る牌で差がつく）・null。
// forward：向聴数がいちばん小さい（前に進む）組。main：考えどころでないときの「当たり前の1枚」の組。
// 段階3-7（設計書 3章）：リーチの人がいなくても、警戒している人（読みの alert）がいれば押し引き。そのときは quiet: true
// （考えどころでなくても降りる牌と quiet は持つ）。ただし聴牌してリーチを選べる場面は今どおり riichi。
// read：読み（呼ぶ側が持っていれば渡す。なければ相手の材料のある場面だけ作る）
export function spotOf(scene, cands, { read = null } = {}) {
  const groups = groupCandidates(cands);
  const minX = Math.min(...cands.map((c) => c.x));
  const forward = groups.filter((g) => g.rep.x === minX);
  // 速さと形が同じなら、ドラを多く残す組が当たり前の1枚
  const main = forward.slice().sort((a, b) => b.rep.n - a.rep.n || b.rep.dora - a.rep.dora)[0];
  const base = { groups, forward, main, minX };
  if (cands.length <= 1) return { spot: null, ...base };
  const r = read || (scene.opponents && scene.opponents.length ? readOf(scene) : null);
  const riichiThreat = !!(scene.threats && scene.threats.length);
  const canRiichi0 = minX === 0 && scene.lizhi && scene.lizhi.length > 0;
  const quiet = !riichiThreat && !!(r && r.alert);
  // 段階2-2：リーチを受けた場面は押し引き（設計書 3.1）。段階3-7：リーチの人がいなくても警戒している人がいれば押し引き（quiet）。
  // fold：降りる候補（いちばん安全な牌＋'!'）。danger：候補ごとの危なさ（帯と危なさの印に使う）
  if (riichiThreat || (quiet && !canRiichi0)) {
    const danger = dangerIn(scene, r);
    const dangers = Object.fromEntries(cands.map((c) => [c.key, danger(c.key)]));
    const tg = groupCandidates(cands, (c) => dangers[c.key].toFixed(4));
    const tf = tg.filter((g) => g.rep.x === minX);
    // threatLevel：警戒している人の数と、親がいるか（正しい理由の②相手の脅威に使う。段階3-7）
    const threatLevel = threatLevelOf(scene, r);
    const tb = { groups: tg, forward: tf, main: tf.slice().sort((a, b) => b.rep.n - a.rep.n || b.rep.dora - a.rep.dora)[0], minX, dangers, threatLevel };
    // 降りる牌：いちばん安全な牌。同じ安全さなら価値の低い牌（字牌・1・9 → 2・8 → 残り。ドラと赤5は後回し）
    const dora = doraKindsOf(scene.baopai);
    let fold = cands[0].key;
    for (const c of cands) {
      const dd = dangers[c.key] - dangers[fold];
      if (dd < -1e-12 || (Math.abs(dd) <= 1e-12 && lowValue(c.key, dora) < lowValue(fold, dora))) fold = c.key;
    }
    // 押すいちばんの牌（前に進み、受け入れがいちばん多い）が降りる牌でもあり、リーチの選択もないなら、押しても降りても
    // 切る牌は同じで迷う余地がない（2-1 の「明らかな1枚は流す」。設計書10章）
    const fc = cands.find((c) => c.key === fold);
    const bestN = Math.max(...tf.map((g) => g.rep.n));
    const canRiichi = minX === 0 && scene.lizhi && scene.lizhi.length > 0;
    const obvious = fc.x === minX && fc.n === bestN && !canRiichi;
    // 考えどころでなくても降りる牌は持っておく（3向聴以上や迷う余地のない場面で危ない牌を切ったとき、降りと比べるため）
    const q = quiet ? { quiet: true } : {};
    if (rankSensitive(scene) || minX > SPOT_MAX_SHANTEN || obvious) return { spot: null, ...tb, fold: fold + '!', ...q };
    return { spot: 'pushfold', ...tb, fold: fold + '!', ...q };
  }
  if (scene.threat) return { spot: null, ...base };
  if (scene.lizhi && scene.lizhi.length && minX === 0) return { spot: 'riichi', ...base };
  if (minX > SPOT_MAX_SHANTEN) return { spot: null, ...base };
  const kinds = new Set(forward.map((g) => g.ss));
  return { spot: kinds.size >= 2 ? 'choice' : null, ...base };
}

// その候補が入っている組
export function groupOf(spot, key) {
  return spot.groups.find((g) => g.keys.includes(key));
}

// 考えどころでない場面で、あなたの牌が当たり前の1枚の組の外か（外なら試して採点し、損なら知らせる）
export function offPath(spot, key) {
  return !spot.main.keys.includes(key);
}

// 試す候補（設計書 4.3）：前に進む組の代表を受け入れの多い順に最大5つと、
// 受け入れが前に進む最善の組の1.5倍以上ある向聴戻しを最大1つ。
// リーチできる場面では、リーチできる聴牌の代表に「リーチ」（名前の後ろに '*'）も足す
export function simKeys(spot, scene) {
  const fw = spot.forward.slice().sort((a, b) => b.rep.n - a.rep.n || b.rep.dora - a.rep.dora).slice(0, 5);
  // 押し引き（段階2-2 設計書 3.1）：押す＝前に進む組の代表（聴牌してリーチできればリーチも）、降りる＝いちばん安全な牌
  if (spot.spot === 'pushfold') {
    // 受け入れが同じなら、安全な組から（危なさで組が分かれるため）
    const d = (g) => spot.dangers[g.rep.key];
    const keys = spot.forward.slice().sort((a, b) => b.rep.n - a.rep.n || d(a) - d(b) || b.rep.dora - a.rep.dora).slice(0, 5).map((g) => g.rep.key);
    if (scene.lizhi && scene.lizhi.length) {
      const can = new Set(scene.lizhi.map(keyOf));
      for (const k of keys.slice()) if (can.has(k) && spot.forward.some((g) => g.rep.key === k && g.rep.x === 0)) keys.push(k + '*');
    }
    keys.push(spot.fold);
    return keys;
  }
  const bestN = Math.max(...spot.forward.map((g) => g.rep.n));
  const back = spot.groups
    .filter((g) => g.rep.x === spot.minX + 1 && g.rep.n >= bestN * 1.5)
    .sort((a, b) => b.rep.n - a.rep.n)
    .slice(0, 1);
  const keys = [...fw, ...back].map((g) => g.rep.key);
  if (spot.spot === 'riichi') {
    const can = new Set(scene.lizhi.map(keyOf));
    for (const g of fw) if (g.rep.x === 0 && can.has(g.rep.key)) keys.push(g.rep.key + '*');
  }
  return keys;
}

// 押し引きの考えどころの外（3向聴以上）で、危ない牌（5%以上）を、もっと安全な牌（1%以下）があるのに切ったか
// （段階2-2 設計書 3.1。そうなら降りとあなたの牌の2つを試して、損なら知らせる）
// 段階3-7：リーチの人がいなくても、警戒している人のいる場面（spot.quiet）なら同じに調べる（危なさは読みの値）
export function offPushfold(scene, spot, key) {
  if (!((scene.threats && scene.threats.length) || spot.quiet) || spot.spot || rankSensitive(scene)) return false;
  const danger = spot.dangers ? (k) => spot.dangers[k] ?? dangerIn(scene)(k) : dangerIn(scene);
  const safest = Math.min(...spot.groups.flatMap((g) => g.keys).map(danger));
  return danger(key) >= 0.05 && safest <= 0.01;
}

// 鳴きの考えどころ（段階2-2 設計書 3.2）。候補は鳴かない（'skip'）と鳴ける面子。
// 前に進む向聴数（今の13枚）が3以上なら考えどころにしない。ただし役牌のポンは考えどころ
export function callSpotOf(scene) {
  const minX = Util.xiangting(Shoupai.fromString(scene.hand));
  const keys = ['skip', ...scene.melds];
  const y = callYaku(scene);
  // オーラスで点差が8,000点以内（順位で答えが変わりうる）なら採点しない（押し引きと同じ。設計書 2章）
  if (rankSensitive(scene)) return { spot: null, keys, minX };
  // 役のない鳴き（どの面子で鳴いても役がつかない）は「鳴かない」が明らか：考えどころにせず、鳴いたら考えどころ外で調べる（設計書10章）
  if (scene.melds.every((m) => !y.each[m])) return { spot: null, keys, minX, noYaku: true };
  if (minX > SPOT_MAX_SHANTEN && !y.pon) return { spot: null, keys, minX };
  return { spot: 'call', keys, minX };
}

// 鳴いた後の役の見込み（段階2-2・2-3）。CPU と同じ yakuOutlook（core/ai.js）を面子ごとに使う。喰いタンは場面のルールで見る。
// pon：役牌のポンの面子・meld：鳴いてある役牌の面子・anko：手の中の役牌の刻子・allSimple：喰いタンありで、手も鳴いてある面子も
// 鳴ける面子もすべて2〜8。each：鳴ける面子ごとに役がつくか（混一色・対々和などは見ない）
export function callYaku(scene) {
  const sp = Shoupai.fromString(scene.hand);
  const kuitan = scene.rule ? scene.rule['クイタンあり'] !== false : true;
  // 人の手が染め手・対々和の方向にあり、リーチを受けていなければ、混一色・対々和の見込みも役とみる（段階3-5 設計書 5章。お手本の数字）
  const wide = handDirection(sp, 'model').kind !== 'normal' && !scene.threat;
  const opts = { zhuangfeng: scene.zhuangfeng, menfeng: scene.menfeng, kuitan, ...(wide ? { wide: true, someLoose: STYLES.model.someLoose } : {}) };
  const outlook = Object.fromEntries(scene.melds.map((m) => [m, yakuOutlook(sp, m, opts)]));
  const first = (kind) => {
    const o = Object.values(outlook).find((x) => x.kind === kind);
    return o ? o.tile : null;
  };
  // 文（③打点）のための形：ポンの面子・鳴いてある面子は面子の書き方で返す（今までと同じ）
  const pon = scene.melds.find((m) => outlook[m].kind === 'pon') || null;
  const meldTile = first('meld');
  const meld = meldTile ? sp._fulou.find((m) => m.startsWith(meldTile[0] + meldTile[1].repeat(3))) || null : null;
  // 混一色・対々和の見込み（段階3-5。手役の方向にいるときだけ。③打点の文に使う）
  const wideOutlook = Object.values(outlook).find((x) => x.kind === 'honitsu' || x.kind === 'toitoi') || null;
  return {
    pon,
    meld,
    anko: first('anko'),
    wide: wideOutlook,
    allSimple: scene.melds.length > 0 && scene.melds.every((m) => outlook[m].kind === 'tanyao'),
    each: Object.fromEntries(scene.melds.map((m) => [m, !!outlook[m].kind])),
  };
}
