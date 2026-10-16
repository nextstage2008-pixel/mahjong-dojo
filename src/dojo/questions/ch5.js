// 第5章「牌の危なさ」の問題（段階4-2 作業3）：リーチにいちばん安全な牌は？・この牌は現物／筋／壁／無筋のどれ？
// 答えは指南と同じ coach/danger.js（categoryOf・dangerOf。表は天鳳の統計）。場面は種から作る（util.js の riichiSpot）
import { tileName } from '../../ui/view-model.js';
import { categoryOf, dangerOf } from '../../coach/danger.js';
import { retry, withChoices, riichiSpot, spotFigure, discardKinds, kindOf, shuffled, pick, SEAT_NAME } from './util.js';

export const SUJI_LABELS = ['現物', '筋', '壁', '無筋'];

// 種類の名前（4つの答え）。片筋・字牌は null
export function labelOf(cat) {
  if (cat === 'genbutsu') return '現物';
  if (cat.startsWith('suji') || cat === 'nakasuji') return '筋';
  if (cat === 'nochance' || cat === 'onechance') return '壁';
  if (cat.startsWith('musuji')) return '無筋';
  return null;
}

export const pct = (p) => (p === 0 ? '0%' : p < 0.005 ? '1%未満' : `約${Math.round(p * 100)}%`);

// 選択肢に出してよい字牌か（最後のレビューの直し）：指南の categoryOf は字牌を卓の枚数だけで見るので、自分の手も数えると
// 残り0枚の字牌（絶対に安全）や、自分が2枚以上持つ字牌は答えがぶれる。どちらも選択肢に出さない
export const honorOk = (kind, ctx) => kind[0] !== 'z' || ((ctx.own[kind] || 0) <= 1 && 4 - (ctx.visible[kind] || 0) > 0);

// 両面の形（筋を見ない）がどれも、見えている枚数 need 以上の牌でふさがっているか（壁の考え）
export function walled(kind, ctx, need) {
  const s = kind[0];
  const n = +kind[1];
  const shapes = [];
  if (n + 3 <= 9) shapes.push([n + 1, n + 2]);
  if (n - 3 >= 1) shapes.push([n - 2, n - 1]);
  return shapes.length > 0 && shapes.every((p) => p.some((m) => (ctx.visible[s + m] || 0) >= need));
}
const num = (s, n) => tileName(`${s}${n}`);

// その牌がその種類になる理由の文
export function whyOf(kind, threat, ctx) {
  const cat = categoryOf(kind, threat, ctx);
  const name = tileName(kind);
  const s = kind[0];
  const n = +kind[1];
  const safe = new Set(threat.safe);
  if (cat === 'genbutsu') return `${name}は、リーチの人の河にあるか、リーチの後に通った牌です（現物）。その人には当たりません。`;
  if (s === 'z') {
    // 自分の手も数えた残り枚数で書く（最後のレビューの直し）
    const own = ctx.own[kind] || 0;
    const table = Math.max(0, (ctx.visible[kind] || 0) - own);
    const rest = Math.max(0, 4 - table - own);
    const tail = table === 0 ? 'まだ卓に1枚も見えていない字牌は、字牌の中ではいちばん危ない牌です。'
      : rest <= 1 ? `残りは${rest}枚。単騎で待たれていなければ当たりません。` : `残りは${rest}枚。待ちは単騎か双碰だけです。`;
    return `${name}は字牌で、卓に${table}枚${own ? `・あなたの手に${own}枚` : ''}見えています。${tail}`;
  }
  const partners = [n + 3, n - 3].filter((m) => m >= 1 && m <= 9);
  if (cat === 'nakasuji') return `${num(s, n - 3)}と${num(s, n + 3)}がどちらも現物なので、${name}を両面で待つ形はありません（中筋）。`;
  if (cat.startsWith('suji')) return `${num(s, partners[0])}が現物なので、${name}を両面で待つ形はありません（筋）。`;
  if (cat === 'katasuji') {
    const dead = partners.find((m) => safe.has(s + m));
    const live = partners.find((m) => !safe.has(s + m));
    return `${num(s, dead)}だけが現物で、${num(s, live)}との両面の形が残ります（片筋）。`;
  }
  if (cat === 'nochance' || cat === 'onechance') {
    const need = cat === 'nochance' ? 4 : 3;
    const walls = [n - 2, n - 1, n + 1, n + 2].filter((m) => m >= 1 && m <= 9 && (ctx.visible[s + m] || 0) >= need);
    const w = walls.map((m) => num(s, m)).join('・');
    return cat === 'nochance'
      ? `${w}が4枚とも見えていて、${name}を待つ両面が作れません（壁・ノーチャンス）。`
      : `${w}が3枚見えていて、${name}を待つ両面が作りにくい（壁・ワンチャンス）。`;
  }
  return `筋の牌（${partners.map((m) => num(s, m)).join('・')}）が現物にないので、両面で当たる形が残ります（無筋）。`;
}

