//! Cliente do Google Drive: as operações de arquivo que o executor de sync precisa para
//! aplicar o plano devolvido por `reconciliar` (`src/lib/sync/reconciliar.ts`).
//!
//! Mora no Rust, e não no TypeScript, para que o access token não precise atravessar a
//! ponte: cada comando daqui pede o token ao `auth.rs` e o consome no próprio processo. O
//! que cruza para o JavaScript é só id, caminho, hash e tamanho.
//!
//! O escopo concedido é `drive.file`, então toda listagem já nasce restrita aos arquivos
//! que este app criou — não existe caminho, aqui dentro, para enxergar ou apagar arquivo
//! alheio do Drive do usuário.
//!
//! **Forma canônica do caminho.** Todo caminho que entra ou sai daqui usa `/`, nunca `\`,
//! e nunca traz `.`, `..` ou segmento vazio. É pré-condição do motor: as três origens
//! (manifesto, varredura local, listagem do Drive) fazem união de chaves, e uma barra
//! invertida a mais transforma um arquivo em dois — um que sobe e outro que "sumiu".
//! Caixa e normalização Unicode (NFC × NFD) continuam sendo responsabilidade de quem monta
//! os mapas: este módulo devolve o nome exatamente como o Drive o soletra.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::Path;

use crate::auth::{google_access_token, EstadoGoogle};

const API: &str = "https://www.googleapis.com/drive/v3/files";
const API_UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
const MIME_PASTA: &str = "application/vnd.google-apps.folder";

/// `sha256Checksum` é o que permite responder "mudou?" sem baixar o arquivo, e é o campo
/// que o motor exige: o lado local é SHA-256 (`hash_arquivo`), então comparar com o
/// `md5Checksum` — o campo famoso — nunca daria igual e geraria conflito em tudo.
/// `version` é o plano B para os poucos casos sem checksum, e `appProperties` traz a
/// assinatura de quem enviou, usada para nomear a cópia de conflito.
const CAMPOS: &str =
    "id,name,parents,mimeType,size,version,sha256Checksum,trashed,modifiedTime,appProperties";

/// Resposta de um envio: só o que o manifesto precisa regravar.
const CAMPOS_ENVIO: &str = "id,name,size,version,sha256Checksum";

/// Nome da pasta que o app cria no Drive do usuário. É só rótulo — a identidade vem do
/// marcador em `appProperties`, então renomear ou arrastar a pasta no drive.google.com
/// não desliga o sync.
pub const NOME_RAIZ: &str = "Grimório";
pub const MARCA_RAIZ: &str = "grimorioRaiz";
pub const MARCA_RAIZ_VALOR: &str = "1";

/// Assinatura do dispositivo que enviou a versão. Existe porque, quando é a cópia REMOTA
/// que perde o conflito, nada mais no Drive diz de qual máquina ela veio: a conta do
/// Google é a mesma nas duas pontas, então `lastModifyingUser` diria o mesmo nome dos dois
/// lados. O teto do Drive é 124 bytes por propriedade, o que cabe um nome de máquina.
const MARCA_DISPOSITIVO: &str = "dispositivo";

/// Acima disto o `uploadType=multipart` é recusado pelo Drive — é limite da API, não
/// escolha nossa. É o caso das imagens do cofre.
const LIMITE_MULTIPART: u64 = 5 * 1024 * 1024;

/// Máximo que o Drive aceita por página. Menos páginas, menos ida e volta na varredura.
const POR_PAGINA: &str = "1000";

/// Access token de vida curta. Sem `derive(Debug)` de propósito, pelo mesmo motivo dos
/// tipos de `auth.rs`: nada que carregue segredo pode escorregar para um log por acidente.
pub struct Credencial(String);

impl Credencial {
    /// Embrulha um access token já obtido. Existe para `examples/verificar_drive.rs`, que
    /// pega o token pelo refresh guardado no Windows em vez de pelo estado do Tauri.
    pub fn nova(access_token: String) -> Self {
        Self(access_token)
    }
}

/// Um arquivo (ou pasta) como o Drive o descreve. `size` e `version` chegam como STRING
/// mesmo sendo inteiros de 64 bits — é como o JSON da API v3 representa `int64`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArquivoDrive {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    parents: Vec<String>,
    mime_type: Option<String>,
    size: Option<String>,
    version: Option<String>,
    sha256_checksum: Option<String>,
    #[serde(default)]
    trashed: bool,
    modified_time: Option<String>,
    #[serde(default)]
    app_properties: HashMap<String, String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pagina {
    #[serde(default)]
    files: Vec<ArquivoDrive>,
    next_page_token: Option<String>,
}

/// Um arquivo do cofre no Drive, já com o caminho relativo reconstruído. Alimenta o
/// `EstadoRemoto` do motor.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemRemoto {
    caminho: String,
    file_id: String,
    hash: Option<String>,
    versao: String,
    tamanho: Option<u64>,
    modificado_em: Option<String>,
    device_nome: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PastaRemota {
    caminho: String,
    file_id: String,
}

/// A árvore do cofre no Drive, achatada em caminhos canônicos. As pastas vêm junto para
/// que o executor as guarde no manifesto e não precise reresolver a cadeia a cada envio.
#[derive(serde::Serialize, Debug, Default, PartialEq)]
pub struct ConteudoRemoto {
    pastas: Vec<PastaRemota>,
    arquivos: Vec<ItemRemoto>,
}

