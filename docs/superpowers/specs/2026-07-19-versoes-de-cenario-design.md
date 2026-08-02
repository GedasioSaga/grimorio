# Versões de Cenário — Design

- **Data:** 2026-07-19
- **Status:** aprovado (brainstorming), pronto para plano de implementação
- **App:** Grimório (`grimorio/`) — React 19 + TS + tldraw 4 + zustand + Tauri v2

## 1. Objetivo

Dar a cada cenário múltiplas **versões** (ex.: Dia/Noite, Intacto/Destruído — N variantes, não só duas). Cada versão tem seu próprio conteúdo (imagem, textos, galeria). Um botão no card do canvas alterna a versão exibida ("transformar o cenário"). A versão ativa é uma propriedade do cenário: trocá-la reflete em todos os cards, na tela de edição e na sidebar, e persiste.

## 2. Fora de escopo (v1 — YAGNI)

- Reordenar versões (ordem = ordem de criação).
- Versões para cards de **personagem** (feature só no cenário).
- Versão ativa por-card (dois cards do mesmo cenário sempre mostram a mesma versão).
- Limpeza de arquivos de imagem órfãos ao excluir versão (arquivos permanecem no cofre por segurança).

## 3. Modelo de dados (`grimorio/src/lib/types.ts`)

O conteúdo do cenário migra para dentro de uma versão. Apenas `nome` e `personagens` permanecem no nível do cenário (compartilhados por todas as versões).

```ts
export interface VersaoCenario {
  id: string
  nome: string          // "Base", "Dia", "Noite", "Destruído"
  retrato: string | null // rel ao cofre, ex.: "imagens-cenarios/retrato-<cenarioId>-<versaoId>.png"
  resumo: string
  descricao: string     // HTML TipTap
  informacao: string    // HTML
  historia: string      // HTML
  eventos: string       // HTML
  itens: string         // HTML
  anotacoes: string     // HTML
  imagens: ImagemPersonagem[]
}

export interface Cenario {
  id: string
  nome: string              // compartilhado
  personagens: string[]     // compartilhado (ids N:N)
  versoes: VersaoCenario[]  // >= 1 sempre
  versaoAtivaId: string     // aponta para uma versoes[].id
  criadoEm: string
  modificadoEm: string
}
```

Campos removidos de `Cenario` (agora vivem em `VersaoCenario`): `retrato, resumo, descricao, informacao, historia, eventos, itens, anotacoes, imagens`.

## 4. Migração (lazy, forward-only)

- Em `normalizarCenario` (`grimorio/src/lib/vaultRepo.ts:38-56`): se `versoes` estiver ausente/vazio, construir `versoes = [{ id: <novo>, nome: "Base", ...campos planos legados }]` e `versaoAtivaId = versoes[0].id`.
- Migração **lazy**: acontece na leitura; o cenário é reescrito no formato novo no próximo save.
- **Forward-only**: um cofre migrado não abre em builds antigos do app. Aceitável — o autor controla os updates (auto-updater próprio).
- Cofre existente abre normalmente; cada cenário aparece com uma versão "Base" contendo o conteúdo atual intacto.

## 5. Camada de store (`grimorio/src/state/store.ts`)

Helper e ações novas:

- `versaoAtiva(c: Cenario): VersaoCenario` → `c.versoes.find(v => v.id === c.versaoAtivaId) ?? c.versoes[0]`. Fonte única para toda leitura de conteúdo.
- `definirVersaoAtiva(cenarioId, versaoId)` → update otimista no cache + save (via `salvarCenarioParcial({ versaoAtivaId })`).
- `adicionarVersao(cenarioId, nome)` → clona a versão ativa (conteúdo + referências de imagem), gera novo id, insere, e a torna ativa.
- `renomearVersao(cenarioId, versaoId, nome)`.
- `removerVersao(cenarioId, versaoId)` → guarda: recusa se `versoes.length === 1`; se remover a ativa, `versaoAtivaId` cai na primeira restante. **Não** apaga arquivos de imagem.
- `salvarCenarioParcial` (`store.ts:225-248`): patches de **conteúdo** (campos de `VersaoCenario`) são roteados para a versão ativa; patches de nível-cenário (`nome`, `personagens`, `versaoAtivaId`) permanecem no topo.
- **Autosave e troca de versão:** cada edição é roteada à versão ativa **no momento da digitação** (síncrono, via `aplicarPatchCenario`), e cada save persiste o `Cenario` inteiro — então o debounce continua chaveado só por `cenarioId` e a troca nunca grava na versão errada (dispensa flush). No card, um `useEffect` em `versaoAtivaId` fecha edição inline aberta (o Tiptap não ressincroniza `value` após montar).

## 6. UI — card no canvas (`grimorio/src/components/CenarioCardShape.tsx`)

- **Seletor de versão:** setas `‹ NomeDaVersão ›` — `‹` = versão anterior, `›` = próxima (cíclico). Posicionado **ao lado do `ControlesFonte`** (botões de fonte +/−), região `CenarioCardShape.tsx:326-335`.
- **Visibilidade:** só renderiza quando `versoes.length >= 2`. Cenário de versão única fica idêntico ao card atual. Visível nos estados colapsado e expandido.
- **Leitura de conteúdo:** `retrato, resumo, descricao, eventos, itens, informacao` etc. passam a vir de `versaoAtiva(c)` em vez de `c.<campo>` diretamente.
- Trocar de versão chama `definirVersaoAtiva` → update otimista → card, modal e sidebar refletem na hora.

