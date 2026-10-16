// 感想戦の1つの場面の問い直しの段階（段階3-1）：'ask'（問い直し）→ 'reason'（理由を聞く）→ 'grading'（採点中）→ 'done'（答え合わせ）。
// 画面には触らない。採点が始まったら牌もボタンも理由も受け付けない（二重に採点すると、使い終えた場面の答えが空になり
// 「損なし・気づけた」に書き換わるため）。理由を聞いている間に別の牌を押したら、問い直しに戻す（対局中と同じ）
export function createReviewFlow() {
  let phase = 'ask';
  let selected = null;
  return {
    get phase() { return phase; },
    get selected() { return selected; },
    // 手牌を押した。index：牌の位置（-1 はツモ牌）
    tapTile(index) {
      if (phase === 'grading' || phase === 'done') return { action: 'ignore' };
      if (phase === 'reason') {
        if (index === selected) return { action: 'ignore' };
        phase = 'ask';
        selected = index;
        return { action: 'cancelReason', index };
      }
      if (selected !== index) {
        selected = index;
        return { action: 'select', index };
      }
      phase = 'reason';
      return { action: 'choose', index };
    },
    // 鳴き・鳴かないのボタンを押した（1回で選ぶ）
    pressButton() {
      if (phase !== 'ask') return { action: 'ignore' };
      phase = 'reason';
      return { action: 'choose' };
    },
    // 理由を選んだ
    pickReason(reason) {
      if (phase !== 'reason') return { action: 'ignore' };
      phase = 'grading';
      return { action: 'grade', reason };
    },
    // 採点が終わった
    graded() {
      phase = 'done';
    },
  };
}
