// 卓の画面をつなぐところ。部品の Player に「view（盤面が変わった知らせを受ける）」と
// 「agent（自分の選ぶことを返す）」として渡す。動き・音・声が終わるまで返事を待たせて、進む速さを決める。
import { tableView, tileName, revealOf, arrowFrom } from './view-model.js';
import { feltHTML, platesHTML, topHTML, meHTML, callButtonHTML, esc, bottomBarHTML, readTagsHTML } from './table-html.js';
import { buttonsFor, messageFor, allowedIndexes, discardOption, autoReply, riichiAutoDiscard, waitingMessage, usedHandTiles, callVerdictPlace, callButtonsCompact, cutInSpec, FX_MS, handTouch, traceTick } from './actions.js';
import { huleHTML, pingjuHTML, jiejuHTML, dealInLineHTML, damaLineHTML, damaLineFor } from './result-html.js';
import { kindOf } from '../core/ai.js';
import { readSyncPlan } from './read-sync.js';
import { handDelta } from '../core/samewall.js';
import { callOf, huleChatter, pingjuCalls, jiejuChatter, shouldChat } from './voices.js';
import { flyTile, handRects, flipHand, slideIn, cutIn, wait, toLocal, glowAt, dropStick, flash, arrowFx, flyCopy } from './anim.js';
import { vibrate } from './audio.js';
import { heroine, seatStyles } from '../core/cast.js';
import { profileOf, avatarSrc } from '../core/profile.js';
import { spotHTML, reasonHTML, pendingHTML, answerHTML, hintSheetHTML, levelButtonHTML, callVerdictHTML } from './coach-html.js';
import { sceneOf, callSceneOf } from '../coach/scene.js';
import { keyOf } from '../coach/count.js';
import { nextLevel, LEVEL_NAME } from '../coach/session.js';

const RIVER_TURN = { 0: 0, 1: -90, 2: 180, 3: 90 };

