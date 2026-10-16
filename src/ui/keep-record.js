// スマホの記録の守り（公開の設計書 4章。ホールデム道場の段階5-1 の keep-record.js を移した）。画面にも保存先にも触れない（ブラウザの値は入口が渡す）。
// 1. 記録を消されにくくする設定（navigator.storage.persist）を頼む（iPhone・iPad か、ホーム画面から開いたときだけ）
// 2. iPhone の Safari のタブで開いているときは、タイトルに「ホーム画面に追加して遊ぶと、記録が消えにくくなります」（押すとやり方の札）
// 3. LINE などのアプリの中のブラウザで開いているときは、Safari・Chrome で開くよう案内する
// 麻雀道場には記録の書き出し・読み込みがないので、最初からホーム画面に追加して遊ぶよう案内する（ホールデムの書き出しの促しは移さない）

export const HOME_NOTE = 'ホーム画面に追加して遊ぶと、記録が消えにくくなります';
export const HOME_HOWTO = {
  title: 'ホーム画面に追加して遊ぶ',
  body: `<p>Safari のタブで遊ぶと、Safari を7日使ったのに一度もこのゲームを開かなかった場合に、記録（対局の続き・道場・問題集）が消えることがあります。ホーム画面に追加したものは、この決まりの外です。</p>
<ol><li>画面の下（iPad は上）の共有のボタン（□に↑）を押す</li><li>「ホーム画面に追加」を押す</li><li>ホーム画面のアイコンから開いて遊ぶ</li></ol>
<p>タブとホーム画面では記録が別です。最初からホーム画面に追加して遊んでください。</p>`,
};

// LINE・Instagram・Facebook などのアプリの中のブラウザか（最後のレビューの直し：友達には LINE で送る見込みが高い。
// アプリの中ではホーム画面に追加できず、記録もアプリの中の保存先に入る）
const IN_APP = new RegExp(String.raw`\bLine/|FBAN|FBAV|Instagram|MicroMessenger|KAKAOTALK`);
export const isInAppBrowser = ({ userAgent = '' } = {}) => IN_APP.test(userAgent);
export const INAPP_NOTE = 'アプリの中では記録が消えやすいので、Safari か Chrome で開いて遊んでください';
export const INAPP_HOWTO = {
  title: 'Safari・Chrome で開いて遊ぶ',
  body: `<p>LINE などのアプリの中で開いたページでは、ホーム画面に追加できず、記録もアプリの中に置かれます。</p>
<ol><li>画面の右下か右上のメニュー（︙・…）を押す</li><li>「Safari で開く」（Android は「ブラウザで開く」）を押す</li><li>開いたページで、ホーム画面に追加して遊ぶ</li></ol>`,
};

const iosOf = ({ userAgent = '', maxTouchPoints = 0 }) => /iP(hone|od|ad)/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

// iPhone・iPad の Safari のタブか（ホーム画面から開いたもの・アプリの中のブラウザは除く）。
// env：{ userAgent, maxTouchPoints, standalone（navigator.standalone）, displayStandalone（display-mode: standalone）}
export function isSafariTab({ userAgent = '', maxTouchPoints = 0, standalone = false, displayStandalone = false } = {}) {
  const safari = /Safari/.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS|GSA)\//.test(userAgent) && !IN_APP.test(userAgent);
  return iosOf({ userAgent, maxTouchPoints }) && safari && !standalone && !displayStandalone;
}

// 記録を消されにくくする設定を頼むか：iPhone・iPad か、ホーム画面から開いたときだけ（PC の Firefox で毎回聞かない。最後のレビューの直し）
export const shouldPersist = (env = {}) => iosOf(env) || !!env.standalone || !!env.displayStandalone;

// 記録を消されにくくする設定を頼む。storage：navigator.storage。返す値：認められたか（使えない・失敗は null）
export async function requestPersist(storage) {
  try {
    if (!storage || typeof storage.persist !== 'function') return null;
    return await storage.persist();
  } catch {
    return null;
  }
}
