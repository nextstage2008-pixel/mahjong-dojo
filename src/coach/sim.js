// 試す（設計書 4.3・4.6）：上位の候補を、見えていない牌から作った同じ山の並びで何百回も打ってみて、
// 上がる見込み・上がったときの平均の打点・見込める点数を出す。
// 1回ごとの並びは「場面の種＋何回目か」だけで決まるので、あとから候補を足しても同じ並びで比べられる。
import Majiang from '../../vendor/majiang-core.js';
import { STANDARD_RULE } from '../core/rule.js';
import { createRng, deriveSeed, shuffleInPlace } from '../core/rng.js';
import { kindOf, directionDiscard } from '../core/ai.js';
import { handDirection, directionAfterCall } from '../core/styles.js';
import { keyOf, leftOf, doraKindsOf } from './count.js';
import { dangerAll } from './danger.js';

const { Shoupai, Util } = Majiang;

// リーチの上がる見込みはダマの0.86倍と置く（相手が降りる分）。リサーチノート
// 「2026-10-08_麻雀のリーチとダマの判断基準」の9巡目・先制両面の数字（リーチ約60%・ダマ約70%）からの推定
export const RIICHI_WIN_RATIO = 0.86;
// 相手の捨て牌が自分の待ちだったとき、ロンできる見込み。並びの牌をそのまま捨てさせるとロンが多すぎる
// （本当の相手は要る牌や危ない牌を捨てない）ので割り引く。9巡目の先制両面ダマの和了率が約70%になるように決めた
export let RON_FACTOR = 0.3;
// 割引を合わせ直すとき用（通しの試験と、合わせたことを確かめるテストが使う）
export function setRonFactor(f) { RON_FACTOR = f; }
export const DEFAULT_RUNS = 400;

// 段階2-2（リーチを受けた場面。設計書 4.2）。
// RIICHI_LOSS：子のリーチに振り込んだときの失点（親は1.5倍）。TSUMO_RATIO：ツモの点数はロンの何倍か。
// ゲームの CPU のリーチの上がりを測って決めた（scripts/measure-riichi.mjs・200半荘・1,326回：子のロン 5,523点・
// ツモ 6,912点・親のロン 8,262点・ツモ 10,257点。統計の子の放銃失点 5,153〜7,099点の間）。
// THREAT_TSUMO・THREAT_RON：リーチの人が自分の1巡ごとにツモ上がりする見込みと、ほかの人から上がる見込み。
// THREAT_OTHER：リーチしていない人どうしで上がって局が終わる見込み（自分は払わない）。
// 降りたとき9巡で、リーチの和了率がおよそ5割・流局がおよそ25%（統計の先制リーチを受けた局の流局 17〜26%）・
// リーチの上がりのツモとロンがおよそ2対1になるように置いた値。NOTEN_TOTAL：流局の聴牌料の合計
export const RIICHI_LOSS = 5500;
export const TSUMO_RATIO = 1.25;
export const THREAT_TSUMO = 0.065;
export const THREAT_RON = 0.033;
export const THREAT_OTHER = 0.045;
export const NOTEN_TOTAL = 3000;
// 段階3-7（設計書 4章・13.1）：警戒しているリーチのない人（scene.watch）が聴牌しているとき、自分の1巡ごとにツモ上がりする見込みと、
// ほかの人から上がる見込み。道場の人らしい CPU どうしの400半荘で、リーチしていない聴牌の巡 14,306回のうち、リーチせずにツモ 434回
// （3.0%）・ロン 1,346回（9.4%）。ロンは3人から上がった数なので、自分の分（振り込みのくじで別に引く）を除いて 2/3 にした
export const WATCH_TSUMO = 0.03;
export const WATCH_RON = 0.063;

// 候補の名前から、リーチ（'*'）と降りる（'!'）の印を外したもの
export const plainKey = (key) => key.replace(/[*!]/g, '');

// 手の牌の種類ごとの枚数（危なさの字牌の「卓に見えている枚数」から自分の手の分を引くため）
export function handCounts(sp) {
  const c = {};
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    for (let n = 1; n < b.length; n++) if (b[n]) c[s + n] = b[n];
  }
  return c;
}

