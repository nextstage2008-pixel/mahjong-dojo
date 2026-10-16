// 牌の危なさ（段階2-2 設計書 4.1）：リーチの人に、その牌を切ったら当たる見込み（放銃率）。
// 表は kobalab「天鳳鳳凰卓の牌の危険度表」（2019年・全リーチ1,300,316件・リーチ宣言の直後・赤あり喰いタンあり）。
// 壁は gimite「統計による麻雀危険牌分析」で補う（リサーチノート「2026-10-08_リーチへの押し引きの統計（放銃率・打点・和了率）」）。
// 画面に触らない（Web Worker でも動く）。

// 牌の種類ごとの放銃率
export const DANGER = {
  genbutsu: 0,
  z0: 0.0429, // 字牌：卓に見えている枚数 0（生牌）
  z1: 0.0211,
  z2: 0.0028,
  z3: 0.0001,
  suji19: 0.0202,
  suji28: 0.035,
  suji37: 0.0462,
  nakasuji: 0.0281, // 4・5・6 の両筋
  katasuji: 0.071, // 4・5・6 の片筋
  musuji19: 0.0665,
  musuji28: 0.0772,
  musuji37: 0.0842,
  musuji456: 0.1156,
  nochance: 0.03, // 壁（無筋・片筋のとき、表の値と小さい方）
  onechance: 0.076,
};

// 放銃率の頭打ち
export const DANGER_CAP = 0.3;

// 数牌の両面のうち、その牌 n に当たる形（[塔子の2枚, 筋の相手]）。
// n+1・n+2 の両面は n と n+3 で待つ。n−2・n−1 の両面は n−3 と n で待つ
function ryanmenShapes(n) {
  const out = [];
  if (n + 3 <= 9) out.push({ tiles: [n + 1, n + 2], partner: n + 3 });
  if (n - 3 >= 1) out.push({ tiles: [n - 2, n - 1], partner: n - 3 });
  return out;
}

// t：リーチの人（{ safe: 現物の種類 }）。ctx：{ visible（見えている枚数・自分の手を含む）, own（自分の手の枚数）, turn（巡目） }。
// 返すもの：牌の種類の名前（DANGER の名前。壁のときは 'nochance'・'onechance'）
export function categoryOf(kind, t, ctx) {
  const safe = new Set(t.safe);
  if (safe.has(kind)) return 'genbutsu';
  const s = kind[0];
  const n = +kind[1];
  if (s === 'z') {
    const onTable = Math.max(0, (ctx.visible[kind] || 0) - ((ctx.own && ctx.own[kind]) || 0));
    return 'z' + Math.min(3, onTable);
  }
  const shapes = ryanmenShapes(n);
  // 筋：その形の待ちの相手が現物なら、その形では当たらない（振聴）
  const live = shapes.filter((sh) => !safe.has(s + sh.partner));
  let base;
  if (n >= 4 && n <= 6) base = live.length === 0 ? 'nakasuji' : live.length === 1 ? 'katasuji' : 'musuji456';
  else {
    const tag = n === 1 || n === 9 ? '19' : n === 2 || n === 8 ? '28' : '37';
    base = (live.length === 0 ? 'suji' : 'musuji') + tag;
  }
  if (base === 'nakasuji' || base.startsWith('suji')) return base;
  // 壁：残った形のどれもが、要る牌が4枚見えて作れない → ノーチャンス。どれも3枚以上見えている牌を含む → ワンチャンス
  const seen = (m) => ctx.visible[s + m] || 0;
  if (live.every((sh) => sh.tiles.some((m) => seen(m) >= 4))) return DANGER.nochance < DANGER[base] ? 'nochance' : base;
  if (live.every((sh) => sh.tiles.some((m) => seen(m) >= 3))) return DANGER.onechance < DANGER[base] ? 'onechance' : base;
  return base;
}

// 巡目の倍率（表はリーチ直後の値。巡目が進むと残った牌が危なくなる）。字牌（卓に0〜1枚）だけに掛ける：
// 生牌の役牌の巡目別（5巡目3.2%→17巡目12.1%）から。数牌は掛けない（試しの中で通った牌が現物に足されて筋が増えるので、
// 倍率と重なる。掛けると聴牌で押したときの振り込みが21.8%と統計の15〜19%より多くなった。掛けないと19.3%。設計書10章）
export function turnFactor(kind, category, turn) {
  if (category === 'genbutsu' || kind[0] !== 'z') return 1;
  if (category !== 'z0' && category !== 'z1') return 1;
  return turn <= 6 ? 0.8 : turn <= 9 ? 1.1 : turn <= 12 ? 1.5 : turn <= 15 ? 2.1 : 2.8;
}

// リーチの人1人への放銃率
export function dangerOf(kind, t, ctx) {
  const c = categoryOf(kind, t, ctx);
  return Math.min(DANGER_CAP, DANGER[c] * turnFactor(kind, c, ctx.turn));
}

// リーチの人みんなへの放銃率：どちらかに当たる見込み 1−Π(1−pᵢ)。each：1人ずつの値
export function dangerAll(kind, threats, ctx) {
  const each = threats.map((t) => dangerOf(kind, t, ctx));
  let none = 1;
  for (const p of each) none *= 1 - p;
  return { p: 1 - none, each };
}
