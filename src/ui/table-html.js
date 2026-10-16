// 卓の画面の HTML（設計書 8章）。画面の大きさは縦持ちのスマホ 393×852（論理ピクセル）で固定し、
// 実際の画面にはこれを拡大・縮小して合わせる。座標は打ち合わせで決めた見本（明るめ A）のもの。
// src(code, view) は牌の絵の URL を返す関数（画面では tile-art の loadTileArt、テストでは仮の関数）。
import { TILE_VIEWS } from './tile-art.js';

export const SCREEN = { w: 393, h: 852, felt: 564 };

// 窓（幅 w・高さ h）に画面全体が収まる倍率。縦にも横にもはみ出さない
export function fitScale(w, h) {
  return Math.min(w / SCREEN.w, h / SCREEN.h);
}

// 卓のほかの段の高さ（上の帯52＋指南の帯89＋手牌103＋下の段44）と、卓を縮めてよい下限
const OTHER_H = SCREEN.h - SCREEN.felt;
const FELT_MIN = 0.7;

// 画面の合わせ方（手直し 3章）：縦持ちは横幅いっぱいにし、縦の過不足は真ん中の卓（393×564）だけで受ける（0.7倍まで。
// それでも足りなければ全体を縮める）。横長の窓は今のまま。返すもの：{ scale（全体の倍率）, height（画面の高さ）, feltScale（卓の倍率） }
export function layoutFor(w, h) {
  if (w >= h) return { scale: fitScale(w, h), height: SCREEN.h, feltScale: 1 };
  const scale = w / SCREEN.w;
  const height = h / scale;
  const feltScale = Math.min(1, (height - OTHER_H) / SCREEN.felt);
  if (feltScale >= FELT_MIN) return { scale, height, feltScale };
  const minH = OTHER_H + FELT_MIN * SCREEN.felt;
  return { scale: h / minH, height: minH, feltScale: FELT_MIN };
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => n.toLocaleString('ja-JP');

// 牌1枚。scale で大きさを変える。turn：回す角度（90 刻み。箱の縦横も入れ替える）
export function tileHTML(src, code, view, { scale = 1, turn = 0, cls = '', attrs = '' } = {}) {
  const v = TILE_VIEWS[view];
  const w = v.w * scale;
  const h = v.h * scale;
  const swap = turn === 90 || turn === -90;
  const bw = swap ? h : w;
  const bh = swap ? w : h;
  const imgStyle = turn ? `position:absolute;left:${(bw - w) / 2}px;top:${(bh - h) / 2}px;transform:rotate(${turn}deg)` : '';
  return `<span class="t ${view} ${cls}" style="width:${bw}px;height:${bh}px" ${attrs}><img src="${src(code, view)}" width="${w}" height="${h}" alt="" style="${imgStyle}" draggable="false"></span>`;
}

// 鳴きのボタンの中身：言葉と、できあがる面子の牌の絵（鳴いた牌は横向き）。鳴きでないボタンは名前だけ。
// compact：ボタンが多いとき。絵を小さくし言葉を省いて、帯の1段に収める（読み上げ用の名前はボタンの aria-label に残す）
export function callButtonHTML(b, src, { compact = false } = {}) {
  if (!b.tiles) return esc(b.label);
  const tiles = b.tiles.map((t) => tileHTML(src, t.code, t.side ? 'side' : 'flat', { scale: compact ? 0.6 : 0.8 })).join('');
  return `${compact ? '' : esc(b.word)}<span class="mini">${tiles}</span>`;
}

// 河（6枚ずつ。3段目からは続けて並べる）。callLast：最後の1枚が鳴ける牌（光らせる印を付ける）。
// ツモ切りの牌は class tg（少し薄く描く。段階3-5 設計書 6.5）
export function riverHTML(src, tiles, rel, callLast = false) {
  const rows = [];
  tiles.forEach((t, i) => {
    const r = Math.min(Math.floor(i / 6), 2);
    const cls = [callLast && i === tiles.length - 1 ? 'callme' : '', t.tsumogiri ? 'tg' : ''].filter(Boolean).join(' ');
    (rows[r] = rows[r] || []).push(tileHTML(src, t.code, t.side ? 'side' : 'flat', { cls, attrs: `data-river="${rel}"` }));
  });
  return rows.map((r) => `<div class="r">${r.join('')}</div>`).join('');
}

// 河の置き場所：点数板に近い1列目から外へ伸びるよう、左上を軸に回す
const RIVER_POS = {
  0: 'left:130.8px;top:362.6px',
  1: 'left:277.1px;top:347.3px;transform:rotate(-90deg)',
  2: 'left:261.8px;top:200.9px;transform:rotate(180deg)',
  3: 'left:115.4px;top:216.3px;transform:rotate(90deg)',
};
const STICK_POS = {
  0: 'left:167px;top:350px;width:58px;height:6px',
  1: 'left:265px;top:253px;width:6px;height:58px',
  2: 'left:167px;top:207.5px;width:58px;height:6px',
  3: 'left:121.5px;top:253px;width:6px;height:58px',
};
const BPLATE_POS = {
  0: 'left:159.6px;top:336.5px',
  1: 'left:220.5px;top:276.2px;transform:rotate(-90deg)',
  2: 'left:159.6px;top:214.8px;transform:rotate(180deg)',
  3: 'left:98.2px;top:276.2px;transform:rotate(90deg)',
};
const PLATE_POS = { 1: 'right:8px;top:40px', 2: 'left:8px;top:40px', 3: 'left:8px;bottom:22px' };

// 相手の伏せた手と副露。対面は上の横一列、上家は左の縦一列、下家は右の縦一列。
// 副露はその人から見て右側（対面＝こちらの左、上家＝こちらの下、下家＝こちらの上）に置く
// reveal：上がった人の倒した手（手直し 7章。{ tiles, win }）。伏せた手の代わりに寝た牌で描く
function opponentHandHTML(src, seat, reveal = null) {
  const backs = [];
  const n = seat.concealed;
  const view = seat.rel === 2 ? 'back' : 'backSide';
  const mirror = seat.rel === 1 ? 'mirror' : '';
  const turn = { 1: -90, 2: 180, 3: 90 }[seat.rel];
  if (reveal) {
    for (const code of reveal.tiles) backs.push(tileHTML(src, code, 'flat', { scale: 0.62, turn }));
    if (reveal.win) backs.push('<span class="gap"></span>' + tileHTML(src, reveal.win, 'flat', { scale: 0.62, turn, cls: 'win' }));
  } else {
    for (let i = 0; i < n; i++) backs.push(tileHTML(src, 'z1', view, { cls: mirror }));
    if (seat.drawn) backs.push('<span class="gap"></span>' + tileHTML(src, 'z1', view, { cls: mirror + ' drawn' }));
  }
  const melds = seat.melds.map((m) => `<span class="meld">${m.map((t) => tileHTML(src, t.code, t.back ? (seat.rel === 2 ? 'back' : 'backSide') : t.side ? 'side' : 'flat', { scale: 0.62, turn: t.back ? 0 : turn })).join('')}</span>`).join('');
  const parts = seat.rel === 3 ? [backs.join(''), melds] : [melds, backs.join('')];
  return `<div class="opp opp${seat.rel}${reveal ? ' revealed' : ''}" data-opp="${seat.rel}">${parts.filter(Boolean).join('<span class="mgap"></span>')}</div>`;
}

function plateHTML(seat) {
  const cls = ['plate', 'p' + seat.rel, seat.turn ? 'turn' : ''].join(' ');
  const avatar = seat.img ? `<img class="av" src="assets/chars/${seat.img}_s.jpg" alt="">` : '';
  const riichi = seat.riichi ? '<span class="reach">リーチ</span>' : '';
  return `<div class="${cls}" style="${PLATE_POS[seat.rel]}" data-plate="${seat.rel}">${avatar}<div><span class="nm">${esc(seat.name)}</span><span class="wd${seat.dealer ? ' oya' : ''}">${seat.wind}</span>${riichi}<br><span class="pts">${fmt(seat.score)}</span>${seat.style ? `<span class="sty">${esc(seat.style)}</span>` : ''}</div></div>`;
}

// 読みの札（段階3-5 設計書 6.3）：警戒している相手の名札のそばに、聴牌の見込み・役・高さの1行と、当たりにくい牌の一言。
// 置き場所は卓の木の縁（牌のない所）：対面と下家は名札の上、上家は名札の上（下の縁の内側）。名札の下は対面の副露の列に
// かかるので避けた（画面の確かめで直した）。opponents：読みの相手（seat は局の席）。seats：tableView の seats
const RTAG_POS = { 1: 'right:8px;top:2px', 2: 'left:8px;top:2px', 3: 'left:8px;bottom:70px' };
export function readTagsHTML(opponents, seats) {
  return (opponents || []).map((o) => {
    const s = seats.find((x) => x.l === o.seat);
    if (!s || s.rel === 0) return '';
    const pass = o.pass ? `<div class="rpass">${esc(o.pass)}</div>` : '';
    // ダマの気配の理由（段階3-6 設計書 7.5）：当たりにくい牌の行と同じ段。札用の短い言葉（tagWhy）
    const why = o.tagWhy ? `<div class="rpass">${esc(o.tagWhy)}</div>` : '';
    return `<div class="rtag" data-rtag="${s.rel}" style="${RTAG_POS[s.rel]}"><div>${esc(o.label)}</div>${pass}${why}</div>`;
  }).join('');
}

// 卓（フェルトの上のもの全部）。callFrom：鳴ける牌を出した席（自分から見た位置）。
// reveal：上がった相手の倒した手（手直し 7章。{ rel, tiles, win }）。readTags：読みの札（段階3-5。readTagsHTML）
export function feltHTML(view, src, { callFrom = null, reveal = null, readTags = '' } = {}) {
  const out = [];
  for (const s of view.seats) {
    out.push(`<div class="bplate" style="${BPLATE_POS[s.rel]}"><span class="${s.dealer ? 'oya' : ''}">${s.wind}</span>${fmt(s.score)}</div>`);
    if (s.riichi) out.push(`<div class="stick" data-stick="${s.rel}" style="${STICK_POS[s.rel]}"></div>`);
    out.push(`<div class="river" data-river-box="${s.rel}" style="${RIVER_POS[s.rel]}">${riverHTML(src, s.river, s.rel, s.rel === callFrom)}</div>`);
    if (s.rel !== 0) {
      out.push(opponentHandHTML(src, s, reveal && reveal.rel === s.rel ? reveal : null));
      out.push(plateHTML(s));
    }
  }
  out.push(`<div class="screen"><b>${view.round}</b><span>${view.honba}本場・供託${view.kyoutaku}</span><span>残り ${view.remaining}</span></div>`);
  if (readTags) out.push(readTags);
  return out.join('');
}

// 下の段。level：指南の量のボタン（指南のない対局なら ''）。practice：打ち直し（段階3-2）なら「打ち直しをやめる」だけ
export function bottomBarHTML({ level = '', practice = false } = {}) {
  if (practice) return '<div class="mj-bottom"><button data-menu="quit">打ち直しをやめる</button></div>';
  return `<div class="mj-bottom${level ? ' with-level' : ''}">${level}<button data-menu="settings">設定</button><button data-menu="title">タイトルへ</button></div>`;
}

// 上の帯（局・本場・供託・残り・ドラ表示牌）。ドラ表示牌は寝た牌の1.08倍、カンで3枚以上なら0.9倍（手直し 4章）
export function topHTML(view, src) {
  const scale = view.dora.length >= 3 ? 0.9 : 1.08;
  const dora = view.dora.map((p) => tileHTML(src, p, 'flat', { scale })).join('');
  return `<span class="kyoku">${view.round} ${view.honba}本場</span><span class="info">供託 ${view.kyoutaku}　残り ${view.remaining}</span><span class="dora">ドラ表示 ${dora}</span>`;
}

// 自分の席（名前・点数・手牌・副露）。selected：浮かせている牌の位置（-1 はツモ牌）。
// allowed：切れる牌の位置の集合（null なら全部）。lift：鳴くときに使う牌（種類ごとの枚数。印を付ける）
// danger：手牌の危なさの印（段階2-2 設計書 5.2。牌の書き方 → 放銃率。全部の段・リーチを受けているときだけ渡す）
export function meHTML(view, src, { selected = null, allowed = null, lift = null, danger = null } = {}) {
  const me = view.seats[0];
  const left = { ...(lift || {}) };
  // 危なさの印：現物・安全（1%未満・緑）・1〜5%（黄）・5%以上（赤）
  const mark = (code) => {
    if (!danger || danger[code] === undefined) return { cls: '', attr: '' };
    const p = danger[code];
    const label = p === 0 ? '現物' : p < 0.01 ? '安全' : `${Math.round(p * 100)}%`;
    return { cls: p < 0.01 ? ' dg-safe' : p < 0.05 ? ' dg-warn' : ' dg-bad', attr: ` data-dg="${label}"` };
  };
  const tiles = view.me.tiles.map((code, i) => {
    const use = left[code] > 0 ? (left[code]--, ' use') : '';
    const m = mark(code);
    const cls = [selected === i ? 'up' : '', allowed && !allowed.has(i) ? 'no' : ''].join(' ') + use + m.cls;
    return tileHTML(src, code, 'hand', { cls: 'ht ' + cls, attrs: `data-i="${i}" data-code="${code}"${m.attr}` });
  });
  if (view.me.zimo) {
    const m = mark(view.me.zimo);
    const cls = [selected === -1 ? 'up' : '', allowed && !allowed.has(-1) ? 'no' : ''].join(' ') + m.cls;
    tiles.push('<span class="gap"></span>' + tileHTML(src, view.me.zimo, 'hand', { cls: 'ht zimo ' + cls, attrs: `data-i="-1" data-code="${view.me.zimo}"${m.attr}` }));
  }
  const melds = view.me.melds.map((m) => `<span class="meld">${m.map((t) => tileHTML(src, t.code, t.back ? 'back' : t.side ? 'side' : 'flat', { scale: 0.82 })).join('')}</span>`).join('');
  const riichi = me.riichi ? '<span class="reach">リーチ</span>' : '';
  return `<div class="info"><span class="wd${me.dealer ? ' oya' : ''}">${me.wind}</span><span>あなた</span>${riichi}<span class="pts">${fmt(me.score)}</span></div><div class="hand" data-hand>${tiles.join('')}${melds ? '<span class="mgap"></span>' + melds : ''}</div>`;
}
