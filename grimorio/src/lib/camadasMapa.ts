/**
 * Lógica pura de camadas do Mapa (Fatia 3). Sem dependência de tldraw: testável isolada.
 *
 * Modelo (spec `docs/superpowers/specs/2026-08-14-mapas-design.md`, Modelo de dados):
 * `CamadaMapa { id, nome, oculta, travada }`. `MapaDoc.camadas` é opcional — mapa criado
 * na fatia 1 não tem o campo — e cada shape do tldraw carrega `meta.camada = CamadaMapa['id']`.
 * Doc sem `camadas`, lista vazia, ou shape sem `meta.camada`/com `meta.camada` órfã: cai
 * na camada "Base" implícita (primeira da lista).
 *
 * ## Convenção de ordem: índice 0 é o FUNDO da pilha
 *
 * O array vai do fundo pro topo. Três coisas dependem disso e precisam continuar de acordo:
 * - `camadaDoShape` devolve `camadas[0]` para shape órfão — o fundo é o destino certo pra
 *   quem não escolheu camada (a "Base"), não a frente.
 * - `criarCamada` acrescenta no FIM, então camada nova nasce na FRENTE de todas — que é o
 *   que Photoshop/Figma/Krita fazem, e o que o usuário espera ao clicar "+ camada".
 * - `moverCamada(id, 'cima')` anda em direção ao fim do array: "cima" é sempre no sentido
 *   de Z (mais perto do observador), nunca "uma linha acima na lista".
 *
 * `PainelCamadas` INVERTE na hora de desenhar, para o topo da lista ser a camada da frente.
 * A ordem de empilhamento de verdade sai daqui e é aplicada por `ordemMapa.ts`, que recebe
 * esta lista de ids nesta mesma ordem (fundo → topo).
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

/** Versão atual da convenção de ordem gravada em `CanvasDoc.versaoCamadas`. */
export const VERSAO_CAMADAS = 2

/**
 * Converte a lista de camadas de um doc antigo para a convenção atual.
 *
 * Até a versão 1 o array só decidia a ordem de EXIBIÇÃO do painel, que desenhava
 * `camadas.map(...)` direto — o primeiro item era a linha de cima, e nada disso tocava o
 * empilhamento (camada não mexia em `index`). Na versão 2 o array passou a significar a
 * pilha, do fundo pro topo, e o painel é que inverte ao desenhar.
 *
 * Sem esta conversão, um mapa salvo com `['Detalhes', 'Planta']` — Detalhes no topo, como o
 * usuário deixou — reabriria com Detalhes no FUNDO da pilha e Planta na frente. Inverter no
 * load preserva o arranjo visual que o usuário montou; é a mesma lista, lida na convenção
 * em que foi escrita.
 */
export function migrarOrdemCamadas(camadas: CamadaMapa[] | undefined, versao: number | undefined): CamadaMapa[] | undefined {
  if (!camadas || camadas.length < 2) return camadas
  if ((versao ?? 1) >= VERSAO_CAMADAS) return camadas
  return [...camadas].reverse()
}

/** Ids das camadas na ordem de empilhamento (fundo → topo), como `ordemMapa.ts` espera. */
export function ordemDasCamadas(camadas: readonly CamadaMapa[]): string[] {
  return camadas.map((c) => c.id)
}

/** Cria uma camada nova ao fim da lista (= na FRENTE de todas), visível e destravada. */
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

/** Lado da linha ALVO onde a camada arrastada foi solta, na ordem que a tela mostra. */
export type LadoSolto = 'antes' | 'depois'

/**
 * Reordena por ARRASTO: a camada `idArrastada` sai de onde está e entra imediatamente antes
 * ou depois de `idAlvo`.
 *
 * `antes`/`depois` são na ordem VISUAL (topo → fundo, como o painel desenha), não na do
 * array — quem arrasta enxerga linhas, não índices, e "soltei acima da Planta" precisa
 * significar a mesma coisa aqui e na tela. A conversão para a ordem do array (fundo → topo)
 * mora nesta função, num lugar só, testada: espalhar um `length - 1 - i` pelo componente é
 * como se erra a metade dos casos de arrasto.
 *
 * A remoção acontece ANTES da inserção, então o índice do alvo é recalculado na lista já sem
 * a arrastada. Sem isso, arrastar de cima para baixo erra uma posição — o clássico bug de
 * lista reordenável em que a peça sempre para um lugar antes do que o usuário mirou.
 *
 * Devolve a MESMA referência quando nada muda (soltar em cima de si mesma, id desconhecido,
 * ou soltar exatamente onde já estava), para o chamador poder pular gravação e reordenação.
 */
export function reordenarCamadaSoltando(
  camadas: CamadaMapa[],
  idArrastada: string,
  idAlvo: string,
  lado: LadoSolto,
): CamadaMapa[] {
  if (idArrastada === idAlvo) return camadas
  const visual = [...camadas].reverse()
  const arrastada = visual.find((c) => c.id === idArrastada)
  if (!arrastada || !visual.some((c) => c.id === idAlvo)) return camadas

  const semEla = visual.filter((c) => c.id !== idArrastada)
  const posAlvo = semEla.findIndex((c) => c.id === idAlvo)
  semEla.splice(lado === 'antes' ? posAlvo : posAlvo + 1, 0, arrastada)

  const novo = semEla.reverse()
  const mudou = novo.some((c, i) => c.id !== camadas[i].id)
  return mudou ? novo : camadas
}

/**
 * Troca a camada do id com a vizinha na direção de Z pedida: 'cima' aproxima do observador
 * (anda para o FIM do array, ver a convenção no cabeçalho), 'baixo' afasta. Nas bordas
 * (última/cima, primeira/baixo), no-op.
 */
export function moverCamada(camadas: CamadaMapa[], id: string, direcao: 'cima' | 'baixo'): CamadaMapa[] {
  const indice = camadas.findIndex((c) => c.id === id)
  if (indice === -1) return camadas
  const alvo = direcao === 'cima' ? indice + 1 : indice - 1
  if (alvo < 0 || alvo >= camadas.length) return camadas
  const copia = [...camadas]
  ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
  return copia
}
