import type { CenarioNode, PastaCenarioNode, PastaNode } from './types'

/**
 * Filtra a árvore de personagens soltos: mantém personagens cujo CAMINHO está no
 * conjunto (o chamador converte ids → caminhos via caminhoPorId). PASTAS ficam
 * sempre visíveis — filtro esconde entidades, não estrutura; senão uma pasta
 * recém-criada (vazia) sumiria e criar pareceria quebrado.
 */
export function filtrarPastaPersonagens(pasta: PastaNode, caminhosPermitidos: Set<string>): PastaNode {
  const personagens = pasta.personagens.filter((p) => caminhosPermitidos.has(p.caminho))
  const subpastas = pasta.subpastas.map((s) => filtrarPastaPersonagens(s, caminhosPermitidos))
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

/** Filtra cenários por ids permitidos (subárvore herda); pastas ficam sempre visíveis. */
export function filtrarArvoreCenarios(raiz: PastaCenarioNode, ids: Set<string>): PastaCenarioNode {
  const cenarios = filtrarCenarios(raiz.cenarios, ids, false)
  const subpastas = raiz.subpastas.map((s) => filtrarArvoreCenarios(s, ids))
  return { ...raiz, cenarios, subpastas }
}

/** Total de personagens na árvore (recursivo) — para o aviso de "N ocultos pelo filtro". */
export function contarPersonagens(pasta: PastaNode): number {
  return pasta.personagens.length + pasta.subpastas.reduce((acc, s) => acc + contarPersonagens(s), 0)
}

function contarNos(nos: CenarioNode[]): number {
  return nos.reduce((acc, n) => acc + 1 + contarNos(n.filhos), 0)
}

/** Total de cenários na árvore, incluindo sub-cenários (recursivo). */
export function contarCenarios(raiz: PastaCenarioNode): number {
  return contarNos(raiz.cenarios) + raiz.subpastas.reduce((acc, s) => acc + contarCenarios(s), 0)
}
