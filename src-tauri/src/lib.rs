use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize, Deserialize)]
struct HelloWorld {
    message: String,
}

#[derive(Serialize, Deserialize)]
struct FileSystemInfo {
    path: String,
    exists: bool,
    is_writable: bool,
    created: bool,
    test_file_path: Option<String>,
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

// New function to test filesystem access at any specified path
#[tauri::command]
fn test_fs_access(path: String) -> Result<FileSystemInfo, String> {
    let path_buf = PathBuf::from(&path);
    
    // Initialize result struct
    let mut result = FileSystemInfo {
        path: path.clone(),
        exists: false,
        is_writable: false,
        created: false,
        test_file_path: None,
    };
    
    // Check if path exists
    result.exists = path_buf.exists();
    
    // Try to create directory if it doesn't exist
    if !result.exists {
        fs::create_dir_all(&path_buf)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
        result.created = true;
        result.exists = true;
    }
    
    // Test write access by creating a small test file
    let test_file_path = path_buf.join("pglite_write_test.txt");
    match fs::write(&test_file_path, "PGlite write test. This file can be safely deleted.") {
        Ok(_) => {
            result.is_writable = true;
            result.test_file_path = Some(test_file_path.to_string_lossy().to_string());
        },
        Err(e) => {
            return Err(format!("Failed to write test file: {}", e));
        }
    }
    
    Ok(result)
}

// Function to get all available app directories that PGlite might use
#[tauri::command]
fn get_app_directories(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut dirs = Vec::new();
    
    // Get app data directory
    if let Some(app_data) = app_handle.path().app_data_dir().ok() {
        dirs.push(app_data.to_string_lossy().to_string());
        
        // Add a hominio specific directory
        let hominio_dir = app_data.join("hominio");
        dirs.push(hominio_dir.to_string_lossy().to_string());
    }
    
    // Get document directory
    if let Some(document_dir) = app_handle.path().document_dir().ok() {
        dirs.push(document_dir.to_string_lossy().to_string());
        
        // Add a hominio specific directory
        let hominio_document_dir = document_dir.join("hominio");
        dirs.push(hominio_document_dir.to_string_lossy().to_string());
    }
    
    // Get home directory
    if let Some(home_dir) = dirs_next::home_dir() {
        dirs.push(home_dir.to_string_lossy().to_string());
        
        // Add .hominio directory inside home
        let hominio_home_dir = home_dir.join(".hominio");
        dirs.push(hominio_home_dir.to_string_lossy().to_string());
    }
    
    // Get current directory
    if let Ok(current_dir) = std::env::current_dir() {
        dirs.push(current_dir.to_string_lossy().to_string());
        
        // Add data directory relative to current dir
        let data_dir = current_dir.join("data");
        dirs.push(data_dir.to_string_lossy().to_string());
    }
    
    Ok(dirs)
}

// Helper function to get app data directory in Tauri v2
fn get_app_data_dir(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let path = app_handle.path();
    path.app_data_dir().ok()
}

// Get the app directory path for PGlite storage
#[tauri::command]
fn get_app_dir_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = get_app_data_dir(&app_handle)
        .ok_or_else(|| "Failed to get app data dir".to_string())?;
    
    // For PGlite storage, we'll use a dedicated subdirectory
    let pglite_dir = app_data_dir.join("pglite_storage");
    
    Ok(pglite_dir.to_string_lossy().to_string())
}

// Create a directory for PGlite storage
#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    
    // Create directory and parents if they don't exist
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    Ok(())
}

/**
 * Read text content from a file
 */
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    
    // Check if file exists
    if !path_buf.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    
    // Read file content
    match fs::read_to_string(&path_buf) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e))
    }
}

/**
 * Write text content to a file
 */
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    
    // Ensure parent directory exists
    if let Some(parent) = path_buf.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return Err(format!("Failed to create parent directories: {}", e));
            }
        }
    }
    
    // Write content to file
    match fs::write(&path_buf, contents) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to write file: {}", e))
    }
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
    .invoke_handler(tauri::generate_handler![
        save_hello_world, 
        read_hello_world,
        test_fs_access,
        get_app_directories,
        get_app_dir_path,
        create_directory,
        read_text_file,
        write_text_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
