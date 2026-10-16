// 第1章「よく出る役」の問題（段階4-1 作業3）：この上がりの役は？・この形でロンできる？
// 正解は今の標準ルールでの上がりの計算（util.js の huleOf）。ドラ・赤ドラ・裏ドラは役に数えない
import { pick, retry, withChoices, makeHand, stringOf, without, huleOf, yakuOf, YAKU_NAME, windName } from './util.js';
import { tileName } from '../../ui/view-model.js';

// 問いに出す役（立直は宣言なので形の問いからは外す。ほかは講義で教える役）
const TARGETS = ['断幺九', '平和', '役牌', '門前清自摸和', '一盃口', '三色同順', '一気通貫', '混一色', '対々和', '七対子'];
const isYakuhai = (n) => /^(翻牌|場風|自風)/.test(n);
const groupOf = (n) => (isYakuhai(n) ? '役牌' : n);

// 役の短い説明（答え合わせの文）
const NOTE = {
  断幺九: '1・9と字牌を1枚も使わない手です。',
  平和: '鳴かずに、4つの組がすべて順番の組で、頭が役牌でなく、両側で待つ（両面待ち）手です。',
  役牌: '白・發・中か、場風・自風の牌を3枚そろえた手です。',
  門前清自摸和: '鳴かずに、自分で引いて上がった（ツモ）手です。',
  一盃口: '鳴かずに、同じ順番の組を2つそろえた手です。',
  三色同順: '萬子・筒子・索子で、同じ数の順番の組をそろえた手です。',
  一気通貫: '1つの色で1・2・3、4・5・6、7・8・9をそろえた手です。',
  混一色: '1つの色と字牌だけでできた手です。',
  対々和: '4つの組がすべて同じ牌3枚の組の手です。',
  七対子: '2枚の組（対子）を7つそろえた手です。',
};

const wind = (rng) => ({ zhuangfeng: Math.floor(rng() * 2), menfeng: Math.floor(rng() * 4) });

// 鳴いた組の書き方（順子は左の人＝上家から '-'、刻子は向かいの人から '='）
const meldOf = (s) => (s.kind === 'shun' ? `${s.codes[0]}-${s.codes[1][1]}${s.codes[2][1]}` : `${s.codes[0]}${s.codes[1][1]}${s.codes[2][1]}=`);

// 手から図を作る。open：鳴く組の数。how：'ron'|'tsumo'。上がり牌は鳴いていない組か頭から選ぶ
function figureOf(rng, h, { open = 0, how = 'ron', winds }) {
  const melded = h.sets.slice(0, open);
  const closed = [...h.sets.slice(open).flatMap((s) => s.codes), ...h.pair.codes];
  const win = pick(rng, closed);
  const tiles = without(closed, win);
  return { kind: 'hand', tiles: stringOf(tiles), melds: melded.map(meldOf), win, how, ...winds };
}

// 狙う役ごとの手の作り方（どれも作った後に計算で確かめ、ちょうどその役1つだけの手を使う）
function build(rng, target) {
  const winds = wind(rng);
  const n = 1 + Math.floor(rng() * 7);
  const suit = pick(rng, 'mps');
  const others = 'mps'.replace(suit, '');
  switch (target) {
    case '断幺九': return { h: makeHand(rng, { tanyao: true, shun: 0.6 }), open: rng() < 0.4 ? 1 : 0, how: rng() < 0.5 ? 'ron' : 'tsumo', winds };
    case '平和': return { h: makeHand(rng, { shun: 1, honors: false, pinned: [{ kind: 'shun', tile: `${suit}${rng() < 0.5 ? 1 : 7}` }] }), how: 'ron', winds };
    case '役牌': {
      const yt = pick(rng, ['z5', 'z6', 'z7', `z${winds.zhuangfeng + 1}`, `z${winds.menfeng + 1}`]);
      return { h: makeHand(rng, { pinned: [{ kind: 'ke', tile: yt }], shun: 0.7, honors: false }), open: rng() < 0.6 ? 1 + Math.floor(rng() * 2) : 0, how: 'ron', winds, front: true };
    }
    case '門前清自摸和': return { h: makeHand(rng, { shun: 0.6, pinned: [{ kind: 'ke', tile: `${suit}${pick(rng, [1, 9])}` }] }), how: 'tsumo', winds };
    case '一盃口': return { h: makeHand(rng, { pinned: [{ kind: 'shun', tile: `${suit}${n}` }, { kind: 'shun', tile: `${suit}${n}` }], shun: 0.5 }), how: 'ron', winds };
    case '三色同順': return { h: makeHand(rng, { pinned: [...'mps'].map((s) => ({ kind: 'shun', tile: `${s}${n}` })), shun: 0.4 }), open: rng() < 0.4 ? 1 : 0, how: 'ron', winds, front: true };
    case '一気通貫': return { h: makeHand(rng, { pinned: [1, 4, 7].map((k) => ({ kind: 'shun', tile: `${suit}${k}` })), suits: others, shun: 0.4 }), open: rng() < 0.4 ? 1 : 0, how: 'ron', winds, front: true };
    case '混一色': return { h: makeHand(rng, { suits: suit, shun: 0.6, pairTile: `z${1 + Math.floor(rng() * 4)}` }), open: 1 + Math.floor(rng() * 2), how: 'ron', winds };
    case '対々和': return { h: makeHand(rng, { shun: 0, honors: false }), open: 2 + Math.floor(rng() * 2), how: 'ron', winds };
    case '七対子': return { seven: true, winds };
    default: throw new Error(target);
  }
}