// 見えていない牌の並び。赤5はまだ見えていなければ、その色の5のうち1枚を '0' にする
export function unseenPool(scene, rule = scene.rule || STANDARD_RULE) {
  const pool = [];
  for (const s of ['m', 'p', 's', 'z']) {
    for (let n = 1; n <= (s === 'z' ? 7 : 9); n++) {
      const k = s + n;
      let left = leftOf(scene.visible, k);
      if (n === 5 && s !== 'z') {
        let red = Math.max(0, (rule['赤牌'][s] || 0) - (scene.redSeen[s] || 0));
        while (red > 0 && left > 0) { pool.push(s + '0'); red--; left--; }
      }
      for (let i = 0; i < left; i++) pool.push(k);
    }
  }
  return pool;
}

// 価値の低い牌ほど小さい（字牌 → 1・9 → 2・8 → 残り）。ドラと赤5は残す
export function lowValue(p, dora) {
  const k = kindOf(p);
  const n = +k[1];
  let v = k[0] === 'z' ? 0 : n === 1 || n === 9 ? 1 : n === 2 || n === 8 ? 2 : 3;
  if (dora.has(k) || p[1] === '0') v += 10;
  return v;
}

// その牌のつながり：同じ色で前後2以内にある、ほかの手の牌の数（字牌は同じ牌の数）。0 なら孤立した牌
function linksOf(sp, t) {
  const s = t[0];
  const n = +t[1] || 5;
  const b = sp._bingpai[s];
  if (s === 'z') return b[n] - 1;
  let c = -1;
  for (let m = Math.max(1, n - 2); m <= Math.min(9, n + 2); m++) c += b[m];
  return c;
}

// 13枚の手で、引くと向聴数（普通の形）が下がる牌の種類。Util.tingpai(sp, xiangting_yiban) と同じ牌を、
// 手の牌から前後2以内の数牌と手にある字牌だけ調べて出す（離れた牌は普通の形の向聴数を下げないので、速い）。
// 聴牌の手なら待ちの牌になる
function improversOf(sp) {
  const n0 = Util.xiangting_yiban(sp);
  const out = [];
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    const top = s === 'z' ? 7 : 9;
    for (let n = 1; n <= top; n++) {
      if (b[n] >= 4) continue;
      let near = s === 'z' ? b[n] > 0 : false;
      if (s !== 'z') for (let m = Math.max(1, n - 2); m <= Math.min(9, n + 2); m++) if (b[m] > 0) near = true;
      if (!near) continue;
      b[n]++;
      if (Util.xiangting_yiban(sp) < n0) out.push(s + n);
      b[n]--;
    }
  }
  return out;
}

const countOf = (kinds, left) => kinds.reduce((a, k) => a + left(k), 0);

