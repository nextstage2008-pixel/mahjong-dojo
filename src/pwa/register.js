// 公開版の index.html だけが読む（開発用の場所では service worker を動かさない。設計書 段階5-2 第2節）。
// main.js より先に読み、window.__mahjongPWA に窓口を置く（main.js がタイトルの画面で新しい版の知らせに使う）
import { createPWA } from './pwa-client.js';

const pwa = createPWA({ sw: navigator.serviceWorker ?? null, reload: () => location.reload() });
window.__mahjongPWA = pwa;
pwa.start().catch((e) => console.warn('service worker を登録できませんでした', e));
