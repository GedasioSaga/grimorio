import type { FsBridge } from './fsBridge'
import type { Campanha, CampanhaNode, CanvasDoc, ItemRef, Personagem, VaultTree } from './types'
import { slugify, slugUnico } from './slug'

function agora(): string {
  return new Date().toISOString()
}

function novoId(): string {
  return crypto.randomUUID()
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
    const dir = `campanhas/${campanhaSlug}/personagens`
    const slug = await this.slugLivre(dir, nome)
    const p: Personagem = {
      id: novoId(), nome, retrato: null, resumo: '', corpo: '',
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
    return JSON.parse(await this.fs.readText(this.abs(caminho)))
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

  async excluirCampanha(slug: string): Promise<void> {
    await this.fs.removePath(this.abs(`campanhas/${slug}`))
  }

  // ---------- árvore ----------

  async montarArvore(): Promise<VaultTree> {
    const campanhas: CampanhaNode[] = []
    for (const d of await this.listarDirs('campanhas')) {
      const base = `campanhas/${d.name}`
      let nome = d.name
      let erro = false
      try {
        nome = (JSON.parse(await this.fs.readText(this.abs(`${base}/campanha.json`))) as Campanha).nome
      } catch {
        erro = true
      }
      campanhas.push({
        slug: d.name,
        nome,
        erro: erro || undefined,
        sessoes: await this.listarItens(`${base}/sessoes`),
        personagens: await this.listarItens(`${base}/personagens`),
        canvases: await this.listarItens(`${base}/canvases`),
      })
    }
    return { campanhas, canvasesSoltos: await this.listarItens('canvases-soltos') }
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
