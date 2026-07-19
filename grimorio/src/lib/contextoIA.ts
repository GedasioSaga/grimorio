import type { CampanhaNode, Cenario, CenarioNode, PastaCenarioNode, Personagem, VaultTree, Vinculo } from './types'
import { campanhasDe, idsDaCampanha } from './vinculos'
import { filtrarArvoreCenarios } from './filtroCampanha'
import { resumoAtivo } from './cenarioVersao'
import { resumoAtivoPersonagem } from './personagemVersao'

export interface EntidadeCtx {
  nome: string
  resumo: string
}

export interface CenarioCtx extends EntidadeCtx {
  nivel: number
}

/** Campanha dona de um caminho do cofre (slug em campanhas/<slug>/...), ou null. */
export function acharCampanhaPorCaminho(tree: VaultTree, caminho: string): CampanhaNode | null {
  const m = caminho.match(/^campanhas\/([^/]+)\//)
  if (!m) return null
  return tree.campanhas.find((c) => c.slug === m[1]) ?? null
}

/** Campanha dona de uma sessão (slug em campanhas/<slug>/sessoes/...), ou null. */
export function acharCampanhaDaSessao(tree: VaultTree, caminhoSessao: string): CampanhaNode | null {
  return acharCampanhaPorCaminho(tree, caminhoSessao)
}

/** Campanha de uma entidade: 1º por vínculo 'participa'; senão (personagem) pela pasta campanhas/<slug>/. */
export function campanhaDeEntidade(
  tree: VaultTree,
  vinculos: Vinculo[],
  caminhoDe: (id: string) => string | undefined,
  entidadeId: string,
): CampanhaNode | null {
  const campId = campanhasDe(vinculos, entidadeId)[0]
  if (campId) return tree.campanhas.find((c) => c.id === campId) ?? null
  const caminho = caminhoDe(entidadeId)
  const m = caminho?.match(/^campanhas\/([^/]+)\//)
  if (m) return tree.campanhas.find((c) => c.slug === m[1]) ?? null
  return null
}

/** Frases legíveis dos vínculos ("Alice conhece Bob (nota)"); participação e órfãos fora. */
export function frasesDeVinculos(vinculos: Vinculo[], nomeDe: (id: string) => string | null): string[] {
  const out: string[] = []
  for (const v of vinculos) {
    if (v.paraTipo === 'campanha') continue
    const de = nomeDe(v.deId)
    const para = nomeDe(v.paraId)
    if (!de || !para) continue
    out.push(v.notas ? `${de} ${v.tipo} ${para} (${v.notas})` : `${de} ${v.tipo} ${para}`)
  }
  return out
}

/**
 * Frases de vínculos cujos DOIS lados estão no escopo (ids em contexto da campanha).
 * Sem escopo (set vazio) → nenhuma frase. Participação/órfãos já saem em frasesDeVinculos.
 */
export function frasesDeVinculosNoEscopo(
  vinculos: Vinculo[],
  idsEscopo: Set<string>,
  nomeDe: (id: string) => string | null,
): string[] {
  return frasesDeVinculos(
    vinculos.filter((v) => v.paraTipo !== 'campanha' && idsEscopo.has(v.deId) && idsEscopo.has(v.paraId)),
    nomeDe,
  )
}

/** Achata a árvore (já filtrada) em linhas com nível de indentação. */
export function achatarCenarios(raiz: PastaCenarioNode, resumoDe: (id: string) => string): CenarioCtx[] {
  const out: CenarioCtx[] = []
  const dosNos = (nos: CenarioNode[], nivel: number) => {
    for (const n of nos) {
      out.push({ nome: n.nome, resumo: resumoDe(n.id), nivel })
      dosNos(n.filhos, nivel + 1)
    }
  }
  dosNos(raiz.cenarios, 0)
  for (const p of raiz.subpastas) out.push(...achatarCenarios(p, resumoDe))
  return out
}

/** Contexto compacto enviado à IA; seções vazias são omitidas. */
export function montarContextoCampanha(d: {
  nomeCampanha: string
  personagens: EntidadeCtx[]
  cenarios: CenarioCtx[]
  vinculos: string[]
  notas: string
}): string {
  const secoes: string[] = []
  if (d.nomeCampanha) secoes.push(`## Campanha\n${d.nomeCampanha}`)
  if (d.personagens.length > 0) {
    secoes.push(`## Personagens\n${d.personagens
      .map((p) => (p.resumo ? `- ${p.nome} — ${p.resumo}` : `- ${p.nome}`)).join('\n')}`)
  }
  if (d.cenarios.length > 0) {
    secoes.push(`## Cenários\n${d.cenarios
      .map((c) => `${'  '.repeat(c.nivel)}- ${c.nome}${c.resumo ? ` — ${c.resumo}` : ''}`).join('\n')}`)
  }
  if (d.vinculos.length > 0) secoes.push(`## Vínculos\n${d.vinculos.map((v) => `- ${v}`).join('\n')}`)
  if (d.notas) secoes.push(`## Notas da sessão\n${d.notas}`)
  return secoes.join('\n\n')
}

/** Dados do store necessários para montar o contexto (estrutural: aceita Personagem/Cenário reais). */
export interface DepsContexto {
  tree: VaultTree
  personagens: Record<string, Pick<Personagem, 'id' | 'nome' | 'versoes' | 'versaoAtivaId'>>
  cenarios: Record<string, Pick<Cenario, 'id' | 'nome' | 'versoes' | 'versaoAtivaId'>>
  vinculos: Vinculo[]
}

/**
 * Contexto textual da campanha: personagens, cenários e vínculos no escopo dela.
 * Núcleo compartilhado — antes vivia dentro do AcoesIA (só servia entidade); agora
 * serve modais (por entidade) e escrita (por caminho do caderno).
 */
export function montarContextoDaCampanha(camp: CampanhaNode, deps: DepsContexto): string {
  const { tree, personagens, cenarios, vinculos } = deps
  const ids = idsDaCampanha(vinculos, camp.id)
  const parts = Object.values(personagens)
    .filter((p) => ids.has(p.id))
    .map((p) => ({ nome: p.nome, resumo: resumoAtivoPersonagem(p) }))
  const linhasCen = achatarCenarios(filtrarArvoreCenarios(tree.cenarios, ids), (id) => resumoAtivo(cenarios[id]))
  const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null
  return montarContextoCampanha({
    nomeCampanha: camp.nome,
    personagens: parts,
    cenarios: linhasCen,
    vinculos: frasesDeVinculosNoEscopo(vinculos, ids, nomeDe),
    notas: '',
  })
}

/** Contexto a partir de uma entidade (modais): acha a campanha por vínculo 'participa' ou pasta. */
export function contextoDeEntidade(
  entidadeId: string,
  deps: DepsContexto & { caminhoPorId: Record<string, string | undefined> },
): string {
  const camp = campanhaDeEntidade(deps.tree, deps.vinculos, (id) => deps.caminhoPorId[id], entidadeId)
  return camp ? montarContextoDaCampanha(camp, deps) : ''
}

/** Contexto a partir de um caminho do cofre (escrita): acha a campanha pelo slug do caminho. */
export function contextoDoCaminho(caminho: string, deps: DepsContexto): string {
  const camp = acharCampanhaPorCaminho(deps.tree, caminho)
  return camp ? montarContextoDaCampanha(camp, deps) : ''
}
