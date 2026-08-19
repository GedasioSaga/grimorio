import type { FsBridge } from './fsBridge'
import type { CamadaMapa, Campanha, CampanhaNode, CanvasDoc, Cenario, CenarioNode, CenarioRef, Item, ItemRef, PastaCenarioNode, PastaItemNode, PastaNode, Personagem, VaultTree, VersaoCenario, VersaoPersonagem, Vinculo } from './types'

/** Forma comum das seções "pastas aninhadas com arquivos .json" (personagens e itens). */
interface ArvoreDeArquivos {
  slug: string
  nome: string
  id?: string
  caminho: string
  subpastas: ArvoreDeArquivos[]
  arquivos: ItemRef[]
}
import { slugify, slugUnico } from './slug'
import { VERSAO_CAMADAS } from './camadasMapa'
import { ehTipoSala } from './tiposSala'
import { normalizarFoco } from './focoRetrato'
import { normalizarVinculos } from './vinculos'
import { normalizarChat, type MensagemChat } from './chatIA'
import { normalizarLayoutTeia, type LayoutSalvo } from './grafoLayoutPersistido'
import { LixeiraExecutor } from './lixeiraExecutar'
import type { EntradaLixeira, TipoLixeira } from './lixeira'

function agora(): string {
  return new Date().toISOString()
}

function novoId(): string {
  return crypto.randomUUID()
}

/** Normaliza uma versão de personagem (campos faltando ganham defaults; id só é gerado se ausente). */
export function normalizarVersaoPersonagem(raw: Record<string, any>): VersaoPersonagem {
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? '',
    retrato: raw?.retrato ?? null,
    // undefined some do JSON.stringify: arquivo sem enquadramento não ganha campo vazio
    foco: normalizarFoco(raw?.foco),
    resumo: raw?.resumo ?? '',
    descricao: raw?.descricao ?? raw?.corpo ?? '',
    informacao: raw?.informacao ?? '',
    historia: raw?.historia ?? '',
    extras: raw?.extras ?? '',
    anotacoes: raw?.anotacoes ?? '',
    imagens: Array.isArray(raw?.imagens) ? raw.imagens : [],
    // ficha antiga não tem este campo (nasceu depois): vira acervo vazio, não quebra a abertura
    acervo: Array.isArray(raw?.acervo) ? raw.acervo.filter((a: any) => typeof a?.itemId === 'string') : [],
  }
}

/**
 * Normaliza um personagem lido do disco para o formato atual.
 * Migração lazy: personagem plano legado (sem `versoes`) vira uma versão que HERDA
 * o nome do personagem (não "Base" — diferente do cenário) + conteúdo antigo (`corpo`->`descricao`).
 * O `nome` de topo é sempre um ESPELHO do nome da versão ativa.
 */
export function normalizarPersonagem(raw: Record<string, any>): Personagem {
  const versoesRaw = Array.isArray(raw?.versoes) && raw.versoes.length > 0 ? raw.versoes : null
  const versoes: VersaoPersonagem[] = versoesRaw
    ? versoesRaw.map((v: Record<string, any>) => normalizarVersaoPersonagem(v))
    : [normalizarVersaoPersonagem({
        // migração: a forma base HERDA o nome do personagem + conteúdo plano (corpo->descricao)
        nome: raw?.nome, retrato: raw?.retrato, foco: raw?.foco, resumo: raw?.resumo,
        descricao: raw?.descricao, corpo: raw?.corpo, informacao: raw?.informacao,
        historia: raw?.historia, extras: raw?.extras, anotacoes: raw?.anotacoes, imagens: raw?.imagens,
      })]
  const versaoAtivaId = typeof raw?.versaoAtivaId === 'string' && versoes.some((v) => v.id === raw.versaoAtivaId)
    ? raw.versaoAtivaId
    : versoes[0].id
  const ativa = versoes.find((v) => v.id === versaoAtivaId) ?? versoes[0]
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: ativa.nome, // espelho
    versoes,
    versaoAtivaId,
    criadoEm: raw?.criadoEm ?? agora(),
    modificadoEm: raw?.modificadoEm ?? agora(),
  }
}

