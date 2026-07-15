# Assistente IA (Gemini) — Design

Data: 2026-07-15
Branch: `feature/grimorio-v1`

## Contexto

Subsistema 2 (o 1 — Vínculos & Mundos — está entregue). O usuário quer uma IA
que ajude a conduzir sessões de RPG: conhecer o contexto da campanha (cenários,
personagens, vínculos, notas), analisar imagens (mapas/retratos) e ser criativa
(reviravoltas, descrições de cena, ganchos).

O `.env` do projeto (`grimorio/.env`) já tem `GEMINI_API_KEYS` (6 chaves
rotacionadas, tier gratuito) e `GEMINI_MODEL=gemini-3.1-flash-lite` — modelo
escolhido pelo usuário: simples, barato e criativo. **O `.env` não é modificado.**

### Decisões confirmadas com o usuário

1. Interação: **chat na sessão + botões nos modais** (fasear: chat primeiro).
2. Modelo/chaves: usar o que já está no `.env`.
3. Vínculos do Subsistema 1 entram no contexto da IA.

### API (verificada via docs oficiais)

`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
com header `x-goog-api-key`. Body: `system_instruction` + `contents[]`
(`role: 'user' | 'model'`, `parts[]` com `text` e/ou
`inline_data { mime_type, data(base64) }`). Resposta:
`candidates[0].content.parts[].text`. Sem streaming na v1.

## Configuração

- `vite.config.ts`: `envPrefix: ['VITE_', 'GEMINI_']` — expõe `GEMINI_API_KEYS`
  e `GEMINI_MODEL` via `import.meta.env`, em dev e build, sem tocar no `.env`.
- `GEMINI_API_KEYS` = string com chaves separadas por vírgula.
- Sem SDK novo: `fetch` direto (regra do projeto: dependência só quando
  necessário; aqui são ~40 linhas).

## Cliente — `src/lib/gemini.ts`

```ts
interface MensagemIA { papel: 'user' | 'model'; texto: string }
interface ImagemIA { mimeType: string; base64: string }

gerarConteudo(opts: {
  system: string
  historico: MensagemIA[]        // já inclui a mensagem nova do usuário no fim
  imagens?: ImagemIA[]           // anexadas às parts da ÚLTIMA mensagem user
}): Promise<string>
```

- **Round-robin**: índice de módulo avança a cada chamada (`proximaChave()`).
- **Retry**: HTTP 429/503 → tenta a próxima chave, até 1 volta completa
  (nº de chaves). Outros erros: mensagem legível
  (`IA indisponível: HTTP <status>` / corpo de erro da API quando houver).
- Chaves **nunca** aparecem em logs/erros.
- Helpers puros exportados para teste (sem rede): `parsearChaves(raw)`,
  `montarBody(system, historico, imagens)`, `extrairTexto(respostaJson)`.

## Contexto da campanha — `src/lib/contextoIA.ts` (puro, testado)

```ts
montarContextoCampanha(dados: {
  nomeCampanha: string
  personagens: { nome: string; resumo: string }[]
  cenarios: { nome: string; resumo: string; nivel: number }[]  // árvore achatada c/ indent
  vinculos: string[]        // frases já resolvidas: "Alice conhece Bob"
  notas: string             // texto plano da página ativa ('' se nenhuma)
}): string
```

- Saída compacta (tier gratuito): seções `## Campanha`, `## Personagens`,
  `## Cenários` (indentação por nível), `## Vínculos`, `## Notas da sessão`.
  Seções vazias são omitidas.
- Helpers puros: `frasesDeVinculos(vinculos, nomeDe)` (ignora participação e
  órfãos), `acharCampanhaDaSessao(tree, caminhoSessao)` (deriva o slug de
  `campanhas/<slug>/sessoes/...` → `CampanhaNode`), `achatarCenarios(raiz, ids)`
  (só participantes da campanha, com herança já dada pelo filtro existente),
  `htmlParaTexto(html)` (strip de tags p/ notas).
- Escopo do contexto: **entidades participantes da campanha** da sessão
  (`idsDaCampanha` do Subsistema 1) + personagens da própria pasta da campanha.
  Sessão sem campanha identificável → contexto só com notas.

## Chat na sessão — fase 1

### UI — `src/components/ChatIA.tsx`

- Painel **coluna fixa** (`width: 360px`) no fim do `Workspace`, recolhível —
  NÃO mexe no split proporcional notas/mapa existente; entra como 3ª coluna
  flex de largura fixa, com o mesmo visual dos painéis (`ws-cabecalho` etc.).
- Toggle: botão **✨ IA** no cabeçalho do painel do mapa (`Workspace`).
  O `Workspace` não sabe o tipo aberto → prop nova `comChatIA?: boolean`,
  passada pelo `App.tsx` apenas no ramo de sessão. Estado aberto/fechado
  lembrado por sessão (mesmo `localStorage` do split, campo novo `chatAberto`).
- Conteúdo: lista de mensagens (user/model), textarea + Enviar (Enter envia,
  Shift+Enter quebra linha), indicador "pensando…", erro em banner discreto.
- Botão **"anexar card selecionado"**: pega o card selecionado no canvas da
  própria sessão (personagem ou cenário), anexa retrato (base64) + um bloco de
  texto com os dados do card (nome, resumo, descrição em texto plano) à
  próxima mensagem. Chip mostra o que está anexado (removível).
- Botão limpar conversa (com confirm).

