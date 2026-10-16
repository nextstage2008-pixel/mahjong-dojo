// 感想戦の画面（段階3-1 設計書 5章・6章）：分かれ目の上位5打を、その瞬間の卓で問い直し（選び直し・理由）、
// 型の順に解説し、最後にまとめと今日の課題を出す。卓は対局の記録から作り直し（core/rebuild.js）、採点は指南の流れ
// （coach/session.js）を場面ごとに新しく作って行う（試しの種は場面から決まるので、対局中と同じ数字になる）。
import { reviewBarHTML, reviewSummaryHTML, reviewIntroHTML, practiceResultHTML } from './review-html.js';
import { scanHands, modelHand, splitOf } from '../core/samewall.js';
import { createQuestion } from './question.js';
import { turningPoints, lossTotal, chooseTask, taskResult } from '../coach/review.js';

// record：前の半荘（storage の loadLast の形）。run：試しを動かす（runner.run）。prevTask：前の課題（{ reason } か null）。
// onTask(task)：今日の課題が決まったとき（保存する）。onClose()：閉じたとき。
// onPractice({ at, startDefen }, done)：打ち直し（段階3-2）。その場面から局の終わりまで打たせ、done(増減) で結果を返す（なければボタンを出さない）
// onAnswered({ at, ok })：選び直しを採点したとき（段階3-3。問題集の解いた記録に入れる）
export function createReviewUI({ root, art, record, run, prevTask = null, onTask = () => {}, onClose = () => {}, onPractice = null, onAnswered = () => {} }) {
  const src = (c, v) => art.src(c, v);
  const points = turningPoints(record.coach);
  const noticed = [];
  let disposed = false;
  root.innerHTML = '<div class="mj-top"></div><div class="mj-feltbox"><div class="mj-felt"></div></div><div class="mj-band"><div class="cbox"></div><span class="msg"></span><span class="btns"></span></div><div class="mj-me"></div><div class="mj-bottom rv-bottom"></div><div class="mj-overlay"></div>';
  const $ = (s) => root.querySelector(s);
  const top = $('.mj-top');
  const felt = $('.mj-felt');
  const band = $('.mj-band');
  const meEl = $('.mj-me');
  const bar = $('.mj-bottom');
  const overlay = $('.mj-overlay');
  // 問い直し（段階3-3 で ui/question.js に切り出した）
  const question = createQuestion({ root, els: { top, felt, band, meEl }, src, run });

  const close = () => {
    if (disposed) return;
    disposed = true;
    question.dispose();
    onClose();
  };
  const setBand = (html, buttons = '') => {
    band.querySelector('.cbox').innerHTML = html;
    band.classList.toggle('has-coach', !!html);
    band.querySelector('.btns').innerHTML = buttons;
  };
  const showOverlay = (html) => {
    overlay.innerHTML = html;
    overlay.classList.add('show');
    overlay.querySelectorAll('[data-rv="close"]').forEach((b) => b.addEventListener('click', close));
  };

  const prev = prevTask ? { reason: prevTask.reason, ...taskResult(record.coach, prevTask) } : null;

  // 局の一覧（段階3-2。打ち直しの局を引くため。作れない古い記録なら空）
  let hands = null;
  const handAt = (at) => {
    if (!hands) {
      try {
        hands = scanHands(record);
      } catch {
        hands = [];
      }
    }
    return hands.filter((h) => h.start <= at).pop() || null;
  };

  // まとめ（設計書 6章。段階3-2 で運と判断）。同じ山のお手本を局の数だけ打たせるので、先に「計算しています」を出す
  function summary() {
    const task = chooseTask(record.coach);
    if (task) onTask(task);
    const delta = record.defen[0] - 25000;
    showOverlay('<div class="panel result rv-summary"><h2>感想戦のまとめ</h2><p>同じ山のお手本の結果を計算しています…</p></div>');
    setTimeout(() => {
      if (disposed) return;
      showOverlay(reviewSummaryHTML({
        loss: lossTotal(record.coach),
        noticed: noticed.filter(Boolean).length,
        total: points.length,
        delta,
        task,
        prev,
        split: splitOf(record, delta),
      }));
    }, 30);
  }

  // 打ち直し（段階3-2 設計書 6章）：その場面の局を引き、重ねた対局の画面で局の終わりまで打ってもらい、結果の札を出す
  function practice(p) {
    const h = handAt(p.at);
    if (!h || !onPractice) return;
    onPractice({ at: p.at, startDefen: h.startDefen }, (mine) => {
      if (disposed) return;
      let model = null;
      try {
        model = modelHand(record, h.start);
      } catch (e) {
        console.error(e);
      }
      showOverlay(practiceResultHTML({ mine, before: h.delta, model }));
      overlay.querySelector('[data-rv="back"]').addEventListener('click', () => {
        overlay.classList.remove('show');
        overlay.innerHTML = '';
      });
    });
  }

  // 1つの場面：卓を作り直して問い直す（ui/question.js）。作り直せない場面は、そう出して次へ進める
  function show(i) {
    const p = points[i];
    overlay.classList.remove('show');
    overlay.innerHTML = '';
    const last = i === points.length - 1;
    const goNext = () => (last ? summary() : show(i + 1));
    bar.innerHTML = reviewBarHTML({ index: i, count: points.length, where: p });
    bar.querySelector('[data-rv="close"]').addEventListener('click', close);
    const nextBar = (retry) => {
      bar.innerHTML = reviewBarHTML({ index: i, count: points.length, where: p, next: last ? 'まとめへ' : '次へ', retry });
      bar.querySelector('[data-rv="close"]').addEventListener('click', close);
      bar.querySelector('[data-rv="next"]').addEventListener('click', goNext);
      const r = bar.querySelector('[data-rv="retry"]');
      if (r) r.addEventListener('click', () => practice(p));
    };
    question.ask({
      record,
      entry: p,
      onGraded: ({ ok, key, mine }) => {
        if (disposed) return;
        noticed[i] = ok;
        onAnswered({ at: p.at, ok, chosen: key, grade: mine ? mine.grade : ok ? 'ok' : 'bad' });
        nextBar(!!onPractice && !!handAt(p.at));
      },
      onError: () => {
        if (disposed) return;
        setBand('<div class="coach"><div>この場面は卓を作り直せませんでした</div></div>');
        nextBar(false);
      },
    });
  }

  // 前回の課題があれば、最初に案内を出す（設計書 7章）。なければすぐ1つ目の分かれ目へ
  const start = () => (points.length ? show(0) : summary());
  if (prev) {
    showOverlay(reviewIntroHTML({ prev, count: points.length }));
    overlay.querySelector('[data-rv="start"]').addEventListener('click', () => {
      overlay.classList.remove('show');
      overlay.innerHTML = '';
      start();
    });
  } else start();

  return {
    dispose() {
      disposed = true;
      question.dispose();
    },
  };
}
