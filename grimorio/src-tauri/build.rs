use std::path::PathBuf;

/// Credenciais que `auth.rs` lê com `option_env!`, resolvidas em tempo de compilação.
const CREDENCIAIS: [&str; 2] = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];

/// Arquivo de dev local, ao lado do `Cargo.toml`. Ignorado pelo git via `.env.*`.
const ARQUIVO_LOCAL: &str = ".env.local";

fn main() {
    // O cargo decide recompilar olhando arquivos, não variáveis de ambiente. Sem isto ele
    // reaproveitaria um binário compilado antes de as credenciais existirem, e o login
    // falharia com "compilada sem as credenciais" mesmo com tudo configurado certo.
    for chave in CREDENCIAIS {
        println!("cargo:rerun-if-env-changed={chave}");
    }

    let caminho = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join(ARQUIVO_LOCAL);
    println!("cargo:rerun-if-changed={}", caminho.display());

    // O ambiente vence o arquivo: o workflow de release injeta por variável, e um arquivo
    // esquecido na máquina não pode sequestrar a build oficial.
    let conteudo = std::fs::read_to_string(&caminho).unwrap_or_default();
    for chave in CREDENCIAIS {
        if std::env::var_os(chave).is_some() {
            continue;
        }
        if let Some(valor) = ler_do_arquivo(&conteudo, chave) {
            println!("cargo:rustc-env={chave}={valor}");
        }
    }

    tauri_build::build()
}

/// Lê `CHAVE=valor` do arquivo local. Ignora linhas vazias e comentários, tolera aspas e
/// espaços em volta — o valor é colado à mão, então o formato precisa perdoar desleixo.
/// Devolve `None` para valor vazio ou com quebra de linha, que corromperia a diretiva
/// `cargo:rustc-env` (uma linha, um valor) e viraria um erro de build confuso.
fn ler_do_arquivo(conteudo: &str, chave: &str) -> Option<String> {
    let valor = conteudo
        .lines()
        .map(str::trim)
        .filter(|linha| !linha.starts_with('#'))
        .find_map(|linha| linha.strip_prefix(chave)?.trim_start().strip_prefix('='))?
        .trim()
        .trim_matches(['"', '\''])
        .trim();

    (!valor.is_empty() && !valor.contains(['\n', '\r'])).then(|| valor.to_string())
}
