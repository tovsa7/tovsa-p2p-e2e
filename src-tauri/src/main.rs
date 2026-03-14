#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = check_for_updates(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_updates(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        let window = app.get_webview_window("main");

        // Спрашиваем через диалог Tauri 2.x
        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        tauri_plugin_dialog::DialogExt::dialog(&app)
            .message(format!(
                "Tovsa {} доступна.\nОбновить сейчас?",
                update.version
            ))
            .title("Доступно обновление")
            .ok_button_label("Обновить")
            .cancel_button_label("Позже")
            .parent(window.as_ref().unwrap())
            .show(move |answer| {
                let _ = tx.send(answer);
            });

        if rx.await.unwrap_or(false) {
            update
                .download_and_install(|_, _| {}, || {})
                .await?;
            app.restart();
        }
    }
    Ok(())
}
