// 公開版だけで使う：service worker を登録し、新しい版が待っているかを画面に教える（設計書 段階5-2 第3-4節）。
// 画面には触れない（窓口 sw＝navigator.serviceWorker・読み直し reload・時間をおいて呼ぶ later を受け取る）。
// 新しい版は、前の版が動いているときに待ちに入ったものだけを知らせる（はじめて入れたときは知らせない）。
// 押されたら（apply）待っている版に切り替えを頼み、受け持ちが替わったら1回だけ読み直す。
// 声を裏で少しずつ取る：動き出してしばらくしたら、service worker に1組ずつ頼む（返事が来たら間をあけて次。やめどきは sw-rules.js の warmNext）
import { WARM_DELAY_MS, WARM_GAP_MS, warmNext } from './sw-rules.js';

export function createPWA({ sw, reload, later = (fn, ms) => setTimeout(fn, ms), warmDelay = WARM_DELAY_MS, warmGap = WARM_GAP_MS }) {
  let reg = null;
  let waiting = null;
  let applying = false;
  let reloaded = false;
  let fails = 0;
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } };
  const wait = (w) => {
    if (!w || !sw.controller) return;
    waiting = w;
    notify();
  };
  // 押したあとは頼まない（古い版に仕事を足して、新しい版への切り替えを待たせない）
  const warm = () => { if (!applying) (sw.controller ?? reg.active)?.postMessage({ type: 'warm-voices' }); };
  return {
    async start() {
      if (!sw) return;
      reg = await sw.register('./sw.js', { scope: './' });
      wait(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const n = reg.installing;
        if (n) n.addEventListener('statechange', () => { if (n.state === 'installed') wait(n); });
      });
      sw.addEventListener('controllerchange', () => {
        if (!applying || reloaded) return;
        reloaded = true;
        reload();
      });
      sw.addEventListener('message', (e) => {
        if (e.data?.type !== 'warm-voices' || applying) return;
        const n = warmNext(e.data, fails);
        fails = n.fails;
        if (n.next) later(warm, warmGap);
      });
      sw.startMessages?.();
      later(warm, warmDelay);
    },
    hasUpdate: () => !!waiting,
    // 新しい版を見に行く（タイトルの画面を開いたとき）
    check() { if (reg) reg.update().catch(() => {}); },
    apply() {
      if (!waiting) return;
      applying = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
