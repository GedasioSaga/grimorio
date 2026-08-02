# Chat de IA por entidade (personagem / cenário) — Design

**Data:** 2026-07-20
**Status:** Aprovado — pronto para plano de implementação

## Objetivo

No header do card de personagem/cenário existe hoje a ✨ (`AcoesIA`, menu single-shot).
Adicionar ao lado dela um ícone **💬** que abre um **painel lateral de chat** para o autor
**conversar com a IA sobre aquele personagem/cenário específico** (multi-turno).

## Decisões travadas (brainstorming 2026-07-20)

| Tema | Decisão |
|------|---------|
| Layout | **Drawer altura cheia à direita** da tela. O card não se mexe. |
| Histórico | **Efêmero** — recomeça a cada abertura, só em memória. Nada gravado no cofre. |
| Contexto | **Versão ativa completa + campanha ao redor** (todas as abas via `htmlParaTexto` + `contextoDeEntidade`). |
| Componente | **Novo**, sem tocar no `ChatIA` da campanha. |

## Contexto do código (já existe — reusar)

- `gerarConteudo(opts): Promise<string>` — `src/lib/gemini.ts:63`. Contrato:
  `{ system: string; historico: MensagemIA[]; imagens?: ImagemIA[]; chaves: string[] }`.
  `MensagemIA = { papel: 'user'|'model'; texto: string }`. Stateless (Gemini não guarda sessão);
  multi-turno = reenviar a janela + `system` a cada chamada. Modelo `gemini-3.1-flash-lite`.
- `garantirChaves(pedir)` — `src/lib/chavesIA.ts:33`. UI injeta `pedirTexto` (`src/components/dialogos.tsx:42`).
- `contextoDeEntidade(id, deps)` — `src/lib/contextoIA.ts:139`. Já usado em `PerfilModal.tsx:176` e
  `CenarioModal.tsx:183` — **reusar a mesma montagem de `deps` desses call sites**.
- `versaoAtivaPersonagem(p)` — `src/lib/personagemVersao.ts:14`; `versaoAtiva(c)` — `src/lib/cenarioVersao.ts:17`.
- `htmlParaTexto(html)` — `src/lib/htmlTexto.ts:9` (HTML das abas TipTap → texto puro).
- Campos de versão: `CHAVES_VERSAO_PERSONAGEM` (`personagemVersao.ts:4`), `CHAVES_VERSAO` (`cenarioVersao.ts:4`).
- Mapas de rótulo (aba → título legível): `PerfilModal.tsx:22-29`, `CenarioModal.tsx:24-33`.
- Tipos/janela do chat: `MensagemChat = { papel, texto, em }`, `JANELA_HISTORICO = 20` — `src/lib/chatIA.ts`.
- CSS reusável: `.chat-ia*` (`theme.css:402`), `.btn-icon` (`theme.css:72`). Tokens de tema:
  `--fundo`, `--fundo-painel`, `--fundo-elevado`, `--borda`, `--dourado`, `--dourado-claro`, `--texto`, `--texto-fraco`, `--erro`.
- Inserção do botão no header: após `<AcoesIA>`, antes do `.perfil-fechar` (`PerfilModal.tsx:200-201`, `CenarioModal.tsx:207-208`).

## Arquitetura

### Arquivos novos

**`src/lib/contextoEntidade.ts`** (lógica pura, testável, sem UI/Tauri)
- `SYSTEM_ENTIDADE(tipo: 'personagem'|'cenario'): string` — prompt de sistema curto:
  assistente conversando com o autor sobre esta entidade específica; usar o contexto como verdade;
  responder em português, direto; pode sugerir ideias e apontar inconsistências.
- `textoDaEntidade(ent, tipo): string` — despeja a **versão ativa** em texto:
  - personagem: cabeçalho `# Personagem: <v.nome>`, `Resumo: <v.resumo>`, depois cada campo não-vazio
    (`descricao`, `informacao`, `historia`, `extras`, `anotacoes`) como `## <rótulo>` + `htmlParaTexto(campo)`.
  - cenário: `# Cenário: <c.nome> (versão: <v.nome>)`, `Resumo: <v.resumo>`, campos
    (`descricao`, `informacao`, `historia`, `eventos`, `itens`, `anotacoes`).
  - Pula campos vazios. Usa os mapas de rótulo já existentes nos modais.

**`src/components/ChatEntidade.tsx`** — drawer de chat escopado
- Props: `{ entidade, tipo: 'personagem'|'cenario', contextoDeps, onFechar }`.
- Estado local: `mensagens: MensagemChat[]` (efêmero, `useState`), `entrada`, `carregando`, `erro`.
- `enviar()`:
  1. push msg `user`;
  2. monta `system = SYSTEM_ENTIDADE(tipo) + "\n\n# Sobre\n" + textoDaEntidade(entidade, tipo) + "\n\n# Contexto da campanha\n" + contextoDeEntidade(entidade.id, contextoDeps)` — **remontado a cada envio** (pega a versão ativa atual);
  3. `historico = [...mensagens, nova].slice(-JANELA_HISTORICO)` mapeado para `MensagemIA`;
  4. `gerarConteudo({ system, historico, chaves: await garantirChaves(pedirTexto) })`;
  5. push msg `model`; no `catch`, push bolha de erro (estilo `--erro`).
