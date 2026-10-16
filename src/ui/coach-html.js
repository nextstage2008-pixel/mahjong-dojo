// 指南の帯・理由のボタン・答え合わせ・ヒントの表・指南の量のボタン・半荘の判断のまとめの HTML（設計書 5章）。
// 画面には触らない。中身の文は coach/explain.js が数字から作ったもの。
import { esc } from './table-html.js';
import { roundName } from './view-model.js';
import { LEVEL_NAME } from '../coach/session.js';
import { REASON_NAME } from '../coach/grade.js';

// 理由のボタンに添える短い説明（先生の指摘「①速さ・④安全などの意味が分かりづらい」で足した）
export const REASON_HELP = {
  speed: '早く聴牌できる', shape: '待ちが良くなる', value: '点が高くなる', safety: '振り込みにくい',
  // 押し引きの型（段階2-2 設計書 3.3）
  hand: '手の強さ', threat: 'リーチの強さ', danger: '当たりやすさ', compare: '損得の計算',
};

const TAG = '<span class="ctag">考えどころ</span>';
// 押し引きと鳴きの札（段階2-2 設計書 5.1）
const TAGS = { pushfold: '<span class="ctag pf">押し引き</span>', call: '<span class="ctag call">鳴き</span>' };
const tagOf = (spot) => TAGS[spot] || TAG;
// 符号つきの点数（「−1,000」）
const signed = (v) => (v < 0 ? '−' + fmt(-v) : fmt(v));
const pct = (v) => `${Math.round(v * 100)}%`;
const fmt = (v) => Math.round(v).toLocaleString('ja-JP');
const hintButton = () => '<button class="chint" data-coach="hint">ヒント</button>';

// 読み（段階3-5 設計書 6.1・6.4）。ヒントの段で読みを出せる番の「読み」のボタン
export function readButtonHTML({ solo = false } = {}) {
  return `<button class="cread${solo ? ' solo' : ''}" data-coach="read">読み</button>`;
}
// 自分の手の行の言葉：「聴牌 55%・上がり 30%・断幺九 平和・平均 3,900点」（ないものは省く）
function ownText(own) {
  if (!own) return '';
  const parts = [];
  if (own.tenpai !== null && own.tenpai !== undefined) parts.push(`聴牌 ${pct(own.tenpai)}`);
  if (own.win !== null && own.win !== undefined) parts.push(`上がり ${pct(own.win)}`);
  if (own.yaku && own.yaku.length) parts.push(own.yaku.map((y) => y.name).join(' '));
  if (own.avg) parts.push(`平均 ${fmt(own.avg)}点`);
  return parts.join('・');
}
// 押し引きの帯の短い形（段階3-7：帯が5行に折り返して④が隠れたため。聴牌の割合だけ。上がり・役・平均点はヒントの表で見る）
function ownShort(own) {
  return own && own.tenpai !== null && own.tenpai !== undefined ? `聴牌${pct(own.tenpai)}` : '';
}
// 読みの1行の後ろに足す（全部の段の考えどころの帯の1行目）。short：押し引きの帯は短い形
const ownTail = (view, short = false) => {
  const text = view.read && view.read.own ? (short ? ownShort(view.read.own) : ownText(view.read.own)) : '';
  return text ? `　<span class="rown">${esc(text)}</span>` : '';
};
const readBtn = (view) => (view.readable ? readButtonHTML() : '');
// 考えどころの外の帯（段階3-5）：警戒の番の「読み：聴牌 ○%（○巡で）」と、ヒントの段の「読み」のボタン
function readOnlyHTML(view) {
  if (!view.read && !view.readable) return '';
  let line = '';
  if (view.read) {
    const t = view.read.own ? view.read.own.tenpai : null;
    const text = t === null || t === undefined ? '2向聴以上' : t >= 1 ? `聴牌しています（残り${view.read.draws}巡）` : `聴牌 ${pct(t)}（${view.read.draws}巡で）`;
    line = `<div><span class="ctag rd">読み</span>${esc(text)}</div>`;
  } else line = '<div><span class="ctag rd">読み</span>相手の聴牌に気をつけて</div>';
  return `<div class="coach">${line}${view.readable ? readButtonHTML({ solo: true }) : ''}</div>`;
}

