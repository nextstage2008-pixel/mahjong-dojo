// 種（数字）から、毎回同じ並びを作る乱数。
// 同じ種なら同じ牌山になるので、「同じ山を打ち直す」「続きから」の土台になる。

// 0 以上 1 未満の数を順に返す関数を作る（mulberry32）
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 元の種と番号から、別の種を作る（局ごとの牌山の種など）
export function deriveSeed(seed, n) {
  let h = (seed >>> 0) ^ Math.imul((n >>> 0) + 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

// 配列をその場で混ぜる（Fisher–Yates）
export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

// 新しい種（対局を始めるときに使う）
export function freshSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