// 試しの中での切り方（設計書 4.3・12章）。sp：ツモの後の14枚。dora：ドラの種類。left(k)：その牌が自分から見てあと何枚か。
// careful：丁寧な打ち方（悪手と言う前の確かめに使う。1向聴では受け入れのいちばん多い牌を切る。遅いのでふだんは使わない）。
// - 孤立した牌を引いて、切っても向聴数（普通の形だけで数える速い方）が変わらないならツモ切り
// - 聴牌できないときは、向聴数がいちばん小さくなる牌のうち価値の低い牌（14枚の向聴数は「1枚切った後のいちばん小さい向聴数」
//   と同じなので、価値の低い牌から試して、その向聴数になったら止める）
// - 聴牌できるなら、待ちの残り枚数がいちばん多い牌（同じなら待ちの種類が多い牌）
// direction：手役の方向（段階3-5。core/styles.js の handDirection をお手本の数字で。リーチを受けていないときだけ使う）。
// 染め手・対々和なら、聴牌できないときは向聴数（普通の形）がいちばん小さい＋1までの牌のうち、方向で先に切る牌（価値の低い牌から）
export function policyDiscard(sp, dora, left, careful = false, danger = null, direction = null) {
  const target = Util.xiangting_yiban(sp);
  // リーチを受けているとき（設計書 4.3）：向聴数が変わらない牌のうち、いちばん安全な牌（同じなら価値の低い牌）。
  // 丁寧な打ち方（悪手と言う前の確かめ）の1向聴は、下の受け入れの多い牌を先にする（危なさは同じ受け入れのときに見る）
  if (danger && target > 0 && !(careful && target === 1)) {
    let best = null;
    let bp = Infinity;
    let bv = Infinity;
    for (const t of new Set(sp.get_dapai(false).map((d) => d.slice(0, 2)))) {
      sp.dapai(t, false);
      const x = Util.xiangting_yiban(sp);
      sp.zimo(t, false);
      if (x !== target) continue;
      const pd = danger(t);
      const v = lowValue(t, dora);
      if (pd < bp - 1e-12 || (Math.abs(pd - bp) <= 1e-12 && v < bv)) {
        best = t;
        bp = pd;
        bv = v;
      }
    }
    if (best) return best;
  }
  if (!danger && direction && direction.kind !== 'normal' && target > 0) {
    const pick = directionPick(sp, dora, direction, target, [...new Set(sp.get_dapai(false).map((d) => d.slice(0, 2)))]);
    if (pick) return pick;
  }
  if (target > 0 && sp._zimo && sp._zimo.length <= 3) {
    const z = sp._zimo.slice(0, 2);
    if (linksOf(sp, z) === 0) {
      sp.dapai(z, false);
      const x = Util.xiangting_yiban(sp);
      sp.zimo(z, false);
      if (x === target) return z;
    }
  }
  const tiles = [...new Set(sp.get_dapai(false).map((d) => d.slice(0, 2)))];
  tiles.sort((a, b) => lowValue(a, dora) - lowValue(b, dora));
  if (target === 1 && careful) {
    let best = null;
    let bu = -1;
    let bd = Infinity;
    for (const t of tiles) {
      sp.dapai(t, false);
      if (Util.xiangting_yiban(sp) === 1) {
        const u = countOf(improversOf(sp), left);
        const pd = danger ? danger(t) : 0;
        if (u > bu || (u === bu && pd < bd - 1e-12)) {
          best = t;
          bu = u;
          bd = pd;
        }
      }
      sp.zimo(t, false);
    }
    return best;
  }
  if (target > 0) {
    for (const t of tiles) {
      sp.dapai(t, false);
      const x = Util.xiangting_yiban(sp);
      sp.zimo(t, false);
      if (x === target) return t;
    }
  }
  let best = tiles[0];
  let bn = -1;
  let bk = -1;
  for (const t of tiles) {
    sp.dapai(t, false);
    if (Util.xiangting_yiban(sp) === 0) {
      const w = improversOf(sp);
      const n = countOf(w, left);
      if (n > bn || (n === bn && w.length > bk)) {
        best = t;
        bn = n;
        bk = w.length;
      }
    }
    sp.zimo(t, false);
  }
  return best;
}

// 方向で先に切る牌（段階3-5）：切ったあとの向聴数（普通の形）が limit＋1 までの牌のうち、方向で先に切る牌を、向聴数・価値の低い順に
function directionPick(sp, dora, direction, limit, tiles) {
  let best = null;
  let bx = Infinity;
  let bv = Infinity;
  for (const t of tiles) {
    if (!directionDiscard(direction, kindOf(t), sp)) continue;
    sp.dapai(t, false);
    const x = Util.xiangting_yiban(sp);
    sp.zimo(t, false);
    if (x > limit + 1) continue;
    const v = lowValue(t, dora);
    if (x < bx || (x === bx && v < bv)) {
      best = t;
      bx = x;
      bv = v;
    }
  }
  return best;
}