// 切る前の帯。view：session.view()。compact：リーチ・ツモなどのボタンが並ぶときは2行に詰める
export function spotHTML(view, { compact = false } = {}) {
  if (!view) return '';
  if (!view.spot) return readOnlyHTML(view);
  // 課題の場面（段階3-1）は札「課題」を足す
  const tag = tagOf(view.spot) + (view.task ? '<span class="ctag task">課題</span>' : '');
  // 押し引き（段階2-2）：①自分の手／②相手の脅威／③牌の危なさ／④比べる（試しの前は「計算中…」）を1行ずつ。
  // ボタンが並ぶとき（リーチ・ツモ）は①と③の2行に詰める（1行に2つの問いを入れると折り返して読みにくい）
  if (view.spot === 'pushfold' && view.level === 'all' && view.full) {
    const f = view.full;
    const one = (name, text) => `<div><b>${name}</b> ${esc(text)}</div>`;
    // ③は読みの値（警戒している全員。手牌の印と同じ値。段階3-7 で 3-5 の「③リーチの人に」をもどした）
    const lines = compact
      ? [`<div>${tag}<b>①自分の手</b> ${esc(f.hand)}${ownTail(view, true)}</div>`, one('③危なさ', f.danger)]
      : [`<div>${tag}<b>①自分の手</b> ${esc(f.hand)}${ownTail(view, true)}</div>`, one('②相手の脅威', f.threat), one('③危なさ', f.danger), one('④比べる', f.compare || '計算中…')];
    return `<div class="coach">${lines.join('')}${hintButton()}${readBtn(view)}</div>`;
  }
  // 鳴き（段階2-2）：①速さ／③打点・④安全（④はリーチを受けているときだけ）。下に鳴きのボタンが並ぶので、2行から増やさない
  // （行は折り返さず、収まらなければ「…」で切る。3行になるとボタンが手牌の欄にもぐって押せない）
  if (view.spot === 'call' && view.level === 'all' && view.full) {
    const f = view.full;
    const safety = f.threat ? `　<b>④安全</b> ${esc(f.safety)}` : '';
    return `<div class="coach"><div class="one">${tag}<b>①速さ</b> ${esc(f.speed)}</div><div class="one"><b>③打点</b> ${esc(f.value)}${safety}</div>${hintButton()}${readBtn(view)}</div>`;
  }
  if (view.level === 'all' && view.full) {
    const f = view.full;
    const lines = [`<div>${tag}<b>①速さ</b> ${esc(f.speed)}${ownTail(view)}</div>`, `<div><b>②形</b> ${esc(f.shape)}</div>`];
    if (!compact) lines.push(`<div><b>③打点</b> ${esc(f.value)}　<b>④安全</b> ${esc(f.safety)}</div>`);
    return `<div class="coach">${lines.join('')}${hintButton()}${readBtn(view)}</div>`;
  }
  const say = {
    riichi: 'リーチできます。どうしますか？',
    // 段階3-7：リーチの人がいない押し引き（quiet）はリーチと言わない
    pushfold: view.quiet ? '警戒する相手がいます。切る牌を選んでください' : 'リーチを受けています。切る牌を選んでください',
    call: '鳴けます。どうしますか？',
  }[view.spot] || 'あなたの番です。切る牌を選んでください';
  const line = view.level === 'hint' && view.hint ? esc(view.hint) : say;
  return `<div class="coach"><div>${tag}${line}${ownTail(view)}</div>${hintButton()}${readBtn(view)}</div>`;
}

// 理由を選ぶ（設計書 5.2）。tile：切ろうとしている牌の呼び方。ボタンは型の名前と、その意味の短い説明の2段。
// kind：'pushfold' なら押し引きの型（段階2-2 設計書 3.3）。prompt：鳴きの「ポンします」など（なければ「○を切ります」）
export function reasonHTML(tile, kind = 'discard', prompt = null) {
  const list = kind === 'pushfold' ? ['hand', 'threat', 'danger', 'compare'] : ['speed', 'shape', 'value', 'safety'];
  const buttons = list.map((r) => `<button data-reason="${r}">${REASON_NAME[r]}<small>${REASON_HELP[r]}</small></button>`).join('');
  const tag = kind === 'pushfold' ? TAGS.pushfold : TAG;
  return `<div class="coach"><div>${tag}${esc(prompt || `${tile}を切ります`)}。決め手は？</div><div class="creasons">${buttons}</div></div>`;
}

// 鳴きの答え合わせを、鳴いた後の打牌の帯の上に1行で残す（段階2-2 設計書 5.4）。answer が null なら採点中
export function callVerdictHTML(answer) {
  if (!answer) return '<div class="cverdict">鳴き：採点中…</div>';
  return `<div class="cverdict">鳴き：<span class="cgrade ${answer.grade}">${esc(answer.tag)}</span>${esc(answer.lines[0])}</div>`;
}

// 試しが終わるのを待っているあいだ
export function pendingHTML() {
  return `<div class="coach"><div>${TAG}採点中…</div></div>`;
}

