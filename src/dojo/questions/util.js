// 道場の問題の部品（段階4-1 作業3）：乱数・選択肢・牌の書き方・上がりの形の手の作り方・役の名前。
import Majiang from '../../../vendor/majiang-core.js';
import { createRng } from '../../core/rng.js';
import { STANDARD_RULE } from '../../core/rule.js';
import { tileName } from '../../ui/view-model.js';

const { Shoupai, Util } = Majiang;

export const rngOf = (seed) => createRng((seed ^ 0x9e3779b9) >>> 0);
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 正解と、重ならない間違いの選択肢を並べる（並びは種で決まる）。same：同じ選択肢か。fixed：渡した順のまま（正解が入っていること）
export function withChoices(rng, correct, wrongs, { count = 4, same = (a, b) => a === b, fixed = null } = {}) {
  if (fixed) {
    const answer = fixed.findIndex((x) => same(x, correct));
    if (answer < 0) throw new Error('選択肢に正解がない');
    return { choices: fixed, answer };
  }
  const uniq = [];
  for (const w of wrongs) if (!same(w, correct) && !uniq.some((u) => same(u, w))) uniq.push(w);
  if (uniq.length < count - 1) throw new Error('間違いの選択肢が足りない');
  const choices = shuffled(rng, [correct, ...shuffled(rng, uniq).slice(0, count - 1)]);
  return { choices, answer: choices.findIndex((x) => x === correct) };
}

// 作れなかったら作り直す（make が null を返したら作り直し）。上限まで作れなければ投げる（index.js の generateWithFallback が拾う）
export function retry(rng, make, limit = 3000) {
  for (let i = 0; i < limit; i++) {
    const r = make(rng);
    if (r) return r;
  }
  throw new Error('問題を作れなかった');
}

// 赤5を5に（同じ牌として比べる）
export const kindOf = (code) => (code[1] === '0' ? `${code[0]}5` : code);
const order = (code) => 'mpsz'.indexOf(code[0]) * 10 + (code[1] === '0' ? 5 : +code[1]) + (code[1] === '0' ? 0.5 : 0);
export const sortCodes = (codes) => codes.slice().sort((a, b) => order(a) - order(b));

// majiang の書き方（'m120p55z1'。鳴きの ',' より前だけ）を牌の列に
export function codesOf(str) {
  const out = [];
  let suit = null;
  for (const ch of String(str).split(',')[0]) {
    if ('mpsz'.includes(ch)) suit = ch;
    else if (/\d/.test(ch) && suit) out.push(suit + ch);
  }
  return out;
}

// 牌の列を majiang の書き方に（並べ替える）
export function stringOf(codes) {
  const by = { m: '', p: '', s: '', z: '' };
  for (const c of sortCodes(codes)) by[c[0]] += c[1];
  return Object.entries(by).filter(([, v]) => v).map(([k, v]) => k + v).join('');
}

export const shoupaiOf = (codes, melds = []) => Shoupai.fromString([stringOf(codes), ...melds].join(','));
export const namesOf = (codes) => codes.map(tileName).join('');

// 面子（組）と雀頭（頭）でできた上がりの形の手を作る。
// opts：sets（組の数。既定4）・shun（順子にする割合）・suits（使う色 'mps'）・honors（字牌を使う）・tanyao（2〜8だけ）・
// pinned（決めておく組 [{ kind: 'shun'|'ke', tile }]）・pairTile（頭を決める）・red（赤5にする割合）。
// 返す値：{ codes（14枚・並べた）, sets: [{ kind, tile, codes }], pair: { tile, codes } } か null（同じ牌が5枚以上になるなど）
export function makeHand(rng, opts = {}) {
  const { sets = 4, shun = 0.7, suits = 'mps', honors = true, tanyao = false, pinned = [], pairTile = null, red = 0.3 } = opts;
  const counts = {};
  const add = (k) => { counts[k] = (counts[k] || 0) + 1; return counts[k] <= 4; };
  const lo = tanyao ? 2 : 1;
  const hi = tanyao ? 8 : 9;
  const randomNumberTile = (maxStart) => `${pick(rng, suits)}${lo + Math.floor(rng() * (maxStart - lo + 1))}`;
  const out = [];
  for (const p of pinned) out.push(p);
  while (out.length < sets) {
    if (rng() < shun) out.push({ kind: 'shun', tile: randomNumberTile(hi - 2) });
    else if (honors && !tanyao && rng() < 0.3) out.push({ kind: 'ke', tile: `z${1 + Math.floor(rng() * 7)}` });
    else out.push({ kind: 'ke', tile: randomNumberTile(hi) });
  }
  const setCodes = out.map((s) => {
    const n = +s.tile[1];
    const codes = s.kind === 'shun' ? [0, 1, 2].map((d) => `${s.tile[0]}${n + d}`) : [s.tile, s.tile, s.tile];
    return { ...s, codes };
  });
  const pt = pairTile ?? (honors && !tanyao && rng() < 0.25 ? `z${1 + Math.floor(rng() * 7)}` : randomNumberTile(hi));
  for (const s of setCodes) for (const c of s.codes) if (!add(c)) return null;
  if (!add(pt) || !add(pt)) return null;
  // 赤5：色ごとに5があれば、決まった割合で1枚を赤に
  const flat = [...setCodes.flatMap((s) => s.codes), pt, pt];
  for (const suit of 'mps') {
    const i = flat.findIndex((c) => c === `${suit}5`);
    if (i >= 0 && rng() < red) flat[i] = `${suit}0`;
  }
  // 組ごとの牌の書き方を、赤5にした後の列から取り直す（説明に使う）
  let k = 0;
  const sets2 = setCodes.map((s) => { const codes = flat.slice(k, k + 3); k += 3; return { kind: s.kind, tile: s.tile, codes }; });
  return { codes: sortCodes(flat), sets: sets2, pair: { tile: pt, codes: flat.slice(k, k + 2) } };
}

