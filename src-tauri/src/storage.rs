use std::fs;
use std::path::{Path, PathBuf};

const APP_STATE_DIR: &str = "recordatorios";
const LAST_FILE_PATH_FILE: &str = "last_file_path.txt";

fn resolve_state_file() -> Result<PathBuf, String> {
  let base = std::env::var("XDG_STATE_HOME")
    .map(PathBuf::from)
    .or_else(|_| {
      std::env::var("HOME").map(|home| Path::new(&home).join(".local").join("state"))
    })
    .map_err(|_| "Unable to resolve state directory from environment".to_string())?;

  let dir = base.join(APP_STATE_DIR);
  fs::create_dir_all(&dir).map_err(|e| format!("Unable to create state dir: {e}"))?;
  Ok(dir.join(LAST_FILE_PATH_FILE))
}

fn ensure_text_file(path: &Path) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| {
      format!(
        "Unable to create parent directory {}: {e}",
        parent.display()
      )
    })?;
  }

  if !path.exists() {
    fs::write(path, "").map_err(|e| format!("Unable to create file {}: {e}", path.display()))?;
  }
  Ok(())
}

#[tauri::command]
pub fn load_text_file(path: String) -> Result<String, String> {
  let path = PathBuf::from(path);
  ensure_text_file(&path)?;
  fs::read_to_string(path).map_err(|e| format!("Unable to read text file: {e}"))
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
  let tmp = path.with_extension("tmp");
  fs::write(&tmp, content).map_err(|e| format!("Unable to write temp file: {e}"))?;
  fs::rename(&tmp, path).map_err(|e| format!("Unable to replace file atomically: {e}"))?;
  Ok(())
}

#[tauri::command]
pub fn save_text_file(path: String, raw_text: String) -> Result<bool, String> {
  let path = PathBuf::from(path);
  ensure_text_file(&path)?;
  atomic_write(&path, &raw_text)?;
  Ok(true)
}

#[tauri::command]
pub fn read_last_file() -> Result<Option<String>, String> {
  let file = resolve_state_file()?;
  if !file.exists() {
    return Ok(None);
  }

  let content = fs::read_to_string(file).map_err(|e| format!("Unable to read last file: {e}"))?;
  let value = content.trim();
  if value.is_empty() {
    return Ok(None);
  }

  Ok(Some(value.to_string()))
}

#[tauri::command]
pub fn write_last_file(path: String) -> Result<bool, String> {
  let file = resolve_state_file()?;
  atomic_write(&file, &path)?;
  Ok(true)
}
