# Grimório — Design

**Data:** 2026-07-13
**Status:** Aprovado pelo usuário

## Visão

Aplicativo desktop offline (Windows) estilo Excalidraw, voltado inteiramente para preparação de RPG de mesa pelo mestre. Combina canvas infinito de desenho livre com uma camada de organização de campanha: campanhas, sessões, personagens reutilizáveis e canvases livres.

O nome "Grimório" é placeholder e pode ser trocado.

## Usuário e contexto de uso

- Um único usuário: o mestre, preparando sessões sozinho.
- 100% offline. Sem servidor, sem conta, sem sincronização em tempo real.
- Dois computadores usam o programa. Portabilidade de dados via pasta de arquivos simples (ex.: dentro do OneDrive) — sem mecanismo próprio de sync.
- Cada RPG do usuário tem estrutura própria de personagem, então fichas são texto livre, sem campos fixos de sistema.

## Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Shell desktop | Tauri v2 | Executável leve, nativo Windows |
| UI | React + TypeScript + Vite | Ecossistema do tldraw |
| Canvas | tldraw SDK | Canvas infinito completo (caneta, formas, setas, imagens, texto, undo, zoom) com shapes customizados como componentes React de primeira classe |
| Estado | Zustand (ou equivalente leve) | Estado da aplicação fora do canvas |
| Testes | Vitest | Camada de dados |

**Licença tldraw:** exige marca d'água "Made with tldraw" no canto do canvas. Aceito (uso pessoal).

## Modelo de dados — o Cofre

No primeiro uso, o usuário escolhe uma pasta ("cofre"). Todo o conteúdo vive nela como JSON + imagens:

```
MeuCofre/
  campanhas/
    <slug-da-campanha>/
      campanha.json            # nome, descrição, ordem dos itens
      personagens/
        <slug>.json            # fonte única do personagem
      sessoes/
        <slug>.json            # documento tldraw + metadados da sessão
      canvases/
        <slug>.json            # canvases livres da campanha
      assets/
        <arquivo>.png|jpg|webp # retratos, mapas, imagens coladas
  canvases-soltos/
    <slug>.json                # canvases fora de qualquer campanha
```

### Personagem (`personagens/<slug>.json`)

```json
{
  "id": "uuid",
  "nome": "Baldur",
  "retrato": "assets/baldur.png",
  "resumo": "taverneiro, esconde um segredo",
  "corpo": "<texto livre com formatação básica>",
  "criadoEm": "ISO-8601",
  "modificadoEm": "ISO-8601"
}
```

- `corpo` é texto livre com formatação básica (negrito, itálico, títulos, listas). Sem campos de sistema.
- `retrato` e imagens no corpo referenciam arquivos em `assets/` por caminho relativo.

### Sessão / Canvas (`sessoes/<slug>.json`, `canvases/<slug>.json`)

```json
{
  "id": "uuid",
  "nome": "Sessão 01 — Chegada a Pedravale",
  "documento": { "...": "snapshot tldraw" },
  "criadoEm": "ISO-8601",
  "modificadoEm": "ISO-8601"
}
```

### Regras do modelo

- **Referência, não cópia:** o cartão de personagem no canvas guarda apenas o `id` do personagem. Nome, retrato e resumo são resolvidos na renderização a partir do JSON. Editar o personagem atualiza todos os cartões em todos os canvases.
- Personagem excluído com cartões existentes: cartão renderiza estado "personagem removido" (não quebra o canvas).
- Escrita atômica: salvar = escrever em arquivo temporário + rename. Nunca corrompe em caso de queda.
- Autosave com debounce (ex.: 1s após última alteração).
- Conflitos de sincronização externa (OneDrive): fora de escopo na v1. Carrega ao abrir, salva ao alterar; last-write-wins.

## UI

Tema **dark fantasy, sempre escuro**: fundo quase-preto quente, dourado envelhecido em bordas/acentos, fonte serifada em títulos, clima de grimório. Sem tema claro.

### Layout

- **Sidebar esquerda:** árvore do cofre — campanhas → (sessões, personagens, canvases) + canvases soltos. Ações: criar, renomear, excluir campanha/sessão/personagem/canvas.
- **Área central:** canvas tldraw do item aberto, com tema customizado por cima.

### Canvas — elementos suportados

Tudo nativo do tldraw:

1. Desenho à mão livre (caneta)
2. Formas (retângulo, elipse, etc.) e setas/conectores
3. Imagens coladas ou arrastadas (salvas em `assets/`)
4. Texto solto
5. **Cartão de personagem** (shape customizado): retrato + nome + resumo

### Cartão de personagem

- Criado arrastando personagem da sidebar para o canvas.
- Mostra versão resumida: retrato, nome, resumo.
- **Duplo clique** abre o perfil completo (painel/modal): editor de texto livre com formatação básica, troca de retrato, edição de nome/resumo.
- Mesmo personagem pode aparecer em qualquer número de canvases da campanha.

### Export

- Canvas inteiro ou seleção → **PNG** e **SVG** (capacidade nativa do tldraw).

## Confiabilidade e erros

- Autosave atômico (temp + rename) em toda alteração, com debounce.
- Undo/redo dentro do canvas (nativo tldraw).
- Arquivo JSON ilegível/corrompido ao abrir: item aparece na sidebar marcado como com erro; não derruba o app; demais itens carregam normalmente.
- Imagem referenciada ausente: placeholder visual, sem crash.

## Testes

- **Vitest** na camada de dados: serialização/deserialização do cofre, criação/renomeação/exclusão, resolução de referências de personagem, escrita atômica, arquivos corrompidos.
- **Canvas/UI:** verificação manual no app rodando (browser/janela Tauri) antes de declarar pronto.

## Escopo

### v1

- Cofre: escolher pasta, criar estrutura
- CRUD de campanhas, sessões, personagens, canvases livres (dentro e fora de campanha)
- Canvas tldraw completo com tema dark fantasy
- Cartão de personagem referenciado + perfil completo em duplo clique
- Autosave atômico
- Export PNG/SVG

### Fora da v1 (backlog)

- Wiki-links `[[Baldur]]` em textos
- Export PDF
- Busca global
- Templates de cartão por campanha
- Detecção de conflito de sync externo
