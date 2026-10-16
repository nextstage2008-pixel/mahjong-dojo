// 第8章「鳴き」の問題（段階4-2 作業6）：この牌を鳴く？鳴かない？・鳴いて聴牌、この手は上がれる？
// 鳴く？鳴かないは対局から集めた一覧（試しで差がはっきりした場面だけ）。上がれる？は種から作る（答えは Util.hule。後付けあり・喰いタンあり）
import Majiang from '../../../vendor/majiang-core.js';
import { tileName } from '../../ui/view-model.js';
import { sceneEntry } from '../scenes/index.js';
import { callYaku as callYakuOf } from '../../coach/spot.js';
import { retry, withChoices, makeHand, stringOf, without, huleOf, yakuOf, YAKU_NAME, codesOf, fmtNum, windName, pick } from './util.js';
import { REL } from './ch6.js';
import { handFigure } from './ch7.js';

const { Shoupai, Util } = Majiang;
const text = (t) => ({ text: t, tiles: null });
const sameText = (a, b) => a.text === b.text;
const FROM = { '-': '上家', '=': '対面', '+': '下家' };
const meldTiles = (m) => codesOf(m.replace(/[-=+]/g, ''));
const isPon = (m) => new Set(meldTiles(m).map((c) => c[1] === '0' ? '5' : c[1])).size === 1;

// この牌を鳴く？鳴かない？（2択）
export function call(rng, seed) {
  const e = sceneEntry('call', seed);
  const { scene } = e;
  const tile = scene.tile.slice(0, 2);
  const how = isPon(e.meld) ? 'ポン' : 'チー';
  const callText = `鳴く（${tileName(tile)}を${how}）`;
  const y = callYakuOf(scene).each[e.meld];
  const better = e.answer === 'call' ? '鳴く' : '鳴かない';
  const fig = handFigure({ ...scene, hand: scene.hand });
  return {
    prompt: `${FROM[scene.tile[2]] || '相手'}が${tileName(tile)}を切りました。鳴く？鳴かない？`,
    figure: { ...fig, draw: null, note: `出た牌：${tileName(tile)}（${how}できる）` },
    ...withChoices(rng, text(e.answer === 'call' ? callText : '鳴かない'), [], { fixed: [text(callText), text('鳴かない')], same: sameText }),
    explain: [
      `この場面を同じ山の並びで1,600回打ち比べると、見込みの点は 鳴く ${fmtNum(e.ev.call)}点・鳴かない ${fmtNum(e.ev.skip)}点。${better}ほうが約${fmtNum(Math.abs(e.ev.call - e.ev.skip))}点得です。`,
      y ? `${how}しても役が残る形です。` : `${how}すると役がなくなりやすい形です（鳴くと立直・門前の役が消えます）。`,
      e.answer === 'call' ? '鳴くと上がりが早くなり、上がったときの点も見合うので鳴くのが得です。'
        : y ? '鳴くとリーチと門前の役を失って打点が下がるので、鳴かずに手を進めるのが得です。' : '鳴くと役がなくなるので、鳴かずに手を進めるのが得です。',
    ],
  };
}

// 面子の書き方（順子は上家からチー、刻子は対面からポン）
const meldOf = (s) => (s.kind === 'shun' ? `${s.codes[0]}-${s.codes[1][1]}${s.codes[2][1]}` : `${s.codes[0]}${s.codes[1][1]}${s.codes[2][1]}=`);
const YES = '上がれる（役がある）';
const NO = '上がれない（役がない）';

// 鳴いて聴牌。この手はロンで上がれる？（待ちの牌のどれでも同じ答えになる手だけ。答えの2つが半々くらい）
export function callYaku(rng) {
  const want = rng() < 0.5;
  return retry(rng, () => {
    const h = makeHand(rng, { shun: 0.6, red: 0 });
    if (!h) return null;
    const open = 1 + Math.floor(rng() * 2);
    const idx = [...h.sets.keys()];
    const melded = idx.slice(-open);
    const closedSets = idx.filter((i) => !melded.includes(i));
    const closed = [...closedSets.flatMap((i) => h.sets[i].codes), ...h.pair.codes];
    const piece = pick(rng, [...closedSets.map((i) => h.sets[i].codes), h.pair.codes]);
    const win = pick(rng, piece);
    const tiles = stringOf(without(closed, win));
    const melds = melded.map((i) => meldOf(h.sets[i]));
    const zhuangfeng = Math.floor(rng() * 2);
    const menfeng = Math.floor(rng() * 4);
    const sp = Shoupai.fromString([tiles, ...melds].join(','));
    const waits = Util.tingpai(sp) || [];
    if (!waits.length) return null;
    const each = waits.map((w) => yakuOf(huleOf({ tiles, melds, win: w, how: 'ron', zhuangfeng, menfeng, baopai: [] })));
    const has = each.map((y) => y.length > 0);
    if (has.some((x) => x !== has[0]) || has[0] !== want) return null;
    const waitNames = waits.map(tileName).join('・');
    // 役は待ちの牌ごとに違うことがある（4萬なら断幺九だけ・7萬なら三色同順も、など）。違うときは待ちごとに書く
    const names = (ys) => ys.map((n) => YAKU_NAME[n] || n).join('・');
    const same = each.every((y) => names(y) === names(each[0]));
    const yesLine = same
      ? `待ちは ${waitNames}。鳴いていても ${names(each[0])} が付くので上がれます。`
      : `待ちは ${waitNames}。${waits.map((w, k) => `${tileName(w)}なら ${names(each[k])}`).join('、')} が付くので、どれでも上がれます。`;
    return {
      prompt: `鳴いて聴牌しました（場風 ${windName(zhuangfeng)}・自風 ${windName(menfeng)}）。この手は、待ちの牌が出たらロンで上がれる？`,
      figure: { kind: 'hand', tiles, melds, zhuangfeng, menfeng },
      ...withChoices(rng, text(want ? YES : NO), [], { fixed: [text(YES), text(NO)], same: sameText }),
      explain: want
        ? [yesLine]
        : [`待ちは ${waitNames}。鳴いたので立直・門前の役はなく、役牌・断幺九（タンヤオ）などの役もありません。`, '役がないと、ロンもツモもできません（ドラは役ではありません）。'],
    };
  });
}
