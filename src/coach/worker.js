// 試しを動かす別の作業場所（Web Worker）。runner.js から場面と候補を受け取り、試しの結果を返す。
import { simulate } from './sim.js';

// 1つの頼みを処理する（Node のテストからも呼べるように分けておく）
export function handle(data) {
  try {
    return { id: data.id, result: simulate(data.scene, data.keys, { runs: data.runs, careful: !!data.careful, call: !!data.call }) };
  } catch (e) {
    return { id: data.id, error: String((e && e.message) || e) };
  }
}

// Web Worker として読み込まれたときだけ、知らせを受け付ける
if (typeof self !== 'undefined' && typeof window === 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e) => self.postMessage(handle(e.data));
}
