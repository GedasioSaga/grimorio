/**
 * Nome legível das imagens do cofre — a metade PURA, sem disco.
 *
 * Diferente de `slugify` (`lib/slug.ts`), que existe para caminho de JSON e tira acento e
 * maiúscula, aqui o nome é para o USUÁRIO ler no Explorer: `imagens/personagens/Gandalf, o
 * Cinzento/retrato.png`. Então só sai o que o Windows recusa de verdade — os nove caracteres
 * proibidos, caractere de controle, nome de dispositivo (`CON`, `LPT1`…) e ponto/espaço no fim,
 * que o Windows descarta sozinho e faz o caminho gravado deixar de bater com o do disco.
 *
 * Colisão é comparada SEM caixa, porque o cofre mora em NTFS: `Gandalf` e `gandalf` são a mesma
 * pasta, e tratar como diferentes faria duas imagens caírem no mesmo arquivo.
 */

/** Raiz de todas as imagens organizadas. */
export const PASTA_IMAGENS = 'imagens'

/** Teto por segmento. Folga para o caminho inteiro caber nos 260 do Windows sem prefixo longo. */
const LIMITE_NOME = 80

const NOME_VAZIO = 'sem nome'

/** Mesma lista de `lib/slug.ts`, comparada sem caixa e antes do primeiro ponto (`CON.png` também é o dispositivo). */
const RESERVADOS_WINDOWS = new Set([
  'con', 'prn', 'aux', 'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
])

/** Os nove proibidos do Windows e todo caractere de controle. */
const PROIBIDOS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g

/** Ponto e espaço do fim — o Windows os apaga ao criar, e o nome gravado deixaria de bater. */
function semPontoOuEspacoFinal(s: string): string {
  return s.replace(/[. ]+$/, '')
}

/**
 * Nome de pasta/arquivo legível e aceito pelo Windows. Preserva acento, maiúscula e pontuação
 * comum; troca o proibido por espaço (`Dia/Noite` vira `Dia Noite`, não `DiaNoite`).
 *
 * Ponto no COMEÇO também sai: pasta com ponto (".Sombra") é tratada como `.git` — a varredura do
 * organizador e a do sync nem descem nela, e as imagens de dentro sumiriam do app e do Drive.
 */
export function nomePasta(nome: string): string {
  let s = nome.normalize('NFC').replace(PROIBIDOS, ' ').replace(/\s+/g, ' ').trim()
  s = semPontoOuEspacoFinal(s.replace(/^[. ]+/, ''))
  // Corte por code point: `slice` em unidade UTF-16 partiria um emoji ao meio.
  const pontos = [...s]
  if (pontos.length > LIMITE_NOME) s = semPontoOuEspacoFinal(pontos.slice(0, LIMITE_NOME).join('').trimEnd())
  if (s === '') return NOME_VAZIO
  const corte = s.indexOf('.')
  const raiz = corte < 0 ? s : s.slice(0, corte)
  if (RESERVADOS_WINDOWS.has(raiz.toLowerCase())) return `${raiz}_${corte < 0 ? '' : s.slice(corte)}`
  return s
}

/**
 * De quem a imagem é. Decide a PASTA. Cenário leva a cadeia de nomes desde o cenário raiz, para
 * o subcenário morar dentro da pasta do pai — a mesma hierarquia que a árvore mostra.
 */
export type DonoImagem =
  | { tipo: 'personagem'; nome: string }
  | { tipo: 'cenario'; nomes: string[] }
  | { tipo: 'item'; nome: string }
  | { tipo: 'mapa'; nome: string }
  | { tipo: 'canvas'; nome: string }
  | { tipo: 'nota'; nome: string }
  | { tipo: 'solta' }

/** Que papel a imagem tem para o dono. Decide o NOME do arquivo. */
export type PapelImagem =
  /** Retrato da versão ativa (ou o único, de item). */
  | { papel: 'retrato' }
  /** Retrato de uma versão que não é a ativa. */
  | { papel: 'retrato-versao'; versao: string }
  /** Galeria, imagem de nota, imagem de mapa sem nome original: `01`, `02`… */
  | { papel: 'numerada' }
  /** Nome escolhido (nome original do arquivo no mapa, nome da imagem solta). */
  | { papel: 'nomeada'; nome: string }

