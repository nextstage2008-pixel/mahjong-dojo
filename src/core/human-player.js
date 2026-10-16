// 人の打ち手。部品の Game からの問いかけを「選べること」にまとめて agent（画面やテストの台本）に渡し、
// agent が返した返事（Promise でもよい）を Game に返す。画面の速さは agent が返事を待たせて決める。
import Majiang from '../../vendor/majiang-core.js';
import { withDirection } from './cpu-player.js';

export class HumanPlayer extends Majiang.Player {
  constructor(agent) {
    super();
    this.agent = agent;
  }

  action_kaiju() { this._ask('kaiju', {}); }
  action_qipai() { this._ask('qipai', {}); }

  action_zimo(zimo, gangzimo) {
    if (zimo.l !== this._menfeng) return this._ask('otherZimo', { l: zimo.l });
    const sp = this.shoupai;
    this._ask('myZimo', {
      gangzimo: !!gangzimo,
      choices: {
        hule: !!this.allow_hule(sp, null, gangzimo),
        lizhi: this.allow_lizhi(sp) || [],
        gang: (!this.shan.paishu ? null : this.get_gang_mianzi(sp)) || [],
        daopai: !!this.allow_pingju(sp),
        dapai: this.get_dapai(sp),
      },
    });
  }

  action_dapai(dapai) {
    if (dapai.l === this._menfeng) return this._ask('myDapai', { dapai });
    const sp = this.shoupai;
    const p = withDirection(dapai.p, dapai.l, this._menfeng);
    const can = !sp.lizhi && this.shan.paishu > 0;
    this._ask('otherDapai', {
      dapai,
      tile: p,
      choices: {
        hule: !!this.allow_hule(sp, p),
        peng: (can && this.get_peng_mianzi(sp, p)) || [],
        chi: (can && this.get_chi_mianzi(sp, p)) || [],
        gang: (can && this.get_gang_mianzi(sp, p)) || [],
      },
    });
  }

  action_fulou(fulou) {
    if (fulou.l !== this._menfeng) return this._ask('otherFulou', { fulou });
    if (/^[mpsz]\d{4}/.test(fulou.m)) return this._ask('myKan', { fulou }); // 大明槓のあとは嶺上ツモを待つ
    this._ask('myFulou', { fulou, choices: { dapai: this.get_dapai(this.shoupai) } });
  }

  action_gang(gang) {
    if (gang.l === this._menfeng) return this._ask('myGang', { gang });
    let hule = false;
    if (!/^[mpsz]\d{4}$/.test(gang.m)) {
      const p = withDirection(gang.m[0] + gang.m.slice(-1), gang.l, this._menfeng);
      hule = !!this.allow_hule(this.shoupai, p, true);
    }
    this._ask('otherGang', { gang, choices: { hule } });
  }

  action_hule(hule) { this._ask('hule', { hule }); }
  action_pingju(pingju) { this._ask('pingju', { pingju }); }
  action_jieju(paipu) { this._ask('jieju', { paipu }); }

  // agent に選ばせて Game に返す。agent が失敗したら何もしない返事（{}）で進める
  _ask(kind, info) {
    const callback = this._callback;
    Promise.resolve()
      .then(() => this.agent.decide(kind, info, this))
      .then(
        (reply) => callback(reply || {}),
        (err) => {
          callback({});
          if (this.agent.onError) this.agent.onError(err);
        },
      );
  }
}
