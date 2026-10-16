// CPU の打ち方（段階1の「お手本」の素朴版）。
// 向聴数と受け入れ枚数で切る牌を選び、リーチを受けて手が遠いときは安全な牌を切る。
// 画面にも保存にも触らない。部品の Shoupai と Board を読むだけ。
import Majiang from '../../vendor/majiang-core.js';

const { Util } = Majiang;

// 34種の牌（赤5は5として数える）
export const KINDS = [];
for (const s of ['m', 'p', 's']) for (let n = 1; n <= 9; n++) KINDS.push(s + n);
for (let n = 1; n <= 7; n++) KINDS.push('z' + n);

// 'm0'（赤5）や 'm5_*' のような書き方を、'm5' のような種類に直す
export function kindOf(p) {
  return p[0] + (p[1] === '0' ? '5' : p[1]);
}

// 見えている牌の数（自分の手・全員の副露・全員の河・ドラ表示牌）
export function visibleCounts(board, menfeng) {
  const c = {};
  const add = (p) => {
    const k = kindOf(p);
    c[k] = (c[k] || 0) + 1;
  };
  const own = board.shoupai[menfeng];
  for (const s of ['m', 'p', 's', 'z']) {
    const b = own._bingpai[s];
    for (let n = 1; n < b.length; n++) c[s + n] = (c[s + n] || 0) + b[n];
  }
  for (let l = 0; l < 4; l++) {
    for (const m of board.shoupai[l]._fulou) {
      for (const d of m.match(/\d/g)) add(m[0] + d);
    }
    // 鳴かれた牌は副露の側で数えたので、河では数えない
    for (const p of board.he[l]._pai) {
      if (/[+=-]$/.test(p)) continue;
      add(p);
    }
  }
  for (const p of board.shan.baopai) add(p);
  return c;
}

// 13枚の手で、向聴数を進めるツモの残り枚数
export function ukeire(shoupai, counts) {
  const tiles = Util.tingpai(shoupai) || [];
  let total = 0;
  for (const p of tiles) total += Math.max(0, 4 - (counts[p] || 0));
  return total;
}

// 切る候補ごとに「切った後の向聴数」と「受け入れ枚数」を出す
export function evaluateDiscards(shoupai, options, counts) {
  return options.map((option) => {
    const after = shoupai.clone().dapai(option);
    return { option, tile: kindOf(option), x: Util.xiangting(after), u: ukeire(after, counts) };
  });
}

// 価値の低い牌から切る（字牌 → 1・9 → 2・8 → 残り）。ドラは後回し
export function lowValueOrder(tile, dora) {
  const n = +tile[1];
  let v = tile[0] === 'z' ? 0 : n === 1 || n === 9 ? 1 : n === 2 || n === 8 ? 2 : 3;
  if (dora.has(tile)) v += 10;
  return v;
}

// リーチしている相手に対する、その牌の安全さ（大きいほど安全）
export function safety(tile, danger, counts) {
  if (danger.genbutsu.has(tile)) return 4;
  if (tile[0] === 'z') return (counts[tile] || 0) >= 3 ? 3 : 2;
  const n = +tile[1];
  if (n === 1 || n === 9) return 1;
  return 0;
}

// リーチした相手が誰か、その相手の河にある牌（現物）は何か
export function dangerInfo(board, menfeng) {
  const genbutsu = new Set();
  let threat = false;
  for (let l = 0; l < 4; l++) {
    if (l === menfeng || !board.shoupai[l].lizhi) continue;
    threat = true;
    for (const p of board.he[l]._pai) genbutsu.add(kindOf(p));
  }
  return { threat, genbutsu };
}

// ドラの種類（ドラ表示牌の次の牌）
export function doraKinds(board) {
  return new Set(board.shan.baopai.map((p) => kindOf(Majiang.Shan.zhenbaopai(p))));
}

// 手役の方向で先に切る牌か（段階3-4 設計書 4章・5章）。染め手：他の色の数牌。対々和：手に1枚だけの牌。
// tile は牌の種類（赤5は5。段階3-5 で指南の試しからも使う）
export function directionDiscard(direction, tile, shoupai) {
  if (direction.kind === 'some') return tile[0] !== 'z' && tile[0] !== direction.suit;
  if (direction.kind === 'toitoi') return shoupai._bingpai[tile[0]][+tile[1]] === 1;
  return false;
}

// ---- 段階3-6 設計書 4〜6章：良い待ちに変わるツモ・安全牌を残す・引っ掛け（人らしい CPU だけが使う） ----

