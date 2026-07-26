# Modal de Opções + trocar de cofre — Design

**Data:** 2026-07-26
**Status:** Aprovado — pronto para plano de implementação
**Spec A de 3** — ver também `2026-07-26-campanha-em-pasta-design.md` (B, independente)
e `2026-07-26-sync-google-drive-design.md` (C, depende deste)

## Objetivo

Hoje o cofre é escolhido uma única vez (`VaultPicker`) e nunca mais pode ser trocado sem
limpar o `localStorage`. Não existe tela de configurações: tema são swatches inline na
sidebar e a chave do Gemini é um prompt escondido.

Criar um **modal de Opções (⚙️)** com aba de **Cofre** que permite trocar de cofre sem
reiniciar o app, manter uma lista de cofres recentes, e concentrar as configurações
espalhadas. A aba **Nuvem** nasce vazia aqui e é preenchida pelo spec C.

## Decisões travadas (brainstorming 2026-07-26)

| Tema | Decisão |
|------|---------|
| Formato | **Modal**, não tela cheia. Botão ⚙️ no header da sidebar. |
| Abas | **Cofre · Nuvem · Aparência · IA** (Nuvem é placeholder até o spec C). |
| Recentes | **Sim** — lista de cofres já abertos, com troca em 1 clique. |
| Troca | **Sem reiniciar o app.** |
| Config por cofre | Cada cofre lembra as próprias configurações (filtro de campanha, e no spec C se o sync está ligado). |

## Contexto do código (já existe — reusar)

- **Persistência do cofre:** `localStorage['grimorio.vault']` — gravada em `src/state/store.ts:175`,
  lida no boot em `src/App.tsx:31-32` (com `.catch(() => localStorage.removeItem(...))`),
  origem do valor em `src/components/VaultPicker.tsx:11-12` (`open({ directory: true })` do
  `@tauri-apps/plugin-dialog`).