// 鳴いた直後の打牌（設計書 4.4）：喰い替えの牌は切らない（部品の get_dapai が決める切れる牌だけ）。
// 向聴数（普通の形）がいちばん小さくなる牌のうち、リーチを受けていれば安全な牌、同じなら価値の低い牌。
// 聴牌できるなら待ちの残り枚数がいちばん多い牌。direction：手役の方向（段階3-5。聴牌できないときだけ方向で先に切る牌から）
export function callDiscard(sp, dora, left, danger = null, direction = null) {
  const allowed = [...new Set(sp.get_dapai().map((d) => d.slice(0, 2)))];
  if (!danger && direction && direction.kind !== 'normal') {
    let least = Infinity;
    for (const t of allowed) {
      sp.dapai(t, false);
      least = Math.min(least, Util.xiangting_yiban(sp));
      sp.zimo(t, false);
    }
    if (least > 0) {
      const pick = directionPick(sp, dora, direction, least, allowed);
      if (pick) return pick;
    }
  }
  let best = null;
  let bx = Infinity;
  let bw = -1;
  let bp = Infinity;
  let bv = Infinity;
  for (const t of allowed) {
    sp.dapai(t, false);
    const x = Util.xiangting_yiban(sp);
    const w = x === 0 ? countOf(improversOf(sp), left) : -1;
    sp.zimo(t, false);
    const pd = danger ? danger(t) : 0;
    const v = lowValue(t, dora);
    const better = x < bx || (x === bx && (w > bw || (w === bw && (pd < bp - 1e-12 || (Math.abs(pd - bp) <= 1e-12 && v < bv)))));
    if (better) {
      best = t;
      bx = x;
      bw = w;
      bp = pd;
      bv = v;
    }
  }
  return best;
}

// 降りる打ち方（設計書 4.3）：手の中でいちばん安全な牌（同じなら価値の低い牌）
function safestDiscard(sp, dora, danger) {
  let best = null;
  let bp = Infinity;
  let bv = Infinity;
  for (const t of new Set(sp.get_dapai(false).map((d) => d.slice(0, 2)))) {
    const pd = danger(t);
    const v = lowValue(t, dora);
    if (pd < bp - 1e-12 || (Math.abs(pd - bp) <= 1e-12 && v < bv)) {
      best = t;
      bp = pd;
      bv = v;
    }
  }
  return best;
}

// 聴牌の後に1枚引いた14枚で、聴牌のまま待ちの残り枚数がいちばん多くなる打牌（今の待ちより多いときだけ。設計書 12章）。
// drawn：引いた牌。waits：今の待ち。孤立した牌を引いたなら付け替えない。返すもの：{ discard, waits } か null
export function betterWait(sp, drawn, waits, left) {
  const dk = kindOf(drawn);
  if (linksOf(sp, dk) === 0) return null;
  let bn = countOf(waits, left);
  let best = null;
  for (const t of [...new Set(sp.get_dapai(false).map((d) => d.slice(0, 2)))]) {
    if (kindOf(t) === dk) continue;
    sp.dapai(t, false);
    if (Util.xiangting_yiban(sp) === 0) {
      const w = improversOf(sp);
      const n = countOf(w, left);
      if (n > bn) {
        bn = n;
        best = { discard: t, waits: w };
      }
    }
    sp.zimo(t, false);
  }
  return best;
}

// 上がったときの値。gainAll：部品の取り分（本場・供託、リーチしていれば自分のリーチ棒の戻りも含む）。
// score（見込める点数に足す値）は、リーチなら上がる見込みを0.86倍に割り引き、リーチ棒1,000点を払う形。
// gain（上がったときの打点）には自分のリーチ棒の戻りを入れない（入れると打点が1,000点多く見える）
export function winOutcome(gainAll, lizhi) {
  return lizhi
    ? { score: RIICHI_WIN_RATIO * gainAll - 1000, gain: gainAll - 1000 }
    : { score: gainAll, gain: gainAll };
}

// 点数計算の結果が上がりか（役がないと得点0の結果が返る）
const scored = (h) => !!h && h.defen > 0;

