// 4人の返事を順に記録する。続きから打つときは、記録した返事を同じ順に返して元の場面まで進める。
// 部品の Game は牌山と返事が同じなら同じ進み方をするので、返事を記録しておけば対局を再現できる。
// Game が4人に同じ知らせを送り、全員の返事がそろうまでを「1回」と呼ぶ。人ごとの記録は1回ごとに1つずつ増える。

export function createRecorder(saved = null) {
  // 記録は全員そろった回数までに切りそろえる（途中で閉じた回は、もう一度その回から打つ）
  const replayLength = saved ? Math.min(...saved.map((a) => a.length)) : 0;
  const log = [0, 1, 2, 3].map((id) => (saved ? saved[id].slice(0, replayLength) : []));
  const cursor = [0, 0, 0, 0];
  let live = replayLength === 0;

  const recorder = {
    log,
    // 記録を再生している間は true（画面は動きを付けずに、追いついたら描き直す）
    get replaying() { return !live; },
    onLive: null, // 記録に追いついた瞬間に一度だけ呼ぶ
    onReply: null, // 新しい返事を記録するたびに呼ぶ（保存に使う）

    // Player の action をくるみ、記録の再生と新しい返事の記録をする
    wrap(id, player) {
      const original = player.action.bind(player);
      player.action = (msg, callback) => {
        if (!callback) return original(msg); // 返事のいらない知らせ（新ドラなど）
        const i = cursor[id]++;
        if (i < replayLength) {
          original(msg, null); // 盤面だけ進め、選ぶのは記録に任せる
          callback(log[id][i]);
          return;
        }
        if (!live) {
          live = true;
          if (recorder.onLive) recorder.onLive();
        }
        original(msg, (reply) => {
          log[id][i] = reply || {};
          if (recorder.onReply) recorder.onReply(id);
          callback(reply);
        });
      };
      return player;
    },

    // 全員そろった回数
    completeRounds() {
      return Math.min(...log.map((a) => a.length));
    },

    // 保存用：全員そろった回までの記録の写し
    snapshot() {
      const n = recorder.completeRounds();
      return log.map((a) => a.slice(0, n));
    },
  };
  return recorder;
}
