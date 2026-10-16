// 対局の終わりの順位と得点（段階4-2 作業2。match.js の終局から取り出した。道場の第9章の問題も同じ計算を使う）。
// 部品（電脳麻将 majiang-core の Game.jieju）の計算を写し、返しの点だけ選べるようにしたもの。

// 順位：点の高い順。同点は起家から数えて近い人が上。defen：人ごとの点（番号は人の番号）。qijia：起家の人の番号
export function rankOrder(defen, qijia) {
  const paiming = [];
  for (let i = 0; i < 4; i++) {
    const id = (qijia + i) % 4;
    for (let j = 0; j < 4; j++) {
      if (j === paiming.length || defen[id] > defen[paiming[j]]) {
        paiming.splice(j, 0, id);
        break;
      }
    }
  }
  return paiming;
}

// 得点：供託はトップに。ポイントは (点数 − 返し) ÷ 1,000 ＋ ウマ、トップは残り（オカはトップに入る）。
// uma：部品の「順位点」（1位から4位の文字列。小数がなければ丸める）。okaReturn：返しの点。
// 返す値：{ defen（供託を足した点）, rank（人ごとの順位 1〜4）, point（人ごとの得点の文字列）}
export function finalPoints({ defen, qijia, lizhibang, uma, okaReturn }) {
  const d = defen.slice();
  const paiming = rankOrder(d, qijia);
  d[paiming[0]] += lizhibang * 1000;
  const rank = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) rank[paiming[i]] = i + 1;
  const round = !uma.find((p) => p.match(/\.\d$/));
  const point = [0, 0, 0, 0];
  for (let i = 1; i < 4; i++) {
    const id = paiming[i];
    point[id] = (d[id] - okaReturn) / 1000 + +uma[i];
    if (round) point[id] = Math.round(point[id]);
    point[paiming[0]] -= point[id];
  }
  return { defen: d, rank, point: point.map((p) => p.toFixed(round ? 0 : 1)) };
}