// 1回の試し。sp：候補を切る前の14枚。first：最初に切る牌。order：山の並び。riichi：はじめからリーチするか（'*' の候補）。
// 聴牌したら、リーチしていなければ待ちが広がるときだけ付け替え、ほかはツモ切り。
// 試しの中で聴牌した門前の手に役がなければリーチする（設計書 4.3・4.6）。
// th：リーチを受けた場面（段階2-2 設計書 4.2）の材料 { dl（自分の打牌ごとの振り込みのくじ）, tl（巡ごと・リーチの人ごとの上がりのくじ）, fold（降りる）}。
// リーチを受けていない場面では null（2-1 のまま）。段階3-7：th.wl は警戒しているリーチのない人（scene.watch）のくじ
// （はじめの watch の人数ぶんが聴牌かのくじ、続いて巡ごと・人ごとの上がりのくじ）。リーチの人も watch の人もいなければ th は null。
// start：鳴きの場面（設計書 4.4）。'skip'＝鳴かない（13枚のまま次のツモから）、{ meld }＝鳴いて、すぐ切る牌は callDiscard で選ぶ
function playOut(scene, ctx, sp, first, order, luck, riichi, th = null, start = null) {
  let lizhi = riichi ? 1 : 0;
  const discards = new Set(scene.river);
  const param = () => Util.hule_param({
    rule: scene.rule || STANDARD_RULE,
    zhuangfeng: scene.zhuangfeng,
    menfeng: scene.menfeng,
    baopai: scene.baopai,
    fubaopai: lizhi ? [order[order.length - 1]] : null,
    lizhi,
    changbang: scene.changbang,
    lizhibang: scene.lizhibang + lizhi,
  });
  // 上がったときの得点と打点（winOutcome）と役の名前（段階3-5：目指す役）
  const win = (h) => ({ ...winOutcome(h.fenpei[scene.menfeng], lizhi), win: true, yaku: h.hupai.map((x) => x.name) });
  // 試しの中で一度でも聴牌したか（段階3-5：聴牌の確率）。結果に tenpai を付けて返す
  let reached = false;
  const end = (r) => {
    r.tenpai = !!(r.win || reached);
    return r;
  };
  // 自分から見えている牌の数（場面で見えていた牌に、試しの中で引いた牌と相手の捨て牌を足していく）
  const seen = { ...scene.visible };
  const look = (p) => {
    const k = kindOf(p);
    seen[k] = (seen[k] || 0) + 1;
  };
  const left = (k) => Math.max(0, 4 - (seen[k] || 0));
  // リーチを受けた場面：リーチの人ごとの現物（試しの中で通った牌を足していく）・振り込み・リーチの人の上がり
  const threats = th && scene.threats && scene.threats.length ? scene.threats.map((t) => ({ ...t, safe: new Set(t.safe) })) : null;
  // 警戒しているリーチのない人（段階3-7）：この試しで聴牌している人（on）だけが脅威。現物は試しの中で通った牌
  const watch = th && th.wl ? (scene.watch || []).map((w, j) => ({ ...w, j, on: th.wl[j] < w.tenpai, safe: new Set() })) : [];
  const watching = watch.filter((w) => w.on);
  const nW = watch.length;
  const hitOf = (w, k) => (w.safe.has(k) ? 0 : w.hit[k] || 0);
  let dealt = 0;
  const turnOf = (d) => scene.turn + 1 + d;
  // 危なさ：リーチの人みんな（dangerAll）と、聴牌している watch の人ごとの当たる見込みを 1−Π(1−p) で合わせる
  const dangerOfTile = (t, d) => {
    const k = kindOf(t);
    const rp = threats ? dangerAll(k, threats, { visible: seen, own: handCounts(sp), turn: turnOf(d) }).p : 0;
    let none = 1 - rp;
    for (const w of watching) none *= 1 - hitOf(w, k);
    return 1 - none;
  };
  const dangerFn = (d) => (t) => dangerOfTile(t, d);
  const anyThreat = !!threats || watching.length > 0;
  const pass = (p) => {
    if (threats) for (const t of threats) t.safe.add(kindOf(p));
    for (const w of watching) w.safe.add(kindOf(p));
  };
  const lossOf = (t) => (t.dealer ? 1.5 : 1) * RIICHI_LOSS + 300 * scene.changbang;
  const tsumoPay = (t) => (t.dealer ? (1.5 * RIICHI_LOSS * TSUMO_RATIO) / 3 : RIICHI_LOSS * TSUMO_RATIO * (scene.menfeng === 0 ? 0.5 : 0.25)) + 100 * scene.changbang;
  // watch の人の失点（高さの平均点。親の点はすでに親の値）と、ツモの払い
  const watchLoss = (w) => w.points + 300 * scene.changbang;
  const watchTsumoPay = (w) => (w.dealer ? (w.points * TSUMO_RATIO) / 3 : w.points * TSUMO_RATIO * (scene.menfeng === 0 ? 0.5 : 0.25)) + 100 * scene.changbang;
  const stick = () => (lizhi ? -1000 : 0);
  // 自分の d 番目の打牌（0 が最初）を切る前の振り込みのくじ。当たれば失点の結果、通れば null
  const dealIn = (p, d) => {
    if (!anyThreat) return null;
    const k = kindOf(p);
    const r = threats ? dangerAll(k, threats, { visible: seen, own: handCounts(sp), turn: turnOf(d) }) : { p: 0, each: [] };
    // 1人ずつの見込み：リーチの人（r.each）のあとに、聴牌している watch の人
    const parts = threats ? threats.map((t, j) => ({ p: r.each[j], loss: () => lossOf(t) })) : [];
    let none = 1 - r.p;
    for (const w of watching) {
      const h = hitOf(w, k);
      parts.push({ p: h, loss: () => watchLoss(w) });
      none *= 1 - h;
    }
    const total = 1 - none;
    const u = th.dl[d];
    if (u < total) {
      // どの人に当たったか：1人ずつの見込みの比で選ぶ（リーチの人だけなら今までと同じ選び方）
      const sum = parts.reduce((a, b) => a + b.p, 0);
      let x = (u / total) * sum;
      let who = parts[parts.length - 1];
      for (const part of parts) {
        if (x < part.p) { who = part; break; }
        x -= part.p;
      }
      dealt = 1;
      return { score: -who.loss() + stick(), win: false, gain: 0, dealin: true };
    }
    pass(p);
    return null;
  };
  // 手役の方向（段階3-5 設計書 5章。お手本の数字）：鳴いて始めた試しは鳴いたときの方向を覚え、ほかは始めの手から決める
  let direction = null;
  if (start && start.meld) {
    direction = directionAfterCall(sp, start.meld, 'model');
    sp.fulou(start.meld, false);
    first = callDiscard(sp, ctx.dora, left, anyThreat ? dangerFn(0) : null, direction);
  } else {
    const d = handDirection(sp, 'model');
    direction = d.kind === 'normal' ? null : d;
  }
  if (first) {
    const firstOut = dealIn(first, 0);
    if (firstOut) return end(firstOut);
    sp.dapai(first, false);
    discards.add(kindOf(first));
  }
  let waits = th && th.fold ? null : Util.xiangting(sp) === 0 ? Util.tingpai(sp) : null;
  reached = !!waits;
  let furiten = !!waits && waits.some((w) => discards.has(w));
  // 聴牌したら待ちを決め、振聴かを見て、役のない門前の手ならリーチする
  const settle = (w) => {
    waits = w;
    reached = true;
    furiten = waits.some((x) => discards.has(x));
    if (!lizhi && sp.menqian && !waits.some((x) => scored(Util.hule(sp, x + '+', param())))) lizhi = 1;
  };
  let i = 0;
  for (let t = 0; t < ctx.draws; t++) {
    const p = order[i++];
    look(p);
    sp.zimo(p, false);
    if (th && th.fold) {
      // 降りる：上がらず、いちばん安全な牌を切る
      const d = safestDiscard(sp, ctx.dora, dangerFn(t + 1));
      const out = dealIn(d, t + 1);
      if (out) return end(out);
      sp.dapai(d, false);
      discards.add(kindOf(d));
    } else {
    if (waits && waits.includes(kindOf(p))) {
      const h = Util.hule(sp, null, param());
      if (scored(h)) return end(win(h));
    }
    if (waits) {
      const better = lizhi || anyThreat ? null : betterWait(sp, p, waits, left);
      if (better) {
        sp.dapai(better.discard, false);
        discards.add(kindOf(better.discard));
        settle(better.waits);
      } else {
        const out = dealIn(p, t + 1);
        if (out) return end(out);
        sp.dapai(p, false);
        discards.add(kindOf(p));
        if (waits.includes(kindOf(p))) furiten = true;
      }
    } else {
      const d = policyDiscard(sp, ctx.dora, left, ctx.careful, anyThreat ? dangerFn(t + 1) : null, direction);
      const out = dealIn(d, t + 1);
      if (out) return end(out);
      sp.dapai(d, false);
      discards.add(kindOf(d));
      if (Util.xiangting(sp) === 0) settle(Util.tingpai(sp));
    }
    }
    // 相手3人の捨て牌でロン（振聴ならしない）。待ちの牌でも、ロンできるのは RON_FACTOR の見込みだけ
    for (let o = 0; o < 3; o++) {
      const q = order[i];
      const u = luck[i++];
      look(q);
      pass(q);
      if (!waits || furiten || u >= RON_FACTOR || !waits.includes(kindOf(q))) continue;
      const h = Util.hule(sp, q + '+', param());
      if (scored(h)) return end(win(h));
    }
    // リーチの人の上がり（設計書 4.2）：ツモなら自分も払う。ほかの人から上がれば自分は払わない
    if (threats) {
      for (let j = 0; j < threats.length; j++) {
        const u = th.tl[t * threats.length + j];
        if (u < THREAT_TSUMO) return end({ score: -tsumoPay(threats[j]) + stick(), win: false, gain: 0 });
        if (u < THREAT_TSUMO + THREAT_RON) return end({ score: stick(), win: false, gain: 0 });
      }
      if (th.tl[ctx.draws * threats.length + t] < THREAT_OTHER) return end({ score: stick(), win: false, gain: 0 });
    }
    // 聴牌している watch の人の上がり（段階3-7）：ツモなら自分も払う。ほかの人から上がれば自分は払わない
    for (const w of watching) {
      const u = th.wl[nW + t * nW + w.j];
      if (u < WATCH_TSUMO) return end({ score: -watchTsumoPay(w) + stick(), win: false, gain: 0 });
      if (u < WATCH_TSUMO + WATCH_RON) return end({ score: stick(), win: false, gain: 0 });
    }
  }
  if (anyThreat) {
    // 流局の聴牌料：リーチの人と聴牌している watch の人は聴牌、ほかの CPU はノーテン。降りたら自分はノーテン
    const tenpai = waits ? 1 : 0;
    const k = (threats ? threats.length : 0) + watching.length + tenpai;
    const pay = k > 0 && k < 4 ? (tenpai ? NOTEN_TOTAL / k : -NOTEN_TOTAL / (4 - k)) : 0;
    return end({ score: pay + stick(), win: false, gain: 0, dealin: !!dealt });
  }
  return end({ score: lizhi ? -1000 : 0, win: false, gain: 0 });
}

