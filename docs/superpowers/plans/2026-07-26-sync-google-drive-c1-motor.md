# Sync Google Drive — Plano de Implementação (C1 + motor puro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar as duas metades do sync que podem ser construídas e verificadas **sem rede e sem credencial**: a autenticação com o Google (fase C1) e o motor de reconciliação (a lógica que decide o que sobe, o que desce e o que é conflito).

**Architecture:** O Rust é dono das credenciais — o refresh token vive no Windows Credential Manager e o TypeScript nunca o vê. O motor de reconciliação é uma função **pura**: recebe manifesto + estado local + estado remoto e devolve uma lista de ações. Sem I/O, sem Tauri, sem rede — inteiramente testável com vitest.

**Tech Stack:** Tauri v2 (Rust), React 19, TypeScript 5.8, Vitest 4. Crates novas: `oauth2` 5, `keyring` 4, `sha2`, `tauri-plugin-oauth` 2.1.

**Spec:** `docs/superpowers/specs/2026-07-26-sync-google-drive-design.md`

**Todos os comandos rodam a partir de `grimorio/`.**

---

## Escopo deste plano, e por que ele para onde para

O spec C descreve cinco fatias (C1 a C5). Este plano cobre **C1 e o motor de reconciliação**, e deliberadamente **não** detalha o cliente do Drive nem as fatias C2-C5.

Motivo: entre C1 e C2 existe um **spike bloqueador** de ~15 min — confirmar, com credencial real, que `changes.list` sob o escopo `drive.file` reporta os arquivos que o app criou. O Google não afirma isso em lugar nenhum da documentação; a inferência é forte mas não confirmada. Se falhar, o polling muda de `changes.list` para `files.list` por pasta, o que altera a forma do cliente e parte do motor.

Escrever C2-C5 em detalhe agora seria especular sobre o resultado desse teste. O que **não** depende dele é tudo que está aqui: a autenticação e a lógica pura de decisão.

**Pré-requisito humano, bloqueia a Task 1:** projeto no Google Cloud, tela de consentimento com escopo `drive.file` apenas, app **publicado em "In production"** (em "Testing" o refresh token morre a cada 7 dias), credencial tipo **Desktop app**, e `client_id`/`client_secret` guardados como GitHub secrets. As tasks 5 a 9 (motor puro) não dependem disso e podem ser feitas antes.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/auth.rs` (novo) | Fluxo OAuth PKCE, refresh token no Credential Manager, 4 comandos Tauri. |
| `src-tauri/src/lib.rs` (modificar) | Registrar os comandos novos, o plugin oauth e os comandos de hash. |
| `src-tauri/src/hash.rs` (novo) | `hash_arquivo` e `hash_texto` (SHA-256), para a varredura não ler MBs no JS. |
| `src-tauri/Cargo.toml` (modificar) | `oauth2`, `keyring`, `sha2`, `tauri-plugin-oauth`. |
| `src/lib/googleAuth.ts` (novo) | Ponte fina para os 4 comandos. Nenhuma lógica. |
| `src/lib/sync/tipos.ts` (novo) | `Manifesto`, `EntradaArquivo`, `EstadoLocal`, `EstadoRemoto`, `Acao`, `FalhaSync`. |
| `src/lib/sync/reconciliar.ts` (novo) | A função pura. O coração do plano. |
| `src/lib/sync/manifesto.ts` (novo) | Ler/gravar o manifesto com rotação de backup. |
| `src/test/reconciliar.test.ts` (novo) | Uma célula da matriz por teste, mais os guard-rails. |
| `src/test/manifesto.test.ts` (novo) | Ida e volta, corrupção, ausência. |

---

## Tasks 1 a 4 — Autenticação (bloqueadas pelo pré-requisito humano)

### Task 1: Dependências Rust e comandos de hash

**Files:** modificar `src-tauri/Cargo.toml`, criar `src-tauri/src/hash.rs`, modificar `src-tauri/src/lib.rs`

- [ ] **Step 1: Adicionar as crates**

Em `src-tauri/Cargo.toml`, na seção `[dependencies]`:

```toml
sha2 = "0.10"
```

As crates de auth entram na Task 2 — esta task isola o hash, que não depende de nada externo.

- [ ] **Step 2: Criar `src-tauri/src/hash.rs`**

```rust
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};

