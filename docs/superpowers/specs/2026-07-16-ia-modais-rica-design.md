# IA rica nos modais (por aba) — Design

Data: 2026-07-16
Branch: `feature/grimorio-v1`

## Contexto

O `AcoesIA` (menu ✨ nos modais de Personagem e Cenário) hoje só roda ações
FIXAS (prompt pré-definido → preview → "Inserir" que faz append numa aba fixa).
O usuário quer, dentro dos modais: pedir **dicas/conselhos** livremente, **melhorar**
o texto, e gerar descrições **curtas e longas** — tudo operando na **aba que está
vendo**.

Reaproveita toda a fundação IA (cliente Gemini, contexto da campanha, persona).

### Decisões confirmadas com o usuário

1. As ações operam na **aba atual** do modal (tab-aware).
2. Menu do ✨ passa a ter: **Versão curta**, **Versão longa**, **Melhorar**,
   **Perguntar…** (chat livre) — além das ações específicas de hoje.
3. Preview ganha **Substituir** + **Adicionar** + **Descartar** (escolha caso a caso).
4. Pergunta livre: resposta no preview, com inserir **opcional**.

## Abas dos modais

- **PerfilModal** (`type Aba`): `descricao, informacao, historia, imagens, extras, anotacoes`.
  Texto: todas menos `imagens`.
- **CenarioModal**: `descricao, conteudo, informacao, historia, eventos, itens, imagens, anotacoes`.
  Texto: `descricao, informacao, historia, eventos, itens, anotacoes`. NÃO-texto:
  `imagens` (galeria) e `conteudo` (elenco/links — `AbaConteudo`).
- Regra: nas abas de texto o campo do modelo (`ent[aba]`) é o HTML daquela aba.
  Nas não-texto, as ações tab-aware (curta/longa/melhorar) ficam ocultas; só
  "Perguntar…" e as ações específicas aparecem.

## Prompts (puro, testável) — `src/lib/promptsIA.ts`

```ts
promptVersao(rotuloAba: string, tamanho: 'curta' | 'longa'): string
  // "Escreva o conteúdo da seção '<rotulo>' … versão CURTA (1-2 frases) / LONGA (3-4 parágrafos),
  //  evocativo, coerente com a entidade e o contexto."
promptMelhorar(rotuloAba: string): string
  // "Melhore o texto atual da seção '<rotulo>': corrija, enriqueça e clarifique,
  //  MANTENDO o sentido e os fatos. Não invente contradições."
```

- Funções puras que devolvem só a instrução (a entidade, o texto atual e o
  contexto da campanha são montados no `AcoesIA` e concatenados).
- A pergunta livre não tem helper: o texto do usuário vira o prompt direto
  (precedido dos dados da entidade + contexto, como as outras).

## AcoesIA — mudanças (`src/components/AcoesIA.tsx`)

### Props novas
```ts
abaAtual: string          // id da aba aberta (ex.: 'descricao')
rotuloAbaAtual: string    // rótulo amigável (ex.: 'Descrição')
abaEhTexto: boolean       // aba atual é um campo de texto do modelo?
onInserir: (aba: string, html: string, modo: 'substituir' | 'adicionar') => void
```
(`onInserir` ganha o 3º parâmetro `modo`; `acoes` e o resto seguem.)

### Menu (montado assim, de cima pra baixo)
1. Se `abaEhTexto`: **Versão curta**, **Versão longa**, **Melhorar** — destino = `abaAtual`.
2. **Perguntar…** — abre/mostra um `<textarea>` pequeno no menu + botão Enviar
   (destino da resposta = `abaAtual`). Enter envia; vazio não faz nada.
3. Ações específicas passadas via `acoes` (Segredos/ganchos, Eventos, Analisar
   imagem) — destino fixo de cada uma, como hoje.

### Execução
- Ações tab-aware e pergunta livre montam o prompt: `dados da entidade` +
  (para melhorar/pergunta) `texto atual da aba` + `contexto da campanha` +
  a instrução (`promptVersao`/`promptMelhorar`/pergunta do usuário).
- Texto atual da aba: `htmlParaTexto((ent as Record<string,string>)[abaAtual] ?? '')`
  (só quando `abaEhTexto`).