/// `file_id: None` cria; `Some` substitui o conteúdo do arquivo que já existe.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PedidoEnvio {
    pasta_id: String,
    nome: String,
    caminho_local: String,
    file_id: Option<String>,
    device_nome: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArquivoEnviado {
    file_id: String,
    hash: Option<String>,
    versao: String,
    tamanho: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Modo {
    Multipart,
    Resumavel,
}

// ---------------------------------------------------------------------------
// Lógica pura: caminho, consulta, decisão de envio e reconstrução da árvore.
// ---------------------------------------------------------------------------

/// Quebra um caminho relativo em segmentos na forma canônica.
///
/// Aceita `\` e `/` misturados porque o caminho vem do Windows, e recusa `.`, `..` e
/// caminho vazio: o Drive não tem noção de caminho, então esses segmentos não teriam para
/// onde apontar — viraria uma pasta chamada `..` de verdade.
fn segmentos(caminho: &str) -> Result<Vec<String>, String> {
    let partes: Vec<String> = caminho
        .replace('\\', "/")
        .split('/')
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect();

    if partes.is_empty() {
        return Err("caminho vazio não aponta para nada no Drive".to_string());
    }
    if partes.iter().any(|p| p == "." || p == "..") {
        return Err(format!("caminho relativo inválido para o Drive: {caminho}"));
    }
    Ok(partes)
}

/// Nome de arquivo tem de ser UM segmento. Um `nome` com barra criaria no Drive um arquivo
/// cujo nome contém `/`, que nenhuma listagem conseguiria mapear de volta para um caminho.
fn validar_nome(nome: &str) -> Result<(), String> {
    match segmentos(nome)?.len() {
        1 => Ok(()),
        _ => Err(format!("nome de arquivo não pode conter barra: {nome}")),
    }
}

/// Escapa um valor para dentro do parâmetro `q` do Drive, que delimita strings com aspas
/// simples. Sem isto, um cofre chamado `O'Brien` produz uma consulta sintaticamente
/// quebrada — e a barra invertida precisa ser dobrada ANTES da aspa, senão a barra que
/// acabamos de inserir seria escapada de novo.
fn escapar_q(valor: &str) -> String {
    valor.replace('\\', "\\\\").replace('\'', "\\'")
}

fn modo_de_envio(tamanho: u64) -> Modo {
    if tamanho >= LIMITE_MULTIPART {
        Modo::Resumavel
    } else {
        Modo::Multipart
    }
}

/// Método e URL do envio.
///
/// Errar aqui falha em silêncio: um `POST` onde deveria haver `PATCH` não dá erro nenhum —
/// cria um segundo arquivo com o mesmo nome ao lado do original, e o caminho passa a ter
/// duas versões no Drive.
fn destino_do_envio(file_id: Option<&str>, modo: Modo) -> (reqwest::Method, String) {
    let tipo = match modo {
        Modo::Multipart => "multipart",
        Modo::Resumavel => "resumable",
    };
    match file_id {
        Some(id) => (
            reqwest::Method::PATCH,
            format!("{API_UPLOAD}/{id}?uploadType={tipo}&fields={CAMPOS_ENVIO}"),
        ),
        None => (
            reqwest::Method::POST,
            format!("{API_UPLOAD}?uploadType={tipo}&fields={CAMPOS_ENVIO}"),
        ),
    }
}

/// Metadados que acompanham o envio.
///
/// Na substituição não vão `name` nem `parents` de propósito: `parents` não é gravável em
/// update (o Drive exige os parâmetros `addParents`/`removeParents` e devolve erro se o
/// campo aparecer no corpo), e reenviar `name` sobrescreveria uma renomeação feita do
/// outro lado sem que nada tivesse pedido isso.
fn metadados_envio(
    nome: &str,
    pasta_id: &str,
    file_id: Option<&str>,
    device_nome: &str,
) -> serde_json::Value {
    let assinatura = serde_json::json!({ MARCA_DISPOSITIVO: device_nome });
    match file_id {
        Some(_) => serde_json::json!({ "appProperties": assinatura }),
        None => serde_json::json!({
            "name": nome,
            "parents": [pasta_id],
            "appProperties": assinatura,
        }),
    }
}

/// Fronteira do `multipart/related`, derivada do hash do próprio conteúdo.
///
/// Uma fronteira que aparecesse dentro do corpo faria o Drive ler o meio do arquivo como
/// cabeçalho de parte, e o upload chegaria truncado sem nenhum erro. Sair do hash torna
/// isso tão improvável quanto achar um preimage parcial de SHA-256; o alongamento cobre o
/// resto.
fn fronteira(conteudo: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = format!("{:x}", Sha256::digest(conteudo));
    alongar_ate_sumir(format!("grimorio-{}", &digest[..32]), conteudo)
}

/// Alonga a marca até ela não aparecer no conteúdo. Termina sempre: cada volta a deixa um
/// caractere maior, e marca maior que o conteúdo não cabe dentro dele.
fn alongar_ate_sumir(mut marca: String, conteudo: &[u8]) -> String {
    while contem(conteudo, marca.as_bytes()) {
        marca.push('z');
    }
    marca
}

fn contem(palheiro: &[u8], agulha: &[u8]) -> bool {
    palheiro.len() >= agulha.len() && palheiro.windows(agulha.len()).any(|j| j == agulha)
}

/// Corpo do `uploadType=multipart`: metadados JSON e bytes na mesma requisição.
fn corpo_multipart(metadados: &str, mime: &str, conteudo: &[u8], fronteira: &str) -> Vec<u8> {
    let mut corpo = Vec::with_capacity(conteudo.len() + metadados.len() + 256);
    corpo.extend_from_slice(
        format!(
            "--{fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadados}\r\n\
             --{fronteira}\r\nContent-Type: {mime}\r\n\r\n"
        )
        .as_bytes(),
    );
    corpo.extend_from_slice(conteudo);
    corpo.extend_from_slice(format!("\r\n--{fronteira}--").as_bytes());
    corpo
}

/// Tipo declarado no envio. Só precisa distinguir o que o cofre guarda; qualquer outra
/// coisa sobe como binário opaco, que é o que ela é para o Drive.
fn mime_de(nome: &str) -> &'static str {
    let extensao = Path::new(nome)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match extensao.as_str() {
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn tamanho_de(arquivo: &ArquivoDrive) -> Option<u64> {
    arquivo.size.as_deref()?.parse().ok()
}

fn eh_pasta(arquivo: &ArquivoDrive) -> bool {
    arquivo.mime_type.as_deref() == Some(MIME_PASTA)
}

fn item_remoto(caminho: String, arquivo: &ArquivoDrive) -> ItemRemoto {
    ItemRemoto {
        caminho,
        file_id: arquivo.id.clone(),
        hash: arquivo.sha256_checksum.clone(),
        versao: arquivo.version.clone().unwrap_or_default(),
        tamanho: tamanho_de(arquivo),
        modificado_em: arquivo.modified_time.clone(),
        device_nome: arquivo.app_properties.get(MARCA_DISPOSITIVO).cloned(),
    }
}

fn arquivo_enviado(arquivo: &ArquivoDrive) -> ArquivoEnviado {
    ArquivoEnviado {
        file_id: arquivo.id.clone(),
        hash: arquivo.sha256_checksum.clone(),
        versao: arquivo.version.clone().unwrap_or_default(),
        tamanho: tamanho_de(arquivo),
    }
}

/// Ordem de recência. `modifiedTime` do Drive é RFC 3339 em UTC com casas fixas, então
/// comparar como texto dá o mesmo resultado que comparar como data. O id entra só para
/// desempatar de forma estável.
fn recencia(arquivo: &ArquivoDrive) -> (&str, &str) {
    (
        arquivo.modified_time.as_deref().unwrap_or(""),
        arquivo.id.as_str(),
    )
}

/// Agrupa por pasta-mãe, descartando o que está na lixeira e o que não tem mãe.
///
/// Só a PRIMEIRA mãe conta: o Drive removeu a possibilidade de um arquivo ter várias em
/// 2020, e um resquício com duas apareceria em dois caminhos — dois arquivos aos olhos do
/// motor.
fn indexar_por_mae(arquivos: Vec<ArquivoDrive>) -> HashMap<String, Vec<ArquivoDrive>> {
    let mut por_mae: HashMap<String, Vec<ArquivoDrive>> = HashMap::new();
    for arquivo in arquivos {
        if arquivo.trashed {
            continue;
        }
        let Some(mae) = arquivo.parents.first().cloned() else {
            continue;
        };
        por_mae.entry(mae).or_default().push(arquivo);
    }
    por_mae
}

/// Reconstrói os caminhos relativos a partir da listagem achatada, descendo da raiz.
///
/// Descer, em vez de subir pelos `parents` de cada arquivo, resolve de graça o que fica
/// fora do cofre: o que não é alcançável a partir da raiz simplesmente não entra. Como o
/// escopo `drive.file` devolve todos os arquivos do app de uma vez, isso inclui os outros
/// cofres do usuário.
///
/// Duas decisões sobre nomes repetidos — que o Drive permite e o Windows não:
/// - **pastas** com o mesmo nome são FUNDIDAS no mesmo caminho. Ignorar a segunda faria os
///   arquivos dela sumirem da listagem, e sumir da listagem é exatamente o que o motor lê
///   como "apagado no Drive" — apagaria o lado local de arquivos vivos.
/// - **arquivos** com o mesmo nome não podem ser fundidos (só um conteúdo cabe no
///   caminho): vence o modificado mais recentemente, que é a versão que o usuário
///   provavelmente acabou de escrever.
fn montar_conteudo(arquivos: Vec<ArquivoDrive>, raiz_id: &str) -> ConteudoRemoto {
    let mut por_mae = indexar_por_mae(arquivos);
    let mut pastas: BTreeMap<String, String> = BTreeMap::new();
    let mut achados: BTreeMap<String, ArquivoDrive> = BTreeMap::new();

    let mut fila = VecDeque::from([(raiz_id.to_string(), String::new())]);
    while let Some((id, prefixo)) = fila.pop_front() {
        // `remove`, e não `get`, é o que garante o fim do laço: cada pasta-mãe é consumida
        // uma vez só, então um ciclo de pastas no Drive esvazia o índice em vez de girar
        // para sempre. Trocar por `get` aqui trava o app sem erro nenhum.
        let Some(mut filhos) = por_mae.remove(&id) else {
            continue;
        };
        // Ordenar antes de descer torna o resultado independente da ordem em que a API
        // devolveu as páginas — o mesmo cofre produz sempre o mesmo plano.
        filhos.sort_by(|a, b| (&a.name, &a.id).cmp(&(&b.name, &b.id)));

        for filho in filhos {
            let caminho = match prefixo.is_empty() {
                true => filho.name.clone(),
                false => format!("{prefixo}/{}", filho.name),
            };
            if !eh_pasta(&filho) {
                let manter = achados
                    .get(&caminho)
                    .is_some_and(|atual| recencia(atual) >= recencia(&filho));
                if !manter {
                    achados.insert(caminho, filho);
                }
                continue;
            }
            pastas.entry(caminho.clone()).or_insert_with(|| filho.id.clone());
            fila.push_back((filho.id, caminho));
        }
    }

    ConteudoRemoto {
        pastas: pastas
            .into_iter()
            .map(|(caminho, file_id)| PastaRemota { caminho, file_id })
            .collect(),
        arquivos: achados
            .iter()
            .map(|(caminho, arquivo)| item_remoto(caminho.clone(), arquivo))
            .collect(),
    }
}

/// Traduz a falha da API sem nunca ecoar a requisição — o token viaja no cabeçalho
/// `Authorization`, e uma mensagem que repetisse o pedido inteiro o levaria junto.
fn descrever_falha(status: u16, mensagem: Option<&str>) -> String {
    let base = match status {
        401 => "a sessão com o Google expirou — entre de novo com a sua conta",
        403 => "o Google recusou a operação no Drive (pode ser cota do dia ou permissão)",
        404 => "este arquivo já não existe no Google Drive",
        429 | 500..=599 => "o Google está instável ou pediu para desacelerar — tente de novo em instantes",
        _ => "o Google recusou a operação no Drive",
    };
    match mensagem {
        Some(detalhe) if !detalhe.is_empty() => format!("{base} (HTTP {status}: {detalhe})"),
        _ => format!("{base} (HTTP {status})"),
    }
}

#[derive(serde::Deserialize)]
struct EnvelopeErro {
    error: DetalheErro,
}

#[derive(serde::Deserialize)]
struct DetalheErro {
    message: Option<String>,
}

// ---------------------------------------------------------------------------
// Conversa com a API.
// ---------------------------------------------------------------------------

/// Cliente sem seguir redirecionamento, pelo mesmo motivo de `auth.rs`: um redirect
/// seguido às cegas levaria o cabeçalho `Authorization` para um host que não é a API.
pub fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "não foi possível iniciar o cliente HTTP para falar com o Drive".to_string())
}

