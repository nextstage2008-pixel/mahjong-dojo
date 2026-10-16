// 問い直し（段階3-1 の感想戦から切り出し。段階3-3 の問題集でも使う）：対局の記録をその判断の位置まで作り直して卓を描き、
// 選び直し（手牌・リーチ・鳴きのボタン）と理由（型のボタン4つ）を受けて採点し、答え合わせの帯とヒントの表まで出す。
// 下の段（次へ・閉じる など）は呼ぶ側が描く。採点は指南の流れを場面ごとに新しく作って行う（試しの種は場面から決まるので、
// 対局中と同じ数字になる）。
import { rebuildAt } from '../core/rebuild.js';
import { tableView, tileName } from './view-model.js';
import { feltHTML, topHTML, meHTML, callButtonHTML, esc } from './table-html.js';
import { buttonsFor, allowedIndexes, discardOption } from './actions.js';
import { reasonHTML, hintSheetHTML } from './coach-html.js';
import { askBandHTML, verdictBandHTML, mineLine, reasonKindOf } from './review-html.js';
import { createReviewFlow } from './review-flow.js';
import { sceneOf, callSceneOf } from '../coach/scene.js';
import { createCoachSession } from '../coach/session.js';
import { keyOf } from '../coach/count.js';
import { isCorrect } from '../coach/grade.js';
import { readOf, truthOf, reviewTruth } from '../coach/read.js';
import { seatStyles } from '../core/cast.js';