- Reusa o `montarContexto()` atual (campanha + vínculos no escopo).
- Guarda de unmount (`montadoRef`), erro visível, imagem só nas ações `comImagem`
  — tudo como hoje.

### Preview (3 botões)
- Título = rótulo da ação; corpo = texto gerado.
- **Substituir em `<rotuloDestino>`** → `onInserir(destino, html, 'substituir')`.
- **Adicionar em `<rotuloDestino>`** → `onInserir(destino, html, 'adicionar')`.
- **Descartar**.
- `destino`/`rotuloDestino` vêm da ação (tab-aware = aba atual; específica = sua aba).

## Modais — integração

Passar as props novas e tratar `modo` no `onInserir`:

```tsx
<AcoesIA
  entidadeTipo="personagem"
  entidadeId={personagemId}
  abaAtual={aba}
  rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
  abaEhTexto={aba !== 'imagens'}
  acoes={ACOES_IA_PERSONAGEM}      // agora só as específicas (Segredos e ganchos)
  onInserir={(abaDestino, html, modo) => {
    const atual = useApp.getState().personagens[personagemId]
    const base = atual ? (atual[abaDestino as AbaTexto] ?? '') : ''
    const novo = modo === 'substituir' ? html : base + html
    agendarSalvar({ [abaDestino]: novo } as Partial<Personagem>)
    setAba(abaDestino as Aba)
  }}
/>
```

- CenarioModal análogo; `abaEhTexto={aba !== 'imagens' && aba !== 'conteudo'}`.
- Os arrays `ACOES_IA_*` perdem "Gerar/melhorar descrição" (virou universal
  curta/longa/melhorar) e mantêm só o que é específico: Personagem = "Segredos e
  ganchos"; Cenário = "Sugerir eventos", "Analisar imagem".

## CSS (`theme.css`)

- `.acoes-ia-perguntar` (área do textarea + botão Enviar dentro do menu).
- `.acoes-ia-preview-acoes` já existe; acomodar 3 botões (Substituir com destaque
  dourado, Adicionar neutro, Descartar).

## Casos de borda

- Aba não-texto (Imagens/Conteúdo): sem curta/longa/melhorar; só Perguntar + específicas.
- "Melhorar" com aba vazia → a IA gera do zero (o prompt tolera texto atual vazio).
- Pergunta livre vazia → botão Enviar desabilitado.
- Substituir texto existente é destrutivo, mas o preview é a confirmação (o
  usuário vê antes e escolhe); autosave do modal já permite desfazer editando.
- Erro/sem-chave/rate-limit: mensagens amigáveis de hoje (reusa `gerarConteudo`).
- Sessão/entidade sem campanha: contexto vazio, ação ainda funciona (só entidade).

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/lib/promptsIA.ts` | **novo** — `promptVersao`, `promptMelhorar` |
| `src/components/AcoesIA.tsx` | menu tab-aware + input Perguntar + preview 3 botões + `modo` |
| `src/components/PerfilModal.tsx` | props novas + `onInserir(modo)`; array só específicas |
| `src/components/CenarioModal.tsx` | idem (+ `conteudo` como não-texto) |
| `src/theme.css` | estilos do input Perguntar + 3 botões do preview |

## Testes

- Puros: `promptVersao` (curta/longa muda a instrução; inclui o rótulo da aba),
  `promptMelhorar` (menciona manter fatos + o rótulo).
- `npm run build` + suíte; manual: em cada aba de texto, curta/longa/melhorar →
  Substituir e Adicionar; Perguntar → resposta → inserir opcional; aba Imagens →
  só Perguntar + específicas.

## Fora de escopo (YAGNI)

- Histórico multi-turno no "Perguntar" dos modais (é single-shot; o chat multi-turno
  fica na sessão).
- Escolher aba de destino diferente da atual no preview (destino = aba da ação).
- Markdown rico nas respostas (segue `textoParaHtml` simples).

## Ordem de entrega

1. `promptsIA.ts` + testes.
2. `AcoesIA` (menu tab-aware + Perguntar + preview 3 botões + `modo`).
3. Integração nos 2 modais + CSS.
