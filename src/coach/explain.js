// 説明の文（設計書 3章 explain.js）：数えた数字・試しの結果・採点から、帯の文・答え合わせ・ヒントの表・目安を組み立てる。
// 文は数字から作るので、数字と文が食い違わない。生成 AI の説明に差し替えるときはこのファイルを替える。
import Majiang from '../../vendor/majiang-core.js';
import { tileName } from '../ui/view-model.js';
import { kindOf } from '../core/ai.js';
import { doraKindsOf, doraCount } from './count.js';
import { summaryOf, handCounts } from './sim.js';
import { GRADE_NAME, REASON_NAME } from './grade.js';
import { callYaku } from './spot.js';
import { categoryOf, dangerAll } from './danger.js';
import { readOf, callCount } from './read.js';

// 自分から見た席の呼び方（段階3-7）：1＝下家・2＝対面・3＝上家
const SEAT_WORD = { 1: '下家', 2: '対面', 3: '上家' };
const seatWord = (scene, seat) => SEAT_WORD[(seat - scene.menfeng + 4) % 4];
const readIf = (scene, read = null) => (scene.opponents && scene.opponents.length ? read || readOf(scene) : null);

const pct = (v) => `${Math.round(v * 100)}%`;
const pts = (v) => Math.round(v).toLocaleString('ja-JP');
const plain = (key) => key.replace(/[*!]/g, '');
// 符号つきの点数（「約−700点」）
const signed = (v) => (v < 0 ? '−' + pts(-v) : pts(v));

// 組の呼び方（「9萬・6索」）。3つ以上は「など」
function groupName(g) {
  const names = g.keys.map(tileName);
  return names.length > 2 ? `${names.slice(0, 2).join('・')}など` : names.join('・');
}

// 「全部」の段の帯（設計書 5.1）：型の4つの問いに、この場面の数字を添える。返すのは問いごとの文
export function fullLines(scene, spot) {
  // 帯は1行に収まる長さにする（候補は3つまで）
  const fw = spot.forward.slice().sort((a, b) => b.rep.n - a.rep.n || b.rep.dora - a.rep.dora).slice(0, 3);
  const speed = fw.map((g, i) => `${groupName(g)}${i === 0 ? '切り' : ''}${g.rep.n}${i === 0 ? '枚' : ''}`).join('／');
  let shape;
  if (spot.minX >= 2) shape = `まだ${spot.minX}向聴。形は1向聴から比べます`;
  else if (spot.minX === 1) {
    const byGood = spot.forward.slice().sort((a, b) => b.rep.shape.good - a.rep.shape.good).slice(0, 2);
    shape = '両面率 ' + byGood.map((g) => `${groupName(g)}${pct(g.rep.shape.good)}`).join('／');
  } else {
    shape = '待ち ' + fw.slice(0, 2).map((g) => `${groupName(g)}切り${g.rep.wait.kinds.map(tileName).join('')}${g.rep.wait.n}枚`).join('／');
  }
  const dora = [...doraKindsOf(scene.baopai)].map(tileName);
  const sp = Majiang.Shoupai.fromString(scene.hand);
  const reds = ['m', 'p', 's'].filter((s) => sp._bingpai[s][0] > 0).map((s) => tileName(s + '0'));
  const value = `ドラは${dora.join('・')}${reds.length ? `・${reds.join('・')}` : ''}`;
  return { speed, shape, value, safety: 'リーチなし' };
}

// 「ヒント」の段の1行（試しが終わってから出す）
// 段階3-7：リーチの人がいない押し引き（quiet）は、帯の①自分の手〜④比べると同じ言葉（もとの押し引きの理由 pfReason）
export function hintLine(spot, judgement) {
  if (spot.spot === 'riichi') return 'この場面は、リーチかダマか（どの牌で待つか）を比べます';
  if (!judgement.reason) return 'この場面は、どれを選んでも大きな差はつきません';
  return `この場面は ${REASON_NAME[(spot.quiet && judgement.pfReason) || judgement.reason]} で差がつきます`;
}

