# Campanha ao criar pasta — Design

**Data:** 2026-07-26
**Status:** Aprovado — pronto para plano de implementação
**Spec B de 3** — independente do spec A (`2026-07-26-opcoes-e-trocar-cofre-design.md`);
pode ser implementado em paralelo.

## Objetivo

Criar uma pasta hoje só pergunta o nome. Personagem, cenário e canvas perguntam a campanha
(`associarNaCriacao`), mas pasta não — porque pasta não tem `id`, e campanha é associada por
vínculo, que exige id nas duas pontas.

Dar `id` à pasta, perguntar a campanha na criação, e usar isso em duas frentes:
**filtro** (pasta da campanha X aparece sob o filtro X, mesmo vazia) e
**herança** (item criado dentro dela nasce na campanha da pasta, sem perguntar de novo).

## Decisões travadas (brainstorming 2026-07-26)

| Tema | Decisão |
|------|---------|
| Efeito da campanha na pasta | **Filtro + herança**, os dois. |
| Herança | **Sugestão silenciosa, não trava.** O 🏷️ continua podendo mudar a campanha do item depois. |
| Pastas antigas | **Comportamento atual preservado** — pasta sem campanha continua sendo podada quando esvazia. |
| Migração | **Preguiçosa.** Pasta antiga só ganha `id` quando você atribui campanha a ela. Nenhuma gravação durante a varredura da árvore. |

## Contexto do código (já existe — reusar)

**O que é campanha**
- Tipo `Campanha` — `src/lib/types.ts:75-81`. No disco: `campanhas/<slug>/campanha.json`,
  criado em `src/lib/vaultRepo.ts:137-147`. **Identidade é o `id` (UUID), não o slug.**

**Como entidade vira membro de campanha**
- Vínculo com `paraTipo: 'campanha'` e `tipo === TIPO_PARTICIPA` (`src/lib/vinculos.ts:4`),
  guardado em `vinculos.json` na raiz do cofre (I/O em `vaultRepo.ts:442-454`).
- Tipo `Vinculo` — `types.ts:56-65`; domínio de `deTipo` — `types.ts:53`.
- Consultas: `campanhasDe` (`vinculos.ts:56-60`), `idsDaCampanha` (`vinculos.ts:63-69`),
  `participacaoDe` (`vinculos.ts:72-76`).
- **Validação de leitura:** `normalizarVinculos` — `vinculos.ts:83-109`. A whitelist de `deTipo`
  está em `vinculos.ts:94` e a de `paraTipo` em `vinculos.ts:96`. Entrada fora do domínio é
  **descartada em silêncio** — é por isso que a ordem de release importa (ver "Retrocompatibilidade").
- Mutações no store: `definirCampanhas` (`src/state/store.ts:412-431`),
  `alternarParticipacao` (`store.ts:393-404`), gravação debounced (`store.ts:140-149`).

**O padrão de 4 passos que a criação de entidade usa**
1. `pedirTexto('Nome do X:')` — `src/components/dialogos.tsx:42-44`
2. `repo.criarXEm(dir, nome)` → devolve ref **com `id`**
3. `await associarNaCriacao(tipo, ref.id, nome)` — `src/components/dialogoCampanhas.tsx:63-73`
4. `await aoMudar()`

`associarNaCriacao` hoje: filtro de campanha ativo → aplica em silêncio (`dialogoCampanhas.tsx:65-68`);
senão lista as campanhas do cofre (`opcoesDoCofre`, `:52-56`); **zero campanhas → não pergunta nada**
(`:70`); senão abre o multi-seletor (`:71`); `null` = cancelou → não mexe (`:72`).
Edição posterior: `editarCampanhas` (`:76-82`), botão 🏷️.

**Criação de pasta (o que muda)**
- `VaultRepo.criarPasta(dirPai, nome): Promise<string>` — `vaultRepo.ts:180-190`.
  Grava exatamente `{ nome, criadoEm }` em `pasta.json` (`vaultRepo.ts:188`) e devolve o caminho.
  **Único ponto do código que escreve `pasta.json`.**