/** Normaliza uma versão de cenário (campos faltando ganham defaults; id só é gerado se ausente). */
export function normalizarVersaoCenario(raw: Record<string, any>, nomePadrao = 'Base'): VersaoCenario {
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? nomePadrao,
    retrato: raw?.retrato ?? null,
    foco: normalizarFoco(raw?.foco),
    resumo: raw?.resumo ?? '',
    descricao: raw?.descricao ?? '',
    informacao: raw?.informacao ?? '',
    historia: raw?.historia ?? '',
    eventos: raw?.eventos ?? '',
    itens: raw?.itens ?? '',
    acervo: Array.isArray(raw?.acervo) ? raw.acervo.filter((a: any) => typeof a?.itemId === 'string') : [],
    anotacoes: raw?.anotacoes ?? '',
    imagens: Array.isArray(raw?.imagens) ? raw.imagens : [],
  }
}

/**
 * Normaliza um cenário lido do disco. Migração lazy:
 * cenário plano legado (sem `versoes`) vira uma versão "Base" com o conteúdo antigo.
 */
export function normalizarCenario(raw: Record<string, any>): Cenario {
  const versoesRaw = Array.isArray(raw?.versoes) && raw.versoes.length > 0 ? raw.versoes : null
  const versoes: VersaoCenario[] = versoesRaw
    ? versoesRaw.map((v: Record<string, any>) => normalizarVersaoCenario(v))
    : [normalizarVersaoCenario({
        // só os campos de conteúdo do formato plano — id/nome do cenário NÃO viram da versão
        retrato: raw?.retrato, foco: raw?.foco, resumo: raw?.resumo, descricao: raw?.descricao,
        informacao: raw?.informacao, historia: raw?.historia, eventos: raw?.eventos,
        itens: raw?.itens, acervo: raw?.acervo, anotacoes: raw?.anotacoes, imagens: raw?.imagens,
      }, 'Base')]
  const versaoAtivaId = typeof raw?.versaoAtivaId === 'string' && versoes.some((v) => v.id === raw.versaoAtivaId)
    ? raw.versaoAtivaId
    : versoes[0].id
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? '',
    personagens: Array.isArray(raw?.personagens) ? raw.personagens : [],
    versoes,
    versaoAtivaId,
    criadoEm: raw?.criadoEm ?? agora(),
    modificadoEm: raw?.modificadoEm ?? agora(),
  }
}

/**
 * Normaliza um item lido do disco. Não há formato legado a migrar (o item nasceu já
 * assim), então isto só repara arquivo editado à mão ou truncado por conflito de sync:
 * campo faltando vira o vazio equivalente, e o id só é gerado quando de fato não existe —
 * gerar id a cada leitura quebraria todos os vínculos que apontam para ele.
 */
export function normalizarItem(raw: Record<string, any>): Item {
  return {
    id: typeof raw?.id === 'string' ? raw.id : novoId(),
    nome: raw?.nome ?? '',
    resumo: raw?.resumo ?? '',
    retrato: raw?.retrato ?? null,
    // undefined some do JSON.stringify: arquivo sem enquadramento não ganha campo vazio
    foco: normalizarFoco(raw?.foco),
    descricao: raw?.descricao ?? '',
    informacao: raw?.informacao ?? '',
    efeito: raw?.efeito ?? '',
    criadoEm: raw?.criadoEm ?? agora(),
    modificadoEm: raw?.modificadoEm ?? agora(),
  }
}

/**
 * Acesso ao cofre. Todos os caminhos de item são RELATIVOS à raiz do cofre,
 * com separador '/'. A conversão para caminho absoluto acontece aqui dentro.
 */
