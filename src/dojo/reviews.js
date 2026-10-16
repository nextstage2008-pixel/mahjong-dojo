// 今日の復習の日取り（段階4 設計書 5章。ホールデム道場の reviews.js と同じ決まりを、日の番号で数える）。
// 間違えた日の1日後 → 3日後 → 7日後。次の回は「答えた日から」数える（1日後の回に正解したら2日後、3日後の回に正解したら4日後）。
// 7日後の回に正解したら外す。復習で間違えたら、その日から1日後の回に戻す。
export const OFFSETS = [1, 3, 7]; // 間違えた日から数えた日
const GAPS = [1, 2, 4]; // 前の回から次の回までの間隔

const same = (a, b) => a.type === b.type && a.seed === b.seed;

// 間違えた問題を入れる（同じ問題がもう入っていれば、1日後の回からやり直す）
export function addMistake(reviews, q, day) {
  const rest = reviews.filter((v) => !same(v, q));
  return [...rest, { type: q.type, seed: q.seed, step: 0, due: day + GAPS[0] }];
}

// 復習で答えた結果を反映する
export function answerReview(reviews, q, correct, day) {
  const cur = reviews.find((v) => same(v, q));
  if (!cur) throw new Error('復習に入っていない問題');
  const rest = reviews.filter((v) => !same(v, q));
  if (!correct) return [...rest, { type: q.type, seed: q.seed, step: 0, due: day + GAPS[0] }];
  if (cur.step === OFFSETS.length - 1) return rest;
  const step = cur.step + 1;
  return [...rest, { type: q.type, seed: q.seed, step, due: day + GAPS[step] }];
}

// 今日出す問題（出す日が今日以前のもの。古い順）
export const dueToday = (reviews, day) => reviews
  .filter((v) => v.due <= day)
  .sort((a, b) => a.due - b.due || a.seed - b.seed);
