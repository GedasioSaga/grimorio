use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};

/// SHA-256 de um arquivo, lido em blocos. Existe porque a varredura de sync compara
/// dezenas de MB de imagem a cada ciclo: trazer isso para o JavaScript é inviável.
#[tauri::command]
pub fn hash_arquivo(path: String) -> Result<String, String> {
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// SHA-256 de uma string, hex truncado em 16 caracteres. Usado para derivar o nome do
/// diretório do manifesto a partir do caminho do cofre — precisa ser estável e curto,
/// não precisa resistir a colisão adversarial.
#[tauri::command]
pub fn hash_texto(texto: String) -> String {
    let mut hasher = Sha256::new();
    hasher.update(texto.as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}
