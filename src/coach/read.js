// 読み（段階3-5 設計書 3章）：相手の聴牌の見込み・当たる見込み・役の気配・高さを、見えているものだけから出す。
// 相手1人の材料は scene.js の opponentsOf の形（{ seat, dealer, riichi, riichiAt, river, melds, safe, callAt }）。手牌は見ない。
// 画面に触らない（Web Worker でも動く）。
import Majiang from '../../vendor/majiang-core.js';
import { yakuhaiKinds, isSetMeld, kindOf, KINDS } from '../core/ai.js';
import { categoryOf, dangerOf } from './danger.js';
import { STYLES } from '../core/styles.js';
import { doraKindsOf } from './count.js';
import { handCounts, summaryOf } from './sim.js';

const { Shoupai } = Majiang;

// 牌の書き方の数字（赤5は5）
const numOf = (code) => (code[1] === '0' ? 5 : +code[1]);
const isAnkan = (m) => /^[mpsz]\d{4}$/.test(m);

// その人の巡目：河の牌の数（鳴かれた牌も数える）
export function turnOf(opp) {
  return opp.river.length;
}

// 巡目の帯：〜6・7〜9・10〜12・13〜
export function turnBand(turn) {
  return turn <= 6 ? 'early' : turn <= 9 ? 'mid' : turn <= 12 ? 'late' : 'end';
}

// 暗槓を除く副露の数
export function callCount(opp) {
  return opp.melds.filter((m) => !isAnkan(m)).length;
}

// 最後の副露の後の手出しの回数（鳴いた直後の打牌も手出しに数える）。鳴いていなければ 0
export function tedashiAfterCall(opp) {
  const at = opp.callAt && opp.callAt.length ? opp.callAt[opp.callAt.length - 1] : null;
  if (at === null || at === undefined) return 0;
  return opp.river.slice(at).filter((t) => !t.tsumogiri).length;
}

// 門前の気配：最後から続くツモ切りの回数・直近6打の中ほどの数牌（3〜7）の手出しの回数・7巡目以降に字牌の手出しがあったか
export function menzenSigns(opp) {
  const r = opp.river;
  let tsumogiriRun = 0;
  for (let i = r.length - 1; i >= 0 && r[i].tsumogiri; i--) tsumogiriRun++;
  const midTedashi = r.slice(-6).filter((t) => !t.tsumogiri && t.code[0] !== 'z' && numOf(t.code) >= 3 && numOf(t.code) <= 7).length;
  const lateSafeTedashi = r.some((t, i) => i >= 6 && !t.tsumogiri && t.code[0] === 'z');
  return { tsumogiriRun, midTedashi, lateSafeTedashi };
}