// 目安の文（設計書 10章：本とゲームの計算で合うことを確かめたもの）。帯の1行に収まるよう24字以内
export const RULES = {
  // 押し引きと鳴き（段階2-2 設計書 5.4。ネマタ「現代麻雀技術論」の目安と、試しの計算で合うことを確かめたもの）
  fold2: '2向聴以下はほぼ降り',
  pushGood: '良形の聴牌は押してよい',
  oneShanten: '1向聴は降りが基本。広ければ押しも',
  threat: '親や2人の脅威には一段慎重に',
  safer: '押すなら、より安全な牌から',
  compare: '上がる見込みと振り込む見込みを比べる',
  callNoYaku: '役のない鳴きは上がれない',
  callSpeed: '鳴けば速い。安くなりすぎなければ鳴く',
  callMenzen: '門前で高くなる手は鳴かない',
  close: 'どれを選んでも大きな損はない場面',
  back: '受け入れが大きく増えるなら向聴を戻すのも手',
  riichi: '先制の聴牌は基本リーチ。安い手ほど打点が伸びる',
  damaBig: '満貫以上なら、ダマで上がる見込みを取るのも手',
  damaYaku: '役のあるダマで十分な場面（リーチの得が小さい）',
  shape: '1向聴では、両面で聴牌できる形を残す',
  value: '速さと形が同じなら、ドラや役になる牌を残す',
  keep: '向聴数を落とさない（面子や塔子を崩さない）',
  later: 'その先の上がりやすさで差がつく場面もある',
  isolated: '孤立牌どうしは、受け入れが重なる方から切る',
  speed: '向聴数が同じなら、受け入れ枚数の多い方を残す',
};

// 場面に合う目安の一言
export function ruleOf(scene, spot, cands, judgement) {
  const best = judgement.best;
  const ref = judgement.ref;
  // 押し引きと鳴き（段階2-2）：正しい理由から選ぶ
  if (spot.spot === 'pushfold') {
    const fold = best.endsWith('!');
    // 段階3-7：quiet の場面は、もとの押し引きの理由（pfReason）から目安を選ぶ
    const why = judgement.pfReason || judgement.reason;
    if (!why) return RULES.close;
    if (why === 'hand') {
      if (fold) return RULES.fold2;
      // 押すのが最善で①自分の手：聴牌なら良形の聴牌、そうでなければ（押す候補どうしの違い）受け入れの目安
      const bc = (cands || []).find((c) => c.key === plain(best));
      return bc && bc.x === 0 ? RULES.pushGood : RULES.speed;
    }
    if (why === 'threat') return RULES.threat;
    if (why === 'danger') return RULES.safer;
    return fold && spot.minX === 1 ? RULES.oneShanten : RULES.compare;
  }
  if (spot.spot === 'call') {
    if (!judgement.reason) return RULES.close;
    if (best !== 'skip') return RULES.callSpeed;
    const other = judgement.grade === 'ok' ? judgement.mine : ref;
    const r = other && (judgement.ranking || []).find((x) => x.key === other);
    return r && other !== 'skip' && r.win === 0 ? RULES.callNoYaku : RULES.callMenzen;
  }
  if (spot.spot !== 'riichi' && !judgement.reason) return RULES.close;
  if (spot.spot === 'riichi') {
    const top = cands.find((c) => c.key === plain(best));
    if (top && top.x > spot.minX) return RULES.back;
    if (best.endsWith('*')) return RULES.riichi;
    // ダマが最善：上がったときの打点が満貫（8,000点）に届くかで言い分ける
    const r = (judgement.ranking || []).find((x) => x.key === best);
    return r && r.avgWin >= 8000 ? RULES.damaBig : RULES.damaYaku;
  }
  // 目安は、許容ならあなたの牌、そうでなければ比べた相手と最善の違いから選ぶ
  const other = judgement.grade === 'ok' ? judgement.mine : ref;
  const a = cands.find((c) => c.key === plain(best));
  const b = other && cands.find((c) => c.key === plain(other));
  if (a && a.x > spot.minX) return RULES.back;
  if (judgement.reason === 'shape') return RULES.shape;
  if (judgement.reason === 'value') return RULES.value;
  if (a && b && b.x > a.x) return RULES.keep;
  // 受け入れの多さで決まったのでなければ（最善の方が少ない）、受け入れの目安は言わない
  if (a && b && a.n <= b.n) return RULES.later;
  if (a && b && isolated(scene, a.key) && isolated(scene, b.key)) return RULES.isolated;
  return RULES.speed;
}

