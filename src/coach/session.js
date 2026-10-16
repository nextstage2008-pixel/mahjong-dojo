// 指南の流れ（設計書 3章の流れ・5章）：自分の番ごとに数えて考えどころを決め、裏で試し、
// 切ったら採点して記録する。画面には触らない（帯の HTML は ui/coach-html.js、つなぐのは table-ui.js）。
import { factsOf, shapeTags } from './facts.js';
import { countCandidates, callCandidates } from './count.js';
import { spotOf, simKeys, offPath, groupOf, offPushfold, callSpotOf } from './spot.js';
import { DEFAULT_RUNS, diffOf } from './sim.js';
import { judge, summarize, isCorrect } from './grade.js';
import { fullLines, hintLine, answerLines, hintRows, reasonCorrect, pushfoldLines, callLines } from './explain.js';
import { readOf, ownLine, callCount, withWatch } from './read.js';

// 指南の量（設計書 5.5）
export const LEVELS = ['all', 'hint', 'none'];
export const LEVEL_NAME = { all: '全部', hint: 'ヒント', none: 'なし' };
export const nextLevel = (level) => LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length];

const plain = (key) => key.replace(/[*!]/g, '');

// 2つの試しの結果を1つにまとめる（同じ場面・同じ回数なら同じ並びなので、そのまま並べてよい）
export function mergeSims(a, b) {
  const out = { runs: a.runs, keys: [...a.keys], scores: { ...a.scores }, wins: { ...a.wins }, gains: { ...a.gains }, dealins: { ...(a.dealins || {}) }, tenpais: { ...(a.tenpais || {}) }, yaku: { ...(a.yaku || {}) } };
  for (const k of b.keys) {
    if (out.keys.includes(k)) continue;
    out.keys.push(k);
    out.scores[k] = b.scores[k];
    out.wins[k] = b.wins[k];
    out.gains[k] = b.gains[k];
    out.dealins[k] = b.dealins ? b.dealins[k] || 0 : 0;
    out.tenpais[k] = b.tenpais ? b.tenpais[k] || 0 : 0;
    out.yaku[k] = b.yaku ? b.yaku[k] || {} : {};
  }
  return out;
}