// keys の候補を runs 回ずつ試す。名前の後ろの '*' はリーチ、'!' は降りる（リーチを受けた場面）。
// careful：丁寧な打ち方（policyDiscard）で試す。call：鳴きの場面（keys は 'skip' と面子の書き方。設計書 4.4）。
// 返すもの：scores（候補ごとの1回ずつの得点）・wins（上がった回数）・gains（上がったときの得点の合計）・
// dealins（振り込んだ回数。リーチを受けていない場面は0）・tenpais（試しの中で聴牌した回数）・
// yaku（上がりに付いた役の名前ごとの回数。ドラと、ツモ・立直のような手の形でない役は数えない。段階3-5）
export function simulate(scene, keys, { runs = DEFAULT_RUNS, careful = false, call = false } = {}) {
  const base = Shoupai.fromString(scene.hand);
  const pool = unseenPool(scene);
  const ctx = {
    dora: doraKindsOf(scene.baopai),
    // 自分が引ける回数。山の並びは自分1枚・相手3枚の順に使い、最後の1枚は裏ドラ表示牌にする
    draws: Math.max(0, Math.min(scene.draws, Math.floor((pool.length - 1) / 4))),
    careful,
  };
  const option = (key) => scene.options.find((o) => keyOf(o) === plainKey(key));
  const nT = scene.threats ? scene.threats.length : 0;
  const nW = scene.watch ? scene.watch.length : 0;
  const scores = {};
  const wins = {};
  const gains = {};
  const dealins = {};
  const tenpais = {};
  const yaku = {};
  for (const key of keys) {
    scores[key] = new Float64Array(runs);
    wins[key] = 0;
    gains[key] = 0;
    dealins[key] = 0;
    tenpais[key] = 0;
    yaku[key] = {};
  }
  for (let r = 0; r < runs; r++) {
    const rng = createRng(deriveSeed(scene.seed, r));
    const order = shuffleInPlace(pool.slice(), rng);
    // 相手の捨て牌ごとの「ロンできるか」のくじ（全候補で同じものを使う）
    const luck = order.map(() => rng());
    // リーチを受けた場面だけ、振り込みとリーチの人の上がりのくじを引く（受けていない場面の並びは 2-1 のまま）
    const dl = nT || nW ? Float64Array.from({ length: ctx.draws + 1 }, () => rng()) : null;
    const tl = nT ? Float64Array.from({ length: ctx.draws * (nT + 1) }, () => rng()) : null;
    // 警戒しているリーチのない人のくじ（段階3-7）：今までのくじの後に引く（watch がなければ引かない＝今までの並びのまま）
    const wl = nW ? Float64Array.from({ length: nW * (ctx.draws + 1) }, () => rng()) : null;
    for (const key of keys) {
      const th = nT || nW ? { dl, tl, wl, fold: !call && key.endsWith('!') } : null;
      const start = call ? (key === 'skip' ? 'skip' : { meld: key }) : null;
      const o = call ? null : option(key);
      // 切れない牌の名前は誤り（黙って続けると「鳴かない」と同じになってしまう）
      if (!call && !o) throw new Error(`切れる牌に ${key} がない`);
      const res = playOut(scene, ctx, base.clone(), o, order, luck, !call && key.endsWith('*'), th, start);
      scores[key][r] = res.score;
      if (res.win) {
        wins[key]++;
        gains[key] += res.gain;
        for (const name of res.yaku) if (!NOT_YAKU.has(name)) yaku[key][name] = (yaku[key][name] || 0) + 1;
      }
      if (res.dealin) dealins[key]++;
      if (res.tenpai) tenpais[key]++;
    }
  }
  return { runs, keys: keys.slice(), scores, wins, gains, dealins, tenpais, yaku };
}

