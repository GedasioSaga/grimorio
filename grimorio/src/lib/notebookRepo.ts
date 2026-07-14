import type { FsBridge } from './fsBridge'
import type { Pagina, PaginaNode, PaginaRef } from './types'
import { slugify, slugUnico } from './slug'

function agora(): string {
  return new Date().toISOString()
}
function novoId(): string {
  return crypto.randomUUID()
}

type PaginaComSlug = Pagina & { slug: string; erro?: boolean }

/**
 * Caderno = pasta de páginas JSON. `raiz` é o caminho ABSOLUTO da pasta do caderno.
 * Arquivos nomeados por slug; identidade por `id`; hierarquia por `paiId`/`ordem`.
 * Escritas no mesmo arquivo são serializadas (mesma ideia do VaultRepo.naFila).
 */
export class NotebookRepo {
  private filas = new Map<string, Promise<unknown>>()

  constructor(
    private raiz: string,
    private fs: FsBridge,
  ) {}

  private abs(slug: string): string {
    return `${this.raiz}/${slug}.json`
  }

  private naFila<T>(slug: string, op: () => Promise<T>): Promise<T> {
    const anterior = this.filas.get(slug) ?? Promise.resolve()
    const proxima = anterior.then(op, op)
    this.filas.set(slug, proxima)
    return proxima
  }

  async inicializar(): Promise<void> {
    await this.fs.mkdirAll(this.raiz)
  }

  private async listaComSlug(): Promise<PaginaComSlug[]> {
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.raiz)
    } catch {
      return []
    }
    const out: PaginaComSlug[] = []
    for (const e of entries) {
      if (e.isDir || !e.name.endsWith('.json')) continue
      const slug = e.name.replace(/\.json$/, '')
      try {
        const p: Pagina = JSON.parse(await this.fs.readText(this.abs(slug)))
        out.push({ ...p, slug })
      } catch {
        out.push({
          id: `erro:${slug}`, titulo: slug, paiId: null, ordem: 9999,
          corpo: '', criadoEm: '', modificadoEm: '', slug, erro: true,
        })
      }
    }
    return out
  }

  async criarPagina(titulo: string, paiId: string | null): Promise<PaginaRef> {
    await this.inicializar()
    const lista = await this.listaComSlug()
    const slug = slugUnico(slugify(titulo), lista.map((p) => p.slug))
    const ordem = lista.filter((p) => p.paiId === paiId).reduce((m, p) => Math.max(m, p.ordem), -1) + 1
    const pag: Pagina = {
      id: novoId(), titulo, paiId, ordem, corpo: '',
      criadoEm: agora(), modificadoEm: agora(),
    }
    await this.fs.writeTextAtomic(this.abs(slug), JSON.stringify(pag, null, 2))
    return { slug, id: pag.id, titulo }
  }

  async lerPagina(slug: string): Promise<Pagina> {
    return JSON.parse(await this.fs.readText(this.abs(slug)))
  }

  async salvarCorpo(slug: string, corpo: string): Promise<void> {
    return this.naFila(slug, async () => {
      const atual: Pagina = JSON.parse(await this.fs.readText(this.abs(slug)))
      const salvo = { ...atual, corpo, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(slug), JSON.stringify(salvo, null, 2))
    })
  }

  async renomearPagina(slug: string, novoTitulo: string): Promise<void> {
    return this.naFila(slug, async () => {
      const atual: Pagina = JSON.parse(await this.fs.readText(this.abs(slug)))
      const salvo = { ...atual, titulo: novoTitulo, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(slug), JSON.stringify(salvo, null, 2))
    })
  }

  /** Exclui a página e todas as descendentes. */
  async excluirPagina(slug: string): Promise<void> {
    const lista = await this.listaComSlug()
    const alvo = lista.find((p) => p.slug === slug)
    if (!alvo) {
      await this.fs.removePath(this.abs(slug))
      return
    }
    const remover = new Set<string>()
    const coletar = (id: string) => {
      remover.add(id)
      for (const f of lista.filter((p) => p.paiId === id)) coletar(f.id)
    }
    coletar(alvo.id)
    for (const p of lista.filter((p) => remover.has(p.id))) {
      await this.fs.removePath(this.abs(p.slug))
    }
  }

  /** Move a página (por id) para novo pai e posição; renumera os irmãos do destino. */
  async moverPagina(id: string, novoPaiId: string | null, novaOrdem: number): Promise<void> {
    const lista = await this.listaComSlug()
    const movida = lista.find((p) => p.id === id)
    if (!movida) return

    // guarda de ciclo: novo pai não pode ser a própria página nem descendente dela
    const descendencia = new Set<string>()
    const coletar = (pid: string) => {
      descendencia.add(pid)
      for (const f of lista.filter((p) => p.paiId === pid)) coletar(f.id)
    }
    coletar(id)
    if (novoPaiId && descendencia.has(novoPaiId)) return

    const irmaos = lista
      .filter((p) => p.paiId === novoPaiId && p.id !== id)
      .sort((a, b) => a.ordem - b.ordem)
    const idx = Math.max(0, Math.min(novaOrdem, irmaos.length))
    irmaos.splice(idx, 0, { ...movida, paiId: novoPaiId })

    for (let i = 0; i < irmaos.length; i++) {
      const alvo = lista.find((x) => x.id === irmaos[i].id)!
      const precisa = alvo.ordem !== i || alvo.paiId !== novoPaiId || alvo.id === id
      if (!precisa) continue
      const arquivo: Pagina = JSON.parse(await this.fs.readText(this.abs(alvo.slug)))
      const salvo = { ...arquivo, paiId: novoPaiId, ordem: i, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(alvo.slug), JSON.stringify(salvo, null, 2))
    }
  }

  async montarArvore(): Promise<PaginaNode[]> {
    const lista = await this.listaComSlug()
    const nodes = new Map<string, PaginaNode>()
    for (const p of lista) {
      nodes.set(p.id, {
        slug: p.slug, id: p.id, titulo: p.titulo, erro: p.erro,
        paiId: p.paiId, ordem: p.ordem, filhos: [],
      })
    }
    const raiz: PaginaNode[] = []
    for (const n of nodes.values()) {
      if (n.paiId && nodes.has(n.paiId)) nodes.get(n.paiId)!.filhos.push(n)
      else raiz.push(n)
    }
    const ordenar = (arr: PaginaNode[]) => {
      arr.sort((a, b) => a.ordem - b.ordem)
      arr.forEach((n) => ordenar(n.filhos))
    }
    ordenar(raiz)
    return raiz
  }
}
