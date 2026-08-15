import { normalizar, pontuar, rotuloDe, type Pontuacao } from './buscaArvore'
import type {
  CampanhaNode, CenarioNode, ItemRef, PastaCenarioNode, PastaItemNode, PastaNode, VaultTree,
} from './types'

/**
 * Busca Ctrl+K: acha qualquer entidade do cofre por pedaço do nome, ignorando acento e caixa.
 *
 * Diferente de `buscaArvore.ts` (uma seção da sidebar por vez), aqui a árvore INTEIRA vira uma
 * lista plana só: personagens, cenários, itens, canvases, mapas, sessões e cadernos de escrita,
 * tanto soltos quanto dentro de campanha. A pontuação (prefixo/palavra/meio) e o corte do rótulo
 * de ancestrais são os MESMOS de `buscaArvore.ts` — reusados, não reimplementados.
 */

export type TipoResultadoGlobal = 'personagem' | 'cenario' | 'item' | 'canvas' | 'mapa' | 'sessao' | 'escrita'

export interface ResultadoGlobal {
  tipo: TipoResultadoGlobal
  nome: string
  /** caminho do arquivo/dir no cofre — único por entidade, vira a key da lista */
  caminho: string
  /** pasta/cenário-pai/campanha que contém a entidade; '' quando não há contexto a mostrar */
  caminhoRotulo: string
  pontuacao: Pontuacao
  /** entidade original, para quem for abrir resolver o `id` do jeito que a sidebar resolve */
  ref: ItemRef | CenarioNode
}

/**
 * Desempate final quando classe, posição, tamanho do nome E o nome em si empatam (mesmo nome,
 * tipos diferentes — ex.: cenário "Taverna" e item "Taverna" de brinquedo). A ordem abaixo é a
 * ordem em que cada categoria entra na varredura; Array.prototype.sort é estável, então na
 * prática isto só formaliza o que já aconteceria — mas fica explícito em vez de acidental.
 */
const ORDEM_TIPO: Record<TipoResultadoGlobal, number> = {
  personagem: 0, item: 1, cenario: 2, canvas: 3, mapa: 4, sessao: 5, escrita: 6,
}

function comparar(a: ResultadoGlobal, b: ResultadoGlobal): number {
  return (
    a.pontuacao.classe - b.pontuacao.classe ||
    a.pontuacao.posicao - b.pontuacao.posicao ||
    a.nome.length - b.nome.length ||
    a.nome.localeCompare(b.nome, 'pt-BR') ||
    ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]
  )
}

function daPastaPersonagens(pasta: PastaNode, termo: string, ancestrais: string[], out: ResultadoGlobal[]) {
  for (const p of pasta.personagens) {
    const pontuacao = pontuar(p.nome, termo)
    if (pontuacao) out.push({ tipo: 'personagem', nome: p.nome, caminho: p.caminho, caminhoRotulo: rotuloDe(ancestrais), pontuacao, ref: p })
  }
  for (const sub of pasta.subpastas) daPastaPersonagens(sub, termo, [...ancestrais, sub.nome], out)
}

function daPastaItens(pasta: PastaItemNode, termo: string, ancestrais: string[], out: ResultadoGlobal[]) {
  for (const i of pasta.itens) {
    const pontuacao = pontuar(i.nome, termo)
    if (pontuacao) out.push({ tipo: 'item', nome: i.nome, caminho: i.caminho, caminhoRotulo: rotuloDe(ancestrais), pontuacao, ref: i })
  }
  for (const sub of pasta.subpastas) daPastaItens(sub, termo, [...ancestrais, sub.nome], out)
}

function dosCenarios(nos: CenarioNode[], termo: string, ancestrais: string[], out: ResultadoGlobal[]) {
  for (const n of nos) {
    const pontuacao = pontuar(n.nome, termo)
    if (pontuacao) out.push({ tipo: 'cenario', nome: n.nome, caminho: n.caminho, caminhoRotulo: rotuloDe(ancestrais), pontuacao, ref: n })
    // cenário pai entra no rótulo do filho, igual buscarCenarios em buscaArvore.ts
    dosCenarios(n.filhos, termo, [...ancestrais, n.nome], out)
  }
}

function daPastaCenarios(pasta: PastaCenarioNode, termo: string, ancestrais: string[], out: ResultadoGlobal[]) {
  dosCenarios(pasta.cenarios, termo, ancestrais, out)
  for (const sub of pasta.subpastas) daPastaCenarios(sub, termo, [...ancestrais, sub.nome], out)
}

function daLista(itens: ItemRef[], tipo: TipoResultadoGlobal, rotulo: string, termo: string, out: ResultadoGlobal[]) {
  for (const i of itens) {
    const pontuacao = pontuar(i.nome, termo)
    if (pontuacao) out.push({ tipo, nome: i.nome, caminho: i.caminho, caminhoRotulo: rotulo, pontuacao, ref: i })
  }
}

/** Busca em TODO o cofre: personagens, cenários, itens, canvas/mapa soltos e de campanha. */
export function buscarGlobal(tree: VaultTree | null, termo: string): ResultadoGlobal[] {
  if (!tree || !normalizar(termo)) return []
  const out: ResultadoGlobal[] = []

  daPastaPersonagens(tree.personagensSoltos, termo, [], out)
  daPastaItens(tree.itens, termo, [], out)
  daPastaCenarios(tree.cenarios, termo, [], out)
  daLista(tree.canvasesSoltos, 'canvas', '', termo, out)
  daLista(tree.mapasSoltos, 'mapa', '', termo, out)

  for (const camp of tree.campanhas as CampanhaNode[]) {
    daLista(camp.personagens, 'personagem', camp.nome, termo, out)
    daLista(camp.canvases, 'canvas', camp.nome, termo, out)
    daLista(camp.sessoes, 'sessao', camp.nome, termo, out)
    daLista(camp.escritas, 'escrita', camp.nome, termo, out)
  }

  return out.sort(comparar)
}