// 鳴きの場面の試し（設計書 4.4）：'skip'（鳴かない）と面子の書き方（鳴く）を、同じ山の並びで比べる
export function simulateCall(scene, keys, opts = {}) {
  return simulate(scene, keys, { ...opts, call: true });
}

// 目指す役に数えない名前：ドラ（役でない）と、手の形でなく上がり方やリーチで付く役（ツモ・立直など。画面の確かめで足した）
const NOT_YAKU = new Set(['ドラ', '赤ドラ', '裏ドラ', '立直', 'ダブル立直', '一発', '門前清自摸和', '海底摸月', '河底撈魚', '嶺上開花', '槍槓']);

// 候補ごとのまとめ：見込める点数（ev）・上がる見込み（win）・上がったときの平均の打点（avgWin）・
// 聴牌の見込み（tenpai。段階3-5）・上がりに多く付いた役（yakuTop：多い順に2つまで { name, share }。share は上がりのうちの割合）
export function summaryOf(result, key) {
  const a = result.scores[key];
  let sum = 0;
  for (const v of a) sum += v;
  const w = result.wins[key];
  const tenpai = result.tenpais && result.tenpais[key] !== undefined ? result.tenpais[key] / result.runs : null;
  const counts = (result.yaku && result.yaku[key]) || {};
  const yakuTop = w ? Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([name, n]) => ({ name, share: n / w })) : [];
  return { ev: sum / a.length, win: w / result.runs, avgWin: w ? result.gains[key] / w : 0, tenpai, yakuTop };
}

// 2つの候補の差（a − b）の平均と、その誤差（同じ並びで比べた差の標準誤差）
export function diffOf(result, a, b) {
  const x = result.scores[a];
  const y = result.scores[b];
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i] - y[i];
  const mean = s / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (x[i] - y[i] - mean) ** 2;
  const se = n > 1 ? Math.sqrt(v / (n - 1) / n) : 0;
  return { mean, se };
}