async fn credencial(estado: tauri::State<'_, EstadoGoogle>) -> Result<Credencial, String> {
    google_access_token(estado).await.map(Credencial)
}

fn autorizar(pedido: reqwest::RequestBuilder, cred: &Credencial) -> reqwest::RequestBuilder {
    pedido.bearer_auth(&cred.0)
}

async fn falha(resposta: reqwest::Response) -> String {
    let status = resposta.status().as_u16();
    let corpo = resposta.text().await.unwrap_or_default();
    let mensagem = serde_json::from_str::<EnvelopeErro>(&corpo)
        .ok()
        .and_then(|e| e.error.message);
    descrever_falha(status, mensagem.as_deref())
}

/// Erro de rede — sem detalhe da biblioteca, que carrega a URL completa da requisição.
fn erro_de_rede() -> String {
    "não foi possível falar com o Google Drive — verifique a conexão com a internet".to_string()
}

async fn ler_json<T: serde::de::DeserializeOwned>(
    pedido: reqwest::RequestBuilder,
) -> Result<T, String> {
    let resposta = pedido.send().await.map_err(|_| erro_de_rede())?;
    if !resposta.status().is_success() {
        return Err(falha(resposta).await);
    }
    resposta
        .json::<T>()
        .await
        .map_err(|_| "o Google Drive respondeu em um formato inesperado".to_string())
}

