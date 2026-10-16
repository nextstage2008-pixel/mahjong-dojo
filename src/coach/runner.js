// 試しを裏で動かす（設計書 3章）。ブラウザでは別の作業場所（Web Worker）で動かして画面を止めない。
// Worker が使えない・壊れたとき（Node のテストなど）は、その場で動かす（少し待たせてから）。
import { simulate } from './sim.js';

function defaultWorker() {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

// make：Worker を作る関数（テストでは仮のものを渡す）。
// 返すもの：run(scene, keys, runs, { careful, call }) → 試しの結果の Promise（careful：丁寧な打ち方で試す。
// call：鳴きの場面の試し＝段階2-2）。dispose()：Worker を止める
export function createRunner({ make = defaultWorker } = {}) {
  let worker = null;
  let broken = false;
  let nextId = 1;
  const waiting = new Map();
  const local = (scene, keys, runs, careful, call) => new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(simulate(scene, keys, { runs, careful, call }));
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
  function ensure() {
    if (worker || broken) return worker;
    try {
      worker = make();
    } catch {
      worker = null;
    }
    if (!worker) {
      broken = true;
      return null;
    }
    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const w = waiting.get(id);
      if (!w) return;
      waiting.delete(id);
      if (error) w.reject(new Error(error));
      else w.resolve(result);
    };
    // 作業場所が壊れたら、待っている分はその場で動かし直し、この先もその場で動かす
    worker.onerror = () => {
      broken = true;
      try { worker.terminate(); } catch { /* 止まっている */ }
      worker = null;
      for (const w of waiting.values()) local(w.scene, w.keys, w.runs, w.careful, w.call).then(w.resolve, w.reject);
      waiting.clear();
    };
    return worker;
  }
  return {
    run(scene, keys, runs, { careful = false, call = false } = {}) {
      const w = ensure();
      if (!w) return local(scene, keys, runs, careful, call);
      return new Promise((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject, scene, keys, runs, careful, call });
        w.postMessage({ id, scene, keys, runs, careful, call });
      });
    },
    dispose() {
      if (worker) worker.terminate();
      worker = null;
      waiting.clear();
    },
  };
}
