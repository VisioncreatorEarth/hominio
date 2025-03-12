use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct HelloWorld {
    message: String,
}

#[tauri::command]
fn save_hello_world(app_handle: tauri::AppHandle) -> Result<String, String> {
    // Create the app data directory path manually
    let app_data_dir = get_app_data_dir(&app_handle)
        .ok_or_else(|| "Failed to get app data dir".to_string())?;
    
    let file_path = app_data_dir.join("hello_world.json");
    
    // Create directory if it doesn't exist
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    // Create sample data
    let data = HelloWorld {
        message: "Hello, World!".to_string(),
    };
    
    // Serialize and save to file
    let json_content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;
    
    fs::write(&file_path, json_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_hello_world(app_handle: tauri::AppHandle) -> Result<HelloWorld, String> {
    // Create the app data directory path manually
    let app_data_dir = get_app_data_dir(&app_handle)
        .ok_or_else(|| "Failed to get app data dir".to_string())?;
    
    let file_path = app_data_dir.join("hello_world.json");
    
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let data: HelloWorld = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    Ok(data)
}

// Helper function to get app data directory in Tauri v2
fn get_app_data_dir(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app_handle.path();
    path.app_data_dir().ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![save_hello_world, read_hello_world])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
