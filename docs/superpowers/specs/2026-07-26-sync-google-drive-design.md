# Sincronização com Google Drive — Design

**Data:** 2026-07-26
**Status:** Aprovado — pronto para plano de implementação
**Spec C de 3** — **depende do spec A** (`2026-07-26-opcoes-e-trocar-cofre-design.md`),
que cria o modal de Opções onde a aba Nuvem mora.
Recomendado soltar o spec B (`2026-07-26-campanha-em-pasta-design.md`) antes de ligar o sync
(ver "Versão mínima de cofre").

## Objetivo

Usar o mesmo cofre em qualquer computador, com toda modificação feita em um aparecendo no outro,
sem instalar nada além do próprio Grimório. Login com conta Google, sincronização contínua e
automática, funcionando offline e reconciliando ao voltar.

## Decisões travadas (brainstorming 2026-07-26)

| Tema | Decisão |
|------|---------|
| Abordagem | **Sync nativo via Drive API**, não pasta do Google Drive para Desktop. |
| Cadência | **Contínuo** — upload ~3 s após salvar, download a cada 60 s e ao ganhar foco. |
| Conflito | **Vence a mais recente + cópia de conflito** ao lado, com aviso. Nunca sobrescrita silenciosa. |
| Pareamento | Aba Nuvem **lista os cofres já enviados**; escolhe um e uma pasta local vazia. Nunca mistura local com remoto. |
| Conteúdo | **Cofre inteiro**, JSON e imagens, tudo baixado no pareamento. Funciona 100 % offline depois. |
| Pasta no Drive | **O app cria a pasta `Grimório`** no Drive do usuário, visível e navegável. |

## Restrições externas do Google (pesquisadas em 2026-07-26)

Estas não são preferências — são o que a plataforma permite.

1. **Escopo `drive.file` é non-sensitive.** Publica para usuários ilimitados sem verificação,
   sem vídeo demo, sem domínio verificado e **sem a auditoria CASA**. O preço: o app só enxerga
   arquivos que **ele mesmo criou**. Fonte: *Choose Google Drive API scopes* (2026-07-14) e
   *Requesting Minimum Scopes*.
2. **`drive` e `drive.readonly` são restricted** ⇒ obrigam a security assessment por assessor
   credenciado (CASA), **renovada a cada 12 meses**, paga ao assessor. Inviável. Até
   `drive.metadata.readonly` (só nomes de arquivo) é restricted.
3. **Publicar o app é obrigatório.** Em status "Testing", o refresh token do Google
   **expira em 7 dias**. Só o subset name/email/profile escapa disso, e Drive não está nele.
4. **OAuth em webview embutido é proibido** (`disallowed_useragent`). A Microsoft confirma que
   isso atinge o WebView2, que é o motor do Tauri no Windows. ⇒ o login **tem** que abrir o
   navegador do sistema, com retorno em `http://127.0.0.1:<porta>` (loopback segue suportado
   para desktop; o fluxo OOB morreu em 2023).
5. **A API v3 do Drive não tem ETag nem If-Match.** Não existe escrita condicional — perda de
   escrita é estruturalmente possível. Por isso a cópia de conflito é obrigatória, não opcional.
6. **Push notification exige servidor HTTPS público** e o canal expira em 7 dias sem renovação
   automática, e ainda assim não traz o conteúdo da mudança. ⇒ **polling**.
7. **Quota não é gargalo:** 325.000 unidades/min por usuário; `changes.list` custa 100.
   Polling de 60 s consome fração de porcento.

## Pré-requisitos manuais (só o dono do projeto pode fazer)

Sem isto a fase C1 não sai do lugar. ~20 min no Google Cloud Console:

1. Criar um projeto.
2. OAuth consent screen: tipo **External**, **apenas** o escopo
   `https://www.googleapis.com/auth/drive.file`.
