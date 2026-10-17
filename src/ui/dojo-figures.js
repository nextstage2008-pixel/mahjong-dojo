// 講義と問題の図の HTML（段階4-1 作業6）。図の形は src/dojo/lectures/chapters.js の先頭の説明のとおり。
// src(code, view)：牌の絵の URL。縦持ち（横幅 390px）でも1行に収まるよう、牌の数に合わせて小さくする
import { tileHTML, esc } from './table-html.js';
import { codesOf } from '../dojo/questions/util.js';
import { TILE_VIEWS } from './tile-art.js';

const WIND = ['東', '南', '西', '北'];
// 1行に並べられる幅（390px から余白を引いた幅）
const ROW_W = 340; // 横の画面の左の列（画面の作り直し 段2）
const scaleFor = (n, view = 'hand', extra = 0) => Math.min(1, (ROW_W - extra) / (n * TILE_VIEWS[view].w));

export const tilesHTML = (codes, src, { view = 'hand', scale = 1 } = {}) => codes.map((c) => tileHTML(src, c, view, { scale })).join('');
const meldCodes = (m) => codesOf(m.replace(/[-=+]/g, ''));

function handHTML(f, src) {
  const closed = codesOf(f.tiles);
  const melds = (f.melds || []).map(meldCodes);
  const n = closed.length + melds.flat().length + (f.win ? 1 : 0);
  const scale = scaleFor(n, 'hand', 12 * (melds.length + (f.win ? 1 : 0)));
  const parts = [`<span class="dj-hand">${tilesHTML(closed, src, { scale })}</span>`];
  for (const m of melds) parts.push(`<span class="dj-meld">${tilesHTML(m, src, { scale })}</span>`);
  if (f.win) parts.push(`<span class="dj-win"><small>${f.how === 'tsumo' ? 'ツモ' : 'ロン'}</small>${tilesHTML([f.win], src, { scale })}</span>`);
  const info = [];
  if (f.zhuangfeng !== undefined && f.menfeng !== undefined) info.push(`場風 ${WIND[f.zhuangfeng]}・自風 ${WIND[f.menfeng]}`);
  const dora = f.baopai?.length ? `<span class="dj-dora">ドラ表示牌 ${tilesHTML(f.baopai, src, { view: 'flat', scale: 0.8 })}</span>` : '';
  return `<div class="dj-fig dj-fig-hand"><div class="dj-row">${parts.join('')}</div>${info.length || dora ? `<div class="dj-info">${esc(info.join('　'))}${dora}</div>` : ''}${f.note ? `<p class="dj-note">${esc(f.note)}</p>` : ''}</div>`;
}

// 図 scene（段階4-2 作業3）：自分の手（と引いた牌・鳴き）・ドラ表示牌・局と巡目と、選んだ相手の河（6枚ずつの段。
// リーチの宣言牌は横向き・ツモ切りは薄く dj-tg・鳴かれた牌は出さない）と鳴き。河は2列に並べる
export const SCENE_W = ROW_W;
export function sceneScale(f) {
  const closed = codesOf(f.hand || '').length;
  const melds = (f.melds || []).map(meldCodes);
  const n = closed + (f.draw ? 1 : 0) + melds.flat().length;
  return scaleFor(n, 'hand', 12 * (melds.length + (f.draw ? 1 : 0)));
}
const ROUND = ['東', '南', '西', '北'];
function riverBox(r, src) {
  const rows = [];
  r.tiles.filter((t) => !t.called).forEach((t, i) => {
    const k = Math.floor(i / 6);
    const html = tileHTML(src, t.code, t.riichi ? 'side' : 'flat', { scale: 0.86, cls: t.tsumogiri ? 'dj-tg' : '' });
    (rows[k] = rows[k] || []).push(html);
  });
  const melds = (r.melds || []).map((m) => `<span class="dj-meld">${tilesHTML(meldCodes(m), src, { view: 'flat', scale: 0.7 })}</span>`).join('');
  return `<div class="dj-river"><small>${esc(r.label)}</small>${rows.map((x) => `<div class="dj-rr">${x.join('')}</div>`).join('')}${melds ? `<div class="dj-rm">${melds}</div>` : ''}</div>`;
}
function sceneHTML(f, src) {
  const scale = sceneScale(f);
  const parts = [`<span class="dj-hand">${tilesHTML(codesOf(f.hand || ''), src, { scale })}</span>`];
  if (f.draw) parts.push(`<span class="dj-draw">${tilesHTML([f.draw], src, { scale })}</span>`);
  for (const m of f.melds || []) parts.push(`<span class="dj-meld">${tilesHTML(meldCodes(m), src, { scale })}</span>`);
  const info = [];
  if (f.round) info.push(`${ROUND[f.round.zhuangfeng]}${f.round.jushu + 1}局・${f.round.turn}巡目`);
  if (f.note) info.push(f.note);
  const dora = f.baopai?.length ? `<span class="dj-dora">ドラ表示牌 ${tilesHTML(f.baopai, src, { view: 'flat', scale: 0.8 })}</span>` : '';
  const rivers = (f.rivers || []).map((r) => riverBox(r, src)).join('');
  const hand = f.hand ? `<div class="dj-row">${parts.join('')}</div>` : '';
  return `<div class="dj-fig dj-fig-scene"><div class="dj-rivers">${rivers}</div>${hand}<div class="dj-info">${esc(info.join('　'))}${dora}</div></div>`;
}

export function figureHTML(f, src) {
  if (!f) return '';
  if (f.kind === 'scene') return sceneHTML(f, src);
  if (f.kind === 'hand') return handHTML(f, src);
  if (f.kind === 'tiles') {
    const rows = f.rows.map((r) => {
      const codes = codesOf(r.tiles);
      return `<div class="dj-trow"><span class="dj-tiles">${tilesHTML(codes, src, { view: 'flat', scale: Math.min(1, scaleFor(codes.length, 'flat')) })}</span><small>${esc(r.label)}</small></div>`;
    }).join('');
    return `<div class="dj-fig dj-fig-tiles">${rows}</div>`;
  }
  if (f.kind === 'table') {
    const head = `<tr>${f.head.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>`;
    const rows = f.rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('');
    return `<div class="dj-fig dj-fig-table"><table>${head}${rows}</table></div>`;
  }
  if (f.kind === 'flow') return `<div class="dj-fig dj-fig-flow"><ol>${f.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
  throw new Error(`知らない図: ${f.kind}`);
}
