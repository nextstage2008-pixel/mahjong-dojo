// 感想戦の画面の HTML（段階3-1 設計書 5章・6章）。画面には触らない。
// 卓・手牌は対局と同じ部品（table-html.js）で描き、ここでは感想戦の下の段・帯の文・まとめを作る。
import { esc } from './table-html.js';
import { roundName } from './view-model.js';
import { actionName } from '../coach/explain.js';
import { GRADE_NAME, REASON_NAME } from '../coach/grade.js';

const fmt = (v) => Math.round(v).toLocaleString('ja-JP');
const signed = (v) => (v < 0 ? '−' + fmt(-v) : '+' + fmt(v));
// 0 は「±0」
const pm = (v) => (Math.round(v) === 0 ? '±0' : signed(v));
// 記録の種類 → 候補の呼び方の種類
const SPOT_OF = { choice: 'choice', off: 'choice', riichi: 'riichi', pushfold: 'pushfold', pfoff: 'pushfold', call: 'call', calloff: 'call' };

// 感想戦の下の段（対局の画面の下のボタンの代わり）：何問目か・局と巡目・閉じる。next：答え合わせの後の「次へ」の文
// （帯に置くと、答え合わせの4行の下で手牌の欄にもぐって押せないため、下の段に出す）
// retry：答え合わせの後の「打ち直す」（段階3-2）
export function reviewBarHTML({ index, count, where, next = null, retry = false }) {
  const nextBtn = next ? `<button class="rv-next" data-rv="next">${esc(next)}</button>` : '';
  const retryBtn = retry ? '<button class="rv-retry" data-rv="retry">打ち直す</button>' : '';
  return `<span class="rv-pos"><span class="rv-step">感想戦 ${index + 1}/${count}</span><span class="rv-where">${roundName(where.zhuangfeng, where.jushu)} ${where.turn}巡目</span></span>${retryBtn}${nextBtn}<button data-rv="close">閉じる</button>`;
}

// 打ち直しの結果の札（段階3-2 設計書 6章）：mine 打ち直しの増減・before 前（本番）の増減・model 同じ山のお手本の増減（出せなければ null）
export function practiceResultHTML({ mine, before, model }) {
  const cmp = model === null || model === undefined ? `（前は ${pm(before)}点）` : `（前は ${pm(before)}点・お手本は ${pm(model)}点）`;
  return `<div class="panel result rv-practice"><h2>打ち直し</h2><p class="rv-big">打ち直し <b>${pm(mine)}点</b></p><p>${cmp}</p><button class="btn primary" data-rv="back">感想戦に戻る</button></div>`;
}

// 前の答えの呼び方（「9萬切り」「押し（9萬切り）」「鳴かない」「ポン（白）」）
// 段階3-7（先生の B）：リーチの人がいない押し引き（quiet）は何切るの呼び方（「押し（南切り）」と言わない）
export function pointName(point) {
  return actionName({ spot: point.quiet ? 'choice' : SPOT_OF[point.kind] || 'choice', groups: [] }, point.chosen);
}

// 問い直しの理由のボタンの型：押し引き（pushfold・pfoff）で quiet でないときだけ押し引きの型（段階3-7）
export function reasonKindOf(entry) {
  return (entry.kind === 'pushfold' || entry.kind === 'pfoff') && !entry.quiet ? 'pushfold' : 'discard';
}

// 選び直しの呼び方：最善なら答え合わせの1行（降りる牌を選べば「降り（南切り）」になる）、ほかは選んだ牌の呼び方
export function mineLine(point, answer) {
  return answer && answer.grade === 'best' ? answer.lines[0] : pointName(point);
}

// 問い直しの帯：もう一度考えてもらう。前の答え・判定・損を添える
export function askBandHTML(point) {
  return `<div class="coach"><div><span class="ctag rv">感想戦</span>もう一度考えてみてください</div><div>前は ${esc(pointName(point))}・${GRADE_NAME[point.grade]} 約−${fmt(point.loss)}点</div></div>`;
}

// 答え合わせの帯：選び直しの判定の1行（気づけたら印）と、前の答えの答え合わせ（最善と比べた数字・どの問いで差がついたか・目安）。
// mine：{ grade, tag, line }。before：前の答えの答え合わせ（session の finish の結果）
// 前の答えは3行まで（スマホで手牌の欄に隠れないよう帯は4行まで）。押し引きの4行（段階3-7 で当たる見込みの1行が増えた）は
// 最後の目安を省く（表で見られる）
export const beforeLines = (before) => (before ? before.lines.slice(0, 3) : []);

export function verdictBandHTML({ mine, before, noticed }) {
  const mark = noticed ? '<span class="creason ok">気づけた</span>' : '';
  const rest = beforeLines(before).map((l) => `<div>${esc(l)}</div>`).join('');
  return `<div class="coach answer"><div><span class="cgrade ${mine.grade}">${esc(mine.tag)}</span>${mark}${esc(mine.line)}</div>${rest}<button class="chint" data-coach="hint">表</button></div>`;
}

// 感想戦の最初の案内（設計書 7章）：前回の課題の結果と、これから問い直す分かれ目の数
export function reviewIntroHTML({ prev, count }) {
  const go = count ? `この半荘の分かれ目${count}つを、その瞬間の卓でもう一度考えます` : 'この半荘は分かれ目がありませんでした';
  return `<div class="panel result rv-intro"><h2>感想戦</h2><p class="rv-prev">前回の課題 ${REASON_NAME[prev.reason]}：場面${prev.scenes}回・正解${prev.correct}回</p><p>${go}</p><button class="btn primary" data-rv="start">${count ? '始める' : 'まとめへ'}</button><button class="btn" data-rv="close">閉じる</button></div>`;
}

// まとめ（設計書 6章）：判断で失った分・気づけた数・点数の増減・今日の課題（目安つき）・前回の課題の結果。
// loss：lossTotal の結果。delta：この半荘の点数の増減。task：chooseTask の結果か null。prev：{ reason, scenes, correct } か null。
// split：運と判断（段階3-2。{ luck, judgment }。出せなければ null で「判断で失った分（約）」）
export function reviewSummaryHTML({ loss, noticed, total, delta, task, prev, split = null }) {
  const rows = [];
  if (prev) rows.push(`<p class="rv-prev">前回の課題 ${REASON_NAME[prev.reason]}：場面${prev.scenes}回・正解${prev.correct}回</p>`);
  const counts = `<small>（悪手${loss.bad}回・疑問手${loss.dubious}回）</small>`;
  const judge = split
    ? `<li>運（お手本が同じ山で打った分）<b>${pm(split.luck)}点</b></li><li>判断（お手本との差）<b>${pm(split.judgment)}点</b>${counts}</li>`
    : `<li>判断で失った分<b>約−${fmt(loss.loss)}点</b>${counts}</li>`;
  rows.push(`<ul class="rv-sum"><li>この半荘の点数<b>${signed(delta)}点</b></li>`
    + judge
    + (total ? `<li>気づけた<b>${noticed}/${total}</b></li>` : '')
    + '</ul>');
  if (!total) rows.push('<p class="rv-none">この半荘は分かれ目がありませんでした</p>');
  if (task) rows.push(`<div class="rv-task"><h3>今日の課題</h3><p><b>${REASON_NAME[task.reason]}</b>　${esc(task.tip)}</p><p class="sub">次の半荘で、この問いが決め手になる場面が来たら帯に「課題」と出します</p></div>`);
  return `<div class="panel result rv-summary"><h2>感想戦のまとめ</h2>${rows.join('')}<button class="btn primary" data-rv="close">閉じる</button></div>`;
}