// coach：指南の流れ（coach/session.js。自動で打つときは null）。matchSeed：対局の種。
// setCoachLevel(level)：指南の量を切り替えたとき（設定に保存する）
// getPosition：自分への知らせの何番目か（段階3-1。感想戦で卓を作り直すため、指南の記録に書く）。
// getHandNote({ start, where, mine })：局の結果の画面に足す「この局」の HTML（段階3-2。出さないなら null）。
// practice：打ち直し（段階3-2。{ startDefen, onEnd(delta) }）。局の結果の画面の後に onEnd を呼んで止まる（指南・保存は呼ぶ側が付けない）
export function createTableUI({ root, art, audio, voices, getSettings, cast, auto = false, speed = 1, scale = () => 1, onMenu = () => {}, coach = null, matchSeed = 0, setCoachLevel = () => {}, getPosition = () => null, getHandNote = () => null, practice = null }) {
  const level = coach ? levelButtonHTML(getSettings().coachLevel) : '';
  root.innerHTML = `<div class="mj-top"></div><div class="mj-feltbox"><div class="mj-felt"></div></div><div class="mj-band"><div class="cbox"></div><span class="msg"></span></div><div class="mj-acts"><span class="btns"></span></div><div class="mj-me"></div>${bottomBarHTML({ level, practice: !!practice })}<div class="mj-fx"></div><div class="mj-overlay"></div>`;
  const $ = (sel) => root.querySelector(sel);
  const top = $('.mj-top');
  const felt = $('.mj-felt');
  const band = $('.mj-band');
  const meEl = $('.mj-me');
  const overlay = $('.mj-overlay');
  const fxEl = $('.mj-fx'); // 演出の層（手直し 6章・7章。描き直さない）
  // 手牌をなぞる音（パソコンのマウスだけ・自分の番でなくても）：手牌の器で、別の牌に乗り移ったら鳴らす。器は描き直さないので1回だけ付ける。
  // 自分の切る番には、なぞった牌（切れる牌だけ）を一段上げる（hov。1回のクリックで切る。先生 2026-10-17）
  let traceLast = null;
  let traceAt = -Infinity;
  meEl.addEventListener('pointerover', (e) => {
    const t = e.target.closest('.ht');
    const tile = t ? t.dataset.i : null;
    const now = performance.now();
    const lift = e.pointerType === 'mouse' && t && !t.classList.contains('no') && !!discardOptions();
    meEl.querySelectorAll('.ht').forEach((x) => x.classList.toggle('hov', lift && x === t));
    if (traceTick({ pointerType: e.pointerType, tile, last: traceLast, now, lastAt: traceAt })) { traceAt = now; audio.trace(); }
    if (tile !== null) traceLast = tile;
  });
  meEl.addEventListener('pointerleave', () => { traceLast = null; meEl.querySelectorAll('.ht.hov').forEach((x) => x.classList.remove('hov')); });
  root.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => onMenu(b.dataset.menu)));
  const levelBtn = root.querySelector('[data-coach="level"]');
  if (levelBtn) levelBtn.addEventListener('click', () => { audio.unlock(); changeLevel(nextLevel(getSettings().coachLevel)); });

  const src = (c, v) => art.src(c, v);
  // リーチの後に自動で切るまでの間（引いた牌を見せる）
  const RIICHI_AUTO_MS = 650;
  const T = (ms) => ms * speed;
  let player = null; // 自分の Player（盤面は player.model）
  let replaying = false;
  let chain = Promise.resolve(); // 動きの順番待ち
  let ask = null; // いま自分に問われていること { kind, info, resolve, mode, selected }
  let pendingSource = null; // 自分が切った牌の元の位置
  let disposed = false; // タイトルへ戻ったあと（動きも音も止める）
  // 指南（設計書 5章）
  let coachView = null; // 切る前の帯（考えどころのとき）
  let coachAnswer = null; // 答え合わせ（次に問われるまで帯に残す）
  let coachPending = false; // 採点中
  let reasonPick = null; // 理由を待っている打牌か鳴き { reply, key, label, rect, kind（理由の型）, prompt（鳴きの「ポンします」など）, call }
  let callVerdict = null; // 鳴いた後の打牌（鳴かなかったら次の自分の番）の帯の上に残す鳴きの答え合わせ（段階2-2 設計書 5.4。'pending' は採点中）
  let callToken = null;
  let endChoice = 'title'; // 終局のあと：'title'（タイトルへ）か 'review'（感想戦をする）
  let zimoSlide = null; // 自分が引いた牌の滑り込みを始めた時刻（描き直しても途中から続けるため）
  let reveal = null; // 上がった相手の倒した手（手直し 7章。{ rel, tiles, win }。次の配牌で外す）
  let hand = null; // 今の局（段階3-2）：{ start（配牌の知らせの位置）, defen（配牌のときの点数）, where }。続きからで再生した局は null // いま待っている鳴きの答え合わせの印（役目を終えた後に届いた答えを出さないため）
  let sheet = null; // 開いているヒントの表 { el, before（切る前か）, done（閉じたら呼ぶ） }

  const enqueue = (fn) => { chain = chain.then(() => (disposed ? undefined : fn())).catch((e) => console.error(e)); return chain; };
  const mySeat = () => player._menfeng;
  const relOf = (l) => (l - mySeat() + 4) % 4;
  const idOf = (l) => player.model.player_id[l];
  const view = () => tableView(player.model, 0, cast);
  // 自分の名前とアバター（画面の作り直し 段3。設定から。名前が空なら「あなた」）
  const me = () => profileOf(getSettings());
  const ready = () => player && player.model.shan;

  // 鳴ける場面：出した人の席（自分から見た位置）。卓ではその人の河の最後の牌を光らせる
  const callRel = () => (ask && ask.kind === 'otherDapai' ? relOf(ask.info.dapai.l) : null);
  // 鳴ける場面の一言に使う「誰の何を」
  function callInfo() {
    if (!ask || (ask.kind !== 'otherDapai' && ask.kind !== 'otherGang')) return null;
    const v = view();
    const l = ask.kind === 'otherDapai' ? ask.info.dapai.l : ask.info.gang.l;
    const tile = ask.kind === 'otherDapai' ? ask.info.dapai.p.slice(0, 2) : ask.info.gang.m[0] + ask.info.gang.m.slice(-1);
    const seat = v.seats.find((s) => s.l === l);
    return { name: seat ? seat.name : '', tile, ron: !!(ask.info.choices && ask.info.choices.hule) };
  }

  // 読みの札（段階3-5 設計書 6.3）：今の帯が読みを出す番なら、警戒している相手の札。卓に出している札の HTML を覚えておき、
  // 変わったときだけ卓を描き直す（毎回描き直すと演出の途中の河の牌が消えるため）
  let tagsShown = '';
  // 手牌に描いた印（renderMe が覚える。試しが終わっても印が変わらなければ手牌を描き直さない。最後のレビューの直し）
  let marksShown = null;
  const readTagsOf = (v) => (coachView && coachView.read ? readTagsHTML(coachView.read.opponents, v.seats) : '');
  const marksNow = () => (coach && ask && (ask.kind === 'myZimo' || ask.kind === 'myFulou') ? coach.readMarks() : null);
  function syncRead() {
    if (!ready()) return;
    const v = view();
    const tags = readTagsOf(v);
    const plan = readSyncPlan({ tags: tagsShown, marks: marksShown }, { tags, marks: marksNow() });
    if (plan.felt) {
      felt.innerHTML = feltHTML(v, src, { callFrom: callRel(), reveal, readTags: tags }) + platesHTML(v, { meName: me().name, meAvatar: me().avatar });
      tagsShown = tags;
    }
    if (plan.hand) renderMe(v);
  }

  function render() {
    if (!ready()) return;
    const v = view();
    top.innerHTML = topHTML(v, src);
    tagsShown = readTagsOf(v);
    felt.innerHTML = feltHTML(v, src, { callFrom: callRel(), reveal, readTags: tagsShown }) + platesHTML(v, { meName: me().name, meAvatar: me().avatar });
    renderMe(v);
    renderBand();
  }

  function discardOptions() {
    if (!ask || (ask.kind !== 'myZimo' && ask.kind !== 'myFulou')) return null;
    return ask.mode === 'riichi' ? ask.info.choices.lizhi : ask.info.choices.dapai;
  }

  function renderMe(v = view()) {
    const opts = discardOptions();
    const allowed = opts ? allowedIndexes(opts, v.me.tiles, v.me.zimo) : null;
    const lift = ask && ask.kind === 'otherDapai' ? usedHandTiles(ask.info.choices || {}) : null;
    // 手牌の印（段階2-2 設計書 5.2・段階3-5 設計書 6.2）：読みを出す番は、警戒している相手みんなへのロンされる確率
    const danger = marksNow();
    marksShown = danger;
    meEl.innerHTML = meHTML(v, src, { selected: ask ? ask.selected : null, allowed, lift, danger, land: true });
    if (opts) bindHand(allowed, v);
    // 引いた牌の滑り込みの途中なら、描き直した牌でも続ける
    if (zimoSlide !== null) {
      const elapsed = performance.now() - zimoSlide;
      const z = meEl.querySelector('.ht.zimo');
      if (elapsed < T(170) && z) slideIn(z, T(170), elapsed);
      else zimoSlide = null;
    }
  }

  // 手牌の操作：2回タップ（1回目で浮く・2回目で切る）または上へはじく。どちらも触れた瞬間に反応する（handTouch。先生のご要望）
  function bindHand(allowed, v) {
    for (const el of meEl.querySelectorAll('.ht')) {
      const i = +el.dataset.i;
      if (!allowed.has(i)) continue;
      let sx = 0, sy = 0, st = 0, moved = false, pid = null, fired = false;
      el.addEventListener('pointerdown', (e) => {
        audio.unlock();
        pid = e.pointerId;
        el.setPointerCapture(pid);
        sx = e.clientX; sy = e.clientY; st = performance.now(); moved = false; fired = false;
        if (!ask) return;
        if (handTouch('down', { selected: ask.selected === i, mouse: e.pointerType === 'mouse' }) === 'discard') {
          fired = true;
          return discardAt(i, el, v);
        }
        // 浮かせる。理由を待っている間に別の牌に触れたら、理由の問いを取り消して選び直す（設計書 5.2）
        if (reasonPick) {
          reasonPick = null;
          renderBand();
        }
        ask.selected = i;
        meEl.querySelectorAll('.ht').forEach((x) => x.classList.toggle('up', +x.dataset.i === i));
        audio.tick();
        vibrate(6);
      });
      el.addEventListener('pointermove', (e) => {
        if (pid !== e.pointerId) return;
        const dy = (e.clientY - sy) / scale();
        if (dy < -6) { moved = true; el.style.transform = `translateY(${Math.max(dy, -70)}px)`; }
      });
      el.addEventListener('pointerup', (e) => {
        if (pid !== e.pointerId) return;
        pid = null;
        const dy = (e.clientY - sy) / scale();
        const dt = performance.now() - st;
        el.style.transform = '';
        // 触れた瞬間に切っていれば何もしない。はじいたら切る（触れた瞬間に浮かせた牌でも）
        if (fired || !ask) return;
        if (handTouch('up', { moved, dy, dt }) === 'discard') discardAt(i, el, v);
      });
      el.addEventListener('pointercancel', () => { pid = null; el.style.transform = ''; });
    }
  }

  function discardAt(i, el, v) {
    const opts = discardOptions();
    if (!opts || sheet) return;
    const code = i === -1 ? v.me.zimo : v.me.tiles[i];
    const opt = discardOption(opts, code, i === -1);
    if (!opt) return;
    const riichi = ask.mode === 'riichi';
    const reply = { dapai: riichi ? opt + '*' : opt };
    const key = keyOf(opt) + (riichi ? '*' : '');
    const rect = el.querySelector('img').getBoundingClientRect();
    // なしの段の考えどころでは、牌を浮かせたまま理由を聞く（設計書 5.2）
    if (coach && coachView && !riichi && coach.needsReason()) {
      ask.selected = i;
      meEl.querySelectorAll('.ht').forEach((x) => x.classList.toggle('up', +x.dataset.i === i));
      reasonPick = { reply, key, label: tileName(code), rect, kind: coach.reasonKind() };
      renderBand();
      return;
    }
    discardWith(reply, key, null, rect);
  }

  // 鳴くかを決めた（段階2-2 設計書 3.2・5.4）。答え合わせは、鳴いたら鳴いた後の打牌、鳴かなかったら次の自分の番の帯の上に
  // 1行で残す（鳴かなかったときは、次に問われるまでの待ちの帯にも全部を出す）
  function callWith(reply, key, reason) {
    const fulou = !!reply.fulou;
    // 帯を出していない（役のない鳴きを考えどころ外で調べる）ときは「採点中」を出さず、損なときだけ答えを出す
    const shown = !!coachView;
    finish(reply);
    if (!coach) return;
    const token = {};
    callToken = token;
    callVerdict = shown ? 'pending' : null;
    coachPending = !fulou;
    renderBand();
    coach.finishCall(key, reason).then((answer) => {
      // 答えが届く前に、出しどころの打牌を切り終えていたら出さない（記録は残す。採点中の印は次の問いで消えている）
      if (disposed || callToken !== token) return;
      if (!fulou) coachPending = false;
      callVerdict = answer || null;
      if (!answer) callToken = null;
      // 聞かれていても、その帯に出すか持ち越すかは callVerdictPlace が決める（打牌を聞かれる前に届くこともある）
      if (ask && callVerdictPlace(ask.kind) === 'drop') {
        callVerdict = null;
        callToken = null;
      }
      if (answer && !fulou && !ask) coachAnswer = answer;
      renderBand();
    }).catch((e) => {
      if (callToken === token) {
        coachPending = false;
        callVerdict = null;
        callToken = null;
      }
      console.error(e);
    });
  }

  // 切る（理由を選んだときは reason つき）。指南があれば採点して、答え合わせを帯に出す
  function discardWith(reply, key, reason, rect) {
    pendingSource = rect;
    audio.press();
    // 考えどころの帯を出していたときだけ「採点中」を出す（読みだけの帯では出さない。段階3-5）
    const spot = !!(coachView && coachView.spot);
    finish(reply);
    if (!coach) return;
    const done = coach.finish(key, reason);
    if (spot) {
      coachPending = true;
      renderBand();
    }
    done.then((answer) => {
      // 試しの間に次の番が始まっていたら、その答え合わせは出さない（別の打牌の答えに見えるため）
      if (disposed || (answer && answer.stale)) return;
      coachPending = false;
      if (answer) coachAnswer = answer;
      if (!ask) renderBand();
    }).catch((e) => {
      coachPending = false;
      console.error(e);
    });
  }

  // 指南の量を切り替える（設計書 5.5）
  function changeLevel(lv) {
    setCoachLevel(lv);
    if (levelBtn) levelBtn.textContent = `指南：${LEVEL_NAME[lv]} ▾`;
    refreshCoach();
  }

  // 今の帯を指南の量に合わせて描き直す（ヒントの1行は試しが終わってから）
  function refreshCoach() {
    if (!coach || !ask || !coachView) {
      // 段を変えて読みの帯がなくなった番も、札と印を消す（段階3-5）
      if (coach && ask && (ask.kind === 'myZimo' || ask.kind === 'myFulou')) {
        coachView = coach.view();
        if (coachView) return refreshCoach();
        if (tagsShown) syncRead();
      }
      return renderBand();
    }
    coachView = coach.view();
    syncRead();
    renderBand();
    // 試しが終わってから描き直すもの：ヒントの段の1行と、押し引きの全部の段の④比べる（段階2-2）と、課題の札（段階3-1）。
    // 全部とヒントの段では、試しが終わったらいつも描き直す
    const waitReady = coachView && (coachView.level === 'all' || coachView.level === 'hint');
    if (waitReady) {
      const a = ask;
      coach.ready().then(() => {
        if (ask !== a || !coachView) return;
        coachView = coach.view();
        syncRead();
        renderBand();
      });
    }
  }

  // ヒントの表の相手の札に名前を付ける（段階3-5）
  const namedRead = (read) => (read ? { opponents: read.opponents.map((o) => ({ ...o, name: idOf(o.seat) === 0 ? me().name : heroine(cast[idOf(o.seat) - 1]).name })) } : null);

  // ヒントの表（設計書 5.4）。切る前は全部の表（この判断に「ヒントを見た」印）、切った後は答え合わせの詳しい版
  function openSheet() {
    if (sheet || !coach) return;
    let data;
    if (ask && coachView) {
      const h = coach.hint();
      data = { where: h.where, rows: h.rows, full: h.lines, pending: h.pending, kind: h.kind, read: namedRead(h.read) };
      if (h.pending) {
        const a = ask;
        coach.ready().then(() => {
          if (!sheet || ask !== a) return;
          const again = coach.hint();
          sheet.el.insertAdjacentHTML('afterend', hintSheetHTML({ where: again.where, rows: again.rows, full: again.lines, kind: again.kind, read: namedRead(again.read) }));
          const next = sheet.el.nextElementSibling;
          sheet.el.remove();
          bindSheet(next);
        });
      }
    } else if (coachAnswer) {
      data = { where: coachAnswer.where, rows: coachAnswer.rows, answer: coachAnswer, kind: coachAnswer.kind };
    } else return;
    root.insertAdjacentHTML('beforeend', hintSheetHTML(data));
    sheet = { el: null, before: !!ask, done: null };
    bindSheet(root.lastElementChild);
    if (ask) renderBand();
  }
  function bindSheet(el) {
    sheet.el = el;
    el.querySelector('[data-coach="close"]').addEventListener('click', () => {
      audio.unlock();
      el.remove();
      const done = sheet.done;
      sheet = null;
      if (done) done();
      if (ask) renderBand();
    });
  }
  // 切った後の表が開いていれば、閉じるまで待つ
  const sheetClosed = () => (sheet && !sheet.before ? new Promise((res) => { sheet.done = res; }) : Promise.resolve());

  function finish(reply) {
    const a = ask;
    ask = null;
    coachView = null;
    reasonPick = null;
    // 鳴きの答え合わせを出す打牌（鳴いた後・次の自分の番）を終えたら、その1行は役目を終える
    if (a && callVerdictPlace(a.kind) === 'show') {
      callVerdict = null;
      callToken = null;
    }
    renderBand();
    // 鳴くかどうかを答えたら、光らせた牌と浮かせた手牌を元に戻す
    if (a && a.kind === 'otherDapai' && ready()) { tagsShown = ''; felt.innerHTML = feltHTML(view(), src) + platesHTML(view(), { meName: me().name, meAvatar: me().avatar }); renderMe(); }
    // 切ったら読みの札を消す（段階3-5）
    else if (tagsShown) syncRead();
    meEl.querySelectorAll('.ht').forEach((x) => x.classList.remove('up'));
    if (a) a.resolve(reply);
  }

  // 帯の指南の欄。html が空なら欄を消して、いつもの一言に戻す
  function setCoachBox(html) {
    const box = band.querySelector('.cbox');
    box.innerHTML = html;
    band.classList.toggle('has-coach', !!html);
    box.querySelectorAll('[data-coach="hint"]').forEach((b) => b.addEventListener('click', () => { audio.unlock(); openSheet(); }));
    // ヒントの段の「読み」（段階3-5）：その番だけ読みを出す
    box.querySelectorAll('[data-coach="read"]').forEach((b) => b.addEventListener('click', () => {
      audio.unlock();
      if (!coach || !ask) return;
      coach.showRead();
      coachView = coach.view();
      syncRead();
      renderBand();
    }));
    box.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => {
      audio.unlock();
      if (!reasonPick || !ask) return;
      const r = reasonPick;
      if (r.call) callWith(r.reply, r.key, b.dataset.reason);
      else discardWith(r.reply, r.key, b.dataset.reason, r.rect);
    }));
  }

  function renderBand() {
    const msg = band.querySelector('.msg');
    const btns = root.querySelector('.mj-acts .btns');
    band.classList.remove('has-btns');
    if (!ask) {
      msg.textContent = ready() ? waitingMessage(view()) : '';
      btns.innerHTML = '';
      setCoachBox(coachPending ? pendingHTML() : coachAnswer ? answerHTML(coachAnswer) : '');
      return;
    }
    msg.textContent = messageFor(ask.kind, ask.mode, callInfo());
    if (reasonPick) {
      btns.innerHTML = '';
      setCoachBox(reasonHTML(reasonPick.label, reasonPick.kind || 'discard', reasonPick.prompt || null));
      return;
    }
    const list = ask.mode === 'riichi' ? [{ label: 'やめる', mode: 'none' }] : buttonsFor(ask.kind, ask.info.choices || {});
    // 鳴いた後の打牌・鳴かなかった後の自分の番：鳴きの答え合わせを1行で上に残し、何切るの帯は詰めて下に出す（段階2-2 設計書 5.4）
    const verdict = callVerdict && callVerdictPlace(ask.kind) === 'show' ? callVerdictHTML(callVerdict === 'pending' ? null : callVerdict) : '';
    const spotPart = coachView && ask.mode !== 'riichi' ? spotHTML(coachView, { compact: list.length > 0 || !!verdict }) : '';
    // 考えどころの帯がないときは、答えの1行の下にいつもの一言を出す（指南の欄があると一言の欄は隠れるため）
    const plainMsg = verdict && !spotPart ? `<div class="coach"><div>${esc(msg.textContent)}</div></div>` : '';
    setCoachBox(verdict + (spotPart || plainMsg));
    // 鳴きのボタンは、言葉とできあがる面子の牌の絵。収まらないときは詰めて帯の1段に収める（はみ出すと下の手牌の欄にもぐって押せない）
    const compact = callButtonsCompact(list);
    btns.classList.toggle('compact', compact);
    btns.innerHTML = list.map((b, k) => `<button class="btn ${b.primary ? 'primary' : ''}" data-b="${k}" aria-label="${esc(b.label)}">${callButtonHTML(b, src, { compact })}</button>`).join('');
    // ボタンがあるときは、指南のヒントを帯の右上に移す（右下だとボタンの段の右端に重なって押せない）
    band.classList.toggle('has-btns', list.length > 0);
    btns.querySelectorAll('button').forEach((el) => el.addEventListener('click', () => {
      audio.unlock();
      const b = list[+el.dataset.b];
      if (!ask) return;
      if (b.mode === 'riichi' || b.mode === 'none') {
        ask.mode = b.mode === 'riichi' ? 'riichi' : null;
        ask.selected = null;
        renderMe();
        renderBand();
        return;
      }
      // 鳴きの考えどころ（段階2-2）：ポン・チー・スキップは採点する。なしの段なら理由を聞いてから決める。
      // 考えどころでない役のない鳴きも、鳴いたら調べる（coach.gradesCall）
      const callKey = b.id === 'skip' ? 'skip' : b.reply && b.reply.fulou;
      if (coach && (b.id === 'pon' || b.id === 'chi' || b.id === 'skip') && coach.gradesCall(callKey)) {
        const key = callKey;
        if (coachView && coach.needsReason()) {
          reasonPick = { reply: b.reply, key, label: '', prompt: b.id === 'skip' ? '鳴きません' : `${b.word}します`, kind: 'discard', call: true };
          renderBand();
          return;
        }
        callWith(b.reply, key, null);
        return;
      }
      finish(b.reply);
    }));
  }

  // 声：自分は男性の声（設定）、相手はそのキャラの声
  function voiceUrl(l, scene, chatter = false) {
    const id = idOf(l);
    if (id === 0) {
      const key = getSettings().maleVoice;
      return chatter || key === 'none' ? null : voices.male(key, scene);
    }
    return voices.heroine(cast[id - 1], scene);
  }
  const say = (l, scene, chatter = false) => (disposed ? Promise.resolve() : audio.play(voiceUrl(l, scene, chatter)));

  // カットイン（リーチ・ロン・ツモ・鳴き）。出したら true（設定で切っている・出さない場面なら false）
  function showCutIn(l, scene) {
    const spec = cutInSpec(scene);
    if (!getSettings().cutin || !spec) return Promise.resolve(false);
    const id = idOf(l);
    const h = id === 0 ? null : heroine(cast[id - 1]);
    return cutIn(root, { img: h ? h.img : null, imgSrc: h ? null : avatarSrc(me().avatar), word: spec.word, name: h ? h.name : me().name, duration: T(spec.ms) }).then(() => true);
  }

  // 相手の打牌の飛び始め：ツモってきた牌（なければ伏せた手の真ん中）
  function opponentSource(rel) {
    const box = felt.querySelector(`[data-opp="${rel}"]`);
    if (!box) return null;
    const drawn = box.querySelector('.drawn img');
    return (drawn || box).getBoundingClientRect();
  }

  // 演出の層：卓の中の要素の画面上の箱を、演出の層の座標に直す
  const fxLocal = (el) => toLocal(el.getBoundingClientRect(), fxEl.getBoundingClientRect(), scale());
  // 演出の層と器の印を消す（局の始め・タイトルへ）
  function clearFx() {
    fxEl.innerHTML = '';
    for (const c of [...root.classList]) if (c.startsWith('fx-')) root.classList.remove(c);
  }
  // リーチの演出（手直し 6章）：宣言牌が光り、名札（自分なら手牌の欄）の「リーチ」が光る。待たない
  function riichiFx(rel, tileEl) {
    if (tileEl) glowAt(fxEl, fxLocal(tileEl), T(FX_MS.riichiGlow));
    flash(root, `fx-reach-${rel}`, T(FX_MS.riichiGlow));
  }
  // リーチ棒が上から落ちて置かれる。本物の棒は描き直しの前から隠してあり（fx-stick-N）、落ち終わってから出す
  function stickFx(rel) {
    const s = felt.querySelector(`[data-stick="${rel}"]`);
    if (!s) {
      root.classList.remove(`fx-stick-${rel}`);
      return;
    }
    dropStick(fxEl, fxLocal(s), T(FX_MS.stickDrop)).then(() => root.classList.remove(`fx-stick-${rel}`));
  }

  // 上がりの演出（手直し 7章）：上がった人の席が光る → ロンなら上がり牌から上がった人へ矢印と牌 → 手牌を倒して見せる
  async function huleFx(h) {
    const winRel = relOf(h.l);
    const seatEl = (rel) => (rel === 0 ? meEl : felt.querySelector(`[data-plate="${rel}"]`));
    const { tiles, win } = revealOf(h.shoupai);
    flash(root, `fx-win-${winRel}`, T(FX_MS.winGlow));
    const target = seatEl(winRel);
    if (h.baojia != null && target) {
      const fromRel = relOf(h.baojia);
      const river = player.model.he[h.baojia]._pai;
      const tileEl = arrowFrom(river.length ? river[river.length - 1] : null, win) === 'river' ? lastRiverTile(fromRel) : null;
      const srcEl = tileEl || seatEl(fromRel);
      if (srcEl) {
        const a = fxLocal(srcEl);
        const b = fxLocal(target);
        glowAt(fxEl, a, T(FX_MS.winGlow));
        const img = tileEl && tileEl.querySelector('img');
        await Promise.all([arrowFx(fxEl, a, b, T(FX_MS.ronArrow)), img ? flyCopy(fxEl, img, a, b, T(FX_MS.ronArrow)) : null]);
      }
    }
    if (winRel !== 0) {
      reveal = { rel: winRel, tiles, win };
      render();
    }
    await wait(T(FX_MS.reveal));
  }

  function lastRiverTile(rel) {
    const list = felt.querySelectorAll(`[data-river="${rel}"]`);
    return list.length ? list[list.length - 1] : null;
  }

  // 盤面が変わった知らせ（部品の Player が、自分の返事を求める前に呼ぶ）
  function update(p) {
    if (replaying || !ready()) return;
    const call = callOf(p);
    if (p.zimo || p.gangzimo) {
      const z = p.zimo || p.gangzimo;
      enqueue(async () => {
        render();
        if (relOf(z.l) === 0) {
          const el = meEl.querySelector('.ht.zimo');
          // 引いた牌が出たらすぐ触れるように、滑り込みの終わりを待たずに問いへ進む（先生のご要望「もっさり」）。
          // 問いで手牌を描き直しても、滑り込みは途中から続ける（renderMe）
          zimoSlide = performance.now();
          if (el) slideIn(el, T(170));
          audio.tsumo();
          vibrate(5);
        }
      });
      return;
    }
    if (p.dapai) {
      const rel = relOf(p.dapai.l);
      enqueue(async () => {
        const from = rel === 0 ? pendingSource : opponentSource(rel);
        pendingSource = null;
        const before = rel === 0 ? handRects(meEl) : null;
        if (call) { say(p.dapai.l, 'riichi'); await showCutIn(p.dapai.l, 'riichi'); }
        if (call && !auto) root.classList.add(`fx-stick-${rel}`);
        render();
        const el = lastRiverTile(rel);
        if (el && from && !auto) await flyTile({ root, scale: scale(), fromRect: from, toEl: el, duration: T(160), lift: call ? 70 : 46, startTurn: rel === 0 ? 0 : RIVER_TURN[rel], endTurn: RIVER_TURN[rel], impact: rel === 0 });
        audio.discard(!!call, rel === 0);
        if (rel === 0 && el && !auto) glowAt(fxEl, fxLocal(el), T(380));
        vibrate(call ? [18, 30, 10] : 12);
        if (before) flipHand(meEl, before, scale(), T(150));
        if (call) {
          if (!auto) riichiFx(rel, el);
          await wait(T(150));
          if (!auto) stickFx(rel);
          audio.stick();
        }
      });
      return;
    }
    if (p.fulou || p.gang) {
      // 鳴き：声と描き直しの後に短いカットイン（手直し 5章）。出さないときは今までどおり少し待つ
      enqueue(async () => {
        say(call.l, call.scene);
        render();
        if (!(await showCutIn(call.l, call.scene))) await wait(T(450));
      });
      return;
    }
    if (p.kaigang || p.pingju) { enqueue(async () => render()); return; }
    if (p.hule) {
      enqueue(async () => {
        say(call.l, call.scene);
        await showCutIn(call.l, call.scene);
        render();
        if (!auto) await huleFx(p.hule);
      });
    }
  }

  // 自分に問われたこと。動きが終わってから選ばせる
  async function decide(kind, info) {
    await chain;
    if (disposed) return {};
    if (auto) {
      if (kind === 'hule' || kind === 'pingju' || kind === 'jieju') await showResult(kind, info, true);
      else await wait(T(kind === 'otherZimo' ? 80 : 20));
      return autoReply(kind, info);
    }
    switch (kind) {
      case 'kaiju': {
        const k = cast[Math.floor(Math.random() * 3)];
        if (shouldChat(getSettings().chatter)) await audio.play(voices.heroine(k, 'start'));
        return {};
      }
      case 'qipai': {
        clearFx();
        reveal = null;
        const b = player.model;
        hand = { start: getPosition(), defen: b.defen[0], where: { zhuangfeng: b.zhuangfeng, jushu: b.jushu, changbang: b.changbang } };
        audio.shuffle();
        await wait(T(500));
        return {};
      }
      case 'otherZimo':
        await wait(T(320));
        return {};
      case 'myZimo': {
        await sheetClosed();
        // リーチの後は、上がれず・カンもできなければ引いた牌を見せてから自動で切る（2026-10-16 先生の希望）
        const tsumogiri = riichiAutoDiscard(kind, info, !!player?.shoupai?.lizhi);
        if (tsumogiri) {
          await wait(T(RIICHI_AUTO_MS));
          if (disposed) return {};
          const z = meEl.querySelector('.ht.zimo img');
          if (z) pendingSource = z.getBoundingClientRect();
          return tsumogiri;
        }
        return askUser(kind, info);
      }
      case 'myFulou':
        await sheetClosed();
        return askUser(kind, info);
      case 'otherDapai':
      case 'otherGang':
        return buttonsFor(kind, info.choices).length ? askUser(kind, info) : {};
      case 'hule':
      case 'pingju':
      case 'jieju':
        return showResult(kind, info, false);
      default:
        return {};
    }
  }

  function askUser(kind, info) {
    return new Promise((resolve) => {
      ask = { kind, info, resolve, mode: null, selected: null };
      coachAnswer = null;
      coachPending = false;
      if (callVerdictPlace(kind) === 'drop') {
        callVerdict = null;
        callToken = null;
      }
      // 自分の番：場面を指南に渡して、考えどころなら帯を出す（裏で試しも始まる）
      if (coach && (kind === 'myZimo' || kind === 'myFulou') && ready()) {
        const choices = info.choices || {};
        const scene = sceneOf(player.model, player._menfeng, { options: choices.dapai || [], lizhi: kind === 'myZimo' ? choices.lizhi : null, matchSeed, rule: player._rule, styles: seatStyles(player.model, cast) });
        coachView = coach.begin(scene, { at: getPosition() });
      }
      // 鳴けますの場面（段階2-2 設計書 3.2）：ロンできるときは指南しない。ポン・チーできれば鳴きの考えどころか調べる
      if (coach && kind === 'otherDapai' && ready()) {
        const c = info.choices || {};
        if (!c.hule && ((c.peng && c.peng.length) || (c.chi && c.chi.length))) {
          coachView = coach.beginCall(callSceneOf(player.model, player._menfeng, { tile: info.tile, choices: c, matchSeed, rule: player._rule, styles: seatStyles(player.model, cast) }), { at: getPosition() });
        }
      }
      if (kind === 'otherDapai') {
        render(); // 鳴ける牌を光らせるので卓も描き直す
        if (coachView) refreshCoach();
      } else {
        renderMe();
        refreshCoach();
      }
    });
  }

  // 上がり・流局・終局の画面。quick：自動で打つときは待たずに閉じる
  async function showResult(kind, info, quick) {
    const names = [0, 1, 2, 3].map((l) => (idOf(l) === 0 ? me().name : heroine(cast[idOf(l) - 1]).name));
    const namesById = [me().name, ...cast.map((k) => heroine(k).name)];
    // この局のあなたの増減と「この局」の2行（段階3-2）。打ち直しは局の始めの点数を呼ぶ側から受け取る
    let note = '';
    let mine = null;
    const startDefen = hand ? hand.defen : practice ? practice.startDefen : null;
    if ((kind === 'hule' || kind === 'pingju') && startDefen !== null && player) {
      mine = handDelta(player.model, player._menfeng, kind === 'hule' ? { hule: info.hule } : { pingju: info.pingju }, startDefen);
      if (hand && !practice) {
        // 振り込んだ打牌の採点が記録に入るのを待つ（遅い端末でも2秒まで）
        if (coach) await Promise.race([coach.settled(), wait(2000)]);
        try {
          note = getHandNote({ start: hand.start, where: hand.where, mine }) || '';
        } catch (e) {
          console.error(e);
        }
      }
    }
    // 振り込んだ局の読みの1行（段階3-5 設計書 6.6）：自分が振り込んだら、切ったときの上がった人への見込み（段に関係なく）
    if (kind === 'hule' && coach && player && info.hule.baojia === player._menfeng) {
      const d = coach.discardRead();
      const river = player.model.he[player._menfeng]._pai;
      const last = river.length ? kindOf(river[river.length - 1]) : null;
      const same = d && last === kindOf(d.key);
      const e = same ? d.each.find((x) => x.seat === info.hule.l) : null;
      if (e) note += dealInLineHTML({ name: names[info.hule.l], p: e.p });
      // ダマに振り込んだら、見えていた気配の行（段階3-6 設計書 8.1）
      const dama = same ? damaLineFor(d, info.hule, player._menfeng) : null;
      if (dama) note += damaLineHTML({ name: names[info.hule.l], signs: dama.signs, unused: dama.unused });
    }
    // 顔の札（手直し 7章）：上がった人 ← 振り込んだ人（自分はアバターの絵。なければ顔の代わりに「あなた」の札）
    const face = (l) => (idOf(l) === 0 ? { name: me().name, img: null, src: avatarSrc(me().avatar, true) } : { name: heroine(cast[idOf(l) - 1]).name, img: heroine(cast[idOf(l) - 1]).img });
    const faces = kind === 'hule' ? { winner: face(info.hule.l), from: info.hule.baojia == null ? null : face(info.hule.baojia) } : null;
    if (kind === 'hule') overlay.innerHTML = huleHTML(info.hule, names, src, { note, faces });
    if (kind === 'pingju') overlay.innerHTML = pingjuHTML(info.pingju, names, { note });
    if (kind === 'jieju') overlay.innerHTML = jiejuHTML(info.paipu, namesById, coach ? coach.summary() : null, { review: !!coach });
    overlay.classList.add('show');
    if (quick) {
      await wait(T(150));
    } else {
      speakAfterResult(kind, info);
      const btn = overlay.querySelector('[data-next]');
      const review = overlay.querySelector('[data-review]');
      await new Promise((res) => {
        btn.addEventListener('click', () => { audio.unlock(); res(); }, { once: true });
        // 「感想戦をする」：終局のあとタイトルでなく感想戦へ（段階3-1。main.js が endChoice を見る）
        if (review) review.addEventListener('click', () => { audio.unlock(); endChoice = 'review'; res(); }, { once: true });
      });
    }
    overlay.classList.remove('show');
    overlay.innerHTML = '';
    // 打ち直し：局が終わったら知らせて、ここで止まる（返事をしないので次の局へ進まない）
    if (practice && (kind === 'hule' || kind === 'pingju')) {
      practice.onEnd(mine);
      return new Promise(() => {});
    }
    return {};
  }

  // 結果の画面を出したあとの声（待たずに順に鳴らす）
  async function speakAfterResult(kind, info) {
    const chat = getSettings().chatter;
    if (kind === 'hule') {
      for (const c of huleChatter(info.hule)) {
        if (idOf(c.l) === 0 || !shouldChat(chat)) continue;
        await wait(350);
        await say(c.l, c.scene, true);
      }
    }
    if (kind === 'pingju') for (const c of pingjuCalls(info.pingju)) await say(c.l, c.scene);
    if (kind === 'jieju') {
      for (const c of jiejuChatter(info.paipu)) {
        if (c.id === 0 || !shouldChat(chat)) continue;
        await wait(350);
        if (disposed) return;
        await audio.play(voices.heroine(cast[c.id - 1], c.scene));
      }
    }
  }

  return {
    // 部品の Player.view
    view: {
      kaiju() {},
      // 局の始め（配牌）の描き直し。前の局の倒した手と演出の層を消してから描く
      redraw() { if (!replaying) enqueue(async () => { reveal = null; clearFx(); render(); }); },
      update,
      summary() {},
      say() {},
    },
    // human-player の agent
    agent: { decide, onError: (e) => console.error(e) },
    attach(p, isReplaying) { player = p; replaying = isReplaying; },
    // 終局の画面で選んだこと（段階3-1）
    endChoice() { return endChoice; },
    // 続きから：記録に追いついたら描き直して、普通の進み方に戻す
    goLive() { replaying = false; enqueue(async () => render()); },
    rerender() { render(); },
    // 設定の画面で指南の量を変えたとき
    coachLevelChanged() {
      const btn = root.querySelector('[data-coach="level"]');
      if (btn) btn.textContent = `指南：${LEVEL_NAME[getSettings().coachLevel]} ▾`;
      refreshCoach();
    },
    // タイトルへ戻ったとき：この卓の動き・音・声をこの先は出さない
    dispose() { disposed = true; ask = null; clearFx(); },
  };
}
