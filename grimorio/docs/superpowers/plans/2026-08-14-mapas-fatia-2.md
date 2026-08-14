# Mapas — Fatia 2: paleta RPG + medidas + toolbar de mapa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O MapaView ganha o que faz dele um editor de MAPA: medidas em quadrados da grade, toolbar própria enxuta e paleta RPG (parede, porta, escada, janela) que cria formas já no estilo do mapa (traço branco, preenchimento preto, porta laranja).

**Architecture:** Lógica pura de medidas em `src/lib/quadrados.ts` (testável sem tldraw). UI de medidas como componente React em `components.InFrontOfTheCanvas` do tldraw (posicionado via conversão página→tela). Toolbar custom via `components.Toolbar`. Paleta = botões da toolbar que criam shapes NATIVOS pré-estilizados (geo/draw com estilos do tldraw) — `ShapeUtil` custom só se um elemento não for representável com estilo nativo (decisão por elemento, com verificação de API antes).

**Tech Stack:** tldraw v4.5.12 (verificar TODA API incerta em `node_modules/tldraw`/`@tldraw/*` `.d.ts` ou `npx ctx7@latest docs /tldraw/tldraw "<pergunta>"` — NUNCA chutar), React, vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-mapas-design.md` (seção "Fatia 2")

**Regras:** pt-BR estilo vizinhos; antes de cada commit `npx tsc --noEmit` + `rtk proxy npx vitest run` limpos (base: 937 PASS); nunca `--no-verify`. Trabalho no worktree `grimorio-mapas/grimorio`, branch `feature/mapas`.

---

### Task A: medidas em quadrados

**Files:**
- Create: `src/lib/quadrados.ts` — conversão/formato puros
- Test: `src/test/quadrados.test.ts`
- Create: `src/components/MedidasMapa.tsx` — overlay React
- Modify: `src/components/MapaView.tsx` — liga o overlay via `components`
- Modify: `src/theme.css` — estilo do rótulo de medida

**Parte pura (TDD):**

```ts
/** Converte px de página em quadrados da grade, com 1 casa quando não inteiro ("6" / "6,5"). */
export function emQuadrados(px: number, quadradoPx: number): string
/** "L×A" em quadrados ("6×4", "6,5×4"). */
export function medidaDeCaixa(wPx: number, hPx: number, quadradoPx: number): string
/** Distância entre bordas mais próximas de duas caixas {x,y,w,h}, em px; 0 se sobrepõem. */
export function distanciaEntreCaixas(a: Caixa, b: Caixa): number
```

Casos de teste mínimos: inteiro exato (192px/32 → "6"); meio quadrado (208/32 → "6,5"); arredondamento para 1 casa (0,25 → "0,3" — `toLocaleString('pt-BR')` ou formatação manual com vírgula); caixas sobrepostas → 0; lado a lado com folga → folga; diagonal → hipotenusa dos gaps.

**Overlay (`MedidasMapa.tsx`):** componente para `components={{ InFrontOfTheCanvas: MedidasMapa }}`. Comportamento:
- 1+ formas selecionadas: rótulo perto do canto inferior da seleção com `medidaDeCaixa(bounds.w, bounds.h, QUADRADO_PX)` (bounds = `editor.getSelectionPageBounds()`)
- exatamente 2 formas: rótulo adicional `⇄ N` com `distanciaEntreCaixas` das duas caixas (`editor.getShapePageBounds(shape)`) convertida por `emQuadrados`
- nada selecionado: null
- Reatividade e conversão página→tela: usar os hooks/métodos reais do tldraw (`useEditor` + `useValue`/`track`, `editor.pageToViewport` ou equivalente) — VERIFICAR nos `.d.ts`/ctx7 e citar no relatório o que usou
- `QUADRADO_PX` importado de `MapaView.tsx`

**Estilo:** `.mapa-medida` no theme.css — chip pequeno (fundo `var(--fundo)` translúcido, borda `var(--borda)`, texto `var(--texto)`, fonte 12px), `pointer-events: none`.

Commit: `feat(mapas): medidas em quadrados da grade (seleção e distância entre formas)`

---

### Task B: toolbar de mapa

**Files:**
- Create: `src/components/MapaToolbar.tsx`
- Modify: `src/components/MapaView.tsx` — `components={{ Toolbar: MapaToolbar, InFrontOfTheCanvas: MedidasMapa }}`
- Modify: `src/theme.css`

Toolbar horizontal própria substituindo a do tldraw, com botões que ativam ferramentas NATIVAS: selecionar, mão, caneta (draw), retângulo (geo/rectangle), elipse (geo/ellipse), linha, texto, borracha. Botão ativo destacado (ler ferramenta corrente de forma reativa). Mecânica: `editor.setCurrentTool(...)`; para variantes do geo, o estilo `GeoShapeGeoStyle` — VERIFICAR o mecanismo real (ctx7: "set current tool geo rectangle ellipse from custom toolbar") e citar no relatório. Atalhos de teclado do tldraw continuam valendo (não interceptar).

Estilo `.mapa-toolbar`: barra compacta sobre o canvas (posição tipo a do tldraw padrão), botões `btn-icon`-like, coerente com o tema escuro do app.

Commit: `feat(mapas): toolbar própria do editor de mapa`

---

### Task C: paleta RPG

**Files:**
- Create: `src/lib/paletaMapa.ts` — definição dos elementos (id, rótulo, ícone, como criar)
- Modify: `src/components/MapaToolbar.tsx` — grupo "paleta" na toolbar
- Test: `src/test/paletaMapa.test.ts` — para a parte pura (specs de shape geradas)

Elementos e forma de criação (clique no botão → próxima forma desenhada sai no estilo, OU um clique cria a forma no centro da viewport — escolher UMA mecânica e aplicar a todos; preferência: pré-estilizar a PRÓXIMA forma desenhada, que preserva o fluxo de desenho):
- **Parede**: geo rectangle, traço branco, preenchimento preto sólido
- **Porta**: geo rectangle pequeno, cor laranja, preenchimento sólido (o marcador laranja do desenho de referência do usuário)
- **Janela**: geo rectangle fino, traço azul claro
- **Escada**: se estilo nativo não representar degraus, criar N retângulos paralelos agrupados (ou um `draw` shape com o zigue-zague) — decidir com a API real na mão; NÃO criar ShapeUtil custom sem necessidade comprovada, e reportar a decisão

Mecânica de estilo: API de estilos do tldraw (`editor.setStyleForNextShapes(DefaultColorStyle, ...)` etc.) — VERIFICAR nomes reais (cores nativas disponíveis incluem 'white'? 'orange'? conferir `DefaultColorStyle` no `.d.ts`; se 'white' não existir, usar a mais próxima e reportar). A parte pura (`paletaMapa.ts`) descreve cada elemento como dados (`{ id, rotulo, ferramenta, estilos: {...} }`) para o teste validar sem tldraw.

Commit: `feat(mapas): paleta RPG (parede, porta, janela, escada)`

---

### Task D: verificação manual (usuário) — roteiro

1. Abrir mapa → toolbar nova aparece; alternar ferramentas funciona; atalhos do tldraw seguem valendo
2. Desenhar retângulo → medida "L×A" aparece e atualiza ao redimensionar; 2 formas selecionadas → distância
3. Paleta: parede sai preta com traço branco; porta laranja; janela azulada; escada reconhecível
4. Export PNG continua ok; canvas comum (CanvasView) segue com a toolbar padrão do tldraw, intocado

---

## Self-review do plano

- Cobertura da spec fatia 2: paleta ✓ (C), medidas seleção+distância ✓ (A), toolbar própria (spec fatia 1 adiou para cá) ✓ (B). Réguas/camadas = fatia 3, fora.
- Pontos de API incerta têm gate explícito de verificação (.d.ts/ctx7) com obrigação de citar no relatório — sem chute.
- Nomes consistentes: `QUADRADO_PX` (existente), `emQuadrados`/`medidaDeCaixa`/`distanciaEntreCaixas`, `MedidasMapa`, `MapaToolbar`, `paletaMapa`.
