// 自分の番や鳴ける場面で「押せるボタン」と「その返事」を決める。画面には触らない。
import { meldTiles, tileName } from './view-model.js';
// 返事の書き方は部品の Game が受け取る形（{ hule }・{ dapai }・{ fulou }・{ gang }・{ daopai }）。

// 副露・槓の面子を、ボタンに添える数字にする（'m3-45' → '345'）
const digitsOf = (m) => m.slice(1).replace(/[^\d]/g, '').replace(/0/g, '5');
// チーの候補が複数あるときの数字。赤5を使うかどうかで分かれるので赤は「赤5」と書く（'m34-0' → '34赤5'）
const chiDigits = (m) => m.slice(1).replace(/[^\d]/g, '').replace(/0/g, '赤5');
// ポンの候補が複数あるのは、赤5を使うか残すかの違いだけ
const ponLabel = (m, many) => (many ? (m.includes('0') ? 'ポン（赤5を使う）' : 'ポン（赤5を残す）') : 'ポン');

// 切る牌のボタン（手牌の位置）から、Game に返す打牌の書き方を決める。
// ツモ牌を切るときは '_'（ツモ切り）の書き方があればそれを使う
export function discardOption(options, code, isZimo) {
  if (isZimo && options.includes(code + '_')) return code + '_';
  if (options.includes(code)) return code;
  if (options.includes(code + '_')) return code + '_';
  return null;
}

// 手牌の並び（tiles・zimo）のうち、切れる牌の位置（-1 はツモ牌）
export function allowedIndexes(options, tiles, zimo) {
  const set = new Set();
  tiles.forEach((code, i) => { if (discardOption(options, code, false)) set.add(i); });
  if (zimo && discardOption(options, zimo, true)) set.add(-1);
  return set;
}

// 場面ごとのボタン。kind は human-player の問いかけの種類
export function buttonsFor(kind, choices) {
  const b = [];
  if (kind === 'myZimo') {
    if (choices.hule) b.push({ id: 'tsumo', label: 'ツモ', reply: { hule: '-' }, primary: true });
    if (choices.lizhi && choices.lizhi.length) b.push({ id: 'riichi', label: 'リーチ', mode: 'riichi', primary: true });
    for (const m of choices.gang || []) b.push({ id: 'kan', label: 'カン ' + digitsOf(m), reply: { gang: m } });
    if (choices.daopai) b.push({ id: 'kyushu', label: '九種九牌', reply: { daopai: '-' } });
    return b;
  }
  if (kind === 'otherDapai' || kind === 'otherGang') {
    if (choices.hule) b.push({ id: 'ron', label: 'ロン', reply: { hule: '-' }, primary: true });
    // word と tiles：ボタンには言葉と、できあがる面子の牌の絵を出す（label は読み上げ用の名前）
    for (const m of choices.peng || []) b.push({ id: 'pon', label: ponLabel(m, choices.peng.length > 1), word: 'ポン', tiles: meldTiles(m), reply: { fulou: m } });
    for (const m of choices.chi || []) b.push({ id: 'chi', label: (choices.chi.length > 1 ? 'チー ' + chiDigits(m) : 'チー'), word: 'チー', tiles: meldTiles(m), reply: { fulou: m } });
    for (const m of choices.gang || []) b.push({ id: 'kan', label: 'カン', word: 'カン', tiles: meldTiles(m), reply: { fulou: m } });
    if (b.length) b.push({ id: 'skip', label: 'スキップ', reply: {} });
    return b;
  }
  return b;
}

// 鳴きの候補が手牌から使う牌（種類ごとの枚数。候補が何通りあっても、どれかで使う牌は全部）
export function usedHandTiles(choices) {
  const used = {};
  for (const m of [...(choices.peng || []), ...(choices.chi || []), ...(choices.gang || [])]) {
    const count = {};
    for (const t of meldTiles(m)) if (!t.side) count[t.code] = (count[t.code] || 0) + 1;
    for (const [code, n] of Object.entries(count)) used[code] = Math.max(used[code] || 0, n);
  }
  return used;
}

// 帯に出す一言。call：鳴ける場面の { name（出した人）, tile, ron（ロンできるか） }
export function messageFor(kind, mode, call = null) {
  if (mode === 'riichi') return 'リーチする牌を選んでください';
  if (kind === 'myZimo') return 'あなたの番です。切る牌を選んでください';
  if (kind === 'myFulou') return '鳴きました。切る牌を選んでください';
  if (kind === 'otherDapai' || kind === 'otherGang') {
    if (!call) return '鳴けます。どうしますか？';
    return `${call.name}の${tileName(call.tile)}${call.ron ? 'でロンできます' : 'を鳴けます'}。どうしますか？`;
  }
  return '';
}

// 自分に問われていないときの帯：いま誰の番か
export function waitingMessage(view) {
  const s = view.seats.find((x) => x.turn);
  return s && s.rel !== 0 ? `${s.name}の番` : '';
}

