// 卓の画面の HTML（設計書 8章）。画面の大きさは横 760×340（論理ピクセル。stage.js）で固定し、
// 実際の画面にはこれを拡大・縮小して合わせる。座標は打ち合わせで決めた見本（明るめ A）のもの。
// src(code, view) は牌の絵の URL を返す関数（画面では tile-art の loadTileArt、テストでは仮の関数）。
import { TILE_VIEWS } from './tile-art.js';
import { LAND, LAND_SIZES } from './stage.js';
import { avatarSrc } from '../core/profile.js';

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

// 立体の卓（画面の作り直し 段1 作業2・設計書 5章）：一辺 size の卓を rotateX(tilt) で斜めに倒す。席ごとに卓の真ん中を軸に
// rotate(-90°×席) した層（.seat）を重ね、その層の中では「手前の席」と同じ並べ方で描く（河は真ん中の台の左の縁から、
// リーチ棒は台と河の間、相手の手は手前の縁に立てる）。角度と大きさは画像で詰めてよい（変えたら台帳に書く）
export const FELT3D = { size: 330, tilt: 30 };
export const FELT_PERSPECTIVE = 1500; // styles.css の .felt3d の perspective と同じ
export const CENTER_SIZE = 76; // 真ん中の台の一辺
const CENTER = CENTER_SIZE;
export const RIVER_GAP = 4; // 真ん中の台と河の間
// 横の画面で卓を置く高さ（styles.css の #stage.land .mj-feltbox の top。卓の真ん中はこの 140px 下）。
// 自分の河の3段目まで手牌の帯の上に見えるよう決めた（最後のレビューの直し）
export const LAND_FELT_TOP = 4;
// 卓の上で真ん中から d（手前が正）の点が、画面で真ん中からどれだけ下に出るか（rotateX(tilt) と perspective の計算）
export function feltProjectY(d) {
  const t = (FELT3D.tilt * Math.PI) / 180;
  return (d * Math.cos(t) * FELT_PERSPECTIVE) / (FELT_PERSPECTIVE - d * Math.sin(t));
}


// 相手の手（席の層の中・手前の縁）。伏せた手は牌の裏を立てて並べ（.stand）、鳴いた面子は寝かせて右に置く。
// reveal：上がった人の倒した手（手直し 7章。{ tiles, win }）。立てた裏の代わりに寝た牌で描く
function opponentHandHTML(src, seat, reveal = null) {
  const out = [];
  if (reveal) {
    const lay = reveal.tiles.map((code) => tileHTML(src, code, 'flat', { scale: 0.8 }));
    if (reveal.win) lay.push('<span class="gap"></span>' + tileHTML(src, reveal.win, 'flat', { scale: 0.8, cls: 'win' }));
    out.push(`<span class="lay">${lay.join('')}</span>`);
  } else {
    const backs = [];
    for (let i = 0; i < seat.concealed; i++) backs.push(tileHTML(src, 'z1', 'back', { scale: 1.3 }));
    if (seat.drawn) backs.push('<span class="gap"></span>' + tileHTML(src, 'z1', 'back', { scale: 1.3, cls: 'drawn' }));
    out.push(`<span class="stand">${backs.join('')}</span>`);
  }
  const melds = seat.melds.map((m) => `<span class="meld">${m.map((t) => tileHTML(src, t.code, t.back ? 'back' : t.side ? 'side' : 'flat', { scale: 0.7 })).join('')}</span>`).join('');
  if (melds) out.push(`<span class="omelds">${melds}</span>`);
  return `<div class="opp opp${seat.rel}${reveal ? ' revealed' : ''}" data-opp="${seat.rel}">${out.join('')}</div>`;
}

