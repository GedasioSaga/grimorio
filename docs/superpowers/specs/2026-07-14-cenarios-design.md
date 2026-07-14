# Categoria Cenário — hierarquia recursiva — Design

**Data:** 2026-07-14
**Branch:** feature/grimorio-v1
**Status:** Aprovado (aguardando revisão do spec)

## Objetivo

Nova categoria **Cenário** no Grimório: locais do mundo (cidade, bairro, casa)
com hierarquia recursiva — cenário contém sub-cenários em profundidade livre —
mais vínculo de personagens, organizável em pastas, com card no canvas.

Entrega em **duas fases**:

1. **Fase 1 (este spec, plano imediato):** modelo de dados, persistência,
   seção na sidebar (pastas + árvore), `CenarioModal` com abas, vínculo de
   personagens, `CenarioCardShape` no canvas.
2. **Fase 2 (plano futuro):** drill-down — cada cenário pode ter um canvas/mapa
   próprio (`mapa.json`), navegável a partir do card/modal. Documentada aqui só
   em escopo, para a fase 1 não gerar retrabalho.

## Decisões de design (validadas com o usuário)

- **Navegação:** modal com abas (como personagem) **e** futuramente mapa próprio
  por cenário. Fase 1 = modal; fase 2 = drill-down.
- **Escopo v1:** eventos e itens **não** viram entidades — são abas de texto
  rico dentro do cenário. Personagens são vínculos reais (ids).
- **Pastas + hierarquia:** os dois mecanismos coexistem. Pasta organiza
  (sem semântica de lugar); cenário contém (semântica de lugar).
- **Sidebar:** só seção global "Cenários" (abaixo de Personagens). Nada de
  cenários por campanha na v1.
- **Persistência:** diretórios recursivos no disco (não `paiId` lógico).
  Um mecanismo só; mover pai leva filhos junto; espelha `montarArvorePastas`.

## Estado atual (moldes a espelhar)

- `Personagem` + `PastaNode`/`ItemRef`/`VaultTree` em `src/lib/types.ts`.
- `VaultRepo` (`src/lib/vaultRepo.ts`): fila por caminho, `normalizarPersonagem`
  (migração lazy), `montarArvorePastas` (recursivo), slug único, refs estáveis
  (renomear muda só o campo `nome`).
- Store Zustand (`src/state/store.ts`): cache `personagens` por id,
  `caminhoPorId`, `salvarPersonagemParcial` (otimista + debounce 800ms com
  timers em nível de módulo), `perfilAbertoId`.
- Sidebar: `PersonagensSoltos.tsx` (árvore recursiva de pastas, drag-drop com
  MIME `application/x-grimorio-personagem`, botões por hover, prompts nativos).
- Modal: `PerfilModal.tsx` (header + abas em array `ABAS`, só aba ativa montada,
  autosave no nível do modal, flush no fechar/unmount) + `EditorTexto` +
  `GaleriaPersonagem`.
- Canvas: `CharacterCardShape.tsx` (`BaseBoxShapeUtil`, augmentation de
  `TLGlobalShapePropsMap`, migrations, duplo-clique alterna descrição, espaço
  abre perfil) + drop no `CanvasView.onDropCapture`.
- Backend Rust: 8 comandos de fs em `src-tauri/src/lib.rs`.

## Modelo de dados (`types.ts`)

```ts
export interface Cenario {
  id: string
  nome: string
  retrato: string | null        // rel ao cofre, em imagens-cenarios/
  resumo: string
  descricao: string             // HTML TipTap
  informacao: string            // HTML (caixa do card no canvas)
  historia: string              // HTML
  eventos: string               // HTML — v1 texto; entidade própria no futuro
  itens: string                 // HTML — idem
  anotacoes: string             // HTML
  imagens: ImagemPersonagem[]   // reusa o tipo {rel, legenda}
  personagens: string[]         // ids vinculados (N:N)
  criadoEm: string              // ISO-8601
  modificadoEm: string
}

export interface CenarioRef {
  id: string
  slug: string
  nome: string
  caminho: string               // dir do cenário, rel ao cofre
  erro?: string
}

export interface CenarioNode extends CenarioRef {
  filhos: CenarioNode[]
}

export interface PastaCenarioNode {
  slug: string
  nome: string
  caminho: string
  subpastas: PastaCenarioNode[]
  cenarios: CenarioNode[]
}
```

