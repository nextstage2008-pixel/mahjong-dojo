// 第9章「順位を考える」の問題（段階4-2 作業2）：オーラスに逆転に要る上がり・終わったときの得点（ウマ・オカ込み）。
// 4人は起家から順に並べる（番号0が起家）。オーラス（南4局）の親は番号3。同点は起家に近い人が上（core/final.js の rankOrder と同じ）。
// 点数の決まりは標準ルール（ウマ10-20・30,000点返し・供託はトップ）
import { retry, withChoices, pick, fmtNum } from './util.js';
import { rankOrder, finalPoints } from '../../core/final.js';
import { STANDARD_RULE } from '../../core/rule.js';

// 子のロンの点（30符の1翻・2翻・3翻・4翻、満貫・跳満・倍満。最後のレビューの直し：30符4翻の 7,700点を足した）
export const RON_TIERS = [1000, 2000, 3900, 7700, 8000, 12000, 16000];
const NAMES = ['Aさん', 'Bさん', 'Cさん'];
// 席の順（起家から）。オーラス（南4局）の親は番号3。東家・南家などの言葉は講義で説明していないので使わない（最後のレビューの直し）
const SEATS = ['起家', '起家の次', '3番目', '4番目・親'];
const UMA = STANDARD_RULE['順位点'];
const text = (t) => ({ text: t, tiles: null });
const sameText = (a, b) => a.text === b.text;

// 番号ごとの呼び名（あなた・Aさん…）
function namesOf(you) {
  let k = 0;
  return [0, 1, 2, 3].map((i) => (i === you ? 'あなた' : NAMES[k++]));
}

// 100点刻みの点数を4つ（合計 total・どれも 1,000点以上・同じ点はない）。作れなければ null
function scoresOf(rng, total) {
  const n = total / 100;
  const cuts = [0, 1, 2].map(() => Math.floor(rng() * (n - 1)) + 1).sort((a, b) => a - b);
  const s = [cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1], n - cuts[2]].map((x) => x * 100);
  return s.every((v) => v >= 1000) && new Set(s).size === 4 ? s : null;
}

const tableOf = (names, scores, extra) => ({
  kind: 'table',
  head: ['', '席の順', '点数'],
  rows: [...names.map((n, i) => [n, SEATS[i], `${fmtNum(scores[i])}点`]), extra],
});

// 逆転に要る、いちばん安い上がりは？（子のロン。トップでない人からか、トップから直撃）
export function comeback(rng) {
  return retry(rng, () => {
    const you = Math.floor(rng() * 3);
    const honba = Math.floor(rng() * 4);
    const kyotaku = Math.floor(rng() * 3);
    const scores = scoresOf(rng, 100000 - kyotaku * 1000);
    if (!scores) return null;
    const top = rankOrder(scores, 0)[0];
    if (top === you) return null;
    const direct = rng() < 0.5;
    const others = [0, 1, 2, 3].filter((i) => i !== you && i !== top);
    const payer = direct ? top : pick(rng, others);
    const after = (p) => {
      const s = scores.slice();
      s[you] += p + 300 * honba + 1000 * kyotaku;
      s[payer] -= p + 300 * honba;
      return s;
    };
    const k = RON_TIERS.findIndex((p) => rankOrder(after(p), 0)[0] === you);
    if (k < 0) return null;
    // 選択肢は正解を含む続いた4つ
    const from = Math.max(0, Math.min(RON_TIERS.length - 4, k - Math.floor(rng() * 4)));
    const shown = RON_TIERS.slice(from, from + 4).map((x) => text(`${fmtNum(x)}点`));
    const names = namesOf(you);
    const p = RON_TIERS[k];
    const s = after(p);
    const how = direct ? `トップの${names[top]}から直撃（ロン）` : `${names[payer]}からロン`;
    const explain = [`トップの${names[top]}との差は ${fmtNum(scores[top] - scores[you])}点。`];
    const plus = [honba && `本場${honba}本で +${fmtNum(300 * honba)}点`, kyotaku && `供託${kyotaku}本で +${fmtNum(1000 * kyotaku)}点`].filter(Boolean);
    if (plus.length) explain.push(`上がると、${plus.join('、')}が付きます。`);
    if (direct) explain.push('直撃なら、トップの点も同じだけ減るので、差は2倍の速さで縮みます。');
    // 上がったあと2番目になる人（逆転の相手）と、1つ安い上がりで上に残る人を名指しする
    const second = rankOrder(s, 0)[1];
    explain.push(`${fmtNum(p)}点なら、あなた ${fmtNum(s[you])}点で、2番目の${names[second]}（${fmtNum(s[second])}点）より上になり逆転です。`);
    if (s[second] === s[you]) explain.push('同点のときは、起家に近い人が上になります（あなたのほうが起家に近い）。');
    if (k > 0) {
      const q = after(RON_TIERS[k - 1]);
      const above = rankOrder(q, 0)[0];
      explain.push(`${fmtNum(RON_TIERS[k - 1])}点では、あなた ${fmtNum(q[you])}点で、${names[above]}（${fmtNum(q[above])}点）${q[above] === q[you] ? 'と同点ですが起家に近いほうが上なので' : 'に'}届きません。`);
    }
    return {
      prompt: `オーラス（南4局）。あなたは子です。${how}で逆転するのに要る、いちばん安い上がりは？`,
      figure: tableOf(names, scores, ['', '本場・供託', `${honba}本場・供託${kyotaku}本`]),
      ...withChoices(rng, text(`${fmtNum(p)}点`), [], { fixed: shown, same: sameText }),
      explain,
      data: { scores, you, top, payer, direct, honba, kyotaku },
    };
  });
}

