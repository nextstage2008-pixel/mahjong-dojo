// 画面を描いた直後の押しと、ダブルクリックの2回目を受けない（ホールデム道場の click-gate.js と同じ。最後のレビューの直し：
// 試験で答えた直後の二度押しが、次の問題を見ないまま答えにならないように）
export function createClickGate(ms = 300) {
  let armedAt = -Infinity;
  return {
    arm(now) { armedAt = now; },
    accept(now, detail = 1) { return detail <= 1 && now - armedAt >= ms; },
  };
}