// 手の中で、その牌が孤立しているか（同じ牌も、2つ以内の隣の牌もない）
export function isolated(scene, key) {
  const sp = Majiang.Shoupai.fromString(scene.hand);
  const k = kindOf(key);
  const b = sp._bingpai[k[0]];
  const n = +k[1];
  if (b[n] !== 1) return false;
  if (k[0] === 'z') return true;
  for (const d of [-2, -1, 1, 2]) if (n + d >= 1 && n + d <= 9 && b[n + d] > 0) return false;
  return true;
}

const shantenName = (x) => (x <= 0 ? '聴牌' : `${x}向聴`);

// 比べた数字の一言。最善が勝っている数字を出す（「49枚 対 41枚」「1向聴 対 2向聴」
// 「向聴は戻るが受け入れ 48枚 対 19枚」「上がる見込み 60% 対 40%」など）
function compareText(cands, sim, judgement, other) {
  const a = cands.find((c) => c.key === plain(judgement.best));
  const b = cands.find((c) => c.key === plain(other));
  const sa = summaryOf(sim, judgement.best);
  const sb = summaryOf(sim, other);
  if (judgement.reason === 'speed' && a && b) {
    if (a.x < b.x) return `${shantenName(a.x)} 対 ${shantenName(b.x)}`;
    if (a.x > b.x) return `${a.n}枚 対 ${b.n}枚（向聴は戻る）`;
    if (a.n > b.n) return `${a.n}枚 対 ${b.n}枚`;
    return `上がる見込み ${pct(sa.win)} 対 ${pct(sb.win)}`;
  }
  if (judgement.reason === 'shape' && a && b && a.shape && b.shape) return `両面率 ${pct(a.shape.good)} 対 ${pct(b.shape.good)}`;
  return `打点 ${pts(sa.avgWin)} 対 ${pts(sb.avgWin)}`;
}

// 鳴く面子の呼び方（「ポン（白）」「チー（3萬・4萬・5萬）」）
function meldName(m) {
  const s = m[0];
  const ds = m.match(/\d/g);
  if (ds.every((d) => d === ds[0] || (d === '0' && ds[0] === '5') || (d === '5' && ds[0] === '0'))) return `ポン（${tileName(s + ds[0].replace('0', '5'))}）`;
  const sorted = ds.slice().sort((a, b) => (a === '0' ? 5 : +a) - (b === '0' ? 5 : +b));
  return `チー（${sorted.map((d) => tileName(s + d)).join('・')}）`;
}

// 候補の呼び方（「9索切り」「リーチ（6索切り）」「ダマ（6索切り）」、リーチの場面で聴牌を外すなら「8索切り（聴牌を外す）」）。
// 押し引きは「押し（5萬切り）」「リーチ（5萬切り）」「降り（白切り）」、鳴きは「鳴かない」「ポン（白）」（段階2-2）
export function actionName(spot, key) {
  if (spot.spot === 'call') return key === 'skip' ? '鳴かない' : meldName(key);
  const t = tileName(plain(key));
  if (spot.spot === 'pushfold') {
    if (key.endsWith('!')) return `降り（${t}切り）`;
    if (key.endsWith('*')) return `リーチ（${t}切り）`;
    return `押し（${t}切り）`;
  }
  if (spot.spot !== 'riichi') return `${t}切り`;
  if (key.endsWith('*')) return `リーチ（${t}切り）`;
  const g = (spot.groups || []).find((x) => x.keys.includes(plain(key)));
  return g && g.rep.x > 0 ? `${t}切り（聴牌を外す）` : `ダマ（${t}切り）`;
}

