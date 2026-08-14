# Mapas — Fatia 3: camadas, réguas e paridade Figma

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Mapa vira "um Figma": camadas (painel, esconder, travar), réguas em quadrados, painel de propriedades numérico (X/Y/L/A), alinhar/distribuir, guias de snap sempre ativas e zoom preciso. Referências visuais do usuário: mapas estilo Resident Evil (salas preenchidas com contorno fino, portas marcadas, andares lado a lado com rótulos, legenda).

**Architecture:** Lógica pura de camadas em `src/lib/camadasMapa.ts` (testável sem tldraw). Painel de camadas e painel de propriedades como colunas React DENTRO de `.mapa-wrap` (fora do `<Tldraw>`), lendo/escrevendo via `useEditor`-less: recebem o `editor` por ref/estado do MapaView. Visibilidade via `getShapeVisibility` (prop do `<Tldraw>`, validada via ctx7 na spec). Persistência de camadas no `MapaDoc.camadas` (read-modify-write na fila do caminho, padrão `salvarDocumentoCanvas`).

**Regras:** worktree `grimorio-mapas/grimorio`, branch `feature/mapas` (sincronizar com main antes de começar). pt-BR; TDD nas partes puras; cada commit com `npx tsc --noEmit` + `rtk proxy npx vitest run` limpos; API tldraw SEMPRE verificada em node_modules/ctx7, nunca chutada; inviável → BLOCKED.

**Base de testes ao iniciar:** 991 PASS (pós-merge transformar-v2 na main).

---

### Task A: camadas

**Files:** Create `src/lib/camadasMapa.ts` + `src/test/camadasMapa.test.ts`; Create `src/components/PainelCamadas.tsx`; Modify `src/components/MapaView.tsx`, `src/lib/vaultRepo.ts` (método de salvar camadas), `src/theme.css`.

**Modelo** (da spec): `CamadaMapa { id, nome, oculta, travada }`; `MapaDoc.camadas?: CamadaMapa[]` (opcional — mapa criado na fatia 1 não tem o campo); shape carrega `meta.camada`. Doc sem `camadas` ou shape sem `meta.camada` → camada "Base" implícita (primeira).

**Lógica pura (`camadasMapa.ts`, TDD):**
- `camadasDoDoc(camadas: CamadaMapa[] | undefined): CamadaMapa[]` — normaliza (vazio/undefined → `[{id:'base', nome:'Base', oculta:false, travada:false}]`)
- `camadaDoShape(meta: unknown, camadas: CamadaMapa[]): CamadaMapa` — meta.camada inexistente/órfã → primeira camada
- `shapeOculto(meta, camadas): boolean` / `shapeTravado(meta, camadas): boolean`
- operações imutáveis: `criarCamada(camadas, nome)`, `renomearCamada`, `removerCamada` (nunca a última; devolve também o id da camada que herda os shapes), `alternarOculta`, `alternarTravada`, `moverCamada(camadas, id, direcao)`

**Integração (MapaView + PainelCamadas):**
- Estado das camadas no MapaView (`useState` inicializado do doc lido — o hook `useDocumentoTldraw` devolve só o store tldraw; ler `camadas` exige o doc: adicionar ao hook um retorno `docExtra` com os campos não-tldraw OU ler o doc de novo no MapaView — decidir pelo mais limpo SEM mudar comportamento do CanvasView, e reportar)
- `<Tldraw getShapeVisibility={...}>`: `shapeOculto(shape.meta, camadas) ? 'hidden' : 'inherit'` (verificar assinatura real da prop)
- Travar: shapes da camada travada ganham `isLocked` em massa ao travar/destravar (verificar `editor.updateShapes` + comportamento de isLocked; alternativa mais barata descoberta na API real é aceitável — reportar)
- Forma nova nasce na camada ativa: side effect de criação (`editor.sideEffects.registerBeforeCreateHandler`? — VERIFICAR o mecanismo real de side effect do tldraw para carimbar `meta.camada` na criação; citar referência)
- Painel (coluna direita do `.mapa-wrap`, colapsável): lista (nome, olhinho, cadeado), camada ativa destacada (clique seleciona ativa), criar (+), renomear (duplo clique → `pedirTexto`), excluir (🗑, com `ask` de confirmação; shapes herdados pela vizinha via `editor.updateShapes` dos metas), reordenar (▲▼)
- Persistência: alterações de camadas salvam via método novo `vaultRepo.salvarCamadasMapa(caminho, camadas)` (read-modify-write na fila, igual `salvarDocumentoCanvas`) + teste no vaultRepo.test