// 良い待ち：待ちの残り枚数がこの枚数以上
export const GOOD_WAIT = 6;

// discard を切った手の聴牌の形。left：聴牌なら待ちの残り枚数（受け入れ）、聴牌でなければ 0。
// betterOf()：呼ばれたときだけ数える「良い待ちに変わるツモ」の枚数（見えていない牌の種類ごとに、引いてどれかを切ると
// 待ちの残りが GOOD_WAIT 以上の聴牌になるなら、その残り枚数を足す。今の待ちの牌は上がりなので数えない）
export function tenpaiShape(shoupai, discard, counts) {
  const after = shoupai.clone().dapai(discard);
  if (Util.xiangting(after) !== 0) return { left: 0, betterOf: () => 0 };
  const waits = new Set(Util.tingpai(after) || []);
  const betterOf = () => {
    let total = 0;
    for (const k of KINDS) {
      const rest = Math.max(0, 4 - (counts[k] || 0));
      if (!rest || waits.has(k)) continue;
      const drawn = after.clone().zimo(k, false);
      const ok = (drawn.get_dapai(false) || []).some((d) => {
        const a2 = drawn.clone().dapai(d, false);
        return Util.xiangting(a2) === 0 && ukeire(a2, counts) >= GOOD_WAIT;
      });
      if (ok) total += rest;
    }
    return total;
  };
  return { left: ukeire(after, counts), betterOf };
}

// 安全牌の候補：手の中に1枚だけの字牌で、卓に（自分の手を除いて）1枚以上見えているもの（counts は自分の手を含む）
export function safeKeepKinds(shoupai, counts) {
  const out = new Set();
  for (let n = 1; n <= 7; n++) {
    const k = 'z' + n;
    if (shoupai._bingpai.z[n] === 1 && (counts[k] || 0) - 1 >= 1) out.add(k);
  }
  return out;
}

// 引っ掛け：待ちの数牌 n のどれかについて、同じ色の n−3 か n+3 が河（種類の集合）にある。字牌の待ちはならない
export function isHikkake(waits, riverKinds) {
  return waits.some((w) => {
    if (w[0] === 'z') return false;
    const n = +(w[1] === '0' ? 5 : w[1]);
    return (n - 3 >= 1 && riverKinds.has(w[0] + (n - 3))) || (n + 3 <= 9 && riverKinds.has(w[0] + (n + 3)));
  });
}

// 聴牌をとる打牌の中から引っ掛けを選ぶ（設計書6章）。sorted：並べ替え済みの候補（evaluateDiscards の形）。
// いちばん前の聴牌の打牌から受け入れの差が2枚以内のものの中で、待ちが自分の河（ownRiver ＋ 切る牌）の筋になるもの。
// 待ちの牌が河（または切る牌）にある形は振聴なので選ばない（最後のレビューの直し：両面の待ちどうしは互いに筋のため）。
// valueFor があれば、いちばん前の打牌に役があるとき、役があり点数が下がらないものだけ。なければ null
function hikkakePick(shoupai, sorted, ownRiver, valueFor) {
  const best = sorted.find((e) => e.x === 0);
  if (!best) return null;
  const bv = valueFor ? valueFor(best.option) : null;
  for (const c of sorted) {
    if (c.x !== 0 || c.u < best.u - 2 || c.u <= 0) continue;
    const waits = Util.tingpai(shoupai.clone().dapai(c.option)) || [];
    const river = new Set([...ownRiver, c.tile]);
    if (waits.some((w) => river.has(w)) || !isHikkake(waits, river)) continue;
    if (bv && bv.yaku) {
      const cv = valueFor(c.option);
      if (!cv.yaku || cv.points < bv.points) continue;
    }
    return c;
  }
  return null;
}

