use std::path::Path;

const RENAME_RETRY_DELAYS_MS: [u64; 2] = [50, 100];

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file_atomic(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file_name = p
        .file_name()
        .ok_or("caminho sem nome de arquivo")?
        .to_string_lossy();
    let tmp = p.with_file_name(format!("{file_name}.tmp"));
    std::fs::write(&tmp, &content).map_err(|e| e.to_string())?;

    // OneDrive pode segurar handle transiente no arquivo; tenta o rename ate 3x.
    let mut result = std::fs::rename(&tmp, p);
    for delay_ms in RENAME_RETRY_DELAYS_MS {
        if result.is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        result = std::fs::rename(&tmp, p);
    }
    result.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

#[tauri::command]
fn write_binary_base64(path: String, base64: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64)
        .map_err(|e| e.to_string())?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, bytes).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct DirEntryInfo {
    name: String,
    is_dir: bool,
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        out.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
        });
    }
    Ok(out)
}

#[tauri::command]
fn mkdir_all(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn copy_file(from: String, to: String) -> Result<(), String> {
    let p = Path::new(&to);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&from, &to).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file_atomic,
            write_binary_base64,
            list_dir,
            mkdir_all,
            remove_path,
            copy_file,
            path_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
