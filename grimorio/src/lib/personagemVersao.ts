import type { Personagem, VersaoPersonagem } from './types'

// nome É por-versão (transformação). O top-level Personagem.nome é ESPELHO da versão ativa.
export const CHAVES_VERSAO_PERSONAGEM = [
  'nome', 'retrato', 'resumo', 'descricao', 'informacao', 'historia', 'extras', 'anotacoes', 'imagens',
] as const

export type PatchPersonagem =
  Partial<Pick<Personagem, 'versaoAtivaId' | 'modificadoEm'>> &
  Partial<Omit<VersaoPersonagem, 'id'>>

type PersonagemMin = Pick<Personagem, 'versoes' | 'versaoAtivaId'>

export function versaoAtivaPersonagem(p: PersonagemMin): VersaoPersonagem {
  return p.versoes.find((v) => v.id === p.versaoAtivaId) ?? p.versoes[0]
}

export function versaoVizinhaPersonagem(p: PersonagemMin, dir: 1 | -1): string {
  const i = p.versoes.findIndex((v) => v.id === p.versaoAtivaId)
  const base = i < 0 ? 0 : i
  const n = p.versoes.length
  return p.versoes[(base + dir + n) % n].id
}

export function resumoAtivoPersonagem(p: PersonagemMin | undefined): string {
  return p ? versaoAtivaPersonagem(p).resumo : ''
}
export function retratoAtivoPersonagem(p: PersonagemMin | undefined): string | null {
  return p ? versaoAtivaPersonagem(p).retrato : null
}

/** Força o top-level `nome` a espelhar o nome da versão ativa (sidebar/vínculos/refs). */
export function comNomeEspelho(p: Personagem): Personagem {
  return { ...p, nome: versaoAtivaPersonagem(p).nome }
}

const SET_CHAVES: ReadonlySet<string> = new Set(CHAVES_VERSAO_PERSONAGEM)

/** Roteia conteúdo (inclui `nome`) pra versão ativa; chaves de topo pro personagem; recomputa o espelho. Puro. */
export function aplicarPatchPersonagem(p: Personagem, patch: PatchPersonagem): Personagem {
  const versaoPatch: Record<string, unknown> = {}
  const topPatch: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(patch)) {
    if (SET_CHAVES.has(k)) versaoPatch[k] = val
    else topPatch[k] = val
  }
  const idAtiva = p.versoes.some((v) => v.id === p.versaoAtivaId) ? p.versaoAtivaId : p.versoes[0]?.id
  const versoes = Object.keys(versaoPatch).length > 0
    ? p.versoes.map((v) => (v.id === idAtiva ? { ...v, ...versaoPatch } : v))
    : p.versoes
  return comNomeEspelho({ ...p, ...topPatch, versoes } as Personagem)
}