// 牌の種類の呼び方（危なさ。段階2-2 設計書 4.1）
export const CATEGORY_NAME = {
  genbutsu: '現物', z0: '生牌の字牌', z1: '1枚見えの字牌', z2: '2枚見えの字牌', z3: '3枚見えの字牌',
  suji19: '筋', suji28: '筋', suji37: '筋', nakasuji: '中筋', katasuji: '片筋',
  musuji19: '無筋', musuji28: '無筋', musuji37: '無筋', musuji456: '無筋', nochance: 'ノーチャンス', onechance: 'ワンチャンス',
};

// 場面の牌の危なさの文（「無筋 約12%」「現物」）。2人リーチは種類を言わず合わせた見込みだけ
// 牌の危なさの言葉（段階3-7：相手の材料のある場面は読みの値＝警戒している全員。牌の書き方の名前は警戒している人が1人のときだけ）
function dangerText(scene, key, read = null) {
  const ctx = { visible: scene.visible, own: handCounts(Majiang.Shoupai.fromString(scene.hand)), turn: scene.turn + 1 };
  const k = kindOf(plain(key));
  const r = readIf(scene, read);
  let p;
  let name = '';
  if (r) {
    const d = r.dangers[plain(key)];
    p = d ? d.p : 0;
    const alerted = scene.opponents.filter((o, i) => r.opponents[i] && r.opponents[i].alert);
    if (alerted.length === 1) {
      const o = alerted[0];
      const t = (o.riichi && (scene.threats || []).find((x) => x.seat === o.seat)) || { safe: o.safe };
      name = CATEGORY_NAME[categoryOf(k, t, ctx)] + ' ';
    }
  } else {
    p = dangerAll(k, scene.threats, ctx).p;
    name = scene.threats.length === 1 ? CATEGORY_NAME[categoryOf(k, scene.threats[0], ctx)] + ' ' : '';
  }
  if (p === 0) return '現物';
  return `${name}約${Math.max(1, Math.round(p * 100))}%`;
}

// 帯の②相手の脅威（段階3-7 設計書 5章）：リーチの人は今までの言葉、警戒しているリーチのない人は「下家の鳴き（聴牌6割・高め）」
// 「対面のダマの気配（聴牌5割）」。2人までを「＋」でつなぐ。read：読み（なければ場面から作る）
export function threatLine(scene, read = null) {
  const ts = scene.threats || [];
  const parts = [];
  if (ts.length >= 2) parts.push(`2人リーチ${ts.some((t) => t.dealer) ? '（親あり）' : ''}`);
  else if (ts.length === 1) parts.push(`${ts[0].dealer ? '親' : '子'}のリーチ（${ts[0].at + 1}巡目）`);
  const r = readIf(scene, read);
  if (r) {
    scene.opponents.forEach((o, i) => {
      const x = r.opponents[i];
      if (!x || !x.alert || x.riichi || o.riichi) return;
      const w = Math.round(x.tenpai * 10);
      const seat = seatWord(scene, o.seat);
      parts.push(callCount(o) > 0 ? `${seat}の鳴き（聴牌${w}割・${x.value.label}）` : `${seat}のダマの気配（聴牌${w}割）`);
    });
  }
  return parts.slice(0, 2).join('＋');
}

// 答え合わせの1行（段階3-7 設計書 5章）：あなたの牌でいちばん当たる見込みの高い人への見込みと平均点（1%以上・相手の材料のある場面だけ）
function hitLine(scene, key) {
  const r = readIf(scene);
  if (!r) return null;
  const d = r.dangers[plain(key)];
  const e = d ? d.each.filter((x) => x.alert).sort((a, b) => b.p - a.p)[0] : null;
  if (!e || e.p < 0.01) return null;
  const o = r.opponents.find((x) => x.seat === e.seat);
  return `${seatWord(scene, e.seat)}に当たる見込み${Math.round(e.p * 100)}%・振り込むと平均${o.value.points.toLocaleString('ja-JP')}点`;
}