/// Uma consulta `files.list`, já paginada até o fim.
async fn consultar(
    http: &reqwest::Client,
    cred: &Credencial,
    q: &str,
    ordem: Option<&str>,
) -> Result<Vec<ArquivoDrive>, String> {
    let campos = format!("nextPageToken,files({CAMPOS})");
    let mut todos = Vec::new();
    let mut proxima: Option<String> = None;

    loop {
        let mut params = vec![
            ("q", q),
            ("fields", campos.as_str()),
            ("pageSize", POR_PAGINA),
            ("spaces", "drive"),
        ];
        if let Some(ordem) = ordem {
            params.push(("orderBy", ordem));
        }
        if let Some(token) = proxima.as_deref() {
            params.push(("pageToken", token));
        }

        let pagina: Pagina = ler_json(autorizar(http.get(API), cred).query(&params)).await?;
        todos.extend(pagina.files);
        proxima = pagina.next_page_token;
        if proxima.is_none() {
            return Ok(todos);
        }
    }
}

async fn criar_pasta(
    http: &reqwest::Client,
    cred: &Credencial,
    nome: &str,
    mae: Option<&str>,
    marca: Option<(&str, &str)>,
) -> Result<String, String> {
    let mut corpo = serde_json::json!({ "name": nome, "mimeType": MIME_PASTA });
    if let Some(mae) = mae {
        corpo["parents"] = serde_json::json!([mae]);
    }
    if let Some((chave, valor)) = marca {
        corpo["appProperties"] = serde_json::json!({ chave: valor });
    }

    let criada: ArquivoDrive = ler_json(
        autorizar(http.post(API), cred)
            .query(&[("fields", "id,name")])
            .json(&corpo),
    )
    .await?;
    Ok(criada.id)
}

async fn buscar_pasta(
    http: &reqwest::Client,
    cred: &Credencial,
    mae: &str,
    nome: &str,
) -> Result<Option<String>, String> {
    let q = format!(
        "'{}' in parents and name = '{}' and mimeType = '{MIME_PASTA}' and trashed = false",
        escapar_q(mae),
        escapar_q(nome)
    );
    // Empate (duas pastas de mesmo nome, criadas por dois computadores ao mesmo tempo)
    // resolve pela mais antiga: é a escolha para a qual as duas máquinas convergem.
    let achadas = consultar(http, cred, &q, Some("createdTime")).await?;
    Ok(achadas.into_iter().next().map(|p| p.id))
}

pub async fn garantir_cadeia(
    http: &reqwest::Client,
    cred: &Credencial,
    mae: &str,
    caminho: &str,
) -> Result<String, String> {
    let mut atual = mae.to_string();
    for segmento in segmentos(caminho)? {
        atual = match buscar_pasta(http, cred, &atual, &segmento).await? {
            Some(id) => id,
            None => criar_pasta(http, cred, &segmento, Some(&atual), None).await?,
        };
    }
    Ok(atual)
}

/// Envia os bytes numa única requisição `multipart/related`.
async fn enviar_multipart(
    http: &reqwest::Client,
    cred: &Credencial,
    pedido: &PedidoEnvio,
    metadados: &str,
    conteudo: Vec<u8>,
) -> Result<ArquivoDrive, String> {
    let (metodo, url) = destino_do_envio(pedido.file_id.as_deref(), Modo::Multipart);
    let marca = fronteira(&conteudo);
    let corpo = corpo_multipart(metadados, mime_de(&pedido.nome), &conteudo, &marca);

    ler_json(
        autorizar(http.request(metodo, url), cred)
            .header(
                reqwest::header::CONTENT_TYPE,
                format!("multipart/related; boundary={marca}"),
            )
            .body(corpo),
    )
    .await
}