- 4 chamadores, todos com `pedirTexto` e **nenhum** com `associarNaCriacao`:
  `src/components/PersonagensSoltos.tsx:47-51` (raiz) e `:94-106` (subpasta);
  `src/components/CenariosSoltos.tsx:67-71` (raiz) e `:114-126` (subpasta).
- Renomear pasta: `renomearItem` (`vaultRepo.ts:277-284`) faz read-modify-write —
  **preserva campos desconhecidos, logo preserva o `id` de graça.**
- Excluir pasta: `excluirItem` (`vaultRepo.ts:286-290`) → `remove_path` recursivo (`src-tauri/src/lib.rs:76-84`).
- Leitura do nome na árvore: `vaultRepo.ts:534-539` (personagens) e `vaultRepo.ts:396-401` (cenários).
  `pasta.json` é excluído da listagem de itens em `vaultRepo.ts:523`.
- Montagem dos nós: `montarArvorePastas` (`vaultRepo.ts:511`), `montarArvoreCenarios` (`vaultRepo.ts:378`).

**Filtro** — `src/lib/filtroCampanha.ts` (arquivo inteiro, 63 linhas)
- `filtrarPastaPersonagens(pasta, caminhosPermitidos)` (`:10-16`) — poda subpasta vazia em `:14`
- `filtrarArvoreCenarios(raiz, ids)` (`:34-40`) — cenário permitido arrasta a **subárvore inteira**
  (`filtrarCenarios`, `:23-31`, parâmetro `herdado`); poda em `:38`
- `filtrarCanvasesSoltos` (`:46-48`) — **canvas sem id fica visível**: "filtro não esconde arquivo
  que não sabe classificar". Esse princípio é reusado abaixo.
- Contagens para o aviso "N ocultos": `:51-62`
- Orquestração na sidebar: `src/components/Sidebar.tsx:74-89`

**Testes existentes:** `src/test/filtroCampanha.test.ts`, `src/test/dialogoCampanhas.test.ts`,
`src/test/vinculos.test.ts`, `src/test/vaultRepo.test.ts:205-230` (cobre `criarPasta`/`pasta.json`).

## Arquitetura

### Formato de `pasta.json`

```json
{ "nome": "NPCs da Taverna", "criadoEm": "…", "id": "<uuid>", "modificadoEm": "…" }
```

`id` é **opcional** no tipo. Ausente = pasta legada, sem campanha, comportamento de hoje.

### Arquivos alterados

**`src/lib/types.ts`**
- `TipoEntidadeVinculo` (`:53`) ganha `'pasta'`.
- `PastaNode` e `PastaCenarioNode` ganham `id?: string`.

**`src/lib/vinculos.ts`**
- `normalizarVinculos`: aceitar `'pasta'` em `deTipo` (`:94`). **Não** entra no `paraTipo` (`:96`) —
  pasta nunca é alvo de relação, exatamente como `canvas` já é tratado (comentário em `:95`).

**`src/lib/vaultRepo.ts`**
- `criarPasta` passa a gerar `id` (mesmo gerador de `criarPersonagemEm`/`criarCanvasDoc`) e a
  devolver `{ caminho: string; id: string }` em vez de `string`. Os 4 chamadores acompanham.
- `garantirIdDePasta(caminhoPastaJson): Promise<string>` — **novo**. Lê o `pasta.json`; se já tem
  `id`, devolve; senão gera, grava (dentro de `naFila`, read-modify-write como `renomearItem`) e
  devolve. É a migração preguiçosa: chamada só a partir do 🏷️ de uma pasta legada.
- `montarArvorePastas` (`:511`) e `montarArvoreCenarios` (`:378`) passam a ler `id` do `pasta.json`
  e a preencher o nó. **Leitura pura — nunca escreve.**