// ダマの気配（段階3-6 設計書 7.1）：門前でリーチしていない相手の河と、場面の打牌の並び（scene.discards）から。
// 返すもの：[{ kind, turn（その牌の河の番目＋1）, code }]（巡目の順）。kind：
// 'push'＝ほかの相手のリーチの宣言の後に、その時点の現物でも両筋でもない中ほどの数牌（3〜7）を切った（discards が null なら数えない）／
// 'safe'＝7枚目以降の字牌の手出し／'safeSeen'＝そのうち前に同じ字牌が切られていたもの（discards が要る）／
// 'strong'＝6枚目以降のドラか赤5の手出し／'tsumoAfter'＝7枚目以降の最後の手出しの後にツモ切りが2回以上（turn は最後の手出し）／
// 'lateMid'＝直近3打のうち10枚目以降の中ほどの数牌の手出し
export function damaSigns(opp, scene) {
  if (opp.riichi || callCount(opp) > 0) return [];
  const out = [];
  const river = opp.river;
  const order = scene.discards || null;
  const mid = (code) => code[0] !== 'z' && numOf(code) >= 3 && numOf(code) <= 7;
  if (order) {
    for (const r of scene.opponents || []) {
      if (r.seat === opp.seat || !r.riichi) continue;
      const at = order.findIndex((d) => d.seat === r.seat && d.riichi);
      if (at < 0) continue;
      const safe = new Set(order.slice(0, at + 1).filter((d) => d.seat === r.seat).map((d) => kindOf(d.code)));
      for (let i = at + 1; i < order.length; i++) {
        const d = order[i];
        if (d.seat === opp.seat && mid(d.code)) {
          const k = kindOf(d.code);
          const n = numOf(k);
          const has = (m) => safe.has(k[0] + m);
          const suji = n === 3 ? has(6) : n === 7 ? has(4) : has(n - 3) && has(n + 3);
          if (!safe.has(k) && !suji) out.push({ kind: 'push', turn: d.n + 1, code: d.code });
        }
        safe.add(kindOf(d.code));
      }
    }
  }
  const dora = doraKindsOf(scene.baopai || []);
  river.forEach((t, n) => {
    if (t.tsumogiri) return;
    if (n >= 6 && t.code[0] === 'z') {
      out.push({ kind: 'safe', turn: n + 1, code: t.code });
      const i = order ? order.findIndex((d) => d.seat === opp.seat && d.n === n) : -1;
      if (i > 0 && order.slice(0, i).some((d) => kindOf(d.code) === t.code)) out.push({ kind: 'safeSeen', turn: n + 1, code: t.code });
    }
    if (n >= 5 && (dora.has(kindOf(t.code)) || t.code[1] === '0')) out.push({ kind: 'strong', turn: n + 1, code: t.code });
  });
  let last = -1;
  for (let i = river.length - 1; i >= 0; i--) if (!river[i].tsumogiri) { last = i; break; }
  if (last >= 6 && river.length - 1 - last >= 2) out.push({ kind: 'tsumoAfter', turn: last + 1, code: river[last].code });
  for (let n = Math.max(0, river.length - 3); n < river.length; n++) {
    const t = river[n];
    if (n >= 9 && !t.tsumogiri && mid(t.code)) out.push({ kind: 'lateMid', turn: n + 1, code: t.code });
  }
  return out.sort((a, b) => a.turn - b.turn);
}

// 副露の牌の書き方（赤5は '0' のまま）
const meldCodes = (m) => (m.match(/\d/g) || []).map((d) => m[0] + d);
const simple = (code) => code[0] !== 'z' && numOf(code) >= 2 && numOf(code) <= 8;

// 役の読み：'tanyao'（副露がすべて2〜8で1つ以上）・'yakuhai'（役牌の副露）・'some:m|p|s'（副露2つ以上が1つの色の数牌と字牌だけで、
// 河にその色が1枚以下・他の色の数牌が6枚以上）・'toitoi'（副露がすべてポン・カンで3つ以上）。
// 染め手と対々和は、道場の CPU どうしの400半荘で条件を絞った（設計書14章。ゆるい条件では役に入っている割合が2割前後だった）
export function yakuRead(opp, scene) {
  const melds = opp.melds;
  const kinds = [];
  if (melds.length && melds.every((m) => meldCodes(m).every(simple))) kinds.push('tanyao');
  const yh = yakuhaiKinds(scene.zhuangfeng, opp.seat);
  if (melds.some((m) => m[0] === 'z' && isSetMeld(m) && yh.has('z' + m[1]))) kinds.push('yakuhai');
  const suits = [...new Set(melds.map((m) => m[0]).filter((s) => s !== 'z'))];
  if (suits.length === 1 && melds.length >= 2) {
    const s = suits[0];
    const own = opp.river.filter((t) => t.code[0] === s).length;
    const others = opp.river.filter((t) => t.code[0] !== 'z' && t.code[0] !== s).length;
    if (own <= 1 && others >= 6) kinds.push('some:' + s);
  }
  if (melds.length >= 3 && melds.every(isSetMeld)) kinds.push('toitoi');
  return { kinds };
}

