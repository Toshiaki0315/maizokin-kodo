use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

/// ⌘Q の独自メニュー項目の ID（仕様 16.9）
const MENU_QUIT_ID: &str = "quit";
/// ⌘Q が押されたことをフロントエンドへ知らせるイベント名。platform.ts が受けて closeRequested() を呼ぶ（仕様 14.5）
const MENU_QUIT_EVENT: &str = "menu-quit";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // 既定のアプリメニューの「終了」はそのままアプリを終わらせてしまうため、
            // 同じショートカットを持つ独自項目に置き換え、終了確認（QUIT_CONFIRM）を挟む（仕様 16.3、16.9）。
            // メニューは丸ごと置き換えるので「編集」などの既定メニューは出ない（ゲームでは不要）
            let quit = MenuItemBuilder::with_id(MENU_QUIT_ID, "埋蔵金坑道を終了")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;
            let app_menu = SubmenuBuilder::new(app, "埋蔵金坑道")
                .item(&quit)
                .build()?;
            let menu = MenuBuilder::new(app).item(&app_menu).build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == MENU_QUIT_ID {
                // 送れなくてもアプリは続行できるため、失敗は無視する
                let _ = app.emit(MENU_QUIT_EVENT, ());
            }
        })
        .run(tauri::generate_context!())
        .expect("アプリの起動に失敗しました");
}