- **Abertura:** `abrirCofre(path)` — `src/state/store.ts:168-187`. Guarda de reentrância (`:169`),
  normaliza `\`→`/` (`:172`), `new VaultRepo` (`:173`), `inicializar()` (`:174`), persiste (`:175-176`),
  então em série `recarregarArvore` → `carregarPersonagens` → `carregarCenarios` → `carregarVinculos`
  (`:177-180`). Erro → `erroCofre` + re-throw (`:181-183`).
- **VaultPicker só aparece quando não há cofre:** `src/App.tsx:40`.
- **Gravações atrasadas (o risco central desta spec):**
  - constantes `SALVAR_PARCIAL_DEBOUNCE_MS = 800` (`store.ts:12`) e `SALVAR_VINCULOS_DEBOUNCE_MS = 800` (`store.ts:138`)
  - mapas de timer em **nível de módulo**: `timersSalvarParcial` (`store.ts:16`),
    `timersSalvarCenario` (`store.ts:19`), `timerSalvarVinculos` (`store.ts:64`)
  - agendadores: `agendarSalvarCenario` (`store.ts:22`), `agendarSalvarPersonagem` (`store.ts:43`),
    `agendarSalvarVinculos` (`store.ts:140`)
  - **o caminho é re-resolvido no disparo do timer** (`store.ts:30-31` e `store.ts:51-52`), lendo
    `caminhoPorId`/`caminhoCenarioPorId` do estado corrente
  - autosave do canvas tem timer próprio no componente (`src/components/CanvasView.tsx`, `AUTOSAVE_DEBOUNCE_MS = 1000`)
- **Chaves de `localStorage` em uso:** `grimorio.vault`, `grimorio.campanhaFiltro`
  (`store.ts:373-376` lê, `:406-410` grava), `grimorio.tema` (`src/lib/tema.ts:10`),
  `grimorio.geminiKeys` (`src/lib/chavesIA.ts:10`), `grimorio.sidebar` (`src/App.tsx:20,25`),
  `grimorio.split.<caminho>` (`src/components/Workspace.tsx:23,32`).
- **Padrão de modal do projeto:** store zustand + componente Host montado no `App` —
  `src/components/dialogos.tsx:21` (`useDialogo`) / `:47-87` (`HostDialogos`),
  `src/components/dialogoCampanhas.tsx:24-48` / `:85-123`. Hosts montados em `src/App.tsx:85-86`.
- **Onde encostar o botão:** `<SeletorTema />` está em `src/components/Sidebar.tsx:96`;
  o `<select>` de filtro de campanha em `Sidebar.tsx:102-112`.
- **Configurações a realocar:** `src/components/SeletorTema.tsx` (aba Aparência),
  `garantirChaves(pedir)` em `src/lib/chavesIA.ts:33-43` (aba IA).
- **Criação silenciosa de cofre:** `VaultRepo.inicializar()` — `src/lib/vaultRepo.ts:130-133` faz
  `mkdirAll('campanhas')` e `mkdirAll('canvases-soltos')`, que caem em `std::fs::create_dir_all`
  (`src-tauri/src/lib.rs:71-74`) e criam a árvore inteira, inclusive a raiz inexistente.
- **Sonda de existência:** comando `path_exists` — `src-tauri/src/lib.rs:115-118`,
  exposto por `src/lib/fsBridge.ts:15-28`.

## Arquitetura

### Arquivos novos

**`src/lib/cofres.ts`** — registro de cofres, lógica pura e testável (sem Tauri, sem React)

```ts
export type CofreRegistrado = { caminho: string; nome: string; ultimoAcesso: number }
```

- `CHAVE_REGISTRO = 'grimorio.cofres'`
- `listar(): CofreRegistrado[]` — lê e ordena por `ultimoAcesso` desc; JSON inválido → `[]`
- `registrar(caminho, nome?): CofreRegistrado[]` — insere ou atualiza `ultimoAcesso`;
  `nome` padrão = último segmento do caminho
- `renomear(caminho, nome)`, `remover(caminho)` — remover tira da lista, **nunca toca no disco**
- `migrarDoLegado(): void` — se `grimorio.cofres` não existe e `grimorio.vault` existe,
  semeia a lista com esse caminho. Idempotente.
- `chaveDeCofre(prefixo, caminho): string` — devolve `` `${prefixo}.${normalizar(caminho)}` ``,
  seguindo a convenção que `grimorio.split.<caminho>` já usa (`Workspace.tsx:23,32`)
- `normalizar(caminho)` — `replace(/\\/g, '/')`, o mesmo de `store.ts:172`.
  **Aplicar sempre antes de usar caminho como chave ou como identidade de cofre.** Hoje o
  `localStorage` guarda o caminho cru e o state guarda o normalizado (`store.ts:172,175`);
  sem normalizar, `C:\x\y` e `C:/x/y` viram dois cofres diferentes no registro.

**`src/components/Opcoes.tsx`** — store + Host + abas

- `useOpcoes` (zustand): `{ aberto: boolean, aba: Aba, abrir(aba?), fechar() }`,
  `type Aba = 'cofre' | 'nuvem' | 'aparencia' | 'ia'`
- `HostOpcoes` — renderiza `null` quando fechado; senão `.modal-overlay` + `.opcoes-modal`
  com barra de abas à esquerda e conteúdo à direita. Fecha em overlay, ✕ e `Esc`.
- Aba **Aparência**: renderiza `<SeletorTema />` (o componente existente, sem alteração).
- Aba **Nuvem**: placeholder — "Sincronização com a nuvem chega em breve." (substituída no spec C).

**`src/components/OpcoesCofre.tsx`** — aba Cofre

- Cofre atual: caminho completo, botão "Abrir pasta" (`plugin-opener`, já instalado e permissionado).
- Lista de recentes (`cofres.listar()`): nome, caminho, "Abrir" (troca), ✏️ (renomear rótulo,
  via `pedirTexto`), 🗑️ (tira da lista — com `ask()` deixando explícito que **não apaga arquivos**).
- Botão "Abrir outro cofre…" → `open({ directory: true })` → validação → `trocarCofre`.

**`src/components/OpcoesIA.tsx`** — aba IA

- Mostra quantas chaves do Gemini estão salvas e um botão "Alterar chaves" que chama o mesmo
  fluxo de `chavesIA.ts`, mais "Remover chaves salvas". Não muda o formato de armazenamento.

**`src/test/cofres.test.ts`** — vitest sobre `lib/cofres.ts` com `localStorage` do jsdom.

### Arquivos alterados

**`src/state/store.ts`**

- `descarregarFilas(): Promise<void>` — **novo, e é o que impede corromper o cofre**.
  Para cada timer pendente em `timersSalvarParcial` (`:16`), `timersSalvarCenario` (`:19`) e
  `timerSalvarVinculos` (`:64`): `clearTimeout` e executa a gravação **imediatamente e com
  `await`**, enquanto o estado ainda aponta para o cofre antigo. Depois esvazia os mapas.
- `trocarCofre(caminho): Promise<void>` — nesta ordem, sem atalho:
  1. se `caminho` normalizado === `vaultPath`, retorna sem fazer nada;
  2. `set({ aberto: null })` — desmonta `Workspace`/`CanvasView`/`NotasEditor` para que os
     autosaves locais deles descarreguem antes da troca;
  3. `await descarregarFilas()`;
  4. `set({ tree: vazia, personagens: {}, caminhoPorId: {}, cenarios: {}, caminhoCenarioPorId: {}, vinculos: [], paginaAtivaPorCaderno: {}, perfilAbertoId: null, cenarioAbertoId: null, campanhaFiltro: null, erroCofre: null })`;
  5. `await abrirCofre(caminho)`;
  6. `cofres.registrar(caminho)`.
- `campanhaFiltro` passa a ser **por cofre**: ler/gravar em
  `chaveDeCofre('grimorio.campanhaFiltro', vaultPath)` em vez da chave global
  (`store.ts:373-376` e `:406-410`). A validação contra a árvore corrente (`store.ts:374-376`,
  `Sidebar.tsx:73`) continua como está — é a rede de proteção para id de campanha inexistente.
  A restauração acontece dentro do `abrirCofre`, **depois** de `vaultPath` estar setado
  (`store.ts:175-176`) e antes dos carregamentos (`:177-180`).

**`src/components/Workspace.tsx`** (cosmético, baixa prioridade)

- `chaveSplit` é o **caminho relativo** do item (`Workspace.tsx:20-33`), então dois cofres com
  a mesma estrutura compartilham a posição do splitter. Não corrompe nada — só herda o layout
  do outro cofre. Prefixar com o cofre resolve em uma linha; se atrapalhar o escopo, adiar.
- `abrirCofre` (`:168-187`) ganha `cofres.registrar(norm)` após persistir com sucesso.

**`src/App.tsx`**

- No boot, antes de restaurar o cofre: `cofres.migrarDoLegado()` e migração da chave global
  `grimorio.campanhaFiltro` para a chave por-cofre (lê a antiga, grava na nova, apaga a antiga).
- Montar `<HostOpcoes />` junto dos outros hosts (`App.tsx:85-86`).
- Quando `abrirCofre` do boot falha (`:31-32`), além de remover a chave, zerar `vaultPath` e
  `repo`. Falha **antes** de `store.ts:176` já cai no `VaultPicker` sozinha; falha **depois**
  (árvore ilegível, disco somindo no meio) deixa `vaultPath` válido com `tree` null, e a sidebar
  fica presa em "Carregando…" (`Sidebar.tsx:68`) — tela morta, não crash.

**`src/components/Sidebar.tsx`**

- Botão `⚙️` (`className="btn-icon"`, `title="Opções"`) ao lado de `<SeletorTema />` (`:96`),
  chamando `useOpcoes.getState().abrir()`.

**`src/components/VaultPicker.tsx`**

- Extrair a validação de pasta (abaixo) para reuso entre o picker e a aba Cofre.

**`src/theme.css`**

- `.opcoes-modal`, `.opcoes-abas`, `.opcoes-aba`, `.opcoes-conteudo`, `.opcoes-cofre-item`.
  Usar os tokens existentes (`--fundo-painel`, `--fundo-elevado`, `--borda`, `--dourado`,
  `--texto`, `--texto-fraco`, `--erro`) e `z-index: 1000` como os outros overlays.

## Validação de pasta ao escolher cofre

`inicializar()` cria `campanhas/` e `canvases-soltos/` em qualquer diretório, sem perguntar —
escolher a pasta errada hoje planta um cofre vazio dentro dela em silêncio.

Nova função `classificarPasta(caminho, fs)`, usando `path_exists` (`lib.rs:115`) e `list_dir`:

| Situação | Resultado | UI |
|---|---|---|
| Tem `campanhas/` ou `canvases-soltos/` ou `vinculos.json` | `'cofre'` | abre direto |
| Não existe, ou existe e está vazia | `'vazia'` | abre direto (cofre novo, comportamento atual) |
| Tem conteúdo, mas nenhum marcador de cofre | `'estranha'` | `ask()`: *"Esta pasta não parece um cofre do Grimório e já tem outros arquivos. Criar um cofre novo aqui mesmo assim?"* — cancelar aborta sem tocar no disco |

## Tratamento de erro / borda

- **Troca falhando no meio:** `abrirCofre` re-lança (`store.ts:181-183`). O `trocarCofre` captura,
  zera `vaultPath` e `repo`, e re-lança. `erroCofre` (setado por `abrirCofre`) sobrevive, a UI cai
  no `VaultPicker` com a mensagem (`VaultPicker.tsx:23`), e o cofre anterior **continua** na lista
  de recentes para você voltar em um clique.
- **Cofre recente cujo caminho sumiu** (pen drive, pasta movida, OneDrive descarregado):
  ao clicar, `classificarPasta` devolve `'vazia'` para caminho inexistente — antes de abrir,
  checar `path_exists`; se falso, `message()` avisa e oferece tirar da lista.
- **Trocar durante carregamento:** `abrirCofre` já tem guarda de reentrância (`store.ts:169`);
  desabilitar os botões de troca enquanto `carregando`.
- **Registro corrompido:** `cofres.listar()` com JSON inválido devolve `[]` e regrava limpo.
- **Nome de rótulo vazio:** `pedirTexto` já devolve `null` para vazio/whitespace
  (`dialogos.tsx:37`) → mantém o nome anterior.

## Testes

**`src/test/cofres.test.ts`** (vitest, `// @vitest-environment jsdom`)