/// Envia em duas etapas: abre a sessão, depois manda os bytes.
///
/// O ganho aqui não é retomar de onde parou — é escapar do teto de 5 MB do multipart, que
/// é o que barra as imagens do cofre. O corpo ainda vai numa requisição só; fatiar em
/// blocos com retomada é trabalho para quando houver evidência de queda no meio.
async fn enviar_resumavel(
    http: &reqwest::Client,
    cred: &Credencial,
    pedido: &PedidoEnvio,
    metadados: &str,
    conteudo: Vec<u8>,
) -> Result<ArquivoDrive, String> {
    let (metodo, url) = destino_do_envio(pedido.file_id.as_deref(), Modo::Resumavel);
    let mime = mime_de(&pedido.nome);

    let abertura = autorizar(http.request(metodo, url), cred)
        .header("X-Upload-Content-Type", mime)
        .header("X-Upload-Content-Length", conteudo.len().to_string())
        .body(metadados.to_string())
        .header(reqwest::header::CONTENT_TYPE, "application/json; charset=UTF-8")
        .send()
        .await
        .map_err(|_| erro_de_rede())?;

    if !abertura.status().is_success() {
        return Err(falha(abertura).await);
    }
    let sessao = abertura
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "o Google Drive não abriu a sessão de envio do arquivo".to_string())?
        .to_string();

    ler_json(
        autorizar(http.put(sessao), cred)
            .header(reqwest::header::CONTENT_TYPE, mime)
            .body(conteudo),
    )
    .await
}

// ---------------------------------------------------------------------------
// Comandos.
// ---------------------------------------------------------------------------

/// Id da pasta raiz do cofre no Drive, criando-a na primeira vez.
///
/// A identidade é o marcador em `appProperties`, não o nome nem o lugar: assim o usuário
/// pode renomear a pasta ou arrastá-la para dentro de outra no drive.google.com sem que o
/// app crie uma segunda na próxima execução. Buscar pelo nome faria exatamente isso.
///
/// `nome` e `marca` chegam por parâmetro em vez de sair direto das constantes para que
/// `examples/verificar_drive.rs` possa exercitar esta função com uma raiz descartável — do
/// contrário, verificar a idempotência exigiria mexer na pasta de produção do usuário.
pub async fn pasta_raiz(
    http: &reqwest::Client,
    cred: &Credencial,
    nome: &str,
    marca: (&str, &str),
) -> Result<String, String> {
    let (chave, valor) = marca;
    let q = format!(
        "appProperties has {{ key = '{}' and value = '{}' }} \
         and mimeType = '{MIME_PASTA}' and trashed = false",
        escapar_q(chave),
        escapar_q(valor)
    );
    // Duas raízes só existem se dois computadores criaram a pasta ao mesmo tempo. A mais
    // antiga vence porque é a escolha para a qual os dois convergem sozinhos.
    if let Some(raiz) = consultar(http, cred, &q, Some("createdTime")).await?.first() {
        return Ok(raiz.id.clone());
    }
    criar_pasta(http, cred, nome, None, Some(marca)).await
}

#[tauri::command]
pub async fn drive_pasta_raiz(estado: tauri::State<'_, EstadoGoogle>) -> Result<String, String> {
    let cred = credencial(estado).await?;
    pasta_raiz(&http()?, &cred, NOME_RAIZ, (MARCA_RAIZ, MARCA_RAIZ_VALOR)).await
}

/// Garante que a cadeia de pastas de `caminho` existe abaixo de `pasta_mae_id` e devolve o
/// id da última. Idempotente: rodar de novo devolve os mesmos ids sem criar nada.
#[tauri::command]
pub async fn drive_garantir_pasta(
    estado: tauri::State<'_, EstadoGoogle>,
    pasta_mae_id: String,
    caminho: String,
) -> Result<String, String> {
    let cred = credencial(estado).await?;
    garantir_cadeia(&http()?, &cred, &pasta_mae_id, &caminho).await
}

/// A árvore do cofre no Drive, achatada em caminhos relativos à pasta dada.
///
/// Uma listagem só para o cofre inteiro, em vez de uma por pasta: o escopo `drive.file` já
/// devolve apenas o que este app criou, e descer a partir da raiz descarta o que pertence
/// a outro cofre.
pub async fn listar(
    http: &reqwest::Client,
    cred: &Credencial,
    pasta_raiz_id: &str,
) -> Result<ConteudoRemoto, String> {
    let arquivos = consultar(http, cred, "trashed = false", None).await?;
    Ok(montar_conteudo(arquivos, pasta_raiz_id))
}

#[tauri::command]
pub async fn drive_listar(
    estado: tauri::State<'_, EstadoGoogle>,
    pasta_raiz_id: String,
) -> Result<ConteudoRemoto, String> {
    let cred = credencial(estado).await?;
    listar(&http()?, &cred, &pasta_raiz_id).await
}

/// Sobe um arquivo do disco para o Drive, criando ou substituindo conforme `file_id`.
pub async fn enviar(
    http: &reqwest::Client,
    cred: &Credencial,
    pedido: &PedidoEnvio,
) -> Result<ArquivoEnviado, String> {
    validar_nome(&pedido.nome)?;
    let conteudo = std::fs::read(&pedido.caminho_local)
        .map_err(|e| format!("não foi possível ler {} para enviar: {e}", pedido.nome))?;

    let metadados = metadados_envio(
        &pedido.nome,
        &pedido.pasta_id,
        pedido.file_id.as_deref(),
        &pedido.device_nome,
    )
    .to_string();

    let enviado = match modo_de_envio(conteudo.len() as u64) {
        Modo::Multipart => enviar_multipart(http, cred, pedido, &metadados, conteudo).await?,
        Modo::Resumavel => enviar_resumavel(http, cred, pedido, &metadados, conteudo).await?,
    };
    Ok(arquivo_enviado(&enviado))
}

