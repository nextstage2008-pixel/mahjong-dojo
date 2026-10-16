// 数える（設計書 4.1）：切る候補ごとに、向聴数・受け入れ（①速さ）、聴牌したときの待ちの形（②形）、
// 残るドラの枚数（③打点の手がかり）を正確に数える。一瞬で終わるので、切る前の帯の数字はここから出す。
import Majiang from '../../vendor/majiang-core.js';
import { kindOf } from '../core/ai.js';

const { Shoupai, Util, Shan } = Majiang;

// 候補の名前：切る牌の書き方から、ツモ切りの印などを外したもの（赤5は '0' のまま別の候補）
export const keyOf = (option) => option.slice(0, 2);

// その種類の牌が、自分から見てあと何枚残っているか
export const leftOf = (visible, k) => Math.max(0, 4 - (visible[k] || 0));

// ドラの種類（ドラ表示牌の次の牌）
export function doraKindsOf(baopai) {
  return new Set(baopai.map((p) => kindOf(Shan.zhenbaopai(p))));
}

// 手にあるドラの枚数（表のドラと赤5。副露も数える）
export function doraCount(sp, dora) {
  let n = 0;
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    for (let k = 1; k < b.length; k++) if (dora.has(s + k)) n += b[k];
    if (s !== 'z') n += b[0];
  }
  for (const m of sp._fulou) {
    for (const d of m.match(/\d/g)) {
      if (dora.has(kindOf(m[0] + d))) n++;
      if (d === '0') n++;
    }
  }
  return n;
}

// 聴牌の待ちの枚数。drawn を引いたばかりなら、その1枚は残りから引く
function waitTiles(kinds, left, drawn = null) {
  return kinds.reduce((a, k) => a + Math.max(0, left(k) - (k === drawn ? 1 : 0)), 0);
}

// 1向聴の13枚：受け入れの牌ごとに「引いて、待ちのいちばん多い聴牌に切った」ときの待ちを、
// 引ける枚数で重みを付けて平均する。待ちが2種類以上になる割合を「両面になる割合」とする
export function shapeOf(sp13, kinds, left) {
  let total = 0;
  let weight = 0;
  let good = 0;
  for (const k of kinds) {
    const w = left(k);
    if (!w) continue;
    const s2 = sp13.clone().zimo(k);
    let best = null;
    for (const d of s2.get_dapai(false)) {
      const s3 = s2.clone().dapai(d);
      if (Util.xiangting(s3) !== 0) continue;
      const t = Util.tingpai(s3);
      const n = waitTiles(t, left, k);
      if (!best || n > best.n || (n === best.n && t.length > best.kinds)) best = { n, kinds: t.length };
    }
    if (!best) continue;
    total += best.n * w;
    weight += w;
    if (best.kinds >= 2) good += w;
  }
  return weight ? { avg: total / weight, good: good / weight } : { avg: 0, good: 0 };
}

// 切る候補ごとの数字。scene は scene.js の sceneOf の形（options は切れる牌）
export function countCandidates(scene) {
  const sp14 = Shoupai.fromString(scene.hand);
  const dora = doraKindsOf(scene.baopai);
  const left = (k) => leftOf(scene.visible, k);
  const out = [];
  const seen = new Set();
  for (const option of scene.options) {
    const key = keyOf(option);
    if (seen.has(key)) continue;
    seen.add(key);
    const after = sp14.clone().dapai(option);
    const x = Util.xiangting(after);
    const kinds = Util.tingpai(after) || [];
    const n = kinds.reduce((a, k) => a + left(k), 0);
    const c = { key, option, x, kinds, n, dora: doraCount(after, dora), shape: null, wait: null };
    if (x === 0) c.wait = { kinds, n };
    if (x === 1) c.shape = shapeOf(after, kinds, left);
    out.push(c);
  }
  return out;
}

// 鳴きの候補ごとの数字（段階2-2 設計書 3.2）：'skip'（鳴かない）は今の13枚の向聴数、面子は鳴いて1枚切った後の向聴数
export function callCandidates(scene) {
  const sp = Shoupai.fromString(scene.hand);
  const out = [{ key: 'skip', x: Util.xiangting(sp) }];
  for (const m of scene.melds) {
    const s2 = sp.clone();
    s2.fulou(m, false);
    out.push({ key: m, x: Util.xiangting(s2) });
  }
  return out;
}
