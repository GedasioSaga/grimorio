import type { FsBridge } from './fsBridge'
import {
  ARQUIVO_ENTRADA, DIR_LIXEIRA, caminhoArquivoEntrada, dirDaEntrada, nomeFinalRestauro, nomeLivreEm,
  normalizarEntradaLixeira, novaEntradaLixeira, type EntradaLixeira, type TipoLixeira,
} from './lixeira'

/**
 * Lixeira do cofre — a metade de I/O. `lixeira.ts` decide o formato de cada entrada e o nome
 * final ao restaurar; este arquivo é quem de fato move bytes no disco, na fila certa (via
 * VaultRepo, que serializa por caminho — mover/restaurar da lixeira nunca corre em paralelo com
 * outra operação no MESMO arquivo porque `caminhoArquivo`/`caminhoPasta` passam pela fila de quem
 * chama antes de chegar aqui).
 *
 * Cada entrada é uma escrita SÓ dentro da própria pasta (`.lixeira/<id>/entrada.json`) — não há
 * leitura-modificação-escrita de um registro compartilhado. `listar` varre as subpastas de
 * `.lixeira/` e lê cada `entrada.json`; uma pasta com `entrada.json` ilegível é pulada, não
 * derruba a listagem das outras.
 */

function agora(): string {
  return new Date().toISOString()
}
function novoId(): string {
  return crypto.randomUUID()
}

export class LixeiraExecutor {
  constructor(
    private raiz: string,
    private fs: FsBridge,
  ) {}

  private abs(rel: string): string {
    return `${this.raiz}/${rel}`
  }

  /** Lê `entrada.json` de UMA pasta da lixeira; ausente/corrompido -> `null` (quem chama pula). */
  private async lerEntrada(id: string): Promise<EntradaLixeira | null> {
    try {
      const bruto = JSON.parse(await this.fs.readText(this.abs(caminhoArquivoEntrada(id))))
      return normalizarEntradaLixeira(bruto, id)
    } catch {
      return null
    }
  }

  private async salvarEntrada(entrada: EntradaLixeira): Promise<void> {
    await this.fs.mkdirAll(this.abs(dirDaEntrada(entrada.id)))
    await this.fs.writeTextAtomic(this.abs(caminhoArquivoEntrada(entrada.id)), JSON.stringify(entrada, null, 2))
  }

  /**
   * Varre as subpastas de `.lixeira/` e lê o `entrada.json` de cada uma — inclusive pastas que
   * este computador nunca criou (chegaram pelo sync, de outro dispositivo). Sem `.lixeira/`
   * ainda no disco, devolve `[]` sem lançar: cofre antigo não precisa de nenhum passo manual.
   */
  async listar(): Promise<EntradaLixeira[]> {
    let entradas: { name: string; isDir: boolean }[] = []
    try {
      entradas = await this.fs.listDir(this.abs(DIR_LIXEIRA))
    } catch {
      return []
    }
    const out: EntradaLixeira[] = []
    for (const e of entradas) {
      if (!e.isDir || e.name === ARQUIVO_ENTRADA) continue
      const lida = await this.lerEntrada(e.name)
      if (lida) out.push(lida)
    }
    return out
  }

  private async nomesExistentesEm(dir: string): Promise<string[]> {
    try {
      return (await this.fs.listDir(this.abs(dir))).map((e) => e.name)
    } catch {
      return []
    }
  }

  /** Move um arquivo `.json` (personagem/item/canvas/mapa) e sua pasta `.notas` irmã, se existir. */
  async moverArquivoParaLixeira(params: {
    tipo: TipoLixeira
    nome: string
    origemDir: string
    nomeArquivo: string
    caminhoArquivo: string
    entidadeId?: string
  }): Promise<string> {
    const notasOrigem = params.caminhoArquivo.replace(/\.json$/, '.notas')
    const temNotas = await this.fs.exists(this.abs(notasOrigem))
    const id = novoId()
    const destinoDir = dirDaEntrada(id)
    await this.fs.mkdirAll(this.abs(destinoDir))
    await this.fs.rename(this.abs(params.caminhoArquivo), this.abs(`${destinoDir}/${params.nomeArquivo}`))
    if (temNotas) {
      const notasNome = params.nomeArquivo.replace(/\.json$/, '.notas')
      await this.fs.rename(this.abs(notasOrigem), this.abs(`${destinoDir}/${notasNome}`))
    }
    await this.salvarEntrada(novaEntradaLixeira({
      id, tipo: params.tipo, nome: params.nome, origemDir: params.origemDir,
      nomeArquivo: params.nomeArquivo, ehPasta: false, temNotas, entidadeId: params.entidadeId, agora: agora(),
    }))
    return id
  }

  /** Move uma pasta inteira (cenário, campanha — com tudo dentro — ou pasta organizacional). */
  async moverPastaParaLixeira(params: {
    tipo: 'cenario' | 'pasta' | 'campanha'
    nome: string
    origemDirPai: string
    nomeArquivo: string
    caminhoPasta: string
    entidadeId?: string
  }): Promise<string> {
    const id = novoId()
    const destinoDir = dirDaEntrada(id)
    await this.fs.mkdirAll(this.abs(DIR_LIXEIRA))
    await this.fs.rename(this.abs(params.caminhoPasta), this.abs(`${destinoDir}/${params.nomeArquivo}`))
    await this.salvarEntrada(novaEntradaLixeira({
      id, tipo: params.tipo, nome: params.nome, origemDir: params.origemDirPai,
      nomeArquivo: params.nomeArquivo, ehPasta: true, entidadeId: params.entidadeId, agora: agora(),
    }))
    return id
  }