#[tauri::command]
pub async fn drive_enviar(
    estado: tauri::State<'_, EstadoGoogle>,
    pedido: PedidoEnvio,
) -> Result<ArquivoEnviado, String> {
    let cred = credencial(estado).await?;
    enviar(&http()?, &cred, &pedido).await
}

/// Baixa o conteúdo do arquivo para o disco.
pub async fn baixar(
    http: &reqwest::Client,
    cred: &Credencial,
    file_id: &str,
    caminho_local: &str,
) -> Result<(), String> {
    let resposta = autorizar(http.get(format!("{API}/{file_id}")), cred)
        .query(&[("alt", "media")])
        .send()
        .await
        .map_err(|_| erro_de_rede())?;

    let resposta = match destino_do_redirecionamento(&resposta) {
        // Sem `Authorization` de propósito: o destino é um host de conteúdo do Google, com
        // a autorização já embutida na URL assinada. O token não sai da API.
        Some(url) => http.get(url).send().await.map_err(|_| erro_de_rede())?,
        None => resposta,
    };
    if !resposta.status().is_success() {
        return Err(falha(resposta).await);
    }

    let bytes = resposta
        .bytes()
        .await
        .map_err(|_| "o download do arquivo foi interrompido".to_string())?;
    gravar_baixado(Path::new(caminho_local), &bytes)
}

#[tauri::command]
pub async fn drive_baixar(
    estado: tauri::State<'_, EstadoGoogle>,
    file_id: String,
    caminho_local: String,
) -> Result<(), String> {
    let cred = credencial(estado).await?;
    baixar(&http()?, &cred, &file_id, &caminho_local).await
}

fn destino_do_redirecionamento(resposta: &reqwest::Response) -> Option<String> {
    if !resposta.status().is_redirection() {
        return None;
    }
    resposta
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

/// Grava num temporário e renomeia por cima.
///
/// Escrever direto no destino deixaria, numa queda de energia no meio do download, um
/// arquivo truncado que o próximo ciclo leria como edição local — e subiria por cima da
/// cópia boa do Drive. O retry do rename é o mesmo de `lib.rs`: o OneDrive segura handle
/// transiente no arquivo, e o cofre do app empacotado mora dentro dele.
fn gravar_baixado(destino: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(mae) = destino.parent() {
        std::fs::create_dir_all(mae).map_err(|e| e.to_string())?;
    }
    let nome = destino
        .file_name()
        .ok_or("caminho de destino sem nome de arquivo")?
        .to_string_lossy()
        .to_string();
    let temporario = destino.with_file_name(format!("{nome}.baixando"));
    std::fs::write(&temporario, bytes).map_err(|e| e.to_string())?;

    let mut resultado = std::fs::rename(&temporario, destino);
    for espera_ms in [50, 100] {
        if resultado.is_ok() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(espera_ms));
        resultado = std::fs::rename(&temporario, destino);
    }
    resultado.map_err(|e| {
        let _ = std::fs::remove_file(&temporario);
        e.to_string()
    })
}