export class VaultRepo {
  private filas = new Map<string, Promise<unknown>>()
  private lixeira: LixeiraExecutor

  constructor(
    private raiz: string,
    private fs: FsBridge,
  ) {
    this.lixeira = new LixeiraExecutor(raiz, fs)
  }

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
    await this.fs.mkdirAll(this.abs('mapas-soltos'))
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
  async criarPersonagemEm(dir: string, nome: string): Promise<ItemRef & { id: string }> {
    await this.fs.mkdirAll(this.abs(dir))
    const slug = await this.slugLivre(dir, nome)
    const versaoBase: VersaoPersonagem = {
      id: novoId(), nome, retrato: null, resumo: '',
      descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [],
    }
    const p: Personagem = {
      id: novoId(), nome, versoes: [versaoBase], versaoAtivaId: versaoBase.id,
      criadoEm: agora(), modificadoEm: agora(),
    }
    const caminho = `${dir}/${slug}.json`
    await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(p, null, 2))
    return { slug, nome, caminho, id: p.id }
  }

  /** Cria sessão ou canvas (mesmo formato) no diretório dado. Retorna o id p/ etiqueta de campanha. */
  async criarCanvasDoc(dir: string, nome: string): Promise<ItemRef & { id: string }> {
    const slug = await this.slugLivre(dir, nome)
    const doc: CanvasDoc = { id: novoId(), nome, documento: null, criadoEm: agora(), modificadoEm: agora() }
    const caminho = `${dir}/${slug}.json`
    await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(doc, null, 2))
    return { slug, nome, caminho, id: doc.id }
  }

  /** Cria uma pasta (com pasta.json guardando nome e id) dentro de dirPai. */
  async criarPasta(dirPai: string, nome: string): Promise<ItemRef & { id: string }> {
    let existentes: string[] = []
    try {
      existentes = (await this.fs.listDir(this.abs(dirPai))).filter((e) => e.isDir).map((e) => e.name)
    } catch { /* dirPai ainda não existe */ }
    const slug = slugUnico(slugify(nome), existentes)
    const dir = `${dirPai}/${slug}`
    const id = novoId()
    const caminho = `${dir}/pasta.json`
    // mesma fila do garantirIdDePasta: sem isso, um garantirIdDePasta concorrente
    // no mesmo caminho poderia ler "sem pasta.json", sintetizar e gravar por cima
    return this.naFila(caminho, async () => {
      await this.fs.mkdirAll(this.abs(dir))
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify({ nome, id, criadoEm: agora() }, null, 2))
      return { slug, nome, caminho: dir, id }
    })
  }

  /**
   * Id da pasta, gerando e gravando na primeira vez. Pastas criadas antes da
   * campanha-em-pasta não têm id; em vez de gravar durante a varredura da árvore
   * (leitura que escreve), o id nasce no primeiro uso — o clique no 🏷️.
   */
  async garantirIdDePasta(dirDaPasta: string): Promise<string> {
    const caminho = `${dirDaPasta}/pasta.json`
    return this.naFila(caminho, async () => {
      let bruto: string | null = null
      try {
        bruto = await this.fs.readText(this.abs(caminho))
      } catch {
        // sem pasta.json: pasta criada à mão no disco, metadados nascem agora
      }
      // pasta.json ilegível NÃO cai aqui de propósito: sobrescrever destruiria um nome
      // possivelmente recuperável à mão (truncamento por conflito de sync, p.ex.).
      // Deixar o parse lançar é o comportamento não-destrutivo, alinhado com
      // montarArvorePastas, que cai no nome do diretório sem regravar nada.
      const cru = bruto?.trim()
      // ausente OU vazio: não há metadado a preservar, nasce agora.
      // Conteúdo presente porém ilegível NÃO cai aqui — ver comentário acima.
      let lido: unknown = null
      if (cru) {
        try {
          lido = JSON.parse(cru)
        } catch {
          // o SyntaxError do V8 traz posição, nunca o arquivo — sem o caminho aqui,
          // a mensagem que chega ao usuário não diz sequer que há um arquivo envolvido
          throw new Error(`pasta.json ilegível em ${dirDaPasta}`)
        }
      }
      // JSON válido mas não-objeto (array, número, string, null) não tem onde guardar o id:
      // `obj.id = x` num array vira propriedade não-índice, que o stringify descarta —
      // o arquivo ficaria intacto e o id devolvido não existiria em lugar nenhum.
      if (cru && (typeof lido !== 'object' || lido === null || Array.isArray(lido))) {
        throw new Error(`pasta.json inválido em ${dirDaPasta}`)
      }
      const obj: Record<string, unknown> = (lido as Record<string, unknown> | null)
        ?? { nome: dirDaPasta.split('/').pop() || dirDaPasta, criadoEm: agora() }
      if (typeof obj.id === 'string' && obj.id) return obj.id
      const id = novoId()
      obj.id = id
      obj.modificadoEm = agora()
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(obj, null, 2))
      return id
    })
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
      const ativa = p.versoes.find((v) => v.id === p.versaoAtivaId) ?? p.versoes[0]
      const salvo = { ...p, nome: ativa?.nome ?? p.nome, modificadoEm: agora() }
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

  /**
   * Atualiza só as camadas do mapa (read-modify-write na fila do caminho — mesmo padrão de
   * `salvarDocumentoCanvas`). Carimba `versaoCamadas` junto: a lista gravada aqui já está na
   * convenção atual (fundo → topo), e sem o marcador o próximo load a reinverteria achando
   * que veio da convenção antiga — ver `migrarOrdemCamadas` em `camadasMapa.ts`.
   */
  async salvarCamadasMapa(caminho: string, camadas: CamadaMapa[]): Promise<void> {
    return this.naFila(caminho, async () => {
      const atual: CanvasDoc = JSON.parse(await this.fs.readText(this.abs(caminho)))
      const salvo = { ...atual, camadas, versaoCamadas: VERSAO_CAMADAS, modificadoEm: agora() }
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

  // ---------- lixeira ----------

  /** Separa `dir/arquivo` num par (dir, nomeDoArquivo) — usado pelos `moverXParaLixeira`. */
  private separarDir(caminho: string): { dir: string; nome: string } {
    const nome = caminho.split('/').pop() ?? caminho
    const dir = caminho.slice(0, caminho.length - nome.length - 1)
    return { dir, nome }
  }

  /**
   * Move um personagem, item, canvas ou mapa (arquivo `.json` + `.notas` irmã, se houver) para a
   * lixeira, em vez de apagar. NÃO mexe em `vinculos.json`: a entidade continua existindo (só
   * fora da árvore que a sidebar/busca/teia varrem), e é isso que faz o vínculo reaparecer
   * sozinho se o item for restaurado — ver `esvaziarLixeira` para a limpeza definitiva.
   */
  async moverParaLixeira(tipo: TipoLixeira, caminho: string, nome: string, entidadeId?: string): Promise<string> {
    const { dir, nome: nomeArquivo } = this.separarDir(caminho)
    return this.lixeira.moverArquivoParaLixeira({
      tipo, nome, origemDir: dir, nomeArquivo, caminhoArquivo: caminho, entidadeId,
    })
  }

  /** Move o cenário (a PASTA inteira — notas e imagens dentro) para a lixeira. */
  async moverCenarioParaLixeira(dir: string, nome: string, entidadeId?: string): Promise<string> {
    const { dir: dirPai, nome: nomeArquivo } = this.separarDir(dir)
    return this.lixeira.moverPastaParaLixeira({
      tipo: 'cenario', nome, origemDirPai: dirPai, nomeArquivo, caminhoPasta: dir, entidadeId,
    })
  }

  /** Move uma pasta organizacional (personagens/itens/cenários soltos) inteira para a lixeira. */
  async moverPastaParaLixeira(dir: string, nome: string, entidadeId?: string): Promise<string> {
    const { dir: dirPai, nome: nomeArquivo } = this.separarDir(dir)
    return this.lixeira.moverPastaParaLixeira({
      tipo: 'pasta', nome, origemDirPai: dirPai, nomeArquivo, caminhoPasta: dir, entidadeId,
    })
  }

  /**
   * Move a campanha (pasta `campanhas/<slug>` inteira — sessões, personagens, canvases, escrita)
   * para a lixeira. Mesmo risco de "apagou por engano" que os outros tipos, só que em escala
   * maior: uma campanha carrega dezenas de entidades, e é exatamente por isso que fica na
   * dúvida-vira-lixeira em vez de exclusão direta.
   */
  async moverCampanhaParaLixeira(slug: string, nome: string, entidadeId?: string): Promise<string> {
    return this.lixeira.moverPastaParaLixeira({
      tipo: 'campanha', nome, origemDirPai: 'campanhas', nomeArquivo: slug, caminhoPasta: `campanhas/${slug}`, entidadeId,
    })
  }

  /** Move uma página de caderno (e as descendentes, já coletadas por quem chama) para a lixeira. */
  async moverPaginaParaLixeira(params: { docCaminho: string; dirNotas: string; nome: string; slugs: string[] }): Promise<string> {
    return this.lixeira.moverPaginasParaLixeira(params)
  }

  async listarLixeira(): Promise<EntradaLixeira[]> {
    return this.lixeira.listar()
  }

  /** Restaura ao lugar de origem (recriando-o se preciso); devolve a entrada restaurada. */
  async restaurarDaLixeira(id: string): Promise<EntradaLixeira> {
    return this.lixeira.restaurar(id)
  }

  /** Apaga tudo da lixeira, de vez. Devolve os `entidadeId` das entradas removidas, para quem chama limpar `vinculos.json`. */
  async esvaziarLixeira(): Promise<string[]> {
    return this.lixeira.esvaziar()
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
    const versaoBase: VersaoCenario = {
      id: novoId(), nome: 'Base', retrato: null, resumo: '',
      descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [],
    }
    const c: Cenario = {
      id: novoId(), nome, personagens: [],
      versoes: [versaoBase], versaoAtivaId: versaoBase.id,
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
    let id: string | undefined
    try {
      const meta = JSON.parse(await this.fs.readText(this.abs(`${dir}/pasta.json`))) as { nome: string; id?: string }
      nome = meta.nome
      id = meta.id
    } catch {
      // raiz ou pasta sem metadados
    }
    subpastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    cenarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { slug: dir.split('/').pop() ?? dir, nome, id, caminho: dir, subpastas, cenarios }
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

  // ---------- itens ----------

  /** Cria um item (arquivo .json) dentro de dir (a raiz `itens` ou uma pasta dela). */
  async criarItemEm(dir: string, nome: string): Promise<ItemRef & { id: string }> {
    await this.fs.mkdirAll(this.abs(dir))
    const slug = await this.slugLivre(dir, nome)
    const item: Item = {
      id: novoId(), nome, resumo: '', retrato: null,
      descricao: '', informacao: '', efeito: '',
      criadoEm: agora(), modificadoEm: agora(),
    }
    const caminho = `${dir}/${slug}.json`
    await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(item, null, 2))
    return { slug, nome, caminho, id: item.id }
  }

  async lerItem(caminho: string): Promise<Item> {
    return normalizarItem(JSON.parse(await this.fs.readText(this.abs(caminho))))
  }

  async salvarItem(caminho: string, item: Item): Promise<void> {
    return this.naFila(caminho, async () => {
      const salvo = { ...item, modificadoEm: agora() }
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify(salvo, null, 2))
    })
  }

  /** Move o .json do item para outra pasta (mesma mecânica do personagem). */
  async moverItem(caminhoOrigem: string, dirDestino: string): Promise<void> {
    return this.moverPersonagem(caminhoOrigem, dirDestino)
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

  // ---------- layout da teia ----------

  /**
   * Lê `layout-teia.json` da raiz do cofre: escopo (cofre inteiro ou uma campanha) -> posições
   * que o usuário arrumou na aba Teia. Ausente/corrompido -> objeto vazio, tudo cai no layout
   * automático em vez de quebrar a tela.
   */
  async lerLayoutTeia(): Promise<Record<string, LayoutSalvo>> {
    try {
      return normalizarLayoutTeia(JSON.parse(await this.fs.readText(this.abs('layout-teia.json'))))
    } catch {
      return {}
    }
  }

  async salvarLayoutTeia(porEscopo: Record<string, LayoutSalvo>): Promise<void> {
    return this.naFila('layout-teia.json', async () => {
      await this.fs.writeTextAtomic(this.abs('layout-teia.json'), JSON.stringify(porEscopo, null, 2))
    })
  }

  // ---------- chat IA ----------

  /** Lê o chat de IA de uma sessão (dirNotas/chat-ia.json); ausente/corrompido → []. */
  async lerChatIA(dirNotas: string): Promise<MensagemChat[]> {
    try {
      return normalizarChat(JSON.parse(await this.fs.readText(this.abs(`${dirNotas}/chat-ia.json`))))
    } catch {
      return []
    }
  }

  async salvarChatIA(dirNotas: string, mensagens: MensagemChat[]): Promise<void> {
    const caminho = `${dirNotas}/chat-ia.json`
    return this.naFila(caminho, async () => {
      await this.fs.mkdirAll(this.abs(dirNotas))
      await this.fs.writeTextAtomic(this.abs(caminho), JSON.stringify({ mensagens }, null, 2))
    })
  }

  /** Todo caminho de documento que PODE conter uma sala: sessão, canvas ou mapa (soltos ou de campanha). */
  private caminhosCanvasDaArvore(tree: VaultTree): string[] {
    const out: string[] = []
    for (const i of tree.canvasesSoltos) if (!i.erro) out.push(i.caminho)
    for (const i of tree.mapasSoltos) if (!i.erro) out.push(i.caminho)
    for (const camp of tree.campanhas) {
      for (const i of camp.sessoes) if (!i.erro) out.push(i.caminho)
      for (const i of camp.canvases) if (!i.erro) out.push(i.caminho)
    }
    return out
  }

  /**
   * Redireciona toda sala de mapa que apontava para `origemId` a passar a apontar para
   * `destinoId` — chamada pela absorção de cenário (`store.ts`, `absorverCenarioComoVersao`).
   * Sem isto a sala fica com vínculo "quebrado" mesmo com o conteúdo dela vivo dentro do
   * cenário de destino: `cenarioId` é uma prop de shape do tldraw (`SalaMapaShape.tsx`),
   * enterrada dentro do snapshot de CADA documento — não há como saber de antemão quais
   * documentos têm uma sala apontando pra este cenário sem abrir cada um.
   *
   * Varre TODO documento que pode conter uma sala (não só mapas — sessão/canvas comum
   * também podem ter uma shape sala-mapa arrastada pra lá). Um documento individual
   * corrompido/ilegível é pulado (log + segue); nunca derruba a absorção inteira por
   * causa de um mapa que já estava com problema antes.
   */
  async redirecionarSalasDeCenario(tree: VaultTree, origemId: string, destinoId: string): Promise<number> {
    let total = 0
    for (const caminho of this.caminhosCanvasDaArvore(tree)) {
      try {
        const doc = await this.lerCanvasDoc(caminho)
        const snapshot = doc.documento as { document?: Record<string, unknown> } | null
        const registros = snapshot?.document
        if (!registros) continue
        let mudou = false
        for (const rec of Object.values(registros)) {
          const r = rec as { typeName?: string; type?: string; props?: Record<string, unknown> }
          if (r?.typeName === 'shape' && ehTipoSala(r.type) && r.props?.cenarioId === origemId) {
            r.props.cenarioId = destinoId
            mudou = true
            total++
          }
        }
        if (mudou) await this.salvarCanvasDoc(caminho, doc)
      } catch (e) {
        console.error(`Falha ao redirecionar salas de mapa em ${caminho}:`, e)
      }
    }
    return total
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
      mapasSoltos: await this.listarItens('mapas-soltos'),
      personagensSoltos: await this.montarArvorePastas('personagens-soltos'),
      cenarios: await this.montarArvoreCenarios(),
      itens: await this.montarArvoreItens(),
    }
  }

  /** Monta recursivamente a árvore de pastas + personagens de um diretório raiz. */
  async montarArvorePastas(dir: string): Promise<PastaNode> {
    const a = await this.montarArvoreDeArquivos(dir)
    const comoPasta = (n: ArvoreDeArquivos): PastaNode => ({
      slug: n.slug, nome: n.nome, id: n.id, caminho: n.caminho,
      subpastas: n.subpastas.map(comoPasta), personagens: n.arquivos,
    })
    return comoPasta(a)
  }

  /** Monta a árvore da seção de Itens (mesma varredura, outro rótulo de folha). */
  async montarArvoreItens(dir = 'itens'): Promise<PastaItemNode> {
    const a = await this.montarArvoreDeArquivos(dir)
    const comoPasta = (n: ArvoreDeArquivos): PastaItemNode => ({
      slug: n.slug, nome: n.nome, id: n.id, caminho: n.caminho,
      subpastas: n.subpastas.map(comoPasta), itens: n.arquivos,
    })
    return comoPasta(a)
  }

  /**
   * Varredura genérica de "pastas aninhadas contendo arquivos .json". Serve a personagens
   * e a itens: as duas seções têm exatamente esta forma, e só divergem no nome do campo
   * das folhas. Cenário NÃO passa por aqui — lá a entidade é o próprio diretório.
   */
  private async montarArvoreDeArquivos(dir: string): Promise<ArvoreDeArquivos> {
    let entries: { name: string; isDir: boolean }[] = []
    try {
      entries = await this.fs.listDir(this.abs(dir))
    } catch {
      // diretório ainda não existe
    }
    const subpastas: ArvoreDeArquivos[] = []
    const personagens: ItemRef[] = []
    for (const e of entries) {
      if (e.isDir) {
        subpastas.push(await this.montarArvoreDeArquivos(`${dir}/${e.name}`))
      } else if (e.name.endsWith('.json') && e.name !== 'pasta.json') {
        const slug = e.name.replace(/\.json$/, '')
        const caminho = `${dir}/${e.name}`
        try {
          const obj = JSON.parse(await this.fs.readText(this.abs(caminho)))
          personagens.push({ slug, nome: obj.nome ?? slug, caminho, id: obj.id })
        } catch {
          personagens.push({ slug, nome: slug, caminho, erro: true })
        }
      }
    }
    let nome = dir.split('/').pop() ?? dir
    let id: string | undefined
    try {
      const meta = JSON.parse(await this.fs.readText(this.abs(`${dir}/pasta.json`))) as { nome: string; id?: string }
      nome = meta.nome
      id = meta.id
    } catch {
      // raiz ou pasta sem metadados
    }
    subpastas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    personagens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return { slug: dir.split('/').pop() ?? dir, nome, id, caminho: dir, subpastas, arquivos: personagens }
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
        itens.push({ slug, nome: obj.nome ?? slug, caminho, id: obj.id })
      } catch {
        itens.push({ slug, nome: slug, caminho, erro: true })
      }
    }
    itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return itens
  }
}
