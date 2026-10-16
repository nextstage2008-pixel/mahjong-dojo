// 同じ山のお手本（段階3-2 設計書 3章・5章）：対局の記録（4人分の返事）を再生して局の一覧を作り、局の始めから自分の席だけ
// お手本の CPU に替えて同じ山で打たせ、その局の点数の増減を出す。再生も打たせるのも同期で一気に行う。画面には触らない。
import { DojoGame } from './match.js';
import { CpuPlayer } from './cpu-player.js';
import { createRecorder } from './recorder.js';
import { normalizeRules, buildRule, matchOptionsOf } from './rule.js';
import { styleOf } from './cast.js';

const STOP = Symbol('stop');

// 局の点数の増減：局の終わりの知らせ（上がり・流局）を受けた時点の点数に、その局の分配を足し、配牌のときの点数を引く。
// board：自分の盤面。l0：自分の席。msg：上がりか流局の知らせ。startDefen：配牌のときの点数。
// リーチ棒は盤面が次のツモか流局のときに引くので、流局の知らせで引かれる分（流局の直前のリーチ）もここで引く
export function handDelta(board, l0, msg, startDefen) {
  const end = msg.hule || msg.pingju;
  let defen = board.defen[0];
  if (msg.pingju && !/^三家和/.test(msg.pingju.name) && board._lizhi && board.player_id[board.lunban] === 0) defen -= 1000;
  return defen + end.fenpei[l0] - startDefen;
}

// 自分の席（id 0）が配牌で座る席
const seatOf = (board, jushu) => (((0 - board.qijia - jushu) % 4) + 4) % 4;

// 記録を再生する。swapAt：その位置（自分への何番目の知らせ）からは自分の席をお手本の CPU が打つ（null なら記録の終わりで止める）。
// onMessage(i, msg, board)：自分への返事の要る知らせのたびに、盤面が知らせを受ける前に呼ぶ（STOP を投げれば止まる）
function replay(record, swapAt, onMessage) {
  const rules = normalizeRules(record.rules);
  const length = Math.min(...record.log.map((a) => a.length));
  const cut = swapAt === null ? length : Math.min(swapAt, length);
  const recorder = createRecorder(record.log.map((a) => a.slice(0, cut)));
  // お手本は人らしさなし（指南の答えと同じ物差し。段階3-4 設計書 8章）。相手は卓と同じく人らしい
  const me = recorder.wrap(0, new CpuPlayer('model', { human: false }));
  const others = [1, 2, 3].map((id) => recorder.wrap(id, new CpuPlayer(styleOf(record.cast[id - 1]))));
  const inner = me.action;
  let count = 0;
  me.action = (msg, callback) => {
    if (!callback) return inner(msg, callback);
    const i = count++;
    // 記録の終わり（打っている途中の記録）から先は打たない
    if (swapAt === null && i >= length) throw STOP;
    onMessage(i, msg, me._model);
    return inner(msg, callback);
  };
  const game = new DojoGame([me, ...others], () => {}, buildRule(rules), record.seed, matchOptionsOf(rules));
  try {
    game.do_sync();
  } catch (e) {
    if (e !== STOP) throw e;
  }
}

// 局の一覧：[{ start, zhuangfeng, jushu, changbang, startDefen（局の始めの点数）, delta }]。終わっていない局は入れない
export function scanHands(record) {
  const hands = [];
  let cur = null;
  replay(record, null, (i, msg, board) => {
    if (msg.qipai) {
      const q = msg.qipai;
      const l0 = seatOf(board, q.jushu);
      cur = { start: i, zhuangfeng: q.zhuangfeng, jushu: q.jushu, changbang: q.changbang, l0, startDefen: q.defen[l0] };
    } else if ((msg.hule || msg.pingju) && cur) {
      hands.push({ start: cur.start, zhuangfeng: cur.zhuangfeng, jushu: cur.jushu, changbang: cur.changbang, startDefen: cur.startDefen, delta: handDelta(board, cur.l0, msg, cur.startDefen) });
      cur = null;
    }
  });
  return hands;
}

// お手本の結果：記録を start（配牌の知らせの位置）まで再生し、そこから自分の席をお手本の CPU が打って、その局の増減を返す
export function modelHand(record, start) {
  let cur = null;
  let delta = null;
  replay(record, start, (i, msg, board) => {
    if (i < start) return;
    if (msg.qipai && !cur) {
      const l0 = seatOf(board, msg.qipai.jushu);
      cur = { l0, startDefen: msg.qipai.defen[l0] };
    } else if ((msg.hule || msg.pingju) && cur) {
      delta = handDelta(board, cur.l0, msg, cur.startDefen);
      throw STOP;
    }
  });
  if (delta === null) throw new Error(`位置 ${start} の局を打ち終えられなかった`);
  return delta;
}

// 運と判断（設計書 5章）：判断＝Σ（あなたの増減 − お手本の増減）、運＝半荘の点数の増減 − 判断
export function luckSplit(total, hands, models) {
  const judgment = hands.reduce((a, h, i) => a + h.delta - models[i], 0);
  return { luck: total - judgment, judgment };
}

// 前の半荘の記録から運と判断を出す（感想戦のまとめ）。total：半荘の点数の増減。局の一覧やお手本の結果を出せなければ null
export function splitOf(record, total) {
  try {
    const hands = scanHands(record);
    if (!hands.length) return null;
    return luckSplit(total, hands, hands.map((h) => modelHand(record, h.start)));
  } catch {
    return null;
  }
}
