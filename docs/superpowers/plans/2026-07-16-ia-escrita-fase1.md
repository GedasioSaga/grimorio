# IA na escrita (Fase 1) — Implementation Plan

> Fase 1 de uma visão maior (IA em toda a escrita + Personagens/Cenários, várias campanhas).
> Aqui: o menu ✨ passa a operar **na página de escrita aberta**. Reorganização *entre* cadernos = Fase 2 (plano próprio).

**Goal:** o mesmo ✨ dos modais (Personagem/Cenário) funciona dentro da escrita, operando na página aberta: Versão curta/longa, Melhorar, **Estruturar** (nova) e Perguntar — com preview Substituir/Adicionar/Descartar. A IA enxerga o texto da página + o contexto da campanha do caderno.

**Architecture:** unificar `AcoesIA` (um componente serve modais + escrita, dados injetados por prop — não busca mais no store por `entidadeId`). Peças puras novas e testadas: conversor Markdown→HTML, marcadores de imagem, persona/prompt de escrita, extração do contexto da campanha.

**Tech Stack:** React 19, TipTap 3 (StarterKit + ImagemCofre), zustand, vitest. Reusa `gerarConteudo` (gemini.ts), `htmlParaTexto`/`textoParaHtml`, `montarContextoCampanha` + `idsDaCampanha` + `achatarCenarios`.

---

## Decisões (fechadas no grilling)

1. Opera na **página inteira** (não em trecho selecionado).
2. Contexto: **texto da página + campanha** do caderno (derivada do caminho `campanhas/<slug>/…`).
3. **Persona nova de escrita** (worldbuilding), sem viés de "respostas curtas de mesa".
4. Ações: **Curta, Longa, Melhorar, Estruturar (nova), Perguntar**.
5. **Unificar** o `AcoesIA` (regra do três: Personagem + Cenário + Escrita).
6. IA responde em **Markdown → conversor próprio** (subset do StarterKit: H1–H3, listas, `**`/`*`, `>`, `---`, parágrafos).
7. Imagens preservadas por **marcadores `{{IMG:n}}`** (mantêm posição); sobras vão pro fim (nunca perde).

## Contexto verificado (arquivo:linha)

- `src/components/AcoesIA.tsx` — hoje acoplado a `entidadeTipo/entidadeId`; `montarContexto()` embutido (usa `campanhaDeEntidade`); preview converte com `textoParaHtml` **dentro** do componente. Guarda `montadoRef`, clique-fora, erro — MANTER.
- `src/components/NotasEditor.tsx` — editor TipTap da escrita; toolbar em `:140`; `htmlRef` (:41), `salvar`/`agendarSalvar` (:83-96). Recebe `repo, slug`. **Sem IA.**
- `src/components/Workspace.tsx:120` — monta `<NotasEditor>`; tem `cadernoDirRel` (:58).
- `src/lib/htmlTexto.ts:25` — `textoParaHtml` só faz `<p>` por linha (não gera títulos/listas) → por isso o conversor Markdown.
- `src/components/ImagemCofre.tsx:159-210` — imagem salva como `<img data-rel data-largura data-align data-legenda>` (tag única, sem `src`).
- `src/lib/contextoIA.ts:14` `acharCampanhaDaSessao` (regex `^campanhas/([^/]+)/`) e `:78` `montarContextoCampanha` — reusáveis.
- `src/components/PerfilModal.tsx:13-14` `Aba`/`AbaTexto`; `:147-158` `<AcoesIA>` `onInserir(aba,html,modo)`. `CenarioModal.tsx:15-16`, `:154-...` idem.
- Persona `SYSTEM_MESTRE` em `src/lib/chatIA.ts:13`.

---

## Task 1 — Conversor Markdown→HTML (puro, TDD)
**Create:** `src/lib/markdownHtml.ts` · **Test:** `src/test/markdownHtml.test.ts`
- `markdownParaHtml(md): string` — `#`/`##`/`###`→`<h1..3>`; `-`/`*`/`+`→`<ul><li>`; `1.`→`<ol><li>`; `> `→`<blockquote>`; `---`/`***`→`<hr>`; linha vazia separa `<p>`; inline `**x**`→`<strong>`, `*x*`/`_x_`→`<em>`. Escapa `& < >` antes do inline. `#### `+ → rebaixa pra H3.
- Preserva tokens `{{IMG:n}}` intactos (não são markdown).
- [ ] teste falha → implementa → passa → commit `feat(ia): conversor markdown->html para a escrita`