// run(scene, keys, runs, { careful, call })：試しを動かす関数（runner.js の run）。getLevel()：今の指南の量。log：考えどころの記録の並び
// getTask：今日の課題（段階3-1。{ reason } か null）。getTaskNotice：課題の札を帯に出すか（設定）
// review：感想戦の採点（段階3-1）。考えどころ外の場面でも、選んだ牌を必ず採点して答えを返す（対局中は大きな損のときだけ知らせる）
export function createCoachSession({ run, getLevel, log = [], runs = DEFAULT_RUNS, getTask = () => null, getTaskNotice = () => true, review = false }) {
  const uniq = (keys) => [...new Set(keys)];
  let cur = null;
  // 最後に切った牌の、切ったときの読み（段階3-5。局の結果の1行に使う）
  let lastDiscard = null;
  // 読みを出すか（段階3-5 設計書 6.1）：全部の段はいつも、ヒントの段は「読み」を押した番だけ。警戒の打牌の番だけ
  const readShownFor = (c) => !!c && !c.call && c.read.alert && (getLevel() === 'all' || (getLevel() === 'hint' && c.readShown));
  // 帯に出す読み：自分の手の行（いちばん前に進む牌）と、警戒している相手の札
  const readView = (c) => ({
    own: c.spot.main ? ownLine(c.spot.main.rep, c.result, c.scene) : null,
    opponents: c.read.opponents.filter((o) => o.alert),
    // 残りのツモの回数（考えどころでない警戒の番の「読み：聴牌 ○%（○巡で）」）
    draws: c.scene.draws,
  });
  // 自分の番の通し番号。試しが次の番まで終わらなかった答え合わせを「古い」と見分ける
  let turnNo = 0;
  const bestOf = (c) => {
    const first = judge(c.result, c.spot, c.cands, c.keys[0]);
    return judge(c.result, c.spot, c.cands, first.best);
  };
  // その場面の決め手の問いが今日の課題と同じか（試しの後の場面は最善の決め手、考えどころ外は採点の決め手）
  const isTask = (c, j = null) => {
    const task = getTask();
    if (!task) return false;
    const reason = c.result && c.keys ? bestOf(c).reason : j ? j.reason : null;
    return !!reason && reason === task.reason;
  };
  const where = (c) => ({ zhuangfeng: c.scene.zhuangfeng, jushu: c.scene.jushu, changbang: c.scene.changbang, turn: c.scene.turn + 1 });
  // 全部の段の4つの問い（種類ごと。押し引きの④比べるは試しの後）
  const linesOf = (c) => {
    if (c.spot.spot === 'pushfold') return pushfoldLines(c.scene, c.spot, c.cands, c.result);
    if (c.spot.spot === 'call') return callLines(c.scene, c.spot, c.cands);
    return fullLines(c.scene, c.spot);
  };
  // 理由の正否と記録の1件
  const record = (c, kind, key, j, reason) => {
    const asked = !!reason;
    log.push({
      ...where(c),
      kind,
      chosen: key,
      best: j.best,
      grade: j.grade,
      loss: Math.round(j.loss),
      asked,
      reason,
      // 理由の正否：どれを切っても差がない場面は決まらない（null）
      reasonOk: asked ? (j.reason ? reasonCorrect(j, reason) : null) : false,
      hinted: c.hinted,
      // 段階3-7：リーチの人がいない押し引き（鳴き・ダマの人だけを警戒）。問い直しと問題集で何切るの見た目にするため
      ...(c.spot.quiet ? { quiet: true } : {}),
      // はっきりした差がある判断か（どの候補とも差が許容の範囲なら、成績に数えない。設計書 4.5）
      clear: j.ref !== null,
      // 指南の量（成績の推移で段ごとに分けられるように。ヒントの段の理由は理由の正答率に数えない）
      level: getLevel(),
      // 感想戦のため（段階3-1）：判断の位置（自分への知らせの何番目か。卓を作り直すのに使う）と、決め手の問い（課題を決めるのに使う）
      at: c.at,
      right: j.reason || null,
      task: isTask(c, j),
      // 問題集と傾向のため（段階3-3）：場面の事実（向聴数・リーチの人・巡目・押し引きで降りたか・鳴ける牌）と、
      // 間違えた何切るの手の形の印（両面を崩した・孤立字牌を残した・ドラを切った）
      facts: factsOf(c.scene, c.spot, key),
      tags: (kind === 'choice' || kind === 'off') && (j.grade === 'bad' || j.grade === 'dubious') ? shapeTags(c.scene, key, j.best) : [],
    });
    return asked;
  };
  // 悪手と言う前に、最善とあなたの牌だけを丁寧な打ち方で試し直して確かめる（設計書 4.4・12章）。
  // ふだんの試しの打ち方の弱さで、広い形が損に見えることがあるため。遅いので悪手のときだけ
  const confirmBad = async (c, spot, result, key, j, opts = {}) => {
    if (j.grade !== 'bad') return j;
    const check = await run(c.scene, [j.best, j.mine], runs, { careful: true, ...opts });
    return judge(result, spot, c.cands, key, { mineDiff: diffOf(check, j.best, j.mine) });
  };

  const session = {
    log,
    // 鳴けますと聞かれた（段階2-2 設計書 3.2）：鳴きの考えどころなら裏で試し始める。返すもの：帯（考えどころでなければ null）
    // at：判断の位置（段階3-1。自分への知らせの何番目か。なければ null）
    beginCall(scene0, { at = null } = {}) {
      // 段階3-7：試算に警戒しているリーチのない人の材料を付ける（以後の試算・帯・採点は同じ場面）
      const scene = withWatch(scene0);
      const cands = callCandidates(scene);
      const spot = { ...callSpotOf(scene), groups: [] };
      const c = { scene, cands, spot, keys: null, result: null, ready: null, hinted: false, turnNo: ++turnNo, call: true, at, read: readOf(scene), readShown: false };
      cur = c;
      if (spot.spot) {
        c.keys = spot.keys;
        c.ready = run(scene, c.keys, runs, { call: true }).then((r) => {
          c.result = r;
          return r;
        });
      }
      return session.view();
    },
    // 自分の番：数えて考えどころを決め、考えどころなら裏で試し始める。返すもの：帯（考えどころでなければ null）
    // at：判断の位置（段階3-1。自分への知らせの何番目か。なければ null）
    begin(scene0, { at = null } = {}) {
      // 段階3-7：試算に警戒しているリーチのない人の材料を付ける（以後の試算・帯・採点は同じ場面）
      const scene = withWatch(scene0);
      const cands = countCandidates(scene);
      // 読み（段階3-5）：番ごとに1回だけ作る。段階3-7：警戒している人がいれば、リーチの人がいなくても押し引き（spot.quiet）
      const read = readOf(scene);
      const spot = spotOf(scene, cands, { read });
      const c = { scene, cands, spot, keys: null, result: null, ready: null, hinted: false, turnNo: ++turnNo, at, read, readShown: false };
      cur = c;
      if (spot.spot) {
        c.keys = simKeys(spot, scene);
        c.ready = run(scene, c.keys, runs).then((r) => {
          c.result = r;
          return r;
        });
      }
      return session.view();
    },
    // 今の帯。spot：考えどころの種類。full：「全部」の段の4つの問い。hint：「ヒント」の段の1行（試しが終わるまで null）
    // 読み（段階3-5）：read は読みを出す番だけ、readable はヒントの段で「読み」のボタンを出す番だけ（どちらもなければ項目ごと付けない）
    view() {
      const c = cur;
      if (!c) return null;
      const level = getLevel();
      const extra = {
        ...(readShownFor(c) ? { read: readView(c) } : {}),
        ...(session.canShowRead() ? { readable: true } : {}),
      };
      if (!c.spot.spot) return Object.keys(extra).length ? { spot: null, level, ...extra } : null;
      return {
        // 段階3-7（先生の B）：なしの段のリーチの人がいない押し引きは、何切るの見た目（対局中に警戒を漏らさない）
        spot: level === 'none' && c.spot.quiet && c.spot.spot === 'pushfold' ? 'choice' : c.spot.spot,
        // 全部・ヒントの段の quiet：帯で「リーチを受けています」と言わないための印（なしの段は何切るの見た目なので付けない）
        ...(level !== 'none' && c.spot.quiet && c.spot.spot === 'pushfold' ? { quiet: true } : {}),
        level,
        full: level === 'all' ? linesOf(c) : null,
        hint: level === 'hint' && c.result ? hintLine(c.spot, bestOf(c)) : null,
        // 課題の札（段階3-1 設計書 7章）：全部とヒントの段だけ（なしの段で出すと決め手のヒントになる）
        task: !!c.result && (level === 'all' || level === 'hint') && getTaskNotice() && isTask(c),
        ...extra,
      };
    },
    // 手牌の印（段階3-5 設計書 6.2）：読みを出す番は、警戒している相手みんなへのロンされる確率（候補の名前ごと）。
    // 読みで警戒のない古い場面（相手の材料がない）でリーチを受けていれば、今までの危なさの印（全部の段だけ）
    readMarks() {
      const c = cur;
      if (!c || c.call) return null;
      if (readShownFor(c)) return Object.fromEntries(Object.entries(c.read.dangers).map(([k, d]) => [k, d.p]));
      if (!c.read.alert) return session.dangerMarks();
      return null;
    },
    // ヒントの段の「読み」のボタンを出すか（警戒の打牌の番で、まだ押していない）
    canShowRead() {
      const c = cur;
      return !!c && !c.call && c.read.alert && getLevel() === 'hint' && !c.readShown;
    },
    // 「読み」を押した：その番だけ読みを出す。考えどころの番ならヒントを見た扱い
    showRead() {
      const c = cur;
      if (!session.canShowRead()) return;
      c.readShown = true;
      if (c.spot.spot) c.hinted = true;
    },
    // 最後に切った牌の、切ったときの読み（どの段でも）：{ key, p, each } か null
    discardRead() {
      return lastDiscard;
    },
    // 危なさの印（段階2-2 設計書 5.2）：全部の段で、リーチを受けている自分の番だけ。候補の名前 → 放銃率
    dangerMarks() {
      const c = cur;
      if (!c || c.call || getLevel() !== 'all' || !c.scene.threats || !c.scene.threats.length) return null;
      return c.spot.dangers || null;
    },
    // 試しが終わるのを待つ（考えどころでなければすぐ）
    ready() {
      return cur && cur.ready ? cur.ready.then(() => undefined) : Promise.resolve();
    },
    // 理由を聞くか（設計書 5.2：「なし」の段の「切る牌で差がつく」考えどころ。切る前にヒントを見たら聞かない）。
    // ヒントの段は帯に正しい理由（「この場面は○で差がつきます」）が出ているので聞かない（2026-10-08 先生の判断）。
    // 試しが終わっていて、どの候補とも差が許容の範囲（はっきりした差がない）なら聞かない
    needsReason() {
      if (!cur || !['choice', 'pushfold', 'call'].includes(cur.spot.spot) || getLevel() !== 'none' || cur.hinted) return false;
      return !cur.result || bestOf(cur).ref !== null;
    },
    // 理由のボタンの型（段階2-2 設計書 3.3）：押し引きは押し引きの型、何切る・鳴きは何切るの型
    // 段階3-7：リーチの人がいない押し引き（quiet）は何切るの型
    reasonKind() {
      return cur && cur.spot.spot === 'pushfold' && !cur.spot.quiet ? 'pushfold' : 'discard';
    },
    // 切る前のヒント（設計書 5.4）：表の行。この判断に「ヒントを見た」印を付ける
    // 表の行にロンされる確率（ron。段階3-5）を足し、警戒している相手の札も返す
    hint() {
      if (!cur || !cur.spot.spot) return null;
      cur.hinted = true;
      const dangers = cur.read.alert ? cur.read.dangers : null;
      const rows = hintRows(cur.spot, cur.cands, cur.result).map((r) => ({ ...r, ron: dangers && dangers[plain(r.key)] ? dangers[plain(r.key)].p : null }));
      const opponents = cur.read.opponents.filter((o) => o.alert);
      return { where: where(cur), rows, lines: linesOf(cur), pending: !cur.result, kind: cur.spot.spot, read: opponents.length ? { opponents } : null };
    },
    // 切った。key：候補の名前（リーチなら '*' 付き）。reason：選んだ理由（聞かなかったら null）。
    // 返すもの：答え合わせ（出さないなら null）。試しの間に次の番が始まっていたら stale: true（画面は出さない。記録は残す）
    async finish(key, reason = null) {
      const c = cur;
      if (!c || c.call) return null;
      cur = null;
      const d = c.read.dangers[plain(key)];
      // 相手ごとの、切ったときの見えている気配（段階3-6 設計書 8.1。振り込んだ局のダマの行に使う）
      const opponents = (c.scene.opponents || []).map((o, i) => ({
        seat: o.seat,
        menzen: callCount(o) === 0,
        riichi: !!o.riichi,
        signs: (c.read.opponents[i] && c.read.opponents[i].signs) || [],
        unused: (c.read.opponents[i] && c.read.opponents[i].unused) || [],
      }));
      lastDiscard = { key: plain(key), p: d ? d.p : 0, each: d ? d.each : [], opponents };
      const threat = !!(c.scene.threats && c.scene.threats.length);
      // リーチの人の情報がない古い場面は扱わない
      if (c.scene.threat && !threat) return null;
      let result;
      let kind = c.spot.spot;
      let spot = c.spot;
      if (!kind && (threat || c.spot.quiet)) {
        // 押し引きの考えどころの外（3向聴以上）：安全な牌があるのに危ない牌を切ったら、降りと2つだけ試す（段階2-2 設計書 3.1）
        if (!review && !offPushfold(c.scene, c.spot, plain(key))) return null;
        spot = { ...c.spot, spot: 'pushfold' };
        result = await run(c.scene, uniq([c.spot.fold, plain(key)]), runs);
        kind = 'pfoff';
      } else if (!kind) {
        // 考えどころでない：当たり前の1枚の組の外なら、代表と2つだけ試し、疑問手か悪手なら知らせる
        if (!review && !offPath(c.spot, plain(key))) return null;
        result = await run(c.scene, uniq([c.spot.main.rep.key, plain(key)]), runs);
        kind = 'off';
      } else {
        result = c.result || (await c.ready);
        // あなたの牌の組を試していなければ足して試す（同じ並びなので数字は揃う）
        const g = groupOf(c.spot, plain(key));
        const own = (g ? g.rep.key : plain(key)) + (key.endsWith('*') ? '*' : '');
        if (!result.keys.includes(own)) result = mergeSims(result, await run(c.scene, [own], runs));
        // 押し引き：降りる牌と同じだけ安全な別の牌を切ったら、その牌から降りる打ち方も試す（降りたのか押したのか分からないので、
        // 良い方をあなたの判断とみる。grade.js の simKeyOf）
        if (kind === 'pushfold' && !key.endsWith('*')) {
          const d = c.spot.dangers || {};
          const fk = plain(key) + '!';
          if (fk !== c.spot.fold && (d[plain(key)] ?? 1) <= (d[plain(c.spot.fold)] ?? 0) + 1e-12 && !result.keys.includes(fk)) {
            result = mergeSims(result, await run(c.scene, [fk], runs));
          }
        }
      }
      let j = judge(result, spot, c.cands, key);
      j = await confirmBad(c, spot, result, key, j);
      if (!review && (kind === 'off' || kind === 'pfoff') && isCorrect(j.grade)) return null;
      const asked = record(c, kind, key, j, reason);
      // 段階3-7：全部・ヒントの段の quiet は押し引きの帯で見せたので、決め手の名前も押し引きの言葉（なしの段・問い直しは何切るの言葉）
      const answer = answerLines(c.scene, spot, c.cands, result, j, asked ? reason : null, { pfWords: !!spot.quiet && getLevel() !== 'none' });
      return { ...answer, where: where(c), rows: hintRows(spot, c.cands, result, j), stale: c.turnNo !== turnNo, kind };
    },
    // 鳴くかを決めた（段階2-2 設計書 3.2）。key：'skip' か面子の書き方。返すもの：答え合わせ（考えどころでなければ null）。
    // call: true（画面は次の打牌の帯の上に1行で残す。設計書 5.4）
    async finishCall(key, reason = null) {
      const c = cur;
      if (!c || !c.call) return null;
      cur = null;
      if (!session.gradesCall(key, c) && !(review && c.spot.noYaku)) return null;
      let spot = c.spot;
      let kind = 'call';
      let result;
      if (!c.spot.spot) {
        // 役のない鳴きをした（考えどころの外）：鳴かないと2つだけ試し、疑問手か悪手なら知らせる（設計書10章）
        spot = { ...c.spot, spot: 'call' };
        kind = 'calloff';
        result = await run(c.scene, uniq(['skip', key]), runs, { call: true });
      } else result = c.result || (await c.ready);
      let j = judge(result, spot, c.cands, key);
      j = await confirmBad(c, spot, result, key, j, { call: true });
      if (!review && kind === 'calloff' && isCorrect(j.grade)) return null;
      const asked = record(c, kind, key, j, reason);
      const answer = answerLines(c.scene, spot, c.cands, result, j, asked ? reason : null);
      return { ...answer, where: where(c), rows: hintRows(spot, c.cands, result, j), stale: c.turnNo !== turnNo, kind: 'call', call: true };
    },
    // 鳴くかの答えを採点するか：鳴きの考えどころか、役のない鳴きをしたとき（c：省けば今の場面）
    gradesCall(key, c = cur) {
      if (!c || !c.call) return false;
      return !!c.spot.spot || (!!c.spot.noYaku && key !== 'skip');
    },
    // 半荘の判断のまとめ
    summary() {
      return summarize(log);
    },
  };
  // 採点中の答え合わせ（段階3-2）：切った牌は試しの前に卓へ渡るので、局の結果の画面が「この局」を作るときに、
  // 振り込んだ打牌の採点がまだ記録に入っていないことがある。settled() はそれが入るまで待つ
  const inflight = new Set();
  for (const name of ['finish', 'finishCall']) {
    const inner = session[name];
    session[name] = (...args) => {
      const p = inner.apply(session, args);
      inflight.add(p);
      p.then(() => inflight.delete(p), () => inflight.delete(p));
      return p;
    };
  }
  session.settled = () => Promise.allSettled([...inflight]).then(() => {});
  return session;
}
