// 問題の型の一覧（段階4-1 作業3・4）。makeQuestion({ type, seed }) で、型と種から毎回同じ問題を作る。
// 問題の形：{ type, seed, chapter, prompt, figure（図。null 可）, choices: [{ text, tiles（牌の列か null）}], answer, explain: [文] }
import { agari, wait } from './prologue.js';
import { yaku, canWin } from './ch1.js';
import { shanten, ukeire } from './ch2.js';
import { shape, value } from './ch3.js';
import { fu, points } from './ch4.js';
import { safest, suji } from './ch5.js';
import { nearest, someColor } from './ch6.js';
import { pushfold, betaori } from './ch7.js';
import { call, callYaku } from './ch8.js';
import { comeback, finalScore } from './ch9.js';
import { CHAPTERS } from '../chapters.js';
import { rngOf } from './util.js';
import { SCENES } from '../scenes/index.js';

const MAKERS = { agari, wait, yaku, canWin, shanten, ukeire, shape, value, fu, points, safest, suji, nearest, someColor, pushfold, betaori, call, callYaku, comeback, finalScore };

export const QUESTION_TYPES = Object.keys(MAKERS);
export const chapterOfType = (type) => CHAPTERS.find((c) => c.types.includes(type))?.id ?? null;

// 作り直しの上限まで作れなかったときは、種から決まる別の乱数で作り直す（同じ種なら必ず同じ問題）
const FALLBACKS = 12;
export function generateWithFallback(make, seed) {
  for (let k = 0; k <= FALLBACKS; k++) {
    try {
      return make(rngOf(k === 0 ? seed : (seed + k * 0x9e3779b1) >>> 0));
    } catch (e) {
      if (e.message !== '問題を作れなかった' || k === FALLBACKS) throw e;
    }
  }
  throw new Error('問題を作れなかった');
}

// 対局から集めた場面の一覧から出す型（段階4-2）：種で一覧の1件を選ぶので作り直しはしない。make(rng, seed) で呼ぶ
export const SCENE_TYPES = new Set(['nearest', 'someColor', 'pushfold', 'call']);
// 型ごとの一覧の名前と、種が選ぶ一覧の番号（最後のレビューの直し：1回の試験に同じ場面を2度出さないため。一覧の型でなければ null）
const SCENE_LIST = { nearest: 'nearest', someColor: 'some', pushfold: 'pushfold', call: 'call' };
export const sceneSlotOf = (type, seed) => (SCENE_LIST[type] ? `${SCENE_LIST[type]}:${seed % SCENES[SCENE_LIST[type]].length}` : null);

export function makeQuestion({ type, seed }) {
  const make = MAKERS[type];
  if (!make) throw new Error(`知らない問題の型: ${type}`);
  if (!Number.isInteger(seed) || seed < 0) throw new Error(`種が不正: ${seed}`);
  const body = SCENE_TYPES.has(type) ? make(rngOf(seed), seed) : generateWithFallback(make, seed);
  return { type, seed, chapter: chapterOfType(type), ...body };
}

// 作った問題を覚えておく（試験の終わりの採点で20問を作り直さない）
const memo = new Map();
export function cachedQuestion(item) {
  const key = `${item.type}:${item.seed}`;
  if (!memo.has(key)) memo.set(key, makeQuestion(item));
  return memo.get(key);
}