- `excluirItem` continua igual; a limpeza de vínculo é do store (abaixo).

**`src/lib/herancaCampanha.ts`** — **novo**, lógica pura e testável

```ts
export function campanhasHerdadas(
  dirPai: string,
  idPorDiretorio: Record<string, string>,   // "cenarios/masmorra" → id da pasta
  vinculos: Vinculo[],
): string[]
```

Sobe a cadeia de diretórios a partir de `dirPai` (`a/b/c` → `a/b` → `a`), e na **primeira** pasta
com `id` que tenha campanhas (`campanhasDe`), devolve essas campanhas. Nenhuma pasta com campanha
na cadeia → `[]`. Não acumula campanhas de vários níveis: vence a pasta mais próxima.

O mapa `idPorDiretorio` é derivado da árvore já carregada no store — nenhum I/O novo.

**`src/components/dialogoCampanhas.tsx`**
- `associarNaCriacao(tipo, id, nome, dirPai?)` — ordem de precedência:
  1. filtro de campanha ativo → aplica em silêncio (**comportamento atual, `:65-68`**)
  2. `dirPai` informado e `campanhasHerdadas(...)` não-vazio → aplica em silêncio
  3. resto igual ao de hoje (`:69-73`)
- `editarCampanhas` (`:76-82`) ganha o caso pasta: se a pasta não tem `id`, chama
  `garantirIdDePasta` antes de abrir o seletor.

**`src/components/PersonagensSoltos.tsx`** e **`src/components/CenariosSoltos.tsx`**
- Criação de pasta (`PersonagensSoltos.tsx:47-51,94-106` e `CenariosSoltos.tsx:67-71,114-126`)
  ganha o passo 3: `await associarNaCriacao('pasta', id, nome)`.
- Criação de personagem/cenário passa `dirPai` para `associarNaCriacao` (habilita a herança).
- Botão 🏷️ nas linhas de pasta, ao lado dos ✏️/🗑️ existentes — mesmo padrão dos itens
  (`PersonagensSoltos.tsx:187-189`, `CenariosSoltos.tsx:228-230`).
- Excluir pasta: depois do `excluirItem`, remover os vínculos da pasta (ver store).

**`src/state/store.ts`**
- `removerVinculosDe(id)` — **novo**: tira do `vinculos` todos os vínculos com `deId === id` e
  agenda a gravação. Usado ao excluir pasta, para não deixar vínculo órfão em `vinculos.json`.
  (Escopo: só a pasta excluída. Vínculo órfão de item apagado é dívida pré-existente e fica fora.)

**`src/lib/filtroCampanha.ts`** — a mudança de comportamento

```ts
filtrarPastaPersonagens(pasta, caminhosPermitidos, idsPermitidos, herdado = false)
filtrarArvoreCenarios(raiz, ids, herdado = false)
```

Regra, idêntica nas duas famílias e alinhada com a herança de subárvore que
`filtrarCenarios` (`:23-31`) já faz:

| Pasta | Comportamento |
|---|---|
| **com `id` e campanha que casa com o filtro** (ou herdou do pai) | subárvore inteira visível, **inclusive se estiver vazia** |
| **com `id` e campanha que não casa** | cai na regra de hoje — o conteúdo dela que casar continua aparecendo |
| **sem `id`** (legada) | regra de hoje, sem alteração |

O segundo caso é deliberado: pasta marcada "Campanha B" contendo um personagem marcado
"Campanha A" continua mostrando esse personagem sob o filtro A. Esconder seria contrariar o
princípio já escrito em `filtroCampanha.ts:43-45` — o filtro não esconde o que sabe classificar.

**`src/components/Sidebar.tsx`**
- `:74-89` passa `idsFiltro` também para as duas funções de pasta.
- As contagens de "N ocultos" (`:83-84,88`) continuam válidas: contam itens, não pastas.

## Retrocompatibilidade e ordem de release

