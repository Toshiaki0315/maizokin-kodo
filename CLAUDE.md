# CLAUDE.md — 埋蔵金坑道（Buried Treasure Tunnel）

このリポジトリで作業する AI コーディングエージェント向けのルールです。作業を始める前に必ず読んでください。

## プロジェクト概要

- 単一 HTML の Canvas ゲーム「埋蔵金坑道」を、Tauri v2 + PixiJS v8 + TypeScript（Vite）で macOS 用デスクトップアプリに移植する
- 対象：macOS 26 以上、Apple Silicon のみ。配布は dmg（署名・公証なし）

## 参照する資料と優先順位

1. `docs/spec.md` … 仕様書の正本（書き出したもの）。**直接編集しない**。仕様の変更が必要なら作業を止めて人間に確認する
2. `docs/original/maizokin-kodo.html` … 原作のソース。仕様書に書かれていない細部は、この HTML の挙動を正とする
3. 仕様書の中では、2〜12章（原作の挙動）と 14〜17章（デスクトップ版の仕様）が食い違う場合、14〜17章を優先する。13章の各項目は 13.1 の「採否」列に従う

仕様書と原作の HTML のどちらからも判断できない点は、推測で実装せず、質問として報告すること。

## 開発の進め方（テスト駆動開発）

- 仕様書 15章に従い、Vitest による TDD で進める
- 1サイクル：**Red**（仕様の該当章からテストを書き、失敗を確認）→ **Green**（通る最小限の実装）→ **Refactor**（テストを通したまま整理）
- テストを書く前に実装コードを書かない。テストの期待値は仕様書の章番号をコメントで示す（例：`// 仕様 7章：stage 3 で上限`）
- モジュールは依存の少ない順に作る：`config / rng` → `maze` → `holes / input / loop` → `alien` → `game` → `render / platform / main`
- 各サイクルの終わりに `npm test` がすべて通っていることを確認する

## 設計上の制約

- `src/core/` 配下は PixiJS・DOM・Tauri API を import しない（Vitest でロジック単体をテストできる状態を保つ）
- ロジック層で `Date`・`performance.now()`・`Math.random()` を直接使わない。時間は引数の dt、乱数は注入された `Rng` を使う
- モジュール構成は仕様書 14.2、モジュール間の取り決め（`InputSnapshot`・`GameEvent`・`Game` の API）は 14.5 に従う
- 定数は `src/core/config.ts` に集約し、仕様書 2章の値と一致させる
- PixiJS は v8 の API（`.rect().fill()` 形式）で書く。v7 以前の `beginFill` などは使わない
- Tauri は v2。権限は `src-tauri/capabilities/default.json` で最小限にする（仕様書 16.9）

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm test` | 単体テストを1回実行 |
| `npm run test:watch` | TDD 中の監視実行 |
| `npm run coverage` | テスト＋カバレッジ＋未達の警告（目標 90%、未達でも失敗にしない） |
| `npm run tauri dev` | アプリを開発モードで起動 |
| `npm run tauri build` | dmg を作成 |
| `make app` / `make dmg` | テストを通したうえでアプリ／dmg を作成（`make` で一覧） |

Vitest のカバレッジ設定：対象は `src/core/**`、reporter は `['text', 'html', 'json-summary']`、`thresholds` は設定しない。

## Git の運用

- `main` は常に全テストが通る状態に保つ。作業は `feature/<モジュール名>` ブランチで行い、プルリクエストでマージする
- TDD の1サイクルを目安に1コミット。コミットメッセージは日本語で、先頭に種類を付ける（`test:`、`feat:`、`refactor:`、`fix:`、`chore:`、`docs:`）
- 秘密情報をコミットしない

## コードの書き方

- コメントと識別子以外の文言（UI の文字列、エラーメッセージ）は日本語
- コメントは日本語。仕様書の章番号を添えて、なぜそうするのかを書く
- 型は厳格に（`strict: true`）。`any` を使わない
