# Vínculos & Mundos por Campanha — Design

Data: 2026-07-15
Branch: `feature/grimorio-v1`

## Contexto

O usuário tem vários RPGs (campanhas), cada um com seus personagens e cenários.
Hoje: cenários são globais (`cenarios/` na raiz do cofre), personagens podem ser
de campanha (`campanhas/<slug>/personagens/`) ou soltos (`personagens-soltos/`).
Só existe um vínculo estruturado: `Cenario.personagens` (elenco N:N do cenário).

Este design adiciona: (a) **relações tipadas** entre personagens e cenários
("conhece", "mora em"…), (b) **participação N:N em campanhas** sem mover arquivo,
(c) **filtro por campanha** na sidebar, (d) **setas rotuladas** no canvas.

É o Subsistema 1 de dois. O Subsistema 2 (assistente IA Gemini — chat na sessão +
botões nos modais) vira spec próprio depois e usará estes vínculos como contexto.

### Decisões confirmadas com o usuário

1. Ordem: Vínculos/mundos **antes** da IA.
2. Vínculos = aba nos modais + setas automáticas rotuladas no canvas (visão
   "Teia"/grafo fica pra fase 2).
3. Mundos = vínculo N:N entidade↔campanha (nada de mover arquivos; um personagem
   pode participar de vários RPGs). Sidebar filtra por campanha.

## Modelo de dados

Novo tipo em `src/lib/types.ts`:

```ts
export interface Vinculo {
  id: string                                  // uuid
  deTipo: 'personagem' | 'cenario'
  deId: string
  paraTipo: 'personagem' | 'cenario' | 'campanha'
  paraId: string
  tipo: string      // 'conhece', 'mora em', … ou texto livre
  notas: string     // anotação curta opcional ('' quando vazia)
  criadoEm: string  // ISO-8601
}
```

- **Relação** entre entidades: `deTipo/paraTipo` ∈ {personagem, cenario}.
- **Participação em campanha** usa o MESMO modelo: `paraTipo: 'campanha'`,
  `tipo: 'participa'` (constante `TIPO_PARTICIPA`). Um modelo só, um arquivo só.
- Tipos sugeridos no UI (dropdown com opção livre): conhece, aliado de, inimigo
  de, família de, mentor de, deve favor a, mora em, frequenta, protege, teme.
- Direção: o vínculo é armazenado uma vez (de → para) e exibido nas duas pontas.
- O elenco existente (`Cenario.personagens`, aba Personagens do CenarioModal)
  **não muda** — o novo sistema é aditivo.

### Identidade da campanha

Vínculos referenciam a campanha pelo **`id` do `campanha.json`** (estável a
rename). `CampanhaNode` ganha campo `id: string` (lido em `montarArvore`; se o
json estiver corrompido/sem id, o nó fica sem participação disponível — skip).

## Armazenamento

- Arquivo único **`vinculos.json`** na raiz do cofre: `{ vinculos: Vinculo[] }`.
- Ler: arquivo ausente/corrompido → lista vazia (padrão do app). Normalização
  descarta entradas sem `deId`/`paraId`/`tipo`.
- Gravar: `writeTextAtomic` via VaultRepo (serializado por caminho, como os demais).
- Órfãos (entidade/campanha apagada): **filtrados na exibição** contra os caches
  do store (padrão `personagensVivos` já usado). Sem varredura de limpeza.

## Lógica pura — `src/lib/vinculos.ts` (testada com vitest)

```ts
adicionarVinculo(lista, v): Vinculo[]          // dedupe por (deId, paraId, tipo); mesma lista se nada mudou
removerVinculo(lista, id): Vinculo[]
vinculosDaEntidade(lista, id): Vinculo[]       // deId === id || paraId === id (exclui participação)
campanhasDe(lista, entidadeId): string[]       // ids de campanha (tipo participa)
idsDaCampanha(lista, campanhaId): Set<string>  // entidades que participam
vinculosEntre(lista, aId, bId): Vinculo[]      // relações diretas entre o par (p/ setas)
alternarParticipacao(lista, entidade: {tipo, id}, campanhaId): Vinculo[]
```

Filtros de árvore (puros, testados) em `src/lib/filtroCampanha.ts`:

```ts
filtrarPastaPersonagens(pasta: PastaNode, ids: Set<string>): PastaNode
  // mantém personagens cujo id ∈ ids; poda subpastas vazias
filtrarArvoreCenarios(raiz: PastaCenarioNode, ids: Set<string>): PastaCenarioNode
  // mantém cenário se id ∈ ids OU tem descendente ∈ ids (ancestral fica p/ contexto);
  // poda pastas vazias
```

## Store (zustand)

- `vinculos: Vinculo[]` + `carregarVinculos()` (no `abrirCofre`).
- `adicionarVinculo(v)` / `removerVinculo(id)` / `alternarParticipacao(...)`:
  merge otimista + gravação debounced única do arquivo (um timer, não por id),
  fire-and-forget como os demais saves.
