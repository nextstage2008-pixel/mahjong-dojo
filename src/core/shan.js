// 種から並べる牌山。中身（136枚・赤5が各色1枚）は部品の Shan と同じで、並べ方だけを種で決める。
import Majiang from '../../vendor/majiang-core.js';
import { createRng, shuffleInPlace } from './rng.js';

export class SeededShan extends Majiang.Shan {
  constructor(rule, seed) {
    super(rule);
    // 部品が混ぜた順は捨て、決まった順に並べ直してから種で混ぜる
    const pai = this._pai.slice().sort();
    shuffleInPlace(pai, createRng(seed));
    this._pai = pai;
    this._baopai = [pai[4]];
    this._fubaopai = rule['裏ドラあり'] ? [pai[9]] : null;
  }
}
