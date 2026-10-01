import { DIR_LIXEIRA } from '../lixeira'
import { nomeCenarioExibido } from '../nomeCenarioExibido'
import { ehPastaInternaDaArvore } from '../pastasInternas'
import { listarCofre } from './citacoes'
import { calcularHashEntrada, idDoPlano } from './impressao'
import {
  PASTA_IMAGENS, baseDoArquivo, chaveCaminho, destinoNaPasta, ehImagem, ehNomeGenerico, extensaoDoCaminho,
  nomeCasa, nomePasta, nomeSemExtensao, type PapelImagem,
} from './nomes'
import { paraCadaString, relsEmHtml } from './referencias'
import type { Movimento, ParTroca, Plano, PortasOrganizar, Reescrita, Remocao } from './tipos'

/**
 * Planejador do "Organizar imagens": lê o cofre e decide para onde cada imagem vai, sem mover nada.
 *
 * Quatro regras carregam o arquivo:
 *
 * 1. **A imagem é de quem a cita com mais força.** Um retrato de personagem colado num mapa é do
 *    personagem, não do mapa: o mapa só passa a citar o endereço novo. A força é `PRIORIDADE`
 *    (retrato > versão > galeria > mapa > nota > citação sem papel), e ficha na lixeira perde de
 *    ficha viva. A imagem citada vai para a pasta do dono, venha de onde vier.
 * 2. **Sem citação, só se mexe o que o app pôs ali.** Num lugar onde o app grava imagem sozinho
 *    (`ehLugarDoApp`), a imagem que ninguém cita vai para `imagens/soltas/`, e a cópia repetida
 *    sai. Fora deles a imagem é do usuário — a pasta `Imagens/` montada à mão, uma foto na raiz —
 *    e fica exatamente onde está: nem vai para `soltas/`, nem sai como cópia de outra.
 * 3. **Nunca tomar o lugar de um arquivo que existe.** O destino é livre contra TODO arquivo do cofre
 *    hoje, inclusive imagem que vai sair dali. Custa um `-2` de vez em quando; em troca, o executor
 *    pode copiar antes de apagar sem nunca sobrescrever nada — e um plano interrompido no meio não
 *    destrói arquivo.
 * 4. **Quem já está no lugar certo fica.** Imagem que já mora na pasta do dono com o nome do papel
 *    (ou uma variante `-N` dele, ou qualquer número na galeria) não se mexe, e caixa diferente não
 *    conta (NTFS) — nem no caminho da imagem, nem na citação dela: `imagens/x.png` abre `Imagens/x.png`.
 *    É isso que faz organizar duas vezes não mudar nada na segunda.
 */

/** Força de cada tipo de citação. Menor ganha. */
const PRIORIDADE = {
  retrato: 10,
  retratoVersao: 20,
  galeria: 30,
  htmlDeEntidade: 35,
  mapa: 40,
  canvas: 45,
  nota: 50,
  semPapel: 90,
} as const

/** Ficha na lixeira ainda cita, mas perde para qualquer ficha viva. */
const PENALIDADE_LIXEIRA = 100

type TipoDono = 'personagem' | 'cenario' | 'item' | 'mapa' | 'canvas' | 'nota'

/** Ordem das seções quando dois donos disputam o mesmo nome de pasta: define quem fica sem `-2`. */
const ORDEM_TIPO: Record<TipoDono, number> = { personagem: 0, cenario: 1, item: 2, mapa: 3, canvas: 4, nota: 5 }

interface Dono {
  chave: string
  tipo: TipoDono
  nome: string
  /** `rel` do JSON que define o dono. */
  arquivo: string
  /** Cenário pai (chave de dono), para o subcenário morar dentro da pasta dele. */
  pai?: string
  profundidade: number
  naLixeira: boolean
}

interface Citacao {
  /** `rel` do arquivo de texto onde a citação está. */
  arquivo: string
  /** A string exata que o arquivo guarda (ou o valor do `data-rel` já sem escape). */
  valor: string
  dono: Dono | null
  papel: PapelImagem
  prioridade: number
  ordem: number
}

