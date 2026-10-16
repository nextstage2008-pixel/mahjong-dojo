// 版の印（設計書 段階5-2 第2節）。開発用の場所では commit が 'dev'。
// 公開用のファイルを作る道具（scripts/build-dist.mjs）が、dist/ の中のこのファイルだけ開発用のコミットの短い番号に書き換える。
// タイトルの右下の版の表示と、service worker の置き場の名前に使う
export const BUILD = { version: '1.0', commit: '3285c90' };

export const versionText = (b) => `v${b.version}・${b.commit}`;
