// 問題集（段階3-3 設計書 3章・4章・5章・9章）：打った半荘から判断が分かれる場面を問題として登録し、見出しを付け、
// 今日の問題・種類ごと・傾向から選び、1日後・3日後・7日後の復習の段と日を進め、古いものを捨てる。画面に触らない。
// 状態（保存の形）：{ archive: [半荘の記録], problems: [問題], history: [{ id, day, summary }] }
import { tileName } from '../ui/view-model.js';
import { summarize, tendencyOf } from './tendency.js';

const KINDS = new Set(['choice', 'off', 'riichi', 'pushfold', 'pfoff', 'call', 'calloff']);
// 種類ごとの選び方の組
export const GROUPS = { choice: ['choice', 'off'], riichi: ['riichi'], pushfold: ['pushfold', 'pfoff'], call: ['call', 'calloff'] };
// 問題の種類の組。リーチの人がいない押し引き（quiet。段階3-7）は何切るの見た目で問うので何切るの組
// （種類「押し引き」から選ぶと押し引きの場面だと分かってしまうため）
export function groupOf(p) {
  if (p.entry && p.entry.quiet) return 'choice';
  return Object.keys(GROUPS).find((g) => GROUPS[g].includes(p.kind)) || null;
}
// 正解したときに次の段で待つ日数（段1は1日後・段2は3日後・段3は7日後）
const WAIT = { 1: 1, 2: 3, 3: 7 };
const ARCHIVE_MAX = 30;
const ARCHIVE_HARD_MAX = 40;
const PROBLEMS_MAX = 300;
const HISTORY_MAX = 200;

const isMistake = (e) => !!e && (e.grade === 'bad' || e.grade === 'dubious');
const lastTry = (p) => (p.tries.length ? p.tries[p.tries.length - 1] : null);
// 間違えたままか：解いていなければ元の半荘で間違えたか、解いていれば最後に間違えたか（身についた問題は違う）
export const isPending = (p) => !p.mastered && (lastTry(p) ? !lastTry(p).ok : isMistake(p.entry));
const pending = isPending;

