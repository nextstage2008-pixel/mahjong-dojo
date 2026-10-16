// 講義と問題の図の HTML（段階4-1 作業6）。図の形は src/dojo/lectures/chapters.js の先頭の説明のとおり。
// src(code, view)：牌の絵の URL。縦持ち（横幅 390px）でも1行に収まるよう、牌の数に合わせて小さくする
import { tileHTML, esc } from './table-html.js';
import { codesOf } from '../dojo/questions/util.js';
import { TILE_VIEWS } from './tile-art.js';

const WIND = ['東', '南', '西', '北'];
// 1行に並べられる幅（390px から余白を引いた幅）
const ROW_W = 330;
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

export function figureHTML(f, src) {
  if (!f) return '';
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