interface Imagem {
  rel: string
  sha256: string
  naLixeira: boolean
  citacoes: Citacao[]
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function texto(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/** Chave de ordenação de arquivo: sem `.json`, para `gandalf` vir antes de `gandalf-2`. */
function chaveOrdem(arquivo: string): string {
  return arquivo.replace(/\.json$/i, '')
}

function dirDe(rel: string): string {
  const corte = rel.lastIndexOf('/')
  return corte < 0 ? '' : rel.slice(0, corte)
}

function nomeDe(rel: string): string {
  return rel.slice(rel.lastIndexOf('/') + 1)
}

function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Pastas da raiz onde o app grava — ou gravava, até as imagens novas passarem a nascer em
 * `imagens/` — imagem com nome que ele mesmo inventou: colada no mapa ou no canvas, colada na nota,
 * retrato e galeria de cenário, retrato de item.
 */
const PASTAS_DO_APP = new Set(['imagens-canvas', 'imagens-notas', 'imagens-cenarios', 'imagens-itens'])

/**
 * A imagem mora num lugar onde o app cria imagem? Só filho direto conta, porque é ali que o app
 * grava: subpasta lá dentro foi o usuário que fez. A pasta de retratos e galerias de personagem
 * (`<pasta>/assets/`, em qualquer profundidade) segue a regra da árvore (`ehPastaInternaDaArvore`):
 * com `.json` ou subpasta dentro, é conteúdo do mestre que só tem o mesmo nome.
 *
 * `imagens/` não entra: sem citação, quem mora lá ou já foi organizado ou foi posto pelo usuário — e
 * no NTFS ela é a mesma pasta que a `Imagens/` que o usuário pode ter montado à mão.
 */
function ehLugarDoApp(rel: string, comConteudo: ReadonlySet<string>): boolean {
  const dir = dirDe(rel)
  if (dir === '') return false
  if (PASTAS_DO_APP.has(chaveCaminho(dir))) return true
  return ehPastaInternaDaArvore(nomeDe(dir), comConteudo.has(chaveCaminho(dir)))
}

/**
 * Pastas (chave) que têm conteúdo do mestre dentro — um `.json` (ficha, `cenario.json`,
 * `pasta.json`) ou uma subpasta —, o marcador que a árvore usa para não esconder um cenário
 * batizado "Assets".
 */
function pastasComConteudo(arquivos: string[]): Set<string> {
  const saida = new Set<string>()
  for (const rel of arquivos) {
    let dir = dirDe(rel)
    if (rel.toLowerCase().endsWith('.json')) saida.add(chaveCaminho(dir))
    while (dir.includes('/')) {
      dir = dirDe(dir)
      saida.add(chaveCaminho(dir))
    }
  }
  return saida
}

type Classe = TipoDono | 'outro'

/** O que é este JSON, pela forma — a lixeira guarda a ficha fora da seção, então o caminho não basta. */
function classificar(arquivo: string, obj: Record<string, unknown>): Classe {
  if ('documento' in obj && 'nome' in obj) {
    return 'camadas' in obj || /(^|\/)mapas-soltos\//.test(arquivo) ? 'mapa' : 'canvas'
  }
  if (nomeDe(arquivo).toLowerCase() === 'cenario.json') return 'cenario'
  if (typeof obj.titulo === 'string' && typeof obj.corpo === 'string') return 'nota'
  if (Array.isArray(obj.versoes)) return 'personagem'
  // `pasta.json` de `itens/` tem `nome` mas não `retrato`: não é item, não pode reservar pasta.
  if ('efeito' in obj || (/(^|\/)itens\//.test(arquivo) && 'retrato' in obj)) return 'item'
  if ('retrato' in obj || 'imagens' in obj) return 'personagem'
  return 'outro'
}

function nomeDoDono(classe: TipoDono, arquivo: string, obj: Record<string, unknown>): string {
  if (classe === 'nota') return texto(obj.titulo) ?? 'sem título'
  // Personagem: a pasta leva o nome da PRIMEIRA forma, não da ativa. O `nome` de topo espelha a
  // versão ativa, e trocar Bruce Banner por Hulk mudaria a pasta — e moveria todas as imagens
  // dele — a cada troca de forma. A versão ativa aparece no nome do arquivo (`retrato.png`).
  if (classe === 'personagem' && Array.isArray(obj.versoes)) {
    const primeira = obj.versoes[0]
    const nomePrimeira = ehObjeto(primeira) ? texto(primeira.nome) : undefined
    if (nomePrimeira !== undefined) return nomePrimeira
  }
  return texto(obj.nome) ?? nomeSemExtensao(classe === 'cenario' ? dirDe(arquivo) : arquivo)
}

interface Leitura {
  arquivo: string
  obj: unknown
  classe: Classe
  dono: Dono | null
}

export async function planejarOrganizacao(raiz: string, portasOriginais: PortasOrganizar): Promise<Plano> {
  // Cada imagem é hasheada uma vez: a impressão do fim pede de novo os mesmos arquivos.
  const hashes = new Map<string, Promise<string>>()
  const portas: PortasOrganizar = {
    fs: portasOriginais.fs,
    hash: (abs) => {
      let h = hashes.get(abs)
      if (h === undefined) {
        h = portasOriginais.hash(abs)
        hashes.set(abs, h)
      }
      return h
    },
  }
  const avisos = new Set<string>()
  const arquivos = await listarCofre(raiz, portas.fs)
  const naLixeira = (rel: string) => rel === DIR_LIXEIRA || rel.startsWith(`${DIR_LIXEIRA}/`)

  // Citação casa com imagem pela chave (NFC, sem caixa). Dois arquivos com a mesma chave — o mesmo
  // nome com o acento composto de outro jeito (NFC × NFD), que no NTFS são arquivos distintos — não
  // dá para saber qual citação é de qual: mover um e reescrever as duas faria uma ficha apontar para a
  // imagem errada. Esses ficam fora do plano (continuam contando como ocupados), e quem os cita, intacto.
  const imagens = new Map<string, Imagem>()
  const ambiguas = new Map<string, string[]>()
  for (const rel of arquivos) {
    if (!ehImagem(rel)) continue
    const chave = chaveCaminho(rel)
    const mesmaChave = ambiguas.get(chave)
    if (mesmaChave !== undefined) {
      mesmaChave.push(rel)
      continue
    }
    const outra = imagens.get(chave)
    if (outra !== undefined) {
      imagens.delete(chave)
      ambiguas.set(chave, [outra.rel, rel])
      continue
    }
    const sha256 = await portas.hash(`${raiz}/${rel}`)
    imagens.set(chave, { rel, sha256, naLixeira: naLixeira(rel), citacoes: [] })
  }
  for (const rels of ambiguas.values()) {
    avisos.add(
      `${[...rels].sort(comparar).join(', ')} têm o mesmo nome, só com o acento ou as maiúsculas escritos de outro jeito: ` +
      'ficaram onde estão, e quem as cita não foi mexido, porque não dá para saber qual citação é de qual. ' +
      'Renomeie uma delas e organize de novo.',
    )
  }

  // ---- ler e classificar todo JSON ----
  const leituras: Leitura[] = []
  for (const arquivo of arquivos) {
    if (!arquivo.toLowerCase().endsWith('.json')) continue
    let obj: unknown
    try {
      obj = JSON.parse((await portas.fs.readText(`${raiz}/${arquivo}`)).replace(/^﻿/, ''))
    } catch {
      avisos.add(`Não deu para ler ${arquivo} (JSON inválido); as imagens que ele cita não foram consideradas.`)
      continue
    }
    const classe: Classe = ehObjeto(obj) ? classificar(arquivo, obj) : 'outro'
    const dono: Dono | null = classe === 'outro' || !ehObjeto(obj) ? null : {
      chave: `${classe}:${arquivo}`,
      tipo: classe,
      nome: nomeDoDono(classe, arquivo, obj),
      arquivo,
      profundidade: 0,
      naLixeira: naLixeira(arquivo),
    }
    leituras.push({ arquivo, obj, classe, dono })
  }

  // cenário pai = `cenario.json` do diretório de cima, se houver
  const cenarioPorDir = new Map<string, Dono>()
  for (const l of leituras) if (l.dono?.tipo === 'cenario') cenarioPorDir.set(chaveCaminho(dirDe(l.arquivo)), l.dono)
  // Nome gravado do subcenário carrega a cadeia do pai ("Reino: Torre"); a pasta já está dentro
  // da do pai, então repetir seria "Reino/Reino Torre". Compara com o nome ORIGINAL do pai.
  const nomeGravado = new Map([...cenarioPorDir.values()].map((d) => [d.chave, d.nome]))
  for (const d of cenarioPorDir.values()) {
    const pai = cenarioPorDir.get(chaveCaminho(dirDe(dirDe(d.arquivo))))
    if (pai === undefined) continue
    d.pai = pai.chave
    d.nome = nomeCenarioExibido(d.nome, nomeGravado.get(pai.chave))
  }
  const donos = new Map<string, Dono>()
  for (const l of leituras) if (l.dono !== null) donos.set(l.dono.chave, l.dono)
  for (const d of donos.values()) {
    let p = d.pai
    while (p !== undefined && d.profundidade < 64) {
      d.profundidade += 1
      p = donos.get(p)?.pai
    }
  }

  // ---- achar as citações ----
  for (const l of leituras) coletarCitacoes(l, imagens, new Set(ambiguas.keys()), avisos)

  // ---- duplicatas: mesmo conteúdo do MESMO dono vira uma imagem só ----
  // Juntar cópias de donos diferentes num arquivo só faria os dois donos dividirem a imagem: trocar
  // o retrato de um, ou tirá-la da galeria dele, estragaria a do outro. Então só se junta dentro de
  // um dono; entre donos, as cópias ficam separadas e o usuário é avisado. Cópia que ninguém cita
  // sempre pode sair — apagar o que ninguém usa não estraga ninguém —, desde que o app a tenha
  // criado: a imagem do usuário (regra 2) nem entra no plano, então não sai nem segura outra.
  const melhor = (img: Imagem): Citacao | undefined => [...img.citacoes].sort(compararCitacao)[0]
  const comConteudo = pastasComConteudo(arquivos)
  const planejaveis = [...imagens.values()].filter((i) =>
    i.citacoes.length > 0 || (!i.naLixeira && ehLugarDoApp(i.rel, comConteudo)))
  const porHash = new Map<string, Imagem[]>()
  for (const img of planejaveis) porHash.set(img.sha256, [...(porHash.get(img.sha256) ?? []), img])
  const removidas = new Map<Imagem, Imagem>() // removida → mantida
  const repetidasEntreDonos: string[][] = []
  /** Quem cita a imagem: o dono de cada citação, ou o próprio arquivo quando ele não é dono de nada. */
  const donosDe = (img: Imagem) => new Set(img.citacoes.map((c) => c.dono?.chave ?? `arquivo:${c.arquivo}`))
  for (const grupo of porHash.values()) {
    if (grupo.length < 2) continue
    grupo.sort((a, b) => {
      const ma = melhor(a)
      const mb = melhor(b)
      if (ma === undefined || mb === undefined) return ma === mb ? comparar(a.rel, b.rel) : ma === undefined ? 1 : -1
      return compararCitacao(ma, mb) || comparar(a.rel, b.rel)
    })
    const citadas = grupo.filter((i) => i.citacoes.length > 0)
    const semCitacao = grupo.filter((i) => i.citacoes.length === 0)
    const donos = new Set(citadas.flatMap((i) => [...donosDe(i)]))
    // `grupo[0]` é a melhor citada (ou, sem nenhuma citada, a primeira por caminho).
    const mantida = grupo[0]
    // Uma citada só não tem de quem ficar separada, nem quando vários donos citam ELA (a mesma
    // imagem colada em duas sessões): o resto do grupo é cópia que ninguém cita. Contar os donos
    // sem olhar quantas imagens são fazia um "grupo" de um caminho só.
    if (citadas.length < 2 || donos.size <= 1) {
      // As citações da cópia continuam nela; `finalDe` as manda para o endereço da mantida.
      for (const c of grupo.slice(1)) removidas.set(c, mantida)
      continue
    }
    for (const c of semCitacao) removidas.set(c, mantida)
    repetidasEntreDonos.push(citadas.map((i) => i.rel).sort(comparar))
  }
  repetidasEntreDonos.sort((a, b) => comparar(a[0], b[0]))
  const mantidas = planejaveis.filter((i) => !removidas.has(i))

  // ---- pasta de cada dono ----
  const ocupados = new Set(arquivos.map(chaveCaminho))
  const pastas = decidirPastas(mantidas, donos, melhor)

  // ---- nome de cada imagem ----
  const destino = new Map<Imagem, string>()
  const ordenadas = [...mantidas].sort((a, b) => {
    const ma = melhor(a)
    const mb = melhor(b)
    const oa = ma?.dono ? ordemDono(ma.dono) : '~'
    const ob = mb?.dono ? ordemDono(mb.dono) : '~'
    return comparar(oa, ob) || (ma?.ordem ?? 0) - (mb?.ordem ?? 0) || comparar(a.rel, b.rel)
  })
  const alvo = (img: Imagem) => {
    const m = melhor(img)
    const papel: PapelImagem = m?.dono ? m.papel : { papel: 'nomeada', nome: nomeSemExtensao(img.rel) }
    const pastaDono = m?.dono ? pastas.get(m.dono.chave) : undefined
    const pastaNumerada = pastaDono ?? `${PASTA_IMAGENS}/soltas`
    if (m?.dono?.tipo === 'item' && papel.papel === 'retrato') {
      // Retrato de item é arquivo solto em `itens/`, com o nome (já único) da pasta do item.
      return { pasta: dirDe(pastaNumerada), base: nomeDe(pastaNumerada) }
    }
    // Fora o retrato de item (tratado acima), o nome do arquivo só depende do papel, não do tipo
    // do dono — por isso qualquer dono não-item serve para `baseDoArquivo`.
    const base = m?.dono ? baseDoArquivo({ tipo: 'solta' }, papel) : nomePasta(nomeSemExtensao(img.rel))
    return { pasta: pastaNumerada, base }
  }
  const tomados = new Set<string>()
  // 1ª passada: quem já está no lugar certo fica (e segura o nome)
  for (const img of ordenadas) {
    const { pasta, base } = alvo(img)
    if (jaEstaNoLugar(img.rel, pasta, base)) {
      destino.set(img, img.rel)
      tomados.add(chaveCaminho(img.rel))
    }
  }
  // 2ª passada: o resto pega o primeiro nome livre
  for (const img of ordenadas) {
    if (destino.has(img)) continue
    const { pasta, base } = alvo(img)
    const para = destinoNaPasta(pasta, base, extensaoDoCaminho(img.rel), [...ocupados, ...tomados])
    destino.set(img, para)
    tomados.add(chaveCaminho(para))
  }

  // ---- montar o plano ----
  const movimentos: Movimento[] = []
  for (const img of mantidas) {
    const para = destino.get(img)
    if (para !== undefined && para !== img.rel) movimentos.push({ de: img.rel, para, sha256: img.sha256 })
  }
  const remocoes: Remocao[] = []
  for (const [copia, mantida] of removidas) {
    remocoes.push({
      rel: copia.rel,
      sha256: copia.sha256,
      motivo: melhor(mantida)?.dono ? 'copia-de-imagem-com-dono' : 'duplicata-interna',
      mantida: destino.get(mantida) ?? mantida.rel,
    })
  }
  const finalDe = (img: Imagem): string => {
    const mantida = removidas.get(img)
    return destino.get(mantida ?? img) ?? img.rel
  }
  const paresPorArquivo = new Map<string, Map<string, string>>()
  for (const img of imagens.values()) {
    const para = finalDe(img)
    for (const c of img.citacoes) {
      // Quem fica guarda a grafia do disco (`jaEstaNoLugar` ignora a caixa), e com a `Imagens/` do
      // usuário no cofre o disco diz `Imagens/` onde a ficha cita `imagens/`. Reescrever só a caixa
      // faria toda prévia depois de organizar sair cheia, sem nenhuma imagem mudar de lugar.
      if (abreOMesmoArquivo(c.valor, para)) continue
      const pares = paresPorArquivo.get(c.arquivo) ?? new Map<string, string>()
      pares.set(c.valor, para)
      paresPorArquivo.set(c.arquivo, pares)
    }
  }
  const reescritas: Reescrita[] = [...paresPorArquivo]
    .map(([arquivo, pares]) => ({
      arquivo,
      pares: [...pares].map(([de, para]): ParTroca => ({ de, para })).sort((a, b) => comparar(a.de, b.de)),
    }))
    .sort((a, b) => comparar(a.arquivo, b.arquivo))
  movimentos.sort((a, b) => comparar(a.de, b.de))
  remocoes.sort((a, b) => comparar(a.rel, b.rel))

  const hashEntrada = await calcularHashEntrada(raiz, { movimentos, remocoes, reescritas }, portas)
  const semId = {
    versao: 1 as const, hashEntrada, movimentos, reescritas, remocoes, avisos: [...avisos].sort(comparar), repetidasEntreDonos,
  }
  return { ...semId, id: await idDoPlano(semId, raiz) }
}

function compararCitacao(a: Citacao, b: Citacao): number {
  return a.prioridade - b.prioridade || comparar(chaveOrdem(a.arquivo), chaveOrdem(b.arquivo)) || a.ordem - b.ordem
}

/** Ordem estável dos donos: lixeira por último, depois seção, profundidade e arquivo. */
function ordemDono(d: Dono): string {
  return `${d.naLixeira ? 1 : 0}|${ORDEM_TIPO[d.tipo]}|${String(d.profundidade).padStart(3, '0')}|${chaveOrdem(d.arquivo)}`
}

/**
 * A citação `valor` já abre o arquivo `para` no NTFS? Só a caixa pode mudar. Sem `normalize`, de
 * propósito: lá o acento composto de outro jeito (NFC × NFD) é outro nome, e essa citação não abre a
 * imagem — tem de ser reescrita com a grafia do disco.
 */
function abreOMesmoArquivo(valor: string, para: string): boolean {
  return valor.toLowerCase() === para.toLowerCase()
}

/** A imagem já mora em `pasta` com o nome do papel (ou `base-N`; numerada: qualquer número)? */
function jaEstaNoLugar(rel: string, pasta: string, base: string | null): boolean {
  return chaveCaminho(dirDe(rel)) === chaveCaminho(pasta) && nomeCasa(nomeSemExtensao(nomeDe(rel)), base)
}

/**
 * Pasta única por dono. Dono que já tem imagem numa pasta válida para ele (o nome, ou `nome-N`)
 * fica com ela; os outros pegam o primeiro nome livre, sem invadir pasta que outro dono já ocupa.
 */
function decidirPastas(
  mantidas: Imagem[],
  donos: Map<string, Dono>,
  melhor: (img: Imagem) => Citacao | undefined,
): Map<string, string> {
  const pastas = new Map<string, string>()
  const tomadas = new Set<string>()
  const atuais = new Map<string, string[]>() // dono → pastas onde suas imagens moram hoje
  for (const img of mantidas) {
    const m = melhor(img)
    if (!m?.dono) continue
    const dir = m.dono.tipo === 'item' && m.papel.papel === 'retrato'
      ? `${dirDe(img.rel)}/${nomeSemExtensao(img.rel)}`
      : dirDe(img.rel)
    atuais.set(m.dono.chave, [...(atuais.get(m.dono.chave) ?? []), dir])
  }
  // Reserva: pasta que já é de um dono (imagem dele mora lá) não é oferecida a outro.
  const reservadas = new Map<string, string>()
  const ordem = [...donos.values()].sort((a, b) => comparar(ordemDono(a), ordemDono(b)))
  for (const d of ordem) {
    for (const dir of atuais.get(d.chave) ?? []) {
      if (!reservadas.has(chaveCaminho(dir))) reservadas.set(chaveCaminho(dir), d.chave)
    }
  }

  function pastaDo(d: Dono): string {
    const pronta = pastas.get(d.chave)
    if (pronta !== undefined) return pronta
    const paiDono = d.pai === undefined ? undefined : donos.get(d.pai)
    const secao = d.tipo === 'personagem' ? 'personagens' : d.tipo === 'cenario' ? 'cenarios'
      : d.tipo === 'item' ? 'itens' : d.tipo === 'mapa' ? 'mapas' : d.tipo === 'canvas' ? 'canvas' : 'notas'
    const pai = paiDono === undefined ? `${PASTA_IMAGENS}/${secao}` : pastaDo(paiDono)
    const base = `${pai}/${nomePasta(d.nome)}`
    const livre = (p: string) => !tomadas.has(chaveCaminho(p))
      && (reservadas.get(chaveCaminho(p)) ?? d.chave) === d.chave
    // Nome de pasta pode ter ponto ("Sr. Frodo"): compara o segmento inteiro, sem tirar "extensão".
    const preferida = (atuais.get(d.chave) ?? []).find((dir) =>
      livre(dir) && chaveCaminho(dirDe(dir)) === chaveCaminho(pai) && nomeCasa(nomeDe(dir), nomeDe(base)))
    let escolhida = preferida
    if (escolhida === undefined) {
      escolhida = base
      for (let n = 2; !livre(escolhida); n++) escolhida = `${base}-${n}`
    }
    pastas.set(d.chave, escolhida)
    tomadas.add(chaveCaminho(escolhida))
    return escolhida
  }
  // Só dono que fica com alguma imagem ganha pasta (o pai de subcenário vem junto, pela recursão):
  // dono sem imagem reservando nome empurraria outro para `-2` à toa.
  for (const d of ordem) if (atuais.has(d.chave)) pastaDo(d)
  return pastas
}

/** Acha as citações de imagem de um JSON: primeiro as de papel conhecido, depois qualquer string que seja caminho de imagem. */
function coletarCitacoes(
  l: Leitura,
  imagens: Map<string, Imagem>,
  ambiguas: ReadonlySet<string>,
  avisos: Set<string>,
): void {
  const vistas = new Set<string>()
  let ordem = 0
  const penalidade = l.dono?.naLixeira ? PENALIDADE_LIXEIRA : 0
  const citar = (valor: string, dono: Dono | null, papel: PapelImagem, prioridade: number, conhecida: boolean) => {
    if (vistas.has(valor)) return
    const chave = chaveCaminho(valor)
    // imagem de nome ambíguo (ver `planejarOrganizacao`): a citação fica como está, e não é quebrada
    if (ambiguas.has(chave)) return
    const img = imagens.get(chave)
    if (img === undefined) {
      if (conhecida) avisos.add(`${l.arquivo} cita ${valor}, que não existe no cofre (referência já quebrada).`)
      return
    }
    vistas.add(valor)
    img.citacoes.push({ arquivo: l.arquivo, valor, dono, papel, prioridade: prioridade + penalidade, ordem: ordem++ })
  }
  const numerada: PapelImagem = { papel: 'numerada' }
  const obj = l.obj
  const dono = l.dono

  if (dono !== null && ehObjeto(obj)) {
    if (dono.tipo === 'personagem' || dono.tipo === 'cenario') {
      const versoes = Array.isArray(obj.versoes) && obj.versoes.length > 0 ? obj.versoes : [obj]
      const primeira = versoes[0]
      const ativaId = typeof obj.versaoAtivaId === 'string' && versoes.some((v) => ehObjeto(v) && v.id === obj.versaoAtivaId)
        ? obj.versaoAtivaId
        : ehObjeto(primeira) ? primeira.id : undefined
      versoes.forEach((v, i) => {
        if (!ehObjeto(v)) return
        const retrato = texto(v.retrato)
        if (retrato !== undefined) {
          const ativa = versoes.length === 1 || v.id === ativaId
          const papel: PapelImagem = ativa ? { papel: 'retrato' } : { papel: 'retrato-versao', versao: texto(v.nome) ?? `versão ${i + 1}` }
          citar(retrato, dono, papel, ativa ? PRIORIDADE.retrato : PRIORIDADE.retratoVersao, true)
        }
      })
      for (const v of versoes) {
        if (!ehObjeto(v) || !Array.isArray(v.imagens)) continue
        for (const im of v.imagens) {
          const rel = ehObjeto(im) ? texto(im.rel) : undefined
          if (rel !== undefined) citar(rel, dono, numerada, PRIORIDADE.galeria, true)
        }
      }
      for (const v of versoes) paraCadaString(v, (s) => { for (const r of relsEmHtml(s)) citar(r, dono, numerada, PRIORIDADE.htmlDeEntidade, true) })
    } else if (dono.tipo === 'item') {
      const retrato = texto(obj.retrato)
      if (retrato !== undefined) citar(retrato, dono, { papel: 'retrato' }, PRIORIDADE.retrato, true)
      paraCadaString(obj, (s) => { for (const r of relsEmHtml(s)) citar(r, dono, numerada, PRIORIDADE.htmlDeEntidade, true) })
    } else if (dono.tipo === 'mapa' || dono.tipo === 'canvas') {
      const prioridade = dono.tipo === 'mapa' ? PRIORIDADE.mapa : PRIORIDADE.canvas
      visitarAssets(obj.documento, (asset) => {
        const meta = ehObjeto(asset.meta) ? asset.meta : {}
        const rel = texto(meta.rel)
        if (rel === undefined) return
        const props = ehObjeto(asset.props) ? asset.props : {}
        const nomeOriginal = [texto(meta.nomeOriginal), texto(props.name)].find((n) => n !== undefined && !ehNomeGenerico(n))
        const papel: PapelImagem = nomeOriginal === undefined ? numerada : { papel: 'nomeada', nome: nomeSemExtensao(nomeOriginal) }
        citar(rel, dono, papel, prioridade, true)
      })
    } else if (dono.tipo === 'nota') {
      for (const r of relsEmHtml(typeof obj.corpo === 'string' ? obj.corpo : '')) citar(r, dono, numerada, PRIORIDADE.nota, true)
    }
  }

  // Qualquer outra string que seja caminho de imagem existente (card de personagem no mapa, campo
  // novo que este planejador ainda não conhece): não decide pasta com força, mas é reescrita junto.
  paraCadaString(obj, (s) => {
    if (imagens.has(chaveCaminho(s))) citar(s, dono, numerada, PRIORIDADE.semPapel, false)
    for (const r of relsEmHtml(s)) citar(r, dono, numerada, PRIORIDADE.semPapel, false)
  })
}

/** Todo registro de asset do tldraw (`typeName: 'asset'`) em qualquer profundidade do snapshot. */
function visitarAssets(valor: unknown, visitar: (asset: Record<string, unknown>) => void): void {
  if (Array.isArray(valor)) {
    for (const v of valor) visitarAssets(v, visitar)
    return
  }
  if (!ehObjeto(valor)) return
  if (valor.typeName === 'asset') {
    visitar(valor)
    return
  }
  for (const v of Object.values(valor)) visitarAssets(v, visitar)
}