// 見えている翻：副露の中のドラ・赤5の枚数＋役牌の副露の翻（連風は2）＋染め手の見込み1＋対々和の見込み2（高さの段を数えるため）
export function visibleHan(opp, scene) {
  const dora = doraKindsOf(scene.baopai);
  let han = 0;
  for (const m of opp.melds) {
    for (const code of meldCodes(m)) {
      const kind = code[0] + numOf(code);
      if (dora.has(kind)) han++;
      if (code[1] === '0') han++;
    }
    if (m[0] === 'z' && isSetMeld(m)) {
      const k = 'z' + m[1];
      if (k === 'z' + (scene.zhuangfeng + 1)) han++;
      if (k === 'z' + (opp.seat + 1)) han++;
      if (['z5', 'z6', 'z7'].includes(k)) han++;
    }
  }
  const kinds = yakuRead(opp, scene).kinds;
  if (kinds.some((k) => k.startsWith('some:'))) han++;
  if (kinds.includes('toitoi')) han += 2;
  return han;
}

// 危なさの材料（場面ごとに1回だけ作る）：見えている枚数・自分の手の枚数・巡目
export function readCtx(scene) {
  return { visible: scene.visible, own: handCounts(Shoupai.fromString(scene.hand)), turn: scene.turn + 1 };
}

// 牌の書き方（danger.js の categoryOf と同じ分け方。現物はその人の河）。ctx は readCtx（省けば作る）
export function categoryFor(kind, opp, scene, ctx = readCtx(scene)) {
  return categoryOf(kind, { safe: opp.safe }, ctx);
}

// ---- 読みの見込み（段階3-5 設計書 3.1〜3.3。数字は段階3-6 設計書16.1 で数え直した：段階3-6 の人らしい CPU 4人の400半荘・
// 種1〜400・標準ルール。ならし方は段階3-5 設計書14章と同じ） ----

// 警戒：リーチの人か、聴牌の見込みがこの値以上の人がいる
export const ALERT = 0.3;

// 鳴いた人（リーチなし）の聴牌の割合：[鳴いた数][巡目の帯] → [鳴いた後の手出し 1回・2回・3回以上]。
// 件数 30 未満のマスは同じ鳴いた数・巡目の帯の全体の値。3つ鳴いた人は件数が少なくぶれるので手出しをまとめ、
// 巡目が進んでも下がらないようにならした。4つ鳴いた人は数えた限り全部聴牌（1）
const TENPAI_CALLED = {
  1: { early: [0.057, 0.07, 0.086], mid: [0.223, 0.245, 0.197], late: [0.359, 0.357, 0.271], end: [0.462, 0.469, 0.323] },
  2: { early: [0.282, 0.201, 0.166], mid: [0.447, 0.385, 0.306], late: [0.563, 0.51, 0.4], end: [0.63, 0.603, 0.485] },
  3: { early: [0.688, 0.688, 0.688], mid: [0.815, 0.815, 0.815], late: [0.815, 0.815, 0.815], end: [0.815, 0.815, 0.815] },
};
// 門前でリーチしていない人の聴牌の割合（巡目の帯ごと。気配のないときの土台）
export const TENPAI_MENZEN = { early: 0.002, mid: 0.015, late: 0.039, end: 0.081 };
// ダマの気配のマス（段階3-6 設計書 7.2・16.1）：気配があるときの聴牌の割合。全体の2倍以上・100件以上・5%以上のマスだけ
// （100件未満の型のマスは次の帯と件数を足した）。使うのはリーチへの押しだけ（ほかの気配は道場の CPU では効かなかった）。
// 押しは押した人の型で引く（攻め屋の押しは全体より低いので使わない）。型が分からなければ all
export const TENPAI_SIGN = {
  push: {
    all: { early: 0.073, mid: 0.091, late: 0.105 },
    model: { early: 0.464, mid: 0.462, late: 0.457, end: 0.218 },
    defense: { early: 0.248, mid: 0.248, late: 0.15, end: 0.2 },
    caller: { early: 0.365, mid: 0.327, late: 0.32, end: 0.284 },
  },
};
// リーチのない聴牌の人に、その牌の書き方で当たる割合（鳴いた人・ダマ）
const WAIT_HIT = {
  called: { genbutsu: 0, katasuji: 0.0759, musuji19: 0.0325, musuji28: 0.0626, musuji37: 0.0905, musuji456: 0.0944, nakasuji: 0.0553, nochance: 0.0306, onechance: 0.0504, suji19: 0.0149, suji28: 0.0219, suji37: 0.0502, z0: 0.0373, z1: 0.0183, z2: 0.0023, z3: 0.0003 },
  dama: { genbutsu: 0, katasuji: 0.0782, musuji19: 0.0392, musuji28: 0.0651, musuji37: 0.0969, musuji456: 0.1143, nakasuji: 0.0385, nochance: 0.0245, onechance: 0.0545, suji19: 0.0103, suji28: 0.0189, suji37: 0.0341, z0: 0.0256, z1: 0.016, z2: 0.0036, z3: 0 },
};
// 役の読みで当たりにくい牌に本当に当たった割合（牌の種類ごと）。断么九の読み→1・9・字牌、染め手の読み→他の色の数牌。
// この値を上限にする（0 にはしない。読みが外れていることがあるため）
export const EXCLUDED = { tanyao: 0.0049, some: 0.0157 };
// リーチのない鳴いた人の上がりの平均点：[見えている翻（4以上は4）] → [子, 親]。門前（ダマ）は [子, 親]
const VALUE_CALLED = { 0: [2900, 5000], 1: [2500, 3700], 2: [3900, 6300], 3: [6100, 8600], 4: [8300, 13100] };
const VALUE_MENZEN = [4400, 6300];
// リーチの上がりの平均点 [子, 親]
export const RIICHI_AVG = [5500, 8500];

