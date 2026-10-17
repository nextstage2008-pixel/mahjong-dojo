// 自分の名前とアバター（画面の作り直しの設計書 8章）。voice：絵を選んだときの自分の声（MALE_VOICES の key）。絵は assets/avatars/<key>.webp（大・カットイン）と <key>_s.jpg（小・名札）。
// 並びは頼み方の文（docs/superpowers/specs/2026-10-17-mahjong-dojo-landscape/avatar-prompts.md）の表の順

export const AVATARS = [
  { key: 'av_m1_kaishain', label: '会社員', gender: 'm', voice: 'kurono' },
  { key: 'av_m2_shinshi', label: '紳士', gender: 'm', voice: 'rito' },
  { key: 'av_m3_wakate', label: '若手', gender: 'm', voice: 'suzumatsu' },
  { key: 'av_m4_shoubushi', label: '勝負師', gender: 'm', voice: 'kurosawa' },
  { key: 'av_f1_sporty', label: 'スポーティ', gender: 'f', voice: 'fSporty' },
  { key: 'av_f2_megane', label: '眼鏡', gender: 'f', voice: 'fMegane' },
  { key: 'av_f3_kimono', label: '着物', gender: 'f', voice: 'fKimono' },
  { key: 'av_f4_cool', label: 'クール', gender: 'f', voice: 'fCool' },
];

export const NAME_MAX = 10;
const DEFAULT_NAME = 'あなた';

const isAvatar = (key) => AVATARS.some((a) => a.key === key);

// 名前：前後の空白を除き、10文字まで（文字の数は Array.from で数える）。文字列でない・長すぎるなら空
export function normalizeName(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  return Array.from(s).length <= NAME_MAX ? s : '';
}

// 設定から、画面に出す名前（空なら「あなた」）とアバター（一覧にない絵なら null）
export function profileOf(settings) {
  const name = normalizeName(settings && settings.playerName);
  const avatar = settings && isAvatar(settings.avatar) ? settings.avatar : null;
  return { name: name || DEFAULT_NAME, avatar };
}

// 絵の住所。small なら名札用の小さい絵。一覧にない絵なら null
export function avatarSrc(key, small = false) {
  if (!isAvatar(key)) return null;
  return `assets/avatars/${key}${small ? '_s.jpg' : '.webp'}`;
}

// 絵を選ぶと声も決まる（画面の作り直し 段3。2026-10-17 先生）：その人の自分の声（MALE_VOICES の key）。一覧にない絵なら null
export const voiceOfAvatar = (key) => (AVATARS.find((a) => a.key === key) || {}).voice || null;

// 名前とアバターの札で「決める」を押したときに保存するもの（段3 最後のレビューの直し）。input：名前の欄の文字。
// avatar：選んだ絵（なしは null）。before：札を開いたときの絵。
// 名前は10文字に切る（日本語入力では欄の文字の数の上限を超えることがあり、黙って「あなた」にしないため）。
// 声は絵を変えたときだけその人の声にする（名前だけ直したときに、自分で選んだ声〔声なしも〕を戻さない）
export function profilePatch({ input, avatar, before }) {
  const name = normalizeName(Array.from(typeof input === 'string' ? input.trim() : '').slice(0, NAME_MAX).join(''));
  const a = normalizeAvatar(avatar);
  return { playerName: name, avatar: a, profileAsked: true, ...(a && a !== before ? { maleVoice: voiceOfAvatar(a) } : {}) };
}

// 設定の読み込みの直しで使う：一覧にある絵ならその名前、なければ null
export const normalizeAvatar = (key) => (isAvatar(key) ? key : null);
