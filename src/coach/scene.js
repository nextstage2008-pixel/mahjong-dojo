// 指南に渡す「場面」：盤面（部品の Board）から、計算に要るものだけを取り出した素のデータ。
// 試しは別の作業場所（Web Worker）でも動かすので、関数や部品の物を含めず、数と文字だけにする。
import { visibleCounts, kindOf } from '../core/ai.js';
import { STANDARD_RULE } from '../core/rule.js';
import { deriveSeed } from '../core/rng.js';

// 赤5のうち見えているもの（自分の手・全員の副露・全員の河・ドラ表示牌）
function redSeenOf(board, menfeng) {
  const red = { m: 0, p: 0, s: 0 };
  const add = (p) => { if (p[1] === '0' && red[p[0]] !== undefined) red[p[0]]++; };
  const own = board.shoupai[menfeng];
  for (const s of ['m', 'p', 's']) red[s] += own._bingpai[s][0];
  for (let l = 0; l < 4; l++) {
    for (const m of board.shoupai[l]._fulou) for (const d of m.match(/\d/g)) add(m[0] + d);
    for (const p of board.he[l]._pai) if (!/[+=-]$/.test(p)) add(p);
  }
  for (const p of board.shan.baopai) add(p);
  return red;
}

// 全員の打牌の順番（[席, 河の番目] の並び）。親から始め、鳴かれた牌（河の牌の後ろの - = +。鳴いた人から見た向き）の次は
// 鳴いた人、ほかは次の席。組み直せない（河の並びが合わない）ときは null
export function discardOrder(board) {
  const rivers = [0, 1, 2, 3].map((l) => board.he[l]._pai);
  const total = rivers.reduce((a, r) => a + r.length, 0);
  const pos = [0, 0, 0, 0];
  const order = [];
  let cur = 0;
  while (order.length < total) {
    if (pos[cur] >= rivers[cur].length) return null;
    const p = rivers[cur][pos[cur]];
    order.push([cur, pos[cur]]);
    pos[cur]++;
    const d = p.match(/[+=-]$/);
    cur = (cur + (d ? { '-': 1, '=': 2, '+': 3 }[d[0]] : 1)) % 4;
  }
  return order;
}

// 打牌の並び（段階3-6 設計書 7.1）：discardOrder の順に { seat, n（河の番目）, code（2文字。赤5は '0' のまま）, tsumogiri, riichi }。
// 順番が組み直せなければ null（押しの気配は数えない）
export function discardsOf(board) {
  const order = discardOrder(board);
  if (!order) return null;
  return order.map(([seat, n]) => {
    const p = board.he[seat]._pai[n];
    return { seat, n, code: p.slice(0, 2), tsumogiri: p.includes('_'), riichi: p.includes('*') };
  });
}

// リーチの人の情報（段階2-2 設計書 4.1）：席・親か・宣言した番目（河の何枚目か）・現物の種類。
// 現物＝その人の河の牌と、リーチ宣言の後にほかの人（自分を含む）が切って通った牌。
// 「後に切った牌」は打牌の順番（discardOrder）から決める。順番を組み直せないときだけ、席の順と河の並びから見積もる
// （親から数えてリーチの人より後の席は宣言牌と同じ番目から、前の席は次の番目から）
export function riichiOf(board, menfeng) {
  const order = discardOrder(board);
  const out = [];
  for (let l = 0; l < 4; l++) {
    if (l === menfeng || !board.shoupai[l].lizhi) continue;
    const river = board.he[l]._pai;
    let at = river.findIndex((p) => p.includes('*'));
    if (at < 0) at = Math.max(0, river.length - 1);
    const safe = new Set(river.map(kindOf));
    const i = order ? order.findIndex(([s, n]) => s === l && n === at) : -1;
    if (i >= 0) {
      for (const [s, n] of order.slice(i + 1)) if (s !== l) safe.add(kindOf(board.he[s]._pai[n]));
    } else {
      for (let o = 0; o < 4; o++) {
        if (o === l) continue;
        const from = o > l ? at : at + 1;
        board.he[o]._pai.slice(from).forEach((p) => safe.add(kindOf(p)));
      }
    }
    out.push({ seat: l, dealer: l === 0, at, safe: [...safe] });
  }
  return out;
}

