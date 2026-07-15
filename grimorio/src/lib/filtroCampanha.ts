import type { CenarioNode, PastaCenarioNode, PastaNode } from './types'

/**
 * Filtra a árvore de personagens soltos: mantém personagens cujo CAMINHO está no
 * conjunto e poda subpastas que ficarem sem nada (personagem é referenciado por
 * caminho na árvore; o chamador converte ids → caminhos via caminhoPorId).
 */
export function filtrarPastaPersonagens(pasta: PastaNode, caminhosPermitidos: Set<string>): PastaNode {
  const personagens = pasta.personagens.filter((p) => caminhosPermitidos.has(p.caminho))
  const subpastas = pasta.subpastas
    .map((s) => filtrarPastaPersonagens(s, caminhosPermitidos))
    .filter((s) => s.personagens.length > 0 || s.subpastas.length > 0)
  return { ...pasta, personagens, subpastas }
}

/** Mantém o cenário se o id é permitido OU se algum descendente é (ancestral fica p/ contexto). */
function filtrarCenarios(nos: CenarioNode[], ids: Set<string>): CenarioNode[] {
  const out: CenarioNode[] = []
  for (const n of nos) {
    const filhos = filtrarCenarios(n.filhos, ids)
    if (ids.has(n.id) || filhos.length > 0) out.push({ ...n, filhos })
  }
  return out
}

/** Filtra a árvore de cenários por ids permitidos; pastas vazias são podadas. */
export function filtrarArvoreCenarios(raiz: PastaCenarioNode, ids: Set<string>): PastaCenarioNode {
  const cenarios = filtrarCenarios(raiz.cenarios, ids)
  const subpastas = raiz.subpastas
    .map((s) => filtrarArvoreCenarios(s, ids))
    .filter((s) => s.cenarios.length > 0 || s.subpastas.length > 0)
  return { ...raiz, cenarios, subpastas }
}