### Acesso ao canvas

Módulo `src/lib/canvasAtivo.ts`: `registrarEditor(editor)` /
`desregistrarEditor(editor)` / `editorAtivo(): Editor | null` —
`CanvasView` registra no `onMount` e desregistra no cleanup. `ChatIA` usa
`editorAtivo()?.getOnlySelectedShape()` e resolve dados/retrato via caches do
store. (Padrão de singleton de módulo já usado no app.)

### Persistência

- `chat-ia.json` no diretório de notas da sessão
  (`dirNotasDoMapa(caminho)/chat-ia.json`):
  `{ mensagens: [{ papel, texto, em }] }`.
- Ler na abertura (ausente → vazio); salvar com debounce curto via repo
  (`naFila`, mesmo padrão). Normalização pura testada (`normalizarChat`).
- Histórico enviado ao modelo: **últimas 20 mensagens** (janela fixa, barato).

### System prompt

Persona fixa (constante): assistente de mestre de RPG, responde em português,
criativo mas fiel ao contexto fornecido, respostas curtas por padrão (o mestre
está no meio da sessão), nunca inventa fatos que contradigam o contexto.

## Botões nos modais — fase 2

- Componente `src/components/AcoesIA.tsx`: botão **✨** no header do modal com
  menu de ações; ao rodar, abre um **preview** (overlay simples) com o texto
  gerado e botões **Inserir** / Descartar. Nada é escrito sem aprovação.
- **PerfilModal**: "Gerar/melhorar descrição" (usa nome+resumo+descrição atual
  +contexto da campanha; insere na aba Descrição), "Sugerir segredos e ganchos"
  (insere na aba Anotações).
- **CenarioModal**: "Gerar/melhorar descrição" (aba Descrição), "Sugerir
  eventos" (aba Eventos), "Analisar imagem" (manda o retrato do cenário;
  insere na aba Anotações).
- **Inserir** = append no HTML da aba correspondente
  (`agendarSalvar({ [aba]: htmlAtual + '<p>…</p>' })`), convertendo o texto da
  IA em parágrafos simples (`textoParaHtml` puro, testado — sem markdown v1).
- Contexto: o mesmo `montarContextoCampanha`, com a campanha resolvida pelos
  vínculos de participação da entidade (primeira campanha em que participa;
  sem participação → contexto vazio, só a entidade).

## Casos de borda

- Sem `GEMINI_API_KEYS` no build → painel/botões mostram "IA não configurada
  (defina GEMINI_API_KEYS no .env)" — sem crash.
- Todas as chaves em 429 → "IA ocupada (limite de uso); tente em instantes."
- Retrato ausente no "anexar card"/"analisar imagem" → só os dados de texto
  (aviso no chip) / botão desabilitado no cenário sem imagem.
- Resposta vazia/bloqueada por safety → mensagem "A IA não retornou conteúdo."
- Sessão sem página de notas ativa → contexto sem a seção Notas.
- Imagens grandes: retrato vai como está (base64); limite prático do modelo
  cobre fotos comuns — sem redimensionamento na v1.

## Segurança

- Chaves só em memória (import.meta.env) — nunca em logs, erros, chat salvo
  ou `vinculos.json`.
- `.env` permanece intocado e fora do git (já ignorado).
- Conteúdo enviado à API: contexto da campanha e imagens do cofre — dados do
  próprio usuário, envio explícito por ação dele (enviar mensagem/clicar ação).

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `vite.config.ts` | `envPrefix` |
| `src/lib/gemini.ts` | **novo** — cliente REST + round-robin |
| `src/lib/contextoIA.ts` | **novo** — contexto puro |
| `src/lib/canvasAtivo.ts` | **novo** — registro do editor ativo |
| `src/lib/chatIA.ts` | **novo** — tipos + normalização do chat salvo |
| `src/lib/vaultRepo.ts` | `lerChatIA`/`salvarChatIA` |
| `src/components/ChatIA.tsx` | **novo** — painel de chat |
| `src/components/Workspace.tsx` | botão ✨ IA + coluna do chat (só sessão) |
| `src/components/CanvasView.tsx` | registra/desregistra editor ativo |
| `src/components/AcoesIA.tsx` | **novo** — menu ✨ + preview (fase 2) |
| `src/components/PerfilModal.tsx` / `CenarioModal.tsx` | botão ✨ no header (fase 2) |
| `src/theme.css` | estilos do chat, chip, preview |

## Testes

- Puros: `parsearChaves`, `montarBody` (system+historico+imagens),
  `extrairTexto`, `montarContextoCampanha` (seções/omissões),
  `frasesDeVinculos`, `acharCampanhaDaSessao`, `htmlParaTexto`,
  `normalizarChat`, `textoParaHtml`.
- Rede NÃO é testada por unit (I/O isolado em `gerarConteudo`).
- `npm run build` + suíte; manual: conversar na sessão, anexar card, 429
  forçado (chave inválida) mostra erro amigável, ações dos modais com preview.

## Fora de escopo (YAGNI)

- Streaming; chat em canvas-solto/escrita; geração de imagens; markdown rico
  nas respostas; embeddings/busca semântica; redimensionar imagem; histórico
  além de 20 mensagens na janela do modelo.

## Ordem de entrega

1. Config + cliente Gemini + contexto (libs puras com testes)
2. Chat na sessão (UI + persistência + anexar card)
3. Botões ✨ nos modais (AcoesIA + preview + inserir)