// root：画面（ヒントの表を重ねる）。els：{ top, felt, band, meEl }。src(code, view)：牌の絵。run：試しを動かす（runner.run）
export function createQuestion({ root, els, src, run }) {
  const { top, felt, band, meEl } = els;
  let token = 0; // 問いごとの番号（試しの途中で次の問いへ進んだら、前の答えを出さない）
  let disposed = false;

  const setBand = (html, buttons = '') => {
    band.querySelector('.cbox').innerHTML = html;
    band.classList.toggle('has-coach', !!html);
    band.querySelector('.btns').innerHTML = buttons;
  };

  // record：対局の記録（{ seed, cast, rules, log }）。entry：指南の記録の1件（at・kind・chosen など）。
  // askHTML(entry)：問い直しの帯。verdictHTML({ mine, before, ok })：答え合わせの帯。
  // onGraded({ ok, key, mine, before })：採点が終わったとき。onError(e)：卓を作り直せなかったとき
  async function ask({ record, entry, askHTML = askBandHTML, verdictHTML = ({ mine, before, ok }) => verdictBandHTML({ mine, before, noticed: ok }), onGraded = () => {}, onError = () => {} }) {
    const my = ++token;
    const stale = () => my !== token || disposed;
    setBand('<div class="coach"><div>卓を並べています…</div></div>');
    let r;
    try {
      r = await rebuildAt(record, entry.at);
    } catch (e) {
      if (!stale()) onError(e);
      return;
    }
    if (stale()) return;
    const player = r.player;
    const v = tableView(player.model, 0, record.cast);
    top.innerHTML = topHTML(v, src);
    felt.innerHTML = feltHTML(v, src);
    const isCall = r.kind === 'otherDapai';
    const opts = { matchSeed: record.seed, rule: player._rule, styles: seatStyles(player.model, record.cast) };
    const choices = r.info.choices || {};
    const scene = isCall
      ? callSceneOf(player.model, player._menfeng, { ...opts, tile: r.info.tile, choices })
      : sceneOf(player.model, player._menfeng, { ...opts, options: choices.dapai || [], lizhi: r.kind === 'myZimo' ? choices.lizhi : null });
    // 採点の指南の流れ：選び直し用と、前の答えの答え合わせ用（どちらも同じ場面・同じ試しの種）
    const make = () => createCoachSession({ run, getLevel: () => 'none', log: [], review: true });
    const mineCoach = make();
    if (isCall) mineCoach.beginCall(scene);
    else mineCoach.begin(scene);
    // 問い直しの段階（review-flow.js）：採点が始まったら手牌もボタンも理由も受け付けない
    const flow = createReviewFlow();
    let riichi = false;

    const renderHand = () => {
      const options = isCall ? null : riichi ? choices.lizhi : choices.dapai;
      const open = flow.phase === 'ask' || flow.phase === 'reason';
      // 採点が始まったら、手牌は押せない形で描く（選べる牌なし）
      const allowed = options ? (open ? allowedIndexes(options, v.me.tiles, v.me.zimo) : new Set()) : null;
      meEl.innerHTML = meHTML(v, src, { selected: flow.selected, allowed });
      if (!options || !open) return;
      for (const el of meEl.querySelectorAll('.ht')) {
        const idx = +el.dataset.i;
        if (!allowed.has(idx)) continue;
        el.addEventListener('click', () => {
          const act = flow.tapTile(idx);
          if (act.action === 'ignore') return;
          meEl.querySelectorAll('.ht').forEach((x) => x.classList.toggle('up', +x.dataset.i === flow.selected));
          // 理由を聞いている間に別の牌を押したら、問い直しに戻す
          if (act.action === 'cancelReason') return askBand();
          if (act.action !== 'choose') return;
          const code = idx === -1 ? v.me.zimo : v.me.tiles[idx];
          const opt = discardOption(options, code, idx === -1);
          if (!opt) return;
          askReason(keyOf(opt) + (riichi ? '*' : ''), `${tileName(code)}を切ります`);
        });
      }
    };

    // 問い直しの帯：何切る・押し引きは手牌（リーチできればリーチのボタン）、鳴きはポン・チー・鳴かないのボタン
    const askBand = () => {
      let buttons = [];
      if (isCall) {
        buttons = buttonsFor('otherDapai', { ...choices, hule: false, gang: [] }).map((b) => ({ ...b, key: b.id === 'skip' ? 'skip' : b.reply.fulou }));
      } else if (r.kind === 'myZimo' && choices.lizhi && choices.lizhi.length) {
        buttons = [{ label: riichi ? 'リーチをやめる' : 'リーチ', toggle: true }];
      }
      setBand(askHTML(entry), buttons.map((b, k) => `<button class="btn" data-b="${k}" aria-label="${esc(b.label)}">${callButtonHTML(b, src, { compact: buttons.length > 3 })}</button>`).join(''));
      band.querySelectorAll('.btns button').forEach((el) => el.addEventListener('click', () => {
        const b = buttons[+el.dataset.b];
        if (b.toggle) {
          if (flow.phase !== 'ask') return;
          riichi = !riichi;
          renderHand();
          askBand();
          return;
        }
        if (flow.pressButton().action !== 'choose') return;
        askReason(b.key, b.id === 'skip' ? '鳴きません' : `${b.word}します`);
      }));
    };

    // 理由を選ぶ（型のボタン4つ）→ 採点
    const askReason = (key, prompt) => {
      const kind = reasonKindOf(entry);
      setBand(reasonHTML('', kind, prompt));
      band.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => {
        const act = flow.pickReason(b.dataset.reason);
        if (act.action === 'grade') grade(key, act.reason);
      }));
    };

    const grade = async (key, reason) => {
      setBand('<div class="coach"><div>採点中…</div></div>');
      renderHand();
      const before = make();
      if (isCall) before.beginCall(scene);
      else before.begin(scene);
      let mine;
      let prev;
      try {
        [mine, prev] = await Promise.all([
          isCall ? mineCoach.finishCall(key, reason) : mineCoach.finish(key, reason),
          isCall ? before.finishCall(entry.chosen, null) : before.finish(entry.chosen, null),
        ]);
      } catch (e) {
        // 記録が壊れていて採点できない（前の答えがその手にない など）。止まらずに、作り直せないときと同じく知らせる
        if (!stale()) onError(e);
        return;
      }
      if (stale()) return;
      flow.graded();
      // 問い直しの採点（review）は必ず答えを返す。返らなければ「損なし」とする（念のため）
      const ok = mine ? isCorrect(mine.grade) : true;
      const line = mineLine({ kind: entry.kind, chosen: key }, mine);
      const verdict = mine ? { grade: mine.grade, tag: mine.tag, line } : { grade: 'ok', tag: '損なし', line };
      setBand(verdictHTML({ mine: verdict, before: prev, ok }));
      const hint = band.querySelector('[data-coach="hint"]');
      if (hint && prev) {
        hint.addEventListener('click', () => {
          root.insertAdjacentHTML('beforeend', hintSheetHTML({ where: prev.where, rows: prev.rows, answer: prev, kind: prev.kind, read: truthRead() }));
          const sheet = root.lastElementChild;
          sheet.querySelector('[data-coach="close"]').addEventListener('click', () => sheet.remove());
        });
      } else if (hint) hint.remove();
      onGraded({ ok, key, mine, before: prev });
    };

    // 答え合わせ（段階3-5 設計書 7章）：その時点の読みと、本当の相手の手（答えた後のヒントの表だけに出す）
    const truthRead = () => {
      if (!r.hands) return null;
      const read = readOf(scene);
      const opponents = read.opponents.map((o, i) => {
        const seat = v.seats.find((s) => s.l === o.seat);
        // 本当がダマなら「聴牌（ダマ）」とその時点の気配（段階3-6 設計書 8.2）
        const { label, truth } = reviewTruth(o, scene.opponents[i], truthOf(r.hands[o.seat]), tileName);
        // 気配を札の後ろに足したときは、2行目の理由（why）を重ねて出さない
        return { ...o, label, why: label === o.label ? o.why : null, name: seat ? seat.name : '', truth };
      });
      return { opponents };
    };

    renderHand();
    askBand();
  }

  return {
    ask,
    // 今の問いをやめる（試しの途中の答えを出さない）
    cancel() {
      token++;
    },
    dispose() {
      disposed = true;
    },
  };
}
