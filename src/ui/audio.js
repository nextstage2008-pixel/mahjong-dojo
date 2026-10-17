// 音（設計書 9章）。打牌・ツモ・リーチ棒は Tスタの録音、声は VOICEVOX の mp3。
// ブラウザの決まりで、最初に画面に触れるまでは鳴らせない。触れたとき（unlock）に準備し、それまでは鳴らさない。
// 読み込んだ音は使い回す。
// 打牌は「牌を置く1〜4」を順に使い、毎回わずかに高さと大きさを揺らす。

const jitter = (a) => 1 + (Math.random() * 2 - 1) * a;

export function createAudio() {
  let ctx = null;
  const cache = new Map();
  let put = 0;

  // create：触れたときだけ true（音の準備を始める）
  function ensure(create = false) {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C || !create) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended' && create) ctx.resume();
    return ctx;
  }

  function buffer(url) {
    const c = ensure();
    if (!c) return Promise.resolve(null);
    if (!cache.has(url)) cache.set(url, fetch(url).then((r) => r.arrayBuffer()).then((ab) => c.decodeAudioData(ab)).catch(() => null));
    return cache.get(url);
  }

  // 鳴らし終わったら解決する Promise を返す（鳴らせないときもすぐ解決する）
  async function play(url, { gain = 1, rate = 1 } = {}) {
    if (!url) return;
    const c = ensure();
    if (!c) return;
    const b = await buffer(url);
    if (!b) return;
    const s = c.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    s.connect(g);
    g.connect(c.destination);
    // 鳴り終わりの知らせが来ない（裏に回った等）ときも、音の長さ＋0.5秒で先へ進める
    const done = new Promise((res) => {
      s.onended = res;
      setTimeout(res, (b.duration / rate) * 1000 + 500);
    });
    s.start();
    return done;
  }

  const nextPut = () => { put = (put % 4) + 1; return `assets/sfx/put${put}.mp3`; };

  return {
    unlock: () => { ensure(true); },
    play,
    // mine：自分の打牌は少し強く（先生のご要望「打感良く」）
    discard: (strong, mine = false) => play(nextPut(), { gain: (strong || mine ? 1 : 0.85) * jitter(0.08), rate: (strong ? 0.96 : 1) * jitter(0.02) }),
    tsumo: () => play(nextPut(), { gain: 0.32 * jitter(0.08), rate: 1.06 * jitter(0.02) }),
    tick: () => play(nextPut(), { gain: 0.12, rate: 1.25 }),
    // 手牌をなぞったときの軽い「カラッ」（牌の音を高く小さく。続けて鳴ると「からからから」）
    trace: () => play(nextPut(), { gain: 0.14 * jitter(0.1), rate: 1.6 * jitter(0.06) }),
    // 切った瞬間（指が触れた瞬間）の軽い「カッ」
    press: () => play(nextPut(), { gain: 0.3, rate: 1.35 }),
    stick: () => play(`assets/sfx/bou${1 + Math.floor(Math.random() * 3)}.mp3`, { gain: 0.8 }),
    shuffle: () => play('assets/sfx/mix1.mp3', { gain: 0.6 }),
    // iPhone のマナーモード中も鳴らすか（対応していないブラウザでは何もしない）
    setSilentPlay(on) {
      try {
        if (navigator.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto';
      } catch { /* 対応していない */ }
    },
  };
}

// 振動（Android だけ。iPhone の Safari は振動に対応していない）。
// 一度も画面に触れていないうちはブラウザが止めるので、呼ばない
export function vibrate(pattern) {
  try {
    if (!navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch { /* 対応していない */ }
}

// 音を鳴らせるようにする操作。Android のタッチは押した瞬間（pointerdown）を利用者の操作と数えないので、
// 離したとき・クリック・キーでも準備する（準備ずみなら何もしない）
export const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
export function bindUnlock(target, audio) {
  for (const ev of UNLOCK_EVENTS) target.addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
}