**Commit:** `feat(mapas): camadas com painel, esconder, travar e persistência`

### Task B: réguas em quadrados

**Files:** Create `src/components/ReguasMapa.tsx`; Modify `MapaView.tsx`, `theme.css`.

Faixas fixas no topo e à esquerda do canvas (dentro de `.mapa-wrap`), graduadas em QUADRADOS (número a cada 5, tique menor por quadrado), reagindo a pan/zoom (`useValue` + câmera — mesmo padrão do MedidasMapa; converter página→viewport). Canto superior-esquerdo com botão de liga/desliga da grade (`isGridMode`). `pointer-events: none` nas faixas (não roubar o canvas). Densidade: em zoom muito baixo, pular rótulos (mostrar a cada 10) para não virar borrão — lógica pura `passoDaRegua(zoom): {tique, rotulo}` com teste.

**Commit:** `feat(mapas): réguas graduadas em quadrados`

### Task C: painel de propriedades (X/Y/L/A)

**Files:** Create `src/components/PainelPropriedades.tsx` (+ lib pura se precisar); Modify `MapaView.tsx`, `theme.css`.

Com 1 forma selecionada: inputs numéricos X, Y (posição em quadrados, 1 casa), L, A (tamanho em quadrados) — exibem valor atual (reativo) e APLICAM no blur/Enter (`editor.updateShape` com conversão quadrados→px; para L/A de geo, props.w/h — verificar como redimensionar shape arbitrário: `editor.resizeShape`? citar API). Multi-seleção: mostra só L×A do bounds (read-only). Nada selecionado: painel some (ou mostra dica). Mora acima do PainelCamadas na coluna direita.

**Commit:** `feat(mapas): painel de propriedades com posição e tamanho em quadrados`

### Task D: alinhar/distribuir + zoom + guias sempre ativas

**Files:** Modify `src/components/MapaToolbar.tsx` (ou barra contextual própria), `MapaView.tsx`, `theme.css`.

- Alinhar/distribuir: com 2+ formas selecionadas, grupo de botões (alinhar esquerda/centro-h/direita/topo/centro-v/base; distribuir h/v com 3+). tldraw tem ações prontas — VERIFICAR (`editor.alignShapes`/`distributeShapes` ou actions do ui) e usar as nativas.
- Guias/snap sempre: `editor.user.updateUserPreferences({ isSnapMode: true })` no onMount do MapaView (verificar nome real da preferência) — snap vira padrão, Ctrl passa a desligar. SÓ no mapa: preferência é global do usuário? Se for global (vaza pro canvas), NÃO usar preferência — reportar e discutir alternativa antes de improvisar.
- Zoom: canto inferior direito, "%" atual (reativo), botões − / + / 100% / caber (`editor.zoomOut/zoomIn/resetZoom/zoomToFit` — verificar nomes).

**Commit:** `feat(mapas): alinhar/distribuir, zoom preciso e snap sempre ativo`

### Task E: paleta ganha "Sala"

**Files:** Modify `src/lib/paletaMapa.ts`, `src/test/paletaMapa.test.ts`.

Elemento `sala` (referências do usuário: salas preenchidas com contorno fino — verde no RE1, vermelho no RE2): geo rectangle, cor 'green', fill 'solid', dash 'solid', size 's'. Usuário troca a cor da sala no StylePanel quando quiser outra. Teste segue o padrão existente.

**Commit:** `feat(mapas): elemento Sala na paleta`

### Task F: verificação manual (usuário)

Roteiro: criar camada "Andar 2", desenhar sala nela, esconder → some; travar "Paredes" → não seleciona; fechar/reabrir mantém; réguas acompanham pan/zoom; digitar X/L no painel move/redimensiona exato; alinhar 3 salas pela esquerda; distribuir; zoom 100%/caber; desenhar sem Ctrl já snapa; reproduzir um pedaço do mapa de referência (salas verdes + portas laranja + rótulos).

---

## Self-review

- Spec fatia 3 coberta (camadas, réguas) + os 4 itens Figma aprovados pelo usuário (propriedades, alinhar, guias, zoom) + elemento sala tirado das referências.
- Todos os pontos de API incerta têm gate de verificação com obrigação de citar a referência; travamento/preferência global têm rota de escape explícita (reportar em vez de improvisar).
- Persistência de camadas definida (read-modify-write na fila) — não colide com autosave do documento.
