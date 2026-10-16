// CPU の4つの型（段階2-3 設計書 2章）：お手本・攻め屋・守り屋・鳴き屋。決まりで打つ（指南の試しは使わない）。
// 違うのはリーチを受けたときの押し引きと鳴きだけで、何切るとリーチは4つの型で同じ（ai.js）。
// 危なさは指南と同じ放銃率の表（coach/danger.js）で見る。画面にも保存にも触らない。
import Majiang from '../../vendor/majiang-core.js';
import { evaluateDiscards, chooseDiscard, lowValueOrder, yakuOutlook, yakuhaiKinds, kindOf, isSetMeld } from './ai.js';
import { dangerAll } from '../coach/danger.js';

const { Util } = Majiang;

// 型の決まりの数字。push：リーチを受けたときの押し引き（'model'・'attack'・'defense'）。call：鳴き（'normal'・'many'・'yakuhai'）。
// 段階4（道場）で「序盤の章では弱めにする」ときは、ここに弱めの値を足す
// 人らしく打つときの数字（段階3-4）。damaLate：この巡目からは役があればダマ（null はしない）。
// damaPoints：役があってこの点（子の点）以上ならダマ（null はしない）。満貫以上はどの型もダマ。
// someMin：1つの色の数牌と字牌がこの枚数以上で染め手に向かう。someLoose：混一色の見込みで手に残ってよい他の色の数牌の枚数（作業3）。
// toitoi：対々和に向かうか。toitoiMin：対子と刻子がこの組数以上で対々和に向かう。someMenzenOnly：染め手は門前のときだけ。
// 数字は 200半荘の通しの試験で、混一色＋清一色 3〜8%・対々和 1〜3%・ダマ 10〜20%・型の並びに合わせた（設計書12章。
// 設計書の初めの数字は 染め手9枚（鳴き屋8）・終盤14巡目・対々和4組で、混一色＋清一色が31%・ダマが8%・対々和が4%になった）
// 段階3-6（設計書 4〜6章。人らしく打つときだけ）：
// damaChange：手変わり待ちのダマ（巡目 maxTurn まで・待ちの残り maxLeft 枚以下・良い待ちに変わるツモ minBetter 枚以上。null はしない）。
// damaThreat：リーチを受けた聴牌のダマ押し（待ちの残り maxLeft 枚以下か、子の点で points 以上。null はしない）。
// damaTop：オーラスのトップ目は役があればダマ。keepSafe：1向聴で唯一の安全牌の候補を残す。hikkake：聴牌の取り方で引っ掛けを選ぶ。
// pushHigh：リーチ1人に、役のあるダマでこの点（子の点）以上の聴牌なら危なさを問わず押す（守り屋。null はしない）
const CHANGE = { maxTurn: 10, maxLeft: 4, minBetter: 4 };
export const STYLES = {
  model: { label: 'お手本', push: 'model', call: 'normal', bailDanger: 0.1, bailWaits: 4, oneShantenSafe: 0.03, damaLate: 11, damaPoints: null, someMin: 11, someLoose: 2, toitoi: true, toitoiMin: 5, someMenzenOnly: false,
    damaChange: CHANGE, damaThreat: { points: 0, maxLeft: 4 }, damaTop: true, keepSafe: true, hikkake: true, pushHigh: null },
  attack: { label: '攻め屋', push: 'attack', call: 'normal', maxPushShanten: 2, damaLate: null, damaPoints: null, someMin: 11, someLoose: 2, toitoi: true, toitoiMin: 5, someMenzenOnly: false,
    damaChange: null, damaThreat: null, damaTop: false, keepSafe: false, hikkake: true, pushHigh: null },
  defense: { label: '守り屋', push: 'defense', call: 'yakuhai', minWaits: 6, maxDanger: 0.05, damaLate: 11, damaPoints: 3900, someMin: 11, someLoose: 2, toitoi: false, toitoiMin: 5, someMenzenOnly: true,
    damaChange: CHANGE, damaThreat: { points: 0, maxLeft: 4 }, damaTop: true, keepSafe: true, hikkake: true, pushHigh: 3900 },
  // 鳴き屋は、1・9牌・字牌が手に2枚まで残っていても断么九の見込みとみる（looseTanyao。後で切る）
  caller: { label: '鳴き屋', push: 'model', call: 'many', bailDanger: 0.1, bailWaits: 4, oneShantenSafe: 0.03, looseTanyao: 2, damaLate: 11, damaPoints: null, someMin: 10, someLoose: 3, toitoi: true, toitoiMin: 4, someMenzenOnly: false,
    damaChange: CHANGE, damaThreat: { points: 0, maxLeft: 4 }, damaTop: true, keepSafe: true, hikkake: true, pushHigh: null },
};