- Enquanto `carregando`: input desabilitado + indicador "…".
- Estado vazio: dica "Converse com a IA sobre <nome>."
- Corpo reusa classes `.chat-ia*`. Raiz do drawer faz `stopPropagation` no clique.

### Arquivos alterados

**`src/components/PerfilModal.tsx`** e **`src/components/CenarioModal.tsx`**
- Estado local `const [chatAberto, setChatAberto] = useState(false)`.
- Botão `<button className="btn-icon" title="Conversar com a IA" onClick={() => setChatAberto(v => !v)}>💬</button>`
  no header, entre `<AcoesIA>` e o `.perfil-fechar`.
- Render irmão do card, dentro do `.modal-overlay`:
  `{chatAberto && <ChatEntidade entidade={ent} tipo="personagem" contextoDeps={/* mesmos deps do call site atual */} onFechar={() => setChatAberto(false)} />}`.

**`src/theme.css`**
- `.chat-drawer { position: fixed; right: 0; top: 0; height: 100vh; width: 360px; background: var(--fundo-painel); border-left: 1px solid var(--borda); display: flex; flex-direction: column; z-index: 1050; animation: chat-drawer-in 200ms ease; }`
- `@keyframes chat-drawer-in { from { transform: translateX(100%) } to { transform: translateX(0) } }`
- `z-index: 1050` fica acima do card (dentro do stacking context do `.modal-overlay`, z-index:1000) e abaixo do
  preview da ✨ (`.acoes-ia-overlay`, z-index:1100), que assim continua sobrepondo o drawer.

## Estrutura de render (PerfilModal)

```
<div className="modal-overlay" onClick={fechar}>
  <div className="perfil-modal" onClick={stopPropagation}>
    <div className="perfil-header">
      <AcoesIA … />                          {/* ✨ */}
      <button className="btn-icon" …>💬</button>
      <button className="btn-icon perfil-fechar" …>✕</button>
    </div>
    …resto do card…
  </div>
  {chatAberto && <ChatEntidade … />}          {/* drawer fixed à direita, irmão do card */}
</div>
```

`position: fixed` do drawer escapa o `overflow:hidden` do card (não há `transform` nos ancestrais,
então o containing block é a viewport). Por ser irmão do card e não filho, não há risco de clipe.

## Tratamento de erro / borda

- `gerarConteudo` já sanitiza erros (nunca vaza a chave) e lança string amigável — mostrar como bolha `--erro`.
- Sem chave: `garantirChaves(pedirTexto)` abre o diálogo; se cancelar retorna `[]` → não envia, mostra aviso curto.
- Resposta vazia: `gerarConteudo` lança `'A IA não retornou conteúdo.'` → cai no `catch`.
- Fechar o card (overlay/✕) desmonta o modal e o drawer junto (conversa some — efêmero por design).

## Testes

**`src/test/contextoEntidade.test.ts`** (vitest, padrão de `src/test/gemini.test.ts`)
- `textoDaEntidade` personagem: inclui `v.nome`, `resumo`, converte HTML das abas em texto, **pula campos vazios**.
- `textoDaEntidade` cenário: inclui `c.nome` + `v.nome`, abas de cenário (`eventos`, `itens`).
- Usa a **versão ativa** correta quando há múltiplas versões (`versaoAtivaId`).
- `SYSTEM_ENTIDADE` muda o rótulo por `tipo`.

Não há teste de UI automatizado (sem harness de browser aqui). Verificação de UI é manual (abaixo).

## Critérios de verificação

1. `tsc` / build sem erro de tipo; `npm test` verde (novo teste incluso).
2. Manual — personagem: abrir modal → **💬 aparece à direita da ✨** → clicar → **drawer desliza da direita** →
   perguntar algo cuja resposta dependa da descrição/história → resposta usa esse conteúdo →
   fechar drawer (✕) mantém o card aberto → reabrir drawer = **vazio** (efêmero).
3. Manual — cenário: mesmo fluxo no `CenarioModal`.
4. Manual — trocar de forma/versão no meio da conversa → **próxima resposta reflete a nova versão ativa**.
5. Sem chave salva: primeiro envio abre o diálogo de chave; cancelar não quebra.

## Fora de escopo (v1)

- Ícone 💬 no card pequeno do canvas (só no modal).
- Persistir histórico por entidade.
- Anexar imagem no chat da entidade.
- Streaming de resposta.
