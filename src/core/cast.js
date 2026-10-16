// 登場人物（設計書 10章）。対局相手の女性7人と、自分の声（男性8種）。
import { createRng, deriveSeed } from './rng.js';

// key は声と絵のファイル名に使う（assets/voice/<key>/…、assets/chars/<img>.webp）。最初に当てた声の名前のままだが、
// 途中の保存に残るので変えない。vv：いま当てている VOICEVOX の声（話し方の種類は scripts/make-voices.py）。
// 2026-10-08 に7人とも大人の女性として描き直し、公式キャラが大人の設定の声に替えた（リサーチノート
// 「2026-10-08_VOICEVOXの声の規約と公式キャラの年齢」）。波音リツと WhiteCUL は話し方を変えて2人ずつに当てる。
// style：CPU の型（段階2-3 設計書 2.4。core/styles.js の STYLES の名前）。性格に合わせた
export const HEROINES = [
  { key: 'metan', name: '白鷺 綾乃', kana: 'しらさぎ あやの', persona: 'お嬢様。強気で上品', img: 'chr_1_ojousama', vv: '東北イタコ', style: 'attack' },
  { key: 'sora', name: '東雲 遥', kana: 'しののめ はるか', persona: '大人のお姉さん。余裕のある落ち着き', img: 'chr_2_onesan', vv: 'WhiteCUL', style: 'model' },
  { key: 'himari', name: '西園寺 朔', kana: 'さいおんじ さく', persona: 'ミステリアス。静かで短い', img: 'chr_3_mystery', vv: '冥鳴ひまり', style: 'defense' },
  { key: 'tsumugi', name: '南 ひなた', kana: 'みなみ ひなた', persona: '元気なギャル。勢いよく', img: 'chr_4_gal', vv: '雨晴はう', style: 'caller' },
  { key: 'zunko', name: '中野 真琴', kana: 'なかの まこと', persona: '正統派。まっすぐで聞き取りやすい', img: 'chr_5_seitou', vv: '波音リツ', style: 'model' },
  { key: 'ritsu', name: '北条 紅羽', kana: 'ほうじょう くれは', persona: '女王様。強気で挑発的', img: 'chr_6_queen', vv: '波音リツ', style: 'attack' },
  { key: 'zunda', name: 'リンシャン', kana: 'りんしゃん', persona: '大人の牌の妖精。にぎやかで甘め', img: 'chr_7_fairy', vv: 'WhiteCUL', style: 'caller' },
];

// 自分の声（設定の並びは高い声が上）
export const MALE_VOICES = [
  { key: 'aru', label: '少年っぽい声', vv: '猫使アル' },
  { key: 'kigashima', label: '高めではきはき', vv: '麒ヶ島宗麟' },
  { key: 'suzumatsu', label: '明るい青年', vv: '雀松朱司' },
  { key: 'kurosawa', label: 'クールな青年', vv: '黒沢冴白' },
  { key: 'kurono', label: '落ち着いた青年', vv: '玄野武宏' },
  { key: 'kenzaki', label: '低めで穏やかな声', vv: '剣崎雌雄' },
  { key: 'rito', label: '低く落ち着いた声', vv: '離途' },
  { key: 'ritoS', label: '重厚な低音', vv: '離途' },
];

export function heroine(key) {
  return HEROINES.find((h) => h.key === key) || null;
}

// キャラの CPU の型（知らないキャラはお手本）
export function styleOf(key) {
  const h = heroine(key);
  return h && h.style ? h.style : 'model';
}

// 席ごとの型（段階3-6。読みの押しの気配に使う）：席 l の打ち手 board.player_id[l] が 0（人）なら null、ほかはそのキャラの型
export function seatStyles(board, cast) {
  return [0, 1, 2, 3].map((l) => {
    const id = board.player_id[l];
    return id === 0 ? null : styleOf(cast[id - 1]);
  });
}

export function maleVoice(key) {
  return MALE_VOICES.find((v) => v.key === key) || null;
}

// 対局の種から、相手の3人を選ぶ（7人から重ならずに3人）
export function pickCast(seed) {
  const rng = createRng(deriveSeed(seed, 0xca57));
  const keys = HEROINES.map((h) => h.key);
  const out = [];
  while (out.length < 3) {
    const i = Math.floor(rng() * keys.length);
    out.push(keys.splice(i, 1)[0]);
  }
  return out;
}

// 画面のクレジットに出す、使っている声の出どころ（VOICEVOX は1人ずつ書く決まり。2人に当てた声も1回だけ）
export function creditLines(maleKey) {
  const names = [...new Set(HEROINES.map((h) => h.vv))];
  const m = maleVoice(maleKey);
  if (m && !names.includes(m.vv)) names.push(m.vv);
  return names.map((n) => 'VOICEVOX:' + n);
}