// 切る牌を選ぶ。direction：手役の方向（styles.js の handDirection。人らしい CPU だけ渡す。段階3-4）。
// 聴牌できる打牌があれば今の打ち方（聴牌は崩さない）。1向聴以上は、切ったあとの向聴数がいちばん小さい向聴数＋1までの牌の中で、
// 方向で先に切る牌から（並べ方は今と同じ）。
// yakuOf(option)：その牌を切った聴牌に役があるか（人らしい CPU だけ渡す）。方向に向かって鳴いた手は、役のある聴牌だけをとり、
// なければ聴牌をとらずに方向の切り方を続ける（段階3-4 作業4の直し。役のない聴牌を増やさないため）。
// 8つ目（段階3-6。人らしい CPU だけ渡す）：keepSafe＝1向聴で唯一の安全牌の候補を残す（受け入れが4枚以内しか減らない別の牌を切る。
// 手役の方向が普通のときだけ）・ownRiver＝自分の河の牌の種類（Set。あれば聴牌の取り方で引っ掛けを選ぶ）・valueFor＝打牌ごとのダマの値
export function chooseDiscard(shoupai, options, counts, danger, dora = new Set(), direction = null, yakuOf = null, { keepSafe = false, ownRiver = null, valueFor = null } = {}) {
  const ev = evaluateDiscards(shoupai, options, counts);
  const minX = Math.min(...ev.map((e) => e.x));
  if (danger && danger.threat && minX >= 2) {
    ev.sort((a, b) => safety(b.tile, danger, counts) - safety(a.tile, danger, counts) || a.x - b.x || b.u - a.u);
    return ev[0].option;
  }
  const order = (a, b) => a.x - b.x || b.u - a.u || lowValueOrder(a.tile, dora) - lowValueOrder(b.tile, dora);
  const tenpaiPick = (list) => (ownRiver && hikkakePick(shoupai, list, ownRiver, valueFor)) || list[0];
  if (direction && direction.kind !== 'normal') {
    let pool = ev;
    if (minX === 0) {
      if (!yakuOf || !shoupai._fulou.length) return tenpaiPick(ev.sort(order)).option;
      const good = ev.filter((e) => e.x === 0 && yakuOf(e.option));
      if (good.length) return tenpaiPick(good.sort(order)).option;
      pool = ev.filter((e) => e.x > 0);
      if (!pool.length) return ev.sort(order)[0].option;
    }
    const least = Math.min(...pool.map((e) => e.x));
    const want = pool.filter((e) => e.x <= least + 1 && directionDiscard(direction, e.tile, shoupai));
    return (want.length ? want : pool).sort(order)[0].option;
  }
  ev.sort(order);
  if (ev[0].x === 0) return tenpaiPick(ev).option;
  if (keepSafe && ev[0].x === 1) {
    const safe = safeKeepKinds(shoupai, counts);
    if (safe.size === 1 && safe.has(ev[0].tile)) {
      // 代わりにドラや赤5は切らない（最後のレビューの直し）
      const alt = ev.find((e) => e.x === ev[0].x && e.tile !== ev[0].tile && e.u >= ev[0].u - 4 && !dora.has(e.tile) && e.option[1] !== '0');
      if (alt) return alt.option;
    }
  }
  return ev[0].option;
}

// リーチするならその打牌（待ちが残っていなければリーチしない）
// 4つ目（段階3-6。人らしい CPU だけ渡す）：ownRiver・valueFor があれば、聴牌の取り方で引っ掛けを選ぶ（chooseDiscard と同じ）
export function chooseRiichi(shoupai, lizhiOptions, counts, { ownRiver = null, valueFor = null } = {}) {
  if (!lizhiOptions || lizhiOptions.length === 0) return null;
  const ev = evaluateDiscards(shoupai, lizhiOptions, counts).filter((e) => e.x === 0);
  ev.sort((a, b) => b.u - a.u);
  if (!ev.length || ev[0].u <= 0) return null;
  return ((ownRiver && hikkakePick(shoupai, ev, ownRiver, valueFor)) || ev[0]).option;
}

// ダマの値（段階3-4 設計書 3章）：14枚の手から discard を切ったときの、待ちごとのリーチなしのロン。
// 場の棒（本場・供託）は入れない。返すもの：{ yaku（待ちがあり、すべての待ちに役がある）, points（その中でいちばん安い点。役がなければ 0） }
export function damaValue(shoupai, discard, { zhuangfeng, menfeng, baopai, rule }) {
  const sp = shoupai.clone().dapai(discard);
  const waits = Util.tingpai(sp) || [];
  if (Util.xiangting(sp) !== 0 || !waits.length) return { yaku: false, points: 0 };
  const param = Util.hule_param({ rule, zhuangfeng, menfeng, baopai, lizhi: 0, changbang: 0, lizhibang: 0 });
  let points = Infinity;
  for (const w of waits) {
    const h = Util.hule(sp, w + '+', param);
    if (!h || !(h.defen > 0)) return { yaku: false, points: 0 };
    points = Math.min(points, h.defen);
  }
  return { yaku: true, points };
}

