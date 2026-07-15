import type { FsBridge } from './fsBridge'
import type { Campanha, CampanhaNode, CanvasDoc, Cenario, CenarioNode, CenarioRef, ItemRef, PastaCenarioNode, PastaNode, Personagem, VaultTree, Vinculo } from './types'
import { slugify, slugUnico } from './slug'
import { normalizarVinculos } from './vinculos'

function agora(): string {
  return new Date().toISOString()
}

function novoId(): string {
  return crypto.randomUUID()
}

/**
 * Normaliza um personagem lido do disco para o formato atual.
 * Migração lazy: `corpo` legado vira `descricao`; campos faltando ganham vazios.
 */
export function normalizarPersonagem(
  raw: Partial<Personagem> & { corpo?: string },
): Personagem {
  return {
    id: raw.id ?? novoId(),
    nome: raw.nome ?? '',
    retrato: raw.retrato ?? null,
    resumo: raw.resumo ?? '',
    descricao: raw.descricao ?? raw.corpo ?? '',
    informacao: raw.informacao ?? '',
    historia: raw.historia ?? '',
    extras: raw.extras ?? '',
    anotacoes: raw.anotacoes ?? '',
    imagens: raw.imagens ?? [],
    criadoEm: raw.criadoEm ?? agora(),
    modificadoEm: raw.modificadoEm ?? agora(),
  }
}

/** Normaliza um cenário lido do disco (migração lazy: campos faltando ganham defaults). */
export function normalizarCenario(raw: Partial<Cenario>): Cenario {
  return {
    id: raw.id ?? novoId(),
    nome: raw.nome ?? '',
    retrato: raw.retrato ?? null,
    resumo: raw.resumo ?? '',
    descricao: raw.descricao ?? '',
    informacao: raw.informacao ?? '',
    historia: raw.historia ?? '',
    eventos: raw.eventos ?? '',
    itens: raw.itens ?? '',
    anotacoes: raw.anotacoes ?? '',
    imagens: raw.imagens ?? [],
    personagens: raw.personagens ?? [],
    criadoEm: raw.criadoEm ?? agora(),
    modificadoEm: raw.modificadoEm ?? agora(),
  }
}

/**
 * Acesso ao cofre. Todos os caminhos de item são RELATIVOS à raiz do cofre,
 * com separador '/'. A conversão para caminho absoluto acontece aqui dentro.
 */
export class VaultRepo {
  private filas = new Map<string, Promise<unknown>>()

  constructor(
    private raiz: string,
    private fs: FsBridge,
  ) {}

  /** Serializa operações por caminho: nunca duas escritas simultâneas no mesmo arquivo. */
  private naFila<T>(caminho: string, op: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(caminho) ?? Promise.resolve()
    const proxima = anterior.then(op, op)
    this.filas.set(caminho, proxima)
    return proxima
  }

  abs(rel: string): string {
    return `${this.raiz}/${rel}`
  }

  async inicializar(): Promise<void> {
    await this.fs.mkdirAll(this.abs('campanhas'))
    await this.fs.mkdirAll(this.abs('canvases-soltos'))
  }

  // ---------- criação ----------

  async criarCampanha(nome: string): Promise<string> {
    const existentes = (await this.listarDirs('campanhas')).map((d) => d.name)
    const slug = slugUnico(slugify(nome), existentes)
    const meta: Campanha = { id: novoId(), nome, descricao: '', criadoEm: agora(), modificadoEm: agora() }
    await this.fs.mkdirAll(this.abs(`campanhas/${slug}/personagens`))
    await this.fs.mkdirAll(this.abs(`campanhas/${slug}/sessoes`))
    await this.fs.mkdirAll(this.abs(`campanhas/${slug}/canvases`))
    await this.fs.mkdirAll(this.abs(`campanhas/${slug}/assets`))
    await this.fs.writeTextAtomic(this.abs(`campanhas/${slug}/campanha.json`), JSON.stringify(meta, null, 2))
    return slug
  }

  async criarPersonagem(campanhaSlug: string, nome: string): Promise<ItemRef> {
    return this.criarPersonagemEm(`campanhas/${campanhaSlug}/personagens`, nome)
  }

