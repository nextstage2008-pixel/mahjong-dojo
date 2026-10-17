// 設定と対局の途中を、端末の中（localStorage）に保存する（設計書 11章）。
// area は localStorage と同じ形（getItem・setItem・removeItem）。テストでは仮のものを渡す。
// 対局の途中は本体と控えの2か所に書き、本体が壊れていたら控えを使う。
import { HEROINES, MALE_VOICES } from '../core/cast.js';
import { MATCH_TYPES, RULE_OPTIONS, STANDARD_RULES, normalizeRules } from '../core/rule.js';
import { LEVELS } from '../coach/session.js';
import { TASK_TIPS } from '../coach/review.js';
import { normalizeDojo } from '../dojo/record.js';
import { normalizeName, normalizeAvatar } from '../core/profile.js';

export const KEYS = {
  settings: 'mahjong-dojo.settings.v1',
  match: 'mahjong-dojo.match.v1',
  matchBackup: 'mahjong-dojo.match.v1.backup',
  // 段階3-1：前の半荘（感想戦のため。はじめからで消す）と、今日の課題
  last: 'mahjong-dojo.last.v1',
  task: 'mahjong-dojo.task.v1',
  // 段階3-3：問題集（半荘の書庫・問題・推移の要約）。はじめからでは消さない
  archive: 'mahjong-dojo.archive.v1',
  problems: 'mahjong-dojo.problems.v1',
  history: 'mahjong-dojo.history.v1',
  // 段階4：道場の記録（章の進み具合・経験・今日の復習）。はじめからでは消さない
  dojo: 'mahjong-dojo.dojo.v1',
};

// rules：はじめからの対局のルール（段階2-3）。presets：名前を付けて保存したルールの組み合わせ（[{ name, rules }]）
// taskNotice：次の半荘で課題の場面に帯の札「課題」を出すか（段階3-1）。handReview：局の結果の画面に「この局」を出すか（段階3-2）
// playerName・avatar・profileAsked：自分の名前・アバター・名前とアバターの札を出したか（画面の作り直し 段3）
export const DEFAULT_SETTINGS = { maleVoice: 'kurono', chatter: 'normal', cutin: true, silentPlay: false, coachLevel: 'all', rules: { ...STANDARD_RULES }, presets: [], taskNotice: true, handReview: true, playerName: '', avatar: null, profileAsked: false };
const isMatchType = (t) => Object.hasOwn(MATCH_TYPES, t);

// 組み合わせは5つまで・名前は10字まで（段階2-3 設計書 3.2）
export const PRESET_MAX = 5;
export const PRESET_NAME_MAX = 10;
const presetName = (name) => (typeof name === 'string' ? [...name.trim()].slice(0, PRESET_NAME_MAX).join('') : '');

// 組み合わせを名前を付けて保存する。同じ名前は上書き（並びの場所はそのまま）。新しい名前で5つを超えるとき・名前が空のときは
// 保存しない（そのまま返す）
export function savePreset(presets, name, rules) {
  const n = presetName(name);
  if (!n) return presets;
  const entry = { name: n, rules: normalizeRules(rules) };
  const i = presets.findIndex((p) => p.name === n);
  if (i >= 0) return presets.map((p, k) => (k === i ? entry : p));
  if (presets.length >= PRESET_MAX) return presets;
  return [...presets, entry];
}

export function deletePreset(presets, name) {
  return presets.filter((p) => p.name !== name);
}

// 読み込んだ組み合わせをそろえる：形の壊れたもの・空の名前は捨て、名前が重なれば後のもの、5つまで
function normalizePresets(list) {
  if (!Array.isArray(list)) return [];
  let out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const n = presetName(p.name);
    if (!n) continue;
    const i = out.findIndex((x) => x.name === n);
    if (i >= 0) out = out.map((x, k) => (k === i ? { name: n, rules: normalizeRules(p.rules) } : x));
    else if (out.length < PRESET_MAX) out.push({ name: n, rules: normalizeRules(p.rules) });
  }
  return out;
}

