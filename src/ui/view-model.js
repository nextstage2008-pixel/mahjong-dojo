// 盤面（部品の Board）から、画面に出すものをまとめる。画面には触らない。
// 席は「自分から見た位置」で並べる：0 自分（下）・1 下家（右）・2 対面（上）・3 上家（左）。
import { heroine } from '../core/cast.js';
import { STYLES } from '../core/styles.js';
import Majiang from '../../vendor/majiang-core.js';

export const WIND = '東南西北';
const NUM = '一二三四';

// 河の牌の書き方（'m5'・'m5_'・'m5*'・'m5_*-' など）を読み解く
export function parseRiverTile(p) {
  return { code: p.slice(0, 2), tsumogiri: p.includes('_'), riichi: p.includes('*'), called: /[+=-]$/.test(p) };
}

// 河に並べる牌：鳴かれた牌は消し、リーチの宣言牌は横に倒す（宣言牌が鳴かれたら次の牌を倒す）。
// tsumogiri：ツモ切りの牌（段階3-5。少し薄く描く）
export function riverTiles(pai) {
  const out = [];
  let pendingSide = false;
  for (const p of pai) {
    const t = parseRiverTile(p);
    if (t.riichi) pendingSide = true;
    if (t.called) continue;
    out.push({ code: t.code, side: pendingSide, tsumogiri: t.tsumogiri });
    pendingSide = false;
  }
  return out;
}

// 副露の書き方（'m123-'・'z111='・'m5550'・'m555=5'）を、並べる牌に直す。
// side：横に倒す（鳴いた牌）。back：伏せる（暗槓の両端）。
// 鳴いた牌の位置は出した人の向きで決める（上家 - は左端・対面 = は真ん中・下家 + は右端）
export function meldTiles(m) {
  const s = m[0];
  const mark = (m.match(/[+=-]/) || [null])[0];
  const digits = m.slice(1).replace(/[+=-]/, '');
  const codes = [...digits].map((d) => s + d);
  if (!mark) return codes.map((code, i) => ({ code, side: false, back: i === 0 || i === codes.length - 1 }));
  const calledAt = m.slice(1).indexOf(mark) - 1;
  // 加槓は「刻子の3枚＋向き＋足した1枚」（嵌張のチー 'm12-3' と区別する）
  const kakan = /\d{3}[+=-]\d$/.test(m);
  const called = { code: codes[calledAt], side: true, back: false };
  const added = kakan ? { code: codes[codes.length - 1], side: true, back: false } : null;
  const rest = codes.filter((_, i) => i !== calledAt && !(kakan && i === codes.length - 1)).map((code) => ({ code, side: false, back: false }));
  const head = added ? [called, added] : [called];
  if (mark === '-') return [...head, ...rest];
  if (mark === '=') return [rest[0], ...head, ...rest.slice(1)];
  return [...rest, ...head];
}

// 自分の手牌：理牌した並び（赤5は5の先頭）と、ツモってきた牌（右に離して置く）
export function handTiles(sp) {
  const tiles = [];
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    let red = s === 'z' ? 0 : b[0];
    for (let n = 1; n < b.length; n++) {
      for (let i = 0; i < b[n]; i++) {
        if (n === 5 && red > 0) {
          tiles.push(s + '0');
          red--;
        } else tiles.push(s + n);
      }
    }
  }
  let zimo = sp._zimo && sp._zimo.length <= 2 ? sp._zimo : null;
  if (zimo) {
    const i = tiles.lastIndexOf(zimo);
    if (i >= 0) tiles.splice(i, 1);
    else zimo = null;
  }
  return { tiles, zimo };
}

// 上がりの形（手直し 7章）：上がりの知らせの shoupai（伏せていた牌＋上がり牌。副露は「,」の後）から、
// 伏せていた牌（並べた順）と上がり牌
export function revealOf(shoupai) {
  const { tiles, zimo } = handTiles(Majiang.Shoupai.fromString(shoupai));
  return { tiles, win: zimo };
}

// ロンの矢印の出どころ（手直し 7章）：振り込んだ人の河の最後の牌（印を外す）が上がり牌なら 'river'、
// 違えば（槍槓など、河にない牌でのロン）'plate'（振り込んだ人の名札から）
export function arrowFrom(riverLast, win) {
  return riverLast && riverLast.slice(0, 2) === win ? 'river' : 'plate';
}

// 伏せた手の枚数と、ツモってきた牌があるか
export function handCount(sp) {
  let n = sp._bingpai._;
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    for (let k = 1; k < b.length; k++) n += b[k];
  }
  const drawn = !!sp._zimo && sp._zimo.length <= 2;
  return { concealed: drawn ? n - 1 : n, drawn };
}

// 牌の呼び方（'s6' → '6索'・'m0' → '赤5萬'・'z5' → '白'）
const SUIT_NAME = { m: '萬', p: '筒', s: '索' };
const HONOR_NAME = '東南西北白發中';
export function tileName(code) {
  if (code[0] === 'z') return HONOR_NAME[+code[1] - 1];
  return (code[1] === '0' ? '赤5' : code[1]) + SUIT_NAME[code[0]];
}

// 局の呼び方（東一局 など）
export function roundName(zhuangfeng, jushu) {
  return WIND[zhuangfeng] + NUM[jushu] + '局';
}

// 卓に出すもの全部。myId：自分の id（いつも 0）。cast：id 1〜3 に座る相手の key
export function tableView(board, myId, cast) {
  const mySeat = board.menfeng(myId);
  const seats = [0, 1, 2, 3].map((rel) => {
    const l = (mySeat + rel) % 4;
    const id = board.player_id[l];
    const sp = board.shoupai[l];
    const h = id === myId ? null : heroine(cast[id - 1]);
    const count = handCount(sp);
    return {
      rel,
      l,
      id,
      wind: WIND[l],
      dealer: l === 0,
      name: id === myId ? 'あなた' : h ? h.name : '?',
      // CPU の型の名前（段階2-3。名札に出す。自分は空）
      style: h ? STYLES[h.style] ? STYLES[h.style].label : '' : '',
      img: h ? h.img : null,
      key: h ? h.key : null,
      score: board.defen[id],
      riichi: !!sp.lizhi,
      river: riverTiles(board.he[l]._pai),
      concealed: count.concealed,
      drawn: count.drawn,
      melds: sp._fulou.map(meldTiles),
      turn: board.lunban === l,
    };
  });
  return {
    round: roundName(board.zhuangfeng, board.jushu),
    honba: board.changbang,
    kyoutaku: board.lizhibang,
    remaining: board.shan ? board.shan.paishu : 0,
    dora: board.shan ? board.shan.baopai.slice() : [],
    seats,
    me: { ...handTiles(board.shoupai[mySeat]), melds: seats[0].melds, riichi: seats[0].riichi },
  };
}
