// 第4章「点数」の問題（段階4-1 作業4）：何符？・何点？
// 答えは今の標準ルールでの上がりの計算（huleOf）。符の内訳は手の組から数え、計算の符と合う手だけを使う（合わない手は作り直す）
import { tileName } from '../../ui/view-model.js';
import { retry, withChoices, makeHand, stringOf, without, huleOf, yakuOf, YAKU_NAME, pick, windName, fmtNum } from './util.js';

const FUS = [20, 25, 30, 40, 50, 60, 70];
const isTerminal = (code) => code[0] === 'z' || code[1] === '1' || code[1] === '9';
const meldOf = (s) => (s.kind === 'shun' ? `${s.codes[0]}-${s.codes[1][1]}${s.codes[2][1]}` : `${s.codes[0]}${s.codes[1][1]}${s.codes[2][1]}=`);

// 手を作り、上がり牌を組か頭から1枚選ぶ。返す値：{ fig, h, open, from（上がり牌が入っていた組の番号。頭なら -1）}
function deal(rng) {
  const h = makeHand(rng, { shun: 0.6 });
  if (!h) return null;
  const open = rng() < 0.4 ? 1 + Math.floor(rng() * 2) : 0;
  const how = rng() < 0.5 ? 'ron' : 'tsumo';
  const menfeng = rng() < 0.35 ? 0 : 1 + Math.floor(rng() * 3);
  const winds = { zhuangfeng: Math.floor(rng() * 2), menfeng };
  // 後ろの組から鳴く（鳴いた組には上がり牌を入れない）
  const order = [...h.sets.keys()].reverse();
  const melded = order.slice(0, open);
  const closedSets = [...h.sets.keys()].filter((i) => !melded.includes(i));
  const from = rng() < 0.2 ? -1 : pick(rng, closedSets);
  const piece = from < 0 ? h.pair.codes : h.sets[from].codes;
  const win = pick(rng, piece);
  const closed = [...closedSets.flatMap((i) => h.sets[i].codes), ...h.pair.codes];
  const fig = { kind: 'hand', tiles: stringOf(without(closed, win)), melds: melded.map((i) => meldOf(h.sets[i])), win, how, baopai: [], ...winds };
  return { fig, h, melded, from };
}

// 符の内訳（手の組から数える）。返す値：[{ label, fu }] と合計（10の位に切り上げた符）
function fuParts({ fig, h, melded, from }, names) {
  const menzen = melded.length === 0;
  if (names.includes('平和')) {
    const parts = fig.how === 'tsumo' ? [{ label: '平和のツモ（決まりで）', fu: 20 }] : [{ label: '基本', fu: 20 }, { label: '鳴かずにロン', fu: 10 }];
    return { parts, total: fig.how === 'tsumo' ? 20 : 30 };
  }
  const parts = [{ label: '基本', fu: 20 }];
  if (fig.how === 'ron' && menzen) parts.push({ label: '鳴かずにロン', fu: 10 });
  if (fig.how === 'tsumo') parts.push({ label: 'ツモ', fu: 2 });
  h.sets.forEach((s, i) => {
    if (s.kind !== 'ke') return;
    const open = melded.includes(i) || (fig.how === 'ron' && from === i);
    const base = isTerminal(s.tile) ? 4 : 2;
    parts.push({ label: `${tileName(s.tile)}3枚の${open ? '明刻（鳴いたかロンでそろった）' : '暗刻（自分でそろえた）'}`, fu: open ? base : base * 2 });
  });
  const pt = h.pair.tile;
  const yakuhai = ['z5', 'z6', 'z7'].includes(pt) ? 2 : 0;
  const wind = (pt === `z${fig.zhuangfeng + 1}` ? 2 : 0) + (pt === `z${fig.menfeng + 1}` ? 2 : 0);
  if (yakuhai + wind) parts.push({ label: '頭が役牌', fu: yakuhai + wind });
  if (from === -1) parts.push({ label: '単騎待ち（頭の待ち）', fu: 2 });
  else if (h.sets[from].kind === 'shun') {
    const n = +h.sets[from].tile[1];
    const w = +(fig.win[1] === '0' ? 5 : fig.win[1]);
    if (w === n + 1) parts.push({ label: '嵌張待ち（間の待ち）', fu: 2 });
    else if ((n === 1 && w === 3) || (n === 7 && w === 7)) parts.push({ label: '辺張待ち（端の待ち）', fu: 2 });
  }
  const sum = parts.reduce((a, p) => a + p.fu, 0);
  let total = Math.ceil(sum / 10) * 10;
  if (!menzen && total === 20) total = 30; // 鳴いた手で符がつかないときは30符
  return { parts, total };
}

