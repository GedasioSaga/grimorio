//! Spike descartável: sob o escopo `drive.file`, o `changes.list` do Google Drive enxerga
//! os arquivos que o próprio app criou?
//!
//! A documentação do Google é omissa e a resposta decide o desenho do polling do sync:
//! `changes.list` com `pageToken` (incremental, barato, enxerga exclusão) ou `files.list`
//! filtrando `modifiedTime` (caro e cego para exclusões). Só dá para responder batendo na
//! API de verdade — é o que este arquivo faz, criando, alterando e apagando um arquivo
//! descartável e olhando o feed de mudanças depois de cada passo.
//!
//! Rode com `cargo run --example spike_changes`. Exige uma conta já conectada pelo app: o
//! refresh token sai do Gerenciador de Credenciais, a mesma entrada que o `auth.rs` grava.
//!
//! Nenhum segredo é impresso — tokens aparecem no máximo como comprimento.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;

type Resultado<T> = Result<T, String>;

const SERVICO_KEYRING: &str = "grimorio";
const ENTRADA_REFRESH: &str = "google-refresh";

const URL_TOKEN: &str = "https://oauth2.googleapis.com/token";
const URL_DRIVE: &str = "https://www.googleapis.com/drive/v3";
const URL_UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3";

/// Mesmas credenciais de compilação que o `auth.rs` usa: o `build.rs` as injeta a partir
/// do `src-tauri/.env.local`.
const CLIENT_ID: &str = match option_env!("GOOGLE_CLIENT_ID") {
    Some(valor) => valor,
    None => "",
};
const CLIENT_SECRET: &str = match option_env!("GOOGLE_CLIENT_SECRET") {
    Some(valor) => valor,
    None => "",
};

/// Separador do corpo `multipart/related`. Precisa não aparecer no conteúdo enviado.
const FRONTEIRA: &str = "grimorio-spike-fronteira-8f2a";

const CONTEUDO_INICIAL: &str = r#"{"spike":"changes.list","rodada":1}"#;
const CONTEUDO_MODIFICADO: &str = r#"{"spike":"changes.list","rodada":2,"alterado":true}"#;

/// Campos pedidos ao `changes.list`. Explícitos em vez de `*` para a saída caber na tela
/// sem esconder o que importa: qual arquivo mudou, quando, e se sumiu.
const CAMPOS_MUDANCAS: &str = "nextPageToken,newStartPageToken,\
     changes(changeType,time,removed,fileId,file(id,name,trashed,mimeType,modifiedTime))";

/// O feed do Drive é eventualmente consistente: a mudança pode levar alguns segundos para
/// entrar. Sem esperar, o spike responderia "não aparece" por chegar cedo demais — que é
/// exatamente o falso negativo capaz de estragar a decisão de arquitetura.
const TENTATIVAS: u32 = 10;
const INTERVALO: Duration = Duration::from_secs(2);

#[tokio::main]
async fn main() {
    if let Err(erro) = executar().await {
        eprintln!("\nSPIKE FALHOU: {erro}");
        std::process::exit(1);
    }
}

async fn executar() -> Resultado<()> {
    if CLIENT_ID.is_empty() || CLIENT_SECRET.is_empty() {
        return Err("build sem GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — confira o \
                    src-tauri/.env.local e recompile"
            .to_string());
    }

    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "não foi possível iniciar o cliente HTTP".to_string())?;

    println!("[1] trocando o refresh token guardado no Windows por um access token");
    let refresh = ler_refresh()?;
    println!("    refresh token lido do keyring (comprimento {})", refresh.len());
    let token = access_token(&http, &refresh).await?;
    println!("    access token obtido (comprimento {})", token.len());

    println!("\n[2] pedindo o startPageToken ANTES de criar qualquer coisa");
    let token_inicial = start_page_token(&http, &token).await?;
    println!("    startPageToken = {token_inicial}");

    let nome = format!("grimorio-spike-{}.json", agora());
    println!("\n[3] criando {nome} no Drive (upload multipart)");
    let id = criar_arquivo(&http, &token, &nome).await?;
    println!("    id do arquivo = {id}");

    // A investigação é isolada da limpeza de propósito: qualquer erro nos passos 4 a 6
    // ainda tem que passar pelo `limpar`, senão o spike deixa lixo na conta do usuário.
    let investigacao = investigar(&http, &token, &token_inicial, &id).await;

    println!("\n[7] limpeza");
    limpar(&http, &token, &id).await;

    investigacao
}

