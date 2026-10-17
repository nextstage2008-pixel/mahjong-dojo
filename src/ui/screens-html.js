// 始めの画面と設定の画面の HTML。画面には触らない。
import { HEROINES, MALE_VOICES, creditLines, vvNames } from '../core/cast.js';
import { MATCH_TYPES, STANDARD_RULES, normalizeRules } from '../core/rule.js';
import { PRESET_MAX, PRESET_NAME_MAX } from './storage.js';
import { esc } from './table-html.js';
import { versionText } from './build-info.js';
import { HOME_NOTE, INAPP_NOTE } from './keep-record.js';
import { AVATARS, NAME_MAX, avatarSrc, profileOf } from '../core/profile.js';

// ルールの、標準と違う項目の言い方（対局の長さは本文で言うので入れない。段階2-3 設計書 3.3）
export function rulesNote(rules) {
  const r = normalizeRules(rules);
  const out = [];
  if (r.red !== STANDARD_RULES.red) out.push(r.red === 0 ? '赤なし' : `赤${r.red}枚`);
  if (r.kuitan !== STANDARD_RULES.kuitan) out.push('喰いタンなし');
  if (r.uma !== STANDARD_RULES.uma) out.push(r.uma === '0' ? 'ウマなし' : `ウマ${r.uma}`);
  if (r.oka !== STANDARD_RULES.oka) out.push('オカなし');
  return out.join('・');
}

// rules：設定で選んでいるルール（はじめからで打つもの）。matchType：前の呼び方（対局の長さだけ）
// canReview：前の半荘の感想戦ができるか（段階3-1）。study：問題集（段階3-3。{ due：復習の日が来た問題の数 }。なければボタンを出さない）
// dojo（段階4）：道場の記録があれば { label（級）, due（今日の復習の数）}。なくても「道場で学ぶ」は出す（はじめての人の入口）
// 公開：build（版の印。渡せば右下に出す）・update（新しい版が待っている）・safariTab（iPhone の Safari のタブで開いている）
export function titleHTML({ canResume, rules = null, matchType = 'tonnan', canReview = false, study = null, dojo = null, build = null, update = false, safariTab = false, inApp = false }) {
  const r = rules ? normalizeRules(rules) : normalizeRules(null, matchType);
  const note = rulesNote(r);
  // 知らせ・案内の1行があるときは詰める（iPhone の Safari のタブは縦が短い。最後のレビューの直し）
  const extra = update || safariTab || inApp;
  // 横の画面（画面の作り直し 段2）：左に名前・顔・級・説明、右にボタン・知らせ・版の表示
  return `<div class="title${extra ? ' has-extra' : ''}">
  <div class="t-left">
  <div class="brand">やっしーGAMES</div>
  <h1>麻雀道場</h1>
  <p class="sub">判断を磨く麻雀</p>
  ${dojo ? `<p class="dj-title-rank">道場 ${esc(dojo.label)}</p>` : ''}
  <div class="faces">${HEROINES.map((h) => `<img src="assets/chars/${h.img}_s.jpg" alt="">`).join('')}</div>
  <p class="note">CPU 3人と${MATCH_TYPES[r.length].label}を打ちます${note ? `（${esc(note)}）` : ''}。途中で閉じても、次に開けば続きから打てます。</p>
  </div>
  <div class="t-right">
  <div class="menu">
    ${canResume ? '<button class="btn primary" data-act="resume">続きから</button>' : ''}
    <button class="btn ${canResume ? '' : 'primary'}" data-act="new">はじめから</button>
    <button class="btn" data-act="dojo">道場で学ぶ${dojo && dojo.due ? `（復習${dojo.due}問）` : ''}</button>
    ${canReview ? '<button class="btn" data-act="review-last">前の半荘の感想戦</button>' : ''}
    ${study ? `<button class="btn" data-act="problems">問題集${study.due ? `（復習${study.due}問）` : ''}</button>` : ''}
    <button class="btn" data-act="settings">設定</button>
  </div>
  ${update ? '<button class="btn title-update" data-act="update">新しい版があります（押すと更新）</button>' : ''}
  ${safariTab ? `<button class="mini title-home" data-act="home-howto">${esc(HOME_NOTE)}</button>` : ''}
  ${inApp ? `<button class="mini title-home" data-act="inapp-howto">${esc(INAPP_NOTE)}</button>` : ''}
  ${build ? `<p class="title-ver">${esc(versionText(build))}</p>` : ''}
  </div>
</div>`;
}

const seg = (name, value, options) =>
  `<div class="seg" data-seg="${name}">${options.map(([v, label]) => `<button data-v="${v}" class="${v === value ? 'on' : ''}">${label}</button>`).join('')}</div>`;

