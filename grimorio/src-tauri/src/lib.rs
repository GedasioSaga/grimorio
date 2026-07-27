use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// `auth` e `drive` são públicos para que `examples/verificar_drive.rs` possa exercitar o
// cliente do Drive contra a API real sem subir a janela do Tauri.
pub mod auth;
pub mod drive;
mod hash;

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
    /// Tamanho em bytes. `null` quando o metadado não pôde ser lido.
    size: Option<u64>,
    /// Epoch em MILISSEGUNDOS. `null` quando o metadado não pôde ser lido.
    mtime: Option<i64>,
}

/// Instante em milissegundos desde o epoch — a unidade nativa do JavaScript, e a mesma que o
/// manifesto do sync guarda em `mtimeLocal`.
///
/// Segundos perderiam a resolução que separa duas gravações dentro do mesmo segundo, e o
/// "pula-hash" da varredura — que só compara tamanho e mtime — leria dois saves seguidos como
/// inalterados. Nanossegundos passariam de 2^53 e chegariam ao JavaScript arredondados, o que é
/// pior: o número mentiria sem avisar. Milissegundo cabe folgado num float de 64 bits.
///
/// Data anterior a 1970 vira negativo em vez de `None`: "antigo" não pode virar "ilegível".
fn epoch_ms(instante: SystemTime) -> Option<i64> {
    match instante.duration_since(UNIX_EPOCH) {
        Ok(desde) => i64::try_from(desde.as_millis()).ok(),
        Err(antes) => i64::try_from(antes.duration().as_millis()).ok().map(|ms| -ms),
    }
}

/// Uma entrada de diretório com o metadado que deu para ler.
///
/// **Metadado ilegível não derruba a listagem.** Antivírus segurando um arquivo, permissão
/// negada ou link quebrado apagariam a varredura do cofre INTEIRO — e, na tela, a lista de
/// personagens, porque todo `listDir` do `vaultRepo` trata exceção como pasta vazia. A entrada
/// vem com `size`/`mtime` nulos e quem consome decide o que fazer; para a varredura de sync
/// isso significa recalcular o hash, que é custo, não erro.
///
/// `eh_dir_do_scan` (o `DirEntry::file_type`) é plano B, nunca primeira escolha: ele sai da
/// própria varredura do diretório e sobrevive ao arquivo que não abre, mas não segue link
/// simbólico. O metadado vem primeiro para que a resposta de hoje não mude.
fn descrever(name: String, meta: Option<std::fs::Metadata>, eh_dir_do_scan: bool) -> DirEntryInfo {
    DirEntryInfo {
        name,
        is_dir: meta.as_ref().map_or(eh_dir_do_scan, std::fs::Metadata::is_dir),
        size: meta.as_ref().map(std::fs::Metadata::len),
        mtime: meta.as_ref().and_then(|m| m.modified().ok()).and_then(epoch_ms),
    }
}