async fn investigar(
    http: &reqwest::Client,
    token: &str,
    token_inicial: &str,
    id: &str,
) -> Resultado<()> {
    println!("\n[4] changes.list a partir do token do passo 2 — a criação aparece?");
    let (mudancas, token_pos_criacao) = esperar_mudanca(http, token, token_inicial, id).await?;
    let criacao = achar(&mudancas, id);
    relatar("criação", &mudancas, criacao.as_ref());

    println!("\n[5] regravando o conteúdo do mesmo id e listando de novo");
    modificar_arquivo(http, token, id).await?;
    let (mudancas, token_pos_modificacao) =
        esperar_mudanca(http, token, &token_pos_criacao, id).await?;
    let modificacao = achar(&mudancas, id);
    relatar("modificação", &mudancas, modificacao.as_ref());

    println!("\n[6] apagando o arquivo e listando de novo");
    if !apagar_arquivo(http, token, id).await? {
        return Err("files.delete disse que o arquivo não existe — spike inconclusivo".to_string());
    }
    let (mudancas, _) = esperar_mudanca(http, token, &token_pos_modificacao, id).await?;
    let exclusao = achar(&mudancas, id);
    relatar("exclusão", &mudancas, exclusao.as_ref());

    println!("\n{}", "=".repeat(78));
    println!(
        "VEREDITO: changes.list sob drive.file — criação: {} | modificação: {} | exclusão: {}",
        marcar(criacao.is_some()),
        marcar(modificacao.is_some()),
        marcar(exclusao.is_some())
    );
    if let Some(valor) = &exclusao {
        println!(
            "          forma da exclusão: removed={} / trashed={}",
            valor.get("removed").unwrap_or(&Value::Null),
            valor
                .get("file")
                .and_then(|f| f.get("trashed"))
                .unwrap_or(&Value::Null)
        );
    }
    println!("{}", "=".repeat(78));
    Ok(())
}

/// Imprime a evidência do passo: o quanto o feed devolveu, quanto disso é de outros
/// arquivos (mede se o escopo `drive.file` vaza mudanças de fora do app) e o JSON cru da
/// mudança do nosso arquivo.
fn relatar(rotulo: &str, mudancas: &[Value], nossa: Option<&Value>) {
    let alheias = mudancas.len() - usize::from(nossa.is_some());
    println!("    feed devolveu {} mudança(s); {alheias} de outros arquivos", mudancas.len());
    match nossa {
        Some(valor) => println!(
            "    {rotulo} APARECE:\n{}",
            serde_json::to_string_pretty(valor).unwrap_or_else(|_| valor.to_string())
        ),
        None => println!("    {rotulo} NÃO apareceu no feed"),
    }
}

fn marcar(apareceu: bool) -> &'static str {
    if apareceu {
        "SIM"
    } else {
        "NÃO"
    }
}

fn achar(mudancas: &[Value], id: &str) -> Option<Value> {
    mudancas
        .iter()
        .find(|mudanca| mudanca.get("fileId").and_then(Value::as_str) == Some(id))
        .cloned()
}