  /** Cria um personagem em qualquer diretório (usado tanto por campanha quanto pela área solta). */
  async criarPersonagemEm(dir: string, nome: string): Promise<ItemRef> {
    await this.fs.mkdirAll(this.abs(dir))
    const slug = await this.slugLivre(dir, nome)
    const p: Personagem = {
      id: novoId(), nome, retrato: null, resumo: '',
      descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [],
      criadoEm: agora(), modificadoEm: agora(),
    }
    const caminho = `${dir}/${slug}.json`
    await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(p, null, 2))
    return { slug, nome, caminho }
  }

  /** Cria sessão ou canvas (mesmo formato) no diretório dado. */
  async criarCanvasDoc(dir: string, nome: string): Promise<ItemRef> {
    const slug = await this.slugLivre(dir, nome)
    const doc: CanvasDoc = { id: novoId(), nome, documento: null, criadoEm: agora(), modificadoEm: agora() }
    const caminho = `${dir}/${slug}.json`
    await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(doc, null, 2))
    return { slug, nome, caminho }
  }

  /** Cria uma pasta (com pasta.json guardando o nome) dentro de dirPai. Retorna o caminho da nova pasta. */
  async criarPasta(dirPai: string, nome: string): Promise<string> {
    let existentes: string[] = []
    try {
      existentes = (await this.fs.listDir(this.abs(dirPai))).filter((e) => e.isDir).map((e) => e.name)
    } catch { /* dirPai ainda não existe */ }
    const slug = slugUnico(slugify(nome), existentes)
    const dir = `${dirPai}/${slug}`
    await this.fs.mkdirAll(this.abs(dir))
    await this.fs.writeTextAtomic(this.abs(`${dir}/pasta.json`), JSON.stringify({ nome, criadoEm: agora() }, null, 2))
    return dir
  }

  /** Move o arquivo .json de um personagem para outro diretório (copiar + remover). No-op se já estiver lá. */
  async moverPersonagem(caminhoOrigem: string, dirDestino: string): Promise<void> {
    const nomeArquivo = caminhoOrigem.split('/').pop() ?? ''
    const dirOrigem = caminhoOrigem.slice(0, caminhoOrigem.length - nomeArquivo.length - 1)
    if (dirOrigem === dirDestino) return
    await this.fs.mkdirAll(this.abs(dirDestino))
    const slugBase = nomeArquivo.replace(/\.json$/, '')
    const slug = await this.slugLivre(dirDestino, slugBase)
    const destino = `${dirDestino}/${slug}.json`
    await this.fs.copyFile(this.abs(caminhoOrigem), this.abs(destino))
    await this.fs.removePath(this.abs(caminhoOrigem))
  }

  private async slugLivre(dir: string, nome: string): Promise<string> {
    let existentes: string[] = []
    try {
      existentes = (await this.fs.listDir(this.abs(dir)))
        .filter((e) => !e.isDir && e.name.endsWith('.json'))
        .map((e) => e.name.replace(/\.json$/, ''))
    } catch {
      // diretório ainda não existe — writeTextAtomic cria
    }
    return slugUnico(slugify(nome), existentes)
  }

  // ---------- leitura/escrita ----------

  async lerPersonagem(caminho: string): Promise<Personagem> {
    return normalizarPersonagem(JSON.parse(await this.fs.readText(this.abs(caminho))))
  }

  async salvarPersonagem(caminho: string, p: Personagem): Promise<void> {
    return this.naFila(caminho, async () => {
      const salvo = { ...p, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(salvo, null, 2))
    })
  }

  async lerCanvasDoc(caminho: string): Promise<CanvasDoc> {
    return JSON.parse(await this.fs.readText(this.abs(caminho)))
  }

  async salvarCanvasDoc(caminho: string, doc: CanvasDoc): Promise<void> {
    return this.naFila(caminho, async () => {
      const salvo = { ...doc, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(salvo, null, 2))
    })
  }

  /** Atualiza só o documento do canvas (read-modify-write na fila do caminho — não sobrescreve rename concorrente). */
  async salvarDocumentoCanvas(caminho: string, documento: unknown): Promise<void> {
    return this.naFila(caminho, async () => {
      const atual: CanvasDoc = JSON.parse(await this.fs.readText(this.abs(caminho)))
      const salvo = { ...atual, documento, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(salvo, null, 2))
    })
  }

  /** Copia um arquivo externo (caminho absoluto) para dentro do cofre (caminho relativo). */
  async copiarParaCofre(origemAbsoluta: string, destinoRel: string): Promise<void> {
    await this.fs.copyFile(origemAbsoluta, this.abs(destinoRel))
  }

  /** Apaga um arquivo do cofre por caminho relativo (ex.: imagem removida da galeria). */
  async removerArquivoCofre(rel: string): Promise<void> {
    await this.fs.removePath(this.abs(rel))
  }

  /** Grava conteúdo binário (base64) num caminho relativo ao cofre. */
  async escreverBinario(destinoRel: string, base64: string): Promise<void> {
    await this.fs.writeBinaryBase64(this.abs(destinoRel), base64)
  }

  /** Grava texto num caminho ABSOLUTO fora do cofre (ex.: destino de export escolhido pelo usuário). */
  async escreverTextoAbsoluto(caminhoAbsoluto: string, conteudo: string): Promise<void> {
    await this.fs.writeTextAtomic(caminhoAbsoluto, conteudo)
  }

  /** Grava binário (base64) num caminho ABSOLUTO fora do cofre (ex.: destino de export escolhido pelo usuário). */
  async escreverBinarioAbsoluto(caminhoAbsoluto: string, base64: string): Promise<void> {
    await this.fs.writeBinaryBase64(caminhoAbsoluto, base64)
  }

  /** Renomeia o campo `nome` do item (arquivo e slug não mudam — referências continuam válidas). */
  async renomearItem(caminho: string, novoNome: string): Promise<void> {
    return this.naFila(caminho, async () => {
      const obj = JSON.parse(await this.fs.readText(this.abs(caminho)))
      obj.nome = novoNome
      obj.modificadoEm = agora()
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(obj, null, 2))
    })
  }

  async excluirItem(caminho: string): Promise<void> {
    return this.naFila(caminho, async () => {
      await this.fs.removePath(this.abs(caminho))
    })
  }

  /** Exclui um item (.json) e, se existir, sua pasta de notas irmã (<slug>.notas). */
  async excluirItemComNotas(caminho: string): Promise<void> {
    return this.naFila(caminho, async () => {
      await this.fs.removePath(this.abs(caminho))
      const notas = caminho.replace(/\.json$/, '.notas')
      if (await this.fs.exists(this.abs(notas))) {
        await this.fs.removePath(this.abs(notas))
      }
    })
  }

  async excluirCampanha(slug: string): Promise<void> {
    await this.fs.removePath(this.abs(`campanhas/${slug}`))
  }

  // ---------- cenários ----------

  /** Lista os nomes dos subdiretórios de um dir (tolerante a dir inexistente). */
  private async nomesDeDirs(dir: string): Promise<string[]> {
    try {
      return (await this.fs.listDir(this.abs(dir))).filter((e) => e.isDir).map((e) => e.name)
    } catch {
      return []
    }
  }

  /** Cria um cenário (diretório + cenario.json) dentro de dirPai (pasta ou outro cenário). */
  async criarCenarioEm(dirPai: string, nome: string): Promise<CenarioRef> {
    const slug = slugUnico(slugify(nome), await this.nomesDeDirs(dirPai))
    const dir = `${dirPai}/${slug}`
    const c: Cenario = {
      id: novoId(), nome, retrato: null, resumo: '',
      descricao: '', informacao: '', historia: '', eventos: '', itens: '', anotacoes: '',
      imagens: [], personagens: [],
      criadoEm: agora(), modificadoEm: agora(),
    }
    await this.fs.mkdirAll(this.abs(dir))
    await this.fs.writeTextAtomic(this.abs(`${dir}/cenario.json`), JSON.stringify(c, null, 2))
    return { id: c.id, slug, nome, caminho: dir }
  }

  async lerCenario(dir: string): Promise<Cenario> {
    return normalizarCenario(JSON.parse(await this.fs.readText(this.abs(`${dir}/cenario.json`))))
  }

  async salvarCenario(dir: string, c: Cenario): Promise<void> {
    const caminho = `${dir}/cenario.json`
    return this.naFila(caminho, async () => {
      const salvo = { ...c, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(salvo, null, 2))
    })
  }

  /** Renomeia o campo `nome` do cenário (dir/slug não mudam — referências continuam válidas). */
  async renomearCenario(dir: string, novoNome: string): Promise<void> {
    return this.renomearItem(`${dir}/cenario.json`, novoNome)
  }

  /** Exclui o cenário e todos os sub-cenários (remoção recursiva do diretório). */
  async excluirCenario(dir: string): Promise<void> {
    await this.fs.removePath(this.abs(dir))
  }

  /**
   * Move o diretório do cenário para dentro de dirDestinoPai (pasta ou cenário).
   * Guardas: nunca para dentro de si mesmo/descendente; no-op se já está lá.
   */
  async moverCenario(dirOrigem: string, dirDestinoPai: string): Promise<void> {
    if (dirDestinoPai === dirOrigem || dirDestinoPai.startsWith(`${dirOrigem}/`)) {
      throw new Error('não é possível mover um cenário para dentro dele mesmo')
    }
    const slugAtual = dirOrigem.split('/').pop() ?? ''
    const dirPaiAtual = dirOrigem.slice(0, dirOrigem.length - slugAtual.length - 1)
    if (dirPaiAtual === dirDestinoPai) return
    await this.fs.mkdirAll(this.abs(dirDestinoPai))
    const slug = slugUnico(slugAtual, await this.nomesDeDirs(dirDestinoPai))
    await this.fs.rename(this.abs(dirOrigem), this.abs(`${dirDestinoPai}/${slug}`))
  }

  /**
   * Monta a árvore da seção de cenários: dir com cenario.json = cenário;
   * qualquer outro dir (fora de cenário) = pasta organizacional.
   */
  async montarArvoreCenarios(dir = 'cenarios'): Promise<PastaCenarioNode> {
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.abs(dir))
    } catch {
      // diretório ainda não existe (criado sob demanda na primeira criação)
    }
    const subpastas: PastaCenarioNode[] = []
    const cenarios: CenarioNode[] = []
    for (const e of entries) {
      if (!e.isDir || e.name.endsWith('.notas')) continue
      const caminho = `${dir}/${e.name}`
      if (await this.fs.exists(this.abs(`${caminho}/cenario.json`))) {
        cenarios.push(await this.montarCenarioNode(caminho))
      } else {
        subpastas.push(await this.montarArvoreCenarios(caminho))
      }
    }
    let nome = dir.split('/').pop() ?? dir
    try {
      nome = (JSON.parse(await this.fs.readText(this.abs(`${dir}/pasta.json`))) as { nome: string }).nome
    } catch {
      // raiz ou pasta sem metadados
    }
    subpastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    cenarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { slug: dir.split('/').pop() ?? dir, nome, caminho: dir, subpastas, cenarios }
  }

  /** Nó de um cenário: lê id/nome do cenario.json e varre sub-cenários (dirs com cenario.json). */
  private async montarCenarioNode(dir: string): Promise<CenarioNode> {
    const slug = dir.split('/').pop() ?? dir
    let id = ''
    let nome = slug
    let erro: boolean | undefined
    try {
      const obj = JSON.parse(await this.fs.readText(this.abs(`${dir}/cenario.json`)))
      id = obj.id ?? ''
      nome = obj.nome ?? slug
    } catch {
      erro = true
    }
    const filhos: CenarioNode[] = []
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.abs(dir))
    } catch {
      // sem filhos
    }
    for (const e of entries) {
      if (!e.isDir || e.name.endsWith('.notas')) continue
      const sub = `${dir}/${e.name}`
      // dirs sem cenario.json dentro de cenário (ex.: assets) são ignorados
      if (await this.fs.exists(this.abs(`${sub}/cenario.json`))) {
        filhos.push(await this.montarCenarioNode(sub))
      }
    }
    filhos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { id, slug, nome, caminho: dir, erro, filhos }
  }

  // ---------- vínculos ----------

  /** Lê vinculos.json da raiz do cofre; ausente/corrompido → lista vazia. */
  async lerVinculos(): Promise<Vinculo[]> {
    try {
      return normalizarVinculos(JSON.parse(await this.fs.readText(this.abs('vinculos.json'))))
    } catch {
      return []
    }
  }

  async salvarVinculos(lista: Vinculo[]): Promise<void> {
    return this.naFila('vinculos.json', async () => {
      await this.fs.writeTextAtomic(this.abs('vinculos.json'), JSON.stringify({ vinculos: lista }, null, 2))
    })
  }

  // ---------- árvore ----------

  async montarArvore(): Promise<VaultTree> {
    const campanhas: CampanhaNode[] = []
    for (const d of await this.listarDirs('campanhas')) {
      const base = `campanhas/${d.name}`
      let nome = d.name
      let id = ''
      let erro = false
      try {
        const meta = JSON.parse(await this.fs.readText(this.abs(`${base}/campanha.json`))) as Campanha
        nome = meta.nome
        id = meta.id ?? ''
      } catch {
        erro = true
      }
      campanhas.push({
        id,
        slug: d.name,
        nome,
        erro: erro || undefined,
        sessoes: await this.listarItens(`${base}/sessoes`),
        personagens: await this.listarItens(`${base}/personagens`),
        canvases: await this.listarItens(`${base}/canvases`),
        escritas: await this.listarItens(`${base}/escrita`),
      })
    }
    return {
      campanhas,
      canvasesSoltos: await this.listarItens('canvases-soltos'),
      personagensSoltos: await this.montarArvorePastas('personagens-soltos'),
      cenarios: await this.montarArvoreCenarios(),
    }
  }

  /** Monta recursivamente a árvore de pastas + personagens de um diretório raiz. */
  async montarArvorePastas(dir: string): Promise<PastaNode> {
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.abs(dir))
    } catch {
      // diretório ainda não existe
    }
    const subpastas: PastaNode[] = []
    const personagens: ItemRef[] = []
    for (const e of entries) {
      if (e.isDir) {
        subpastas.push(await this.montarArvorePastas(`${dir}/${e.name}`))
      } else if (e.name.endsWith('.json') && e.name !== 'pasta.json') {
        const slug = e.name.replace(/\.json$/, '')
        const caminho = `${dir}/${e.name}`
        try {
          const obj = JSON.parse(await this.fs.readText(this.abs(caminho)))
          personagens.push({ slug, nome: obj.nome ?? slug, caminho })
        } catch {
          personagens.push({ slug, nome: slug, caminho, erro: true })
        }
      }
    }
    let nome = dir.split('/').pop() ?? dir
    try {
      nome = (JSON.parse(await this.fs.readText(this.abs(`${dir}/pasta.json`))) as { nome: string }).nome
    } catch {
      // raiz ou pasta sem metadados
    }
    subpastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    personagens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { slug: dir.split('/').pop() ?? dir, nome, caminho: dir, subpastas, personagens }
  }

  private async listarDirs(rel: string): Promise<{ name: string }[]> {
    try {
      return (await this.fs.listDir(this.abs(rel))).filter((e) => e.isDir)
    } catch {
      return []
    }
  }

  private async listarItens(dir: string): Promise<ItemRef[]> {
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.abs(dir))
    } catch {
      return []
    }
    const itens: ItemRef[] = []
    for (const e of entries) {
      if (e.isDir || !e.name.endsWith('.json')) continue
      const slug = e.name.replace(/\.json$/, '')
      const caminho = `${dir}/${e.name}`
      try {
        const obj = JSON.parse(await this.fs.readText(this.abs(caminho)))
        itens.push({ slug, nome: obj.nome ?? slug, caminho })
      } catch {
        itens.push({ slug, nome: slug, caminho, erro: true })
      }
    }
    itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return itens
  }
}