/// SHA-256 de um arquivo, em streaming. Existe porque a varredura de sync
/// compara dezenas de MB de imagem: ler isso no JavaScript é inviável.
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

/// SHA-256 de uma string, hex truncado em 16 chars. Usado para derivar o nome do
/// diretório do manifesto a partir do caminho do cofre.
#[tauri::command]
pub fn hash_texto(texto: String) -> String {
    let mut hasher = Sha256::new();
    hasher.update(texto.as_bytes());
    format!("{:x}", hasher.finalize())[..16].to_string()
}
```

- [ ] **Step 3: Registrar**

Em `src-tauri/src/lib.rs`, adicionar `mod hash;` no topo e incluir `hash::hash_arquivo, hash::hash_texto` na lista do `generate_handler!`.

- [ ] **Step 4: Verificar**

Run: `cd src-tauri && cargo build`
Expected: compila sem erro.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/hash.rs src-tauri/src/lib.rs
git commit -m "feat(sync): comandos de hash SHA-256 em Rust"
```

---

### Task 2: OAuth PKCE com refresh token no Credential Manager

**Files:** modificar `src-tauri/Cargo.toml`, criar `src-tauri/src/auth.rs`, modificar `src-tauri/src/lib.rs`

Esta é a task mais delicada do plano. Ela toca credenciais — leia o brief inteiro antes de escrever.

**Restrições que não são negociáveis:**
- O `client_secret` **nunca** entra no repositório. Vem de variável de ambiente injetada no build (`env!("GOOGLE_CLIENT_SECRET")` com fallback vazio em dev).
- O refresh token **nunca** cruza para o TypeScript. Só o e-mail da conta e o access token cruzam.
- O access token vive **só em memória** (um `Mutex<Option<...>>` no estado do app), nunca em disco.
- O escopo pedido é exatamente `https://www.googleapis.com/auth/drive.file` — nada mais. Escopo maior obriga auditoria anual paga.

- [ ] **Step 1: Adicionar as crates**

```toml
oauth2 = "5"
keyring = "4"
tauri-plugin-oauth = "2.1"
```

- [ ] **Step 2: Escrever `src-tauri/src/auth.rs`**

O arquivo expõe quatro comandos. Estrutura esperada (escreva o corpo seguindo a documentação de `oauth2` 5 e `keyring` 4 — não copie de memória, consulte):

```rust
// google_iniciar_login() -> Result<String, String>   devolve o e-mail
// google_access_token()  -> Result<String, String>   renova se expirado
// google_conta()         -> Option<String>
// google_desconectar()   -> Result<(), String>
```

Fluxo do login, nesta ordem:
1. Gerar `PkceCodeChallenge` (S256).
2. Subir o servidor loopback com `tauri_plugin_oauth::start`, que devolve a porta.
3. Montar a URL de autorização com `redirect_uri = http://127.0.0.1:<porta>`, `access_type=offline`, `prompt=consent`, e o escopo `drive.file`.
4. Abrir no **navegador do sistema** com `tauri_plugin_opener` — nunca num webview embutido; o Google bloqueia isso com `disallowed_useragent`.
5. Esperar o `code` no callback do loopback.
6. Trocar `code` + `code_verifier` por tokens.
7. Gravar **só o refresh token** com `keyring::Entry::new("grimorio", "google-refresh")`.
8. Buscar o e-mail em `https://www.googleapis.com/oauth2/v3/userinfo` e devolvê-lo.

**Nota de tamanho:** o Windows limita cada credential a 2560 bytes. Um refresh token do Google cabe folgado — mas não guarde JSON com outros campos junto.

- [ ] **Step 3: Registrar**

`mod auth;` em `lib.rs`, os quatro comandos no `generate_handler!`, e `.plugin(tauri_plugin_oauth::init())` no builder.

- [ ] **Step 4: Liberar o domínio do Drive**

Em `src-tauri/capabilities/default.json`, adicionar à allowlist do `http:default`:

```json
{ "url": "https://www.googleapis.com/*" }
```

`accounts.google.com` **não** entra (abre no navegador do sistema) e `oauth2.googleapis.com` **não** entra (a troca de token acontece no Rust, fora do plugin-http).

