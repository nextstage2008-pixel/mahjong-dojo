// 第6章「相手の手を読む」の問題（段階4-2 作業5）：いちばん聴牌に近そうな人は？・この人に危ない色は？
// 場面は対局から集めた一覧（scenes/index.js）。答えは指南と同じ coach/read.js（tenpaiChance・yakuRead・usedSigns）
import { sceneEntry } from '../scenes/index.js';
import { tenpaiChance, yakuRead, usedSigns, callCount, tedashiAfterCall, turnOf } from '../../coach/read.js';
import { withChoices } from './util.js';

export const REL = ['下家', '対面', '上家'];
const SUITS = { m: '萬子', p: '筒子', s: '索子' };
const text = (t) => ({ text: t, tiles: null });
const sameText = (a, b) => a.text === b.text;
const wari = (p) => (p >= 0.95 ? 'ほぼ10割' : p < 0.1 ? '1割未満' : `約${Math.round(p * 10)}割`);

// 相手の河と鳴きの図（opps：見せる相手の番号。0〜2＝下家・対面・上家）
export function oppFigure(scene, opps) {
  return {
    kind: 'scene',
    hand: '',
    baopai: scene.baopai,
    round: { zhuangfeng: scene.zhuangfeng, jushu: scene.jushu, turn: scene.turn + 1 },
    rivers: opps.map((i) => {
      const o = scene.opponents[i];
      return { label: `${REL[i]}${o.dealer ? '（親）' : ''}${o.melds.length ? `・鳴き${callCount(o)}回` : ''}`, tiles: o.river, melds: o.melds };
    }),
  };
}

// その人の聴牌の見込みの材料の文
function signsOf(o, scene) {
  const cc = callCount(o);
  const t = turnOf(o);
  if (cc > 0) return `${cc}回鳴いていて${t}巡目、鳴いた後の手出しが${tedashiAfterCall(o)}回。`;
  const signs = usedSigns(o, scene);
  if (signs.length) return `鳴いていませんが、${signs.slice(-2).map((x) => `${x.turn}巡目に${x.short}`).join('・')}。`;
  return `鳴いていない${t}巡目の手。`;
}

// だれもリーチしていない。いちばん聴牌に近そうな人は？
export function nearest(rng, seed) {
  const e = sceneEntry('nearest', seed);
  const { scene } = e;
  const i = scene.opponents.findIndex((o) => o.seat === e.seat);
  const ch = scene.opponents.map((o) => tenpaiChance(o, scene));
  const order = [0, 1, 2].sort((a, b) => ch[b] - ch[a]);
  return {
    prompt: 'だれもリーチしていません。3人のうち、いちばん聴牌（あと1枚で上がり）に近そうな人は？',
    figure: oppFigure(scene, [0, 1, 2]),
    ...withChoices(rng, text(REL[i]), [], { fixed: REL.map(text), same: sameText }),
    explain: order.map((k) => `${REL[k]}：聴牌の見込み${wari(ch[k])}。${signsOf(scene.opponents[k], scene)}`),
  };
}

// この人の鳴きと河から、危ない色は？（染め手）
export function someColor(rng, seed) {
  const e = sceneEntry('some', seed);
  const { scene } = e;
  const i = scene.opponents.findIndex((o) => o.seat === e.seat);
  const o = scene.opponents[i];
  const s = e.suit;
  const own = o.river.filter((t) => t.code[0] === s).length;
  const others = o.river.filter((t) => t.code[0] !== 'z' && t.code[0] !== s).length;
  const rest = Object.keys(SUITS).filter((x) => x !== s).map((x) => SUITS[x]).join('・');
  return {
    prompt: `${REL[i]}の鳴きと河を見てください。この人に危ない色は？`,
    figure: oppFigure(scene, [i]),
    ...withChoices(rng, text(SUITS[s]), [], { fixed: Object.values(SUITS).map(text), same: sameText }),
    explain: [
      `鳴いた組の数牌は${SUITS[s]}だけで、河には${SUITS[s]}が${own}枚、ほかの色の数牌が${others}枚。`,
      `${SUITS[s]}と字牌だけで手を作る「染め手」（混一色・清一色）の見込みが高い人です。${SUITS[s]}と字牌が危なく、${rest}は通りやすい牌です。`,
    ],
    data: { kinds: yakuRead(o, scene).kinds },
  };
}