/** Pasta do dono para um papel. Item é o único que muda: o retrato é um arquivo solto em `itens/`. */
export function pastaDe(dono: DonoImagem, papel: PapelImagem): string {
  switch (dono.tipo) {
    case 'personagem': return `${PASTA_IMAGENS}/personagens/${nomePasta(dono.nome)}`
    case 'cenario': return [`${PASTA_IMAGENS}/cenarios`, ...dono.nomes.map(nomePasta)].join('/')
    case 'item':
      return papel.papel === 'retrato' ? `${PASTA_IMAGENS}/itens` : `${PASTA_IMAGENS}/itens/${nomePasta(dono.nome)}`
    case 'mapa': return `${PASTA_IMAGENS}/mapas/${nomePasta(dono.nome)}`
    case 'canvas': return `${PASTA_IMAGENS}/canvas/${nomePasta(dono.nome)}`
    case 'nota': return `${PASTA_IMAGENS}/notas/${nomePasta(dono.nome)}`
    case 'solta': return `${PASTA_IMAGENS}/soltas`
  }
}

/** Base do nome do arquivo (sem extensão), ou `null` para numerada. */
export function baseDoArquivo(dono: DonoImagem, papel: PapelImagem): string | null {
  switch (papel.papel) {
    case 'retrato': return dono.tipo === 'item' ? nomePasta(dono.nome) : 'retrato'
    case 'retrato-versao': return nomePasta(`retrato-${papel.versao}`)
    case 'nomeada': return nomePasta(papel.nome)
    case 'numerada': return null
  }
}

/** Forma de comparação de caminho no NTFS: sem caixa, NFC. */
export function chaveCaminho(rel: string): string {
  return rel.normalize('NFC').toLowerCase()
}

/**
 * O que pode vir depois do nome do papel e ainda ser "o mesmo nome": o sufixo de conteúdo de
 * imagem nova (`-a3f9`, 4 hex minúsculos, como `sufixoDoConteudo` gera) e/ou a variante de colisão
 * (`-2`). O hex é conferido na grafia original: a versão "Cafe" não é o sufixo `cafe`.
 */
const RESTO_DO_MESMO_NOME = /^(-[0-9a-f]{4})?(-\d+)?$/

/**
 * `atual` é o nome `base` ou uma variante dele (sufixo de conteúdo, `-N`), sem caixa na base?
 * (`null` = numerada: qualquer número.) É o que deixa quem já está no lugar certo ficar onde está.
 */
export function nomeCasa(atual: string, base: string | null): boolean {
  const a = atual.normalize('NFC')
  if (base === null) {
    const numero = /^\d{2,}/.exec(a)
    return numero !== null && RESTO_DO_MESMO_NOME.test(a.slice(numero[0].length))
  }
  const b = base.normalize('NFC')
  return a.slice(0, b.length).toLowerCase() === b.toLowerCase() && RESTO_DO_MESMO_NOME.test(a.slice(b.length))
}

