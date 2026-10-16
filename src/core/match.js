// 対局の組み立て。部品の Game に「種から作る牌山と起家」を足し、人1人と CPU 3人を座らせる。
// 返事はすべて記録するので、記録を渡せば同じ場面から続きを打てる。
import Majiang from '../../vendor/majiang-core.js';
import { SeededShan } from './shan.js';
import { createRng, deriveSeed } from './rng.js';
import { STANDARD_RULE, MATCH_TYPES, normalizeRules, buildRule, matchOptionsOf } from './rule.js';
import { CpuPlayer } from './cpu-player.js';
import { HumanPlayer } from './human-player.js';
import { createRecorder } from './recorder.js';
import { heroine, styleOf } from './cast.js';

export const GAME_TITLE = 'やっしーGAMES 麻雀道場';

export class DojoGame extends Majiang.Game {
  // north：東北戦（東場の次を北場にする）。okaReturn：終局のポイントの返しの点（30,000点返しならトップにオカ+20）
  constructor(players, callback, rule, seed, { north = false, okaReturn = 30000 } = {}) {
    super(players, callback, rule, GAME_TITLE);
    this._seed = seed >>> 0;
    this._handNo = 0;
    this._north = !!north;
    this._okaReturn = okaReturn;
  }

  // 起家も種から決める
  kaiju() {
    const qijia = Math.floor(createRng(deriveSeed(this._seed, 0xffff))() * 4);
    return super.kaiju(qijia);
  }

  // 東北戦：局の進み方と終わり方は部品のまま（北場を2つ目の場＝南場の位置として数える）にし、
  // 配るときだけ場風を北に差し替える。点数計算・打ち手への知らせ・牌譜には北場として入る
  last() {
    if (this._north && this._model.zhuangfeng === 3) this._model.zhuangfeng = 1;
    super.last();
  }

  // 終局：部品の計算（電脳麻将 majiang-core の Game.jieju）を写し、返しの点だけ選べるようにした（部品は30,000点返しに固定）。
  // 供託はトップに。ポイントは (点数 − 返し) ÷ 1,000 ＋ ウマ、トップは残り
  jieju() {
    const model = this._model;
    const paiming = [];
    const defen = model.defen;
    for (let i = 0; i < 4; i++) {
      const id = (model.qijia + i) % 4;
      for (let j = 0; j < 4; j++) {
        if (j === paiming.length || defen[id] > defen[paiming[j]]) {
          paiming.splice(j, 0, id);
          break;
        }
      }
    }
    defen[paiming[0]] += model.lizhibang * 1000;
    this._paipu.defen = defen;
    const rank = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) rank[paiming[i]] = i + 1;
    this._paipu.rank = rank;
    const round = !this._rule['順位点'].find((p) => p.match(/\.\d$/));
    const point = [0, 0, 0, 0];
    for (let i = 1; i < 4; i++) {
      const id = paiming[i];
      point[id] = (defen[id] - this._okaReturn) / 1000 + +this._rule['順位点'][i];
      if (round) point[id] = Math.round(point[id]);
      point[paiming[0]] -= point[id];
    }
    this._paipu.point = point.map((p) => p.toFixed(round ? 0 : 1));
    const paipu = { jieju: this._paipu };
    const msg = [];
    for (let l = 0; l < 4; l++) msg[l] = JSON.parse(JSON.stringify(paipu));
    this.call_players('jieju', msg, this._wait);
    if (this._view) this._view.summary(this._paipu);
    if (this._handler) this._handler();
  }

  // 局ごとに「種＋何局目か」から牌山を作る
  qipai(shan) {
    if (this._north && this._model.zhuangfeng === 1) this._model.zhuangfeng = 3;
    const n = this._handNo++;
    return super.qipai(shan || new SeededShan(this._rule, deriveSeed(this._seed, n)));
  }

  // 続きから：記録の分は待ち時間なしに同期で一気に進め、記録が尽きた（全員の返事がそろわない）ところから
  // 普通の進み方に戻す。ブラウザのタイマーは続けて使うと1回4ミリ秒かかるので、普通に再生すると遅い
  replayThenRun() {
    const step = { kaiju: 'reply_kaiju', qipai: 'reply_qipai', zimo: 'reply_zimo', dapai: 'reply_dapai', fulou: 'reply_fulou', gang: 'reply_gang', gangzimo: 'reply_zimo', hule: 'reply_hule', pingju: 'reply_pingju' };
    const allReplied = () => this._reply.filter((x) => x).length === 4;
    this._sync = true;
    this.kaiju();
    while (allReplied() && step[this._status]) this[step[this._status]]();
    this._sync = false;
    if (allReplied()) this._timeout_id = setTimeout(() => this.next(), 0);
  }
}

// 人1人（id 0）と CPU 3人（id 1〜3）の対局を作る。
// saved：続きからのときの記録（4人分の返事の並び）。onEnd：終局のときに牌譜を渡す。
// rules：ルールの5項目（段階2-3。渡せば部品のルール・北場・返しの点をここから作る）。渡さなければ rule と type（MATCH_TYPES の名前）
export function createMatch({ seed, agent, cast, saved = null, onEnd = null, rule = STANDARD_RULE, type = 'tonnan', rules = null }) {
  const recorder = createRecorder(saved);
  const human = recorder.wrap(0, new HumanPlayer(agent));
  // CPU の型はキャラの型（段階2-3 設計書 2.4。cast[i] は id i+1 の人）
  const cpus = [1, 2, 3].map((id) => recorder.wrap(id, new CpuPlayer(styleOf(cast[id - 1]))));
  let stopped = false;
  const r = rules ? normalizeRules(rules) : null;
  const options = r ? matchOptionsOf(r) : { north: !!(MATCH_TYPES[type] && MATCH_TYPES[type].north) };
  const game = new DojoGame([human, ...cpus], (paipu) => { if (onEnd && !stopped) onEnd(paipu); }, r ? buildRule(r) : rule, seed, options);
  game._model.player = ['あなた', ...cast.map((k) => (heroine(k) ? heroine(k).name : k))];
  return {
    game,
    human,
    recorder,
    // 記録があれば一気に再生してから、なければ最初から始める
    start() {
      if (recorder.replaying) game.replayThenRun();
      else game.kaiju();
    },
    // やめる（タイトルへ戻ったとき）：次の段へ進まず、終局も知らせない
    stop() {
      stopped = true;
      game.stop();
    },
  };
}