## Task 2 — Marcadores de imagem (puro, TDD)
**Create:** `src/lib/imagensMarcador.ts` · **Test:** `src/test/imagensMarcador.test.ts`
- `TOKEN_IMG(n)` = `{{IMG:n}}`.
- `extrairImagens(html): { html: string; imagens: string[] }` — troca cada `<img …>` por `\n{{IMG:n}}\n`, guarda a tag inteira em ordem.
- `reinserirImagens(html, imagens): string` — troca `<p>{{IMG:n}}</p>` e `{{IMG:n}}` pela tag n; índices não usados → anexa no fim (não perde).
- [ ] teste falha → implementa → passa → commit `feat(ia): marcadores de imagem para preservar posicao na escrita`

## Task 3 — Persona + prompts de escrita (puro, TDD)
**Edit:** `src/lib/promptsIA.ts` (ou nova `personasIA.ts`) · **Test:** `src/test/promptsIA.test.ts`
- `SYSTEM_ESCRITOR` — assistente de escrita/worldbuilding PT-BR, coerente com o contexto, usa Markdown pra organizar.
- `promptEstruturar()` — reorganiza/formata em títulos/listas, sem mudar sentido nem inventar; responde em Markdown.
- `REGRA_MARCADORES` — "mantenha `{{IMG:n}}` exatamente como está, em linha própria; não crie/remova".
- [ ] teste falha → implementa → passa → commit `feat(ia): persona e prompt de estruturar para a escrita`

## Task 4 — Extrair contexto puro (TDD)
**Edit:** `src/lib/contextoIA.ts`, `src/components/AcoesIA.tsx` · **Test:** `src/test/contextoIA.test.ts`
- `montarContextoDaCampanha(camp, {tree,personagens,cenarios,vinculos}): string` — núcleo (hoje embutido no AcoesIA).
- `contextoDeEntidade(entidadeId, deps)` e `contextoDoCaminho(caminho, deps)` — wrappers (via `campanhaDeEntidade` / `acharCampanhaPorCaminho`).
- AcoesIA passa a receber `contexto` por prop (deixa de montar sozinho).
- [ ] teste falha → implementa → passa → commit `refactor(ia): extrai montarContextoDaCampanha reutilizavel`

## Task 5 — Generalizar AcoesIA + modais
**Edit:** `src/components/AcoesIA.tsx`, `PerfilModal.tsx`, `CenarioModal.tsx`
- Nova assinatura: `system`, `contexto`, `abaEhTexto`, `rotuloAtual`, `acoes`, `snapshot()→{dadosBase,textoAtual}`, `imagensParaIA?()`, `conteudoDoDestino(destino)`, `onInserir(destino,textoCru,modo)`. AcoesIA deixa de ler o store por `entidadeId`; **passa texto CRU** ao `onInserir` (conversão vai pro pai).
- Modais preparam `snapshot`/`contexto` e convertem com `textoParaHtml` no `onInserir`. Persona = `SYSTEM_MESTRE`.
- [ ] `npm run build` limpo + **verificar manualmente os 2 modais** (não regredir) → commit `refactor(ia): AcoesIA agnostico de entidade (serve modais e escrita)`

## Task 6 — ✨ na escrita (NotasEditor)
**Edit:** `src/components/NotasEditor.tsx`, `Workspace.tsx`, `theme.css`
- `NotasEditor` recebe `cadernoDirRel`; lê `titulo` da página; monta `<AcoesIA>` na toolbar (persona `SYSTEM_ESCRITOR`; ação extra `Estruturar`).
- `snapshot`: `extrairImagens(htmlRef)` → guarda imagens em ref → `htmlParaTexto`. `contexto` via `contextoDoCaminho(cadernoDirRel,…)`.
- `onInserir`: `reinserirImagens(markdownParaHtml(textoCru), imagensRef)` → substituir=`setContent(emitUpdate)` / adicionar=`insertContent('end')`.
- CSS do ✨ na `notas-toolbar`.
- [ ] `npm run build` + `npm run test` + manual → commit `feat(ia): acoes de IA na escrita (pagina atual) com estruturar e imagens preservadas`

---

## Verificação final
- [ ] `npm run test` (novos: markdownHtml, imagensMarcador, prompts, contexto) — verde.
- [ ] `npm run build` — tsc limpo.
- [ ] Manual escrita: ✨ → cada ação; **Estruturar** gera títulos/listas; página com imagem → substituir mantém a imagem na posição do marcador; Perguntar insere resposta.
- [ ] Manual modais: Personagem e Cenário continuam funcionando (curta/longa/melhorar/perguntar/específicas).
- [ ] `git log` — nenhum commit com `.env`/chave.

## Notas de risco
- Refatorar `AcoesIA` toca os modais → verificação manual dos dois (Task 5).
- IA pode não respeitar `{{IMG:n}}` → fallback anexa sobras no fim (Task 2).
- Substituir é destrutivo → preview + `confirm` (padrão mantido).
- Divergência de índice se a página mudar entre envio e inserção → usa o snapshot de imagens do momento do envio.