// 手役の方向（段階3-4 設計書 4章・5章）。返すもの：{ kind: 'normal' } ・{ kind: 'some', suit }（染め手）・{ kind: 'toitoi' }。
// 染め手：副露（カンも3枚）を含め、1つの色の数牌と字牌が someMin 枚以上。2つの色が当たれば数牌の多い色（同じなら m・p・s の順）。
// 対々和：対子と刻子（ポン・カン・手の中の刻子）が4組以上で、チーをしていない。両方当たれば染め手。赤5は1枚と数える
export function handDirection(shoupai, styleKey) {
  const st = styleOf(styleKey);
  const num = { m: 0, p: 0, s: 0 };
  let honors = 0;
  for (const s of ['m', 'p', 's']) for (let n = 1; n <= 9; n++) num[s] += shoupai._bingpai[s][n];
  for (let n = 1; n <= 7; n++) honors += shoupai._bingpai.z[n];
  const melds = shoupai._fulou;
  for (const m of melds) {
    if (m[0] === 'z') honors += 3;
    else num[m[0]] += 3;
  }
  if (!(st.someMenzenOnly && melds.length)) {
    // 他の色の数牌を鳴いていれば、その色以外の染めにはできない（最後のレビューの直し）
    const meldSuits = new Set(melds.map((m) => m[0]).filter((x) => x !== 'z'));
    const can = (s) => !meldSuits.size || (meldSuits.size === 1 && meldSuits.has(s));
    let best = null;
    for (const s of ['m', 'p', 's']) if (can(s) && num[s] + honors >= st.someMin && (!best || num[s] > num[best])) best = s;
    if (best) return { kind: 'some', suit: best };
  }
  if (st.toitoi && melds.every(isSetMeld)) {
    let groups = melds.length;
    for (const s of ['m', 'p', 's', 'z']) {
      const b = shoupai._bingpai[s];
      for (let n = 1; n < b.length; n++) if (b[n] >= 2) groups++;
    }
    if (groups >= st.toitoiMin) return { kind: 'toitoi' };
  }
  return { kind: 'normal' };
}

// 満貫（子の点）
export const MANGAN = 8000;

// ダマにするか（段階3-4 設計書 3章・段階3-6 設計書 4章）。value：ai.js の damaValue。turn：巡目（自分の河の枚数＋1）。
// dealer：親か（点を1.5で割って子の点に直す）。left：待ちの残り枚数（ai.js の tenpaiShape）。betterOf：良い待ちに変わるツモの枚数を
// 数える関数（ほかの条件が揃ったときだけ呼ぶ）。threatened：リーチを受けているか。lastTop：オーラスで自分がトップ（同点を含む）か
export function shouldDama(styleKey, value, { turn, dealer, left = null, betterOf = null, threatened = false, lastTop = false }) {
  if (!value || !value.yaku) return false;
  const st = styleOf(styleKey);
  const points = dealer ? value.points / 1.5 : value.points;
  if (points >= MANGAN) return true;
  if (st.damaLate !== null && st.damaLate !== undefined && turn >= st.damaLate) return true;
  if (st.damaPoints !== null && st.damaPoints !== undefined && points >= st.damaPoints) return true;
  const th = st.damaThreat;
  if (threatened && th && ((left !== null && left <= th.maxLeft) || points >= th.points)) return true;
  if (lastTop && st.damaTop) return true;
  const ch = st.damaChange;
  return !!(ch && betterOf && left !== null && turn <= ch.maxTurn && left <= ch.maxLeft && betterOf() >= ch.minBetter);
}

const styleOf = (key) => STYLES[key] || STYLES.model;