// 13枚の牌から1枚を除く（同じ牌が複数あれば1枚だけ。赤5の5を求めたときは赤でない5を先に）
export function without(codes, tile) {
  const i = codes.indexOf(tile) >= 0 ? codes.indexOf(tile) : codes.findIndex((c) => kindOf(c) === kindOf(tile));
  if (i < 0) throw new Error(`手にない牌: ${tile}`);
  return [...codes.slice(0, i), ...codes.slice(i + 1)];
}

// 上がりの計算（今の標準ルール）。fig：図の形 { tiles, melds, win, how, zhuangfeng, menfeng }
export function huleOf(fig) {
  const sp = Shoupai.fromString([fig.tiles, ...(fig.melds || [])].join(','));
  if (fig.how === 'tsumo') sp.zimo(fig.win);
  const param = Util.hule_param({ rule: STANDARD_RULE, zhuangfeng: fig.zhuangfeng ?? 0, menfeng: fig.menfeng ?? 1, baopai: fig.baopai ?? [], lizhi: 0 });
  return Util.hule(sp, fig.how === 'ron' ? `${fig.win}+` : null, param);
}
const DORA = ['ドラ', '赤ドラ', '裏ドラ'];
// 役のない上がりの形では、計算は { defen: 0 }（hupai なし）を返す
export const yakuOf = (h) => (h && h.hupai ? h.hupai.map((x) => x.name).filter((n) => !DORA.includes(n)) : []);

// 役の名前（計算の名前 → 道場の言い方。読みがなを添える）
const WIND = ['東', '南', '西', '北'];
export const YAKU_NAME = {
  立直: '立直（リーチ）',
  門前清自摸和: '門前清自摸和（ツモ）',
  断幺九: '断幺九（タンヤオ）',
  平和: '平和（ピンフ）',
  '翻牌 白': '役牌（白）',
  '翻牌 發': '役牌（發）',
  '翻牌 中': '役牌（中）',
  ...Object.fromEntries(WIND.map((w) => [`場風 ${w}`, `役牌（場風の${w}）`])),
  ...Object.fromEntries(WIND.map((w) => [`自風 ${w}`, `役牌（自風の${w}）`])),
  一盃口: '一盃口（イーペーコー）',
  三色同順: '三色同順（サンショク）',
  一気通貫: '一気通貫（イッツー）',
  混一色: '混一色（ホンイツ）',
  対々和: '対々和（トイトイ）',
  七対子: '七対子（チートイツ）',
};
export const windName = (n) => WIND[n];

// ---- 第2〜4章の部品（作業4） ----
export const ALL_KINDS = [...'mps'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => s + n)).concat([1, 2, 3, 4, 5, 6, 7].map((n) => `z${n}`));
// 牌の種類ごとの枚数（赤5は5に数える）
export function countsOf(codes) {
  const m = {};
  for (const c of codes) m[kindOf(c)] = (m[kindOf(c)] || 0) + 1;
  return m;
}
// 上がりの形の手から、n 枚を別の牌に替えた手（同じ牌は4枚まで）。作れなければ null
export function noisyHand(rng, n, opts = {}) {
  const h = makeHand(rng, opts);
  if (!h) return null;
  let codes = h.codes.slice();
  for (let t = 0; t < n; t++) {
    const i = Math.floor(rng() * codes.length);
    const to = pick(rng, opts.tanyao ? ALL_KINDS.filter((k) => k[0] !== 'z' && k[1] !== '1' && k[1] !== '9') : ALL_KINDS);
    const next = [...codes.slice(0, i), to, ...codes.slice(i + 1)];
    if ((countsOf(next)[to] || 0) > 4) return null;
    codes = next;
  }
  return sortCodes(codes);
}
// 1枚切った後の手（同じ種類の牌なら最初の1枚）
export const afterDiscard = (codes, d) => without(codes, d);
// 切った後の向聴と、受け入れ（待ちの牌の、手に見えていない残り枚数の合計。14枚のうちの枚数を引く）
export function discardInfo(codes14, d) {
  const left = countsOf(codes14);
  const sp = shoupaiOf(afterDiscard(codes14, d));
  const x = Util.xiangting(sp);
  const kinds = Util.tingpai(sp) || [];
  return { tile: d, x, kinds, n: kinds.reduce((a, k) => a + Math.max(0, 4 - (left[k] || 0)), 0), sp, left: (k) => Math.max(0, 4 - (left[k] || 0)) };
}
// 種類の違う切る候補（赤5があれば赤5を1つの候補に）
export function discardKinds(codes) {
  const seen = new Set();
  const out = [];
  for (const c of codes) if (!seen.has(kindOf(c))) { seen.add(kindOf(c)); out.push(c); }
  return out;
}
export const fmtNum = (n) => Math.round(n).toLocaleString('en-US');
