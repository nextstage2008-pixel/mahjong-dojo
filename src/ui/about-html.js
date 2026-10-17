// 「このゲームについて」の画面（公開の設計書 4章）：お金を賭けないこと・記録のこと・素材の出どころ・権利と版の印
import { esc } from './table-html.js';
import { versionText } from './build-info.js';
import { HEROINES, MALE_VOICES, vvNames } from '../core/cast.js';

// 声の素材の表記（対局相手と自分の声。同じキャラは1回）
export const voiceCredits = () => [...new Set([...HEROINES.map((h) => h.vv), ...MALE_VOICES.flatMap(vvNames)])].map((n) => `VOICEVOX:${n}`);

export function aboutHTML(build) {
  return `<div class="settings-layer about-layer"><div class="panel about">
  <h2>このゲームについて</h2>
  <h3>お金を賭けません</h3>
  <p>点数はゲームの中だけのものです。換金や景品はありません。賭け麻雀とは関係がなく、勧めもしません。</p>
  <h3>記録のこと</h3>
  <p>対局の続き・道場・問題集の記録は、この端末のブラウザの中だけに置きます。どこにも送りません。</p>
  <h3>素材</h3>
  <ul class="about-credits">
    <li>声：${voiceCredits().map(esc).join('／')}</li>
    <li>効果音：Tスタ</li>
    <li>牌の絵：FluffyStuff/riichi-mahjong-tiles（CC0）</li>
    <li>麻雀の決まり：電脳麻将 majiang-core（MIT）</li>
    <li>キャラ・自分のアバター・卓の絵：Gemini で作成（やっしーGAMES のオリジナル）</li>
  </ul>
  <p class="sub">声と効果音のファイルは、プログラムのライセンスの対象外です。VOICEVOX と各キャラ・各配布元の利用規約に従います。素材として取り出して使わないでください。</p>
  <h3>権利</h3>
  <p>© やっしーGAMES　すべての権利を留保します。${esc(versionText(build))}</p>
  <button class="btn primary" data-act="about-close">戻る</button>
</div></div>`;
}