- `VaultTree` ganha `cenarios: PastaCenarioNode` (raiz da seção; a raiz é
  tratada como pasta sem nome).
- Regra estrutural: pasta contém pastas + cenários; **cenário contém só
  cenários** (sem pasta dentro de cenário).
- Vínculo N:N: o mesmo personagem pode estar em vários cenários. Não há
  restrição de "um lugar por vez".
- Sem campo de canvas no JSON — a fase 2 usa convenção `<dir>/mapa.json`.

## Disco

```
cenarios/
  reino-do-norte/            <- pasta organizacional (pasta.json — reusa formato)
    cidade-alta/             <- cenário (cenario.json)
      bairro-porto/          <- sub-cenário (cenario.json)
        casa-do-ferreiro/
          cenario.json
imagens-cenarios/            <- retratos + galeria (central e estável:
                                mover cenário nunca quebra `rel`)
```

- Diretório é **pasta** se tem `pasta.json`, **cenário** se tem `cenario.json`.
- Slug do diretório é imutável (como personagem): renomear muda só `nome` no
  JSON; refs por caminho seguem válidas. Mover muda o caminho — a árvore e o
  índice `caminhoCenarioPorId` são recarregados após a operação.
- Imagens **não** moram dentro do dir do cenário de propósito: `rel` aponta
  para `imagens-cenarios/`, então mover/renomear cenário não quebra imagem.

## Persistência (`VaultRepo` — métodos novos)

- `criarCenarioEm(dirPai: string, nome: string): Promise<CenarioRef>` — slug
  único no nível, cria dir + `cenario.json` completo (campos texto `''`,
  `imagens: []`, `personagens: []`).
- `criarPastaCenarios` — reusa `criarPasta` existente (mesmo `pasta.json`).
- `lerCenario(caminho): Promise<Cenario>` — `JSON.parse` + `normalizarCenario`.
- `salvarCenario(caminho, c): Promise<void>` — na fila, injeta `modificadoEm`,
  não muta o objeto.
- `normalizarCenario(raw): Cenario` — defaults para todo campo faltando
  (mesmo padrão de migração lazy de `normalizarPersonagem`).
- `renomearCenario(caminho, novoNome)` — só campo `nome`.
- `moverCenario(dirOrigem: string, dirDestinoPai: string): Promise<void>` —
  guardas: (a) destino não pode ser a própria origem nem descendente dela
  (checagem de prefixo de caminho); (b) no-op se o pai destino é o atual.
  Implementado com `rename_path` (abaixo).
- `excluirCenario(dir): Promise<void>` — `remove_path` recursivo (sub-cenários
  juntos).
- `montarArvoreCenarios(): Promise<PastaCenarioNode>` — recursão a partir de
  `cenarios/`, distinguindo pelo arquivo-marcador; lê `id` + `nome` de cada
  `cenario.json`; JSON inválido vira ref com `erro`.

**Backend Rust (única mudança):** novo comando `rename_path(origem, destino)`
usando `std::fs::rename` — move diretório inteiro atomicamente no mesmo volume.
Copy+delete recursivo em TS seria lento e arriscado no OneDrive.

## Store (`store.ts`)

Espelha personagens 1:1:

- `cenarios: Record<string, Cenario>` — cache por id.
- `caminhoCenarioPorId: Record<string, string>`.
- `carregarCenarios()` — percorre a árvore recursivamente, lê cada ref;
  chamado em `abrirCofre` e após mutações estruturais (criar/mover/excluir).
- `salvarCenarioParcial(id, mudancas)` — merge otimista + debounce 800ms
  (timers em nível de módulo, como personagem).
- `cenarioAbertoId: string | null` + `abrirCenario(id)` / `fecharCenario()`.
- `CenarioModal` montado em `App.tsx` quando `cenarioAbertoId` setado
  (padrão do `PerfilModal`).

