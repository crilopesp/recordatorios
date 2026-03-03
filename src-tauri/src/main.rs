#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod storage;

use storage::{load_text_file, read_last_file, save_text_file, write_last_file};

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      load_text_file,
      save_text_file,
      read_last_file,
      write_last_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
