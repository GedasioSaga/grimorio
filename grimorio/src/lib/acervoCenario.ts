/** Helpers puros do acervo de uma versão de cenário (VersaoCenario.acervo). */
import type { ItemNoCenario } from './types'

/**
 * Valor novo direto, ou updater aplicado sobre o acervo mais fresco disponível no momento
 * da resolução — necessário para fluxos assíncronos (ex.: criar item no acervo), onde o
 * acervo capturado no início pode já estar desatualizado quando o resultado chega.
 */
export type AtualizadorAcervo = ItemNoCenario[] | ((atual: ItemNoCenario[]) => ItemNoCenario[])

/** Adiciona um item (dedupe). Retorna a MESMA lista se nada mudou. */
export function adicionarAoAcervo(lista: ItemNoCenario[], itemId: string): ItemNoCenario[] {
  return lista.some((a) => a.itemId === itemId) ? lista : [...lista, { itemId }]
}

export function removerDoAcervo(lista: ItemNoCenario[], itemId: string): ItemNoCenario[] {
  return lista.filter((a) => a.itemId !== itemId)
}

/**
 * Define a quantidade. Qualquer coisa que não seja inteiro >= 2 apaga o campo:
 * "1" e "único" são a mesma coisa, e guardar `qtd: 1` só faria o chip mostrar
 * um "1×" que não informa nada.
 */
export function definirQtd(lista: ItemNoCenario[], itemId: string, qtd: number | undefined): ItemNoCenario[] {
  if (!lista.some((a) => a.itemId === itemId)) return lista
  const n = qtd === undefined ? Number.NaN : Math.trunc(qtd)
  return lista.map((a) => (a.itemId === itemId ? (Number.isFinite(n) && n >= 2 ? { ...a, qtd: n } : { itemId: a.itemId }) : a))
}

/** Filtra itens que ainda existem no cache (órfãos somem da exibição, sem reescrever disco). */
export function acervoVivo(lista: ItemNoCenario[], cache: Record<string, unknown>): ItemNoCenario[] {
  return lista.filter((a) => a.itemId in cache)
}
