// ルール（親の設計書 13.1・段階2-3 設計書 3章）。変えられるのは正解が変わる5項目（対局の長さ・赤ドラ・喰いタン・ウマ・オカ）だけで、
// ほかは標準のまま固定する。5項目は小さな形（rules）で持ち、対局を始めるときに部品のルールと DojoGame の設定に組み立てる。
import Majiang from '../../vendor/majiang-core.js';

// 標準の5項目と、選べる値（設定の画面の並び）
export const STANDARD_RULES = { length: 'tonnan', red: 3, kuitan: true, uma: '10-20', oka: true };
export const RULE_OPTIONS = {
  length: ['tonpu', 'tonnan', 'tohoku'],
  red: [0, 3, 4],
  kuitan: [true, false],
  uma: ['0', '5-10', '10-20', '10-30'],
  oka: [true, false],
};

// 赤ドラの枚数 → 部品の「赤牌」（4枚は筒子だけ2枚）
const RED = { 0: { m: 0, p: 0, s: 0 }, 3: { m: 1, p: 1, s: 1 }, 4: { m: 1, p: 2, s: 1 } };
// ウマ → 部品の「順位点」（1位から4位）
const UMA = {
  0: ['0.0', '0.0', '0.0', '0.0'],
  '5-10': ['10.0', '5.0', '-5.0', '-10.0'],
  '10-20': ['20.0', '10.0', '-10.0', '-20.0'],
  '10-30': ['30.0', '10.0', '-10.0', '-30.0'],
};

// 5項目をそろえる。知らない値・欠けた項目は標準に戻す。raw がなければ標準（対局の長さだけ fallbackLength。前の設定・前の対局の記録の種類）
export function normalizeRules(raw, fallbackLength = 'tonnan') {
  const r = { ...STANDARD_RULES, length: RULE_OPTIONS.length.includes(fallbackLength) ? fallbackLength : 'tonnan' };
  if (!raw || typeof raw !== 'object') return r;
  for (const k of Object.keys(RULE_OPTIONS)) if (RULE_OPTIONS[k].includes(raw[k])) r[k] = raw[k];
  return r;
}

// 部品のルールを組み立てる（5項目のほかは標準のまま）
export function buildRule(rules) {
  const r = normalizeRules(rules);
  return Majiang.rule({
    ...BASE,
    '場数': r.length === 'tonpu' ? 1 : 2, // 東風戦は東場だけ。東北戦は2つ目の場を北にする（DojoGame）
    '赤牌': RED[r.red],
    'クイタンあり': r.kuitan,
    '順位点': UMA[r.uma],
  });
}

// DojoGame の設定：north（東北戦）・okaReturn（返しの点。オカありは30,000点返しでトップに+20、なしは25,000点返し）
export function matchOptionsOf(rules) {
  const r = normalizeRules(rules);
  return { north: r.length === 'tohoku', okaReturn: r.oka ? 30000 : 25000 };
}

// 5項目のほかの決まり（標準のまま固定）
const BASE = {
  '配給原点': 25000,
  '連風牌は2符': false,
  '喰い替え許可レベル': 0,
  '途中流局あり': true, // 九種九牌・四風連打・四家立直・四開槓
  '流し満貫あり': true,
  'ノーテン宣言あり': false,
  'ノーテン罰あり': true,
  '最大同時和了数': 1, // 頭はね（ダブロンなし）
  '連荘方式': 2, // 親が聴牌なら連荘
  'トビ終了あり': true,
  'オーラス止めあり': true,
  '延長戦方式': 0, // 西入なし
  '一発あり': true,
  '裏ドラあり': true,
  'カンドラあり': true,
  'カン裏あり': true,
  'カンドラ後乗せ': true,
  'ツモ番なしリーチあり': false,
  'リーチ後暗槓許可レベル': 2,
  '役満の複合あり': true,
  'ダブル役満あり': true,
  '数え役満あり': true,
  '役満パオあり': true,
  '切り上げ満貫あり': false,
};

// 標準ルール：東南戦・赤3枚・喰いタンあり・ウマ10-20・30,000点返し
export const STANDARD_RULE = buildRule(STANDARD_RULES);

// 対局の種類（対局の長さ）。東北戦は北海道で多い打ち方で、東場の次に南場ではなく北場を打つ（局数・終わり方は東南戦と同じ）
export const MATCH_TYPES = {
  tonpu: { label: '東風戦', north: false },
  tonnan: { label: '東南戦', north: false },
  tohoku: { label: '東北戦', north: true },
};