- [ ] **Step 5: Verificar**

Run: `cd src-tauri && cargo build`
Expected: compila. Não é possível testar o fluxo sem credencial — isso é a Task 4.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/auth.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(sync): OAuth PKCE com refresh token no Credential Manager"
```

---

### Task 3: Ponte TypeScript

**Files:** criar `src/lib/googleAuth.ts`

- [ ] **Step 1: Escrever a ponte**

```ts
import { invoke } from '@tauri-apps/api/core'

/**
 * Ponte fina para os comandos de auth do Rust. Nenhuma lógica aqui de propósito:
 * o refresh token vive no Credential Manager e nunca cruza para o JavaScript —
 * só o e-mail da conta e um access token de vida curta atravessam.
 */
export function iniciarLogin(): Promise<string> {
  return invoke('google_iniciar_login')
}

export function accessToken(): Promise<string> {
  return invoke('google_access_token')
}

export function contaConectada(): Promise<string | null> {
  return invoke('google_conta')
}

export function desconectar(): Promise<void> {
  return invoke('google_desconectar')
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add src/lib/googleAuth.ts
git commit -m "feat(sync): ponte TS para os comandos de auth"
```

---

### Task 4: Verificação manual do login (exige as credenciais)

Sem harness automatizado — OAuth real não se testa em unidade.

- [ ] `npm run tauri dev` com `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no ambiente
- [ ] Disparar `google_iniciar_login` (via console do devtools, já que a aba Nuvem só existe na fatia C2)
- [ ] Confirmar que abre o **navegador do sistema**, não uma janela do app
- [ ] Autorizar e confirmar que o comando devolve o e-mail correto
- [ ] Fechar o app, reabrir, chamar `google_conta()` → deve devolver o mesmo e-mail sem novo login
- [ ] Chamar `google_access_token()` duas vezes com mais de uma hora de intervalo → a segunda deve renovar sozinha
- [ ] `google_desconectar()` → `google_conta()` volta `null`, e a credencial some do Gerenciador de Credenciais do Windows
- [ ] **Spike bloqueador:** com o access token em mãos, chamar `changes.getStartPageToken` e depois `changes.list` e confirmar que arquivos criados pelo app aparecem. **Este resultado decide a forma das fatias C2-C5.**

---

## Tasks 5 a 9 — Motor puro (não dependem de credencial)

### Task 5: Tipos do sync

**Files:** criar `src/lib/sync/tipos.ts`

- [ ] **Step 1: Escrever os tipos**

```ts
/** Estado de um arquivo no último sync bem-sucedido. */
export interface EntradaArquivo {
  fileId: string
  hash: string
  tamanho: number
  mtimeLocal: number
  versaoRemota: string
}

export interface Manifesto {
  versao: 1
  cofreId: string
  pastaRaizId: string
  startPageToken: string
  deviceId: string
  deviceNome: string
  ultimoSync: string
  pastas: Record<string, string>
  arquivos: Record<string, EntradaArquivo>
}

/** O que a varredura local encontrou agora. */
export interface EstadoLocal {
  hash: string
  tamanho: number
  mtime: number
}

/** O que o Drive reporta agora. */
export interface EstadoRemoto {
  fileId: string
  hash?: string
  versao: string
  removido?: boolean
}

export type Acao =
  | { tipo: 'subir'; caminho: string }
  | { tipo: 'baixar'; caminho: string }
  | { tipo: 'apagarLocal'; caminho: string }
  | { tipo: 'apagarRemoto'; caminho: string }
  | { tipo: 'conflito'; caminho: string; vencedor: 'local' | 'remoto' }
  | { tipo: 'registrar'; caminho: string }

/** Resultado da reconciliação: ou um plano, ou uma recusa com motivo. */
export type Plano =
  | { ok: true; acoes: Acao[] }
  | { ok: false; motivo: 'delecao-em-massa'; apagaria: number; total: number }
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`

```bash
git add src/lib/sync/tipos.ts
git commit -m "feat(sync): tipos do manifesto e do plano de reconciliação"
```

---

### Task 6: Reconciliação — entradas que existem no manifesto

**Files:** criar `src/lib/sync/reconciliar.ts`, criar `src/test/reconciliar.test.ts`

Esta é a task central. A regra que a governa: **compare cada lado contra o manifesto, nunca um lado contra o outro.** "Mudou desde o último sync?" e não "quem tem a data maior?". É essa escolha que impede um arquivo apagado de ressuscitar a cada ciclo.

Matriz para arquivos com entrada no manifesto:

| local ↓ / remoto → | igual | mudou | apagado |
|---|---|---|---|
| **igual** | nada | baixar | apagar local |
| **mudou** | subir | **conflito** | subir (recria) |
| **apagado** | apagar remoto | baixar (modificação vence deleção) | tira do manifesto |

- [ ] **Step 1: Escrever os testes** — uma célula por teste, nove no total, mais os casos de borda. Cada teste monta um manifesto de uma entrada e os dois estados, e afirma a ação exata.

- [ ] **Step 2: Rodar e ver falhar**

- [ ] **Step 3: Implementar** `reconciliar(manifesto, local, remoto): Plano`, derivando o estado de cada lado por comparação com o manifesto (`hash` diferente = mudou; ausente = apagado) e consultando a matriz.

- [ ] **Step 4: Rodar e ver passar**

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/reconciliar.ts src/test/reconciliar.test.ts
git commit -m "feat(sync): reconciliação para arquivos já conhecidos"
```

---

### Task 7: Reconciliação — entradas sem manifesto

Sem entrada no manifesto (primeiro sync, ou arquivo novo):

| local ↓ / remoto → | existe | não existe |
|---|---|---|
| **existe** | hash igual → registrar; diferente → **conflito** | subir |
| **não existe** | baixar | — |

- [ ] **Step 1-5:** mesmo ciclo — testes primeiro, quatro casos, implementar, verificar, commitar.

O caso "hash igual → registrar" é o que evita re-subir um cofre inteiro quando o usuário parear um PC que já tem uma cópia idêntica.

---

### Task 8: Freio de deleção em massa

- [ ] **Step 1: Teste** — um plano cujas ações apagariam mais de 50% dos arquivos conhecidos deve devolver `{ ok: false, motivo: 'delecao-em-massa' }` em vez da lista.

- [ ] **Step 2-4:** implementar, verificar, commitar.

É o default do rclone e do remotely-save, e existe porque esse é exatamente o modo como um sync perde um cofre inteiro: uma pasta que não montou, um caminho que mudou, e o motor conclui que tudo foi apagado.

---

### Task 9: Manifesto — leitura, gravação e rotação

**Files:** criar `src/lib/sync/manifesto.ts`, criar `src/test/manifesto.test.ts`

- [ ] **Step 1: Testes** — ida e volta; manifesto corrompido cai no `manifesto.anterior.json`; ausência dos dois é tratada como primeiro sync; a rotação só acontece após ciclo completo.

- [ ] **Step 2-4:** implementar sobre `escreverTextoAbsoluto` (`vaultRepo.ts`, que já grava fora do cofre) e `appConfigDir()` de `@tauri-apps/api/path`. O diretório é `hash_texto(normalizar(caminhoDoCofre))`.

- [ ] **Step 5: Commit**

---

## Verificação de cobertura do spec

| Requisito do spec | Task |
|---|---|
| Comandos de hash em Rust | 1 |
| OAuth PKCE, navegador do sistema, loopback | 2 |
| Refresh token no Credential Manager, access token só em memória | 2 |
| Escopo `drive.file` apenas | 2 |
| Allowlist do `www.googleapis.com` | 2 |
| Ponte TS sem lógica | 3 |
| Verificação manual do login + persistência entre sessões | 4 |
| **Spike bloqueador do `changes.list`** | 4 |
| Tipos do manifesto e do plano | 5 |
| Matriz 3×3 (com manifesto) | 6 |
| Matriz 2×2 (sem manifesto) | 7 |
| Freio de 50% | 8 |
| Manifesto com rotação de backup | 9 |

**Fora deste plano, por decisão explícita:** o cliente do Drive (`src/lib/drive/api.ts`), a fila de upload, o polling, a política de conflito por tipo de arquivo, a aba Nuvem e o indicador ☁️. Todos dependem do resultado do spike da Task 4 e serão planejados depois dele.