## Sidebar — `CenariosSoltos.tsx` (novo)

Copy-adapt de `PersonagensSoltos.tsx`, seção "Cenários" abaixo de Personagens:

- `PastaCenarioLinha` (recursiva): expand/collapse, indentação por nível,
  botões hover — nova pasta, novo cenário, ✎ renomear, 🗑 excluir.
- `CenarioLinha` (recursiva): expandir mostra **sub-cenários + personagens
  vinculados** (folhas; clique no personagem abre o perfil dele). Botões
  hover: novo sub-cenário, ✎, 🗑. Clique no cenário abre `CenarioModal`.
- Prompts nativos (`prompt`/`confirm`) como no resto da sidebar.

Drag-drop:

| Arrasto | Solta em | Efeito |
|---|---|---|
| cenário | pasta / raiz | `moverCenario` (filhos vão junto) |
| cenário | outro cenário | vira sub-cenário (guarda anti-descendente; drop inválido ignorado) |
| personagem (MIME existente) | cenário | vincula (adiciona id em `personagens[]`, dedupe) |
| cenário | canvas | cria card (MIME novo `application/x-grimorio-cenario` com o id) |

## `CenarioModal.tsx` (novo)

Copy-adapt de `PerfilModal`: header (retrato clicável / nome / resumo) +
barra de abas + autosave debounced 800ms no nível do modal + flush no
fechar/unmount. Só a aba ativa é montada.

| Aba | Conteúdo |
|---|---|
| Descrição | `EditorTexto` |
| Conteúdo | lista de sub-cenários (clique navega para o filho no próprio modal) + chips de personagens vinculados (clique abre perfil; × desvincula) + botão "+ Vincular personagem" com busca por nome no cache |
| Informações | `EditorTexto` |
| História | `EditorTexto` |
| Eventos | `EditorTexto` |
| Itens | `EditorTexto` |
| Imagens | `GaleriaPersonagem` parametrizada para gravar em `imagens-cenarios/` |
| Anotações | `EditorTexto` |

- Retrato: mesmo fluxo do personagem (`open` + `copiarParaCofre`), destino
  `imagens-cenarios/retrato-<id>.<ext>`.
- Galeria: `imagens-cenarios/galeria-<uuid>.<ext>`. Se `GaleriaPersonagem`
  estiver acoplada ao personagem, extrair prop de destino/salvamento (ajuste
  pequeno, sem mudar comportamento do personagem).

## Canvas — fase 1

- `CenarioCardShape.tsx` (novo): tipo `'cenario-card'`, espelho de
  `CharacterCardShape` — `BaseBoxShapeUtil`, augmentation de
  `TLGlobalShapePropsMap`, props `{ w, h, cenarioId, expandido, infoExpandido,
  infoAoLado }`, migrations versionadas, `canEdit() = false`, duplo-clique
  alterna painel de descrição, espaço com card selecionado abre `CenarioModal`,
  "Cenário removido" quando o id não está no cache.
- `CanvasView.tsx`: aceita o MIME novo no `onDropCapture`; registra a shape em
  `shapeUtilsCustom` (nível de módulo).
- Edição inline no card grava via `salvarCenarioParcial` (padrão do personagem).

## Fase 2 — drill-down (escopo, sem plano ainda)

- `<dir-do-cenário>/mapa.json` (`CanvasDoc`) criado lazy no primeiro acesso.
- Botão "Abrir mapa" no modal e no card → abre no workspace como canvas normal
  (`aberto: { tipo: 'canvas', ... }`); notas laterais `.notas` funcionam de
  graça (`dirNotasDoMapa`).
- Breadcrumb do caminho do cenário no topo do workspace.
- Duplo-clique no card continua alternando descrição (fase 1); a entrada no
  mapa é pelo botão — sem conflito de gesto.
- `montarArvoreCenarios` ignora `mapa.json` e dirs `.notas` desde a fase 1.

## Erros / bordas

- **Personagem excluído:** id órfão em `personagens[]` é filtrado na
  renderização (não destrutivo; nada é reescrito no disco).
- **Excluir cenário com filhos:** `confirm()` avisando que N sub-cenários vão
  junto.