/// A listagem em si, com a leitura do metadado INJETADA.
///
/// A injeção existe por um motivo só: no Windows `DirEntry::metadata()` quase nunca falha — o
/// dado já vem da varredura do diretório —, então nenhum teste tem como fabricar a entrada
/// ilegível que motivou toda a tolerância acima. Com a leitura injetada, o teste força o caso e
/// prova que a listagem volta INTEIRA, só sem os campos.
fn listar(
    path: &str,
    ler_meta: impl Fn(&std::fs::DirEntry) -> Option<std::fs::Metadata>,
) -> Result<Vec<DirEntryInfo>, String> {
    let mut out = Vec::new();
    for entrada in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        // Falha do iterador é falha do DIRETÓRIO, não de uma entrada: engoli-la devolveria uma
        // listagem incompleta, que a varredura de sync leria como arquivos apagados.
        let entrada = entrada.map_err(|e| e.to_string())?;
        let eh_dir_do_scan = entrada.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(descrever(
            entrada.file_name().to_string_lossy().to_string(),
            ler_meta(&entrada),
            eh_dir_do_scan,
        ));
    }
    Ok(out)
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    listar(&path, |entrada| entrada.metadata().ok())
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
    std::fs::copy(&from, &to)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    let destino = Path::new(&to);
    if let Some(parent) = destino.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // OneDrive pode segurar handle transiente; mesmo retry do write atomico.
    let mut result = std::fs::rename(&from, &to);
    for delay_ms in RENAME_RETRY_DELAYS_MS {
        if result.is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        result = std::fs::rename(&from, &to);
    }
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(auth::EstadoGoogle::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file_atomic,
            write_binary_base64,
            list_dir,
            mkdir_all,
            remove_path,
            copy_file,
            rename_path,
            path_exists,
            hash::hash_arquivo,
            hash::hash_texto,
            auth::google_iniciar_login,
            auth::google_access_token,
            auth::google_conta,
            auth::google_desconectar,
            drive::drive_pasta_raiz,
            drive::drive_garantir_pasta,
            drive::drive_listar,
            drive::drive_enviar,
            drive::drive_baixar,
            drive::drive_apagar
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    /// Diretório novo e exclusivo no temp do sistema. Sem crate de temp-dir: o nome carrega o
    /// relógio em nanossegundos porque `cargo test` roda os testes em paralelo, e dois testes
    /// escrevendo no mesmo diretório veriam as entradas um do outro.
    fn dir_temporario(rotulo: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("relógio antes de 1970")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("grimorio-{rotulo}-{nanos}"));
        std::fs::create_dir_all(&dir).expect("não deu para criar o diretório de teste");
        dir
    }

    fn achar<'a>(entradas: &'a [DirEntryInfo], nome: &str) -> &'a DirEntryInfo {
        entradas
            .iter()
            .find(|e| e.name == nome)
            .unwrap_or_else(|| panic!("`{nome}` não veio na listagem"))
    }

    #[test]
    fn epoch_ms_no_proprio_epoch_e_zero() {
        assert_eq!(epoch_ms(UNIX_EPOCH), Some(0));
    }

    /// O milissegundo é o dígito que decide se o "pula-hash" enxerga dois saves seguidos.
    /// Truncar para segundo daria 1_753_000_000_000 e o teste cairia.
    #[test]
    fn epoch_ms_preserva_o_milissegundo() {
        let instante = UNIX_EPOCH + Duration::from_millis(1_753_000_000_123);
        assert_eq!(epoch_ms(instante), Some(1_753_000_000_123));
    }

    #[test]
    fn epoch_ms_antes_de_1970_vira_negativo_e_nao_ilegivel() {
        assert_eq!(epoch_ms(UNIX_EPOCH - Duration::from_millis(1500)), Some(-1500));
    }

    /// O caso que a varredura de um cofre inteiro não pode transformar em falha: sem metadado a
    /// entrada continua na lista, só sem os campos.
    #[test]
    fn metadado_ilegivel_mantem_a_entrada_sem_os_campos() {
        let info = descrever("travado.json".to_string(), None, false);

        assert_eq!(info.name, "travado.json");
        assert_eq!(info.size, None);
        assert_eq!(info.mtime, None);
    }

    #[test]
    fn sem_metadado_o_tipo_vem_da_varredura_do_diretorio() {
        assert!(descrever("pasta".to_string(), None, true).is_dir);
        assert!(!descrever("arquivo".to_string(), None, false).is_dir);
    }

    /// Com metadado, ele manda — inclusive contra o `file_type`, que não segue link simbólico.
    #[test]
    fn com_metadado_o_tipo_ignora_o_palpite_da_varredura() {
        let dir = dir_temporario("tipo");
        let meta = std::fs::metadata(&dir).ok();

        assert!(descrever("d".to_string(), meta, false).is_dir);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_dir_devolve_tamanho_e_mtime_do_arquivo() {
        let dir = dir_temporario("listagem");
        std::fs::write(dir.join("gandalf.json"), b"12345").expect("escrita falhou");
        std::fs::create_dir(dir.join("campanhas")).expect("mkdir falhou");
        let antes = epoch_ms(SystemTime::now()).expect("agora fora da faixa");

        let entradas = list_dir(dir.to_string_lossy().to_string()).expect("list_dir falhou");

        let arquivo = achar(&entradas, "gandalf.json");
        assert!(!arquivo.is_dir);
        assert_eq!(arquivo.size, Some(5));
        // Escrito segundos atrás, no máximo: pega o campo preso num valor fixo (0, epoch).
        let mtime = arquivo.mtime.expect("mtime não veio");
        assert!(
            (antes - 60_000..antes + 60_000).contains(&mtime),
            "mtime fora da janela do teste: {mtime} vs {antes}"
        );
        assert!(achar(&entradas, "campanhas").is_dir);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// O caso que a tolerância existe para atender: o metadado não abre e a listagem volta
    /// INTEIRA, com o tipo certo, só sem os campos. Descartar a entrada aqui faria a varredura
    /// do sync ler o arquivo como apagado — e mandar apagá-lo do Drive.
    #[test]
    fn listagem_sobrevive_a_metadado_ilegivel_em_toda_entrada() {
        let dir = dir_temporario("ilegivel");
        std::fs::write(dir.join("gandalf.json"), b"12345").expect("escrita falhou");
        std::fs::create_dir(dir.join("campanhas")).expect("mkdir falhou");

        let entradas = listar(&dir.to_string_lossy(), |_| None).expect("listar falhou");

        assert_eq!(entradas.len(), 2);
        assert!(entradas.iter().all(|e| e.size.is_none() && e.mtime.is_none()));
        assert!(achar(&entradas, "campanhas").is_dir);
        assert!(!achar(&entradas, "gandalf.json").is_dir);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_dir_recusa_diretorio_que_nao_existe() {
        let inexistente = std::env::temp_dir().join("grimorio-nao-existe-mesmo");
        assert!(list_dir(inexistente.to_string_lossy().to_string()).is_err());
    }
}