**Ponto de atenção:** `normalizarVinculos` **descarta** vínculo com `deTipo` fora da whitelist
(`vinculos.ts:94`). Uma versão antiga do Grimório abrindo um cofre que já tem vínculos de pasta
apaga esses vínculos na próxima gravação de `vinculos.json` — as campanhas das pastas somem.

Isso só machuca quem roda versões diferentes contra o mesmo cofre (o que fica comum com o spec C).
Mitigação: **soltar esta versão antes de ligar o sync**, e o spec C registrar uma versão mínima
de cofre no manifesto.

Cofre antigo aberto na versão nova: nenhuma pasta tem `id`, nenhuma tem campanha, tudo se comporta
como hoje. Nenhuma migração é executada na abertura.

## Tratamento de erro / borda

- **Pasta legada + 🏷️:** `garantirIdDePasta` grava o `id` antes de abrir o seletor. Se a gravação
  falhar, aborta com `message()` e não abre o seletor (evita vínculo apontando para id inexistente).
- **Cofre sem campanha nenhuma:** `associarNaCriacao` já não pergunta nada (`dialogoCampanhas.tsx:70`) —
  pasta nasce sem campanha, comportamento de hoje.
- **Cancelar o seletor:** devolve `null` → pasta criada sem campanha (`:72`). A pasta **não** é
  desfeita; é o mesmo contrato de personagem/cenário hoje.
- **`pasta.json` corrompido:** a leitura da árvore já trata (`vaultRepo.ts:530`, `:417`) — nó sem
  `id`, tratado como pasta legada.
- **Herança com filtro ativo ao mesmo tempo:** filtro ganha. É o caso de "estou trabalhando na
  campanha X" e vale mais que a marcação da pasta.
- **Pasta movida para dentro de outra:** não existe mover pasta no app hoje. Fora de escopo.

## Testes

**`src/test/herancaCampanha.test.ts`** — novo
- devolve as campanhas da pasta mais próxima com campanha
- pula pasta sem `id` e pasta com `id` mas sem campanha, continuando a subir
- cadeia sem nenhuma pasta com campanha → `[]`
- não acumula campanhas de dois níveis diferentes

**`src/test/filtroCampanha.test.ts`** — estender
- pasta **vazia** com campanha que casa → **aparece** (é a mudança de comportamento central)
- pasta com campanha que casa → todos os filhos aparecem, mesmo os não etiquetados
- pasta com campanha que **não** casa, contendo item que casa → item continua aparecendo
- pasta sem `id` → todos os casos de hoje continuam passando sem alteração

**`src/test/vinculos.test.ts`** — estender
- `deTipo: 'pasta'` sobrevive a `normalizarVinculos`
- `paraTipo: 'pasta'` continua sendo descartado

**`src/test/vaultRepo.test.ts`** — estender (o teste de `criarPasta` está em `:205-230`)
- `criarPasta` devolve `{caminho, id}` e grava o `id` no `pasta.json`
- `renomearItem` sobre `pasta.json` **preserva o `id`**
- `garantirIdDePasta`: gera e grava uma vez; segunda chamada devolve o mesmo id sem regravar

**`src/test/dialogoCampanhas.test.ts`** — estender
- ordem de precedência: filtro > herança > perguntar
- com `dirPai` herdando, **não** abre o seletor

## Critérios de verificação

1. `npm run build` sem erro; `npm test` verde.
2. Manual — criar pasta em Personagens com uma campanha selecionável: **pergunta a campanha**.
3. Manual — filtrar por essa campanha: a **pasta vazia aparece**. Filtrar por outra: some.
4. Manual — criar personagem dentro dessa pasta com o filtro em "Todas": **não pergunta campanha**,
   e o 🏷️ do personagem mostra a campanha herdada já marcada.
5. Manual — mudar a campanha desse personagem pelo 🏷️: aceita (herança sugere, não trava).
6. Manual — 🏷️ numa pasta criada **antes** desta versão: funciona, e o `pasta.json` dela passa a
   ter `id` só a partir desse clique.
