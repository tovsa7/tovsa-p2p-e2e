#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_updater::UpdaterExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Проверяем обновления при запуске (асинхронно, не блокируем UI)
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = check_for_updates(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_updates(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let updater = app.updater()?;
    if let Some(update) = updater.check().await? {
        // Показываем диалог подтверждения
        let answer = tauri::api::dialog::blocking::ask(
            Some(&app.get_webview_window("main").unwrap()),
            "Доступно обновление",
            format!(
                "Tovsa {} доступна для установки.\n\nОбновить сейчас?",
                update.version
            ),
        );
        if answer {
            update.download_and_install(|_, _| {}, || {}).await?;
            app.restart();
        }
    }
    Ok(())
}
