# 08｜確認資料

参照日：2026年9月30日。公開mainの参照はコミット固定ではありません。導入時にローカルの版を記録してください。

数値の性能目標、モジュール境界、実装順序は本キットの提案です。出典がその設計をそのまま推奨しているという意味ではありません。

## [S1] Seaglass README

`https://github.com/ynatsume-source/3dproject/blob/main/README.md`

機能区分、確認コマンド、時計・観賞用生態系の説明。記述と実描画の一致は未検証。

## [S2] Seaglass package.json

`https://github.com/ynatsume-source/3dproject/blob/main/package.json`

TypeScript/Vite/Three.js、既存scripts。

## [S3] Seaglass src/main.ts

`https://github.com/ynatsume-source/3dproject/blob/main/src/main.ts`

WebGLRenderer、画面・ドローン・入力等の関連箇所。

## [S4] Seaglass src/data/locations.ts

`https://github.com/ynatsume-source/3dproject/blob/main/src/data/locations.ts`

Species / Sea、地域・生物の定義。

## [S5] Seaglass src/time/clock.ts

`https://github.com/ynatsume-source/3dproject/blob/main/src/time/clock.ts`

実時間追従、速度・プリセットの関連箇所。

## [S6] MDN — requestAnimationFrame

`https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame`

非表示タブ等で描画コールバックが停止する場合がある。

## [S7] GitHub Docs — What is GitHub Pages?

`https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages`

静的サイトのホスティング。

## [S8] MDN — IndexedDB API

`https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API`

ブラウザで構造化データを扱うストレージ。

## [S9] Three.js — BufferGeometry

`https://threejs.org/docs/pages/BufferGeometry.html`

disposeによるGPU資産の解放。

## [S10] Three.js — Texture

`https://threejs.org/docs/pages/Texture.html`

disposeによるGPU資産の解放。

## [S11] Three.js — InstancedMesh

`https://threejs.org/docs/pages/InstancedMesh.html`

同じ形・材質の多数描画向けの仕組み。

## [S12] Claude Platform Docs — Define tools

`https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools`

ツールと入力スキーマ。アプリ内の意味検査が不要になるとは扱わない。

## [S13] Claude Code Docs — How Claude remembers your project

`https://code.claude.com/docs/en/memory`

CLAUDE.mdの用途、簡潔な指示、遵守の限界。