// 答え合わせ（設計書 5.3）。answer：session.finish の結果
export function answerHTML(answer) {
  const [first, ...rest] = answer.lines;
  // 理由を選んだときは、正否を札の横の印で出す
  const mark = answer.reason ? `<span class="creason ${answer.reason.ok ? 'ok' : 'ng'}">理由 ${answer.reason.ok ? '○' : '×'}</span>` : '';
  return `<div class="coach answer"><div><span class="cgrade ${answer.grade}">${esc(answer.tag)}</span>${mark}${esc(first)}</div>${rest.map((l) => `<div>${esc(l)}</div>`).join('')}${hintButton()}</div>`;
}

// 読み（段階3-5 設計書 6.4・7章）：ヒントの表の上に並べる相手の札（name・label・pass、答え合わせでは truth＝本当の手）。
// why：ダマの気配の理由（段階3-6）
function readBlockHTML(read) {
  if (!read || !read.opponents || !read.opponents.length) return '';
  const rows = read.opponents.map((o) => {
    const pass = (o.pass ? `<small>（${esc(o.pass)}）</small>` : '') + (o.why ? `<small>（${esc(o.why)}）</small>` : '');
    const truth = o.truth ? `<span class="truth"> → 本当：${esc(o.truth)}</span>` : '';
    return `<div>${o.name ? `<b>${esc(o.name)}</b> ` : ''}${esc(o.label)}${pass}${truth}</div>`;
  }).join('');
  return `<div class="sread">${rows}</div>`;
}
// 切る牌ごとの2段目：聴牌・上がり・役・ロン（どれもなければ出さない）
function subRowHTML(r, cols, { win = true } = {}) {
  const parts = [];
  if (r.tenpai !== null && r.tenpai !== undefined) parts.push(`聴牌 ${pct(r.tenpai)}`);
  if (win && r.win !== null && r.win !== undefined) parts.push(`上がり ${pct(r.win)}`);
  if (r.yaku && r.yaku.length) parts.push(r.yaku.map((y) => y.name).join(' '));
  if (r.ron !== null && r.ron !== undefined) parts.push(`ロン ${r.ron < 0.01 && r.ron > 0 ? '1%未満' : pct(r.ron)}`);
  return parts.length ? `<tr class="sub"><td colspan="${cols}">${esc(parts.join('・'))}</td></tr>` : '';
}