/** Número de galeria com dois dígitos no mínimo, para a ordem alfabética seguir a numérica até 99. */
export function numeroArquivo(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Sufixo curto e único de imagem NOVA: os 4 primeiros hex do SHA-256 do conteúdo. Dois PCs offline
 * que põem imagens diferentes na mesma pasta vazia escolheriam os dois `01.png` (ou `retrato.png`)
 * e o sync juntaria arquivos diferentes no mesmo caminho; com o sufixo, os nomes diferem. A mesma
 * imagem nos dois PCs dá o mesmo nome — o que é certo, porque é o mesmo arquivo.
 */
export function sufixoDoConteudo(sha256Hex: string): string {
  return sha256Hex.slice(0, 4).toLowerCase()
}

/**
 * Primeiro caminho livre para este dono e papel. `existentes` são `rel` do cofre (qualquer caixa).
 * Nome ocupado ganha `-2`, `-3` (o padrão de `slugUnico`); numerada pega o próximo número livre.
 * `sufixo` (de `sufixoDoConteudo`) entra em todo nome que o dono decide sozinho — numerado e
 * retrato —, nunca no nome original que o usuário deu ao arquivo.
 */
export function destinoDe(
  dono: DonoImagem,
  papel: PapelImagem,
  extensao: string,
  existentes: Iterable<string>,
  sufixo?: string,
): string {
  const comSufixo = papel.papel === 'nomeada' ? undefined : sufixo
  return destinoNaPasta(pastaDe(dono, papel), baseDoArquivo(dono, papel), extensao, existentes, comSufixo)
}

/** Como `destinoDe`, com a pasta já decidida (o planejador dá pasta única a cada dono). */
export function destinoNaPasta(
  pasta: string,
  base: string | null,
  extensao: string,
  existentes: Iterable<string>,
  sufixo?: string,
): string {
  const ocupados = new Set<string>()
  /** Números de galeria já usados na pasta, qualquer que seja o formato ou o sufixo. */
  const numerosOcupados = new Set<number>()
  const prefixo = `${chaveCaminho(pasta)}/`
  for (const e of existentes) {
    const chave = chaveCaminho(e)
    ocupados.add(chave)
    if (!chave.startsWith(prefixo)) continue
    const numero = /^(\d{2,})(-[0-9a-f]{4})?(-\d+)?(\.[^./]*)?$/.exec(chave.slice(prefixo.length))
    if (numero !== null) numerosOcupados.add(Number(numero[1]))
  }
  const ext = extensao.toLowerCase()
  const cauda = sufixo ? `-${sufixo}` : ''
  const livre = (nome: string) => !ocupados.has(chaveCaminho(`${pasta}/${nome}.${ext}`))
  if (base === null) {
    let n = 1
    while (numerosOcupados.has(n)) n++
    return `${pasta}/${numeroArquivo(n)}${cauda}.${ext}`
  }
  const nome = `${base}${cauda}`
  if (livre(nome)) return `${pasta}/${nome}.${ext}`
  let n = 2
  while (!livre(`${nome}-${n}`)) n++
  return `${pasta}/${nome}-${n}.${ext}`
}

/** Extensões que o motor trata como imagem. */
const EXTENSOES_IMAGEM = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'])

/** Extensão minúscula do caminho, sem ponto, ou `''`. */
export function extensaoDoCaminho(rel: string): string {
  const nome = rel.split('/').pop() ?? ''
  const corte = nome.lastIndexOf('.')
  return corte > 0 ? nome.slice(corte + 1).toLowerCase() : ''
}

export function ehImagem(rel: string): boolean {
  return EXTENSOES_IMAGEM.has(extensaoDoCaminho(rel))
}

/** Nome do arquivo sem pasta e sem extensão. */
export function nomeSemExtensao(nomeOuRel: string): string {
  const nome = nomeOuRel.split(/[\\/]/).pop() ?? ''
  const corte = nome.lastIndexOf('.')
  return corte > 0 ? nome.slice(0, corte) : nome
}

/** `tldrawFile` é o nome que o tldraw dá ao blob colado do clipboard (`pasteFiles` do pacote). */
const PREFIXO_GENERICO = /^(image|imagem|img|clipboard|screenshot|captura de tela|pasted image|untitled|sem t[íi]tulo|tldrawfile)[\s\d_().:,-]*$/i
const HEX_LONGO = /^[0-9a-f]{16,}$/i
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
/** `uniqueId()` do tldraw: nanoid de 21 caracteres. Exige dígito para não pegar nome de verdade. */
const NANOID = /^(?=.*\d)[A-Za-z0-9_-]{21}$/

/**
 * O nome do arquivo foi inventado pelo sistema (clipboard, captura, colagem no tldraw, id
 * aleatório)? Nome assim não lembra nada ao usuário; a imagem ganha número em vez dele.
 */
export function ehNomeGenerico(nomeArquivo: string): boolean {
  const base = nomeSemExtensao(nomeArquivo).trim()
  return base === '' || PREFIXO_GENERICO.test(base) || HEX_LONGO.test(base) || UUID.test(base) || NANOID.test(base)
}