- `registrar` insere novo, atualiza `ultimoAcesso` de existente sem duplicar, ordena desc
- `migrarDoLegado` semeia a partir de `grimorio.vault` e é idempotente
- `remover` tira da lista; `renomear` troca só o rótulo
- `listar` com JSON inválido → `[]`
- `chaveDeCofre` produz chaves distintas para cofres distintos

**`src/test/store.trocarCofre.test.ts`** (usando o `fakeFs` de `src/test/fakeFs.ts`)

- **O teste que mais importa:** agenda uma gravação debounced de personagem, chama `trocarCofre`
  imediatamente, e verifica que a escrita caiu no **caminho do cofre antigo** e que nada foi
  escrito no cofre novo
- após trocar, `personagens`, `cenarios`, `vinculos`, `tree` e `aberto` estão limpos
- `campanhaFiltro` do cofre A não vaza para o cofre B

Não há harness de UI automatizado no projeto — verificação do modal é manual.

## Critérios de verificação

1. `npm run build` (tsc + vite) sem erro; `npm test` verde.
2. Manual — ⚙️ aparece na sidebar, abre o modal, as 4 abas trocam, `Esc`/overlay/✕ fecham.
3. Manual — "Abrir outro cofre…" → escolher outra pasta com cofre → **a sidebar recarrega com o
   outro conteúdo sem reiniciar o app**, e o cofre anterior aparece em recentes.
4. Manual — voltar pelo item de recentes traz o cofre original de volta.
5. Manual (regressão crítica) — editar um personagem e, **antes de 800 ms**, trocar de cofre;
   reabrir o cofre original e confirmar que **a edição está lá** e que o cofre novo não ganhou
   um arquivo estranho.
6. Manual — filtro de campanha selecionado no cofre A; trocar para B; o filtro de B começa em
   "Todas" e voltar para A restaura a seleção de A.
7. Manual — escolher uma pasta qualquer com arquivos (ex.: `Downloads`) → aparece o aviso
   "não parece um cofre" → cancelar **não cria** `campanhas/` lá dentro.
8. Manual — tema continua funcionando pela aba Aparência; chave do Gemini pode ser trocada
   pela aba IA e a IA continua respondendo.

## Fora de escopo (v1)

- Abrir dois cofres ao mesmo tempo (janelas múltiplas).
- Mover/copiar cofre de lugar pelo app.
- Exportar/importar cofre em `.zip`.
- Sincronizar configurações entre máquinas — tema, chaves e recentes seguem por-máquina.
- Qualquer coisa de nuvem: a aba Nuvem é só um placeholder aqui (spec C).
