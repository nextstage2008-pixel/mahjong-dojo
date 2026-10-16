// 上がり・流局・終局の画面の HTML。画面には触らない。
// names：席（0 東〜3 北）ごとの名前。部品の牌譜では、上がった人や点数の移動は席の番号で書かれている。
import { esc } from './table-html.js';
import { pointName } from './review-html.js';
import { coachStatsHTML } from './coach-html.js';
import Majiang from '../../vendor/majiang-core.js';
import { revealOf } from './view-model.js';

const fmt = (n) => n.toLocaleString('ja-JP');
const signed = (n) => (n > 0 ? '+' : '') + fmt(n);

// 手牌の書き方（'m123p456s789z11m5,z555='）を、並べる牌に直す（副露は '|' で区切る）
export function handCodes(paistr) {
  const sp = Majiang.Shoupai.fromString(paistr);
  const tiles = [];
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    let red = s === 'z' ? 0 : b[0];
    for (let n = 1; n < b.length; n++) {
      for (let i = 0; i < b[n]; i++) {
        if (n === 5 && red > 0) { tiles.push(s + '0'); red--; } else tiles.push(s + n);
      }
    }
  }
  const melds = sp._fulou.map((m) => [...m.slice(1).replace(/[^\d]/g, '')].map((d) => m[0] + d));
  return { tiles, melds };
}

// 点数の呼び方（満貫以上は名前で）
export function scoreLabel(hule) {
  if (hule.damanguan) return hule.damanguan > 1 ? `${hule.damanguan}倍役満` : '役満';
  const f = hule.fanshu;
  const name = f >= 13 ? '数え役満' : f >= 11 ? '三倍満' : f >= 8 ? '倍満' : f >= 6 ? '跳満' : f >= 5 || (f === 4 && hule.fu >= 40) || (f === 3 && hule.fu >= 70) ? '満貫' : '';
  return `${hule.fu}符 ${f}翻${name ? ' ' + name : ''}`;
}

// 役の翻（役満は '*'、ダブル役満は '**' で書かれている）
export function yakuLabel(fanshu) {
  if (typeof fanshu === 'string') return fanshu.length > 1 ? 'ダブル役満' : '役満';
  return fanshu + '翻';
}

// 局の結果の画面の「この局」（段階3-2 設計書 4章）。judgement：この局の判断（coach/review.js の handJudgement。null なら1行目なし）。
// mine・model：この局のあなたとお手本（同じ山）の点数の増減
export function handNoteHTML({ judgement, mine, model }) {
  // 符号は指南の文と同じ「−」（結果の画面の点数の動きは半角のまま）
  const pm = (v) => (v === 0 ? '±0' : v > 0 ? '+' + fmt(v) : '−' + fmt(-v));
  const rows = [];
  if (judgement) {
    const parts = [];
    if (judgement.total) parts.push(`判断 ${judgement.correct}/${judgement.total} 正解`);
    if (judgement.worst) parts.push(`分かれ目 ${pointName(judgement.worst)} 約−${fmt(Math.round(judgement.worst.loss))}点`);
    if (parts.length) rows.push(`<p>${esc(parts.join('・'))}</p>`);
  }
  rows.push(`<p>${mine === model ? `同じ山のお手本と同じ ${pm(model)}点` : `同じ山のお手本なら ${pm(model)}点（あなた ${pm(mine)}点）`}</p>`);
  return `<div class="hand-note"><h3>この局</h3>${rows.join('')}</div>`;
}

// 振り込んだ局の読みの1行（段階3-5 設計書 6.6）：「この牌は○○さんに当たる見込み○%（色）と読めていました」。
// 色の言葉は手牌の印と同じ境（1%未満＝緑・1〜5%＝黄・5%以上＝赤）
export function dealInLineHTML({ name, p }) {
  const v = p < 0.01 ? '1%未満' : `${Math.round(p * 100)}%`;
  const color = p < 0.01 ? '緑' : p < 0.05 ? '黄' : '赤';
  return `<p class="dealin-read">この牌は ${esc(name)}さんに当たる見込み ${v}（${color}）と読めていました</p>`;
}

// ダマに振り込んだ局の行（段階3-6 設計書 8.1）：3-5 の1行の下に。signs は切ったときに見えていた気配（古い順。{ turn, text }）
// unused：読みに入れていない押し（{ turn, label }。攻め屋など。最後のレビューの直し：押しを見ていたのに「気配はありません」と言わない）
export function damaLineHTML({ name, signs, unused = [] }) {
  const who = unused.length && unused[0].label ? `${esc(unused[0].label)}の押し` : 'この押し';
  const body = signs.length
    ? `見えていた気配：${signs.map((x) => `${x.turn}巡目 ${esc(x.text)}`).join('・')}`
    : unused.length
      ? `${unused.map((x) => `${x.turn}巡目`).join('・')}にリーチへ無筋を押していましたが、${who}は聴牌の気配になりにくいので、読みには入れていません`
      : '見えていた気配はありません（防ぎにくい放銃）';
  return `<p class="dealin-read">${esc(name)}さんはダマでした。${body}</p>`;
}