/// Lista as mudanças a partir de `page_token` até o arquivo aparecer ou a paciência acabar,
/// e devolve o token para a rodada seguinte.
///
/// Avançar o token entre os passos é o que torna o spike conclusivo: o feed guarda apenas a
/// última mudança de cada arquivo, então reusar o token inicial fundiria criação e
/// modificação numa entrada só e não daria para dizer qual das duas foi vista.
async fn esperar_mudanca(
    http: &reqwest::Client,
    token: &str,
    page_token: &str,
    id: &str,
) -> Resultado<(Vec<Value>, String)> {
    for tentativa in 1..=TENTATIVAS {
        let (mudancas, proximo) = listar_mudancas(http, token, page_token).await?;
        let achou = achar(&mudancas, id).is_some();
        println!(
            "    tentativa {tentativa}/{TENTATIVAS}: {} mudança(s), nosso arquivo {}",
            mudancas.len(),
            if achou { "presente" } else { "ausente" }
        );
        if achou || tentativa == TENTATIVAS {
            return Ok((mudancas, proximo));
        }
        tokio::time::sleep(INTERVALO).await;
    }
    unreachable!("o laço sempre retorna na última tentativa")
}

/// Varre o feed inteiro a partir de `page_token`, seguindo a paginação.
///
/// `newStartPageToken` só vem na última página; parar na primeira perderia mudanças e ainda
/// deixaria o passo seguinte sem token para continuar.
async fn listar_mudancas(
    http: &reqwest::Client,
    token: &str,
    page_token: &str,
) -> Resultado<(Vec<Value>, String)> {
    let mut pagina = page_token.to_string();
    let mut todas = Vec::new();
    loop {
        let resposta = http
            .get(format!("{URL_DRIVE}/changes"))
            .bearer_auth(token)
            .query(&[
                ("pageToken", pagina.as_str()),
                ("includeRemoved", "true"),
                ("spaces", "drive"),
                ("pageSize", "100"),
                ("fields", CAMPOS_MUDANCAS),
            ])
            .send()
            .await
            .map_err(|_| "não foi possível chamar changes.list".to_string())?;
        let corpo = json_ou_erro(resposta, "changes.list").await?;

        if let Some(lista) = corpo.get("changes").and_then(Value::as_array) {
            todas.extend(lista.iter().cloned());
        }
        if let Some(proxima) = corpo.get("nextPageToken").and_then(Value::as_str) {
            pagina = proxima.to_string();
            continue;
        }
        let novo = corpo
            .get("newStartPageToken")
            .and_then(Value::as_str)
            .ok_or_else(|| "changes.list não devolveu newStartPageToken".to_string())?;
        return Ok((todas, novo.to_string()));
    }
}

async fn start_page_token(http: &reqwest::Client, token: &str) -> Resultado<String> {
    let resposta = http
        .get(format!("{URL_DRIVE}/changes/startPageToken"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "não foi possível chamar changes.getStartPageToken".to_string())?;
    let corpo = json_ou_erro(resposta, "changes.getStartPageToken").await?;
    corpo
        .get("startPageToken")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "a resposta veio sem startPageToken".to_string())
}

/// Cria com upload multipart: metadados e conteúdo numa requisição só, para o feed registrar
/// uma criação limpa em vez de uma criação seguida de edição.
async fn criar_arquivo(http: &reqwest::Client, token: &str, nome: &str) -> Resultado<String> {
    let metadados = serde_json::json!({ "name": nome }).to_string();
    let resposta = http
        .post(format!("{URL_UPLOAD}/files"))
        .bearer_auth(token)
        .query(&[("uploadType", "multipart"), ("fields", "id,name,modifiedTime")])
        .header(
            reqwest::header::CONTENT_TYPE,
            format!("multipart/related; boundary={FRONTEIRA}"),
        )
        .body(corpo_multipart(&metadados, CONTEUDO_INICIAL))
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.create".to_string())?;
    let corpo = json_ou_erro(resposta, "files.create").await?;
    println!("    resposta: {corpo}");
    corpo
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "files.create não devolveu id".to_string())
}

fn corpo_multipart(metadados: &str, conteudo: &str) -> String {
    format!(
        "--{FRONTEIRA}\r\n\
         Content-Type: application/json; charset=UTF-8\r\n\r\n\
         {metadados}\r\n\
         --{FRONTEIRA}\r\n\
         Content-Type: application/json\r\n\r\n\
         {conteudo}\r\n\
         --{FRONTEIRA}--"
    )
}

