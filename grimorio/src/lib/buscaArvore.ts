import type { CenarioNode, ItemRef, PastaCenarioNode, PastaItemNode, PastaNode } from './types'

/**
 * Busca por nome nas seções de Personagens, Cenários e Itens da sidebar.
 *
 * Diferente de `filtroCampanha`, que PODA a árvore devolvendo outra árvore, aqui a árvore é
 * ACHATADA: enquanto há texto a seção vira lista plana ordenada do mais parecido pro menos.
 * Por isso os dois vivem em módulos separados, mesmo servindo à mesma sidebar.
 */

/** Nome começa com o termo. */
export const CLASSE_PREFIXO = 0
/** Alguma palavra do nome começa com o termo ("Reino de Goa: Castelo" para "cast"). */
export const CLASSE_PALAVRA = 1
/** Termo aparece no meio de uma palavra ("Alcaste" para "cast"). */
export const CLASSE_MEIO = 2

export interface Pontuacao {
  classe: typeof CLASSE_PREFIXO | typeof CLASSE_PALAVRA | typeof CLASSE_MEIO
  /** índice da melhor ocorrência no nome normalizado */
  posicao: number
}

export interface Achado<T> {
  item: T
  /** pastas (e cenários pais) acima do item, sem a raiz; '' quando o item está na raiz */
  caminhoRotulo: string
  pontuacao: Pontuacao
}

/** Quantos níveis de ancestral o rótulo mostra antes de cortar com '…/'. */
const MAX_NIVEIS_ROTULO = 2

/**
 * Minúsculas e sem acento, para "joao" achar "João".
 *
 * Tolera entrada que não é string. Parece defensivo demais para um helper de texto, e não é:
 * o que entra aqui é NOME DE ENTIDADE lido do disco, e o cofre é dado do usuário — um `.json`
 * gravado pela metade, uma página sem `titulo`, um arquivo editado à mão. Sem esta guarda, um
 * único campo faltando derruba a tela inteira do app (`s.normalize` de `undefined`), que foi
 * exatamente o que aconteceu com a busca global. Todo o resto do app já trata arquivo torto
 * marcando `erro: true` e seguindo; a busca era a única peça que quebrava.
 *
 * O aviso no console existe para o dado torto não sumir de vista: degradar em silêncio
 * esconderia a causa, e o sintoma voltaria noutro lugar.
 */
export function normalizar(s: string): string {
  if (typeof s !== 'string') {
    console.warn('Busca: esperava texto e recebeu', s, '— entidade sem nome no cofre?')
    return ''
  }
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/** Caractere que não é letra nem número separa palavras — inclui espaço, ':', '-', '/'. */
function ehInicioDePalavra(base: string, i: number): boolean {
  return !/[\p{L}\p{N}]/u.test(base[i - 1])
}

/**
 * Classifica quão bem o nome casa com o termo, ou null se não casa.
 * Varre TODAS as ocorrências: em "Alcaste Castelo" o primeiro match de "cast" é no meio de
 * uma palavra, mas o segundo abre "Castelo" — vale a melhor, não a primeira.
 */
export function pontuar(nome: string, termo: string): Pontuacao | null {
  const alvo = normalizar(termo)
  if (!alvo) return null
  const base = normalizar(nome)
  let melhor: Pontuacao | null = null
  for (let i = base.indexOf(alvo); i >= 0; i = base.indexOf(alvo, i + 1)) {
    const classe = i === 0 ? CLASSE_PREFIXO : ehInicioDePalavra(base, i) ? CLASSE_PALAVRA : CLASSE_MEIO
    // varredura é da esquerda pra direita, então a primeira de cada classe já é a mais cedo
    if (!melhor || classe < melhor.classe) melhor = { classe, posicao: i }
    if (melhor.classe === CLASSE_PREFIXO) break
  }
  return melhor
}

/** Exportado para `buscaGlobal.ts` reusar a mesma regra de corte — a busca Ctrl+K
 * varre entidades fora da árvore de uma seção só, mas o rótulo de ancestrais é idêntico. */
export function rotuloDe(ancestrais: string[]): string {
  if (ancestrais.length <= MAX_NIVEIS_ROTULO) return ancestrais.join('/')
  return `…/${ancestrais.slice(-MAX_NIVEIS_ROTULO).join('/')}`
}

function ordenar<T extends { nome: string }>(achados: Achado<T>[]): Achado<T>[] {
  return achados.sort((a, b) =>
    a.pontuacao.classe - b.pontuacao.classe ||
    a.pontuacao.posicao - b.pontuacao.posicao ||
    a.item.nome.length - b.item.nome.length ||
    a.item.nome.localeCompare(b.item.nome, 'pt-BR'))
}

/**
 * Filtra e ordena uma lista já achatada (fora da árvore da sidebar) pelo nome — usado por
 * diálogos que escolhem uma entidade existente (ex.: nova transformação num personagem/
 * cenário já criado, ou o cenário-pai de um subcenário novo).
 */
export function filtrarPorNome<T extends { nome: string }>(itens: T[], termo: string): T[] {
  if (!normalizar(termo)) return []
  const achados: Achado<T>[] = []
  for (const item of itens) {
    const pontuacao = pontuar(item.nome, termo)
    if (pontuacao) achados.push({ item, caminhoRotulo: '', pontuacao })
  }
  return ordenar(achados).map((a) => a.item)
}

/** Personagens da árvore cujo nome casa com o termo, do mais parecido pro menos. */
export function buscarPersonagens(raiz: PastaNode, termo: string): Achado<ItemRef>[] {
  if (!normalizar(termo)) return []
  const achados: Achado<ItemRef>[] = []
  const daPasta = (pasta: PastaNode, ancestrais: string[]) => {
    for (const p of pasta.personagens) {
      const pontuacao = pontuar(p.nome, termo)
      if (pontuacao) achados.push({ item: p, caminhoRotulo: rotuloDe(ancestrais), pontuacao })
    }
    for (const sub of pasta.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(raiz, [])
  return ordenar(achados)
}

/** Itens da árvore cujo nome casa com o termo, do mais parecido pro menos. */
export function buscarItens(raiz: PastaItemNode, termo: string): Achado<ItemRef>[] {
  if (!normalizar(termo)) return []
  const achados: Achado<ItemRef>[] = []
  const daPasta = (pasta: PastaItemNode, ancestrais: string[]) => {
    for (const i of pasta.itens) {
      const pontuacao = pontuar(i.nome, termo)
      if (pontuacao) achados.push({ item: i, caminhoRotulo: rotuloDe(ancestrais), pontuacao })
    }
    for (const sub of pasta.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(raiz, [])
  return ordenar(achados)
}

/** Cenários da árvore (inclusive sub-cenários) cujo nome casa com o termo. */
export function buscarCenarios(raiz: PastaCenarioNode, termo: string): Achado<CenarioNode>[] {
  if (!normalizar(termo)) return []
  const achados: Achado<CenarioNode>[] = []
  const dosNos = (nos: CenarioNode[], ancestrais: string[]) => {
    for (const n of nos) {
      const pontuacao = pontuar(n.nome, termo)
      if (pontuacao) achados.push({ item: n, caminhoRotulo: rotuloDe(ancestrais), pontuacao })
      // cenário pai entra no rótulo do filho: a hierarquia some da tela, o contexto não
      dosNos(n.filhos, [...ancestrais, n.nome])
    }
  }
  const daPasta = (p: PastaCenarioNode, ancestrais: string[]) => {
    dosNos(p.cenarios, ancestrais)
    for (const sub of p.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(raiz, [])
  return ordenar(achados)
}