// 切る牌と、押したか（push。false は降りた）を選ぶ。threats：リーチの人（coach/scene.js の riichiOf）。
// ctx：放銃率の ctx（{ visible, own, turn }）。リーチを受けていなければ今の何切る（ai.js の chooseDiscard。押し）
// 鳴いた後の手役の方向（段階3-4 作業4の直し）：染め手・対々和の方向で鳴いたら、その方向を局の終わりまで覚えておく
// （鳴いた後に枚数が条件を割って普通の打ち方に戻ると、役のない聴牌が増えたため）。
// 自分が鳴いたときに呼ぶ。shoupai：鳴く前の手。meld：鳴いた面子。locked：もう覚えている方向（あればそのまま）。
// 返すもの：覚える方向（普通なら null）
export function directionAfterCall(shoupai, meld, styleKey, locked = null) {
  if (locked) return locked;
  const after = shoupai.clone();
  after.fulou(meld, false);
  const d = handDirection(after, styleKey);
  return d.kind === 'normal' ? null : d;
}

// 今の手役の方向：鳴いた手で覚えている方向があればそれ、なければ今の手から決める
export function currentDirection(shoupai, styleKey, locked = null) {
  return locked && shoupai._fulou.length ? locked : handDirection(shoupai, styleKey);
}

// 段階3-6（人らしいときだけ渡す）：keepSafe・ownRiver・valueFor はリーチを受けていないとき chooseDiscard へそのまま渡す
// （リーチを受けているときの押し引きには当てない）。valueFor と dealer は守り屋の高い聴牌の押し（pushHigh）にも使う
export function chooseStyleMove(styleKey, { shoupai, options, counts, dora = new Set(), threats = [], ctx, direction = null, yakuOf = null, keepSafe = false, ownRiver = null, valueFor = null, dealer = false }) {
  if (!threats.length) return { option: chooseDiscard(shoupai, options, counts, null, dora, direction, yakuOf, { keepSafe, ownRiver, valueFor }), push: true };
  const st = styleOf(styleKey);
  const ev = evaluateDiscards(shoupai, options, counts).map((e) => ({ ...e, d: dangerAll(e.tile, threats, ctx).p, v: lowValueOrder(e.tile, dora) }));
  const minX = Math.min(...ev.map((e) => e.x));
  const forward = ev.filter((e) => e.x === minX);
  // 降りる：いちばん安全な牌（同じなら価値の低い牌）
  const fold = () => ({ option: ev.slice().sort((a, b) => a.d - b.d || a.v - b.v)[0].option, push: false });
  const push = (e) => ({ option: e.option, push: true });
  // 前に進む牌のうち受け入れ（聴牌なら待ち）のいちばん多い牌。同じなら by の順
  const most = (by) => forward.slice().sort((a, b) => b.u - a.u || by(a, b))[0];
  if (st.push === 'attack') {
    if (minX > st.maxPushShanten) return fold();
    return push(most((a, b) => a.v - b.v));
  }
  if (st.push === 'defense') {
    if (threats.length >= 2 || minX > 0) return fold();
    // 高い聴牌（段階3-6 設計書 4.3）：役のあるダマで子の点に直して pushHigh 以上の打牌があれば、その中で受け入れの多い（同じなら安全な）牌を押す
    if (st.pushHigh && valueFor) {
      const high = forward.filter((e) => {
        const v = valueFor(e.option);
        return v && v.yaku && (dealer ? v.points / 1.5 : v.points) >= st.pushHigh;
      });
      if (high.length) return push(high.sort((a, b) => b.u - a.u || a.d - b.d)[0]);
    }
    const t = most((a, b) => a.d - b.d);
    return t.u >= st.minWaits && t.d <= st.maxDanger ? push(t) : fold();
  }
  // お手本（鳴き屋も同じ）
  if (minX === 0) {
    const t = most((a, b) => a.d - b.d);
    return t.d >= st.bailDanger && t.u < st.bailWaits ? fold() : push(t);
  }
  if (minX === 1) {
    const safe = forward.slice().sort((a, b) => a.d - b.d || b.u - a.u)[0];
    return safe.d <= st.oneShantenSafe ? push(safe) : fold();
  }
  return fold();
}

// 切る牌（押したか降りたかは見ない）
export function chooseStyleDiscard(styleKey, inputs) {
  return chooseStyleMove(styleKey, inputs).option;
}