- **Card de cenário excluído no canvas:** "Cenário removido" (padrão
  existente do personagem).
- **Mover para si mesmo / descendente:** guarda no repo + drop ignorado na UI.
- **`cenario.json` corrompido:** ref com `erro`, linha renderiza com aviso;
  filhos ainda são varridos.
- **Nome duplicado no nível:** slug com sufixo único (padrão existente).
- **Cofre sem `cenarios/`:** `montarArvoreCenarios` retorna raiz vazia;
  dir criado sob demanda na primeira criação (`mkdir_all`).

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `src/lib/types.ts` | `Cenario`, `CenarioRef`, `CenarioNode`, `PastaCenarioNode`; `VaultTree.cenarios` |
| `src/lib/vaultRepo.ts` | métodos de cenário + `normalizarCenario` + `montarArvoreCenarios` |
| `src/lib/fsBridge.ts` | expõe `renamePath` |
| `src-tauri/src/lib.rs` | comando `rename_path` |
| `src/state/store.ts` | cache/índice de cenários, `carregarCenarios`, `salvarCenarioParcial` de cenário, `cenarioAbertoId` |
| `src/components/CenariosSoltos.tsx` (novo) | seção da sidebar com pastas + árvore recursiva |
| `src/components/Sidebar.tsx` | monta `CenariosSoltos` |
| `src/components/CenarioModal.tsx` (novo) | modal com abas + aba Conteúdo |
| `src/components/GaleriaPersonagem.tsx` | parametrizar destino (se necessário) |
| `src/components/CenarioCardShape.tsx` (novo) | shape do card no canvas |
| `src/components/CanvasView.tsx` | MIME novo + registro da shape |
| `src/App.tsx` | monta `CenarioModal` |
| `src/theme.css` | estilos da seção/modal/card |
| `src/test/fakeFs.ts` | suporte a `rename` (move de prefixo no Map) |

## Testes (TDD, vitest + fakeFs)

- `cenarioRepo.test.ts`: criar (shape completo, slug único), ler+normalizar,
  salvar (fila, `modificadoEm`), árvore mista pastas+cenários em profundidade,
  mover (reparent, guarda anti-descendente, no-op mesmo-dir, filhos preservados),
  excluir recursivo, JSON corrompido vira `erro`, raiz ausente vira raiz vazia.
- `normalizarCenario.test.ts`: defaults para todo campo; JSON antigo sem campos
  novos sobe de versão; formato novo passa intocado.
- Vínculo (lógica pura): adicionar id com dedupe, desvincular, filtro de ids
  órfãos.
- `fakeFs.rename`: move arquivo e subárvore de prefixos.
- UI com IO Tauri: validação manual no app (padrão do projeto).

## Fora de escopo (YAGNI)

- Entidades Evento e Item (v1 é texto).
- Cenários por campanha na sidebar.
- Drill-down / `mapa.json` (fase 2).
- Reordenação manual de sub-cenários (ordem alfabética do fs).
- Backlink "em quais cenários este personagem está" no perfil do personagem.
- Mover personagem *para dentro* do dir do cenário (personagem continua
  morando onde mora; cenário só referencia).

## Critérios de verificação

- Criar pasta "Reino" → cenário "Cidade" → sub "Bairro" → sub "Casa";
  reabrir o app → árvore íntegra.
- Arrastar "Bairro" para a raiz → vira cenário raiz com "Casa" junto;
  arrastar de volta para "Cidade" → reaninha. Arrastar "Cidade" para dentro
  de "Casa" → nada acontece.
- Arrastar personagem da sidebar sobre "Bairro" → aparece como folha sob o
  cenário e como chip na aba Conteúdo; × desvincula sem excluir o personagem.
- Excluir personagem vinculado → some das listas do cenário sem erro.
- Escrever nas 6 abas de texto + adicionar imagens → fechar/reabrir → tudo
  persistido; `cenario.json` legível no disco.
- Arrastar cenário para um canvas → card com retrato/nome/resumo; espaço abre
  o modal; excluir o cenário → card mostra "Cenário removido".
- `npm test` verde; `tsc` sem erros nos arquivos tocados.
