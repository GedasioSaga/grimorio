import { achatarPaginas } from './achatarPaginas'
import { normalizar, pontuar, type Pontuacao } from './buscaArvore'
import { dirNotasDoMapa } from './caminhos'
import type { FsBridge } from './fsBridge'
import { NotebookRepo } from './notebookRepo'
import type { VaultTree } from './types'

/**
 * Busca de página de caderno pro Ctrl+K.
 *
 * Diferente de `buscaGlobal.ts` (síncrona, lê só o que já está em memória), página vive dentro
 * da pasta `.notas` de cada canvas/mapa/sessão/escrita — é disco, não RAM. Por isso o carregar
 * (I/O, uma varredura por doc) fica separado do pontuar (puro, roda a cada tecla sobre o que já
 * foi carregado): quem abre a paleta chama `carregarPaginasDoCofre` UMA VEZ, e cada tecla digitada
 * só re-filtra a lista em memória — sem isso, cada letra digitada relança dezenas de leituras de disco.
 */

/** Tipo de abertura aceito por `abrirDocumento` — duplicado aqui pra não importar `state/store`
 * (que puxa Tauri) num módulo que também roda em teste puro. */
export type TipoAberturaCaderno = 'sessao' | 'canvas' | 'escrita' | 'mapa'

export interface DocComCaderno {
  tipoAbertura: TipoAberturaCaderno
  /** caminho do .json do doc — o mesmo que `abrirDocumento` espera */
  docCaminho: string
  docNome: string
  /** nome da campanha-dona, ou '' quando o doc está solto */
  campanhaNome: string
}

/** Todo canvas/mapa/sessão/escrita do cofre — soltos e de campanha — com o bastante pra
 * reabrir o doc E localizar a pasta `.notas` dele. */
export function docsComCaderno(tree: VaultTree): DocComCaderno[] {
  const out: DocComCaderno[] = []
  for (const i of tree.canvasesSoltos) out.push({ tipoAbertura: 'canvas', docCaminho: i.caminho, docNome: i.nome, campanhaNome: '' })
  for (const i of tree.mapasSoltos) out.push({ tipoAbertura: 'mapa', docCaminho: i.caminho, docNome: i.nome, campanhaNome: '' })
  for (const camp of tree.campanhas) {
    for (const i of camp.canvases) out.push({ tipoAbertura: 'canvas', docCaminho: i.caminho, docNome: i.nome, campanhaNome: camp.nome })
    for (const i of camp.sessoes) out.push({ tipoAbertura: 'sessao', docCaminho: i.caminho, docNome: i.nome, campanhaNome: camp.nome })
    for (const i of camp.escritas) out.push({ tipoAbertura: 'escrita', docCaminho: i.caminho, docNome: i.nome, campanhaNome: camp.nome })
  }
  return out
}

/** Página já lida do disco, pronta pra ser filtrada em memória por `pontuarPaginasCarregadas`. */
export interface PaginaCarregada {
  doc: DocComCaderno
  titulo: string
  slug: string
}

/**
 * Varre TODOS os cadernos do cofre em paralelo. Caderno ilegível (pasta ausente, json
 * corrompido) não derruba a busca — só entra com zero páginas, igual o resto do app trata
 * arquivo com erro. Página individual com erro de leitura também é descartada aqui (nunca
 * viraria resultado abrível).
 */
export async function carregarPaginasDoCofre(vaultPath: string, tree: VaultTree, fs: FsBridge): Promise<PaginaCarregada[]> {
  const docs = docsComCaderno(tree)
  const porDoc = await Promise.all(docs.map(async (doc): Promise<PaginaCarregada[]> => {
    const repo = new NotebookRepo(`${vaultPath}/${dirNotasDoMapa(doc.docCaminho)}`, fs)
    try {
      const arvore = await repo.montarArvore()
      return achatarPaginas(arvore)
        .filter((p) => !p.erro)
        .map((p) => ({ doc, titulo: p.titulo, slug: p.slug }))
    } catch {
      return []
    }
  }))
  return porDoc.flat()
}

export interface ResultadoPagina {
  tipo: 'pagina'
  /** título da página */
  nome: string
  /** chave única: doc + slug da página (não existe em outro lugar do cofre) */
  caminho: string
  /** "campanha/nome-do-doc", ou só "nome-do-doc" quando solto */
  caminhoRotulo: string
  pontuacao: Pontuacao
  tipoAbertura: TipoAberturaCaderno
  docCaminho: string
  docNome: string
  paginaSlug: string
}

/** Pura: filtra e ordena as páginas já carregadas contra o termo. Roda a cada tecla. */
export function pontuarPaginasCarregadas(paginas: PaginaCarregada[], termo: string): ResultadoPagina[] {
  if (!normalizar(termo)) return []
  const out: ResultadoPagina[] = []
  for (const { doc, titulo, slug } of paginas) {
    const pontuacao = pontuar(titulo, termo)
    if (!pontuacao) continue
    out.push({
      tipo: 'pagina',
      nome: titulo,
      caminho: `${doc.docCaminho}#${slug}`,
      caminhoRotulo: doc.campanhaNome ? `${doc.campanhaNome}/${doc.docNome}` : doc.docNome,
      pontuacao,
      tipoAbertura: doc.tipoAbertura,
      docCaminho: doc.docCaminho,
      docNome: doc.docNome,
      paginaSlug: slug,
    })
  }
  return out.sort((a, b) =>
    a.pontuacao.classe - b.pontuacao.classe ||
    a.pontuacao.posicao - b.pontuacao.posicao ||
    a.nome.length - b.nome.length ||
    a.nome.localeCompare(b.nome, 'pt-BR'))
}