// ヒントの表（設計書 5.4）。切る前は data に full（4つの問い）、切った後は answer（答え合わせ）。
// pending：試しの途中（見込める点数が空の行は「計算中」。終わった後は試していない候補なので「—」）
export function hintSheetHTML(data) {
  if (data.kind === 'pushfold' || data.kind === 'call') return decisionSheetHTML(data);
  const w = data.where;
  const title = `${roundName(w.zhuangfeng, w.jushu)} ${w.turn}巡目`;
  let head = '';
  if (data.answer) {
    const a = data.answer;
    head = `<div class="shead"><div><span class="cgrade ${a.grade}">${esc(a.tag)}</span>${esc(a.lines[0])}</div>${a.lines.slice(1).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
  } else if (data.full) {
    const f = data.full;
    head = `<div class="shead"><div><b>①速さ</b> ${esc(f.speed)}</div><div><b>②形</b> ${esc(f.shape)}</div><div><b>③打点</b> ${esc(f.value)}　<b>④安全</b> ${esc(f.safety)}</div></div>`;
  }
  // 6行まで。あなたの行が入らなければ最後の行をあなたにする（悪手のときほど下に来るので消さない）
  let shown = data.rows.slice(0, 6);
  const mine = data.rows.find((r) => r.mine);
  if (mine && !shown.includes(mine)) shown = [...shown.slice(0, 5), mine];
  const rows = shown.map((r) => {
    const cls = [r.best ? 'best' : '', r.mine ? 'mine' : ''].join(' ').trim();
    const x = r.x <= 0 ? '聴牌' : `${r.x}向聴`;
    const mark = r.best ? '最善' : r.mine ? 'あなた' : '';
    const ev = r.ev === null ? (data.pending ? '計算中' : '—') : fmt(r.ev);
    return `<tr class="${cls}"><td>${esc(r.name)}</td><td>${x}</td><td>${r.n}枚</td><td>${r.good === null ? '—' : pct(r.good)}</td><td>${ev}</td><td>${mark}</td></tr>${subRowHTML(r, 6)}`;
  }).join('');
  return `<div class="sheet" role="dialog" aria-label="ヒント"><button class="sclose" data-coach="close">閉じる ✕</button><h4>ヒント：${esc(title)}</h4>${head}${readBlockHTML(data.read)}<table><tr><th>切る牌</th><th>向聴</th><th>受け入れ</th><th>両面</th><th>見込める点数</th><th></th></tr>${rows}</table><p class="snote">見込める点数：この先を何百回か打ってみた平均。放銃の損はまだ入れていない</p></div>`;
}

// 指南の量のボタン（設計書 5.5）
export function levelButtonHTML(level) {
  return `<button class="clevel" data-coach="level">指南：${LEVEL_NAME[level]} ▾</button>`;
}

// 半荘の結果画面の「判断」の欄（設計書 5.6）。sum：session.summary()。
// 種類別（何切る・リーチ／押し引き／鳴き）の表を下に足す（段階2-2 設計書 5.6）
export function coachStatsHTML(sum) {
  if (!sum || sum.decisions + sum.hinted === 0) return '<div class="cstats"><h3>判断</h3><p>この半荘は考えどころがありませんでした</p></div>';
  const rate = sum.rate === null ? '—' : pct(sum.rate);
  const reason = sum.reasonRate === null ? '—' : pct(sum.reasonRate);
  let kinds = '';
  if (sum.byKind) {
    const names = { discard: '何切る・リーチ', pushfold: '押し引き', call: '鳴き' };
    const rows = Object.entries(names).map(([k, name]) => {
      const s = sum.byKind[k];
      return `<tr><td>${name}</td><td>${s.decisions}回</td><td>${s.rate === null ? '—' : pct(s.rate)}</td><td>${s.reasonRate === null ? '—' : pct(s.reasonRate)}</td></tr>`;
    }).join('');
    kinds = `<table class="ckinds"><tr><th>種類</th><th>回数</th><th>正答率</th><th>理由</th></tr>${rows}</table>`;
  }
  return `<div class="cstats"><h3>判断</h3><ul><li>考えどころ<b>${sum.decisions}回</b></li><li>正答率<b>${rate}</b></li><li class="wide">理由の正答率<b>${reason}<small>（聞いた${sum.asked}回）</small></b></li><li>悪手<b>${sum.bad}回</b></li><li>ヒントを見た<b>${sum.hinted}回</b></li></ul>${kinds}</div>`;
}

// 押し引きと鳴きのヒントの表（段階2-2 設計書 5.5）：打ち方・向聴・上がる見込み・振り込む見込み・見込める点数
function decisionSheetHTML(data) {
  const w = data.where;
  const title = `${roundName(w.zhuangfeng, w.jushu)} ${w.turn}巡目`;
  let head = '';
  if (data.answer) {
    const a = data.answer;
    head = `<div class="shead"><div><span class="cgrade ${a.grade}">${esc(a.tag)}</span>${esc(a.lines[0])}</div>${a.lines.slice(1).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
  } else if (data.full && data.kind === 'pushfold') {
    const f = data.full;
    head = `<div class="shead"><div><b>①自分の手</b> ${esc(f.hand)}　<b>②相手の脅威</b> ${esc(f.threat)}</div><div><b>③危なさ</b> ${esc(f.danger)}</div><div><b>④比べる</b> ${esc(f.compare || '計算中…')}</div></div>`;
  } else if (data.full) {
    const f = data.full;
    head = `<div class="shead"><div><b>①速さ</b> ${esc(f.speed)}</div><div><b>③打点</b> ${esc(f.value)}　<b>④安全</b> ${esc(f.safety)}</div></div>`;
  }
  let shown = data.rows.slice(0, 6);
  const mine = data.rows.find((r) => r.mine);
  if (mine && !shown.includes(mine)) shown = [...shown.slice(0, 5), mine];
  const rows = shown.map((r) => {
    const cls = [r.best ? 'best' : '', r.mine ? 'mine' : ''].join(' ').trim();
    const x = r.x === null || r.x === undefined ? '—' : r.x <= 0 ? '聴牌' : `${r.x}向聴`;
    const mark = r.best ? '最善' : r.mine ? 'あなた' : '';
    const ev = r.ev === null ? (data.pending ? '計算中' : '—') : signed(r.ev);
    const win = r.win === null || r.win === undefined ? '—' : pct(r.win);
    const deal = r.dealin === null || r.dealin === undefined ? '—' : pct(r.dealin);
    return `<tr class="${cls}"><td>${esc(r.name)}</td><td>${x}</td><td>${win}</td><td>${deal}</td><td>${ev}</td><td>${mark}</td></tr>${subRowHTML(r, 6, { win: false })}`;
  }).join('');
  const note = data.kind === 'call'
    ? '見込める点数：鳴いた場合と鳴かない場合を、同じ山の並びで何百回か打ってみた平均'
    : '見込める点数：この先を何百回か打ってみた平均。警戒している相手がいる場面は放銃の損と聴牌料を入れている';
  return `<div class="sheet" role="dialog" aria-label="ヒント"><button class="sclose" data-coach="close">閉じる ✕</button><h4>ヒント：${esc(title)}</h4>${head}${readBlockHTML(data.read)}<table><tr><th>打ち方</th><th>向聴</th><th>上がる</th><th>振り込む</th><th>見込める点数</th><th></th></tr>${rows}</table><p class="snote">${note}</p></div>`;
}
