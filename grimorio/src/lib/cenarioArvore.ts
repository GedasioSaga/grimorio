import type { CenarioNode, PastaCenarioNode } from './types'

/** Busca um cenário por id na árvore (pastas + cenários aninhados). */
export function encontrarCenarioNode(raiz: PastaCenarioNode, id: string): CenarioNode | null {
  const nosCenarios = (nos: CenarioNode[]): CenarioNode | null => {
    for (const n of nos) {
      if (n.id === id) return n
      const achado = nosCenarios(n.filhos)
      if (achado) return achado
    }
    return null
  }
  const achado = nosCenarios(raiz.cenarios)
  if (achado) return achado
  for (const p of raiz.subpastas) {
    const sub = encontrarCenarioNode(p, id)
    if (sub) return sub
  }
  return null
}

/** Coleta refs de todos os cenários da árvore (carga do cache no store). */
export function coletarCenarioRefs(raiz: PastaCenarioNode): CenarioNode[] {
  const out: CenarioNode[] = []
  const dosCenarios = (nos: CenarioNode[]) => {
    for (const n of nos) {
      out.push(n)
      dosCenarios(n.filhos)
    }
  }
  dosCenarios(raiz.cenarios)
  for (const p of raiz.subpastas) out.push(...coletarCenarioRefs(p))
  return out
}

/** Quantos sub-cenários (em qualquer profundidade) — usado no confirm de exclusão. */
export function contarDescendentes(n: CenarioNode): number {
  return n.filhos.reduce((acc, f) => acc + 1 + contarDescendentes(f), 0)
}

/** Id do pai de um cenário na árvore, ou null se for raiz / não existir. */
export function paiDoCenario(raiz: PastaCenarioNode, id: string): string | null {
  const emFilhos = (nos: CenarioNode[]): string | null => {
    for (const n of nos) {
      if (n.filhos.some((f) => f.id === id)) return n.id
      const achado = emFilhos(n.filhos)
      if (achado) return achado
    }
    return null
  }
  const nasPastas = (p: PastaCenarioNode): string | null => {
    const achado = emFilhos(p.cenarios)
    if (achado) return achado
    for (const sub of p.subpastas) {
      const achadoSub = nasPastas(sub)
      if (achadoSub) return achadoSub
    }
    return null
  }
  return nasPastas(raiz)
}
