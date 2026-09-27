# 埋蔵金坑道のビルド用コマンド（仕様 17.4）。中身は npm と Tauri CLI を呼ぶだけ。
# 使い方は `make` または `make help` で表示する。

APP_NAME   := MaizokinKodo
BUNDLE_DIR := src-tauri/target/release/bundle
ICON_SVG   := src-tauri/icons/source/app-icon.svg
ICON_PNG   := src-tauri/icons/source/app-icon.png

.DEFAULT_GOAL := help
.PHONY: help install dev test coverage app dmg icon clean

help: ## 使えるコマンドの一覧を表示する
	@echo "使い方: make <コマンド>"
	@echo ""
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-10s %s\n", $$1, $$2}'

# npm がインストールのたびに書き換える node_modules/.package-lock.json を目印にし、
# package-lock.json が変わったときだけ入れ直す。node_modules を消さない npm install を使う
DEPS := node_modules/.package-lock.json

$(DEPS): package-lock.json
	npm install
	@touch $(DEPS)

install: $(DEPS) ## 依存パッケージを入れる

dev: $(DEPS) ## 開発モードで起動する（コードを変えると自動で読み込み直す）
	npm run tauri dev

test: $(DEPS) ## 単体テストを1回実行する
	npm test

coverage: $(DEPS) ## テストとカバレッジを実行し、目標に届かない指標を警告する
	npm run coverage

# 配布物が壊れた状態にならないよう、作る前にテストを通す（17.8 の CI と同じ考え方）
app: test ## アプリ（.app）を作る
	npm run tauri build -- --bundles app
	@echo ""
	@echo "できあがり: $(BUNDLE_DIR)/macos/$(APP_NAME).app"

dmg: test ## インストール用の dmg を作る
	npm run tauri build -- --bundles dmg
	@echo ""
	@echo "できあがり:"
	@ls -1 $(BUNDLE_DIR)/dmg/*.dmg

icon: $(DEPS) ## 原本の SVG からアイコン一式を作り直す（16.11）
	swift scripts/export-icon.swift $(ICON_SVG) $(ICON_PNG)
	npm run tauri icon $(ICON_PNG)
	# iOS・Android 用の画像は対象外なので消す（16.11）
	rm -rf src-tauri/icons/ios src-tauri/icons/android

clean: ## ビルドの成果物（dist・coverage・作ったアプリと dmg）を消す
	rm -rf dist coverage $(BUNDLE_DIR)