// 設定を読み、知らない値は既定に戻す。前の設定の「対局の長さ」（matchType）は、ルールの対局の長さに引き継ぐ
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, rules: { ...STANDARD_RULES }, presets: [] };
  if (raw && typeof raw === 'object') {
    if (raw.maleVoice === 'none' || MALE_VOICES.some((v) => v.key === raw.maleVoice)) s.maleVoice = raw.maleVoice;
    if (['many', 'normal', 'none'].includes(raw.chatter)) s.chatter = raw.chatter;
    if (typeof raw.cutin === 'boolean') s.cutin = raw.cutin;
    if (typeof raw.silentPlay === 'boolean') s.silentPlay = raw.silentPlay;
    if (LEVELS.includes(raw.coachLevel)) s.coachLevel = raw.coachLevel;
    if (typeof raw.taskNotice === 'boolean') s.taskNotice = raw.taskNotice;
    if (typeof raw.handReview === 'boolean') s.handReview = raw.handReview;
    s.playerName = normalizeName(raw.playerName);
    s.avatar = normalizeAvatar(raw.avatar);
    if (typeof raw.profileAsked === 'boolean') s.profileAsked = raw.profileAsked;
    s.rules = normalizeRules(raw.rules, isMatchType(raw.matchType) ? raw.matchType : 'tonnan');
    s.presets = normalizePresets(raw.presets);
  }
  return s;
}

// 課題（{ reason }）として正しければその形、でなければ null（前の半荘の「打っていたときの課題」）
const taskOf = (t) => (t && Object.hasOwn(TASK_TIPS, t.reason) ? { reason: t.reason } : null);

// 対局の記録のルールとして正しいか（5項目がそろい、どれも選べる値）
const validRules = (r) => !!r && typeof r === 'object' && Object.keys(RULE_OPTIONS).every((k) => RULE_OPTIONS[k].includes(r[k]));

// 考えどころの記録の並び（設計書 6章）。形が壊れていたら空にする（対局は続けられるように）
export function normalizeCoachLog(log) {
  if (!Array.isArray(log)) return [];
  const ok = log.every((e) => e && typeof e === 'object' && typeof e.grade === 'string' && typeof e.kind === 'string');
  return ok ? log : [];
}

// 対局の途中の記録として正しい形か（type のない前の記録も東南戦として正しい。rules のない前の記録も正しい）
export function validMatch(m) {
  if (!m || m.v !== 1) return false;
  if (m.type !== undefined && !isMatchType(m.type)) return false;
  if (m.rules !== undefined && !validRules(m.rules)) return false;
  if (!Number.isInteger(m.seed) || m.seed < 0) return false;
  if (!Array.isArray(m.cast) || m.cast.length !== 3) return false;
  if (!m.cast.every((k) => HEROINES.some((h) => h.key === k)) || new Set(m.cast).size !== 3) return false;
  if (!Array.isArray(m.log) || m.log.length !== 4 || !m.log.every(Array.isArray)) return false;
  return true;
}

