/**
 * Traduz o cofre no grafo que a tela desenha: quem existe (nós) e quem se relaciona
 * com quem (arestas). Lógica pura — recebe os caches já carregados, não toca no store.
 *
 * O dado já estava todo em `vinculos.json` desde sempre; o que faltava era esta forma.
 */
import type { Cenario, FocoRetrato, Item, Personagem, TipoAlvoVinculo, Vinculo } from './types'
import { idsDaCampanha } from './vinculos'

/** Retrato da entidade, como o nó precisa dele para desenhar a miniatura. */
export interface RetratoNo {
  /** Caminho relativo ao cofre — quem resolve para uma URL é a camada de UI. */
  rel: string
  /** Enquadramento escolhido no perfil; ausente = centro. */
  foco?: FocoRetrato
}

export interface NoTeia {
  id: string
  nome: string
  tipo: TipoAlvoVinculo
  /** Aparece ao passar o mouse; '' quando a entidade não tem resumo. */
  resumo: string
  /** Miniatura do nó; `null` cai no ícone do tipo. */
  retrato: RetratoNo | null
}

export interface ArestaTeia {
  de: string
  para: string
  /** Todos os tipos de relação entre este par, já sem repetição ('conhece, deve favor a'). */
  rotulo: string
}

export interface Teia {
  nos: NoTeia[]
  arestas: ArestaTeia[]
  /**
   * Quantas relações foram descartadas por apontarem para algo que não existe mais.
   * Contado em vez de escondido: vínculo órfão é sintoma de exclusão incompleta, e a tela
   * consegue dizer isso em vez de simplesmente desenhar de menos.
   */
  orfas: number
}

export interface DepsTeia {
  personagens: Record<string, Pick<Personagem, 'id' | 'nome'> & { versoes?: unknown }>
  cenarios: Record<string, Pick<Cenario, 'id' | 'nome'> & { versoes?: unknown }>
  itens: Record<string, Pick<Item, 'id' | 'nome' | 'resumo'>>
  vinculos: Vinculo[]
  /** id da campanha para recortar o grafo; null = o cofre inteiro. */
  campanhaId?: string | null
  /** Resumo da versão ativa (a lib de versão vive fora daqui; a UI injeta). */
  resumoDe?: (id: string) => string
  /**
   * Retrato da entidade. Injetado pelo mesmo motivo do resumo: em personagem e cenário ele
   * mora na VERSÃO ativa, e resolver isso aqui traria a lib de versões para dentro de um
   * módulo que só quer saber de nós e arestas.
   */
  retratoDe?: (id: string) => RetratoNo | null
}

/** Chave estável de um par, independente da direção — 'a|b' e 'b|a' caem no mesmo balde. */
function chaveDoPar(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Monta a teia. Sob filtro de campanha, entram só as entidades que participam dela e as
 * relações cujas DUAS pontas estão dentro — meia relação apontando para fora da campanha
 * desenharia uma linha até um nó que não está na tela.
 */
export function montarTeia(deps: DepsTeia): Teia {
  const { personagens, cenarios, itens, vinculos, campanhaId = null, resumoDe, retratoDe } = deps

  const doEscopo = campanhaId ? idsDaCampanha(vinculos, campanhaId) : null
  const dentro = (id: string) => !doEscopo || doEscopo.has(id)

  const nos: NoTeia[] = []
  const porId = new Map<string, NoTeia>()
  const adicionar = (id: string, nome: string, tipo: TipoAlvoVinculo, resumo: string) => {
    if (!dentro(id) || porId.has(id)) return
    const no: NoTeia = { id, nome, tipo, resumo, retrato: retratoDe?.(id) ?? null }
    nos.push(no)
    porId.set(id, no)
  }

  for (const p of Object.values(personagens)) adicionar(p.id, p.nome, 'personagem', resumoDe?.(p.id) ?? '')
  for (const c of Object.values(cenarios)) adicionar(c.id, c.nome, 'cenario', resumoDe?.(c.id) ?? '')
  for (const i of Object.values(itens)) adicionar(i.id, i.nome, 'item', i.resumo ?? '')

  // um par de entidades vira UMA aresta, com os tipos somados no rótulo: duas linhas
  // paralelas entre os mesmos dois nós seriam ruído, não informação
  const porPar = new Map<string, { de: string; para: string; tipos: string[] }>()
  let orfas = 0
  for (const v of vinculos) {
    if (v.paraTipo === 'campanha') continue
    if (!porId.has(v.deId) || !porId.has(v.paraId)) {
      // fora do filtro não é órfã: a entidade existe, só não está nesta campanha
      if (dentro(v.deId) && dentro(v.paraId)) orfas++
      continue
    }
    if (v.deId === v.paraId) continue // laço em si mesmo não desenha nada legível
    const chave = chaveDoPar(v.deId, v.paraId)
    const grupo = porPar.get(chave)
    if (grupo) {
      if (!grupo.tipos.includes(v.tipo)) grupo.tipos.push(v.tipo)
    } else {
      porPar.set(chave, { de: v.deId, para: v.paraId, tipos: [v.tipo] })
    }
  }

  const arestas: ArestaTeia[] = [...porPar.values()].map((g) => ({
    de: g.de, para: g.para, rotulo: g.tipos.join(', '),
  }))

  return { nos, arestas, orfas }
}

/** Ids ligados a `id` por pelo menos uma relação (para destacar a vizinhança no clique). */
export function vizinhos(arestas: ArestaTeia[], id: string): Set<string> {
  const out = new Set<string>()
  for (const a of arestas) {
    if (a.de === id) out.add(a.para)
    else if (a.para === id) out.add(a.de)
  }
  return out
}
