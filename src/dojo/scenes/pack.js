// 場面の縮め方（段階4-2 作業4）：一覧のファイルを小さくするため、河の牌と打牌の並びだけを短い文字にする。
// 河の牌 { code, tsumogiri, riichi, called } → 'm2' に印を足した文字（'_' ツモ切り・'*' リーチの宣言牌・'+' 鳴かれた牌）。
// 打牌の並び { seat, n, code, tsumogiri, riichi } → 席の数字＋牌＋印（n は席ごとに数え直す）。ほかの値はそのまま。

const flagsOf = (t) => `${t.tsumogiri ? '_' : ''}${t.riichi ? '*' : ''}${t.called ? '+' : ''}`;
const tileOf = (s) => ({ code: s.slice(0, 2), tsumogiri: s.includes('_'), riichi: s.includes('*'), called: s.includes('+') });

export function packScene(scene) {
  return {
    ...scene,
    opponents: scene.opponents.map((o) => ({ ...o, river: o.river.map((t) => t.code + flagsOf(t)) })),
    discards: scene.discards ? scene.discards.map((d) => `${d.seat}${d.code}${d.tsumogiri ? '_' : ''}${d.riichi ? '*' : ''}`) : null,
  };
}

export function unpackScene(packed) {
  const count = [0, 0, 0, 0];
  return {
    ...packed,
    opponents: packed.opponents.map((o) => ({ ...o, river: o.river.map(tileOf) })),
    discards: packed.discards
      ? packed.discards.map((s) => {
        const seat = +s[0];
        return { seat, n: count[seat]++, code: s.slice(1, 3), tsumogiri: s.includes('_'), riichi: s.includes('*') };
      })
      : null,
  };
}
