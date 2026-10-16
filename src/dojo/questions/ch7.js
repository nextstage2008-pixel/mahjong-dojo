// 第7章「押し引き」の問題（段階4-2 作業6）：リーチを受けた。押す？降りる？・2人のリーチに、いちばん先に切る牌は？
// 押し引きは対局から集めた一覧（試しで差がはっきりした場面だけ。答えは一覧を作ったときの試しの数）。
// 2人のリーチは種から作る（答えは coach/danger.js の dangerAll）
import Majiang from '../../../vendor/majiang-core.js';
import { tileName } from '../../ui/view-model.js';
import { sceneEntry } from '../scenes/index.js';
import { categoryOf, dangerAll } from '../../coach/danger.js';
import { readOf } from '../../coach/read.js';
import { dangerIn } from '../../coach/spot.js';
import { retry, withChoices, riichiSpot, spotFigure, discardKinds, kindOf, shuffled, codesOf, stringOf, fmtNum, SEAT_NAME } from './util.js';
import { pct, honorOk } from './ch5.js';
import { REL } from './ch6.js';

const { Shoupai, Util } = Majiang;
const text = (t) => ({ text: t, tiles: null });
const sameText = (a, b) => a.text === b.text;
const plain = (k) => k.replace(/[*!]/g, '');

// 打牌の場面の図：自分の手（引いた牌を分ける）・鳴き・相手3人の河（リーチの人から）
export function handFigure(scene) {
  const [closedStr, ...melds] = scene.hand.split(',');
  const sp = Shoupai.fromString(scene.hand);
  const codes = codesOf(closedStr);
  const draw = sp._zimo && sp._zimo.length === 2 ? codes.pop() : null;
  const order = [0, 1, 2].sort((a, b) => Number(scene.opponents[b].riichi) - Number(scene.opponents[a].riichi));
  return {
    kind: 'scene',
    hand: stringOf(codes),
    draw,
    melds,
    baopai: scene.baopai,
    round: { zhuangfeng: scene.zhuangfeng, jushu: scene.jushu, turn: scene.turn + 1 },
    rivers: order.map((i) => {
      const o = scene.opponents[i];
      return { label: `${REL[i]}${o.dealer ? '（親）' : ''}${o.riichi ? '・リーチ' : ''}`, tiles: o.river, melds: o.melds };
    }),
  };
}

const CAT = {
  genbutsu: '現物', nakasuji: '中筋', katasuji: '片筋', nochance: '壁', onechance: '壁',
  z0: '字牌（見えていない）', z1: '字牌（1枚見え）', z2: '字牌（2枚見え）', z3: '字牌（3枚見え）',
};
const catName = (c) => CAT[c] || (c.startsWith('suji') ? '筋' : '無筋');

// リーチを受けた。押す？降りる？（2択。押す牌・降りる牌を添える）
export function pushfold(rng, seed) {
  const e = sceneEntry('pushfold', seed);
  const { scene } = e;
  const riichi = e.push.endsWith('*');
  const pushText = `押す（${tileName(plain(e.push))}を切る${riichi ? '・リーチ' : ''}）`;
  const foldText = `降りる（${tileName(plain(e.fold))}を切る）`;
  const x = Util.xiangting(Shoupai.fromString(scene.hand));
  const danger = dangerIn(scene, readOf(scene));
  const who = scene.threats.map((t) => `${REL[(t.seat - scene.menfeng + 3) % 4]}${t.dealer ? '（親）' : ''}`).join('と');
  const better = e.answer === 'push' ? '押す' : '降りる';
  return {
    prompt: `${who}がリーチ。あなたは${x === 0 ? '聴牌' : `${x}向聴`}です。押す？降りる？`,
    figure: handFigure(scene),
    ...withChoices(rng, text(e.answer === 'push' ? pushText : foldText), [], { fixed: [text(pushText), text(foldText)], same: sameText }),
    explain: [
      `この場面を同じ山の並びで1,600回打ち比べると、見込みの点は 押す ${fmtNum(e.ev.push)}点・降りる ${fmtNum(e.ev.fold)}点。${better}ほうが約${fmtNum(Math.abs(e.ev.push - e.ev.fold))}点得です。`,
      `押す牌${tileName(plain(e.push))}の当たる見込みは${pct(danger(plain(e.push)))}、降りる牌${tileName(plain(e.fold))}は${pct(danger(plain(e.fold)))}。`,
      e.answer === 'push'
        ? '上がりが近く、上がったときの点が振り込んだときの失点に見合うので、押すのが得です。'
        : '上がりまで遠い・安いのに危ない牌を切ることになるので、降りるのが得です。',
    ],
  };
}

// 降りると決めた。2人のリーチに、いちばん先に切る牌は？（正解は2人への見込みがいちばん低く、2番目の半分以下）
export function betaori(rng) {
  return retry(rng, () => {
    const spot = riichiSpot(rng, { riichiCount: 2 });
    if (!spot) return null;
    const ctx = { visible: spot.visible, own: spot.own, turn: spot.turn };
    const cands = shuffled(rng, discardKinds(spot.hand)).filter((code) => honorOk(kindOf(code), ctx)).map((code) => ({ code, kind: kindOf(code), p: dangerAll(kindOf(code), spot.threats, ctx).p }));
    const sorted = cands.slice().sort((a, b) => a.p - b.p);
    if (sorted.length < 4) return null;
    const best = sorted[0];
    const rest = sorted.slice(1).filter((c) => c.p >= best.p * 2 && c.p > best.p);
    if (rest.length < 3) return null;
    const shown = [best, ...shuffled(rng, rest).slice(0, 3)];
    const choice = withChoices(rng, { text: '', tiles: [best.code] }, shown.slice(1).map((c) => ({ text: '', tiles: [c.code] })), { same: (a, b) => kindOf(a.tiles[0]) === kindOf(b.tiles[0]) });
    const names = spot.threats.map((t) => SEAT_NAME[t.seat]);
    const line = (c) => `${tileName(c.code)}（合わせて${pct(c.p)}）：${spot.threats.map((t, k) => `${names[k]}に${catName(categoryOf(c.kind, t, ctx))}`).join('・')}`;
    return {
      prompt: `${names.join('と')}の2人がリーチ。あなたは降りると決めました。いちばん先に切る牌は？`,
      figure: spotFigure(spot),
      ...choice,
      explain: [...shown.slice().sort((a, b) => a.p - b.p).map(line), '2人のリーチには、2人どちらにも安全な牌から切ります。片方の現物でも、もう片方に無筋なら危ない牌です。'],
      data: { threats: spot.threats, ctx },
    };
  });
}
