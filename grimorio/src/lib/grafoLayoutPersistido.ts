/**
 * Persistência das posições que o usuário arruma na teia (`GrafoVinculos.tsx`), separada do
 * cálculo do layout automático (`grafoLayout.ts`) — aqui não há força nem simulação, só fusão
 * e validação de um dado que vem do disco e pode estar mentindo.
 *
 * Guardado em fração [0,1] da moldura (`x`/`y` relativos a `tamanho.largura`/`altura`), não em
 * pixel absoluto: a moldura muda de tamanho a cada resize e a cada reabertura do app, e um
 * pixel absoluto de uma sessão não significa nada na próxima. A fração é o que sobrevive.
 *
 * Lógica pura: sem React, sem store, sem disco.
 */

export interface Posicao {
  x: number
  y: number
}

/** Layout salvo de UM escopo (cofre inteiro, ou uma campanha): id da entidade -> posição normalizada. */
export type LayoutSalvo = Record<string, Posicao>

function posicaoValida(v: unknown): v is Posicao {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)
}

/**
 * Normaliza o layout salvo de um escopo. Entrada que não é o objeto esperado — arquivo
 * corrompido, campo com tipo errado, array em vez de objeto — vira `{}` em vez de lançar: cada
 * nó cai no automático, a tela nunca quebra por causa de um arquivo de posição ruim.
 */
export function normalizarLayoutSalvo(raw: unknown): LayoutSalvo {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: LayoutSalvo = {}
  for (const [id, pos] of Object.entries(raw as Record<string, unknown>)) {
    if (id !== '' && posicaoValida(pos)) out[id] = { x: pos.x, y: pos.y }
  }
  return out
}

/** Normaliza o arquivo inteiro: escopo (cofre / cada campanha) -> layout daquele escopo. */
export function normalizarLayoutTeia(raw: unknown): Record<string, LayoutSalvo> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: Record<string, LayoutSalvo> = {}
  for (const [escopo, layout] of Object.entries(raw as Record<string, unknown>)) {
    if (escopo !== '') out[escopo] = normalizarLayoutSalvo(layout)
  }
  return out
}

/** Chave do escopo: o cofre inteiro, ou uma campanha específica. */
export function chaveDoEscopo(campanhaId: string | null): string {
  return campanhaId ? `campanha:${campanhaId}` : 'cofre'
}

/**
 * Posição efetiva de cada nó da teia ATUAL: a salva (convertida de fração para pixel pela
 * moldura de agora), ou a automática quando não há posição salva.
 *
 * Itera sobre `automatico` — que só tem os ids da teia de agora — e não sobre `salvo`: é isso
 * que faz um nó removido (existe em `salvo`, sumiu de `automatico`) desaparecer sozinho do
 * resultado, sem precisar de um passo de "poda" à parte para desenhar a tela.
 */
export function posicoesEfetivas(
  salvo: LayoutSalvo,
  automatico: Record<string, Posicao>,
  tamanho: { largura: number; altura: number },
): Record<string, Posicao> {
  const out: Record<string, Posicao> = {}
  for (const [id, pos] of Object.entries(automatico)) {
    const fracao = salvo[id]
    out[id] = fracao ? { x: fracao.x * tamanho.largura, y: fracao.y * tamanho.altura } : pos
  }
  return out
}

/** Converte uma posição em pixel (espaço de `tamanho`) para a fração [0,1] que se persiste. */
export function paraFracao(pos: Posicao, tamanho: { largura: number; altura: number }): Posicao {
  return {
    x: tamanho.largura > 0 ? pos.x / tamanho.largura : 0,
    y: tamanho.altura > 0 ? pos.y / tamanho.altura : 0,
  }
}

/**
 * Novo layout salvo do escopo, depois de o usuário arrastar `id` para `posicaoFracao`.
 *
 * Descarta primeiro qualquer entrada de `salvo` cujo id não esteja mais em `idsAtuais` — é a
 * poda que impede a posição de uma entidade excluída de crescer no arquivo para sempre — e só
 * então grava a nova posição.
 */
export function atualizarLayoutSalvo(
  salvo: LayoutSalvo,
  idsAtuais: ReadonlySet<string>,
  id: string,
  posicaoFracao: Posicao,
): LayoutSalvo {
  const out = podarLayout(salvo, idsAtuais)
  out[id] = posicaoFracao
  return out
}

/** Remove de `salvo` todo id que não esteja em `idsAtuais`. */
export function podarLayout(salvo: LayoutSalvo, idsAtuais: ReadonlySet<string>): LayoutSalvo {
  const out: LayoutSalvo = {}
  for (const [id, pos] of Object.entries(salvo)) {
    if (idsAtuais.has(id)) out[id] = pos
  }
  return out
}
