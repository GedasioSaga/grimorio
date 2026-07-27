//! Verificação do cliente do Drive (`src/drive.rs`) contra a API real do Google.
//!
//! Os 21 testes de unidade de `drive.rs` cobrem só lógica pura — montagem de caminho,
//! escolha de método, desempate de nomes repetidos. Nada ali toca a rede: as URLs, os
//! cabeçalhos, o `uploadType=resumable` em duas etapas, o `alt=media` e o `trashed=true`
//! nunca foram exercitados de verdade. Este exemplo faz isso, chamando as MESMAS funções
//! que os comandos Tauri chamam, na sequência que o executor de sync usaria.
//!
//! Rode com `cargo run --example verificar_drive`. Exige uma conta já conectada pelo app:
//! o refresh token sai do Gerenciador de Credenciais, a mesma entrada que o `auth.rs`
//! grava.
//!
//! Nenhum segredo é impresso — tokens aparecem no máximo como comprimento.
//!
//! **Sobre a limpeza.** Tudo é criado dentro de uma raiz descartável, marcada com uma
//! chave de `appProperties` que não é a de produção, e a raiz é apagada em definitivo no
//! fim — inclusive quando um passo falha no meio. O único `files.delete` do arquivo é
//! sobre um id que este próprio exemplo criou e conferiu ser seu. Se uma execução morrer
//! antes disso, `cargo run --example verificar_drive -- --limpar` varre as sobras e mostra
//! tudo o que o app enxerga no Drive.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use grimorio_lib::drive::{self, Credencial, PedidoEnvio};
use serde_json::Value;

type Resultado<T> = Result<T, String>;

const SERVICO_KEYRING: &str = "grimorio";
const ENTRADA_REFRESH: &str = "google-refresh";

const URL_TOKEN: &str = "https://oauth2.googleapis.com/token";
const API: &str = "https://www.googleapis.com/drive/v3/files";
const MIME_PASTA: &str = "application/vnd.google-apps.folder";

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

/// Raiz descartável, com chave de marcador PRÓPRIA — não a de produção.
///
/// Chave separada é o que torna a limpeza segura: apagar esta raiz não pode, por construção,
/// encostar no cofre real do usuário. E não enfraquece o teste do `appProperties`, porque o
/// mecanismo verificado é o mesmo (criar com marcador, reachar pelo marcador) e ainda sobram
/// duas conferências que só existem por causa da chave separada: a consulta de produção não
/// pode enxergar esta raiz, e a mesma chave com valor errado não pode achar nada.
const NOME_RAIZ_TESTE: &str = "Grimório (verificação)";
const MARCA_TESTE: (&str, &str) = ("grimorioVerificacao", "1");

/// Assinatura gravada em `appProperties.dispositivo` pelos envios.
const DISPOSITIVO: &str = "PC Verificação";

const CAMINHO_TESTE: &str = "campanhas/aventura/personagens";
const NOME_PEQUENO: &str = "gandalf.json";
const NOME_GRANDE: &str = "mapa.png";
const NOME_BORDA: &str = "borda.bin";

/// Cofre com apóstrofo no nome. O `escapar_q` só foi exercitado em teste de unidade; se o
/// Drive não aceitar `\'` dentro de uma string do parâmetro `q`, a consulta volta 400 e
/// nenhum usuário com apóstrofo no nome da campanha consegue sincronizar.
const CAMINHO_APOSTROFO: &str = "O'Brien & filhos";

const CONTEUDO_A: &str = r#"{"nome":"Gandalf","classe":"mago","rodada":1}"#;
const CONTEUDO_B: &str = r#"{"nome":"Gandalf, o Branco","classe":"mago","rodada":2,"mudou":true}"#;

/// Acima do teto de 5 MB do multipart, para cair no caminho retomável — o trecho de maior
/// risco do cliente, com duas requisições e um cabeçalho de sessão.
const TAMANHO_GRANDE: usize = 6 * 1024 * 1024;

/// O maior arquivo que `modo_de_envio` ainda manda por multipart. `LIMITE_MULTIPART` saiu
/// da documentação lendo "5 MB" como 5 MiB; se o teto real for 5.000.000, este envio é
/// recusado — e toda imagem entre 5.000.000 e 5.242.880 bytes falharia em produção.
const TAMANHO_BORDA: usize = 5 * 1024 * 1024 - 1;

/// Sementes do gerador de conteúdo sintético — uma por arquivo/rodada.
const SEMENTE_A: u64 = 0x9E37_79B9_7F4A_7C15;
const SEMENTE_B: u64 = 0x5851_F42D_4C95_7F2D;
const SEMENTE_C: u64 = 0x2545_F491_4F6C_DD1D;

/// Os seis comandos, na ordem em que o relatório final os lista.
const COMANDOS: [&str; 6] = [
    "drive_pasta_raiz",
    "drive_garantir_pasta",
    "drive_listar",
    "drive_enviar",
    "drive_baixar",
    "drive_apagar",
];

#[tokio::main]
async fn main() {
    if let Err(erro) = executar().await {
        eprintln!("\nVERIFICAÇÃO FALHOU: {erro}");
        std::process::exit(1);
    }
}