// 席の層：河・リーチ棒・相手の手
function seatHTML(src, s, { callFrom = null, reveal = null } = {}) {
  const S = FELT3D.size;
  const parts = [];
  if (s.riichi) parts.push(`<div class="stick" data-stick="${s.rel}" style="left:${S / 2 - 29}px;top:${S / 2 + CENTER / 2 - 7}px;width:58px;height:5px"></div>`);
  parts.push(`<div class="river" data-river-box="${s.rel}" style="left:${S / 2 - CENTER / 2}px;top:${S / 2 + CENTER / 2 + RIVER_GAP}px">${riverHTML(src, s.river, s.rel, s.rel === callFrom)}</div>`);
  if (s.rel !== 0) parts.push(opponentHandHTML(src, s, reveal && reveal.rel === s.rel ? reveal : null));
  return `<div class="seat" data-seat="${s.rel}" style="transform:rotate(${-90 * s.rel}deg)">${parts.join('')}</div>`;
}

// 真ん中の台：局・本場・供託・残りと、4つの縁に風と点数（その席の向き）
function screenHTML(view) {
  const plates = view.seats.map((s) => `<div class="bplate" style="transform:rotate(${-90 * s.rel}deg) translateY(${CENTER / 2 - 9}px)"><span class="${s.dealer ? 'oya' : ''}">${s.wind}</span>${fmt(s.score)}</div>`).join('');
  return `<div class="screen" style="left:${(FELT3D.size - CENTER) / 2}px;top:${(FELT3D.size - CENTER) / 2}px;width:${CENTER}px;height:${CENTER}px"><b>${view.round}</b><span>${view.honba}本場・供託${view.kyoutaku}</span><span>残り ${view.remaining}</span>${plates}</div>`;
}

// 名札（相手と自分で同じ形）。置き場は CSS の .p0〜.p3（縦と横の画面で変える）。自分のアバターは段3で入る（今は名前の頭の字の丸）
function plateHTML(seat, { name = null, avatar = null } = {}) {
  const cls = ['plate', 'p' + seat.rel, seat.turn ? 'turn' : ''].join(' ');
  const nm = name ?? seat.name;
  const avatarHTML = avatarSrc(avatar, true) ? `<img class="av" src="${avatarSrc(avatar, true)}" alt="">`
    : seat.img ? `<img class="av" src="assets/chars/${seat.img}_s.jpg" alt="">`
      : `<span class="av av-none">${esc(Array.from(String(nm))[0] || '')}</span>`;
  const riichi = seat.riichi ? '<span class="reach">リーチ</span>' : '';
  return `<div class="${cls}" data-plate="${seat.rel}">${avatarHTML}<div><span class="nm">${esc(nm)}</span><span class="wd${seat.dealer ? ' oya' : ''}">${seat.wind}</span>${riichi}<br><span class="pts">${fmt(seat.score)}</span>${seat.style ? `<span class="sty">${esc(seat.style)}</span>` : ''}</div></div>`;
}

// 読みの札（段階3-5 設計書 6.3）：警戒している相手の名札のそばに、聴牌の見込み・役・高さの1行と、当たりにくい牌の一言。
// 置き場所は卓の木の縁（牌のない所）：対面と下家は名札の上、上家は名札の上（下の縁の内側）。名札の下は対面の副露の列に
// かかるので避けた（画面の確かめで直した）。opponents：読みの相手（seat は局の席）。seats：tableView の seats
export function readTagsHTML(opponents, seats) {
  return (opponents || []).map((o) => {
    const s = seats.find((x) => x.l === o.seat);
    if (!s || s.rel === 0) return '';
    const pass = o.pass ? `<div class="rpass">${esc(o.pass)}</div>` : '';
    // ダマの気配の理由（段階3-6 設計書 7.5）：当たりにくい牌の行と同じ段。札用の短い言葉（tagWhy）
    const why = o.tagWhy ? `<div class="rpass">${esc(o.tagWhy)}</div>` : '';
    return `<div class="rtag" data-rtag="${s.rel}"><div>${esc(o.label)}</div>${pass}${why}</div>`;
  }).join('');
}

