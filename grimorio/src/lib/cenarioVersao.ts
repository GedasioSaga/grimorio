import type { Cenario, VersaoCenario } from './types'

/** Campos de conteúdo que pertencem à VERSÃO ativa (não ao cenário como um todo). */
export const CHAVES_VERSAO = [
  'retrato', 'resumo', 'descricao', 'informacao',
  'historia', 'eventos', 'itens', 'anotacoes', 'imagens',
] as const

/** Patch de salvarCenarioParcial/agendarSalvar: chaves de conteúdo vão pra versão ativa; o resto, pro cenário. */
export type PatchCenario =
  Partial<Pick<Cenario, 'nome' | 'personagens' | 'versaoAtivaId' | 'modificadoEm'>> &
  Partial<Omit<VersaoCenario, 'id' | 'nome'>>

type CenarioMin = Pick<Cenario, 'versoes' | 'versaoAtivaId'>

/** Versão ativa; cai na primeira se o id ativo não existir (sempre há ≥1 versão). */
export function versaoAtiva(c: CenarioMin): VersaoCenario {
  return c.versoes.find((v) => v.id === c.versaoAtivaId) ?? c.versoes[0]
}

/** Id da versão vizinha (cíclico): dir=+1 próxima, dir=-1 anterior. */
export function versaoVizinha(c: CenarioMin, dir: 1 | -1): string {
  const i = c.versoes.findIndex((v) => v.id === c.versaoAtivaId)
  const base = i < 0 ? 0 : i
  const n = c.versoes.length
  return c.versoes[(base + dir + n) % n].id
}

/** Resumo da versão ativa (ou '' se cenário ausente). */
export function resumoAtivo(c: CenarioMin | undefined): string {
  return c ? versaoAtiva(c).resumo : ''
}

/** Retrato (rel) da versão ativa (ou null). */
export function retratoAtivo(c: CenarioMin | undefined): string | null {
  return c ? versaoAtiva(c).retrato : null
}

const SET_CHAVES_VERSAO: ReadonlySet<string> = new Set(CHAVES_VERSAO)

/** Aplica um patch: chaves de conteúdo entram na versão ativa; o resto, no topo. Puro (novo objeto). */
export function aplicarPatchCenario(c: Cenario, patch: PatchCenario): Cenario {
  const versaoPatch: Record<string, unknown> = {}
  const cenarioPatch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (SET_CHAVES_VERSAO.has(k)) versaoPatch[k] = v
    else cenarioPatch[k] = v
  }
  const idAtiva = c.versoes.some((v) => v.id === c.versaoAtivaId) ? c.versaoAtivaId : c.versoes[0]?.id
  const versoes = Object.keys(versaoPatch).length > 0
    ? c.versoes.map((v) => (v.id === idAtiva ? { ...v, ...versaoPatch } : v))
    : c.versoes
  return { ...c, ...cenarioPatch, versoes } as Cenario
}