async fn modificar_arquivo(http: &reqwest::Client, token: &str, id: &str) -> Resultado<()> {
    let resposta = http
        .patch(format!("{URL_UPLOAD}/files/{id}"))
        .bearer_auth(token)
        .query(&[("uploadType", "media"), ("fields", "id,modifiedTime")])
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(CONTEUDO_MODIFICADO)
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.update".to_string())?;
    let corpo = json_ou_erro(resposta, "files.update").await?;
    println!("    resposta: {corpo}");
    Ok(())
}

/// `Ok(false)` quando o arquivo já não existe — apagar precisa ser idempotente para a
/// limpeza rodar mesmo depois de o passo 6 já ter apagado.
async fn apagar_arquivo(http: &reqwest::Client, token: &str, id: &str) -> Resultado<bool> {
    let resposta = http
        .delete(format!("{URL_DRIVE}/files/{id}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.delete".to_string())?;
    let status = resposta.status();
    if status.is_success() {
        println!("    files.delete respondeu HTTP {}", status.as_u16());
        return Ok(true);
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(false);
    }
    Err(format!(
        "files.delete: HTTP {} — {}",
        status.as_u16(),
        resposta.text().await.unwrap_or_default()
    ))
}

async fn limpar(http: &reqwest::Client, token: &str, id: &str) {
    match apagar_arquivo(http, token, id).await {
        Ok(true) => println!("    arquivo {id} apagado agora"),
        Ok(false) => println!("    nada a apagar: {id} já não existe no Drive"),
        Err(erro) => eprintln!("    ATENÇÃO: sobrou {id} no Drive ({erro}) — remova à mão"),
    }
}

fn ler_refresh() -> Resultado<String> {
    keyring::Entry::new(SERVICO_KEYRING, ENTRADA_REFRESH)
        .map_err(|_| "não foi possível abrir o Gerenciador de Credenciais".to_string())?
        .get_password()
        .map_err(|_| "nenhum refresh token guardado — entre com o Google pelo app antes".to_string())
}

#[derive(serde::Deserialize)]
struct RespostaToken {
    access_token: String,
}

/// Nunca formata o corpo da resposta: no sucesso ele carrega o access token, e um erro de
/// parse jogaria o token inteiro na tela. Da falha só sai o campo `error`.
async fn access_token(http: &reqwest::Client, refresh: &str) -> Resultado<String> {
    let resposta = http
        .post(URL_TOKEN)
        .form(&[
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|_| "não foi possível falar com o endpoint de token do Google".to_string())?;

    let status = resposta.status();
    if !status.is_success() {
        let codigo = resposta
            .json::<Value>()
            .await
            .ok()
            .and_then(|valor| valor.get("error").and_then(Value::as_str).map(str::to_string))
            .unwrap_or_else(|| "sem detalhe".to_string());
        return Err(format!(
            "o Google recusou a renovação do token (HTTP {} — {codigo})",
            status.as_u16()
        ));
    }

    Ok(resposta
        .json::<RespostaToken>()
        .await
        .map_err(|_| "o Google respondeu o token em formato inesperado".to_string())?
        .access_token)
}

/// Corpo da resposta como JSON, ou erro com status e corpo cru para o spike poder mostrar o
/// que o Google reclamou. Não usar no endpoint de token: lá o corpo é segredo.
async fn json_ou_erro(resposta: reqwest::Response, chamada: &str) -> Resultado<Value> {
    let status = resposta.status();
    let corpo = resposta
        .text()
        .await
        .map_err(|_| format!("{chamada}: não foi possível ler a resposta"))?;
    if !status.is_success() {
        return Err(format!("{chamada}: HTTP {} — {corpo}", status.as_u16()));
    }
    serde_json::from_str(&corpo).map_err(|erro| format!("{chamada}: JSON inválido ({erro}) — {corpo}"))
}

fn agora() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|desde| desde.as_secs())
        .unwrap_or_default()
}
