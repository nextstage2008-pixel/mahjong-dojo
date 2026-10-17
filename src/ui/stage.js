// 画面の土台（画面の作り直しの設計書 4章）：論理の画面の大きさと、窓に合わせる倍率。画面には触らない（main.js が #stage に当てる）。
// 段2から全部の画面が横（縦の画面の作りはない）

// 論理の画面。横は Safari のタブ（横持ちの窓 約750×330）とノッチの余白で縮めても、目安を割らない大きさ
export const LAND = { w: 760, h: 340 };

// 大きさの目安（設計書 2章）と、論理の画面での大きさ（手牌の幅・手前の席の河の牌の幅・ボタンの高さ）
export const MIN_PX = { hand: 36, river: 18, button: 36 };
export const LAND_SIZES = { hand: 40, river: 21, button: 40 };

// 横の画面の合わせ方：窓から安全な余白（ノッチ・ホームの印）を引いた内側に、760×340 が収まる倍率で真ん中に置く。
// 返すもの：{ scale, left, top }（論理の画面の左上の、窓の中の位置）
export function landLayout(w, h, inset = { left: 0, right: 0, top: 0, bottom: 0 }) {
  const iw = w - inset.left - inset.right;
  const ih = h - inset.top - inset.bottom;
  const scale = Math.min(iw / LAND.w, ih / LAND.h);
  return { scale, left: inset.left + (iw - LAND.w * scale) / 2, top: inset.top + (ih - LAND.h * scale) / 2 };
}

// 窓が縦長か（横の画面を開いていたら「横にしてください」の案内を出す）
export const isPortraitWindow = (w, h) => h > w;
