// 牌の絵（設計書 8章）。絵柄は FluffyStuff/riichi-mahjong-tiles（CC0）。
// その上に、彫って色を入れた絵柄・面取り・象牙色のつや・二層の厚み（白と朱）を SVG で描く。
// 牌1種類×向き1つごとに、そのまま <img> で表示できる完結した SVG を作る（画面ではこれを一度だけ作って使い回す）。

// 34種＋赤5（m0・p0・s0）
export const TILE_CODES = [];
for (const s of ['m', 'p', 's']) {
  for (let n = 1; n <= 9; n++) TILE_CODES.push(s + n);
  TILE_CODES.push(s + '0');
}
for (let n = 1; n <= 7; n++) TILE_CODES.push('z' + n);

const SUIT = { m: 'Man', p: 'Pin', s: 'Sou' };
const HONOR = ['Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun'];

// 牌の書き方（'m0'・'p5'・'z7'）から、絵柄のファイル名（拡張子なし）
export function symbolName(code) {
  const s = code[0];
  const n = +code[1];
  if (s === 'z') return HONOR[n - 1];
  return SUIT[s] + (n === 0 ? '5-Dora' : n);
}

// 向きごとの大きさ（画面の論理ピクセル）と、SVG の座標の広さ
export const TILE_VIEWS = {
  hand: { w: 26, h: 43, vb: [52, 86] }, // 自分の手牌（立っている）
  flat: { w: 21, h: 31, vb: [42, 62] }, // 河・副露・ドラ（寝ている）
  side: { w: 26, h: 26, vb: [52, 52] }, // リーチの横向き・鳴いた牌
  back: { w: 12, h: 17, vb: [24, 34] }, // 対面の伏せた手
  backSide: { w: 17, h: 11, vb: [34, 24] }, // 上家・下家の伏せた手
};

const DEFS = `<defs>
<radialGradient id="f" cx="34%" cy="20%" r="95%"><stop offset="0" stop-color="#fffefb"/><stop offset=".42" stop-color="#fbf6eb"/><stop offset=".78" stop-color="#f0e7d4"/><stop offset="1" stop-color="#e0d3b8"/></radialGradient>
<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#8c6f45" stop-opacity=".45"/></linearGradient>
<linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e7a06a"/><stop offset=".45" stop-color="#b4521d"/><stop offset="1" stop-color="#5e2208"/></linearGradient>
<linearGradient id="kh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5e2208"/><stop offset=".5" stop-color="#b4521d"/><stop offset="1" stop-color="#e7a06a"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ddd0b4"/></linearGradient>
<linearGradient id="th" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ddd0b4"/><stop offset="1" stop-color="#fffaf0"/></linearGradient>
<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecdb"/><stop offset="1" stop-color="#d2c3a4"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".24" stop-color="#fff" stop-opacity=".16"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#6b5330" stop-opacity="0"/><stop offset="1" stop-color="#6b5330" stop-opacity=".12"/></linearGradient>
<filter id="e" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur in="SourceAlpha" stdDeviation=".55" result="b"/><feOffset in="b" dx=".8" dy="1.15" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="i"/><feFlood flood-color="#1a0d00" flood-opacity=".55"/><feComposite in2="i" operator="in" result="s"/><feOffset in="SourceAlpha" dx="0" dy=".9" result="l"/><feComposite in="l" in2="SourceAlpha" operator="out" result="p"/><feFlood flood-color="#fff" flood-opacity=".95"/><feComposite in2="p" operator="in" result="h"/><feMerge><feMergeNode in="h"/><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge></filter>
</defs>`;