// ルールの欄（段階2-3 設計書 3.2・5章）：5項目の切り替え・標準に戻す・名前を付けて保存・保存した組み合わせ（押すと呼び出し、×で消す）
function rulesHTML(rules, presets) {
  const r = normalizeRules(rules);
  const row = (label, html) => `<div class="rrow"><span class="rl">${label}</span>${html}</div>`;
  const full = presets.length >= PRESET_MAX;
  const list = presets.map((p) => `<span class="pitem"><button class="pload" data-preset="${esc(p.name)}">${esc(p.name)}</button><button class="pdel" data-preset-del="${esc(p.name)}" aria-label="${esc(p.name)}を消す">×</button></span>`).join('');
  return `<div class="box rules">
    ${row('対局の長さ', seg('rule.length', r.length, [['tonpu', '東風戦'], ['tonnan', '東南戦'], ['tohoku', '東北戦']]))}
    ${row('赤ドラ', seg('rule.red', String(r.red), [['0', 'なし'], ['3', '3枚'], ['4', '4枚']]))}
    ${row('喰いタン', seg('rule.kuitan', r.kuitan ? 'on' : 'off', [['on', 'あり'], ['off', 'なし']]))}
    ${row('ウマ', seg('rule.uma', r.uma, [['0', 'なし'], ['5-10', '5-10'], ['10-20', '10-20'], ['10-30', '10-30']]))}
    ${row('オカ', seg('rule.oka', r.oka ? 'on' : 'off', [['on', 'あり'], ['off', 'なし']]))}
    <div class="rrow"><button class="mini" data-act="rules-standard">標準に戻す</button><small>東南戦・赤3枚・喰いタンあり・ウマ10-20・オカあり</small></div>
    <div class="rrow psave"><input type="text" maxlength="${PRESET_NAME_MAX}" placeholder="名前（${PRESET_NAME_MAX}字まで）" data-preset-name><button class="mini" data-act="preset-save"${full ? ' disabled' : ''}>名前を付けて保存</button></div>
    ${list ? `<div class="plist">${list}</div>` : ''}
    ${full ? `<p class="sub">保存できるのは${PRESET_MAX}つまで。消してから保存してください</p>` : ''}
  </div>`;
}

// 設定。inGame：対局中に開いたか（戻る先の文言が変わる）
export function settingsHTML(settings, { inGame = false } = {}) {
  const voices = [['none', '声なし', '掛け声を出さない'], ...MALE_VOICES.map((v) => [v.key, v.label, vvNames(v).map((n) => 'VOICEVOX:' + n).join('＋')])];
  const rows = voices.map(([k, label, sub]) => `<label class="vrow"><input type="radio" name="maleVoice" value="${k}" ${settings.maleVoice === k ? 'checked' : ''}><span class="vn">${esc(label)}<small>${esc(sub)}</small></span>${k === 'none' ? '' : `<button class="mini" data-sample="${k}">▶</button>`}</label>`).join('');
  // 横の画面（画面の作り直し 段2）：左の列に対局中の見え方と音、右の列にルール・記録・このゲームについて
  const me = profileOf(settings);
  const meFace = me.avatar ? `<img class="pf-face" src="${avatarSrc(me.avatar, true)}" alt="">` : `<span class="pf-face pf-none">${esc(Array.from(me.name)[0])}</span>`;
  return `<div class="settings">
  <h2>設定</h2>
  <div class="s-col">
  <h3>名前とアバター</h3><p class="sub">卓の名札・カットイン・結果の画面に出す名前と絵</p>
  <div class="pf-row">${meFace}<b>${esc(me.name)}</b><button class="mini" data-act="profile">変える</button></div>
  <h3>指南の量</h3><p class="sub">考えどころで出す指南。対局の画面の上の帯のボタンでも切り替えられる</p>
  ${seg('coachLevel', settings.coachLevel, [['all', '全部'], ['hint', 'ヒント'], ['none', 'なし']])}
  <h3>局ごとの振り返り</h3><p class="sub">局の結果の画面に、この局の判断と、同じ山をお手本が打った結果を出す</p>
  ${seg('handReview', settings.handReview === false ? 'off' : 'on', [['on', '出す'], ['off', '出さない']])}
  <h3>課題の知らせ</h3><p class="sub">感想戦で決めた今日の課題の場面が来たら、帯に「課題」と出す（全部・ヒントの段）</p>
  ${seg('taskNotice', settings.taskNotice === false ? 'off' : 'on', [['on', '出す'], ['off', '出さない']])}
  <h3>自分の声</h3><p class="sub">あなたがリーチ・ロン・ツモなどをしたときの声</p>
  <div class="box">${rows}</div>
  <h3>相手のひとこと</h3><p class="sub">上がった・振り込んだ・トップ／ラスなどで相手がしゃべる量</p>
  ${seg('chatter', settings.chatter, [['many', '多め'], ['normal', 'ふつう'], ['none', 'なし']])}
  <h3>カットイン</h3><p class="sub">リーチ・ロン・ツモの瞬間に絵を大きく出す</p>
  ${seg('cutin', settings.cutin ? 'on' : 'off', [['on', '出す'], ['off', '出さない']])}
  <h3>マナーモード中の音</h3><p class="sub">iPhone はマナーモード中に音が出ません。鳴らすと、聞いている音楽は止まります</p>
  ${seg('silentPlay', settings.silentPlay ? 'on' : 'off', [['off', '鳴らさない'], ['on', '鳴らす']])}
  </div>
  <div class="s-col">
  <h3>ルール</h3><p class="sub">はじめからの対局で使う。途中の対局は始めたときのルールのまま続く。東北戦は東場の次に北場を打つ（北海道で多い打ち方）</p>
  ${rulesHTML(settings.rules, settings.presets || [])}
  <h3>問題集と成績</h3><p class="sub">溜まった問題・解いた記録・成績の推移を消す（設定と対局の途中は消えない）</p>
  <button class="mini" data-act="study-clear">問題集と成績を消す</button>
  <h3>道場</h3><p class="sub">次に道場を開くと、麻雀の経験を聞き直します（合格や途中は消えない）。記録を消すと、章の進み具合・級・今日の復習が消えます</p>
  <div class="row"><button class="mini" data-act="dojo-exp">麻雀の経験を選び直す</button><button class="mini" data-act="dojo-clear">道場の記録を消す</button></div>
  <button class="mini" data-act="about">このゲームについて</button>
  <div class="credit">声：${creditLines(settings.maleVoice).map(esc).join('／')}<br>効果音：Tスタ<br>牌の絵：FluffyStuff/riichi-mahjong-tiles（CC0）<br>麻雀の決まり：電脳麻将 majiang-core（MIT）</div>
  </div>
  <button class="btn primary s-close" data-act="close">${inGame ? '対局に戻る' : '戻る'}</button>
</div>`;
}

