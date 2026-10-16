// 卓の作り直し（段階3-1 設計書 5章）：対局の記録（4人分の返事）を、自分への at 番目の知らせまで再生して止める。
// 続きからと同じ仕組み（記録の返事を同じ順に返す）で進め、自分に at 番目の知らせが来たら返事をせずに止める。
// 返すもの：Promise<{ kind, info, player, hands }>（知らせの種類・選べること・その時点の自分の打ち手・その時点の4人の手牌の書き方
// 〔局の席の順。段階3-5：感想戦・問題集の答え合わせだけに使う〕）。画面には触らない。
import { createMatch } from './match.js';

export function rebuildAt({ seed, cast, rules, log }, at) {
  return new Promise((resolve, reject) => {
    const length = Math.min(...log.map((a) => a.length));
    if (!Number.isInteger(at) || at < 0 || at > length) {
      reject(new Error(`記録より先の位置は作り直せない（位置 ${at}・記録 ${length}）`));
      return;
    }
    let match = null;
    let done = false;
    // 再生の間は人の打ち手に問い合わせが来ない（記録の返事を使う）。最初に来た問い合わせが at 番目の知らせ
    const agent = {
      decide(kind, info, player) {
        if (!done) {
          done = true;
          match.stop();
          const hands = match.game._model.shoupai.map((sp) => sp.toString());
          resolve({ kind, info, player, hands });
        }
        return new Promise(() => {});
      },
    };
    match = createMatch({ seed, cast, rules, saved: log.map((a) => a.slice(0, at)), agent });
    match.start();
  });
}