const img = (href, x, y, w, h) => `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;

const BODY = {
  hand: (sym) => `<rect x="1" y=".5" width="50" height="17" rx="7.5" fill="url(#k)"/><rect x="6" y="1.7" width="40" height="2.2" rx="1.1" fill="#fff" opacity=".5"/><rect x="1" y="7.5" width="50" height="10" rx="5" fill="url(#t)"/><rect x=".5" y="11" width="51" height="74.5" rx="6.5" fill="url(#f)" stroke="#8a7350" stroke-opacity=".55"/><rect x="1.8" y="12.3" width="48.4" height="71.9" rx="5.6" fill="none" stroke="url(#v)" stroke-width="1.6"/><g filter="url(#e)">${img(sym, 2.5, 16.6, 47, 63)}</g><rect x=".5" y="11" width="51" height="74.5" rx="6.5" fill="url(#g)"/>`,
  flat: (sym) => `<rect x=".5" y="38" width="41" height="23.5" rx="5" fill="url(#k)"/><rect x="3" y="58.6" width="36" height="1.6" rx=".8" fill="#fff" opacity=".35"/><rect x=".5" y="36" width="41" height="19" rx="5" fill="url(#d)"/><rect x=".5" y=".5" width="41" height="51" rx="5" fill="url(#f)" stroke="#8a7350" stroke-opacity=".5"/><rect x="1.7" y="1.7" width="38.6" height="48.6" rx="4.2" fill="none" stroke="url(#v)" stroke-width="1.4"/><g filter="url(#e)">${img(sym, 3, 3.5, 36, 45)}</g><rect x=".5" y=".5" width="41" height="51" rx="5" fill="url(#g)"/>`,
  side: (sym) => `<rect x=".5" y="28" width="51" height="23.5" rx="5" fill="url(#k)"/><rect x=".5" y="26" width="51" height="19" rx="5" fill="url(#d)"/><rect x=".5" y=".5" width="51" height="41" rx="5" fill="url(#f)" stroke="#8a7350" stroke-opacity=".5"/><rect x="1.7" y="1.7" width="48.6" height="38.6" rx="4.2" fill="none" stroke="url(#v)" stroke-width="1.4"/><g filter="url(#e)"><g transform="rotate(-90 26 21)">${img(sym, 8, -2, 36, 46)}</g></g><rect x=".5" y=".5" width="51" height="41" rx="5" fill="url(#g)"/>`,
  back: () => `<rect x=".5" y=".5" width="23" height="10" rx="4" fill="url(#t)"/><rect x=".5" y="3.5" width="23" height="30" rx="3.5" fill="url(#k)"/><rect x="3" y="5" width="18" height="1.6" rx=".8" fill="#fff" opacity=".5"/><rect x=".5" y="3.5" width="23" height="30" rx="3.5" fill="url(#g)" opacity=".7"/>`,
  backSide: () => `<rect x="23.5" y=".5" width="10" height="23" rx="4" fill="url(#th)"/><rect x=".5" y=".5" width="30" height="23" rx="3.5" fill="url(#kh)"/><rect x="27.2" y="3" width="1.6" height="18" rx=".8" fill="#fff" opacity=".5"/><rect x=".5" y=".5" width="30" height="23" rx="3.5" fill="url(#g)" opacity=".6"/>`,
};

// 完結した SVG の文字列。symbolHref は絵柄の SVG（data URI など）。伏せた牌では使わない
export function tileSVG(view, symbolHref = '') {
  const v = TILE_VIEWS[view];
  if (!v) throw new Error('unknown tile view: ' + view);
  const [vw, vh] = v.vb;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${v.w * 2}" height="${v.h * 2}">${DEFS}${BODY[view](symbolHref)}</svg>`;
}

// 文字列を base64 の data URI にする（絵柄の SVG を牌の SVG に埋め込むため）
export function svgDataUri(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'data:image/svg+xml;base64,' + btoa(bin);
}

// 画面用：37種の絵柄を読み込み、src(code, view) で <img> に渡す URL を返す（一度作ったら使い回す）
export async function loadTileArt(baseUrl = 'assets/tiles/') {
  const symbols = {};
  await Promise.all(TILE_CODES.map(async (code) => {
    const res = await fetch(baseUrl + symbolName(code) + '.svg');
    symbols[code] = svgDataUri(await res.text());
  }));
  const cache = new Map();
  return {
    src(code, view) {
      const back = view === 'back' || view === 'backSide';
      const key = back ? view : code + '|' + view;
      if (!cache.has(key)) {
        const svg = tileSVG(view, back ? '' : symbols[code]);
        cache.set(key, URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
      }
      return cache.get(key);
    },
  };
}