3. **Publicar o app (status "In production").** Sem isso, relogin obrigatório toda semana.
4. Criar credencial do tipo **Desktop app** → `client_id` + `client_secret`.
5. Guardar os dois como **GitHub secrets**; o workflow de release injeta no build.
   Não vão para o repositório — é público.

Nota: o Google documenta que em app desktop o `client_secret` não é secreto de verdade
(RFC 8252 trata o cliente como público). Ainda assim, injetar no build em vez de commitar.

## Arquitetura

Quatro camadas, com uma fronteira deliberada: **o Rust é dono das credenciais, o TypeScript
nunca vê o refresh token.**

### Camada 1 — Autenticação (Rust)

`src-tauri/src/auth.rs`, crates novas: `oauth2` 5, `keyring` 4, `tauri-plugin-oauth` 2.1.

| Comando Tauri | Faz |
|---|---|
| `google_iniciar_login()` | gera PKCE, sobe o loopback (`tauri-plugin-oauth`), abre o navegador do sistema (`tauri-plugin-opener`, **já instalado**), troca o code por tokens, grava o refresh token no **Windows Credential Manager** (`keyring`), devolve o e-mail da conta |
| `google_access_token()` | devolve access token válido, renovando pelo refresh quando expirado. Access token **só em memória** |
| `google_conta()` | e-mail conectado, ou `null` |
| `google_desconectar()` | apaga a entrada do Credential Manager e zera a memória |

O limite de 2560 bytes por credential do Windows cabe um refresh token com folga — guardar
**só** o refresh token lá, nada de JSON grande.

### Camada 2 — Cliente Drive (Rust, `src-tauri/src/drive.rs`)

> **Mudou na implementação (2026-07-27, commit `54d5b70`).** O desenho original punha esta
> camada em TypeScript sobre o `plugin-http`. Ela saiu em Rust, exposta como comandos Tauri,
> por um motivo que só ficou visível ao escrever: em TypeScript **cada operação exigiria o
> access token atravessando a ponte** para o lado do front, desfazendo metade do cuidado do
> `auth.rs` — que existe justamente para o segredo nunca sair do processo Rust. Em Rust cada
> comando pede o token a `auth::google_access_token` e o consome no mesmo processo.
>
> Consequência: o allowlist `https://www.googleapis.com/*` em `capabilities/default.json`
> deixou de ser necessário para o Drive. Continua lá, ainda usado pelo Gemini.

`accounts.google.com` **não** entra: abre no navegador do sistema.
`oauth2.googleapis.com` **não** entra: a troca de token é feita no Rust.

Operações: `criarPasta`, `listarFilhos`, `uploadMultipart` (< 5 MB), `uploadResumable` (≥ 5 MB,
o caso das imagens), `baixar`, `atualizarConteudo`, `renomear`, `mover`, `paraLixeira`,
`getStartPageToken`, `listarMudancas`.

Campos sempre pedidos: `id,name,parents,mimeType,size,version,sha256Checksum,trashed,modifiedTime`.

**Por que TS e não Rust:** o motor fica testável com vitest como o resto do projeto (já existe
`src/test/fakeFs.ts` para injetar FS falso), e segue o padrão de `gemini.ts`. Só auth vai para
Rust, porque Credential Manager e servidor loopback exigem.

### Camada 3 — Motor de sync (`src/lib/sync/`)

#### Layout no Drive

```
Grimório/                      ← criada pelo app; pode ser arrastada para qualquer lugar do Drive
  <Nome do Cofre>/
    cofre.json                 { id, nome, versaoMinima, criadoEm }
    campanhas/…                ← espelho fiel da árvore local
    personagens-soltos/…
    cenarios/…
    canvases-soltos/…
    vinculos.json
```

A árvore é espelhada de verdade (não achatada) por dois motivos: você navega no
drive.google.com, e `appProperties` do Drive tem teto de 124 bytes por propriedade — não cabe
caminho relativo profundo.

Como o rastreio é por `fileId` e não por caminho, mover a pasta `Grimório` dentro do Drive
não quebra nada.