// 役牌（三元牌・場風・自風）
export function yakuhaiKinds(zhuangfeng, menfeng) {
  return new Set(['z5', 'z6', 'z7', 'z' + (zhuangfeng + 1), 'z' + (menfeng + 1)]);
}

// ポンするなら面子（役牌だけポンする）
export function choosePon(rongpai, mianzi, yakuhai) {
  if (!mianzi || mianzi.length === 0) return null;
  return yakuhai.has(kindOf(rongpai)) ? mianzi[0] : null;
}

// 面子がポン・カン（同じ牌3枚以上）か（赤5は5とみる）。チーは false
export function isSetMeld(m) {
  return /^[mpsz](\d)\1\1/.test(m.replace(/0/g, '5'));
}

// 鳴いた後の役の見込み（段階2-3 設計書 2.3。CPU の鳴きと指南の鳴きの考えどころで同じものを使う）。
// shoupai：鳴く前の手。meld：鳴く面子の書き方。返すもの：{ kind, tile }。kind は 'pon'（役牌のポン）・'meld'（鳴いてある役牌）・
// 'anko'（手の中の役牌の刻子）・'tanyao'（喰いタンありで、手も鳴いてある面子も鳴く面子もすべて2〜8）・null（役がないかも。
// 混一色・対々和などは見ない）。looseTanyao：手の中の1・9牌・字牌がこの枚数までなら断么九の見込みとみる（後で切る。鳴き屋。段階2-3）。
// wide：混一色・対々和も見る（人らしい CPU だけ。指南は見ない。段階3-4 設計書 6章）。kind は 'honitsu'（tile は色）・'toitoi'。
// 混一色：鳴いた後の面子がすべて1つの色か字牌で、手に残る他の色の数牌が someLoose 枚まで。
// 対々和：鳴いた後の面子がすべてポン・カンで、（面子の数＋手の中の対子と刻子の数）が4以上
export function yakuOutlook(shoupai, meld, { zhuangfeng, menfeng, kuitan = true, looseTanyao = 0, wide = false, someLoose = 2 }) {
  const yakuhai = yakuhaiKinds(zhuangfeng, menfeng);
  const isYakuPon = (m) => /^z(\d)\1\1/.test(m) && yakuhai.has('z' + m[1]);
  if (isYakuPon(meld)) return { kind: 'pon', tile: 'z' + meld[1] };
  const done = shoupai._fulou.find(isYakuPon);
  if (done) return { kind: 'meld', tile: 'z' + done[1] };
  const anko = [...yakuhai].find((k) => shoupai._bingpai.z[+k[1]] >= 3);
  if (anko) return { kind: 'anko', tile: anko };
  const simple = (s, n) => s !== 'z' && n !== 1 && n !== 9;
  const meldSimple = (m) => m.match(/\d/g).every((d) => simple(m[0], +d === 0 ? 5 : +d));
  let yaojiu = shoupai._bingpai.z.reduce((a, n) => a + n, 0);
  for (const s of ['m', 'p', 's']) yaojiu += shoupai._bingpai[s][1] + shoupai._bingpai[s][9];
  if (kuitan && yaojiu <= looseTanyao && shoupai._fulou.every(meldSimple) && meldSimple(meld)) return { kind: 'tanyao', tile: null };
  if (wide) {
    const after = shoupai.clone();
    after.fulou(meld, false);
    const melds = after._fulou;
    const num = (s) => after._bingpai[s].slice(1).reduce((a, n) => a + n, 0);
    const suits = new Set(melds.map((m) => m[0]).filter((s) => s !== 'z'));
    if (suits.size <= 1) {
      // 色：数牌の面子の色。字牌の面子だけなら、手の数牌のいちばん多い色（同じなら m・p・s）
      const suit = suits.size ? [...suits][0] : ['m', 'p', 's'].reduce((a, s) => (num(s) > num(a) ? s : a), 'm');
      const off = ['m', 'p', 's'].filter((s) => s !== suit).reduce((a, s) => a + num(s), 0);
      if (off <= someLoose) return { kind: 'honitsu', tile: suit };
    }
    if (melds.every(isSetMeld)) {
      let groups = melds.length;
      for (const s of ['m', 'p', 's', 'z']) {
        const b = after._bingpai[s];
        for (let n = 1; n < b.length; n++) if (b[n] >= 2) groups++;
      }
      if (groups >= 4) return { kind: 'toitoi', tile: null };
    }
  }
  return { kind: null, tile: null };
}