const SUIT_NAME = { m: '萬子', p: '筒子', s: '索子' };
const HONOR = '東南西北白發中';
const fmtPts = (v) => v.toLocaleString('ja-JP');

// 使う気配のマスの値（なければ null）。押しは押した人の型のマス（型が分からなければ all）
function signCell(kind, opp, band) {
  const t = TENPAI_SIGN[kind];
  if (!t) return null;
  const cells = kind === 'push' ? t[opp.style || 'all'] : t;
  return cells && cells[band] !== undefined ? cells[band] : null;
}

// 気配の言葉。押しは型を括弧で添える（style：false なら添えない。札は名札に型が出ているので添えない）
const SIGN_TEXT = {
  push: (x, opp, style = true) => `リーチに無筋を押した${style && opp.style && STYLES[opp.style] ? `（${STYLES[opp.style].label}）` : ''}`,
  safe: () => '字牌の安全牌を手出し',
  safeSeen: () => '見えていた字牌を手出し',
  strong: (x) => (x.code[1] === '0' ? '赤5を手出し' : 'ドラを手出し'),
  tsumoAfter: () => '手出しの後ツモ切りが続く',
  lateMid: () => '終盤に中ほどの牌を手出し',
};

// 使う気配（段階3-6 設計書 7.5）：damaSigns のうち、今の巡目の帯に気配のマスがあるものだけ（古い順）。text は画面の言葉、
// short は札の言葉（型の括弧なし）
export function usedSigns(opp, scene) {
  const band = turnBand(turnOf(opp));
  return damaSigns(opp, scene)
    .filter((x) => signCell(x.kind, opp, band) !== null)
    .map((x) => ({ ...x, text: SIGN_TEXT[x.kind](x, opp), short: SIGN_TEXT[x.kind](x, opp, false) }));
}