- `campanhaFiltro: string | null` + `setCampanhaFiltro(id)` — persistido em
  `localStorage('grimorio.campanhaFiltro')`; restaurado no boot; se a campanha
  não existe mais, volta a `null`.

## UI

### Aba "Vínculos" (PerfilModal e CenarioModal)

Componente compartilhado `AbaVinculos({ entidadeTipo, entidadeId })`:

- **Relações**: lista dos vínculos da entidade — cada linha mostra
  `tipo → Nome` (quando `deId` = entidade) ou `Nome → tipo` (quando é a ponta
  `para`), notas em fonte menor, botão ✕ remover. Form de adicionar: input com
  autocomplete (personagens + cenários dos caches, exclui a própria entidade,
  ícone diferencia tipo), select de tipo com sugestões + "outro…" (texto livre),
  campo de nota opcional.
- **Campanhas**: chips de todas as campanhas da árvore; clicar alterna
  participação (visual: chip preenchido = participa).

### Sidebar — filtro por campanha

- Seletor no topo da sidebar: **"Campanha: Todas ▾"** (select nativo estilizado,
  opções = campanhas da árvore).
- Com campanha selecionada: seção PERSONAGENS (soltos) e seção CENÁRIOS renderizam
  as árvores filtradas por `idsDaCampanha` (via helpers puros). Personagens DE
  campanha (dentro do nó da campanha) não são afetados — já pertencem ao RPG.
- "Todas" = comportamento atual (sem filtro).

### Canvas — setas rotuladas de relação

- Ao dropar card de **personagem** ou **cenário**: além das setas de hierarquia
  (já existentes para cenário), cria setas para cards presentes com relação
  direta (`vinculosEntre`). Rótulo da seta = `tipo` (múltiplas relações no mesmo
  par: uma seta só, tipos unidos por " · ").
- Direção: `de → para`. Guard de duplicata: `existeSetaEntre` (já existe — vale
  também entre hierarquia e relação: um par tem no máx. 1 seta automática).
- Generalizar `criarSetaHierarquia` → `criarSeta(editor, deShape, paraShape, rotulo?)`.
  Rótulo usa a prop de label do arrow do tldraw 4.5 (**confirmar na fase de plano**
  se é `text` ou `richText`/`toRichText`, no fonte instalado).
- Desconectar/reconectar: nativo (Delete / ferramenta de seta), igual F1.

## Casos de borda

- Autocomplete com 0 resultados → "nenhuma entidade encontrada".
- Vínculo duplicado (mesmo de/para/tipo) → não adiciona (dedupe silencioso).
- Entidade órfã num vínculo → linha não aparece (filtro contra caches).
- Filtro ativo + campanha apagada → seletor volta a "Todas".
- `vinculos.json` ausente (cofres antigos) → lista vazia, tudo funciona.
- Dropar card com vínculo consigo mesmo: impossível (form exclui a própria entidade).

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/lib/types.ts` | `Vinculo`, `CampanhaNode.id` |
| `src/lib/vinculos.ts` | **novo** — helpers puros |
| `src/lib/filtroCampanha.ts` | **novo** — filtros de árvore |
| `src/lib/vaultRepo.ts` | `lerVinculos`/`salvarVinculos` + `id` no nó da campanha |
| `src/state/store.ts` | estado/ações de vínculos + `campanhaFiltro` |
| `src/components/AbaVinculos.tsx` | **novo** — aba compartilhada |
| `src/components/PerfilModal.tsx` | + aba Vínculos |
| `src/components/CenarioModal.tsx` | + aba Vínculos |
| `src/components/Sidebar.tsx` (e/ou seções) | seletor de campanha + árvores filtradas |
| `src/components/CanvasView.tsx` | setas de relação no drop (generaliza `criarSeta`) |
| `src/theme.css` | estilos da aba, chips, seletor |

## Testes

- Puros: `vinculos.ts` (dedupe, filtros, participação, entre-par),
  `filtroCampanha.ts` (poda de pastas, ancestrais mantidos).
- `npm run build` + suíte completa.
- Manual: criar relação nos dois modais; alternar campanha; filtrar sidebar;
  dropar cards vinculados no canvas → seta rotulada; Delete não religa sozinho.

## Fora de escopo (YAGNI)

- Visão "Teia" (grafo auto-gerado da campanha) — fase 2.
- Regras/sistema por RPG — futuro.
- IA Gemini — Subsistema 2 (spec próprio).
- Converter `Cenario.personagens` pro novo modelo.

## Ordem de entrega

1. Modelo + repo + libs puras (`vinculos`, `filtroCampanha`) com testes
2. Store + aba Vínculos nos dois modais
3. Seletor + filtro na sidebar
4. Setas rotuladas no canvas
