// 問題集の画面の HTML（段階3-3 設計書 4章・6章・7章・8章）。画面の配線は problems-ui.js。
import { esc } from './table-html.js';
import { pointName, beforeLines } from './review-html.js';
import { GRADE_NAME } from '../coach/grade.js';

const fmt = (n) => Math.round(n).toLocaleString('ja-JP');

// 傾向が起きうる場面の呼び方（「最善が降りの場面 12回のうち 5回」）
const CHANCE_NAME = {
  push: '最善が降りの場面',
  fold: '最善が押しの場面',
  callMore: '鳴かないのが最善の場面',
  callLess: '鳴くのが最善の場面',
  riichiMore: 'ダマが最善の場面',
  damaMore: 'リーチが最善の場面',
};

// 推移の折れ線（判断の正答率・理由の正答率。points：[{ rate, reasonRate }]（0〜1。理由がなければ null）。2半荘から）
export function trendSVG(points) {
  if (points.length < 2) return '<p class="sub">まだ半荘が少ないので、推移は出ません（2半荘から）</p>';
  const W = 260;
  const H = 80;
  const x = (i) => ((i / (points.length - 1)) * (W - 10) + 5).toFixed(1);
  const y = (r) => (H - 5 - r * (H - 10)).toFixed(1);
  const line = (key) => points.map((p, i) => (p[key] === null || p[key] === undefined ? null : `${x(i)},${y(p[key])}`)).filter(Boolean).join(' ');
  return `<svg class="ptrend" viewBox="0 0 ${W} ${H}" role="img" aria-label="判断の正答率と理由の正答率の推移">`
    + `<line x1="5" y1="${y(0.5)}" x2="${W - 5}" y2="${y(0.5)}" class="mid"/>`
    + `<polyline class="rate" points="${line('rate')}"/><polyline class="reason" points="${line('reasonRate')}"/></svg>`
    + '<p class="legend"><span class="rate">判断の正答率</span>　<span class="reason">理由の正答率</span>（直近20半荘）</p>';
}

// 問題集の画面。today：今日の問題の数。kinds：[{ group, name, open, mastered }]。tendencies：上位の傾向（tendency.js の形）。
// trend：{ points, byType: [{ name, n, ok }] }。enough：傾向を出せるだけ判断があるか
export function problemsHomeHTML({ today, kinds, tendencies, trend, enough }) {
  const todayHTML = today
    ? `<button class="btn primary" data-pb="today">今日の問題（${today}問）</button>`
    : '<p class="sub">今日の問題はありません</p>';
  const kindsHTML = kinds.map((k) => `<button class="pkind" data-pb="kind" data-g="${k.group}"${(k.total ?? k.open + k.mastered) ? '' : ' disabled'}><b>${esc(k.name)}</b><small>まだ正解していない ${k.open}・身についた ${k.mastered}</small></button>`).join('');
  const tendHTML = !enough
    ? '<p class="sub">指南を「ヒント」か「なし」にして打つと、あなたの傾向が出ます</p>'
    : tendencies.length
      ? tendencies.slice(0, 3).map((t) => `<div class="ptend"><b>${esc(t.name)}</b><small>${esc(CHANCE_NAME[t.id] || '何切るの場面')} ${t.chances}回のうち ${t.misses}回・約−${fmt(t.loss)}点</small><p>目安：${esc(t.tip)}</p><button class="mini" data-pb="tendency" data-t="${t.id}">この傾向の問題を解く</button></div>`).join('')
      : '<p class="sub">今のところ、目立つ間違いの傾向はありません</p>';
  const typeHTML = trend.byType.length
    ? `<ul class="ptype">${trend.byType.map((t) => `<li><span>${esc(t.name)}</span><b>${t.ok}/${t.n}</b></li>`).join('')}</ul>`
    : '';
  // 横の画面（画面の作り直し 段2）：左に今日の問題と種類、右に傾向と推移
  return `<div class="problems">
  <div class="pb-left">
  <h2>問題集</h2>
  <div class="ptoday">${todayHTML}</div>
  <h3>種類ごと</h3><div class="pkinds">${kindsHTML}</div>
  <button class="btn" data-pb="close">閉じる</button>
  </div>
  <div class="pb-right">
  <h3>あなたの傾向</h3>${tendHTML}
  <h3>成績の推移</h3>${trendSVG(trend.points)}${typeHTML}
  </div>
</div>`;
}

// 問題を解く画面の下の段。next：採点の後のボタンの文（なければ出さない）
export function problemBarHTML({ index, count, title, next = null }) {
  const nextBtn = next ? `<button class="rv-next" data-pb="next">${esc(next)}</button>` : '';
  return `<span class="rv-pos"><span class="rv-step">問題集 ${index + 1}/${count}</span><span class="rv-where">${esc(title)}</span></span>${nextBtn}<button data-pb="quit">やめる</button>`;
}

// 前回の答え：前に解いていれば「前回：選んだ手・判定」（選んだ手のない前の記録は「前回：正解／間違い」）、なければ対局での答え
export function prevLineOf(problem) {
  const last = problem.tries.length ? problem.tries[problem.tries.length - 1] : null;
  // 段階3-7：リーチの人がいない押し引き（quiet）の問題は何切るの呼び方（問い直しは何切るの見た目）
  const quiet = !!(problem.entry && problem.entry.quiet);
  if (last) return last.chosen ? `前回：${pointName({ kind: problem.kind, chosen: last.chosen, quiet })}・${GRADE_NAME[last.grade] || ''}` : `前回：${last.ok ? '正解' : '間違い'}`;
  return `対局では ${pointName(problem.entry)}・${GRADE_NAME[problem.entry.grade] || ''}`;
}

// 問いの帯：見出し・この時どうする・前回（対局での答えか、前に解いた結果）
export function problemAskHTML({ title, prev = null }) {
  return `<div class="coach"><div><span class="ctag pb">問題</span>${esc(title)}</div><div>この時どうする？${prev ? `（${esc(prev)}）` : ''}</div></div>`;
}

// 答え合わせの帯：判定の1行（傾向の札・正解なら印）・前の答えの答え合わせ（最善と比べた数字・決め手・場面の目安）・表。
// スマホで手牌の欄に隠れないよう4行まで（傾向の目安は結果の画面に出す）。tendency：{ name } か null
export function problemVerdictHTML({ mine, before, ok, tendency = null }) {
  // 「〜の問題」：元の対局の間違いの傾向（今の答えの判定ではない）
  const tag = tendency ? `<span class="ctag ptag">${esc(tendency.name)}の問題</span>` : '';
  const mark = ok ? '<span class="creason ok">正解</span>' : '';
  const rest = beforeLines(before).map((l) => `<div>${esc(l)}</div>`).join('');
  return `<div class="coach answer"><div>${tag}<span class="cgrade ${mine.grade}">${esc(mine.tag)}</span>${mark}${esc(mine.line)}</div>${rest}<button class="chint" data-coach="hint">表</button></div>`;
}

// 結果：何問中何問正解と、傾向ごとの数と直す目安（指南）
export function problemResultHTML({ total, correct, byTendency }) {
  const rows = byTendency.map((t) => `<li>${esc(t.name)}の問題 ${t.n}問中${t.ok}問正解${t.tip ? `<small>目安：${esc(t.tip)}</small>` : ''}</li>`).join('');
  return `<div class="panel result pb-result"><h2>問題集の結果</h2><p class="rv-big">${total}問中${correct}問正解</p>${rows ? `<ul class="pbt">${rows}</ul>` : ''}<button class="btn primary" data-pb="home">問題集に戻る</button></div>`;
}
