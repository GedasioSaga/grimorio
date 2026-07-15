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

/**
 * Permitido se herdou do pai OU se o id está no conjunto: cenário permitido
 * traz a subárvore INTEIRA (filhos herdam a permissão). Ancestral de
 * permitido também fica, como contexto.
 */
function filtrarCenarios(nos: CenarioNode[], ids: Set<string>, herdado: boolean): CenarioNode[] {
  const out: CenarioNode[] = []
  for (const n of nos) {
    const permitido = herdado || ids.has(n.id)
    const filhos = filtrarCenarios(n.filhos, ids, permitido)
    if (permitido || filhos.length > 0) out.push({ ...n, filhos })
  }
  return out
}

/** Filtra a árvore de cenários por ids permitidos (subárvore herda); pastas vazias são podadas. */
export function filtrarArvoreCenarios(raiz: PastaCenarioNode, ids: Set<string>): PastaCenarioNode {
  const cenarios = filtrarCenarios(raiz.cenarios, ids, false)
  const subpastas = raiz.subpastas
    .map((s) => filtrarArvoreCenarios(s, ids))
    .filter((s) => s.cenarios.length > 0 || s.subpastas.length > 0)
  return { ...raiz, cenarios, subpastas }
}
