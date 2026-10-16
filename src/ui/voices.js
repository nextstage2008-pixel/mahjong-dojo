// 声の選び方（設計書 10章）。画面には触らない。
// manifest（assets/voice/manifest.json）に、キャラと場面ごとの言い回しの数が書いてある。
// 同じ言い回しが続かないよう順に使い、始める位置だけ乱数でずらす。

// 一言（始め・上がり・振り込み・ツモられ・トップ・ラス）を言う割合
export const CHATTER_RATE = { many: 1, normal: 0.5, none: 0 };

export function createVoiceBook(manifest, rng = Math.random) {
  const next = new Map();
  const pick = (dir, counts, key, scene) => {
    const n = counts && counts[key] && counts[key][scene];
    if (!n) return null;
    const k = dir + key + '|' + scene;
    const i = next.has(k) ? next.get(k) : Math.floor(rng() * n);
    next.set(k, (i + 1) % n);
    return `assets/voice/${dir}${key}/${scene}_${i + 1}.mp3`;
  };
  return {
    heroine: (key, scene) => pick('', manifest.heroines, key, scene),
    male: (key, scene) => pick('male/', manifest.male, key, scene),
  };
}

// 知らせ（部品の牌譜の1件）から、言う掛け声。言わない知らせは null
export function callOf(update) {
  if (update.dapai) return update.dapai.p.includes('*') ? { l: update.dapai.l, scene: 'riichi' } : null;
  if (update.fulou) {
    const d = update.fulou.m.slice(1).replace(/[^\d]/g, '').replace(/0/g, '5');
    const scene = d.length === 4 ? 'kan' : d[0] === d[1] ? 'pon' : 'chi';
    return { l: update.fulou.l, scene };
  }
  if (update.gang) return { l: update.gang.l, scene: 'kan' };
  if (update.hule) return { l: update.hule.l, scene: update.hule.baojia == null ? 'tsumo' : 'ron' };
  return null;
}

// 上がりのあとの一言：上がった人「上がり」、振り込んだ人「振り込み」、ツモなら親（いなければ次の人）が「ツモられ」
export function huleChatter(hule) {
  const out = [{ l: hule.l, scene: 'win' }];
  if (hule.baojia != null) out.push({ l: hule.baojia, scene: 'dealin' });
  else out.push({ l: hule.l === 0 ? 1 : 0, scene: 'tsumoed' });
  return out;
}

// 流局の掛け声：荒牌平局のときだけ、東家から順にテンパイ／ノーテン
export function pingjuCalls(pingju) {
  if (pingju.name !== '荒牌平局') return [];
  return pingju.shoupai.map((s, l) => ({ l, scene: s ? 'tenpai' : 'noten' }));
}

// 終局の一言：トップとラス（id で返す）
export function jiejuChatter(paipu) {
  const top = paipu.rank.indexOf(1);
  const last = paipu.rank.indexOf(4);
  return [{ id: top, scene: 'top' }, { id: last, scene: 'last' }];
}

// 一言を言うかどうか（設定の量と乱数で決める）
export function shouldChat(setting, rng = Math.random) {
  const rate = CHATTER_RATE[setting] ?? CHATTER_RATE.normal;
  return rate > 0 && rng() < rate;
}
