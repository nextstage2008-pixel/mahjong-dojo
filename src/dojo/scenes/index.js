// 対局から集めた場面の一覧（段階4-2 作業4・設計書 15.2）。一覧は scripts/make-dojo-scenes.mjs が書く（手で直さない）。
// 一覧の場面は縮めてあり（pack.js）、部品のルールも外してあるので、読むときに戻して標準ルールを付ける
import pushfold from './pushfold.js';
import call from './call.js';
import nearest from './nearest.js';
import some from './some.js';
import { unpackScene } from './pack.js';
import { STANDARD_RULE } from '../../core/rule.js';

export const SCENE_NAMES = ['pushfold', 'call', 'nearest', 'some'];
const RAW = { pushfold, call, nearest, some };
export const SCENES = Object.fromEntries(SCENE_NAMES.map((n) => [n, RAW[n].map((e) => ({ ...e, scene: unpackScene(e.scene) }))]));

// 種から1件（種は一覧の長さで回る）。場面に標準ルールを付けて返す
export function sceneEntry(name, seed) {
  const list = SCENES[name];
  if (!list || !list.length) throw new Error(`知らない場面の一覧: ${name}`);
  const e = list[seed % list.length];
  return { ...e, scene: { ...e.scene, rule: STANDARD_RULE } };
}