// 相手ごとの見えている材料（段階3-5 設計書 3.5）：自分以外の3人を席の順に。手牌は入れない（読みは見えているものだけから出す）。
// river：河の牌の並び（鳴かれた牌も called で残す）。riichiAt：リーチの宣言牌の河の番目。safe：その人の河の牌の種類（現物）。
// callAt：鳴いた直後の打牌の河の番目（鳴いた順。鳴いた後の手出しを数えるため。打牌の順番を組み直せないときは空）
// styles：席ごとの型（段階3-6。名札に出ている。人の席や分からない席は null）
export function opponentsOf(board, menfeng, styles = null) {
  const order = discardOrder(board);
  const callAt = [[], [], [], []];
  if (order) {
    order.forEach(([s, n], i) => {
      if (/[+=-]$/.test(board.he[s]._pai[n]) && order[i + 1]) callAt[order[i + 1][0]].push(order[i + 1][1]);
    });
  }
  const out = [];
  for (let k = 1; k < 4; k++) {
    const l = (menfeng + k) % 4;
    const pai = board.he[l]._pai;
    const river = pai.map((p) => ({ code: p.slice(0, 2), tsumogiri: p.includes('_'), riichi: p.includes('*'), called: /[+=-]$/.test(p) }));
    const at = river.findIndex((t) => t.riichi);
    out.push({
      seat: l,
      dealer: l === 0,
      riichi: !!board.shoupai[l].lizhi,
      riichiAt: at >= 0 ? at : null,
      river,
      melds: board.shoupai[l]._fulou.slice(),
      safe: [...new Set(pai.map(kindOf))],
      callAt: callAt[l],
      style: styles ? styles[l] || null : null,
    });
  }
  return out;
}

// オーラスか（東風戦は東4局、東南戦・東北戦は2つ目の場の4局目）。board は jushu・zhuangfeng を持つ盤面、rule は対局のルール
export function isLastHand(board, rule = STANDARD_RULE) {
  return board.jushu === 3 && (rule['場数'] === 1 ? board.zhuangfeng === 0 : board.zhuangfeng !== 0);
}

// board：自分の Board。menfeng：自分の席。options：切れる牌（Player の get_dapai）。
// lizhi：リーチできる打牌（できなければ null）。matchSeed：対局の種（同じ場面は同じ乱数にする）
// rule：対局の部品のルール（段階2-3。試しの赤5・喰いタン・オーラスの判定に使う。なければ標準）。
// styles：席ごとの型（段階3-6。core/cast.js の seatStyles。読みの押しの気配に使う。なければ null）
export function sceneOf(board, menfeng, { options, lizhi = null, matchSeed = 0, rule = STANDARD_RULE, styles = null }) {
  const sp = board.shoupai[menfeng];
  const turn = board.he[menfeng]._pai.length;
  const handNo = board.zhuangfeng * 4 + board.jushu;
  const threats = riichiOf(board, menfeng);
  return {
    hand: sp.toString(),
    visible: visibleCounts(board, menfeng),
    redSeen: redSeenOf(board, menfeng),
    baopai: board.shan.baopai.slice(),
    zhuangfeng: board.zhuangfeng,
    jushu: board.jushu,
    menfeng,
    changbang: board.changbang,
    lizhibang: board.lizhibang,
    // 自分があと何回引けるか（山の残りを4人で分ける）
    draws: Math.floor(board.shan.paishu / 4),
    // 自分の河の牌の種類（振聴の判定に使う）
    river: [...new Set(board.he[menfeng]._pai.map(kindOf))],
    // リーチの人（段階2-2 の押し引き）。threat はだれかがリーチしているか
    threats,
    // 相手ごとの見えている材料（段階3-5 の読み）と、打牌の並び（段階3-6 の押しの気配）
    opponents: opponentsOf(board, menfeng, styles),
    discards: discardsOf(board),
    threat: threats.length > 0,
    // オーラス（東風戦は東4局、東南戦・東北戦は2つ目の場の4局目）と、席ごとの点数（順位で答えが変わる場面を外すため）
    last: isLastHand(board, rule),
    scores: [0, 1, 2, 3].map((l) => board.defen[board.player_id[l]]),
    options: options.slice(),
    lizhi: lizhi && lizhi.length ? lizhi.slice() : null,
    seed: deriveSeed(matchSeed >>> 0, ((handNo * 16 + board.changbang) * 64 + turn) >>> 0),
    turn,
    rule,
  };
}

// 鳴きの場面（段階2-2 設計書 3.2・4.4）：打牌の番の場面と同じ材料に、鳴ける牌（向きつき）と鳴ける面子を足したもの。
// hand は自分の13枚。種は打牌の番の場面と重ならないよう、対局の種を変えてから同じ作り方で出す
export function callSceneOf(board, menfeng, { tile, choices, matchSeed = 0, rule = STANDARD_RULE, styles = null }) {
  const base = sceneOf(board, menfeng, { options: [], lizhi: null, matchSeed: (matchSeed ^ 0x5ca11) >>> 0, rule, styles });
  return { ...base, kind: 'call', tile, melds: [...(choices.peng || []), ...(choices.chi || [])] };
}
