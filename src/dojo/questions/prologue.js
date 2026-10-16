// 序章「麻雀の形」の問題（段階4-1 作業3）：上がりの形はどれ？・何を引けば上がり？
import Majiang from '../../../vendor/majiang-core.js';
import { tileName } from '../../ui/view-model.js';
import { pick, retry, withChoices, kindOf, makeHand, sortCodes, shoupaiOf, stringOf, without, namesOf } from './util.js';

const { Util } = Majiang;
const ALL_KINDS = [...'mps'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => s + n)).concat([1, 2, 3, 4, 5, 6, 7].map((n) => `z${n}`));
const countOf = (codes, k) => codes.filter((c) => kindOf(c) === kindOf(k)).length;
const sameTiles = (a, b) => a.tiles.map(kindOf).join('') === b.tiles.map(kindOf).join('');

const setText = (s) => namesOf(s.codes);

// 上がっている形はどれ？：14枚の手を4つ。正解だけが4つの組と1つの頭に分けられる
export function agari(rng) {
  return retry(rng, () => {
    const h = makeHand(rng);
    if (!h) return null;
    const wrongs = [];
    for (let t = 0; t < 40 && wrongs.length < 6; t++) {
      // 1枚を別の牌に替える（同じ牌は4枚まで）
      const i = Math.floor(rng() * 14);
      const to = pick(rng, ALL_KINDS);
      if (kindOf(h.codes[i]) === to) continue;
      const codes = sortCodes([...h.codes.slice(0, i), to, ...h.codes.slice(i + 1)]);
      if (countOf(codes, to) > 4) continue;
      if (Util.xiangting(shoupaiOf(codes)) < 0) continue;
      wrongs.push({ text: '', tiles: codes });
    }
    const correct = { text: '', tiles: h.codes };
    let pickd;
    try {
      pickd = withChoices(rng, correct, wrongs, { same: sameTiles });
    } catch {
      return null;
    }
    return {
      prompt: '上がっている形（4つの組と1つの頭）はどれ？',
      figure: null,
      ...pickd,
      explain: [
        `正解の手は「${h.sets.map(setText).join('」「')}」の4つの組と、「${namesOf(h.pair.codes)}」の頭に分けられます。`,
        'ほかの手は、どう分けても組にも頭にもならない牌が残ります。',
      ],
    };
  });
}

// 何を引けば上がり？：聴牌の13枚。選択肢の牌のうち正解だけが待ち
export function wait(rng) {
  return retry(rng, () => {
    const h = makeHand(rng);
    if (!h) return null;
    const out = h.codes[Math.floor(rng() * 14)];
    const tiles = without(h.codes, out);
    const waits = (Util.tingpai(shoupaiOf(tiles)) || []).map(kindOf);
    // 正解：待ちのうち、まだ山に残っている（手の中で4枚使っていない）牌
    const live = waits.filter((w) => countOf(tiles, w) < 4);
    if (!live.length) return null;
    const right = pick(rng, live);
    // 間違い：待ちでない牌。待ちの近く（同じ色の前後）を多めに
    const near = waits.flatMap((w) => (w[0] === 'z' ? [] : [-2, -1, 1, 2, 3].map((d) => +w[1] + d).filter((n) => n >= 1 && n <= 9).map((n) => w[0] + n)));
    const pool = [...near, ...tiles.map(kindOf), ...ALL_KINDS].filter((k) => !waits.includes(k) && countOf(tiles, k) < 4);
    let pickd;
    try {
      pickd = withChoices(rng, { text: '', tiles: [right] }, pool.slice(0, 30).map((k) => ({ text: '', tiles: [k] })), { same: sameTiles });
    } catch {
      return null;
    }
    return {
      prompt: 'あと1枚で上がりの形です。どの牌を引けば上がり？',
      figure: { kind: 'hand', tiles: stringOf(tiles) },
      ...pickd,
      explain: [
        `この手は ${waits.map(tileName).join('・')} を待っています。`,
        `${tileName(right)}を引くと、4つの組と1つの頭がそろいます。`,
      ],
    };
  });
}