// 聴牌の見込み（0〜1）：リーチ＝1・鳴いた人＝鳴いた数×巡目の帯×鳴いた後の手出し・
// 門前でリーチなし＝巡目の帯の土台と、使う気配のマスのうちいちばん高い値の大きいほう（掛け合わせない。段階3-6）
export function tenpaiChance(opp, scene) {
  if (opp.riichi) return 1;
  const band = turnBand(turnOf(opp));
  const cc = callCount(opp);
  if (cc >= 4) return 1;
  if (cc > 0) return TENPAI_CALLED[cc][band][Math.min(Math.max(tedashiAfterCall(opp), 1), 3) - 1];
  return Math.max(TENPAI_MENZEN[band], ...usedSigns(opp, scene).map((x) => signCell(x.kind, opp, band)));
}

// 聴牌のとき、その牌（種類）が当たり牌である見込み。リーチの人は今の放銃率（dangerOf。threat はその人のリーチの情報）。
// リーチのない人は数えた表。役の読みで当たりにくい牌は EXCLUDED を上限にする
export function waitChance(kind, opp, scene, ctx = readCtx(scene), threat = null) {
  if (opp.riichi) return dangerOf(kind, threat || { safe: opp.safe }, ctx);
  const table = callCount(opp) > 0 ? WAIT_HIT.called : WAIT_HIT.dama;
  let w = table[categoryFor(kind, opp, scene, ctx)] ?? 0;
  const kinds = yakuRead(opp, scene).kinds;
  const yaojiu = kind[0] === 'z' || kind[1] === '1' || kind[1] === '9';
  if (kinds.includes('tanyao') && yaojiu) w = Math.min(w, EXCLUDED.tanyao);
  const some = kinds.find((k) => k.startsWith('some:'));
  if (some && kind[0] !== 'z' && kind[0] !== some[5]) w = Math.min(w, EXCLUDED.some);
  return w;
}

// 高さ：リーチは平均点。ほかは見えている翻ごとの平均点で段を決める（子は 3,000点未満＝安め・6,000点未満＝中くらい・以上＝高め。
// 親は1.5倍の境）。返すもの：{ band: 'low'|'mid'|'high'|'riichi', points, label }
export function valueRead(opp, scene) {
  const d = opp.dealer ? 1 : 0;
  if (opp.riichi) return { band: 'riichi', points: RIICHI_AVG[d], label: `リーチ（平均${fmtPts(RIICHI_AVG[d])}点）` };
  const points = callCount(opp) > 0 ? VALUE_CALLED[Math.min(visibleHan(opp, scene), 4)][d] : VALUE_MENZEN[d];
  const k = opp.dealer ? 1.5 : 1;
  const band = points < 3000 * k ? 'low' : points < 6000 * k ? 'mid' : 'high';
  return { band, points, label: { low: '安め', mid: '中くらい', high: '高め' }[band] };
}

// 役の読みの言葉（役牌は牌の名前＋ポン、染め手は色、副露の中のドラの枚数）と、当たりにくい牌の一言
function yakuWords(opp, scene) {
  const kinds = yakuRead(opp, scene).kinds;
  const words = [];
  const yh = yakuhaiKinds(scene.zhuangfeng, opp.seat);
  for (const m of opp.melds) if (m[0] === 'z' && isSetMeld(m) && yh.has('z' + m[1])) words.push(`${HONOR[+m[1] - 1]}ポン`);
  if (kinds.includes('tanyao')) words.push('断么九');
  const some = kinds.find((k) => k.startsWith('some:'));
  if (some) words.push(`${SUIT_NAME[some[5]]}の染め手`);
  if (kinds.includes('toitoi')) words.push('対々和');
  const dora = doraKindsOf(scene.baopai);
  const nd = opp.melds.reduce((a, m) => a + meldCodes(m).filter((c) => dora.has(c[0] + numOf(c)) || c[1] === '0').length, 0);
  if (nd) words.push(`ドラ${nd}`);
  let pass = null;
  if (kinds.includes('tanyao')) pass = '1・9・字牌は通りやすい';
  else if (some) pass = `${['m', 'p', 's'].filter((s) => s !== some[5]).map((s) => SUIT_NAME[s]).join('・')}は通りやすい`;
  return { words, pass };
}

