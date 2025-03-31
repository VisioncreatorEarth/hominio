// Setup a minimal Tauri application without filesystem access
// This fixes the "Cannot access uninitialized variable" error

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use log;
use tauri;

// This function runs the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create and run the Tauri application
    tauri::Builder::default()
        .setup(|app| {
            // Setup logging for debugging
            #[cfg(debug_assertions)]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            Ok(())
        })
        // We don't register any commands - frontend will use only standard APIs
        .invoke_handler(tauri::generate_handler![])
        // Run the application with default context
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