// リーチを受けたときの打牌：押すと決めた牌で聴牌のままリーチできれば、リーチ（追っかけ。名前の後ろに '*'）。
// 降りると決めた牌は、たまたま聴牌のままでもリーチしない（リーチの後はツモ切りしかできず、押し切ることになるため）。
// lizhi：リーチできる打牌（部品の allow_lizhi。できなければ null・false）。
// damaOf(option)：その牌で聴牌したらダマにするか（人らしい CPU だけ渡す。段階3-4 設計書 3章）。ダマならリーチせず押す
export function chooseStyleDapai(styleKey, inputs, lizhi, damaOf = null) {
  const { option, push } = chooseStyleMove(styleKey, inputs);
  if (push && lizhi && lizhi.includes(option) && !(damaOf && damaOf(option))) {
    const e = evaluateDiscards(inputs.shoupai, [option], inputs.counts)[0];
    if (e.x === 0 && e.u > 0) return option + '*';
  }
  return option;
}

// 鳴くか（段階2-3 設計書 2.2）。peng・chi：鳴ける面子。threat：リーチを受けているか。返すもの：鳴く面子か null。
// human：人らしく打つか（段階3-4 設計書 4〜6章）。手役の方向が染め手なら染めの色と字牌の面子だけ、対々和ならポンだけを候補にし、
// 役の見込みに混一色・対々和も入れる。対々和のポンは普通の形の向聴数が進むか同じなら鳴く（1向聴以内の関門は当てない）
// direction：今の手役の方向（覚えている方向。cpu-player が currentDirection で渡す。なければ今の手から決める）
export function chooseStyleCall(styleKey, { shoupai, rongpai, peng = [], chi = [], zhuangfeng, menfeng, kuitan = true, threat = false, human = false, direction = null }) {
  const st = styleOf(styleKey);
  const yakuhai = yakuhaiKinds(zhuangfeng, menfeng);
  const now = Util.xiangting(shoupai);
  const after = (m) => {
    const s2 = shoupai.clone();
    s2.fulou(m, false);
    return Util.xiangting(s2);
  };
  const yakuPon = yakuhai.has(kindOf(rongpai)) && peng.length ? peng[0] : null;
  if (st.call === 'yakuhai') return threat ? null : yakuPon;
  // 手役の方向に合う面子だけ（人らしいとき）
  const dir = human ? direction || handDirection(shoupai, styleKey) : { kind: 'normal' };
  const fits = (m) => (dir.kind === 'some' ? m[0] === 'z' || m[0] === dir.suit : dir.kind === 'toitoi' ? isSetMeld(m) : true);
  const cands = [...peng, ...chi].filter(fits);
  const looseTanyao = st.looseTanyao || 0;
  // 混一色・対々和の見込みは、染め手・対々和の方向にいるときだけ見る（普通の方向で見ると、方向を覚えない鳴きになり役のない聴牌が増える）。
  // リーチを受けているときは見ない（鳴いてすぐ聴牌になる鳴きだけなので、見込みでなく確かな役が要る。最後のレビューの直し）
  const look = (m) => yakuOutlook(shoupai, m, { zhuangfeng, menfeng, kuitan, looseTanyao: threat ? 0 : looseTanyao, wide: !threat && dir.kind !== 'normal', someLoose: st.someLoose }).kind;
  if (threat) {
    // リーチを受けているときは、鳴いて聴牌になるときだけ（役のある鳴き）
    const ok = cands.filter((m) => after(m) === 0 && look(m));
    return ok[0] || null;
  }
  if (yakuPon && fits(yakuPon)) return yakuPon;
  if (dir.kind === 'toitoi') {
    // 対々和のポン：普通の形の向聴数（七対子を数えない）が進むか同じなら鳴く
    const yiban = (sp) => Util.xiangting_yiban(sp);
    const nowY = yiban(shoupai);
    const ok = cands.filter((m) => {
      const s2 = shoupai.clone();
      s2.fulou(m, false);
      return yiban(s2) <= nowY && look(m);
    });
    return ok[0] || null;
  }
  // 向聴数が進み、鳴いた後に役がある鳴き。お手本・攻め屋は鳴いた後が1向聴以内のときだけ、鳴き屋は向聴数によらない
  const ok = cands
    .map((m) => ({ m, x: after(m) }))
    .filter((c) => c.x < now && (st.call === 'many' || c.x <= 1) && look(c.m))
    .sort((a, b) => a.x - b.x);
  return ok.length ? ok[0].m : null;
}