// 名前とアバターの札（画面の作り直し 段3）。first：はじめての対局の前（「後で決める」）か、設定から（「戻る」）か。
// 左に名前の欄と決めるボタン、右に絵の8人と「なし」。選んでいる絵に aria-pressed="true"
export function profileCardHTML({ name = '', avatar = null, first = false } = {}) {
  const pick = (key, inner, label) => `<button class="pf-av${(avatar || '') === key ? ' on' : ''}" data-av="${key}" aria-pressed="${(avatar || '') === key}" aria-label="${esc(label)}">${inner}<small>${esc(label)}</small></button>`;
  const faces = AVATARS.map((a) => pick(a.key, `<img src="${avatarSrc(a.key, true)}" alt="">`, a.label)).join('') + pick('', '<span class="pf-none">なし</span>', '絵なし');
  return `<div class="profile-layer"><div class="panel profile" role="dialog" aria-modal="true">
  <div class="pf-left">
  <h2>名前とアバター</h2>
  <p class="sub">卓の名札・カットイン・結果の画面に出します。名前は${NAME_MAX}文字まで（空なら「あなた」）。あとで設定から変えられます</p>
  <input type="text" data-pf-name maxlength="${NAME_MAX}" placeholder="あなた" aria-label="名前" value="${esc(name)}">
  <button class="btn primary" data-pf="ok">決める</button>
  ${first ? '<button class="btn" data-pf="later">後で決める</button>' : '<button class="btn" data-pf="cancel">戻る</button>'}
  </div>
  <div class="pf-right">${faces}</div>
</div></div>`;
}

// 保存できなかったときの文（一度だけ出す）
export const SAVE_FAILED = 'この端末に保存できませんでした。このまま打てますが、閉じると続きからは打てません。';

// 画面の上に少しのあいだ出す知らせ
export function noticeHTML(text) {
  return `<div class="notice" role="status">${esc(text)}</div>`;
}

// 問題集と成績を消すときの確かめ（段階3-3）
export function studyClearConfirmHTML() {
  return `<div class="confirm-layer"><div class="confirm" role="dialog" aria-modal="true">
  <p>問題集と成績を<br>消しますか？<small>溜まった問題・解いた記録・成績の推移は戻せません。</small></p>
  <div class="row"><button class="btn" data-act="study-no">やめる</button><button class="btn primary" data-act="study-yes">消す</button></div>
</div></div>`;
}

// 途中の対局があるときに「はじめから」を押したら、消してよいか確かめる
export function resetConfirmHTML() {
  return `<div class="confirm-layer"><div class="confirm" role="dialog" aria-modal="true">
  <p>途中の対局を消して、<br>はじめから打ちますか？<small>消した対局は戻せません。</small></p>
  <div class="row"><button class="btn" data-act="reset-no">やめる</button><button class="btn primary" data-act="reset-yes">消してはじめる</button></div>
</div></div>`;
}