// ダマの行を出すか：自分（myMenfeng）が振り込み、上がった人が切ったときに門前でリーチしていなかったときだけ。
// d：指南の discardRead()（opponents を持つ）。hule：上がりの知らせ（l・baojia）。返すもの：{ seat, signs } か null
export function damaLineFor(d, hule, myMenfeng) {
  if (!d || !d.opponents || !hule || hule.baojia !== myMenfeng) return null;
  const o = d.opponents.find((x) => x.seat === hule.l);
  return o && o.menzen && !o.riichi ? { seat: o.seat, signs: o.signs || [], unused: o.unused || [] } : null;
}

// 顔の札（手直し 7章）：結果の画面のいちばん上に、上がった人 ← 振り込んだ人。winner・from は { name, img }
// （img が null なら顔の代わりに「あなた」の札）。from が null ならツモ
export function huleFacesHTML({ winner, from }) {
  const face = (w, cls) => `<div class="face ${cls}">${w.img ? `<img src="assets/chars/${w.img}_s.jpg" alt="">` : '<span class="you">あなた</span>'}<b>${esc(w.name)}</b></div>`;
  return `<div class="hule-who">${face(winner, 'win')}${from ? `<span class="arrow">←</span>${face(from, 'from')}` : '<span class="how">ツモ</span>'}</div>`;
}

// 上がりの画面。note：「この局」の HTML（段階3-2。なければ出さない）。faces：顔の札（手直し 7章。{ winner, from }。なければ出さない）
export function huleHTML(hule, names, src, { note = '', faces = null } = {}) {
  const who = esc(names[hule.l]);
  const how = hule.baojia == null ? 'ツモ' : `ロン（${esc(names[hule.baojia])}から）`;
  // 手牌：伏せていた牌、副露、いちばん右に少し離して上がり牌（光らせ、下に「ロン」か「ツモ」。先生のご要望・手直し）
  const { melds } = handCodes(hule.shoupai);
  const { tiles, win } = revealOf(hule.shoupai);
  const img = (code) => `<img class="rt" src="${src(code, 'flat')}" alt="">`;
  const winTile = win ? `<span class="rwin">${img(win)}<small>${hule.baojia == null ? 'ツモ' : 'ロン'}</small></span>` : '';
  const hand = tiles.map(img).join('') + melds.map((m) => `<span class="rm">${m.map(img).join('')}</span>`).join('') + winTile;
  const yaku = hule.hupai.map((h) => `<li><span>${esc(h.name)}</span><b>${yakuLabel(h.fanshu)}</b></li>`).join('');
  const moves = hule.fenpei.map((d, l) => `<li><span>${esc(names[l])}</span><b class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${signed(d)}</b></li>`).join('');
  return `<div class="panel result">${faces ? huleFacesHTML(faces) : ''}<h2>${who}　${how}</h2><div class="rhand">${hand}</div><ul class="yaku">${yaku}</ul><p class="score">${scoreLabel(hule)}　<b>${fmt(hule.defen)}点</b></p><ul class="moves">${moves}</ul>${note}<button class="btn primary" data-next>次へ</button></div>`;
}

// 流局の画面（荒牌平局ならテンパイ／ノーテンも）。note：「この局」の HTML（段階3-2）
export function pingjuHTML(pingju, names, { note = '' } = {}) {
  const tenpai = pingju.name === '荒牌平局' || pingju.name === '流し満貫'
    ? `<ul class="tenpai">${pingju.shoupai.map((s, l) => `<li><span>${esc(names[l])}</span><b>${s ? 'テンパイ' : 'ノーテン'}</b></li>`).join('')}</ul>`
    : '';
  const moves = pingju.fenpei.some((d) => d !== 0)
    ? `<ul class="moves">${pingju.fenpei.map((d, l) => `<li><span>${esc(names[l])}</span><b class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${signed(d)}</b></li>`).join('')}</ul>`
    : '';
  return `<div class="panel result"><h2>流局　${esc(pingju.name)}</h2>${tenpai}${moves}${note}<button class="btn primary" data-next>次へ</button></div>`;
}

// 終局の画面。namesById：id（0 あなた・1〜3 相手）ごとの名前
// coach：半荘の判断のまとめ（coach/session の summary。渡さなければ欄を出さない）。review：「感想戦をする」のボタン（段階3-1）
export function jiejuHTML(paipu, namesById, coach = null, { review = false } = {}) {
  const order = [0, 1, 2, 3].sort((a, b) => paipu.rank[a] - paipu.rank[b]);
  const rows = order.map((id) => `<li class="${id === 0 ? 'me' : ''}"><span class="rk">${paipu.rank[id]}位</span><span>${esc(namesById[id])}</span><b>${fmt(paipu.defen[id])}</b><i>${+paipu.point[id] > 0 ? '+' : ''}${paipu.point[id]}</i></li>`).join('');
  return `<div class="panel result final"><h2>対局終了</h2><ul class="ranking">${rows}</ul>${coach ? coachStatsHTML(coach) : ''}${review ? '<button class="btn primary" data-review>感想戦をする</button>' : ''}<button class="btn ${review ? '' : 'primary'}" data-next>タイトルへ</button></div>`;
}
