// CPU の打ち手。部品の Player に、ai.js（何切る・リーチ）と styles.js（型ごとの押し引き・鳴き。段階2-3）の選び方をつなぐだけ。
// 返事はすぐ返す。
import Majiang from '../../vendor/majiang-core.js';
import { visibleCounts, chooseRiichi, doraKinds, damaValue, tenpaiShape, kindOf } from './ai.js';
import { STYLES, chooseStyleDapai, chooseStyleCall, shouldDama, directionAfterCall, currentDirection } from './styles.js';
import { riichiOf, isLastHand } from '../coach/scene.js';

// 他家が出した牌に、自分から見た向き（+ 下家・= 対面・- 上家）を付ける
export function withDirection(p, from, menfeng) {
  return p.slice(0, 2) + '_+=-'[(4 + from - menfeng) % 4];
}

// 手の中の牌の種類ごとの枚数（赤5は5として数える。危なさの表で字牌の「卓に見えている枚数」から自分の分を引くのに使う）
function ownCounts(sp) {
  const c = {};
  for (const s of ['m', 'p', 's', 'z']) {
    const b = sp._bingpai[s];
    for (let n = 1; n < b.length; n++) if (b[n]) c[s + n] = b[n];
  }
  return c;
}

export class CpuPlayer extends Majiang.Player {
  // style：型の名前（styles.js の STYLES。既定はお手本）。
  // human：人らしく打つか（段階3-4。ダマ・染め手・対々和）。採点の物差しのお手本（同じ山・指南の通しの試験）は false で作る
  constructor(style = 'model', { human = true } = {}) {
    super();
    this._style = style;
    this._human = human;
  }

  get style() { return this._style; }
  get human() { return this._human; }

  // 点数の材料（ダマの値・聴牌の役）
  _at() {
    return { zhuangfeng: this._model.zhuangfeng, menfeng: this._menfeng, baopai: this._model.shan.baopai, rule: this._rule };
  }

  // その牌を切って聴牌したらダマにするか（人らしいときだけ。段階3-4 設計書 3章・段階3-6 設計書 4章）。
  // threats：リーチの人。counts：見えている枚数（待ちの残りと良い待ちに変わるツモを数える）
  _damaOf(sp, threats = [], counts = {}) {
    if (!this._human) return null;
    const m = this._model;
    const mine = m.defen[m.player_id[this._menfeng]];
    const lastTop = isLastHand(m, this._rule) && [0, 1, 2, 3].every((l) => m.defen[m.player_id[l]] <= mine);
    const base = { turn: m.he[this._menfeng]._pai.length + 1, dealer: this._menfeng === 0, threatened: threats.length > 0, lastTop };
    const at = this._at();
    return (option) => {
      const shape = tenpaiShape(sp, option, counts);
      return shouldDama(this._style, damaValue(sp, option, at), { ...base, left: shape.left, betterOf: shape.betterOf });
    };
  }

  // 人らしいときの打牌の選び方の材料（段階3-6 設計書 5章・6章）：安全牌を残すか・自分の河（引っ掛け）・打牌ごとのダマの値
  _humanPick(sp) {
    if (!this._human) return {};
    const st = STYLES[this._style] || STYLES.model;
    const at = this._at();
    return {
      keepSafe: !!st.keepSafe,
      ownRiver: st.hikkake ? new Set(this._model.he[this._menfeng]._pai.map(kindOf)) : null,
      valueFor: (option) => damaValue(sp, option, at),
    };
  }

  // 局の始まり：覚えている手役の方向を消す。自分の鳴き：鳴いたときの方向を覚える（人らしいときだけ。段階3-4 作業4の直し）。
  // 記録の再生では action_* が呼ばれないので、盤面を進める qipai・fulou で覚える（続きからでも同じ状態になる）
  qipai(qipai) {
    this._locked = null;
    super.qipai(qipai);
  }

  fulou(fulou) {
    if (this._human && fulou.l === this._menfeng) this._locked = directionAfterCall(this.shoupai, fulou.m, this._style, this._locked || null);
    super.fulou(fulou);
  }

  action_kaiju() { this._callback({}); }
  action_qipai() { this._callback({}); }

