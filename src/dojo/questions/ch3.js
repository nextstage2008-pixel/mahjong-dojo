// 第3章「形と打点」の問題（段階4-1 作業4）：形が良くなる切り方は？・同じ速さならどちらが高い？
import { tileName } from '../../ui/view-model.js';
import { shapeOf } from '../../coach/count.js';
import { retry, withChoices, noisyHand, makeHand, stringOf, discardInfo, discardKinds, kindOf, huleOf, pick, without, fmtNum, ALL_KINDS, countsOf, sortCodes } from './util.js';

const sameTile = (a, b) => kindOf(a.tiles[0]) === kindOf(b.tiles[0]);
const pct = (x) => `${Math.round(x * 100)}%`;

// 形が良くなる切り方は？：1向聴を保つ切り方のうち、引いて聴牌したとき両面待ちになる割合（shapeOf の good）が
// 最も高い牌が正解。選択肢の他の牌より0.25以上高い
export function shape(rng) {
  return retry(rng, () => {
    const codes = noisyHand(rng, 2);
    if (!codes) return null;
    const all = discardKinds(codes).map((d) => discardInfo(codes, d));
    if (Math.min(...all.map((i) => i.x)) !== 1) return null;
    const infos = all.filter((i) => i.x === 1);
    if (infos.length < 2) return null;
    for (const i of infos) i.good = shapeOf(i.sp, i.kinds, i.left).good;
    infos.sort((a, b) => b.good - a.good);
    // 正解はいちばん良い牌。選択肢に出す他の牌は、正解より0.25以上低いものだけ（同じくらい良い牌は選択肢に出さない）
    const top = infos[0];
    // 他の選択肢は、正解より0.25以上低く、受け入れの差が2枚以内のもの＝選択肢どうしの差は4枚以内（速さがほぼ同じ中で形を比べる。最後のレビューの直し）
    const rest = infos.slice(1).filter((i) => i.good <= top.good - 0.25 && Math.abs(i.n - top.n) <= 2);
    if (!rest.length) return null;
    const pickd = withChoices(rng, { text: '', tiles: [top.tile] }, rest.map((i) => ({ text: '', tiles: [i.tile] })), { count: Math.min(3, rest.length + 1), same: sameTile });
    const shown = pickd.choices.map((c) => infos.find((i) => kindOf(i.tile) === kindOf(c.tiles[0])));
    return {
      prompt: 'どれを切っても1向聴（聴牌まであと1枚）のまま。形が良くなる（両面待ちになりやすい）切り方は？',
      figure: { kind: 'hand', tiles: stringOf(codes) },
      ...pickd,
      explain: [
        `${tileName(top.tile)}を切ると、聴牌したときに両面待ちになる割合が約${pct(top.good)}。`,
        shown.filter((i) => i !== top).map((i) => `${tileName(i.tile)}を切ると約${pct(i.good)}`).join('、') + '。',
      ],
    };
  });
}

// 聴牌を選べる14枚：切った後の待ちごとに、ロンしたときの点数（子）を残り枚数で重み付けた平均。待ちのどれかに役がなければ null
function valueOf(fig, codes14, d) {
  const info = discardInfo(codes14, d);
  if (info.x !== 0) return null;
  // 切った牌が自分の待ちに入るとフリテン（その待ちではロンできない）なので使わない（最後のレビューの直し）
  if (info.kinds.map(kindOf).includes(kindOf(d))) return null;
  const rest = without(codes14, d);
  let w = 0;
  let sum = 0;
  for (const k of info.kinds) {
    const n = info.left(k);
    const h = huleOf({ ...fig, tiles: stringOf(rest), win: k, how: 'ron' });
    if (!h || !h.hupai) return null;
    w += n;
    sum += n * h.defen;
  }
  return w ? { tile: d, w, avg: sum / w, kinds: info.kinds } : null;
}

// 同じ速さなら、どちらが高い？：聴牌を選べる14枚で2つの切り方。待ちの残り枚数の差は2枚以内、正解の平均点は他方の1.3倍以上
export function value(rng) {
  return retry(rng, () => {
    const h = makeHand(rng, { shun: 0.7 });
    if (!h) return null;
    const draw = pick(rng, ALL_KINDS);
    const out = h.codes[Math.floor(rng() * 14)];
    const codes = sortCodes([...without(h.codes, out), draw]);
    if ((countsOf(codes)[draw] || 0) > 4) return null;
    const fig = { kind: 'hand', zhuangfeng: 0, menfeng: 1 + Math.floor(rng() * 3), baopai: rng() < 0.5 ? [pick(rng, ALL_KINDS)] : [] };
    const vs = discardKinds(codes).map((d) => valueOf(fig, codes, d)).filter(Boolean);
    if (vs.length < 2) return null;
    vs.sort((a, b) => b.avg - a.avg);
    const top = vs[0];
    const low = vs.find((v) => Math.abs(v.w - top.w) <= 2 && top.avg >= v.avg * 1.3);
    if (!low) return null;
    const pickd = withChoices(rng, { text: '', tiles: [top.tile] }, [{ text: '', tiles: [low.tile] }], { count: 2, same: sameTile });
    const line = (v) => `${tileName(v.tile)}を切ると、待ちは ${v.kinds.map(tileName).join('・')}（${v.w}枚）で平均 約${fmtNum(v.avg)}点`;
    return {
      prompt: 'どちらを切っても聴牌（待ちの枚数はほぼ同じ）。ロンしたときの点数が高いのは？',
      figure: { ...fig, tiles: stringOf(codes) },
      ...pickd,
      explain: [`${line(top)}。`, `${line(low)}。`],
    };
  });
}

