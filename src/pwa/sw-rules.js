// service worker の決まりごと（設計書 段階5-2 第3-3節）。画面にも置き場にも触れない。
// テストはこのまま読み込み、公開用のファイルを作る道具（scripts/lib/sw-build.mjs）は export を外して sw.js の中に写す。
// そのため、ここには import を書かず、export const と export function だけを置く。

// 置き場の名前は必ずこれで始める（同じ住所に出すホールデム道場の holdem-dojo- の置き場と分けるため。消すのも自分のものだけ）
export const CACHE_PREFIX = 'mahjong-dojo-';
// 本体の置き場は版の印ごと、声の置き場は声の一覧の印ごと
export const appCacheName = (build) => `${CACHE_PREFIX}app-${build.version}-${build.commit}`;
export const voiceCacheName = (key) => `${CACHE_PREFIX}voice-${key}`;

// 消してよい置き場：自分の置き場のうち、いまの置き場（keep）でないものだけ
export function staleCaches(names, keep) {
  return names.filter((n) => n.startsWith(CACHE_PREFIX) && !keep.includes(n));
}

// 住所をどう返すか。scope：service worker の受け持つ住所（/ で終わる）、appFiles：本体のファイルの一覧（scope からの相対）
// 返す値：{ kind: 'app'（本体）|'voice'（声）|'pass'（触らない）, path（scope からの相対・住所の根は index.html）}
export function routeOf(url, scope, appFiles) {
  if (!url.startsWith(scope)) return { kind: 'pass', path: null };
  const path = decodeURIComponent(url.slice(scope.length).split(/[?#]/)[0]) || 'index.html';
  if (path.startsWith('assets/voice/') && path.endsWith('.mp3')) return { kind: 'voice', path };
  if (appFiles.includes(path)) return { kind: 'app', path };
  return { kind: 'pass', path };
}

// 声を裏で少しずつ取る：動き出して WARM_DELAY_MS たったら、まだ置き場にない声を WARM_BATCH 個ずつ、WARM_GAP_MS あけて取る。
// 続けて WARM_MAX_FAILS 組とも全部失敗したら（電波がない）やめて、次に開いたときに続ける。
// 頼むのは画面（1組ずつ。返事が来たら WARM_GAP_MS あけて次）。service worker は1回の頼みで1組だけ取って返事をする
// （1回の仕事を短くする。長い仕事を抱えた古い版は、新しい版への切り替えを待たせ、ブラウザに打ち切られることもあるため）
export const WARM_DELAY_MS = 30000;
export const WARM_BATCH = 3;
export const WARM_GAP_MS = 1500;
export const WARM_MAX_FAILS = 3;
export const WARM_TIMEOUT_MS = 10000; // 1つの声を取るのを待つ長さ
// 次に取る1組：まだ置き場にない声の先頭から batch 個
export const warmBatch = (voices, cached, batch = WARM_BATCH) => voices.filter((v) => !cached.has(v)).slice(0, batch);
// 返事 { got（取れた数）, left（まだの数）} と、これまで続けて全部失敗した組の数から、次を頼むか。返す値：{ fails, next }
export function warmNext({ got, left }, fails) {
  const f = got > 0 ? 0 : fails + 1;
  return { fails: f, next: left > 0 && f < WARM_MAX_FAILS };
}