// 押し引きの全部の段の帯（段階2-2 設計書 5.1）：①自分の手・②相手の脅威・③牌の危なさ・④比べる（試しの後。それまでは null）
export function pushfoldLines(scene, spot, cands, sim = null) {
  const d = (g) => (spot.dangers || {})[g.rep.key] || 0;
  const top = spot.forward.slice().sort((a, b) => b.rep.n - a.rep.n || d(a) - d(b))[0];
  const hand = spot.minX <= 0
    ? `聴牌（${top.rep.wait.kinds.map(tileName).join('・')} ${top.rep.wait.n}枚）`
    : `${spot.minX}向聴・受け入れ${top.rep.n}枚`;
  // ②相手の脅威（段階3-7：警戒している人。リーチの人がいなくても落ちない）
  const read = readIf(scene);
  const threat = threatLine(scene, read);
  // 押す牌が降りる牌と同じ（安全な牌で手も進む）なら1回だけ言う
  const pushText = `押す${tileName(top.rep.key)}は${dangerText(scene, top.rep.key, read)}`;
  const danger = top.rep.key === plain(spot.fold) ? `${pushText}（降りと同じ牌）` : `${pushText}／降りる${tileName(plain(spot.fold))}は${dangerText(scene, spot.fold, read)}`;
  let compare = null;
  if (sim) {
    const pushes = sim.keys.filter((k) => !k.endsWith('!'));
    const bestPush = Math.max(...pushes.map((k) => summaryOf(sim, k).ev));
    compare = `押す 約${signed(bestPush)}点 対 降りる 約${signed(summaryOf(sim, spot.fold).ev)}点`;
  }
  return { hand, threat, danger, compare };
}

// 鳴きの全部の段の帯（段階2-2 設計書 5.1）：①速さ・③打点・④安全。cands：callCandidates の結果
export function callLines(scene, spot, cands) {
  const now = cands.find((c) => c.key === 'skip').x;
  const after = Math.min(...cands.filter((c) => c.key !== 'skip').map((c) => c.x));
  const speed = `鳴けば${shantenName(after)}（今は${shantenName(now)}）`;
  const sp = Majiang.Shoupai.fromString(scene.hand);
  // すでにある役：鳴いてある役牌の面子と、手の中の役牌の刻子（spot.js の callYaku）
  const { pon, meld: doneMeld, anko, allSimple, wide } = callYaku(scene);
  // 染め手・対々和の方向の鳴き（段階3-5 最後のレビューの直し）：「役がないかも」と言わず、見込みの役を書く
  const wideText = wide ? (wide.kind === 'honitsu' ? `鳴けば${{ m: '萬子', p: '筒子', s: '索子' }[wide.tile]}の混一色の見込み` : '鳴けば対々和の見込み') : null;
  const yaku = pon ? `${tileName('z' + pon[1])}のポンで役がつく`
    : doneMeld ? `役は${tileName('z' + doneMeld[1])}（鳴いてある）`
      : anko ? `役は${tileName(anko)}（暗刻）`
        : allSimple ? '鳴いても断么九の見込み' : wideText || '鳴くと役がないかも';
  // ドラの数（手と鳴いてある面子と、鳴く牌）
  const dora = doraKindsOf(scene.baopai);
  const dn = doraCount(sp, dora) + (dora.has(kindOf(scene.tile.slice(0, 2))) ? 1 : 0) + (scene.tile[1] === '0' ? 1 : 0);
  const value = dn > 0 ? `${yaku}・ドラ${dn}` : yaku;
  // ④安全は、リーチを受けているとき（設計書 5.1）と、警戒している人がいるとき（段階3-7）だけ帯に出す。文は帯の1行に収まる短さにする
  const riichi = !!(scene.threats && scene.threats.length);
  const r = riichi ? null : readIf(scene);
  const alert = !!(r && r.alert);
  return { speed, value, safety: riichi ? 'リーチあり' : alert ? '警戒している人あり' : 'リーチなし', threat: riichi || alert };
}

