// 読みの描き直しの判断（段階3-5 最後のレビューの直し）：札（卓に出す読みの HTML）と手牌の印（候補 → 確率）を、
// 前に描いたものと比べて、変わったところだけ描き直す。手牌を描き直すと上へはじいて切る途中の操作が消えるので、
// 試しが終わっただけでは描き直さない。画面には触らない。

// 印の中身を比べるための書き方（並び順によらない）
export function marksKey(marks) {
  if (!marks) return '';
  return Object.keys(marks).sort().map((k) => `${k}:${marks[k]}`).join(',');
}

// prev・next：{ tags, marks }。返すもの：{ felt（卓を描き直す）, hand（手牌を描き直す） }
export function readSyncPlan(prev, next) {
  return { felt: prev.tags !== next.tags, hand: marksKey(prev.marks) !== marksKey(next.marks) };
}