  /**
   * Move um conjunto de páginas (a excluída + descendentes, já coletadas por quem chama — mesmo
   * critério de `NotebookRepo.excluirPagina`) para a lixeira. O link de hierarquia é por `id`
   * dentro do JSON, não pelo nome do arquivo: mover sem tocar no conteúdo preserva os `paiId`
   * intactos, e `NotebookRepo.montarArvore` já trata `paiId` que não existe na árvore ATUAL como
   * página-raiz — então restaurar não precisa reparar nada mesmo se o pai original sumiu.
   */
  async moverPaginasParaLixeira(params: {
    nome: string
    docCaminho: string
    dirNotas: string
    slugs: string[]
  }): Promise<string> {
    const id = novoId()
    const destinoDir = `${dirDaEntrada(id)}/paginas`
    await this.fs.mkdirAll(this.abs(destinoDir))
    for (const slug of params.slugs) {
      await this.fs.rename(this.abs(`${params.dirNotas}/${slug}.json`), this.abs(`${destinoDir}/${slug}.json`))
    }
    await this.salvarEntrada(novaEntradaLixeira({
      id, tipo: 'pagina', nome: params.nome, origemDir: params.dirNotas, nomeArquivo: 'paginas',
      ehPasta: true, paginaDocCaminho: params.docCaminho, agora: agora(),
    }))
    return id
  }

  /**
   * Restaura uma entrada ao lugar de origem. Recria `origemDir` se ele não existir mais (pasta
   * apagada, cenário movido, doc renomeado enquanto a página estava na lixeira) — restaurar
   * nunca falha por causa disso. Nome já ocupado no destino ganha sufixo; nada é sobrescrito.
   */
  async restaurar(id: string): Promise<EntradaLixeira> {
    const entrada = await this.lerEntrada(id)
    if (!entrada) throw new Error('Entrada não encontrada na lixeira.')

    if (entrada.tipo === 'pagina') {
      await this.restaurarPaginas(entrada)
    } else {
      await this.restaurarArquivoOuPasta(entrada)
    }
    // apaga a pasta da entrada inteira — `entrada.json` incluso, num só golpe
    await this.fs.removePath(this.abs(dirDaEntrada(id)))
    return entrada
  }

  private async restaurarArquivoOuPasta(entrada: EntradaLixeira): Promise<void> {
    await this.fs.mkdirAll(this.abs(entrada.origemDir))
    const existentes = await this.nomesExistentesEm(entrada.origemDir)
    const nomeFinal = nomeFinalRestauro(entrada, existentes)
    const origemNaLixeira = `${dirDaEntrada(entrada.id)}/${entrada.nomeArquivo}`
    await this.fs.rename(this.abs(origemNaLixeira), this.abs(`${entrada.origemDir}/${nomeFinal}`))
    if (entrada.temNotas) {
      const notasNaLixeira = origemNaLixeira.replace(/\.json$/, '.notas')
      if (await this.fs.exists(this.abs(notasNaLixeira))) {
        const notasFinal = nomeFinal.replace(/\.json$/, '.notas')
        await this.fs.rename(this.abs(notasNaLixeira), this.abs(`${entrada.origemDir}/${notasFinal}`))
      }
    }
  }

  private async restaurarPaginas(entrada: EntradaLixeira): Promise<void> {
    await this.fs.mkdirAll(this.abs(entrada.origemDir))
    const paginasDir = `${dirDaEntrada(entrada.id)}/paginas`
    let arquivos: { name: string; isDir: boolean }[] = []
    try {
      arquivos = (await this.fs.listDir(this.abs(paginasDir))).filter((e) => !e.isDir)
    } catch {
      // nada a restaurar — a pasta pode não existir se a exclusão original não moveu arquivos
    }
    const existentes = await this.nomesExistentesEm(entrada.origemDir)
    for (const a of arquivos) {
      const nomeFinal = nomeLivreEm(a.name, existentes)
      existentes.push(nomeFinal)
      await this.fs.rename(this.abs(`${paginasDir}/${a.name}`), this.abs(`${entrada.origemDir}/${nomeFinal}`))
    }
  }

  /** Apaga tudo da lixeira, de vez. Devolve os `entidadeId` das entradas removidas (para quem chama limpar vínculos órfãos). */
  async esvaziar(): Promise<string[]> {
    const lista = await this.listar()
    for (const e of lista) {
      const dir = this.abs(dirDaEntrada(e.id))
      if (await this.fs.exists(dir)) await this.fs.removePath(dir)
    }
    // remove_path (Rust) falha em caminho inexistente: sem esta guarda, esvaziar uma lixeira
    // que nunca teve nada gravado (.lixeira/ nunca foi criada) lançaria em vez de ser um no-op
    if (await this.fs.exists(this.abs(DIR_LIXEIRA))) await this.fs.removePath(this.abs(DIR_LIXEIRA))
    return lista.map((e) => e.entidadeId).filter((x): x is string => !!x)
  }
}
