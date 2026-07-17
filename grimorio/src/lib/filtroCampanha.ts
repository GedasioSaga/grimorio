import type { CenarioNode, ItemRef, PastaCenarioNode, PastaNode } from './types'

/**
 * Filtra a árvore de personagens soltos: mantém personagens cujo CAMINHO está no
 * conjunto (o chamador converte ids → caminhos via caminhoPorId). Subpastas que
 * ficam sem nenhum personagem da campanha (nem em subpastas) são PODADAS — o filtro
 * só roda sob campanha ativa, e item criado sob filtro já é etiquetado, então sua
 * pasta permanece; some só o que não pertence à campanha.
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

/** Filtra cenários por ids permitidos (subárvore herda); pastas sem cenário da campanha são podadas. */
export function filtrarArvoreCenarios(raiz: PastaCenarioNode, ids: Set<string>): PastaCenarioNode {
  const cenarios = filtrarCenarios(raiz.cenarios, ids, false)
  const subpastas = raiz.subpastas
    .map((s) => filtrarArvoreCenarios(s, ids))
    .filter((s) => s.cenarios.length > 0 || s.subpastas.length > 0)
  return { ...raiz, cenarios, subpastas }
}

/**
 * Filtra canvases soltos pelos ids permitidos (etiqueta de campanha). Canvas sem id
 * (legado/ilegível) fica visível — filtro não esconde arquivo que não sabe classificar.
 */
export function filtrarCanvasesSoltos(itens: ItemRef[], ids: Set<string>): ItemRef[] {
  return itens.filter((i) => !i.id || ids.has(i.id))
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
