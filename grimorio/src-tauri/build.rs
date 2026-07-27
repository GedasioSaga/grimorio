fn main() {
    // `auth.rs` lê as credenciais do OAuth com `option_env!`, que resolve em tempo de
    // compilação. O cargo rastreia arquivos, não variáveis de ambiente: sem estas linhas
    // ele reaproveitaria um binário compilado antes de as credenciais existirem, e o
    // login falharia com "credenciais não embutidas" mesmo com o shell configurado certo.
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=GOOGLE_CLIENT_SECRET");
    tauri_build::build()
}