// 自動で打つときの返事（画面の確かめ・通しの試験用）：上がれれば上がり、鳴かず、ツモ切り
// リーチの後に自動で切る返事（2026-10-16 先生の希望）。リーチの後は切れる牌が引いた牌だけになるので、それを切る。
// ツモで上がれるとき・カンできるときは人に聞く（null）。riichi：自分がリーチしているか
export function riichiAutoDiscard(kind, info, riichi) {
  if (kind !== 'myZimo' || !riichi) return null;
  const c = info.choices || {};
  if (c.hule || (c.gang && c.gang.length)) return null;
  const d = c.dapai || [];
  return d.length === 1 ? { dapai: d[0] } : null;
}

export function autoReply(kind, info) {
  const c = info.choices || {};
  if (kind === 'myZimo') {
    if (c.hule) return { hule: '-' };
    if (c.lizhi && c.lizhi.length) return { dapai: c.lizhi[c.lizhi.length - 1] + '*' };
    return { dapai: c.dapai[c.dapai.length - 1] };
  }
  if (kind === 'myFulou') return { dapai: c.dapai[c.dapai.length - 1] };
  if ((kind === 'otherDapai' || kind === 'otherGang') && c.hule) return { hule: '-' };
  return {};
}

// 鳴きの答え合わせの1行（段階2-2 設計書 5.4）をどうするか。kind：いま問われていること。
// 'show'：帯の上に出す（鳴いたら鳴いた後の打牌、鳴かなかったら次の自分の番）。'keep'：出さずに持ち越す（ほかの人の打牌で鳴けますと
// 聞かれている間）。'drop'：消す
export function callVerdictPlace(kind) {
  if (kind === 'myFulou' || kind === 'myZimo') return 'show';
  if (kind === 'otherDapai') return 'keep';
  return 'drop';
}

// 鳴きのボタンを詰めて（絵を小さく・言葉を省いて）出すか。帯の1段に収まらないと、はみ出したボタンが下の手牌の欄にもぐって
// 押せない。ボタンが4つ以上か、面子の絵が合わせて7枚以上（ポン＋カン＋スキップ）なら詰める
export function callButtonsCompact(list) {
  const tiles = list.reduce((a, b) => a + (b.tiles ? b.tiles.length : 0), 0);
  return list.length > 3 || tiles >= 7;
}

// カットイン（手直し 5章）：場面ごとの言葉と長さ（ミリ秒）。先生のご要望（速すぎて見えない）で約2倍：
// リーチ・ロン・ツモは1.3秒、鳴き（ポン・チー・カン）は0.9秒。カットインを出さない場面は null
const CUT_IN = { riichi: ['リーチ', 1300], ron: ['ロン', 1300], tsumo: ['ツモ', 1300], pon: ['ポン', 900], chi: ['チー', 900], kan: ['カン', 900] };
export function cutInSpec(scene) {
  const c = Object.hasOwn(CUT_IN, scene) ? CUT_IN[scene] : null;
  return c ? { word: c[0], ms: c[1] } : null;
}

// 演出の長さ（ミリ秒。手直し 6章・7章。先生のご要望で約2倍）：リーチの宣言牌と名札の光・リーチ棒が落ちる・
// 上がった人の席と上がり牌の光・ロンの矢印と牌・倒した手を見せる間
export const FX_MS = { riichiGlow: 1800, stickDrop: 700, winGlow: 2600, ronArrow: 1200, reveal: 1600 };

// 手牌をなぞる音（2026-10-17 先生「なぞったら、からからからみたいな軽快な音」）：パソコンのマウスで、さっきと違う牌に乗ったら鳴らす。
// スマホの指・ペンでは鳴らさない（先生の判断）。続けて鳴らすのは TRACE_GAP_MS あける（速くなぞっても音が団子にならないように）。
// tile：乗った牌（data-i。牌の外なら null）。last：さっき乗っていた牌。now・lastAt：今と前に鳴らした時刻（ミリ秒）
export const TRACE_GAP_MS = 30;
export function traceTick({ pointerType, tile, last, now, lastAt }) {
  return pointerType === 'mouse' && tile !== null && tile !== last && now - lastAt >= TRACE_GAP_MS;
}

// 手牌の操作（先生のご要望「触ってから反応するまでがもっさり」）：phase は 'down'（触れた瞬間）か 'up'（離したとき）。
// 触れた瞬間に、浮いていない牌は浮かせ（'raise'）、浮いている牌は切る（'discard'）。離したときは、上へはじいたときだけ切る。
// selected：その牌がすでに浮いているか。moved・dy（上が負）・dt（押していた時間）：はじいたかを見る。
// mouse：パソコンのマウス。なぞった牌はもう一段上がっているので、押した瞬間に切る（2026-10-17 先生「1回のクリックで切る」）
export function handTouch(phase, { selected = false, moved = false, dy = 0, dt = 0, mouse = false } = {}) {
  if (phase === 'down') return selected || mouse ? 'discard' : 'raise';
  return moved && (dy < -34 || (dy < -14 && dt < 160)) ? 'discard' : 'none';
}