// 読み（場面ひとつ）：相手ごとの聴牌の見込み・役・高さ・札の1行と、候補ごとのロンされる確率（警戒している相手だけを足す）
export function readOf(scene) {
  const ctx = readCtx(scene);
  const opponents = (scene.opponents || []).map((o) => {
    const tenpai = tenpaiChance(o, scene);
    const value = valueRead(o, scene);
    const { words, pass } = yakuWords(o, scene);
    const wari = Math.round(tenpai * 10);
    // ダマの気配（段階3-6 設計書 7.5）：門前でリーチしていない人に使う気配があれば、札に「ダマの気配」と理由（新しい順に2つまで）
    const signs = usedSigns(o, scene);
    const dama = signs.length ? ['ダマの気配'] : [];
    const label = o.riichi ? value.label : [wari ? `聴牌${wari}割` : '聴牌1割未満', ...words, ...dama, value.label].join('・');
    const why = signs.length ? `気配：${signs.slice(-2).reverse().map((x) => `${x.turn}巡目 ${x.text}`).join('・')}` : null;
    // 札（幅が狭い）はいちばん新しい気配1つだけ・型の括弧なし（画面の確かめで、2行目が折り返して名札に接したため）
    const last = signs[signs.length - 1];
    const tagWhy = last ? `気配：${last.turn}巡目 ${last.short}` : null;
    // 読みに入れていない押し（最後のレビューの直し）：押しはあったが、その型（攻め屋など）の押しのマスがないもの。巡目ごとに1つ。
    // 振り込んだ局の行・答え合わせで「気配はありません」と言わないために使う
    const unused = [];
    for (const x of damaSigns(o, scene)) {
      if (x.kind !== 'push' || signs.some((s) => s.kind === 'push' && s.turn === x.turn) || unused.some((u) => u.turn === x.turn)) continue;
      unused.push({ turn: x.turn, code: x.code, label: o.style && STYLES[o.style] ? STYLES[o.style].label : null });
    }
    return { seat: o.seat, dealer: o.dealer, riichi: o.riichi, tenpai, alert: o.riichi || tenpai >= ALERT, yaku: yakuRead(o, scene).kinds, value, label, pass, signs, why, tagWhy, unused };
  });
  const threatOf = (o) => (scene.threats || []).find((t) => t.seat === o.seat) || null;
  const dangers = {};
  for (const option of scene.options || []) {
    const key = option.slice(0, 2);
    if (dangers[key]) continue;
    const kind = key[0] + numOf(key);
    // 合計は警戒している相手だけ。内訳には3人とも入れる（振り込んだ局の1行で、警戒の外の相手の見込みも言えるように）
    let none = 1;
    const each = [];
    for (const [i, o] of (scene.opponents || []).entries()) {
      const t = tenpaiChance(o, scene);
      const p = t * waitChance(kind, o, scene, ctx, threatOf(o));
      const alert = opponents[i].alert;
      each.push({ seat: o.seat, p, alert });
      if (alert) none *= 1 - p;
    }
    dangers[key] = { p: 1 - none, each: each.filter((e) => e.alert).concat(each.filter((e) => !e.alert)) };
  }
  return { alert: opponents.some((o) => o.alert), opponents, dangers };
}

// ---- 試算の材料（段階3-7 設計書 4章） ----

// 警戒しているリーチのない相手ごとの、試算の材料：聴牌の見込み（tenpai）・振り込んだときの失点（points＝高さの平均点）・
// 見えていない牌の種類ごとの当たる見込み（hit。赤5も五の種類）。sim.js は read.js を読み込めない（輪になる）ので、
// 番の始めにここで作って場面に付ける（withWatch）。相手の材料のない場面は []
export function watchOf(scene) {
  const read = readOf(scene);
  const ctx = readCtx(scene);
  const out = [];
  (scene.opponents || []).forEach((o, i) => {
    const r = read.opponents[i];
    if (!r || !r.alert || o.riichi) return;
    const hit = {};
    for (const k of KINDS) {
      if ((scene.visible[k] || 0) >= 4) continue;
      hit[k] = waitChance(k, o, scene, ctx);
    }
    out.push({ seat: o.seat, dealer: !!o.dealer, tenpai: r.tenpai, points: r.value.points, hit });
  });
  return out;
}