// 押し引きと鳴きの比べた数字の一言（段階2-2）
function decisionCompare(scene, spot, cands, sim, judgement, other) {
  const sa = summaryOf(sim, judgement.best);
  const sb = summaryOf(sim, other);
  if (spot.spot === 'pushfold' && judgement.reason === 'danger') {
    return `${tileName(plain(judgement.best))}は${dangerText(scene, judgement.best)} 対 ${tileName(plain(other))}は${dangerText(scene, other)}`;
  }
  if (spot.spot === 'call') {
    const a = cands.find((c) => c.key === judgement.best);
    const b = cands.find((c) => c.key === other);
    if (judgement.reason === 'speed' && a && b && a.x !== b.x) return `${shantenName(a.x)} 対 ${shantenName(b.x)}`;
    if (judgement.reason === 'value' && other !== 'skip' && sim.wins[other] === 0) return '鳴くと役がない';
    if (judgement.reason === 'value') return `打点 ${pts(sa.avgWin)} 対 ${pts(sb.avgWin)}`;
  }
  // 帯の1行に収まるよう短く（見込める点数どうし）
  return `${signed(sa.ev)}点 対 ${signed(sb.ev)}点`;
}

// あなたの判断の呼び方に使う名前：組の代表（mine）でなく、あなたが切った牌（降りとみたときは降りのまま）
function chosenKey(judgement) {
  const { mine, chosen } = judgement;
  if (!chosen || mine.endsWith('!') || chosen === 'skip' || mine === 'skip' || /[-=+]/.test(mine)) return mine;
  return plain(chosen) + (mine.endsWith('*') ? '*' : '');
}

// 答え合わせ（設計書 5.3）：判定の札・3行。reason：あなたが選んだ理由（聞かなかったら null）。
// pfWords：リーチの人がいない押し引き（quiet）を押し引きの帯で見せた段（全部・ヒント）。決め手の名前を押し引きの言葉にする（段階3-7）
export function answerLines(scene, spot, cands, sim, judgement, reason = null, { pfWords = false } = {}) {
  const tag = judgement.grade === 'best' || judgement.grade === 'ok'
    ? GRADE_NAME[judgement.grade]
    : `${GRADE_NAME[judgement.grade]} 約−${pts(judgement.loss)}点`;
  const lines = [];
  const right = judgement.reason;
  const rightName = REASON_NAME[(pfWords && judgement.pfReason) || right];
  if (spot.spot === 'riichi') {
    const bs = summaryOf(sim, judgement.best);
    const dama = sim.keys.includes(plain(judgement.best)) ? summaryOf(sim, plain(judgement.best)) : null;
    lines.push(`最善は${actionName(spot, judgement.best)}`);
    if (judgement.best.endsWith('*') && dama && dama.avgWin > 0) {
      lines.push(`打点は約${(bs.avgWin / dama.avgWin).toFixed(1)}倍、上がる見込みは ${pct(dama.win)} → ${pct(bs.win * 0.86)}`);
    } else lines.push(`見込める点数 ${pts(bs.ev)}点`);
  } else if (judgement.grade === 'best' || judgement.grade === 'ok') {
    const others = (judgement.alsoOk || []).filter((k) => k !== judgement.mine).slice(0, 2).map((k) => actionName(spot, k));
    const cmp = (o) => (spot.spot === 'pushfold' || spot.spot === 'call' ? decisionCompare(scene, spot, cands, sim, judgement, o) : compareText(cands, sim, judgement, o));
    lines.push(judgement.grade === 'best'
      ? `${actionName(spot, judgement.best === judgement.mine ? chosenKey(judgement) : judgement.best)}${others.length ? `（${others.join('・')}も許容）` : ''}`
      : `最善は${actionName(spot, judgement.best)}。${actionName(spot, chosenKey(judgement))}との差はわずか`);
    lines.push(judgement.ref
      ? `決め手は${rightName}：${actionName(spot, judgement.ref)}より ${cmp(judgement.ref)}`
      : spot.spot === 'call' ? '鳴いても鳴かなくても大きな差はありません' : 'どれを切っても大きな差はありません');
  } else {
    const cmp = spot.spot === 'pushfold' || spot.spot === 'call' ? decisionCompare(scene, spot, cands, sim, judgement, judgement.mine) : compareText(cands, sim, judgement, judgement.mine);
    lines.push(`最善は ${actionName(spot, judgement.best)}（${cmp}）`);
    lines.push(`${rightName}で差がつきました`);
  }
  // 理由の正否は、牌が正答のときだけ言う（牌が違えば、上の行の「○で差がつきました」が正しい理由）。
  // 文には足さず、札の横の印にする（帯に収めるため。正しい理由は上の行の「決め手は○」に出ている）
  const mark = reason && right && (judgement.grade === 'best' || judgement.grade === 'ok') ? { ok: reason === right, right } : null;
  // 段階3-7：押し引きの答えに、あなたの牌でいちばん当たる見込みの高い人への見込みと平均点
  const hit = spot.spot === 'pushfold' ? hitLine(scene, chosenKey(judgement)) : null;
  if (hit) lines.push(hit);
  lines.push(`目安：${ruleOf(scene, spot, cands, judgement)}`);
  return { tag, grade: judgement.grade, lines, reason: mark };
}