#### Manifesto — o coração

Fica **fora do cofre**. Se morasse dentro, sincronizaria a si mesmo e conflitaria a cada troca.

```
appConfigDir()/cofres/<hash do caminho local>/manifesto.json
```

O nome do diretório é `hash_texto(normalizar(caminhoDoCofre))` — comando Rust novo, SHA-256 hex
truncado em 16 caracteres. Usa a mesma normalização `\`→`/` do spec A, senão o mesmo cofre
ganha dois manifestos. `appConfigDir()` vem de `@tauri-apps/api/path` (API core, já coberta por
`core:default` — nenhum plugin novo).

`deviceNome` nasce como "Este computador" e é editável na aba Nuvem; `deviceId` é um UUID
gerado na primeira vez e nunca muda. Os dois só servem para nomear cópias de conflito.

```json
{
  "versao": 1,
  "cofreId": "…", "pastaRaizId": "…",
  "startPageToken": "…",
  "deviceId": "…", "deviceNome": "PC Casa",
  "ultimoSync": "2026-07-26T14:32:00Z",
  "pastas":  { "campanhas/aventura": "<folderId>" },
  "arquivos": {
    "campanhas/aventura/personagens/gandalf.json":
      { "fileId": "…", "hash": "<sha256>", "tamanho": 1234, "mtimeLocal": 1753540000000, "versaoRemota": "42" }
  }
}
```

**Forma canônica do caminho — pré-condição, não sugestão.** Toda chave usa `/`, nunca `\`, e passa por
`normalizarCaminho` (`src/lib/cofres.ts`) antes de entrar no manifesto. As três origens que alimentam
a reconciliação — manifesto lido do disco, varredura local, listagem do Drive — **têm que concordar na
forma**, incluindo caixa e normalização Unicode.

Não é preciosismo: `reconciliar` faz a união das três coleções de chaves. Se o manifesto guardar
`campanhas\x.json` e a varredura emitir `campanhas/x.json`, o mesmo arquivo vira **duas** chaves — uma
some (`apagarRemoto`) e a outra sobe (`subir`). Em cofre com 10+ arquivos o freio de deleção em massa
pega e pergunta; abaixo disso, não pega. Nos dois casos o primeiro sync nasce errado.

Casos que exigem atenção de quem montar os mapas: o sistema de arquivos do Windows é
**case-insensitive** e o Drive é **case-sensitive** (`Gandalf.json` e `gandalf.json` são dois arquivos
lá e um só aqui); e acentuação pode chegar em NFC ou NFD, o que num cofre em português é a regra, não
a exceção.

### Contrato do manifesto — reconstrução, não edição incremental

Ao fim de um ciclo bem-sucedido, o executor **reconstrói o manifesto inteiro** a partir do estado
pós-sync (o que existe localmente e no Drive depois de aplicadas as ações), em vez de aplicar
alterações entrada por entrada.

Isso resolve, por construção, três problemas que a edição incremental teria:

- **Sem entradas fantasma.** A célula `apagado × apagado` da matriz não emite ação nenhuma — não há
  verbo para "esquecer" em `Acao`, e não precisa haver: o caminho simplesmente não aparece no
  manifesto novo. Sob edição incremental, ele ficaria lá para sempre, inflando o `total` que é o
  denominador do freio de deleção em massa. Um cofre com 20 arquivos reais e 200 fantasmas mediria
  uma falha sistemática de 20 deleções como 9%, e o freio nunca dispararia.
- **`fileId` nunca envelhece.** Se um caminho passar a apontar para outro arquivo no Drive com
  conteúdo idêntico, a reconciliação decide `igual` pelo hash e não emite nada — mas o id é regravado
  junto com o resto do manifesto.
- **`versaoRemota` também não deriva**, pelo mesmo motivo.

O custo é que `registrar` vira uma instrução de I/O ("não transfira nada"), não uma instrução de
manifesto. É o que ela já é na prática.

É o mesmo conceito que o rclone chama de `.lst` e o Unison de *archive*: **o estado conhecido do
último sync bem-sucedido**. É o que permite responder "isto mudou desde o último sync?" em vez
de "quem tem a data maior?" — a diferença entre um sync correto e um que ressuscita arquivo
apagado toda vez.

Escrito com `escreverTextoAbsoluto` (`vaultRepo.ts:267`), que já grava fora do cofre.
Seguindo o padrão do rclone `--recover`, manter **duas cópias**: `manifesto.json` e
`manifesto.anterior.json`, rotacionadas só após um ciclo completo com sucesso.

#### Detecção de mudança local (sem file watcher)

O crate `notify` não está no projeto e não precisa entrar. Duas fontes:

1. **Marcação na escrita** — todo write do app passa por `VaultRepo.naFila` (`vaultRepo.ts:119-124`)
   ou `NotebookRepo.naFila` (`notebookRepo.ts:39-44`). Um callback ali marca o caminho como sujo
   e enfileira. Cobre 100 % do uso normal.
2. **Varredura de reconciliação** — no boot e a cada N min, percorre o cofre e compara hash com o
   manifesto. Pega o que mudou com o app fechado (OneDrive trazendo algo, edição manual, restauração).

Hash SHA-256 por comandos Rust novos `hash_arquivo(path)` e `hash_texto(s)` (crate `sha2`) —
ler dezenas de MB de imagem no JavaScript a cada varredura é inviável. Otimização: pular o hash
quando `tamanho` e `mtime` batem com o manifesto.

`list_dir` (`src-tauri/src/lib.rs:57-69`) hoje devolve só `{name, is_dir}`. A varredura precisa
de `size` e `mtime` para essa otimização — estender o retorno, mantendo os campos atuais para
não quebrar os chamadores existentes (`fsBridge.ts:15-28` e todos os `montar*` do `vaultRepo`).

#### Detecção de mudança remota

`changes.getStartPageToken` na primeira vez, depois `changes.list(pageToken)` a cada 60 s e ao
ganhar foco, seguindo `nextPageToken` até `newStartPageToken`. Filtra por `parents` dentro da
pasta do cofre — a API não filtra por pasta.

**`removed: true` significa deleção OU perda de acesso, indistinguíveis.** Ao ver isso, fazer
`files.get`: 404 confirma que sumiu; sucesso significa que só saiu do escopo — ignorar.
`removed: false` com `trashed: true` é lixeira (recuperável 30 dias) e conta como deleção.

#### Reconciliação — função pura, testável

```ts
reconciliar(manifesto, local, remoto): Acao[]
```

Sem I/O, sem Tauri. Estado de cada lado é derivado **contra o manifesto**, não contra o outro lado.

**Com entrada no manifesto:**

| local ↓ / remoto → | igual | mudou | apagado |
|---|---|---|---|
| **igual** | nada | baixar | apagar local |
| **mudou** | subir | **conflito** | subir (recria no Drive) |
| **apagado** | apagar remoto (lixeira) | baixar (**modificação vence deleção**) | tira do manifesto |

**Sem entrada no manifesto** (primeiro sync, ou arquivo novo):

| local ↓ / remoto → | existe | não existe |
|---|---|---|
| **existe** | hash igual → só registra; hash diferente → **conflito** | subir |
| **não existe** | baixar | — |

Baseado na matriz de decisão documentada do `remotely-save` v3.
⚠️ **O código do motor daquele plugin está sob PolyForm Strict e não pode ser copiado nem
derivado.** Só os documentos de design (`docs/`, Apache-2.0) são reutilizáveis, com atribuição.

#### Quem assina a cópia de conflito

O nome da cópia perdedora é `Gandalf (conflito — PC Casa 26-07 14h32)`, e o nome do dispositivo
existe para você saber **de onde veio** a edição que perdeu. Mas o manifesto guarda `deviceNome`
apenas do próprio computador. Quando o local vence e a **remota** vira a cópia de conflito, não há
nada dizendo qual máquina escreveu aquela versão — metade dos conflitos ficaria sem assinatura.

`lastModifyingUser` do Drive não resolve: é a mesma conta do Google nas duas pontas, então diria o
seu nome dos dois lados.

**Decisão:** a cada upload, gravar `deviceNome` em `appProperties` do arquivo no Drive. O teto é
124 bytes por propriedade (chave + valor), o que cabe um nome de máquina com folga, e vem junto no
`files.get`/`changes.list` sem chamada extra. Quando a remota perde, a cópia é assinada com esse
valor; se ele faltar (arquivo enviado por uma versão anterior do app), cai em `"outro computador"`.

## Política de conflito por tipo de arquivo

Nem tudo pode virar cópia — e é aqui que mora a armadilha.

| Arquivo | Política |
|---|---|
| Entidade (`personagem`, `cenario`, `canvas`, página de caderno) | vence a mais recente; a perdedora é gravada ao lado **com `id` novo e `nome` prefixado por "(conflito)"** |
| `vinculos.json` | **união dos dois lados**, nunca conflito. `adicionarVinculo` (`vinculos.ts:13`) já deduplica por `(deId, paraId, tipo)`. Vínculo é conjunto; união é a semântica certa |
| `pasta.json`, `campanha.json`, `cofre.json` | vence a mais recente, sem cópia (só metadado) |
| Imagem | vence a mais recente; perdedora salva com sufixo, e o aviso deixa claro que ela fica órfã (o JSON aponta para um caminho só) |

**Por que o `id` novo:** o cofre é indexado por id — `carregarPersonagens` (`store.ts:207-232`)
monta `personagens[id]` e `caminhoPorId[id]`. Duas cópias do mesmo arquivo com o mesmo id
fariam uma sumir da sidebar sem explicação. Trocar o id transforma a cópia numa entidade
legítima e visível.

Nome da cópia: `gandalf (conflito — PC Casa 26-07 14h32).json`.

#### Guard-rails

- **Freio de deleção em massa:** se o plano de ações quiser apagar mais de **50 %** dos arquivos
  de um dos lados, **aborta e pergunta**. É o default do rclone e do remotely-save, e existe
  porque esse é exatamente o modo como sync perde cofre inteiro.
- **Cofre dentro de outro sincronizador:** detectar `OneDrive`, `Dropbox`, `Google Drive` ou
  `iCloud` no caminho do cofre e avisar antes de ligar:
  *"Este cofre está dentro do OneDrive. Dois sincronizadores no mesmo arquivo corrompem o cofre.
  Mova-o para uma pasta fora antes de ligar o sync."*
  Isto não é hipotético: o cofre atual do app empacotado vive dentro do OneDrive, e o próprio
  código já carrega retry de rename por causa disso (`src-tauri/src/lib.rs:3`).
- **Arquivo aberto no editor:** não aplicar download em arquivo cujo caminho está em `aberto`
  (`store.ts`). Adiar até ele ser fechado e mostrar "atualização disponível". Evita o download
  brigar com o autosave debounced.
- **Versão mínima de cofre:** `cofre.json` guarda `versaoMinima`. Uma versão do app mais antiga
  que isso recusa sincronizar em vez de corromper — relevante porque `normalizarVinculos`
  (`vinculos.ts:94`) descarta em silêncio tipos de vínculo que não conhece.
- **Trava de instância:** um arquivo de lock no diretório do manifesto impede dois ciclos de sync
  simultâneos na mesma máquina.

#### Fila de upload

Coalesce por caminho (arquivo tocado 5× em 3 s = 1 upload), debounce 3 s, retry com backoff
exponencial, persiste no manifesto para sobreviver a fechar o app, acumula offline.

### Camada 4 — UI

**`src/components/OpcoesNuvem.tsx`** — substitui o placeholder do spec A
- Desconectado: explicação em uma frase + "Entrar com Google".
- Conectado: e-mail, e conforme o estado do cofre atual:
  - não enviado → "Enviar este cofre para a nuvem"
  - lista dos cofres na nuvem → "Baixar…" (pede pasta local vazia)
  - sincronizado → último sync, "Sincronizar agora", "Parar de sincronizar este cofre"
- Lista de conflitos resolvidos, cada um com link para abrir a cópia.
- "Desconectar conta".

**`src/components/IndicadorSync.tsx`** — badge ☁️ no header da sidebar, ao lado do ⚙️
- estados: sincronizado · enviando N · baixando N · offline · erro · N conflitos
- clique abre a aba Nuvem

## Entrega em 5 fatias verificáveis

| | Entrega | Verificação |
|---|---|---|
| **C1** | Login, `google_*`, aba Nuvem mostra a conta | logar, fechar o app, reabrir, continuar logado |
| **C2** | Envio one-way: cria `Grimório/<cofre>`, sobe tudo, nasce o manifesto | abrir drive.google.com e ver a árvore completa |
| **C3** | Download one-way: lista os cofres, baixa para pasta vazia | segundo PC abre o cofre igual ao primeiro |
| **C4** | Bidirecional: reconciliação, conflitos, guard-rails | editar nos dois offline, reconectar, conferir a cópia |
| **C5** | Contínuo: fila, polling 60 s, foco, indicador ☁️ | salvar num PC e ver aparecer no outro em ~1 min |

**Spike bloqueador — RESOLVIDO em 2026-07-27, commit `fc9cd17`.** Com credencial real,
`changes.list` sob `drive.file` **reporta** os arquivos criados pelo app: criação,
modificação e exclusão, todas confirmadas com chamadas reais. O polling incremental está
liberado; não é preciso cair para `files.list` + `modifiedTime`. O experimento vive em
`src-tauri/examples/spike_changes.rs` e pode ser rodado de novo com
`cargo run --example spike_changes` — ele limpa o que cria.

Quatro achados que o consumidor do feed precisa respeitar:

1. **Na exclusão o objeto `file` some.** Sobram só `changeType`, `fileId`, `removed` e
   `time`. Ler `mudanca.file.name` sem ramificar em `removed` antes quebra em produção.
2. **`newStartPageToken` só aparece na última página.** Parar no primeiro `changes.list`
   sem seguir o `nextPageToken` deixa a rodada seguinte sem token.
3. **Consistência eventual de ~2 s.** Criação e exclusão só apareceram na segunda tentativa.
   Feed vazio logo depois de uma escrita **não** significa "nada mudou" — tratar como
   "ainda não sei" evita que o motor conclua uma exclusão que não houve.
4. **`removed: true` significa "saiu do seu alcance", não "foi apagado".** Perda de acesso
   produz o mesmo sinal que exclusão, e o feed não distingue os dois. O desenho já se
   defende disso por dois caminhos independentes: o motor compara cada lado **contra o
   manifesto**, nunca um lado contra o outro, e o freio de exclusão em massa
   (`MINIMO_PARA_FREIO`) corta o caso catastrófico em que o acesso a tudo se perde de uma
   vez. Nenhuma exclusão local pode ser derivada de `removed: true` isoladamente.

`files.delete` apaga de vez (HTTP 204) e nunca produz `trashed`. Mas o usuário mandando o
arquivo para a lixeira pela interface do Drive produz um caso **diferente** —
`removed: false` com `file.trashed: true` — que é um segundo caminho a tratar.

## Testes

O motor é desenhado para ser testável sem rede: `reconciliar` é pura, e o cliente Drive é
injetado por interface, do mesmo jeito que `FsBridge` (`src/lib/fsBridge.ts:3-13`) já é injetado
por `src/test/fakeFs.ts`.

**`src/test/sync.reconciliar.test.ts`** — um caso por célula das duas matrizes, mais:
- modificado dos dois lados com **hash idêntico** → nenhuma ação (falso conflito)
- arquivo apagado local e intocado remoto → apaga remoto, **e não volta no ciclo seguinte**
  (o teste de regressão do bug clássico de sync)
- plano com > 50 % de deleções → devolve `abortar`, não a lista de ações

**`src/test/sync.conflito.test.ts`**
- cópia de entidade recebe **id novo** e nome prefixado
- `vinculos.json` resolve por união, com dedupe, e nunca gera cópia
- nome da cópia inclui device e data

**`src/test/sync.manifesto.test.ts`**
- ida e volta de leitura/escrita; manifesto corrompido cai no `manifesto.anterior.json`;
  ausência dos dois trata como primeiro sync

**`src/test/drive.api.test.ts`** — com `fetch` falso: paginação de `changes.list` até
`newStartPageToken`, escolha multipart × resumable por tamanho, `removed:true` desambiguado
por `files.get`.

Auth e rede real não são testados automaticamente — verificação manual, abaixo.

## Critérios de verificação

1. `npm run build` sem erro; `npm test` verde; `cargo build` limpo.
2. C1 — logar abre o **navegador do sistema** (não uma janela do app); após autorizar, a aba
   Nuvem mostra o e-mail; reiniciar o app mantém a sessão; "Desconectar" some com a credencial
   do Credential Manager do Windows.
3. C2 — "Enviar para a nuvem" cria `Grimório/<cofre>` no drive.google.com com a árvore fiel,
   e o manifesto aparece em `appConfigDir`.
4. C3 — no segundo PC, baixar para pasta vazia reproduz o cofre **com as imagens**, e todos os
   cards/canvas abrem sem imagem quebrada.
5. C4 — editar o mesmo personagem nos dois PCs offline, reconectar: a versão mais nova fica,
   a cópia de conflito aparece na sidebar como entidade própria, e o aviso conta 1 conflito.
6. C4 — apagar um personagem no PC A, sincronizar os dois, sincronizar de novo:
   **ele não volta**.
7. C4 — apagar metade do cofre e sincronizar: **o freio de 50 % dispara e pergunta**.
8. C5 — salvar no PC A e, sem tocar em nada, ver aparecer no PC B em ~1 min; o indicador ☁️
   passa por "enviando" e volta para "sincronizado".
9. Offline — desligar a rede, editar bastante, religar: tudo sobe, nada se perde.
10. Cofre dentro do OneDrive → o aviso aparece **antes** de qualquer upload.

## Riscos aceitos

- **Sem escrita condicional na API v3.** Existe uma janela entre ler e gravar em que uma escrita
  pode se perder. A cópia de conflito reduz o dano, não elimina a janela.
- **`drive.file` não enxerga o que você criar à mão** dentro da pasta `Grimório` pelo site do
  Drive. Documentar na aba Nuvem.
- **Cópias de conflito acumulam** se forem ignoradas. Só o aviso combate isso; não há limpeza
  automática na v1.
- **Deleção e perda de acesso são indistinguíveis** na API; a desambiguação por `files.get` é
  heurística, não garantia.

## Fora de escopo (v1)

- Criptografia ponta a ponta.
- Histórico de versões / restaurar do Drive.
- Compartilhar cofre com outra pessoa, ou dois usuários editando ao mesmo tempo.
- Sincronizar configurações do app (tema, chaves do Gemini, recentes seguem por-máquina).
  A chave do Gemini **nunca** vai para a nuvem.
- Resolver conflito com diff lado a lado na tela.
- Outros provedores (Dropbox, OneDrive, S3).
- Escolher uma pasta existente do Drive pelo seletor do Google — reavaliar depois, sem
  refazer o motor: muda só a origem do `pastaRaizId`.
- macOS e Linux (o release hoje é só Windows; `keyring` cobre os três, mas não será testado).
