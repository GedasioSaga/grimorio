import type { CenarioNode, ItemRef, PastaCenarioNode, PastaItemNode, PastaNode } from './types'

/**
 * As raízes ('personagens-soltos', 'cenarios') nunca podem ser "permitidas": uma raiz
 * permitida repassa a subárvore inteira com herdado = true, ou seja, a seção pára de
 * ser filtrada — em silêncio e por completo. Hoje elas não têm pasta.json e portanto
 * não têm id, mas isso é acidente, não garantia: montarArvorePastas trata raiz e
 * subpasta pelo mesmo caminho, e um pasta.json na raiz daria id a ela.
 */
function ehRaiz(caminho: string): boolean {
  return !caminho.includes('/')
}

/**
 * Filtra a árvore de personagens soltos.
 *
 * Pasta com campanha que casa (ou herdada do pai) libera a subárvore INTEIRA, mesmo
 * vazia — é o que faz "pasta da campanha X" significar algo no filtro. Pasta sem
 * campanha, ou de campanha que não casa, mantém a regra antiga: fica o que casa por
 * caminho, e subpasta que esvazia é podada.
 */
export function filtrarPastaPersonagens(
  pasta: PastaNode,
  caminhosPermitidos: Set<string>,
  idsPermitidos: Set<string> = new Set(),
  herdado = false,
): PastaNode {
  const permitida = herdado || (!ehRaiz(pasta.caminho) && !!pasta.id && idsPermitidos.has(pasta.id))
  if (permitida) {
    return {
      ...pasta,
      subpastas: pasta.subpastas.map((s) => filtrarPastaPersonagens(s, caminhosPermitidos, idsPermitidos, true)),
    }
  }
  const personagens = pasta.personagens.filter((p) => caminhosPermitidos.has(p.caminho))
  const subpastas = pasta.subpastas
    .map((s) => filtrarPastaPersonagens(s, caminhosPermitidos, idsPermitidos, false))
    // a 3ª condição segura a pasta etiquetada que está legitimamente vazia
    .filter((s) => s.personagens.length > 0 || s.subpastas.length > 0 || (!!s.id && idsPermitidos.has(s.id)))
  return { ...pasta, personagens, subpastas }
}

/**
 * Filtra a árvore de itens. Irmã de `filtrarPastaPersonagens`, com a mesma regra de pasta
 * etiquetada liberando a subárvore inteira. São funções separadas em vez de uma genérica
 * porque a folha tem nome diferente em cada seção (`personagens` × `itens`), e o genérico
 * que unificasse as duas custaria mais em leitura do que as poucas linhas que economiza.
 */
export function filtrarPastaItens(
  pasta: PastaItemNode,
  caminhosPermitidos: Set<string>,
  idsPermitidos: Set<string> = new Set(),
  herdado = false,
): PastaItemNode {
  const permitida = herdado || (!ehRaiz(pasta.caminho) && !!pasta.id && idsPermitidos.has(pasta.id))
  if (permitida) {
    return {
      ...pasta,
      subpastas: pasta.subpastas.map((s) => filtrarPastaItens(s, caminhosPermitidos, idsPermitidos, true)),
    }
  }
  const itens = pasta.itens.filter((i) => caminhosPermitidos.has(i.caminho))
  const subpastas = pasta.subpastas
    .map((s) => filtrarPastaItens(s, caminhosPermitidos, idsPermitidos, false))
    // a 3ª condição segura a pasta etiquetada que está legitimamente vazia
    .filter((s) => s.itens.length > 0 || s.subpastas.length > 0 || (!!s.id && idsPermitidos.has(s.id)))
  return { ...pasta, itens, subpastas }
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

/** Filtra cenários por ids permitidos (subárvore herda); ver regra de pasta em filtrarPastaPersonagens. */
export function filtrarArvoreCenarios(
  raiz: PastaCenarioNode,
  ids: Set<string>,
  herdado = false,
): PastaCenarioNode {
  const permitida = herdado || (!ehRaiz(raiz.caminho) && !!raiz.id && ids.has(raiz.id))
  if (permitida) {
    return { ...raiz, subpastas: raiz.subpastas.map((s) => filtrarArvoreCenarios(s, ids, true)) }
  }
  const cenarios = filtrarCenarios(raiz.cenarios, ids, false)
  const subpastas = raiz.subpastas
    .map((s) => filtrarArvoreCenarios(s, ids, false))
    .filter((s) => s.cenarios.length > 0 || s.subpastas.length > 0 || (!!s.id && ids.has(s.id)))
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

/** Total de itens na árvore (recursivo) — para o aviso de "N ocultos pelo filtro". */
export function contarItens(raiz: PastaItemNode): number {
  return raiz.itens.length + raiz.subpastas.reduce((acc, s) => acc + contarItens(s), 0)
}
