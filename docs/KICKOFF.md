# Claude への実装依頼文

実装は6回程度のセッションに分けて依頼します。1回のセッションで1つのプルリクエストを作る想定です。各回の依頼文をそのまま貼り付けて使ってください。

---

## 第1回：土台と設定

```
CLAUDE.md と docs/spec.md を読んでください。
今回は開発環境の土台を整えます。コードの機能実装はまだしません。

1. package.json に test / test:watch / coverage スクリプトを追加（仕様 17.2）
2. vite.config.ts に Vitest の設定を追加（対象 src/core/**、reporter に json-summary、thresholds なし）
3. tauri.conf.json と capabilities/default.json を仕様 16.9 のとおりに設定
4. ⌘Q のメニュー置き換えを src-tauri/src/lib.rs に実装（仕様 16.9 の例を参考に、Tauri v2 の現行 API で）
5. src/core/config.ts を作り、仕様 2章の定数をすべて定義。config のテストも書く

作業ブランチ feature/setup で進め、最後に npm test と npm run tauri dev の起動確認をしてください。
仕様書で判断できない点があれば、実装前に質問してください。
```

## 第2回：乱数と迷路

```
CLAUDE.md と docs/spec.md を読んでください。
今回は rng.ts と maze.ts を TDD で実装します（仕様 6章、13.1 #12、15.3）。
15.3 のテスト観点をすべてテストにしてから実装してください。
Red → Green → Refactor の各段階で npm test の結果を示し、サイクルごとにコミットしてください。
作業ブランチは feature/maze です。
```

## 第3回：穴・入力・ループ

```
CLAUDE.md と docs/spec.md を読んでください。
今回は holes.ts、input.ts、loop.ts を TDD で実装します（仕様 5.1、7章、14.3、14.5、16.7、15.3）。
input.ts は押下エッジ（Enter・P・ESC・F）と、入力リセット後に押し直すまで無効にする挙動を含みます。
作業ブランチは feature/input-loop です。
```

## 第4回：エイリアン

```
CLAUDE.md と docs/spec.md を読んでください。
今回は alien.ts を TDD で実装します（仕様 8章、16.13、15.3）。
乱数は注入した Rng を使い、テストではシードを固定して方向の選択を検証してください。
作業ブランチは feature/alien です。
```

## 第5回：ゲーム本体

```
CLAUDE.md と docs/spec.md を読んでください。
今回は game.ts を TDD で実装します（仕様 4〜5章、9〜11章、13.1 の採用項目、14.5、16.1〜16.3、16.5、16.7、16.10、16.13、16.14、15.3）。
量が多いので、状態遷移 → プレイヤー操作 → 金塊と階段 → ミスと残機 → 一時停止と終了確認 → ハイスコア → エフェクト用イベント、の順にサイクルを回してください。
最後に npm run coverage を実行し、警告が出た指標があれば報告してください。
作業ブランチは feature/game です。
```

## 第6回：描画と Tauri 連携

```
CLAUDE.md と docs/spec.md を読んでください。
今回は src/render/、platform.ts、main.ts を実装し、ゲームを遊べる状態にします（仕様 3章、12章、14.3、14.5、16.4〜16.6、16.9〜16.12、16.15、16.16）。
キャラクターのドット絵は16.16のデータを正確に写し、原作の12.7・12.8の絵は使わないでください。
ここはテスト対象外なので、仕様 12章の座標と色を正確に写し、原作 docs/original/maizokin-kodo.html と見比べてください。
完了したら、仕様 15.6 の手動確認項目の一覧を、確認手順付きで出してください。
作業ブランチは feature/render です。
```

## アイコン（どの回の後でも可）

```
仕様 16.11 に従って、アプリアイコンの原本 src-tauri/icons/source/app-icon.svg を作成し、
1024×1024 の PNG に書き出して npm run tauri icon で各サイズを生成してください。
```
