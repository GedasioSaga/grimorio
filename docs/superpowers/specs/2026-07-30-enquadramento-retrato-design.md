# Enquadramento do retrato (ponto focal) — Design

**Data:** 2026-07-30
**Status:** Aprovado — pronto para implementação

## Objetivo

O retrato do cabeçalho do perfil é um círculo de 72px com `object-fit: cover` e posição
padrão (centro). Numa arte de corpo inteiro, o círculo pega o meio da imagem — o tronco e as
pernas, não o rosto. O autor precisa **escolher** que parte da imagem aparece.

## Decisões travadas (brainstorming 2026-07-30)

| Tema | Decisão |
|------|---------|
| Tipo de controle | **Ponto focal arrastável** num preview da imagem inteira, com atalhos Topo/Centro/Base. Não é recorte com zoom. |
| Onde vale | **Só o círculo do perfil** (`.perfil-retrato`), nos dois modais: personagem e cenário. O card do canvas fica intocado. |
| Padrão dos retratos antigos | **Centro** — nada muda sozinho. Sem heurística automática: o autor escolhe, um por um. |
| Como se chega | Botão **🎯 no canto do retrato**, visível no hover. Clique no resto do retrato continua trocando o arquivo. Abre sozinho depois de escolher uma imagem nova. |
| Granularidade do dado | **Por versão** — Hulk e Bruce Banner podem ter enquadramentos diferentes. |

## Contexto do código (já existe — cuidado)

- `.perfil-retrato` — `theme.css:251`; `img` com `object-fit: cover` em `:258`. 72×72, `border-radius: 50%`.
- `.char-card-retrato img` — `theme.css:190`, também `cover`. **Não muda.** O card já ajusta a
  altura ao aspecto da imagem (`alturaMoldadaAImagem`, `CharacterCardShape.tsx:196`), então corta pouco.
- `PerfilModal` — `trocarRetrato()` em `:116`, retrato renderizado em `:152`. `agendarSalvar(patch)`
  em `:87` (otimista no store + debounce de 800ms).
- `CenarioModal` — mesma estrutura: `trocarRetrato()` em `:130`, retrato em `:159`.
- `relRetratoDoCard` — `copiaImagemCard.ts:16`. O Ctrl+C copia o **arquivo original** por caminho,
  não um recorte renderizado. O foco não afeta a cópia, e é isso mesmo.
- **Armadilha 1:** `normalizarVersaoPersonagem` (`vaultRepo.ts:16`) e `normalizarVersaoCenario` (`:62`)
  reconstroem o objeto campo a campo. Campo não registrado ali **some no próximo carregamento**.
- **Armadilha 2:** `CHAVES_VERSAO_PERSONAGEM` (`personagemVersao.ts:4`) e `CHAVES_VERSAO`
  (`cenarioVersao.ts:4`) roteiam o patch. Campo fora dessas listas iria pro **topo** do JSON em
  vez da versão ativa — e o enquadramento deixaria de ser por versão.
- **Armadilha 3:** a migração legada (`vaultRepo.ts:41-46` e `:86-91`) faz spread explícito dos
  campos planos. Sem `foco` ali, um arquivo pré-versões perderia o enquadramento ao migrar.

## Dado

`types.ts`:

```ts
/** Ponto da imagem que fica no centro do enquadramento, em % (0–100). Ausente = centro. */
export interface FocoRetrato { x: number; y: number }
```

`VersaoPersonagem` e `VersaoCenario` ganham `foco?: FocoRetrato`.

Opcional de propósito: retrato sem `foco` renderiza como hoje (centro). Nenhuma migração,
nenhum arquivo reescrito, nenhum visual mexido sem o autor pedir.

## `src/lib/focoRetrato.ts` (puro, sem DOM)

```ts
export const FOCO_CENTRO: FocoRetrato = { x: 50, y: 50 }
export const PRESETS = { topo: {x:50,y:0}, centro: FOCO_CENTRO, base: {x:50,y:100} }

/** Aceita só número em 0–100 nos dois eixos; qualquer outra coisa vira undefined (= centro). */
export function normalizarFoco(raw: unknown): FocoRetrato | undefined

/** Valor de `object-position`: "50% 12%". */
export function posicaoCss(foco: FocoRetrato | undefined): string

/** Canto do quadrado de seleção (px do preview) → foco em %. */
export function focoDeCanto(largura: number, altura: number, lado: number, x: number, y: number): FocoRetrato

/** Foco → canto do quadrado de seleção (px do preview). Inverso de focoDeCanto. */
export function cantoDoFoco(largura: number, altura: number, lado: number, foco: FocoRetrato): { x: number; y: number }
```