## 7. UI — modal (`grimorio/src/components/CenarioModal.tsx`)

- **Barra de pills** no topo: `[Base] [Dia] [Noite] [+]`.
  - Clicar numa pill = torna aquela versão a **ativa** (a que é editada E a que aparece no canvas — conceito único de "versão atual").
  - `+` = criar versão: pede nome via `pedirTexto`; nasce **copiando a versão ativa**; vira ativa.
  - Renomear (via `pedirTexto`) e excluir a partir da pill.
  - Excluir = confirma via diálogo (`ask`/`message` já usados no app); remove do JSON; **mantém** arquivos de imagem; recusa excluir a última versão.
- **Reuso total:** todas as abas existentes (descrição, informação, história, eventos, itens, imagens, anotações) e a foto do cabeçalho passam a ler/gravar a **versão ativa**. Abas "Conteúdo" (sub-cenários + personagens) e "Vínculos" continuam no nível do cenário. UI nova = apenas a barra de pills.

## 8. Imagens

- **Retrato por versão:** salvo como `imagens-cenarios/retrato-<cenarioId>-<versaoId>.<ext>` (sem colisão entre versões). `trocarRetrato` (`CenarioModal.tsx:121-138`) usa o id da versão ativa.
- **Galeria por versão:** `imagens[]` fica dentro da `VersaoCenario` (mesmo `{rel, legenda}` de hoje).
- Ao clonar uma versão (`+`), as referências de imagem são **compartilhadas por referência de caminho** (mesmo arquivo no cofre) até o usuário trocar a foto da nova versão — evita duplicar binários sem necessidade.

## 9. Consumidores a atualizar

- `grimorio/src/lib/types.ts` — `VersaoCenario` + reforma de `Cenario`.
- `grimorio/src/lib/vaultRepo.ts` — `normalizarCenario` (migração) e defaults de `criarCenarioEm` (`:266-279`) já criando uma versão "Base".
- `grimorio/src/state/store.ts` — helpers/ações de versão + roteamento de `salvarCenarioParcial` (conteúdo → versão ativa no momento da edição).
- `grimorio/src/components/CenarioCardShape.tsx` — leitura via versão ativa + setas de versão.
- `grimorio/src/components/CenarioModal.tsx` — barra de pills + abas/retrato apontando para versão ativa.
- `grimorio/src/lib/copiaImagemCard.ts` (`relRetratoDoCard :20-26`) — retrato via versão ativa.
- `grimorio/src/components/AcoesIA.tsx` — se lê/escreve `descricao` e afins, roteia para a versão ativa.
- Testes: `grimorio/src/test/normalizarCenario.test.ts` atualizado + novos para `versaoAtiva`, add/remover versão, e roteamento de save.

## 10. Casos de borda e riscos

- **Save pendente + troca de versão:** roteamento no momento da edição (cada tecla já cai na versão certa) + save do `Cenario` inteiro → a troca nunca grava na versão errada. No card, edição inline fecha ao trocar de versão (§5).
- **Excluir versão ativa:** cai na primeira restante (§5).
- **Excluir a última versão:** proibido (guarda no store).
- **Sub-cenários:** cada sub-cenário é um `Cenario` próprio (pasta aninhada) → herda o modelo de versões sem caso especial.
- **`convertFileSrc` do retrato:** continua igual, só muda a origem do caminho (versão ativa).
- **Props do shape tldraw:** nenhuma prop nova no shape — a lista de versões vive na entidade, não nas props (que só aceitam primitivos). Sem migração de shape do tldraw necessária para a lista.

## 11. Verificação

1. Abrir cofre existente → cada cenário mostra versão "Base" com conteúdo intacto.
2. Criar "Noite" (copia a ativa) → vira ativa; editar foto + descrição.
3. No card, setas `‹ ›` alternam versão → foto e textos trocam ao vivo.
4. Fechar e reabrir o app → a versão ativa de cada cenário persistiu.
5. Excluir "Noite" → pede confirmação; some do JSON; arquivos de imagem permanecem no cofre.
6. Cenário de versão única → sem setas, card idêntico ao comportamento atual.
7. `npm test` (vitest) verde, incl. migração `normalizarCenario`.

## Apêndice — decisões e suposições confirmadas

**Decisões:** (1) modelo Base + variações; (2) escopo "card inteiro"; (3) versão ativa na entidade; (4) setas `‹ ›` ao lado do controle de fonte; (5) nova versão copia a ativa e vira ativa; (6) excluir confirma e mantém imagens, nunca a última; (7) no modal, editar uma versão = torná-la a visível.

**Suposições:** nome da versão migrada = "Base"; migração lazy/forward-only; setas só com ≥2 versões; barra de pills no modal; retrato nomeado por `cenarioId+versaoId`; autosave roteado no momento da edição (debounce por `cenarioId`); sub-cenários herdam o modelo; personagem inalterado; reordenar fora do v1.