// 得点の言い方（+51.0・-20.0・0.0）
const signed = (s) => `${+s > 0 ? '+' : ''}${s}`;

// この点数で終わったら、あなたの得点（ウマ・オカ込み）は？
export function finalScore(rng) {
  return retry(rng, () => {
    const you = Math.floor(rng() * 4);
    const kyotaku = rng() < 0.3 ? 1 : 0;
    const scores = scoresOf(rng, 100000 - kyotaku * 1000);
    if (!scores) return null;
    const calc = (o) => finalPoints({ defen: scores, qijia: 0, lizhibang: kyotaku, uma: UMA, okaReturn: 30000, ...o }).point[you];
    const right = calc({});
    const r = finalPoints({ defen: scores, qijia: 0, lizhibang: kyotaku, uma: UMA, okaReturn: 30000 });
    const rank = r.rank[you];
    // 間違いの選択肢：オカを忘れた（25,000点返し）・ウマを忘れた・供託を忘れた・素点だけ・符号を逆に
    const raw = ((scores[you] - 30000) / 1000).toFixed(1);
    const wrongs = [calc({ okaReturn: 25000 }), calc({ uma: ['0.0', '0.0', '0.0', '0.0'] }), calc({ lizhibang: 0 }), raw, (-+right).toFixed(1)]
      .map((x) => text(signed(x)));
    if (new Set(wrongs.map((w) => w.text).filter((t) => t !== signed(right))).size < 3) return null;
    const choice = withChoices(rng, text(signed(right)), wrongs, { same: sameText });
    const names = namesOf(you);
    const umaOf = +UMA[rank - 1];
    const explain = [`あなたは${rank}位（${fmtNum(r.defen[you])}点）。`];
    if (rank === 1) {
      explain.push('トップの得点は、ほかの3人の得点の合計を0から引いた数です（30,000点返しの差のぶん、オカ+20 がトップに入ります）。');
      if (kyotaku) explain.push('残った供託1本（1,000点）はトップのものになります。');
    } else {
      explain.push(`(${fmtNum(scores[you])} − 30,000) ÷ 1,000 ＝ ${raw}、ウマ ${signed(umaOf.toFixed(1))} で ${signed(right)}。`);
    }
    return {
      prompt: `この点数で半荘が終わりました${kyotaku ? '（供託1本が残っています）' : ''}。あなたの得点（ウマ・オカ込み）は？ ウマ10-20・30,000点返しで数えます。`,
      figure: tableOf(names, scores, ['', '供託', `${kyotaku}本`]),
      ...choice,
      explain,
      data: { scores, you, kyotaku },
    };
  });
}