/// Manda o arquivo para a lixeira do Drive — recuperável por 30 dias.
///
/// Deleção definitiva não entra: sync que apaga por engano é a falha que custa caro, e a
/// lixeira é a única rede de proteção que existe do lado do Drive.
pub async fn apagar(
    http: &reqwest::Client,
    cred: &Credencial,
    file_id: &str,
) -> Result<(), String> {
    let _: ArquivoDrive = ler_json(
        autorizar(http.patch(format!("{API}/{file_id}")), cred)
            .query(&[("fields", "id")])
            .json(&serde_json::json!({ "trashed": true })),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn drive_apagar(
    estado: tauri::State<'_, EstadoGoogle>,
    file_id: String,
) -> Result<(), String> {
    let cred = credencial(estado).await?;
    apagar(&http()?, &cred, &file_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ler(json: &str) -> Vec<ArquivoDrive> {
        serde_json::from_str(json).expect("json de teste inválido")
    }

    /// Listagem com a forma real da API: `size` e `version` como string, uma pasta, um
    /// arquivo dentro dela e um arquivo de outro cofre (mãe desconhecida).
    const LISTAGEM: &str = r#"[
      { "id": "p1", "name": "campanhas", "parents": ["raiz"],
        "mimeType": "application/vnd.google-apps.folder" },
      { "id": "p2", "name": "aventura", "parents": ["p1"],
        "mimeType": "application/vnd.google-apps.folder" },
      { "id": "a1", "name": "gandalf.json", "parents": ["p2"], "mimeType": "application/json",
        "size": "1234", "version": "42", "sha256Checksum": "abc",
        "modifiedTime": "2026-07-26T14:32:00.000Z",
        "appProperties": { "dispositivo": "PC Casa" } },
      { "id": "x1", "name": "de-outro-cofre.json", "parents": ["outra-raiz"],
        "mimeType": "application/json", "version": "1" }
    ]"#;

    #[test]
    fn caminho_do_windows_vira_caminho_canonico() {
        assert_eq!(
            segmentos("campanhas\\aventura\\gandalf.json").unwrap(),
            ["campanhas", "aventura", "gandalf.json"]
        );
    }

    #[test]
    fn barras_repetidas_e_das_pontas_somem() {
        assert_eq!(segmentos("/campanhas//aventura/").unwrap(), ["campanhas", "aventura"]);
    }

    #[test]
    fn recusa_caminho_vazio_e_relativo() {
        // `..` no Drive não sobe pasta nenhuma: viraria uma pasta chamada `..` de verdade.
        assert!(segmentos("").is_err());
        assert!(segmentos("campanhas/../x.json").is_err());
        assert!(segmentos("./x.json").is_err());
    }

    #[test]
    fn nome_de_arquivo_nao_aceita_barra() {
        assert!(validar_nome("gandalf.json").is_ok());
        assert!(validar_nome("pasta/gandalf.json").is_err());
        assert!(validar_nome("pasta\\gandalf.json").is_err());
    }

    #[test]
    fn escapa_aspa_e_barra_na_consulta() {
        assert_eq!(escapar_q("O'Brien"), "O\\'Brien");
        // A barra é dobrada ANTES da aspa; na ordem inversa a barra recém-inserida seria
        // escapada de novo e sobraria `O\\\\'Brien`.
        assert_eq!(escapar_q("a\\b'c"), "a\\\\b\\'c");
    }

    #[test]
    fn escolhe_o_modo_de_envio_pelo_teto_de_5mb() {
        assert_eq!(modo_de_envio(0), Modo::Multipart);
        assert_eq!(modo_de_envio(LIMITE_MULTIPART - 1), Modo::Multipart);
        assert_eq!(modo_de_envio(LIMITE_MULTIPART), Modo::Resumavel);
    }

    #[test]
    fn criar_usa_post_e_substituir_usa_patch() {
        let (metodo, url) = destino_do_envio(None, Modo::Multipart);
        assert_eq!(metodo, reqwest::Method::POST);
        assert!(url.starts_with(&format!("{API_UPLOAD}?")), "url inesperada: {url}");
        assert!(url.contains("uploadType=multipart"));

        let (metodo, url) = destino_do_envio(Some("id123"), Modo::Resumavel);
        assert_eq!(metodo, reqwest::Method::PATCH);
        assert!(url.starts_with(&format!("{API_UPLOAD}/id123?")), "url inesperada: {url}");
        assert!(url.contains("uploadType=resumable"));
    }

    #[test]
    fn substituicao_nao_manda_parents_nem_name() {
        let novo = metadados_envio("gandalf.json", "pasta1", None, "PC Casa");
        assert_eq!(novo["name"], "gandalf.json");
        assert_eq!(novo["parents"][0], "pasta1");
        assert_eq!(novo["appProperties"]["dispositivo"], "PC Casa");

        // `parents` não é gravável em update — o Drive devolve erro se o campo aparecer.
        let existente = metadados_envio("gandalf.json", "pasta1", Some("id123"), "PC Casa");
        assert!(existente.get("parents").is_none(), "mandou parents no update");
        assert!(existente.get("name").is_none(), "mandou name no update");
        assert_eq!(existente["appProperties"]["dispositivo"], "PC Casa");
    }

    #[test]
    fn a_fronteira_sai_de_dentro_do_conteudo_se_precisar() {
        // O caso que importa não dá para montar com `fronteira`: exigiria um arquivo que
        // contivesse a marca derivada do hash dele mesmo, que é um preimage de SHA-256.
        // Testar o alongamento direto é o que prova que a proteção funciona quando cair
        // nela — sem o laço, isto devolveria uma marca que corta o arquivo ao meio.
        let conteudo = b"xx grimorio-aa grimorio-aaz yy";
        let marca = alongar_ate_sumir("grimorio-aa".to_string(), conteudo);
        assert!(!contem(conteudo, marca.as_bytes()), "marca ainda no conteúdo: {marca}");
        assert_eq!(marca, "grimorio-aazz");
    }

    #[test]
    fn a_fronteira_nunca_aparece_dentro_do_conteudo() {
        let conteudo = b"{\"nome\":\"Gandalf\"}";
        assert!(!contem(conteudo, fronteira(conteudo).as_bytes()));
    }

    #[test]
    fn o_corpo_multipart_tem_as_duas_partes_e_o_fechamento() {
        let corpo = corpo_multipart("{\"name\":\"x\"}", "image/png", &[0u8, 159, 146], "LIMITE");
        let texto = String::from_utf8_lossy(&corpo);
        assert!(texto.starts_with("--LIMITE\r\nContent-Type: application/json"));
        assert!(texto.contains("{\"name\":\"x\"}"));
        assert!(texto.contains("--LIMITE\r\nContent-Type: image/png\r\n\r\n"));
        assert!(texto.ends_with("\r\n--LIMITE--"));
        // Os bytes crus atravessam intactos — nada de reencodar imagem como texto.
        assert!(corpo.windows(3).any(|j| j == [0u8, 159, 146]));
    }

    #[test]
    fn deduz_o_tipo_pelo_final_do_nome() {
        assert_eq!(mime_de("gandalf.json"), "application/json");
        assert_eq!(mime_de("retrato.PNG"), "image/png");
        assert_eq!(mime_de("retrato.jpeg"), "image/jpeg");
        assert_eq!(mime_de("sem-extensao"), "application/octet-stream");
    }

    #[test]
    fn le_a_resposta_do_drive_com_os_inteiros_em_texto() {
        let arquivos = ler(LISTAGEM);
        let gandalf = arquivos.iter().find(|a| a.id == "a1").unwrap();
        // `size` e `version` chegam como string mesmo sendo int64 — é o JSON da API v3.
        assert_eq!(tamanho_de(gandalf), Some(1234));
        assert_eq!(gandalf.version.as_deref(), Some("42"));
        assert_eq!(gandalf.sha256_checksum.as_deref(), Some("abc"));
        assert_eq!(
            gandalf.app_properties.get(MARCA_DISPOSITIVO).map(String::as_str),
            Some("PC Casa")
        );
        assert!(eh_pasta(arquivos.iter().find(|a| a.id == "p1").unwrap()));
        assert!(!eh_pasta(gandalf));
    }

    #[test]
    fn monta_o_caminho_relativo_descendo_da_raiz() {
        let conteudo = montar_conteudo(ler(LISTAGEM), "raiz");
        assert_eq!(
            conteudo.arquivos,
            vec![ItemRemoto {
                caminho: "campanhas/aventura/gandalf.json".to_string(),
                file_id: "a1".to_string(),
                hash: Some("abc".to_string()),
                versao: "42".to_string(),
                tamanho: Some(1234),
                modificado_em: Some("2026-07-26T14:32:00.000Z".to_string()),
                device_nome: Some("PC Casa".to_string()),
            }]
        );
        assert_eq!(
            conteudo.pastas,
            vec![
                PastaRemota { caminho: "campanhas".to_string(), file_id: "p1".to_string() },
                PastaRemota {
                    caminho: "campanhas/aventura".to_string(),
                    file_id: "p2".to_string(),
                },
            ]
        );
    }

    #[test]
    fn ignora_lixeira_e_o_que_esta_fora_da_raiz() {
        let conteudo = montar_conteudo(ler(LISTAGEM), "raiz");
        // `x1` pende de outra raiz: é de outro cofre do mesmo usuário, e o escopo
        // `drive.file` devolve todos eles na mesma listagem.
        assert!(!conteudo.arquivos.iter().any(|a| a.file_id == "x1"));

        let com_lixeira = ler(
            r#"[{ "id": "a2", "name": "morto.json", "parents": ["raiz"], "trashed": true }]"#,
        );
        assert_eq!(montar_conteudo(com_lixeira, "raiz").arquivos, vec![]);
    }

    #[test]
    fn arquivo_repetido_no_mesmo_caminho_fica_com_o_mais_recente() {
        // O Drive permite dois arquivos de mesmo nome na mesma pasta; o Windows não. Só um
        // conteúdo cabe no caminho, e o mais recente é o que o usuário acabou de escrever.
        // Os ids são escolhidos para que o mais ANTIGO venha primeiro na varredura: assim
        // "fica com o primeiro que apareceu" não passa por acidente.
        let repetidos = ler(
            r#"[
              { "id": "a-antigo", "name": "x.json", "parents": ["raiz"],
                "modifiedTime": "2026-07-20T10:00:00.000Z" },
              { "id": "z-recente", "name": "x.json", "parents": ["raiz"],
                "modifiedTime": "2026-07-26T10:00:00.000Z" }
            ]"#,
        );
        let conteudo = montar_conteudo(repetidos, "raiz");
        assert_eq!(conteudo.arquivos.len(), 1);
        assert_eq!(conteudo.arquivos[0].file_id, "z-recente");
    }

    /// Duas pastas de mesmo nome na mesma mãe — o Drive permite, o Windows não.
    const PASTAS_REPETIDAS: &str = r#"[
      { "id": "p2", "name": "cenarios", "parents": ["raiz"],
        "mimeType": "application/vnd.google-apps.folder" },
      { "id": "p1", "name": "cenarios", "parents": ["raiz"],
        "mimeType": "application/vnd.google-apps.folder" },
      { "id": "a", "name": "a.json", "parents": ["p1"] },
      { "id": "b", "name": "b.json", "parents": ["p2"] }
    ]"#;

    #[test]
    fn pastas_repetidas_sao_fundidas_em_vez_de_descartadas() {
        // Descartar a segunda pasta sumiria com `b.json` da listagem — e sumir da listagem
        // é o que o motor lê como "apagado no Drive", o que apagaria o arquivo local vivo.
        let conteudo = montar_conteudo(ler(PASTAS_REPETIDAS), "raiz");
        let caminhos: Vec<&str> = conteudo.arquivos.iter().map(|a| a.caminho.as_str()).collect();
        assert_eq!(caminhos, ["cenarios/a.json", "cenarios/b.json"]);
        assert_eq!(conteudo.pastas.len(), 1);
    }

    #[test]
    fn ciclo_de_pastas_nao_trava_a_montagem() {
        // Não deveria acontecer, mas um laço aqui congelaria o app inteiro sem erro nenhum.
        // O que impede é o índice ser CONSUMIDO na descida: a segunda passagem por `p1`
        // não acha mais filhos e o laço morre.
        let ciclo = ler(
            r#"[
              { "id": "p1", "name": "a", "parents": ["raiz"],
                "mimeType": "application/vnd.google-apps.folder" },
              { "id": "p2", "name": "b", "parents": ["p1"],
                "mimeType": "application/vnd.google-apps.folder" },
              { "id": "p1", "name": "a", "parents": ["p2"],
                "mimeType": "application/vnd.google-apps.folder" }
            ]"#,
        );
        let conteudo = montar_conteudo(ciclo, "raiz");
        let caminhos: Vec<&str> = conteudo.pastas.iter().map(|p| p.caminho.as_str()).collect();
        assert_eq!(caminhos, ["a", "a/b", "a/b/a"]);
    }

    #[test]
    fn a_ordem_da_api_nao_muda_o_resultado() {
        // Com nomes repetidos a escolha do vencedor é a única coisa que a ordem poderia
        // mexer — e é justamente o caso em que o plano de sync mudaria de uma rodada para
        // a outra sem nada ter mudado no cofre.
        let mut invertida = ler(PASTAS_REPETIDAS);
        invertida.reverse();
        let direta = montar_conteudo(ler(PASTAS_REPETIDAS), "raiz");
        assert_eq!(direta.pastas[0].file_id, "p1");
        assert_eq!(montar_conteudo(invertida, "raiz"), direta);
    }

    #[test]
    fn traduz_a_falha_pelo_status() {
        assert!(descrever_falha(401, None).contains("expirou"));
        assert!(descrever_falha(404, None).contains("já não existe"));
        assert!(descrever_falha(429, None).contains("desacelerar"));
        assert!(descrever_falha(503, None).contains("desacelerar"));
        let com_detalhe = descrever_falha(403, Some("Rate Limit Exceeded"));
        assert!(com_detalhe.contains("Rate Limit Exceeded"), "perdeu o detalhe: {com_detalhe}");
    }

    #[test]
    fn converte_a_resposta_do_envio_para_o_manifesto() {
        let enviado = ler(LISTAGEM).into_iter().find(|a| a.id == "a1").unwrap();
        assert_eq!(
            arquivo_enviado(&enviado),
            ArquivoEnviado {
                file_id: "a1".to_string(),
                hash: Some("abc".to_string()),
                versao: "42".to_string(),
                tamanho: Some(1234),
            }
        );
    }
}