  action_zimo(zimo, gangzimo) {
    if (zimo.l !== this._menfeng) return this._callback({});
    const sp = this.shoupai;
    if (this.allow_hule(sp, null, gangzimo)) return this._callback({ hule: '-' });
    if (this.allow_pingju(sp)) return this._callback({ daopai: '-' });
    this._callback({ dapai: this._discard(true) });
  }

  action_dapai(dapai) {
    if (dapai.l === this._menfeng) return this._callback({});
    const sp = this.shoupai;
    const p = withDirection(dapai.p, dapai.l, this._menfeng);
    if (this.allow_hule(sp, p)) return this._callback({ hule: '-' });
    const m = this._call(p);
    if (m) return this._callback({ fulou: m });
    this._callback({});
  }

  action_fulou(fulou) {
    if (fulou.l !== this._menfeng) return this._callback({});
    if (/^[mpsz]\d{4}/.test(fulou.m)) return this._callback({}); // 大明槓のあとは嶺上ツモを待つ
    this._callback({ dapai: this._discard(false) });
  }

  action_gang(gang) {
    if (gang.l === this._menfeng || /^[mpsz]\d{4}$/.test(gang.m)) return this._callback({});
    const p = withDirection(gang.m[0] + gang.m.slice(-1), gang.l, this._menfeng);
    if (this.allow_hule(this.shoupai, p, true)) return this._callback({ hule: '-' });
    this._callback({});
  }

  action_hule() { this._callback({}); }
  action_pingju() { this._callback({}); }
  action_jieju() { this._callback({}); }

  // 鳴くか（型の決まり。リーチしていたら鳴かない）。p：向きの付いた相手の捨て牌。返すもの：面子か null
  _call(p) {
    const sp = this.shoupai;
    if (sp.lizhi) return null;
    return chooseStyleCall(this._style, {
      shoupai: sp,
      rongpai: p,
      peng: this.get_peng_mianzi(sp, p) || [],
      chi: this.get_chi_mianzi(sp, p) || [],
      zhuangfeng: this._model.zhuangfeng,
      menfeng: this._menfeng,
      kuitan: this._rule['クイタンあり'] !== false,
      threat: riichiOf(this._model, this._menfeng).length > 0,
      human: this._human,
      direction: this._human ? currentDirection(sp, this._style, this._locked || null) : null,
    });
  }

  // 切る牌（ツモの後ならリーチも考える）。リーチを受けていれば型の押し引きで選び、押すと決めた牌で聴牌のままリーチできればリーチ（追っかけ）
  _discard(canRiichi) {
    const sp = this.shoupai;
    const options = this.get_dapai(sp);
    const counts = visibleCounts(this._model, this._menfeng);
    if (sp.lizhi) return options[options.length - 1];
    const threats = riichiOf(this._model, this._menfeng);
    const damaOf = this._damaOf(sp, threats, counts);
    const pick = this._humanPick(sp);
    if (canRiichi && !threats.length) {
      const r = chooseRiichi(sp, this.allow_lizhi(sp), counts, { ownRiver: pick.ownRiver || null, valueFor: pick.valueFor || null });
      if (r) return damaOf && damaOf(r) ? r : r + '*';
    }
    const ctx = { visible: counts, own: ownCounts(sp), turn: this._model.he[this._menfeng]._pai.length + 1 };
    // 手役の方向（人らしいときだけ。段階3-4）。リーチを受けたときの押し引きは方向を見ない
    const direction = this._human ? currentDirection(sp, this._style, this._locked || null) : null;
    // 聴牌に役があるか（人らしいときだけ。方向に向かって鳴いた手が役のない聴牌をとらないため）
    const at = this._at();
    const yakuOf = this._human ? (option) => damaValue(sp, option, at).yaku : null;
    const inputs = { shoupai: sp, options, counts, dora: doraKinds(this._model), threats, ctx, direction, yakuOf, ...pick, dealer: this._menfeng === 0 };
    return chooseStyleDapai(this._style, inputs, canRiichi && threats.length ? this.allow_lizhi(sp) : null, damaOf);
  }
}