async fn executar() -> Resultado<()> {
    if CLIENT_ID.is_empty() || CLIENT_SECRET.is_empty() {
        return Err("build sem GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET — confira o \
                    src-tauri/.env.local e recompile"
            .to_string());
    }

    println!("[0] trocando o refresh token guardado no Windows por um access token");
    let refresh = ler_refresh()?;
    println!("    refresh token lido do keyring (comprimento {})", refresh.len());
    let http = drive::http()?;
    let token = access_token(&http, &refresh).await?;
    println!("    access token obtido (comprimento {})", token.len());
    let cred = Credencial::nova(token.clone());

    // Saída de emergência: se uma execução morreu antes da limpeza, isto varre as sobras
    // sem refazer a verificação inteira.
    if std::env::args().any(|argumento| argumento == "--limpar") {
        println!("\nmodo --limpar: varrendo sobras de execuções anteriores");
        varrer_sobras(&http, &token).await;
        // Sob o escopo `drive.file` esta listagem enxerga só o que o próprio app criou,
        // então serve de prova de que nada do teste ficou para trás — sem revelar um único
        // arquivo pessoal do usuário.
        println!("\n    tudo o que o app enxerga no Drive agora:");
        let tudo = "trashed = false or trashed = true";
        for item in consulta_crua(&http, &token, tudo, "id,name,mimeType,trashed").await? {
            println!("    - {item}");
        }
        return Ok(());
    }

    println!("\n[1] drive_pasta_raiz — achar ou criar a raiz marcada em appProperties");
    let raiz = drive::pasta_raiz(&http, &cred, NOME_RAIZ_TESTE, MARCA_TESTE).await?;
    println!("    1a chamada devolveu a raiz {raiz}");
    // Confere ANTES de qualquer coisa destrutiva que a raiz devolvida é mesmo a de teste.
    // Sem isto, um `appProperties has` que ignorasse a chave devolveria a pasta de produção
    // e a limpeza do passo 9 apagaria o cofre real do usuário.
    conferir_raiz_e_nossa(&http, &token, &raiz).await?;

    let pasta_local = preparar_pasta_local()?;
    println!("    arquivos locais do teste em {}", pasta_local.display());

    let mut placar = Placar::default();
    placar.anotar(
        "drive_pasta_raiz",
        "cria a raiz quando não existe",
        true,
        raiz.as_str(),
    );
    let resultado = verificar(&http, &cred, &token, &raiz, &pasta_local, &mut placar).await;

    println!("\n[13] limpeza");
    limpar(&http, &token, &raiz, &pasta_local).await;

    placar.imprimir();
    match resultado {
        Err(erro) => Err(erro),
        Ok(()) if !placar.tudo_ok() => {
            Err("um ou mais comandos divergiram do que o código espera (ver placar)".to_string())
        }
        Ok(()) => Ok(()),
    }
}

async fn verificar(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    raiz: &str,
    pasta_local: &Path,
    placar: &mut Placar,
) -> Resultado<()> {
    raiz_e_idempotente(http, cred, token, raiz, placar).await?;
    let pasta = cadeia_de_pastas(http, cred, token, raiz, placar).await?;
    let pequeno = enviar_pequeno(http, cred, token, raiz, &pasta, pasta_local, placar).await?;
    let pequeno = reenviar_por_cima(http, cred, token, raiz, &pasta, pasta_local, &pequeno, placar)
        .await?;
    let grande = enviar_grande(http, cred, token, raiz, &pasta, pasta_local, placar).await?;
    enviar_na_borda(http, cred, token, &pasta, pasta_local, placar).await?;
    baixar_e_comparar(http, cred, token, pasta_local, &pequeno, &grande, placar).await?;
    apagar_e_conferir(http, cred, raiz, &pequeno, &grande, placar).await?;
    erro_de_arquivo_inexistente(http, cred, token, &pequeno, pasta_local, placar).await
}

// ---------------------------------------------------------------------------
// Passo 2 — idempotência da raiz.
// ---------------------------------------------------------------------------

