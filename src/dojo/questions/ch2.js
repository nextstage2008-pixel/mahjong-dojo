// 第2章「速さ」の問題（段階4-1 作業4）：何向聴？・受け入れがいちばん多い切り方は？
import Majiang from '../../../vendor/majiang-core.js';
import { tileName } from '../../ui/view-model.js';
import { retry, withChoices, noisyHand, shoupaiOf, stringOf, discardInfo, discardKinds, kindOf } from './util.js';

const { Util } = Majiang;
const LABELS = ['聴牌', '1向聴', '2向聴', '3向聴'];
const sameTile = (a, b) => kindOf(a.tiles[0]) === kindOf(b.tiles[0]);

// この手は何向聴？：13枚。答えは 聴牌・1〜3向聴
export function shanten(rng) {
  const want = Math.floor(rng() * 4);
  return retry(rng, () => {
    const codes = noisyHand(rng, want === 0 ? 0 : want + Math.floor(rng() * 2));
    if (!codes) return null;
    const k = Math.floor(rng() * 14);
    const thirteen = codes.filter((_, i) => i !== k);
    const x = Util.xiangting(shoupaiOf(thirteen));
    if (x !== want) return null;
    return {
      prompt: 'この手は、聴牌（あと1枚で上がり）まであと何枚？（何向聴）',
      figure: { kind: 'hand', tiles: stringOf(thirteen) },
      choices: LABELS.map((text) => ({ text, tiles: null })),
      answer: x,
      explain: [x === 0 ? 'あと1枚で上がりの形です（聴牌）。' : `いい牌を${x}枚引くと聴牌になります（${x}向聴）。`],
    };
  });
}

// 受け入れがいちばん多くなる切り方は？：14枚。選択肢はどれも向聴の進み具合が同じ切り方で、正解は受け入れが2番目より2枚以上多い
export function ukeire(rng) {
  return retry(rng, () => {
    const codes = noisyHand(rng, 2 + Math.floor(rng() * 2));
    if (!codes) return null;
    const infos = discardKinds(codes).map((d) => discardInfo(codes, d));
    const best = Math.min(...infos.map((i) => i.x));
    if (best < 1 || best > 2) return null;
    const keep = infos.filter((i) => i.x === best).sort((a, b) => b.n - a.n);
    if (keep.length < 3) return null;
    const top = keep[0];
    const rest = keep.slice(1).filter((i) => i.n <= top.n - 2);
    if (rest.length < 2 || keep[1].n > top.n - 2) return null;
    const pickd = withChoices(rng, { text: '', tiles: [top.tile] }, rest.map((i) => ({ text: '', tiles: [i.tile] })), { count: Math.min(4, rest.length + 1), same: sameTile });
    const shown = pickd.choices.map((c) => keep.find((i) => kindOf(i.tile) === kindOf(c.tiles[0])));
    return {
      prompt: '受け入れ（引くと聴牌に近づく牌の枚数）がいちばん多くなる切り方は？',
      figure: { kind: 'hand', tiles: stringOf(codes) },
      ...pickd,
      explain: [
        `${tileName(top.tile)}を切ると、受け入れは ${top.kinds.map(tileName).join('・')} の計${top.n}枚。`,
        shown.filter((i) => i !== top).map((i) => `${tileName(i.tile)}を切ると${i.n}枚`).join('、') + '。',
      ],
    };
  });
}