**A matemática.** Com `cover` num quadro quadrado de lado `S`, a imagem é escalada até cobrir e
a sobra fica num eixo só. `object-position: X% Y%` desliza a imagem dentro dessa sobra: `0%`
encosta no começo, `100%` no fim. O preview espelha isso mostrando a imagem inteira com um
quadrado de lado `min(largura, altura)` por cima — o quadrado desliza na sobra, e a posição
dele dentro da sobra **é** a porcentagem.

Eixo sem sobra (imagem alta → sobra horizontal zero) devolve `50`: dividir por zero ali daria
`NaN`, e `object-position: NaN%` é regra inválida — o navegador descarta em silêncio e o
enquadramento inteiro para de funcionar sem erro nenhum aparecer.

## `src/components/EnquadrarRetrato.tsx`

Modal próprio (`.modal-overlay` + caixa), montado pelo modal de perfil quando aberto.

- Props: `{ src, aoSalvar(foco), aoFechar, focoInicial }`.
- Imagem inteira à vista (`max-width`/`max-height`, aspecto preservado).
- Por cima, um quadrado claro de lado `min(largura, altura)` marcando o que entra no círculo;
  fora dele, escurecido. Arrasta o quadrado com o mouse; preso às bordas.
- Botões **Topo / Centro / Base**.
- Prévia ao vivo: um círculo de 72px igual ao real, com o `object-position` do foco atual.
- **Salvar** grava; **Cancelar** e Escape descartam.
- O componente só mede o DOM e chama `focoDeCanto` / `cantoDoFoco`. Nenhuma conta mora aqui.

## Ligação nos modais

`PerfilModal` e `CenarioModal`, iguais nos dois:

- `.perfil-retrato` ganha um `<button className="perfil-retrato-enquadrar">🎯</button>`, escondido
  até o hover (`stopPropagation` no clique, senão abriria o seletor de arquivo junto).
  Só aparece quando existe retrato.
- Estado local `enquadrando: boolean`.
- `trocarRetrato()`: depois de copiar o arquivo, abre o enquadramento — a hora natural de ajustar.
- Salvar → `agendarSalvar({ foco, modificadoEm })`.
- `<img>` do retrato ganha `style={{ objectPosition: posicaoCss(va.foco) }}`.

## Testes

`src/test/focoRetrato.test.ts`
- `normalizarFoco`: objeto válido; fora de faixa; string; null; campo faltando; `NaN`.
- `posicaoCss`: `undefined` → `'50% 50%'`; foco → `'50% 12%'`.
- `focoDeCanto` ↔ `cantoDoFoco`: ida e volta bate.
- Eixo sem sobra devolve `50` em vez de `NaN` (imagem quadrada e imagem alta).
- Canto além da borda é preso em 0–100.

`src/test/normalizarPersonagem.test.ts` / `normalizarCenario.test.ts` (acrescentar)
- `foco` sobrevive ao round-trip; ausente continua `undefined`; valor corrompido vira `undefined`.
- Migração de arquivo plano legado preserva o `foco`.

`src/test/versoesPersonagemStore.test.ts` / `versoesStore.test.ts` (acrescentar)
- patch `{ foco }` cai na **versão ativa**, não no topo; outras versões não mudam.

## Verificação

- `npx tsc --noEmit`, `npx vitest run`
- Harness com o `theme.css` real: círculo de 72px com a mesma imagem alta em topo/centro/base,
  lado a lado, mais a janela de enquadrar.

### Ajustes que saíram da verificação visual

- **Ícone do botão: 🎯, não ✥.** No badge de 20px o `✥` vira um risquinho ambíguo. O 🎯 é o
  único legível nesse tamanho, e "alvo" descreve o ponto focal melhor que uma seta de resize.
- **A máscara redonda mudou de lugar.** `.perfil-retrato` tinha `overflow: hidden` + `border-radius: 50%`
  pra arredondar a imagem; isso cortaria o botão. O `border-radius: 50%` passou pra própria `img`
  e o container virou `overflow: visible`, então o badge escapa do círculo.

### O que NÃO foi verificado

O arraste em si. A matemática está coberta por teste (`focoDeCanto`/`cantoDoFoco`), mas a
ligação de `pointerdown`/`move`/`up` com `setPointerCapture` não roda em jsdom — sem layout,
`clientWidth` é 0, o quadro nunca aparece e o teste não diria nada. Precisa de olho no app real.

## O que NÃO muda

- Card do canvas (`.char-card-retrato`), inclusive o molda-à-imagem.
- Ctrl+C do card, que copia o arquivo original.
- Retratos existentes: sem `foco`, renderizam centralizados como hoje.
- Galeria de imagens da aba Imagens.
