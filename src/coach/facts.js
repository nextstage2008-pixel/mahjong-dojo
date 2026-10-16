// 場面の事実と手の形の印（段階3-3 設計書 4章・6章）：問題の見出しと傾向のために、判断のとき指南の記録に書く。
// 画面に触らない。
import Majiang from '../../vendor/majiang-core.js';
import { doraKindsOf } from './count.js';

const plain = (key) => key.replace(/[*!]/g, '');
// 牌の種類（赤5は5）
const kindOf = (p) => p[0] + (p[1] === '0' ? '5' : p[1]);

// 場面の事実。spot：考えどころの調べ（minX：最善の向聴数。押し引きなら fold：降りる牌・dangers：候補ごとの放銃率）。
// 返すもの：{ shanten, threats（リーチの人の数）, dealerThreat（親のリーチがあるか）, turn（巡目）, folded（押し引きで、選んだ牌が
// 降りる牌と同じだけ安全か。押し引きでなければ null） }。鳴きの場面は callTile（鳴ける牌）も
export function factsOf(scene, spot, key) {
  const threats = scene.threats || [];
  const shanten = spot && Number.isInteger(spot.minX) ? spot.minX : Majiang.Util.xiangting(Majiang.Shoupai.fromString(scene.hand));
  let folded = null;
  if (spot && spot.fold && spot.dangers) {
    const d = spot.dangers;
    const mine = d[plain(key)];
    const fold = d[plain(spot.fold)];
    folded = mine !== undefined && fold !== undefined && mine <= fold + 1e-12;
  }
  const facts = { shanten, threats: threats.length, dealerThreat: threats.some((t) => t.dealer), turn: scene.turn, folded };
  if (scene.tile) facts.callTile = kindOf(scene.tile);
  return facts;
}

// その牌が両面の塔子の1枚か（同じ色の隣の牌があり、塔子の両端が1〜9に収まる）
function inRyanmen(sp, code) {
  const k = kindOf(code);
  if (k[0] === 'z') return false;
  const b = sp._bingpai[k[0]];
  const n = +k[1];
  return (n >= 2 && n <= 7 && b[n + 1] > 0) || (n >= 3 && n <= 8 && b[n - 1] > 0);
}

// その牌が手の中で孤立した字牌か
function isolatedHonor(sp, code) {
  const k = kindOf(code);
  return k[0] === 'z' && sp._bingpai.z[+k[1]] === 1;
}

// 手の形の印（何切るで、選んだ手が最善と違うとき）：'ryanmen' 両面の塔子を崩した・'honor' 孤立した字牌を残して数牌を切った・
// 'dora' ドラか赤5を切った（最善はそうでない）
export function shapeTags(scene, chosen, best) {
  const c = plain(chosen);
  const b = plain(best);
  if (!b || c === b) return [];
  const sp = Majiang.Shoupai.fromString(scene.hand);
  const dora = doraKindsOf(scene.baopai || []);
  const isDora = (p) => p[1] === '0' || dora.has(kindOf(p));
  const tags = [];
  if (inRyanmen(sp, c) && !inRyanmen(sp, b)) tags.push('ryanmen');
  if (isolatedHonor(sp, b) && kindOf(c)[0] !== 'z') tags.push('honor');
  if (isDora(c) && !isDora(b)) tags.push('dora');
  return tags;
}