// 場面に試算の材料を付ける（付いていればそのまま）
export function withWatch(scene) {
  return scene.watch ? scene : { ...scene, watch: watchOf(scene) };
}

// ---- 自分の手（段階3-5 設計書 3.4） ----

// 残りのツモ draws 回のうちに、有効牌 useful 枚（見えていない牌 unseen 枚の中）を1枚でも引く確率（超幾何）
export function tenpaiByDraws(useful, unseen, draws) {
  if (draws <= 0 || useful <= 0 || unseen <= 0) return 0;
  if (useful >= unseen) return 1;
  let none = 1;
  for (let i = 0; i < draws; i++) {
    const rest = unseen - i;
    if (rest <= 0) break;
    none *= Math.max(0, rest - useful) / rest;
    if (none === 0) break;
  }
  return 1 - none;
}

// 自分の手の行：cand（count.js の候補）を切ったときの聴牌の確率・上がる見込み・上がりに多く付いた役・上がったときの平均点。
// 聴牌の確率は、聴牌なら1、1向聴なら式（受け入れ枚数・見えていない牌・残りのツモ）、2向聴以上は試し（sim）の結果。
// 試していなければ、上がる見込みと役と平均点は出さない（null・空）
export function ownLine(cand, sim, scene) {
  const s = sim && sim.keys && sim.keys.includes(cand.key) ? summaryOf(sim, cand.key) : null;
  let tenpai = null;
  if (cand.x <= 0) tenpai = 1;
  else if (cand.x === 1) {
    const unseen = Object.keys(scene.visible).length ? 136 - Object.values(scene.visible).reduce((a, b) => a + b, 0) : 136;
    tenpai = tenpaiByDraws(cand.n, unseen, scene.draws);
  } else if (s) tenpai = s.tenpai;
  return { tenpai, win: s ? s.win : null, yaku: s ? s.yakuTop : [], avg: s && s.win ? s.avgWin : null };
}

// 答え合わせの1行（段階3-6 設計書 8.2）：read は readOf の相手（label・signs）、opp は場面の相手、truth は truthOf、nameOf は牌の名前。
// 本当が門前でリーチしていない聴牌（ダマ）なら「聴牌（ダマ）」とし、札の後ろにその時点の気配（なければ「気配なし」）を足す
export function reviewTruth(read, opp, truth, nameOf) {
  if (!truth.tenpai) return { label: read.label, truth: '聴牌していない' };
  const waits = `${truth.waits.map(nameOf).join('・')}待ち`;
  if (opp.riichi || callCount(opp) > 0) return { label: read.label, truth: `聴牌・${waits}` };
  const signs = read.signs || [];
  const unused = read.unused || [];
  const mark = signs.length
    ? `（気配：${signs.map((x) => `${x.turn}巡目 ${x.text}`).join('・')}）`
    : unused.length
      ? `（読みに入れていない押し：${unused.map((x) => `${x.turn}巡目`).join('・')}${unused[0].label ? `・${unused[0].label}` : ''}）`
      : '（気配なし）';
  return { label: read.label + mark, truth: `聴牌（ダマ）・${waits}` };
}

// 本当の手（段階3-5 設計書 7章。感想戦・問題集の答え合わせだけに使う）：聴牌か・待ちの牌の種類
export function truthOf(hand) {
  const sp = Shoupai.fromString(hand);
  if (Majiang.Util.xiangting(sp) !== 0) return { tenpai: false, waits: [] };
  return { tenpai: true, waits: Majiang.Util.tingpai(sp) || [] };
}
