// 道場の章の定義（段階4 設計書 4章・5章）。全10章（序章＋第1〜9章）と卒業試験。
// 段階4-2 で全10章が遊べる。卒業試験は章ではないので playable: false（全10章の合格で開く。progress.js の gradState）。
// types：その章の問題の型（questions/index.js の名前）
export const CHAPTERS = [
  { id: 'prologue', seal: '序', title: '麻雀の形', ask: '上がっている形は？', playable: true,
    desc: '麻雀の札（牌）の種類と、上がりの形（4つの組と1つの頭）、1回の勝負（局）の流れと上がり方を覚えます。', types: ['agari', 'wait'] },
  { id: 'ch1', seal: '1', title: 'よく出る役', ask: 'この上がりの役は？', playable: true,
    desc: '上がるのに必要な「役」のうち、よく出るものを覚えます。役がないと上がれません。', types: ['yaku', 'canWin'] },
  { id: 'ch2', seal: '2', title: '速さ', ask: 'どれを切る？', playable: true,
    desc: '上がりまであと何枚かを数え、早く上がれる牌の残し方と、切る順番を覚えます。', types: ['shanten', 'ukeire'] },
  { id: 'ch3', seal: '3', title: '形と打点', ask: '形の良い切り方は？', playable: true,
    desc: '上がりやすい待ちの形と、上がりの点数（打点）を高くする牌の残し方、速さと打点のかね合いを覚えます。', types: ['shape', 'value'] },
  { id: 'ch4', seal: '4', title: '点数', ask: 'この上がりは何点？', playable: true,
    desc: '上がりの点数の数え方と点数の表、親と子の違い、ツモのときの払い方を覚えます。', types: ['fu', 'points'] },
  { id: 'ch5', seal: '5', title: '牌の危なさ', ask: 'いちばん安全な牌は？', playable: true,
    desc: 'リーチを受けたとき、相手に上がられにくい牌と危ない牌を見分けます。', types: ['safest', 'suji'] },
  { id: 'ch6', seal: '6', title: '相手の手を読む', ask: 'この人は上がりが近い？', playable: true,
    desc: '捨てた牌や鳴きから、相手の上がりの近さと、狙っている手を読みます。', types: ['nearest', 'someColor'] },
  { id: 'ch7', seal: '7', title: '押し引き', ask: '押す？降りる？', playable: true,
    desc: '自分の手と相手の脅威を比べて、攻める（押す）か守る（降りる）かを決めます。この判断を押し引きと呼びます。', types: ['pushfold', 'betaori'] },
  { id: 'ch8', seal: '8', title: '鳴き', ask: '鳴く？鳴かない？', playable: true,
    desc: '他の人の牌をもらって組を作るか、自分で引くのを待つかを決めます。', types: ['call', 'callYaku'] },
  { id: 'ch9', seal: '9', title: '順位を考える', ask: '何点の上がりで逆転？', playable: true,
    desc: '最後の局（オーラス）の点差と、終わったときの順位の点数（ウマ・オカ）から、要る上がりを考えます。', types: ['comeback', 'finalScore'] },
  { id: 'grad', seal: '卒', title: '卒業試験', ask: '全10章の総合問題', playable: false,
    desc: '全10章の問題から30問（各章3問）。ヒントなし。24問正解で卒業です。全部の章に合格すると受けられ、何度でも受けられます。', types: [] },
];

export const PLAYABLE = CHAPTERS.filter((c) => c.playable).map((c) => c.id);
// 級の数えに使う10章（卒業試験を除く）
export const ALL_CHAPTERS = CHAPTERS.filter((c) => c.id !== 'grad').map((c) => c.id);

export function chapterOf(id) {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`知らない章: ${id}`);
  return c;
}

// 章の名前（「序章」「第3章」「卒業試験」）
export const chapterLabel = (id) => (id === 'prologue' ? '序章' : id === 'grad' ? '卒業試験' : `第${chapterOf(id).seal}章`);

// 練習問題・章末試験・合格の数（ホールデム道場と同じ）
export const PRACTICE_COUNT = 10;
export const TEST_COUNT = 20;
export const TEST_PASS = 16;
// 卒業試験（全10章の合格で開く総合問題。段階4-2）：30問・24問正解で合格・各章から3問
export const GRAD_COUNT = 30;
export const GRAD_PASS = 24;
export const GRAD_PER_CHAPTER = 3;

// 初めて道場を開いたときの麻雀の経験の3択と、勧める章（設計書 5章）
export const EXPERIENCES = [
  { key: 'new', label: 'はじめて', note: 'ルールを覚えるところから', start: 'prologue' },
  { key: 'rules', label: 'ルールは知っている', note: '役から', start: 'ch1' },
  { key: 'player', label: '打てる', note: '捨て牌の選び方から', start: 'ch2' },
];
