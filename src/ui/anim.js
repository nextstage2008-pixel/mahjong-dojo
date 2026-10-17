// 動き（設計書 9章）：切った牌が弧を描いて飛び、着地で少し沈む。手牌が詰まって並び直し、ツモが滑り込む。
// 画面全体は拡大・縮小しているので、位置は「画面の土台（root）の中の座標」に直してから動かす。

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// 河に置かれた牌（toEl）を、fromRect の位置から飛ばしてくる。
// 河は回して置いてあるので、本物の牌は隠しておき、回していない土台の上で写しを飛ばして、着いたら入れ替える。
// endTurn：着いたときの向き（河の回り方）。startTurn：飛び始めの向き
// impact：自分の打牌（着地の沈み込みをはっきりさせる。先生のご要望「打感良く」）
// settle：着いたときの揺れの長さ（対局の速さで短くする）
export function flyTile({ root, scale, fromRect, toEl, duration = 160, lift = 46, startTurn = 0, endTurn = 0, impact = false, settle = impact ? 160 : 110 }) {
  const rootRect = root.getBoundingClientRect();
  const to = center(toEl.getBoundingClientRect());
  const from = center(fromRect);
  const img = toEl.querySelector('img');
  // 行き先の牌の画面上の大きさ（卓が縮んでいれば、その大きさで着く）。横の席の河の牌は回っているので、縦横は牌の元の向きのまま
  const box = img.getBoundingClientRect();
  const fit = upright(Number(img.getAttribute('width')), Number(img.getAttribute('height')), box.width, box.height);
  const w = fit.w / scale;
  const h = fit.h / scale;
  const lx = (to.x - rootRect.left) / scale;
  const ly = (to.y - rootRect.top) / scale;
  const dx = (from.x - to.x) / scale;
  const dy = (from.y - to.y) / scale;
  const fly = document.createElement('div');
  fly.className = 'fly';
  fly.style.cssText = `left:${lx - w / 2}px;top:${ly - h / 2}px;width:${w}px;height:${h}px`;
  fly.appendChild(img.cloneNode());
  root.appendChild(fly);
  toEl.style.visibility = 'hidden';
  const midX = dx / 2;
  const midY = Math.min(dy, 0) / 2 - lift;
  const anim = fly.animate([
    { transform: `translate(${dx}px,${dy}px) rotate(${startTurn}deg) scale(1.15)` },
    { transform: `translate(${midX}px,${midY}px) rotate(${(startTurn + endTurn) / 2}deg) scale(1.1)`, offset: 0.55 },
    { transform: `translate(0,0) rotate(${endTurn}deg) scale(1)` },
  ], { duration, easing: 'cubic-bezier(.25,.6,.3,1)' });
  return anim.finished.catch(() => {}).then(() => {
    fly.remove();
    toEl.style.visibility = '';
    toEl.animate(impact ? [{ transform: 'scale(1.14,.8)' }, { transform: 'scale(.97,1.04)', offset: 0.55 }, { transform: 'scale(1,1)' }] : [{ transform: 'scale(1.06,.9)' }, { transform: 'scale(1,1)' }], { duration: settle, easing: 'ease-out' });
  });
}

// 牌の縦横（imgW×imgH）を保ったまま、画面上の箱（bw×bh。90度回っていてもよい）に合う大きさ。対角線の長さで倍率を決める
export function upright(imgW, imgH, bw, bh) {
  const k = Math.hypot(bw, bh) / Math.hypot(imgW, imgH);
  return { w: imgW * k, h: imgH * k };
}

// 手牌の位置を覚えておく（並び直しの前に呼ぶ）。同じ牌が何枚あっても順に対応させる
export function handRects(handEl) {
  const m = new Map();
  for (const el of handEl.querySelectorAll('.ht')) {
    const code = el.dataset.code;
    const list = m.get(code) || [];
    list.push(el.getBoundingClientRect().left);
    m.set(code, list);
  }
  return m;
}

// 並び直した手牌を、前の位置から横に滑らせる
export function flipHand(handEl, before, scale, duration = 150) {
  const used = new Map();
  for (const el of handEl.querySelectorAll('.ht')) {
    const list = before.get(el.dataset.code);
    if (!list) continue;
    const k = used.get(el.dataset.code) || 0;
    used.set(el.dataset.code, k + 1);
    if (k >= list.length) continue;
    const dx = (list[k] - el.getBoundingClientRect().left) / scale;
    if (Math.abs(dx) > 1) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }
}