function readJSON(area, key) {
  try {
    const t = area.getItem(key);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function createStore(area) {
  let failed = false;
  const write = (key, value) => {
    try {
      area.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      failed = true;
      return false;
    }
  };
  return {
    loadSettings: () => normalizeSettings(readJSON(area, KEYS.settings)),
    saveSettings: (s) => write(KEYS.settings, normalizeSettings(s)),
    // 対局の途中（本体が壊れていれば控え）。なければ null。種類のない前の記録は東南戦。
    // ルールのない前の記録は、標準のルールに前の対局の長さを入れたもの（段階2-3）
    loadMatch() {
      const main = readJSON(area, KEYS.match);
      const backup = validMatch(main) ? null : readJSON(area, KEYS.matchBackup);
      const rec = validMatch(main) ? main : validMatch(backup) ? backup : null;
      if (!rec) return null;
      const rules = rec.rules ? normalizeRules(rec.rules) : normalizeRules(null, rec.type || 'tonnan');
      return { ...rec, rules, type: rules.length, coach: normalizeCoachLog(rec.coach) };
    },
    saveMatch(m) {
      const rules = normalizeRules(m.rules, m.type || 'tonnan');
      const rec = { v: 1, seed: m.seed, cast: m.cast, type: rules.length, rules, log: m.log, coach: normalizeCoachLog(m.coach), savedAt: m.savedAt || new Date().toISOString() };
      const ok = write(KEYS.match, rec);
      write(KEYS.matchBackup, rec);
      return ok;
    },
    clearMatch() {
      try {
        area.removeItem(KEYS.match);
        area.removeItem(KEYS.matchBackup);
      } catch {
        failed = true;
      }
    },
    // 前の半荘（段階3-1）：種・相手・ルール・全員の返事・指南の記録・終局の点数。形が壊れていれば null
    saveLast(m) {
      const rules = normalizeRules(m.rules);
      return write(KEYS.last, { v: 1, seed: m.seed, cast: m.cast, type: rules.length, rules, log: m.log, coach: normalizeCoachLog(m.coach), defen: m.defen, task: taskOf(m.task), savedAt: m.savedAt || new Date().toISOString() });
    },
    loadLast() {
      const rec = readJSON(area, KEYS.last);
      if (!validMatch(rec) || !validRules(rec.rules)) return null;
      if (!Array.isArray(rec.defen) || rec.defen.length !== 4 || !rec.defen.every(Number.isFinite)) return null;
      return { ...rec, coach: normalizeCoachLog(rec.coach), task: taskOf(rec.task) };
    },
    clearLast() {
      try {
        area.removeItem(KEYS.last);
      } catch {
        failed = true;
      }
    },
    // 今日の課題（段階3-1）：{ reason, setAt }。知らない問いなら null
    saveTask(t) {
      return write(KEYS.task, { reason: t.reason, setAt: t.setAt || new Date().toISOString() });
    },
    loadTask() {
      const t = readJSON(area, KEYS.task);
      return t && Object.hasOwn(TASK_TIPS, t.reason) ? { reason: t.reason, setAt: t.setAt } : null;
    },
    // 問題集（段階3-3 設計書 9章）：{ archive, problems, history }。壊れていれば空。書庫にない半荘の問題は読まない（書きかけでも壊れない）
    loadStudy() {
      const arr = (k) => {
        const v = readJSON(area, k);
        return Array.isArray(v) ? v : [];
      };
      const archive = arr(KEYS.archive).filter((g) => g && typeof g.id === 'string');
      const ids = new Set(archive.map((g) => g.id));
      const problems = arr(KEYS.problems).filter((p) => p && ids.has(p.gameId) && Array.isArray(p.tries));
      return { archive, problems, history: arr(KEYS.history) };
    },
    // 書けなければ、書庫の古い半荘（と問題）を1つずつ捨てて書き直す。全部捨てても書けなければ false（失敗を覚える）
    saveStudy(state) {
      const put = (key, value) => {
        try {
          area.setItem(key, JSON.stringify(value));
          return true;
        } catch {
          return false;
        }
      };
      let s = { archive: state.archive.slice(), problems: state.problems.slice(), history: state.history.slice() };
      for (;;) {
        if (put(KEYS.archive, s.archive) && put(KEYS.problems, s.problems) && put(KEYS.history, s.history)) return true;
        if (!s.archive.length) {
          failed = true;
          return false;
        }
        const gone = s.archive[0].id;
        s = { archive: s.archive.slice(1), problems: s.problems.filter((p) => p.gameId !== gone), history: s.history };
      }
    },
    clearStudy() {
      try {
        area.removeItem(KEYS.archive);
        area.removeItem(KEYS.problems);
        area.removeItem(KEYS.history);
      } catch {
        failed = true;
      }
    },
    // 保存に失敗したことがあるか（一度だけ知らせるため、読むと元に戻す）
    // 道場の記録（段階4）：読むときは形をそろえる（壊れていれば空の記録）
    loadDojo: () => normalizeDojo(readJSON(area, KEYS.dojo)),
    saveDojo: (rec) => write(KEYS.dojo, rec),
    clearDojo() {
      try {
        area.removeItem(KEYS.dojo);
      } catch {
        failed = true;
      }
    },
    takeFailure() {
      const f = failed;
      failed = false;
      return f;
    },
  };
}