const seatWords = (spot, t) => `${SEAT_NAME[t.seat]}${t.dealer ? '（親）' : ''}`;
const ctxOf = (spot) => ({ visible: spot.visible, own: spot.own, turn: spot.turn });
const sameTile = (a, b) => kindOf(a.tiles[0]) === kindOf(b.tiles[0]);

// リーチの人に、いちばん安全な牌は？（自分の手から4枚。4つとも種類が違い、正解は2番目の半分以下）
export function safest(rng) {
  // 半分は現物を選択肢に入れない（答えが現物ばかりにならないように）
  const noGenbutsu = rng() < 0.5;
  return retry(rng, () => {
    const spot = riichiSpot(rng);
    if (!spot) return null;
    const threat = spot.threats[0];
    const ctx = ctxOf(spot);
    const byCat = new Map();
    for (const code of shuffled(rng, discardKinds(spot.hand))) {
      const kind = kindOf(code);
      const cat = categoryOf(kind, threat, ctx);
      if (noGenbutsu && cat === 'genbutsu') continue;
      if (!honorOk(kind, ctx)) continue;
      if (!byCat.has(cat)) byCat.set(cat, { code, kind, cat, p: dangerOf(kind, threat, ctx) });
    }
    const cands = [...byCat.values()].sort((a, b) => a.p - b.p);
    if (cands.length < 4) return null;
    const best = cands[0];
    const rest = cands.slice(1).filter((c) => c.p >= best.p * 2 && c.p > best.p);
    if (rest.length < 3) return null;
    const shown = [best, ...shuffled(rng, rest).slice(0, 3)];
    const choice = withChoices(rng, { text: '', tiles: [best.code] }, shown.slice(1).map((c) => ({ text: '', tiles: [c.code] })), { same: sameTile });
    const sorted = shown.slice().sort((a, b) => a.p - b.p);
    return {
      prompt: `${seatWords(spot, threat)}がリーチ。あなたの手のうち、いちばん安全な牌は？`,
      figure: spotFigure(spot),
      ...choice,
      explain: sorted.map((c) => `${tileName(c.code)}（${pct(c.p)}）：${whyOf(c.kind, threat, ctx)}`),
      data: { threat, ctx, hand: spot.hand },
    };
  });
}

// この牌は、リーチの人に対して何？（現物・筋・壁・無筋）。答えの4つが同じくらい出るよう、先に答えを決めて場面を探す
export function suji(rng) {
  const target = pick(rng, SUJI_LABELS);
  return retry(rng, () => {
    const spot = riichiSpot(rng);
    if (!spot) return null;
    const threat = spot.threats[0];
    const ctx = ctxOf(spot);
    // 筋と壁・無筋と壁が重なる牌は、どちらの理由とも言えるので出さない（最後のレビューの直し）
    const hits = discardKinds(spot.hand).filter((c) => c[0] !== 'z' && labelOf(categoryOf(kindOf(c), threat, ctx)) === target
      && !((target === '筋' || target === '無筋') && walled(kindOf(c), ctx, 3)));
    if (!hits.length) return null;
    const tile = pick(rng, hits);
    const kind = kindOf(tile);
    return {
      prompt: `${seatWords(spot, threat)}がリーチ。あなたの手の${tileName(tile)}は、その人に対して何？（理由が重なるときは強いほう：現物＞筋＞壁＞無筋）`,
      figure: { ...spotFigure(spot), note: `問う牌：${tileName(tile)}` },
      ...withChoices(rng, { text: target, tiles: null }, [], { fixed: SUJI_LABELS.map((t) => ({ text: t, tiles: null })), same: (a, b) => a.text === b.text }),
      explain: [whyOf(kind, threat, ctx), `この種類の牌に当たる見込みは${pct(dangerOf(kind, threat, ctx))}（リーチの直後の統計）。`],
      data: { tile, threat, ctx, hand: spot.hand },
    };
  });
}