// 暦の日の番号（端末の暦の年月日から数える。時計の時刻は見ない）
export function dayOf(date) {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// その半荘の問題。はっきりした差があり（clear）、卓を作り直せる（at）判断。間違いは段0・翌日、正解は段2・7日後
export function problemsOf(gameId, entries, day) {
  const seen = new Set();
  const out = [];
  for (const entry of entries || []) {
    if (!entry || !KINDS.has(entry.kind) || entry.clear === false || !Number.isInteger(entry.at) || seen.has(entry.at)) continue;
    seen.add(entry.at);
    const miss = isMistake(entry);
    out.push({ id: `${gameId}:${entry.at}`, gameId, at: entry.at, kind: entry.kind, entry, stage: miss ? 0 : 2, due: day + (miss ? 1 : 7), tries: [], mastered: false });
  }
  return out;
}

const shantenName = (x) => (x <= 0 ? '聴牌' : `${x}向聴`);

// 見出し（場面の事実から）
export function titleOf(entry) {
  const f = entry.facts || null;
  const has = (k) => f && f[k] !== undefined && f[k] !== null;
  // 段階3-7（先生の B）：リーチの人がいない押し引き（quiet）は何切るの見出し
  if ((entry.kind === 'pushfold' || entry.kind === 'pfoff') && !entry.quiet) {
    if (!has('shanten') || !has('threats')) return '押し引き、どうする？';
    const who = f.threats >= 2 ? '2人の' : f.dealerThreat ? '親' : '';
    return `${who}リーチを受けた${shantenName(f.shanten)}、どうする？`;
  }
  if (entry.kind === 'riichi') return '聴牌：リーチ？ダマ？';
  if (entry.kind === 'call' || entry.kind === 'calloff') return has('callTile') ? `${tileName(f.callTile)}が鳴ける、鳴く？` : '鳴く？';
  return has('shanten') ? `${shantenName(f.shanten)}の何切る` : '何切る';
}

// 解いた結果を当てる。間違い→いつでも段0・翌日。正解→期日（due）が来ていれば段を1つ上げ（段1は1日後・段2は3日後・段3は7日後）、
// 段3で正解→身についた。期日前の正解は記録だけ残し、段と期日は変えない（同じ日に何度解いても身につかない。最後のレビューの直し）。
// detail：{ chosen（選んだ手）, grade（判定） }（「前回：押し（9萬切り）・悪手」のため）
export function answer(problem, ok, day, detail = null) {
  const tries = [...problem.tries, detail ? { day, ok, chosen: detail.chosen, grade: detail.grade } : { day, ok }];
  if (!ok) return { ...problem, tries, stage: 0, due: day + 1, mastered: false };
  if (day < problem.due) return { ...problem, tries };
  if (problem.stage >= 3) return { ...problem, tries, mastered: true };
  const stage = problem.stage + 1;
  return { ...problem, tries, stage, due: day + WAIT[stage] };
}

const byDue = (a, b) => a.due - b.due || (a.gameId < b.gameId ? -1 : a.gameId > b.gameId ? 1 : a.at - b.at);
const newestFirst = (a, b) => (a.gameId > b.gameId ? -1 : a.gameId < b.gameId ? 1 : a.at - b.at);

// 重ならないように、組の順に n 問まで
function take(groups, n) {
  const out = [];
  const ids = new Set();
  for (const g of groups) {
    for (const p of g) {
      if (out.length >= n) return out;
      if (ids.has(p.id)) continue;
      ids.add(p.id);
      out.push(p);
    }
  }
  return out;
}

// 今日の問題：①復習の日が来た問題 ②まだ解いていない間違い（新しい半荘から）③傾向の上位で間違えた場面 ④まだ解いていない正解の場面。
// 解いたばかりで期日の来ていない問題は出さない（同じ日に何度開いても繰り返さない。最後のレビューの直し）
export function pickToday(problems, day, topTendencyIds = [], n = 5) {
  const pool = problems.filter((p) => !p.mastered && !(p.tries.length && p.due > day));
  const due = pool.filter((p) => p.tries.length).sort(byDue);
  const fresh = pool.filter((p) => !p.tries.length && isMistake(p.entry)).sort(newestFirst);
  const tendency = pool.filter((p) => topTendencyIds.some((id) => tendencyOf(p.entry, id).miss)).sort(byDue);
  const correct = pool.filter((p) => !p.tries.length && !isMistake(p.entry)).sort(byDue);
  return take([due, fresh, tendency, correct], n);
}

// 種類ごと（group：choice・riichi・pushfold・call）：間違えたままの問題 → ほかの身についていない問題 → 身についた問題（日の早い順）
export function pickByKind(problems, group, day, n = 5) {
  const pool = problems.filter((p) => groupOf(p) === group).sort(byDue);
  return take([pool.filter(pending), pool.filter((p) => !p.mastered), pool], n);
}

// 傾向から：その傾向で間違えた場面 → その傾向が起きうる場面
export function pickByTendency(problems, id, day, n = 5) {
  const pool = problems.filter((p) => !p.mastered).sort(byDue);
  return take([pool.filter((p) => tendencyOf(p.entry, id).miss), pool.filter((p) => tendencyOf(p.entry, id).chance)], n);
}

// 直近 n 半荘の指南の記録（傾向の数えもと。書庫の新しい半荘から）
export function recentEntries(state, n = 20) {
  return state.archive.slice(-n).flatMap((g) => (Array.isArray(g.coach) ? g.coach : []));
}

// 上限で捨てる。書庫は古い半荘から（間違えたままの問題がある半荘は40半荘まで後回し。捨てた半荘の問題も捨てる）。
// 問題は 身についた → 正解した場面 → 古い の順。推移は200半荘まで
export function prune(state) {
  let archive = state.archive.slice();
  let problems = state.problems.slice();
  const pendingGames = () => new Set(problems.filter(pending).map((p) => p.gameId));
  while (archive.length > ARCHIVE_MAX) {
    // 捨てる半荘：間違えたままの問題がない、いちばん古い半荘（取り込んだばかりの最新の半荘は除く）。
    // なければ、40半荘を超えているときだけ最古の半荘
    const keep = pendingGames();
    let i = archive.slice(0, -1).findIndex((g) => !keep.has(g.id));
    if (i < 0) {
      if (archive.length <= ARCHIVE_HARD_MAX) break;
      i = 0;
    }
    const gone = archive[i].id;
    archive.splice(i, 1);
    problems = problems.filter((p) => p.gameId !== gone);
  }
  if (problems.length > PROBLEMS_MAX) {
    const order = (p) => (p.mastered ? 0 : pending(p) ? 2 : 1);
    const drop = problems.map((p, i) => ({ p, i })).sort((a, b) => order(a.p) - order(b.p) || a.i - b.i).slice(0, problems.length - PROBLEMS_MAX);
    const gone = new Set(drop.map((d) => d.p.id));
    problems = problems.filter((p) => !gone.has(p.id));
  }
  const history = state.history.slice(-HISTORY_MAX);
  return { archive, problems, history };
}

// 終局の記録（storage.saveLast と同じ形）を書庫・問題・推移に入れる。半荘の名前は savedAt。同じ半荘は2回入れない
export function ingest(state, record, day) {
  const id = record.savedAt;
  if (!id || state.archive.some((g) => g.id === id)) return state;
  const coach = Array.isArray(record.coach) ? record.coach : [];
  const game = { id, seed: record.seed, cast: record.cast, rules: record.rules, log: record.log, coach, savedAt: record.savedAt };
  return prune({
    archive: [...state.archive, game],
    problems: [...state.problems, ...problemsOf(id, coach, day)],
    history: [...state.history, { id, day, summary: summarize(coach) }],
  });
}

// 感想戦（段階3-1）の選び直しも、その問題を解いた記録に入れる。その半荘・位置の問題がなければそのまま
export function recordAnswer(state, gameId, at, ok, day, detail = null) {
  const id = `${gameId}:${at}`;
  const i = state.problems.findIndex((p) => p.id === id);
  if (i < 0) return state;
  const problems = state.problems.slice();
  problems[i] = answer(problems[i], ok, day, detail);
  return { ...state, problems };
}