// 符の問いと点数の問いに使う手：翻1〜3で満貫にならず、符の内訳が計算と合う
function scored(rng) {
  return retry(rng, () => {
    const d = deal(rng);
    if (!d) return null;
    const hl = huleOf(d.fig);
    const names = yakuOf(hl);
    if (!names.length || names.some((n) => !YAKU_NAME[n])) return null;
    if (hl.fanshu < 1 || hl.fanshu > 3 || hl.damanguan || hl.defen >= (d.fig.menfeng === 0 ? 12000 : 8000)) return null;
    if (names.includes('七対子')) return null;
    const fu = fuParts(d, names);
    if (fu.total !== hl.fu) return null;
    return { ...d, hl, names, fu };
  });
}

const ceil100 = (x) => Math.ceil(x / 100) * 100;
// 点数の書き方：ロン「3,900点」・子のツモ「1,000・2,000点」（子の払い・親の払い）・親のツモ「2,000点オール」
export function pointsText({ fu, han, dealer, how }) {
  const base = fu * 2 ** (han + 2);
  if (how === 'ron') return `${fmtNum(ceil100(base * (dealer ? 6 : 4)))}点`;
  if (dealer) return `${fmtNum(ceil100(base * 2))}点オール`;
  return `${fmtNum(ceil100(base))}・${fmtNum(ceil100(base * 2))}点`;
}

const seatText = (fig) => (fig.menfeng === 0 ? '親' : '子');
const howText = (fig) => (fig.how === 'ron' ? 'ロン' : 'ツモ');
const situation = (fig) => `${seatText(fig)}の${howText(fig)}・場風は${windName(fig.zhuangfeng)}・自風は${windName(fig.menfeng)}`;
const hanText = (s) => `役は${s.names.map((n) => YAKU_NAME[n]).join('・')}${s.hl.hupai.some((x) => x.name === '赤ドラ') ? '・赤ドラ' : ''}で${s.hl.fanshu}翻。`;

// この上がりは何符？
export function fu(rng) {
  return retry(rng, () => {
    const s = scored(rng);
    const right = `${s.hl.fu}符`;
    const wrongs = FUS.filter((f) => f !== s.hl.fu).sort((a, b) => Math.abs(a - s.hl.fu) - Math.abs(b - s.hl.fu)).slice(0, 4).map((f) => `${f}符`);
    const pickd = withChoices(rng, right, wrongs, { count: 4 });
    const sum = s.fu.parts.reduce((a, p) => a + p.fu, 0);
    return {
      prompt: `この上がりは何符？（${situation(s.fig)}）`,
      figure: s.fig,
      choices: pickd.choices.map((text) => ({ text, tiles: null })),
      answer: pickd.answer,
      explain: [
        s.fu.parts.map((p) => `${p.label} ${p.fu}符`).join('、') + `。`,
        sum === s.hl.fu ? `合計 ${s.hl.fu}符。` : `合計 ${sum}符 → ${s.hl.fu}符（10の位に切り上げ${sum < 20 || s.hl.fu - sum > 9 ? '・鳴いた手の最低は30符' : ''}）。`,
      ],
    };
  });
}

// この上がりは何点？（積み棒・供託なし）
export function points(rng) {
  return retry(rng, () => {
    const s = scored(rng);
    const dealer = s.fig.menfeng === 0;
    const f = s.hl.fenpei;
    let right;
    if (s.fig.how === 'ron') right = `${fmtNum(s.hl.defen)}点`;
    else if (dealer) right = `${fmtNum(-f[1])}点オール`;
    else right = `${fmtNum(-f[[1, 2, 3].find((x) => x !== s.fig.menfeng)])}・${fmtNum(-f[0])}点`;
    if (right !== pointsText({ fu: s.hl.fu, han: s.hl.fanshu, dealer, how: s.fig.how })) return null; // 表の決まりと計算が合う手だけ
    const near = [];
    for (const dh of [-1, 0, 1]) for (const df of [-10, 0, 10, 20]) {
      const han = s.hl.fanshu + dh;
      const fu2 = s.hl.fu + df;
      if (han >= 1 && han <= 3 && fu2 >= 20 && fu2 <= 70) near.push(pointsText({ fu: fu2, han, dealer, how: s.fig.how }));
    }
    near.push(pointsText({ fu: s.hl.fu, han: s.hl.fanshu, dealer: !dealer, how: s.fig.how }));
    const pickd = withChoices(rng, right, near, { count: 4 });
    return {
      prompt: `この上がりは何点？（${situation(s.fig)}）`,
      figure: s.fig,
      choices: pickd.choices.map((text) => ({ text, tiles: null })),
      answer: pickd.answer,
      explain: [
        hanText(s) + ` 符は${s.hl.fu}符。`,
        `${s.hl.fu}符${s.hl.fanshu}翻の${seatText(s.fig)}の${howText(s.fig)}は ${right}${dealer && s.fig.how === 'tsumo' ? '（3人がそれぞれ払う）' : !dealer && s.fig.how === 'tsumo' ? '（子が払う額・親が払う額）' : ''}。`,
      ],
    };
  });
}