7. Manual — abrir um cofre antigo e não mexer em nada: sidebar, filtro e podas idênticos ao de antes.
8. Manual — excluir pasta com campanha: some da sidebar e `vinculos.json` não fica com órfão dela.

## Risco estrutural — etiquetar uma raiz desliga o filtro da seção inteira

`filtrarPastaPersonagens` e `filtrarArvoreCenarios` funcionam assim: pasta permitida devolve
`{ ...pasta, subpastas: recursão com herdado = true }`. Se a **raiz** (`personagens-soltos` ou
`cenarios`) alguma vez for considerada permitida, todos os itens dela passam pelo spread e todos os
descendentes recursam com `herdado = true` — ou seja, **a seção inteira deixa de ser filtrada**,
silenciosamente.

Hoje isso não acontece, mas a proteção é **incidental, não estrutural**: as raízes simplesmente não
têm `pasta.json` próprio, logo não têm `id`, logo `permitida` é sempre falsa nelas. Nada no código
impede que uma raiz ganhe id.

**Regra a manter:** o botão 🏷️ vive na linha de cada subpasta (`PastaLinha` / `PastaCenarioLinha`),
**nunca** no cabeçalho de seção de `PersonagensSoltos` / `CenariosSoltos`. Enquanto isso valer, uma
raiz não tem caminho para ganhar id pela UI.

**Se um dia precisar mudar:** adicionar guarda explícita no filtro em vez de confiar na ausência de
`pasta.json` — por exemplo, recusar `permitida` quando `pasta.caminho` não contém `/` (as raízes são
os únicos nós de primeiro nível).

## Dívida registrada — `paraTipo` só é garantido em runtime

`Vinculo.paraTipo` é `TipoEntidadeVinculo | 'campanha'`, então widening a união para incluir
`'pasta'` também torna `paraTipo: 'pasta'` **legal no tipo**, mesmo sendo descartado por
`normalizarVinculos`. Isso não é novo: `'canvas'` já vivia assim. Mas com `'pasta'` passam a ser
dois dos quatro membros nessa situação — a regra de três está a um passo.

**Correção quando alguém encostar nisso:** separar `ParaTipoRelacao = 'personagem' | 'cenario'` e
declarar `Vinculo.paraTipo: ParaTipoRelacao | 'campanha'`, deixando o compilador garantir o que
hoje é uma cadeia de `!==` mantida à mão. Toca `types.ts` e provavelmente `AbaVinculos.tsx`, cujo
`Alvo.tipo` é `TipoEntidadeVinculo` e é repassado como `paraTipo`.

**Por que não foi feito nesta spec:** nenhuma task aqui constrói vínculo com `paraTipo` variável —
`definirCampanhas` usa o literal `'campanha'`. O buraco existe mas não é alcançável pelo código
que esta spec escreve, e a correção sairia do escopo dela (`AbaVinculos.tsx` não é tocado por
nenhuma task).

**Modo de falha relacionado, também registrado:** `normalizarVinculos` descarta entrada inválida
**sem log nenhum** (`vaultRepo.ts` `lerVinculos`), e `agendarSalvarVinculos` persiste a lista já
filtrada 800 ms depois de qualquer edição de vínculo. Ou seja: um build antigo do Grimório abrindo
um cofre com vínculos de pasta apaga a campanha de todas as pastas de forma permanente, na
primeira edição de vínculo que o usuário fizer — sem aviso e sem recuperação dentro do app. É o
que torna a ordem de release acima obrigatória, e não apenas recomendada.

## Fora de escopo (v1)

- Campanha em caderno/página (`Pagina`, `types.ts:143-151`, não tem campo de campanha).
- Mover pasta entre diretórios.
- Herança acumulativa por vários níveis.
- Campanha própria para as pastas fixas de dentro de `campanhas/<slug>/` — lá o pertencimento
  já é por caminho.
- Reparo em massa de vínculos órfãos pré-existentes.