// 立体の卓（卓の上のもの全部）。callFrom：鳴ける牌を出した席（自分から見た位置）。
// reveal：上がった相手の倒した手（手直し 7章。{ rel, tiles, win }）。readTags：読みの札（段階3-5。readTagsHTML。卓の外の2Dに重ねる）
export function feltHTML(view, src, { callFrom = null, reveal = null, readTags = '' } = {}) {
  const S = FELT3D.size;
  const seats = view.seats.map((s) => seatHTML(src, s, { callFrom, reveal })).join('');
  return `<div class="felt3d"><div class="felt" style="width:${S}px;height:${S}px;transform:rotateX(${FELT3D.tilt}deg)">${seats}${screenHTML(view)}</div></div>${readTags || ''}`;
}

// 4人の名札（2D。卓の外）。meName：自分の名前（段3で設定から。なければ「あなた」）。meAvatar：自分のアバターの絵の名前（段3）
export function platesHTML(view, { meName = 'あなた', meAvatar = null } = {}) {
  return view.seats.map((s) => (s.rel === 0 ? plateHTML(s, { name: meName || 'あなた', avatar: meAvatar }) : plateHTML(s))).join('');
}

// 横の対局の画面の手牌の倍率（1が LAND_SIZES.hand の幅）。手の牌 nTiles 枚（引いた牌を含む）と鳴き nMelds 組（牌は合わせて nMeldTiles 枚）が
// 横幅（LAND.w − 20）に収まるよう下げる（画面の作り直し 段1 作業3）
export function handScale(nTiles, nMelds = 0, nMeldTiles = nMelds * 3) {
  const W = LAND_SIZES.hand;
  const meldW = TILE_VIEWS.flat.w * 0.82 * (W / TILE_VIEWS.hand.w);
  const gaps = 7 + nMelds * 7;
  const need = nTiles * W + nMeldTiles * meldW;
  return Math.min(1, (LAND.w - 20 - gaps) / need);
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
// land：横の対局の画面（手牌を LAND_SIZES.hand の幅に。鳴きが多ければ handScale で下げる）
export function meHTML(view, src, { selected = null, allowed = null, lift = null, danger = null, land = false } = {}) {
  const me = view.seats[0];
  const nMeldTiles = view.me.melds.reduce((a, m) => a + m.length, 0);
  const hs = land ? (LAND_SIZES.hand / TILE_VIEWS.hand.w) * handScale(view.me.tiles.length + (view.me.zimo ? 1 : 0), view.me.melds.length, nMeldTiles) : 1;
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
    return tileHTML(src, code, 'hand', { scale: hs, cls: 'ht ' + cls, attrs: `data-i="${i}" data-code="${code}"${m.attr}` });
  });
  if (view.me.zimo) {
    const m = mark(view.me.zimo);
    const cls = [selected === -1 ? 'up' : '', allowed && !allowed.has(-1) ? 'no' : ''].join(' ') + m.cls;
    tiles.push('<span class="gap"></span>' + tileHTML(src, view.me.zimo, 'hand', { scale: hs, cls: 'ht zimo ' + cls, attrs: `data-i="-1" data-code="${view.me.zimo}"${m.attr}` }));
  }
  const melds = view.me.melds.map((m) => `<span class="meld">${m.map((t) => tileHTML(src, t.code, t.back ? 'back' : t.side ? 'side' : 'flat', { scale: 0.82 * hs })).join('')}</span>`).join('');
  const riichi = me.riichi ? '<span class="reach">リーチ</span>' : '';
  return `<div class="info"><span class="wd${me.dealer ? ' oya' : ''}">${me.wind}</span><span>あなた</span>${riichi}<span class="pts">${fmt(me.score)}</span></div><div class="hand" data-hand>${tiles.join('')}${melds ? '<span class="mgap"></span>' + melds : ''}</div>`;
}