async fn raiz_e_idempotente(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    raiz: &str,
    placar: &mut Placar,
) -> Resultado<()> {
    println!("\n[2] drive_pasta_raiz de novo — tem que ACHAR a mesma, não criar outra");
    let segunda = drive::pasta_raiz(http, cred, NOME_RAIZ_TESTE, MARCA_TESTE).await?;
    println!("    2a chamada devolveu a raiz {segunda}");
    placar.anotar(
        "drive_pasta_raiz",
        "2a chamada acha a mesma raiz (idempotente)",
        segunda == raiz,
        format!("1a={raiz} 2a={segunda}"),
    );

    let (chave, valor) = MARCA_TESTE;
    let iguais = buscar_por_marca(http, token, chave, valor).await?;
    placar.anotar(
        "drive_pasta_raiz",
        "o marcador acha exatamente uma raiz",
        iguais.len() == 1 && iguais.first().map(String::as_str) == Some(raiz),
        format!("{} achada(s): {iguais:?}", iguais.len()),
    );

    // A consulta de produção não pode enxergar a raiz de teste — é o que prova que a
    // cláusula `key = ...` do `appProperties has` é de fato aplicada pelo Drive.
    let producao =
        buscar_por_marca(http, token, drive::MARCA_RAIZ, drive::MARCA_RAIZ_VALOR).await?;
    placar.anotar(
        "drive_pasta_raiz",
        "a consulta de produção NÃO acha a raiz de teste",
        !producao.iter().any(|id| id == raiz),
        format!("marcador de produção achou {} pasta(s)", producao.len()),
    );

    // E o mesmo para o valor: chave certa com valor errado não pode achar nada.
    let valor_errado = buscar_por_marca(http, token, chave, "valor-que-nao-existe").await?;
    placar.anotar(
        "drive_pasta_raiz",
        "a mesma chave com valor errado não acha nada",
        valor_errado.is_empty(),
        format!("{} achada(s)", valor_errado.len()),
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Passo 3 — cadeia de pastas aninhadas.
// ---------------------------------------------------------------------------

async fn cadeia_de_pastas(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    raiz: &str,
    placar: &mut Placar,
) -> Resultado<String> {
    println!("\n[3] drive_garantir_pasta — criar {CAMINHO_TESTE} e repetir");
    let primeira = drive::garantir_cadeia(http, cred, raiz, CAMINHO_TESTE).await?;
    println!("    1a chamada devolveu a pasta folha {primeira}");
    let segunda = drive::garantir_cadeia(http, cred, raiz, CAMINHO_TESTE).await?;
    println!("    2a chamada devolveu a pasta folha {segunda}");
    placar.anotar(
        "drive_garantir_pasta",
        "2a chamada devolve a mesma folha (idempotente)",
        segunda == primeira,
        format!("1a={primeira} 2a={segunda}"),
    );

    // A idempotência de verdade se mede contando as pastas no Drive, não comparando ids:
    // `montar_conteudo` FUNDE pastas de mesmo nome, então uma duplicata ficaria invisível
    // na listagem e só apareceria aqui.
    let mut mae = raiz.to_string();
    let mut sem_duplicata = true;
    for segmento in CAMINHO_TESTE.split('/') {
        let filhos = filhos_de(http, token, &mae).await?;
        let iguais: Vec<&Value> = filhos
            .iter()
            .filter(|f| texto(f, "name") == segmento)
            .collect();
        println!("    {segmento}: {} pasta(s) com esse nome", iguais.len());
        sem_duplicata &= iguais.len() == 1;
        match iguais.first() {
            Some(pasta) => mae = texto(pasta, "id"),
            None => return Err(format!("a pasta {segmento} não foi criada no Drive")),
        }
    }
    placar.anotar(
        "drive_garantir_pasta",
        "nenhum segmento da cadeia foi duplicado",
        sem_duplicata,
        format!("cadeia {CAMINHO_TESTE}"),
    );
    placar.anotar(
        "drive_garantir_pasta",
        "a descida pelos parents chega na mesma folha",
        mae == primeira,
        format!("descida={mae} garantir={primeira}"),
    );

    // Apóstrofo no nome: o `escapar_q` nunca tinha passado por um parser de `q` de verdade.
    println!("    agora com apóstrofo no nome: {CAMINHO_APOSTROFO}");
    let com_aspa = drive::garantir_cadeia(http, cred, raiz, CAMINHO_APOSTROFO).await?;
    let de_novo = drive::garantir_cadeia(http, cred, raiz, CAMINHO_APOSTROFO).await?;
    let iguais = filhos_de(http, token, raiz)
        .await?
        .iter()
        .filter(|f| texto(f, "name") == CAMINHO_APOSTROFO)
        .count();
    placar.anotar(
        "drive_garantir_pasta",
        "nome com apóstrofo é achado de volta pela consulta (escapar_q)",
        com_aspa == de_novo && iguais == 1,
        format!("1a={com_aspa} 2a={de_novo}, {iguais} pasta(s) com esse nome"),
    );
    Ok(primeira)
}

// ---------------------------------------------------------------------------
// Passos 4 e 5 — envio pequeno (multipart) e reenvio por cima.
// ---------------------------------------------------------------------------

async fn enviar_pequeno(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    raiz: &str,
    pasta: &str,
    pasta_local: &Path,
    placar: &mut Placar,
) -> Resultado<String> {
    println!("\n[4] drive_enviar (multipart, criar) — {NOME_PEQUENO}");
    let local = pasta_local.join(NOME_PEQUENO);
    gravar(&local, CONTEUDO_A.as_bytes())?;

    let pedido = montar_pedido(pasta, NOME_PEQUENO, &local, None)?;
    let enviado = drive::enviar(http, cred, &pedido).await?;
    let enviado = serde_json::to_value(&enviado).map_err(|e| e.to_string())?;
    println!("    resposta: {enviado}");

    let file_id = texto(&enviado, "fileId");
    let esperado = sha256(CONTEUDO_A.as_bytes());
    conferir_resposta_de_envio(&enviado, &esperado, CONTEUDO_A.len(), "multipart", placar);

    println!("\n[5] drive_listar — o arquivo aparece com o caminho relativo montado?");
    let conteudo = drive::listar(http, cred, raiz).await?;
    let conteudo = serde_json::to_value(&conteudo).map_err(|e| e.to_string())?;
    let caminho = format!("{CAMINHO_TESTE}/{NOME_PEQUENO}");
    let achado = achar_arquivo(&conteudo, &caminho);
    match &achado {
        Some(item) => println!("    achado: {item}"),
        None => println!("    NÃO achado; a listagem trouxe {}", caminhos(&conteudo)),
    }
    placar.anotar(
        "drive_listar",
        "o arquivo enviado aparece no caminho relativo certo",
        achado.as_ref().map(|i| texto(i, "fileId")) == Some(file_id.clone()),
        format!("{caminho} -> {:?}", achado.as_ref().map(|i| texto(i, "fileId"))),
    );
    placar.anotar(
        "drive_listar",
        "a listagem traz o sha256Checksum do arquivo",
        achado.as_ref().map(|i| texto(i, "hash")) == Some(esperado.clone()),
        format!("hash={:?}", achado.as_ref().map(|i| texto(i, "hash"))),
    );
    // As 3 da cadeia mais a do apóstrofo — que também precisa voltar com o nome intacto.
    placar.anotar(
        "drive_listar",
        "a listagem traz as 4 pastas criadas, em ordem estável",
        pastas(&conteudo)
            == vec![
                CAMINHO_APOSTROFO,
                "campanhas",
                "campanhas/aventura",
                CAMINHO_TESTE,
            ],
        format!("{:?}", pastas(&conteudo)),
    );
    placar.anotar(
        "drive_listar",
        "a listagem traz o dispositivo gravado no envio",
        achado.as_ref().map(|i| texto(i, "deviceNome")).as_deref() == Some(DISPOSITIVO),
        format!("deviceNome={:?}", achado.as_ref().map(|i| texto(i, "deviceNome"))),
    );

    let irmaos = filhos_de(http, token, pasta).await?;
    placar.anotar(
        "drive_enviar",
        "o envio criou UM arquivo na pasta",
        irmaos.len() == 1,
        format!("{} arquivo(s) na pasta folha", irmaos.len()),
    );
    Ok(file_id)
}

async fn reenviar_por_cima(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    raiz: &str,
    pasta: &str,
    pasta_local: &Path,
    file_id: &str,
    placar: &mut Placar,
) -> Resultado<String> {
    println!("\n[6] drive_enviar (multipart, substituir) — mesmo caminho, conteúdo novo");
    let local = pasta_local.join(NOME_PEQUENO);
    gravar(&local, CONTEUDO_B.as_bytes())?;

    let pedido = montar_pedido(pasta, NOME_PEQUENO, &local, Some(file_id))?;
    let enviado = drive::enviar(http, cred, &pedido).await?;
    let enviado = serde_json::to_value(&enviado).map_err(|e| e.to_string())?;
    println!("    resposta: {enviado}");

    let esperado = sha256(CONTEUDO_B.as_bytes());
    conferir_resposta_de_envio(&enviado, &esperado, CONTEUDO_B.len(), "substituição", placar);
    placar.anotar(
        "drive_enviar",
        "a substituição mantém o mesmo file_id",
        texto(&enviado, "fileId") == file_id,
        format!("antes={file_id} depois={}", texto(&enviado, "fileId")),
    );

    let irmaos = filhos_de(http, token, pasta).await?;
    placar.anotar(
        "drive_enviar",
        "a substituição não duplicou o arquivo na pasta",
        irmaos.len() == 1,
        format!("{} arquivo(s) na pasta folha", irmaos.len()),
    );

    // O nome tem de sobreviver à substituição: `metadados_envio` não manda `name` no update
    // justamente para não desfazer uma renomeação feita do outro lado.
    let conteudo = drive::listar(http, cred, raiz).await?;
    let conteudo = serde_json::to_value(&conteudo).map_err(|e| e.to_string())?;
    let caminho = format!("{CAMINHO_TESTE}/{NOME_PEQUENO}");
    let achado = achar_arquivo(&conteudo, &caminho);
    placar.anotar(
        "drive_listar",
        "o caminho continua único depois da substituição",
        achado.as_ref().map(|i| texto(i, "hash")) == Some(esperado),
        format!("hash na listagem={:?}", achado.as_ref().map(|i| texto(i, "hash"))),
    );
    Ok(texto(&enviado, "fileId"))
}

// ---------------------------------------------------------------------------
// Passo 7 — envio acima de 5 MB (caminho retomável).
// ---------------------------------------------------------------------------

async fn enviar_grande(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    raiz: &str,
    pasta: &str,
    pasta_local: &Path,
    placar: &mut Placar,
) -> Resultado<String> {
    println!("\n[7] drive_enviar (retomável, criar) — {NOME_GRANDE} com {TAMANHO_GRANDE} bytes");
    let local = pasta_local.join(NOME_GRANDE);
    gravar(&local, &bytes_sinteticos(TAMANHO_GRANDE, SEMENTE_A))?;

    let pedido = montar_pedido(pasta, NOME_GRANDE, &local, None)?;
    let enviado = drive::enviar(http, cred, &pedido).await?;
    let enviado = serde_json::to_value(&enviado).map_err(|e| e.to_string())?;
    println!("    resposta: {enviado}");
    conferir_resposta_de_envio(
        &enviado,
        &sha256(&bytes_sinteticos(TAMANHO_GRANDE, SEMENTE_A)),
        TAMANHO_GRANDE,
        "retomável, criar",
        placar,
    );
    let file_id = texto(&enviado, "fileId");

    // Substituir um arquivo grande é PATCH + sessão retomável, uma combinação que o envio
    // de criação não exercita — e é o caso real de uma imagem do cofre sendo trocada.
    println!("\n[8] drive_enviar (retomável, substituir) — mesmo id, conteúdo novo");
    let bytes = bytes_sinteticos(TAMANHO_GRANDE, SEMENTE_B);
    gravar(&local, &bytes)?;
    let pedido = montar_pedido(pasta, NOME_GRANDE, &local, Some(&file_id))?;
    let enviado = drive::enviar(http, cred, &pedido).await?;
    let enviado = serde_json::to_value(&enviado).map_err(|e| e.to_string())?;
    println!("    resposta: {enviado}");

    let esperado = sha256(&bytes);
    conferir_resposta_de_envio(&enviado, &esperado, bytes.len(), "retomável, substituir", placar);
    placar.anotar(
        "drive_enviar",
        "a substituição retomável mantém o mesmo file_id",
        texto(&enviado, "fileId") == file_id,
        format!("antes={file_id} depois={}", texto(&enviado, "fileId")),
    );

    let conteudo = drive::listar(http, cred, raiz).await?;
    let conteudo = serde_json::to_value(&conteudo).map_err(|e| e.to_string())?;
    let caminho = format!("{CAMINHO_TESTE}/{NOME_GRANDE}");
    let achado = achar_arquivo(&conteudo, &caminho);
    placar.anotar(
        "drive_listar",
        "o arquivo grande aparece na listagem com hash e tamanho",
        achado.as_ref().map(|i| texto(i, "hash")) == Some(esperado)
            && achado.as_ref().and_then(|i| i.get("tamanho").and_then(Value::as_u64))
                == Some(bytes.len() as u64),
        format!("{achado:?}"),
    );

    // Duas requisições, um arquivo só: uma sessão retomável aberta e reaberta deixaria dois.
    let irmaos = filhos_de(http, token, pasta).await?;
    placar.anotar(
        "drive_enviar",
        "os dois envios retomáveis deixaram 2 arquivos na pasta, não 3",
        irmaos.len() == 2,
        format!("{} arquivo(s) na pasta folha", irmaos.len()),
    );
    Ok(file_id)
}

/// Envio de `LIMITE_MULTIPART - 1` bytes, o maior que o cliente ainda manda por multipart.
async fn enviar_na_borda(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    pasta: &str,
    pasta_local: &Path,
    placar: &mut Placar,
) -> Resultado<()> {
    println!("\n[9] drive_enviar (multipart na borda) — {NOME_BORDA} com {TAMANHO_BORDA} bytes");
    let local = pasta_local.join(NOME_BORDA);
    let bytes = bytes_sinteticos(TAMANHO_BORDA, SEMENTE_C);
    gravar(&local, &bytes)?;

    let pedido = montar_pedido(pasta, NOME_BORDA, &local, None)?;
    // Um erro aqui não pode derrubar o resto da verificação: é justamente o resultado que
    // se quer medir, e os passos seguintes não dependem deste arquivo.
    match drive::enviar(http, cred, &pedido).await {
        Ok(enviado) => {
            let enviado = serde_json::to_value(&enviado).map_err(|e| e.to_string())?;
            println!("    resposta: {enviado}");
            conferir_resposta_de_envio(
                &enviado,
                &sha256(&bytes),
                bytes.len(),
                "multipart na borda dos 5 MiB",
                placar,
            );
        }
        Err(erro) => placar.anotar(
            "drive_enviar",
            "multipart na borda dos 5 MiB: o Drive aceita o corpo",
            false,
            format!("recusado: {erro}"),
        ),
    }

    let irmaos = filhos_de(http, token, pasta).await?;
    println!("    pasta folha agora tem {} arquivo(s)", irmaos.len());
    Ok(())
}

// ---------------------------------------------------------------------------
// Passo 8 — baixar e comparar byte a byte.
// ---------------------------------------------------------------------------

async fn baixar_e_comparar(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    pasta_local: &Path,
    pequeno: &str,
    grande: &str,
    placar: &mut Placar,
) -> Resultado<()> {
    println!("\n[10] drive_baixar — o que desce é byte a byte o que subiu?");
    // Qual dos dois ramos de `drive_baixar` o Drive faz o código percorrer: resposta direta
    // ou 3xx para um host de conteúdo? O cliente não segue redirect sozinho, então saber
    // disso é o que diz se o ramo do `Location` é código vivo ou código nunca executado.
    let (status, tem_location) = sondar_alt_media(http, token, pequeno).await?;
    println!("    GET ?alt=media respondeu HTTP {status} (Location: {tem_location})");
    placar.anotar(
        "drive_baixar",
        format!("o ramo exercitado é o de HTTP {status}"),
        true,
        format!("redirecionamento presente: {tem_location}"),
    );

    let destino = pasta_local.join("baixado-pequeno.json");
    drive::baixar(http, cred, pequeno, &destino.to_string_lossy()).await?;
    let baixado = std::fs::read(&destino).map_err(|e| e.to_string())?;
    println!("    pequeno: {} byte(s) baixado(s)", baixado.len());
    placar.anotar(
        "drive_baixar",
        "o arquivo pequeno desce idêntico ao que subiu",
        baixado == CONTEUDO_B.as_bytes(),
        format!("{} byte(s), esperado {}", baixado.len(), CONTEUDO_B.len()),
    );

    let destino = pasta_local.join("baixado-grande.png");
    drive::baixar(http, cred, grande, &destino.to_string_lossy()).await?;
    let baixado = std::fs::read(&destino).map_err(|e| e.to_string())?;
    println!("    grande: {} byte(s) baixado(s)", baixado.len());
    // Conteúdo da SUBSTITUIÇÃO retomável: se o segundo envio tivesse sido ignorado ou
    // truncado, o download traria os bytes antigos e a comparação acusaria.
    let esperado = bytes_sinteticos(TAMANHO_GRANDE, SEMENTE_B);
    placar.anotar(
        "drive_baixar",
        "o arquivo grande desce idêntico ao que subiu",
        baixado == esperado,
        format!("{} byte(s), esperado {TAMANHO_GRANDE}", baixado.len()),
    );

    // O gravar é atômico: o temporário `.baixando` não pode sobreviver ao download.
    let sobra = pasta_local.join("baixado-grande.png.baixando");
    placar.anotar(
        "drive_baixar",
        "o temporário .baixando não fica para trás",
        !sobra.exists(),
        format!("{}", sobra.display()),
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Passo 9 — apagar e conferir que sai da listagem.
// ---------------------------------------------------------------------------

async fn apagar_e_conferir(
    http: &reqwest::Client,
    cred: &Credencial,
    raiz: &str,
    pequeno: &str,
    grande: &str,
    placar: &mut Placar,
) -> Resultado<()> {
    println!("\n[11] drive_apagar — manda para a lixeira e sai da listagem");
    drive::apagar(http, cred, pequeno).await?;

    let conteudo = drive::listar(http, cred, raiz).await?;
    let conteudo = serde_json::to_value(&conteudo).map_err(|e| e.to_string())?;
    let caminho = format!("{CAMINHO_TESTE}/{NOME_PEQUENO}");
    println!("    listagem depois de apagar: {}", caminhos(&conteudo));
    placar.anotar(
        "drive_apagar",
        "o arquivo apagado sai da listagem",
        achar_arquivo(&conteudo, &caminho).is_none(),
        caminho,
    );
    placar.anotar(
        "drive_apagar",
        "o arquivo que não foi apagado continua lá",
        achar_arquivo(&conteudo, &format!("{CAMINHO_TESTE}/{NOME_GRANDE}"))
            .map(|i| texto(&i, "fileId"))
            == Some(grande.to_string()),
        NOME_GRANDE.to_string(),
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Passo 12 — a tradução do erro da API.
// ---------------------------------------------------------------------------

/// `descrever_falha` foi escrito supondo o formato `{"error":{"message":...}}`. Se a forma
/// real for outra, o usuário recebe "(HTTP 404)" seco em vez da frase explicativa — e o
/// `EnvelopeErro` nunca tinha visto um erro de verdade.
async fn erro_de_arquivo_inexistente(
    http: &reqwest::Client,
    cred: &Credencial,
    token: &str,
    file_id: &str,
    pasta_local: &Path,
    placar: &mut Placar,
) -> Resultado<()> {
    println!("\n[12] erro traduzido — operar sobre um arquivo que já não existe");
    // Apaga de vez o arquivo que o passo 11 mandou para a lixeira: o id continua bem
    // formado, mas deixa de existir. É o cenário de dois computadores apagando o mesmo
    // arquivo, que o executor de sync vai encontrar de verdade.
    apagar_de_vez(http, token, file_id).await?;

    let erro = drive::apagar(http, cred, file_id).await.err();
    println!("    drive_apagar devolveu: {erro:?}");
    placar.anotar(
        "drive_apagar",
        "arquivo inexistente vira a mensagem de 404, com o detalhe do Google",
        erro.as_deref().is_some_and(|e| e.contains("já não existe")),
        format!("{erro:?}"),
    );

    let destino = pasta_local.join("nao-deve-ser-gravado.bin");
    let erro = drive::baixar(http, cred, file_id, &destino.to_string_lossy())
        .await
        .err();
    println!("    drive_baixar devolveu: {erro:?}");
    placar.anotar(
        "drive_baixar",
        "download de arquivo inexistente falha sem criar arquivo local",
        erro.is_some() && !destino.exists(),
        format!("{erro:?}"),
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Conferências compartilhadas.
// ---------------------------------------------------------------------------

/// O que o executor de sync grava no manifesto a partir da resposta de um envio. Um campo
/// vazio aqui não dá erro nenhum na hora — só faz o próximo ciclo achar que o arquivo mudou
/// e reenviar tudo para sempre.
fn conferir_resposta_de_envio(
    enviado: &Value,
    hash_esperado: &str,
    tamanho: usize,
    caso: &str,
    placar: &mut Placar,
) {
    placar.anotar(
        "drive_enviar",
        format!("{caso}: devolve o file_id"),
        !texto(enviado, "fileId").is_empty(),
        texto(enviado, "fileId"),
    );
    placar.anotar(
        "drive_enviar",
        format!("{caso}: devolve o sha256Checksum, e ele bate com o local"),
        texto(enviado, "hash") == hash_esperado,
        format!("drive={} local={hash_esperado}", texto(enviado, "hash")),
    );
    placar.anotar(
        "drive_enviar",
        format!("{caso}: devolve a versão"),
        !texto(enviado, "versao").is_empty(),
        texto(enviado, "versao"),
    );
    placar.anotar(
        "drive_enviar",
        format!("{caso}: devolve o tamanho certo"),
        enviado.get("tamanho").and_then(Value::as_u64) == Some(tamanho as u64),
        format!("{:?}, esperado {tamanho}", enviado.get("tamanho")),
    );
}

/// Recusa seguir adiante se a raiz devolvida não for a de teste. É a trava que protege o
/// `files.delete` da limpeza: só apagamos uma pasta que carrega o NOSSO marcador.
async fn conferir_raiz_e_nossa(http: &reqwest::Client, token: &str, raiz: &str) -> Resultado<()> {
    let (chave, valor) = MARCA_TESTE;
    let pasta = metadados_de(http, token, raiz).await?;
    let marcador = pasta
        .get("appProperties")
        .and_then(|p| p.get(chave))
        .and_then(Value::as_str);
    if marcador != Some(valor) {
        return Err(format!(
            "a raiz {raiz} não carrega o marcador de teste ({chave}={valor}) — nada foi \
             criado e nada será apagado"
        ));
    }
    println!(
        "    conferido: a raiz é a de teste (name={:?}, {chave}={valor})",
        texto(&pasta, "name")
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// Limpeza.
// ---------------------------------------------------------------------------

/// Apaga em definitivo a árvore de teste no Drive e os arquivos locais.
///
/// `files.delete`, e não a lixeira, porque o objetivo é não deixar rastro no Drive do
/// usuário — a lixeira guardaria a pasta por 30 dias.
async fn limpar(http: &reqwest::Client, token: &str, raiz: &str, pasta_local: &Path) {
    apagar_arvore(http, token, raiz).await;
    conferir_limpeza(http, token).await;

    match std::fs::remove_dir_all(pasta_local) {
        Ok(()) => println!("    arquivos locais removidos de {}", pasta_local.display()),
        Err(erro) => eprintln!("    não foi possível remover {} ({erro})", pasta_local.display()),
    }
}

/// Apaga a raiz e tudo o que pende dela, descendo antes para juntar os ids.
///
/// Apagar só a raiz NÃO basta, e isto foi medido contra a API: o `files.delete` da pasta
/// devolve sucesso, mas os descendentes continuam existindo depois — e as pastas do meio
/// não carregam marcador nenhum que permitisse reachá-las mais tarde. Uma delas sobrou
/// órfã no Drive do usuário exatamente assim, antes de esta função existir.
async fn apagar_arvore(http: &reqwest::Client, token: &str, raiz: &str) {
    let mut fila = std::collections::VecDeque::from([raiz.to_string()]);
    let mut alvos: Vec<(String, String)> = Vec::new();

    while let Some(id) = fila.pop_front() {
        // Sem filtrar lixeira: um arquivo que o passo do `drive_apagar` mandou para lá
        // continua ocupando espaço na conta e precisa sair junto.
        let q = format!("'{id}' in parents");
        match consulta_crua(http, token, &q, "id,name,mimeType").await {
            Ok(filhos) => {
                for filho in filhos {
                    let filho_id = texto(&filho, "id");
                    if texto(&filho, "mimeType") == MIME_PASTA {
                        fila.push_back(filho_id.clone());
                    }
                    alvos.push((texto(&filho, "name"), filho_id));
                }
            }
            Err(erro) => eprintln!("    não foi possível listar o que há em {id} ({erro})"),
        }
    }
    // A raiz por último: enquanto ela existir, os filhos continuam alcançáveis por consulta.
    alvos.push((NOME_RAIZ_TESTE.to_string(), raiz.to_string()));

    for (nome, id) in alvos {
        match apagar_de_vez(http, token, &id).await {
            Ok(true) => println!("    apagado: {nome} ({id})"),
            Ok(false) => println!("    já não existia: {nome} ({id})"),
            Err(erro) => eprintln!("    ATENÇÃO: sobrou {nome} ({id}) no Drive ({erro})"),
        }
    }
}

/// Última palavra sobre a limpeza: nada com marcador de teste pode continuar no Drive.
async fn conferir_limpeza(http: &reqwest::Client, token: &str) {
    let (chave, valor) = MARCA_TESTE;
    conferir_sem_sobras(http, token, chave, valor, "pasta raiz de teste").await;
    conferir_sem_sobras(http, token, "dispositivo", DISPOSITIVO, "arquivo de teste").await;
}

// ---------------------------------------------------------------------------
// Placar.
// ---------------------------------------------------------------------------

struct Linha {
    comando: &'static str,
    caso: String,
    ok: bool,
    detalhe: String,
}

#[derive(Default)]
struct Placar {
    linhas: Vec<Linha>,
}

impl Placar {
    fn anotar(
        &mut self,
        comando: &'static str,
        caso: impl Into<String>,
        ok: bool,
        detalhe: impl Into<String>,
    ) {
        let linha = Linha {
            comando,
            caso: caso.into(),
            ok,
            detalhe: detalhe.into(),
        };
        println!(
            "    [{}] {} — {}",
            if linha.ok { "ok " } else { "FALHA" },
            linha.caso,
            linha.detalhe
        );
        self.linhas.push(linha);
    }

    fn tudo_ok(&self) -> bool {
        self.linhas.iter().all(|l| l.ok)
    }

    fn imprimir(&self) {
        println!("\n{}", "=".repeat(78));
        println!("VEREDITO POR COMANDO");
        println!("{}", "=".repeat(78));
        for comando in COMANDOS {
            let linhas: Vec<&Linha> = self.linhas.iter().filter(|l| l.comando == comando).collect();
            let veredito = match (linhas.is_empty(), linhas.iter().all(|l| l.ok)) {
                (true, _) => "NÃO EXERCITADO",
                (false, true) => "SIM",
                (false, false) => "NÃO",
            };
            println!("{comando:<22} {veredito:<15} ({} conferência(s))", linhas.len());
            for linha in linhas.iter().filter(|l| !l.ok) {
                println!("    FALHA: {} — {}", linha.caso, linha.detalhe);
            }
        }
        println!("{}", "=".repeat(78));
    }
}

// ---------------------------------------------------------------------------
// Chamadas cruas — o "oráculo" independente do cliente sob verificação.
//
// De propósito não reusam `drive.rs`: conferir a saída do cliente com o próprio cliente
// esconderia justamente o erro que se procura.
// ---------------------------------------------------------------------------

async fn consulta_crua(
    http: &reqwest::Client,
    token: &str,
    q: &str,
    campos: &str,
) -> Resultado<Vec<Value>> {
    let pedidos = format!("files({campos})");
    let resposta = http
        .get(API)
        .bearer_auth(token)
        .query(&[
            ("q", q),
            ("fields", pedidos.as_str()),
            ("pageSize", "1000"),
            ("spaces", "drive"),
        ])
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.list".to_string())?;
    let corpo = json_ou_erro(resposta, "files.list").await?;
    Ok(corpo
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

async fn buscar_por_marca(
    http: &reqwest::Client,
    token: &str,
    chave: &str,
    valor: &str,
) -> Resultado<Vec<String>> {
    let q = format!(
        "appProperties has {{ key = '{chave}' and value = '{valor}' }} and trashed = false"
    );
    Ok(consulta_crua(http, token, &q, "id,name")
        .await?
        .iter()
        .map(|f| texto(f, "id"))
        .collect())
}

/// Varre o Drive atrás de qualquer coisa que este exemplo tenha criado e não removido —
/// o resgate para quando uma execução morre antes da limpeza.
async fn varrer_sobras(http: &reqwest::Client, token: &str) {
    let (chave, valor) = MARCA_TESTE;
    let q = format!("appProperties has {{ key = '{chave}' and value = '{valor}' }}");
    match consulta_crua(http, token, &q, "id,name").await {
        Ok(raizes) => {
            for raiz in raizes {
                apagar_arvore(http, token, &texto(&raiz, "id")).await;
            }
        }
        Err(erro) => eprintln!("    não foi possível procurar raízes de teste ({erro})"),
    }
    conferir_limpeza(http, token).await;
}

/// Procura no Drive — lixeira inclusive — qualquer item que ainda carregue um marcador de
/// teste, e apaga o que achar. Só encosta em item cujo `appProperties` é deste exemplo.
async fn conferir_sem_sobras(
    http: &reqwest::Client,
    token: &str,
    chave: &str,
    valor: &str,
    rotulo: &str,
) {
    let q = format!("appProperties has {{ key = '{chave}' and value = '{valor}' }}");
    let sobras = match consulta_crua(http, token, &q, "id,name,trashed").await {
        Ok(sobras) => sobras,
        Err(erro) => {
            eprintln!("    não foi possível conferir sobras de {rotulo} ({erro})");
            return;
        }
    };
    if sobras.is_empty() {
        println!("    conferido: nenhum(a) {rotulo} sobrou no Drive");
        return;
    }
    for sobra in &sobras {
        let id = texto(sobra, "id");
        match apagar_de_vez(http, token, &id).await {
            Ok(_) => println!("    sobra removida: {} ({id})", texto(sobra, "name")),
            Err(erro) => eprintln!(
                "    ATENÇÃO: sobrou {} ({id}) no Drive ({erro}) — remova à mão",
                texto(sobra, "name")
            ),
        }
    }
}

async fn filhos_de(http: &reqwest::Client, token: &str, mae: &str) -> Resultado<Vec<Value>> {
    let q = format!("'{mae}' in parents and trashed = false");
    consulta_crua(http, token, &q, "id,name,mimeType,size").await
}

/// Status e presença de `Location` do `GET ?alt=media`, sem seguir redirecionamento — o
/// mesmo comportamento do cliente do Drive, para revelar qual ramo dele o Google aciona.
async fn sondar_alt_media(
    http: &reqwest::Client,
    token: &str,
    id: &str,
) -> Resultado<(u16, bool)> {
    let resposta = http
        .get(format!("{API}/{id}"))
        .bearer_auth(token)
        .query(&[("alt", "media")])
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.get?alt=media".to_string())?;
    let status = resposta.status().as_u16();
    let tem_location = resposta.headers().contains_key(reqwest::header::LOCATION);
    Ok((status, tem_location))
}

async fn metadados_de(http: &reqwest::Client, token: &str, id: &str) -> Resultado<Value> {
    let resposta = http
        .get(format!("{API}/{id}"))
        .bearer_auth(token)
        .query(&[("fields", "id,name,mimeType,trashed,appProperties")])
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.get".to_string())?;
    json_ou_erro(resposta, "files.get").await
}

/// `Ok(false)` quando já não existe — a limpeza precisa ser idempotente.
async fn apagar_de_vez(http: &reqwest::Client, token: &str, id: &str) -> Resultado<bool> {
    let resposta = http
        .delete(format!("{API}/{id}"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "não foi possível chamar files.delete".to_string())?;
    let status = resposta.status();
    if status.is_success() {
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

/// Corpo da resposta como JSON, ou erro com status e corpo cru. Não usar no endpoint de
/// token: lá o corpo é segredo.
async fn json_ou_erro(resposta: reqwest::Response, chamada: &str) -> Resultado<Value> {
    let status = resposta.status();
    let corpo = resposta
        .text()
        .await
        .map_err(|_| format!("{chamada}: não foi possível ler a resposta"))?;
    if !status.is_success() {
        return Err(format!("{chamada}: HTTP {} — {corpo}", status.as_u16()));
    }
    serde_json::from_str(&corpo)
        .map_err(|erro| format!("{chamada}: JSON inválido ({erro}) — {corpo}"))
}

// ---------------------------------------------------------------------------
// Token, arquivos locais e utilidades.
// ---------------------------------------------------------------------------

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

fn preparar_pasta_local() -> Resultado<PathBuf> {
    let pasta = std::env::temp_dir().join(format!("grimorio-verificacao-{}", agora()));
    std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    Ok(pasta)
}

fn gravar(destino: &Path, bytes: &[u8]) -> Resultado<()> {
    std::fs::write(destino, bytes).map_err(|e| format!("{}: {e}", destino.display()))
}

fn montar_pedido(
    pasta_id: &str,
    nome: &str,
    caminho_local: &Path,
    file_id: Option<&str>,
) -> Resultado<PedidoEnvio> {
    serde_json::from_value(serde_json::json!({
        "pastaId": pasta_id,
        "nome": nome,
        "caminhoLocal": caminho_local.to_string_lossy(),
        "fileId": file_id,
        "deviceNome": DISPOSITIVO,
    }))
    .map_err(|e| format!("não foi possível montar o pedido de envio: {e}"))
}

/// Bytes determinísticos e pouco compressíveis, para que uma truncagem no envio retomável
/// apareça na comparação byte a byte em vez de passar despercebida. A semente separa os
/// conteúdos: mesmo tamanho, bytes diferentes.
fn bytes_sinteticos(quantidade: usize, semente: u64) -> Vec<u8> {
    let mut estado = semente;
    (0..quantidade)
        .map(|_| {
            estado = estado
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (estado >> 33) as u8
        })
        .collect()
}

fn sha256(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(bytes))
}

fn texto(valor: &Value, campo: &str) -> String {
    valor
        .get(campo)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn achar_arquivo(conteudo: &Value, caminho: &str) -> Option<Value> {
    conteudo
        .get("arquivos")?
        .as_array()?
        .iter()
        .find(|a| texto(a, "caminho") == caminho)
        .cloned()
}

fn caminhos(conteudo: &Value) -> String {
    let lista: Vec<String> = conteudo
        .get("arquivos")
        .and_then(Value::as_array)
        .map(|a| a.iter().map(|i| texto(i, "caminho")).collect())
        .unwrap_or_default();
    format!("{lista:?}")
}

fn pastas(conteudo: &Value) -> Vec<String> {
    conteudo
        .get("pastas")
        .and_then(Value::as_array)
        .map(|a| a.iter().map(|p| texto(p, "caminho")).collect())
        .unwrap_or_default()
}

fn agora() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|desde| desde.as_secs())
        .unwrap_or_default()
}