// ツモってきた牌が右上から滑り込む
// elapsed：もう進んだ時間（手牌を描き直したとき、途中から続ける）
export function slideIn(el, duration = 170, elapsed = 0) {
  const opts = { duration, easing: 'cubic-bezier(.2,.8,.3,1)' };
  if (elapsed > 0) opts.delay = -elapsed;
  return el.animate([{ transform: 'translate(18px,-26px)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1 }], opts).finished.catch(() => {});
}

const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// カットインの中身（画面の作り直し 段1 作業4）：横いっぱいの帯（黒と金の縁）・光の筋・掛け声・名前・絵。
// img：相手のキャラの絵の名前（assets/chars/<img>.webp）。imgSrc：自分のアバターの絵の住所（段3）。どちらもなければ「あなた」の印
export function cutInHTML({ img = null, imgSrc = null, word, name = '' }) {
  const src = imgSrc || (img ? `assets/chars/${img}.webp` : null);
  const pic = src ? `<img src="${escText(src)}" alt="">` : '<span class="you">あなた</span>';
  return `<div class="band"></div><div class="streak"></div>${pic}<div class="word">${escText(word)}</div>${name ? `<div class="who">${escText(name)}</div>` : ''}`;
}

// カットイン：絵が差し込み、掛け声と一緒に消える（長さは duration）
export function cutIn(root, { img, imgSrc = null, word, name, duration = 650 }) {
  const el = document.createElement('div');
  el.className = 'cutin';
  el.style.setProperty('--cut-ms', `${duration}ms`);
  el.innerHTML = cutInHTML({ img, imgSrc, word, name });
  root.appendChild(el);
  return wait(duration).then(() => el.remove());
}

// ---- 演出の層（手直し 6章・7章）：卓は知らせのたびに描き直すので、光や落ちる棒は描き直さない層 .mj-fx に描く ----

// 画面上の箱 rect（getBoundingClientRect）を、基準の箱 base（演出の層）の中の位置と大きさに直す。scale：画面全体の倍率
export function toLocal(rect, base, scale) {
  return { x: (rect.left - base.left) / scale, y: (rect.top - base.top) / scale, w: rect.width / scale, h: rect.height / scale };
}

function fxBox(fx, cls, box, ms) {
  const el = document.createElement('div');
  el.className = cls;
  el.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
  el.style.setProperty('--fx-ms', `${ms}ms`);
  fx.appendChild(el);
  return el;
}

// 光る輪（ms の間。終わったら消える）
export function glowAt(fx, box, ms) {
  const el = fxBox(fx, 'fx-glow', box, ms);
  return wait(ms).then(() => el.remove());
}

// 上から落ちて置かれるリーチ棒（box は置かれる場所）
export function dropStick(fx, box, ms) {
  const el = fxBox(fx, 'stick fx-drop', box, ms);
  return wait(ms).then(() => el.remove());
}

// 描き直さない要素 el に、ms の間だけ class を付ける（描き直す卓の中の印を、器の class で光らせる・隠す）
export function flash(el, cls, ms) {
  el.classList.add(cls);
  return wait(ms).then(() => el.classList.remove(cls));
}

// 光る矢印（手直し 7章）：from の箱の真ん中から to の箱の真ん中へ ms で伸びる。局の始めに演出の層ごと消える
export function arrowFx(fx, fromBox, toBox, ms) {
  const a = { x: fromBox.x + fromBox.w / 2, y: fromBox.y + fromBox.h / 2 };
  const b = { x: toBox.x + toBox.w / 2, y: toBox.y + toBox.h / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fx-arrow');
  svg.innerHTML = `<defs><marker id="fx-ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ffd27a"/></marker></defs>`
    + `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-dasharray="${len}" stroke-dashoffset="${len}" marker-end="url(#fx-ah)"/>`;
  fx.appendChild(svg);
  const line = svg.querySelector('line');
  const anim = line.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' });
  return anim.finished.catch(() => {});
}

// 牌の写しが from から to へ、少し大きくなりながら飛ぶ（上がり牌が上がった人へ渡る）
export function flyCopy(fx, img, fromBox, toBox, ms) {
  const el = document.createElement('div');
  el.className = 'fx-fly';
  const fit = upright(Number(img.getAttribute('width')), Number(img.getAttribute('height')), fromBox.w, fromBox.h);
  const cx = fromBox.x + fromBox.w / 2;
  const cy = fromBox.y + fromBox.h / 2;
  el.style.cssText = `left:${cx - fit.w / 2}px;top:${cy - fit.h / 2}px;width:${fit.w}px;height:${fit.h}px`;
  const im = img.cloneNode();
  im.removeAttribute('style');
  el.appendChild(im);
  fx.appendChild(el);
  const dx = toBox.x + toBox.w / 2 - (fromBox.x + fromBox.w / 2);
  const dy = toBox.y + toBox.h / 2 - (fromBox.y + fromBox.h / 2);
  const anim = el.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx / 2}px,${dy / 2 - 30}px) scale(1.7)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px,${dy}px) scale(1.3)`, opacity: 0 },
  ], { duration: ms, easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' });
  return anim.finished.catch(() => {}).then(() => el.remove());
}