// 七対子の手（違う牌の対子7つ）
function sevenPairs(rng, winds) {
  const kinds = new Set();
  while (kinds.size < 7) kinds.add(rng() < 0.15 ? `z${1 + Math.floor(rng() * 4)}` : `${pick(rng, 'mps')}${1 + Math.floor(rng() * 9)}`);
  const codes = [...kinds].flatMap((k) => [k, k]);
  const win = pick(rng, codes);
  return { kind: 'hand', tiles: stringOf(without(codes, win)), melds: [], win, how: 'ron', ...winds };
}

const howText = (fig) => (fig.how === 'ron' ? 'ロン（人の捨てた牌で上がり）' : 'ツモ（自分で引いて上がり）');
const windText = (fig) => `場風は${windName(fig.zhuangfeng)}・自風は${windName(fig.menfeng)}`;

// この上がりの役は？
export function yaku(rng) {
  const target = pick(rng, TARGETS);
  return retry(rng, () => {
    const b = build(rng, target);
    let fig;
    if (b.seven) fig = sevenPairs(rng, b.winds);
    else {
      if (!b.h) return null;
      // 役牌・三色・一通は狙いの組を鳴く組にしてよい（front）。ほかは狙いの組を残すため後ろの組から鳴く
      const h = b.front ? b.h : { ...b.h, sets: [...b.h.sets].reverse() };
      fig = figureOf(rng, h, { open: b.open ?? 0, how: b.how, winds: b.winds });
    }
    const names = yakuOf(huleOf(fig));
    if (names.length !== 1 || groupOf(names[0]) !== target || !YAKU_NAME[names[0]]) return null;
    const right = YAKU_NAME[names[0]];
    const wrongs = TARGETS.filter((t) => t !== target).map((t) => (t === '役牌' ? YAKU_NAME['翻牌 白'] : YAKU_NAME[t]));
    const pickd = withChoices(rng, right, wrongs, { count: 4 });
    return {
      prompt: `この上がりの役は？（${howText(fig)}・${windText(fig)}）`,
      figure: fig,
      choices: pickd.choices.map((text) => ({ text, tiles: null })),
      answer: pickd.answer,
      explain: [`役は${right}。${NOTE[target]}`],
    };
  });
}

// この形でロンできる？：聴牌の手で、待っている牌が出たときに役があるか。半分くらいは鳴いた手
export function canWin(rng) {
  const wantYes = rng() < 0.5;
  return retry(rng, () => {
    const winds = wind(rng);
    const open = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
    const h = makeHand(rng, { shun: 0.75 });
    if (!h) return null;
    const fig = figureOf(rng, { ...h, sets: [...h.sets].reverse() }, { open, how: 'ron', winds });
    const names = yakuOf(huleOf(fig));
    if (names.some((x) => !YAKU_NAME[x])) return null; // 教えていない役の手は使わない
    const yes = names.length > 0;
    if (yes !== wantYes) return null;
    const fixed = [{ text: 'できる', tiles: null }, { text: 'できない', tiles: null }];
    return {
      prompt: `${tileName(fig.win)}が出たら、ロンできる？（${windText(fig)}）`,
      figure: fig,
      choices: fixed,
      answer: yes ? 0 : 1,
      explain: yes
        ? [`役「${names.map((x) => YAKU_NAME[x]).join('・')}」があるので、ロンできます。`]
        : [
          '役がひとつもないので、ロンできません。',
          open ? '鳴いた手には、鳴かないときだけの役（平和・一盃口・ツモなど）がつきません。' : 'リーチもしていないので、役がつきません。',
        ],
    };
  });
}

