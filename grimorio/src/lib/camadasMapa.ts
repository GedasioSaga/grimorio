/**
 * Lógica pura de camadas do Mapa (Fatia 3). Sem dependência de tldraw: testável isolada.
 *
 * Modelo (spec `docs/superpowers/specs/2026-08-14-mapas-design.md`, Modelo de dados):
 * `CamadaMapa { id, nome, oculta, travada }`. `MapaDoc.camadas` é opcional — mapa criado
 * na fatia 1 não tem o campo — e cada shape do tldraw carrega `meta.camada = CamadaMapa['id']`.
 * Doc sem `camadas`, lista vazia, ou shape sem `meta.camada`/com `meta.camada` órfã: cai
 * na camada "Base" implícita (primeira da lista).
 */

import type { CamadaMapa } from './types'

export type { CamadaMapa }

const CAMADA_BASE_IMPLICITA: CamadaMapa = { id: 'base', nome: 'Base', oculta: false, travada: false }

/** Normaliza a lista de camadas do doc: undefined/vazio vira uma única camada "Base". */
export function camadasDoDoc(camadas: CamadaMapa[] | undefined): CamadaMapa[] {
  if (!camadas || camadas.length === 0) return [CAMADA_BASE_IMPLICITA]
  return camadas
}

/** Camada de um shape a partir do `meta`. Sem `camada`, ou `camada` órfã: primeira camada. */
export function camadaDoShape(meta: unknown, camadas: CamadaMapa[]): CamadaMapa {
  const id = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>).camada : undefined
  const achada = typeof id === 'string' ? camadas.find((c) => c.id === id) : undefined
  return achada ?? camadas[0]
}

export function shapeOculto(meta: unknown, camadas: CamadaMapa[]): boolean {
  return camadaDoShape(meta, camadas).oculta
}

export function shapeTravado(meta: unknown, camadas: CamadaMapa[]): boolean {
  return camadaDoShape(meta, camadas).travada
}

/** Cria uma camada nova ao fim da lista, visível e destravada. Devolve também o id gerado. */
export function criarCamada(camadas: CamadaMapa[], nome: string): { camadas: CamadaMapa[]; novaId: string } {
  const nova: CamadaMapa = { id: crypto.randomUUID(), nome, oculta: false, travada: false }
  return { camadas: [...camadas, nova], novaId: nova.id }
}

export function renomearCamada(camadas: CamadaMapa[], id: string, novoNome: string): CamadaMapa[] {
  return camadas.map((c) => (c.id === id ? { ...c, nome: novoNome } : c))
}

/**
 * Remove a camada do id dado. Nunca remove a última camada restante (no-op nesse caso).
 * Devolve também o id da camada "herdeira" — para onde os shapes da camada removida
 * devem migrar (`meta.camada`) — escolhida como a vizinha seguinte, ou a anterior
 * quando a removida é a última da lista.
 */
export function removerCamada(camadas: CamadaMapa[], id: string): { camadas: CamadaMapa[]; idHerdeira: string } {
  if (camadas.length <= 1) return { camadas, idHerdeira: camadas[0].id }
  const indice = camadas.findIndex((c) => c.id === id)
  if (indice === -1) return { camadas, idHerdeira: camadas[0].id }
  const herdeira = camadas[indice + 1] ?? camadas[indice - 1]
  return { camadas: camadas.filter((c) => c.id !== id), idHerdeira: herdeira.id }
}

export function alternarOculta(camadas: CamadaMapa[], id: string): CamadaMapa[] {
  return camadas.map((c) => (c.id === id ? { ...c, oculta: !c.oculta } : c))
}

export function alternarTravada(camadas: CamadaMapa[], id: string): CamadaMapa[] {
  return camadas.map((c) => (c.id === id ? { ...c, travada: !c.travada } : c))
}

/** Troca a camada do id com a vizinha na direção dada. Nas bordas (primeira/cima, última/baixo), no-op. */
export function moverCamada(camadas: CamadaMapa[], id: string, direcao: 'cima' | 'baixo'): CamadaMapa[] {
  const indice = camadas.findIndex((c) => c.id === id)
  if (indice === -1) return camadas
  const alvo = direcao === 'cima' ? indice - 1 : indice + 1
  if (alvo < 0 || alvo >= camadas.length) return camadas
  const copia = [...camadas]
  ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
  return copia
}