// ヒントの表の行（設計書 5.4）：候補の組ごとに 向聴・受け入れ・両面になる割合・見込める点数（試し中は null）・判定。
// 押し引きと鳴き（段階2-2 設計書 5.5）は、候補ごとに 向聴・上がる見込み・振り込む見込み・見込める点数
export function hintRows(spot, cands, sim = null, judgement = null) {
  if (spot.spot === 'pushfold' || spot.spot === 'call') return decisionRows(spot, cands, sim, judgement);
  const keys = sim ? sim.keys : [];
  const rows = [];
  for (const g of spot.groups) {
    const variants = keys.filter((k) => plain(k) === g.rep.key);
    for (const key of variants.length ? variants : [g.rep.key]) {
      const s = sim && keys.includes(key) ? summaryOf(sim, key) : null;
      rows.push({
        key,
        name: spot.spot === 'riichi' && g.rep.x === 0 ? actionName(spot, key) : groupName(g),
        x: g.rep.x,
        n: g.rep.n,
        good: g.rep.shape ? g.rep.shape.good : null,
        ev: s ? s.ev : null,
        // 段階3-5：聴牌の見込み・上がる見込み・上がりに多く付いた役（試しの前は空）
        tenpai: s ? s.tenpai : null,
        win: s ? s.win : null,
        yaku: s ? s.yakuTop : [],
        best: judgement ? judgement.best === key : false,
        mine: judgement ? judgement.mine === key : false,
      });
    }
  }
  rows.sort((a, b) => (b.ev ?? -1e9) - (a.ev ?? -1e9) || a.x - b.x || b.n - a.n);
  return rows;
}

// 理由が正しかったか（牌が正答で、選んだ理由が正しい理由と同じ）
export function reasonCorrect(judgement, reason) {
  return !!reason && reason === judgement.reason && (judgement.grade === 'best' || judgement.grade === 'ok');
}

// 押し引きと鳴きのヒントの表の行（段階2-2 設計書 5.5）
function decisionRows(spot, cands, sim, judgement) {
  const keys = sim ? sim.keys : spot.spot === 'call' ? spot.keys : [...spot.forward.map((g) => g.rep.key), spot.fold];
  const rows = keys.map((key) => {
    const s = sim ? summaryOf(sim, key) : null;
    const c = cands.find((x) => x.key === plain(key) || x.key === key);
    return {
      key,
      name: actionName(spot, key),
      x: key.endsWith('!') ? null : c ? c.x : null,
      n: c && c.n !== undefined ? c.n : null,
      good: null,
      ev: s ? s.ev : null,
      win: s ? s.win : null,
      // 段階3-5：聴牌の見込みと上がりに多く付いた役
      tenpai: s ? s.tenpai : null,
      yaku: s ? s.yakuTop : [],
      dealin: sim && sim.dealins ? sim.dealins[key] / sim.runs : null,
      best: judgement ? judgement.best === key : false,
      mine: judgement ? judgement.mine === key : false,
    };
  });
  rows.sort((a, b) => (b.ev ?? -1e9) - (a.ev ?? -1e9));
  return rows;
}
