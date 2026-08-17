/** Lógica pura de exibição do slot de inventário: qual arte mostrar, como formatar o contador. */

/**
 * Chaves de `ICONES` em `arteInventario.tsx` que `desenharArteInventario` sabe desenhar.
 * Duplicada aqui de propósito: `arteInventario.tsx` é o módulo de ARTE (SVG), este é o de
 * LÓGICA pura — não exporta a lista, só as funções de desenho.
 *
 * Armas brancas viram QUATRO símbolos, não um: "Espada Longa" e "Adaga Envenenada" são
 * objetos fisicamente diferentes na mesa, e colapsar as duas num glifo só ("espada
 * genérico") era exatamente o defeito que fez o mestre precisar ler o nome pra distinguir.
 */
export const SIMBOLOS_ITEM_CONHECIDOS = [
  'pocao', 'erva', 'chave', 'documento', 'moeda', 'vestuario',
  'espada', 'adaga', 'machado', 'lanca',
  'municao', 'livro', 'tocha', 'comida',
] as const

export type SimboloItemConhecido = (typeof SIMBOLOS_ITEM_CONHECIDOS)[number]

/** Palavra-chave (pt-BR, sem acento) → símbolo. Primeira que bater no nome vence. */
const PALAVRAS_POR_SIMBOLO: Record<SimboloItemConhecido, string[]> = {
  pocao: ['pocao', 'elixir', 'antidoto', 'veneno', 'frasco', 'remedio'],
  erva: ['erva', 'planta', 'folha', 'fibra', 'raiz', 'flor'],
  chave: ['chave'],
  documento: ['documento', 'carta', 'pergaminho', 'nota', 'diario', 'bilhete', 'mapa'],
  moeda: ['moeda', 'ouro', 'prata', 'tesouro', 'gema', 'joia', 'diamante'],
  // peça de vestir/tecido — antes caía todo no ícone genérico, que lia como cadeado/mochila
  // palavra-chave sempre sem acento: quem chama normaliza o NOME do item antes de comparar
  vestuario: ['manto', 'capa', 'tunica', 'veste', 'roupa', 'casaco', 'robe'],
  // lâmina longa: espada e similares de alcance/corte grande
  espada: ['espada', 'sabre', 'lamina', 'katana', 'florete'],
  // lâmina curta: adaga, faca e punhal — mesma família visual, oposta à espada
  adaga: ['adaga', 'punhal', 'faca'],
  machado: ['machado'],
  lanca: ['lanca', 'tridente', 'alabarda'],
  municao: ['municao', 'flecha', 'bala', 'seta', 'projetil', 'dardo'],
  livro: ['livro', 'tomo', 'grimorio', 'manual', 'compendio'],
  tocha: ['tocha', 'lanterna', 'vela', 'lampiao', 'archote'],
  comida: ['comida', 'racao', 'carne', 'pao', 'fruta', 'queijo'],
}

// intervalo Unicode das marcas de acentuação combinantes que sobram após normalize('NFD')
const MARCA_DIACRITICA_NFD = /[̀-ͯ]/g

/** minúsculo e sem acento, pra "Poção" e "pocao" caírem na mesma palavra-chave. */
function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(MARCA_DIACRITICA_NFD, '').toLowerCase()
}

/**
 * Palpite de símbolo vetorial (`desenhoSimbolo.tsx`) a partir do NOME do item — usado
 * quando o item não tem retrato. Sem categoria própria no modelo de dados (`Item` não tem
 * campo "tipo"), então o nome é a única pista disponível. `null` = nenhuma palavra bateu;
 * quem chama cai no pino genérico (losango).
 */
export function escolherSimboloItem(nome: string): SimboloItemConhecido | null {
  const norm = normalizarTexto(nome)
  for (const simbolo of SIMBOLOS_ITEM_CONHECIDOS) {
    if (PALAVRAS_POR_SIMBOLO[simbolo].some((p) => norm.includes(p))) return simbolo
  }
  return null
}

/**
 * Hash determinístico (djb2/xor) de string → inteiro sem sinal de 32 bits. Puro, sem
 * `Math.random`, mesmo resultado em qualquer motor JS/máquina — é o que garante que a cor
 * derivada em `corFundoItem` seja ESTÁVEL (mesmo item, mesma cor, hoje e amanhã).
 */
function hashEstavel(texto: string): number {
  let h = 5381
  for (let i = 0; i < texto.length; i++) {
    h = (h * 33) ^ texto.charCodeAt(i)
  }
  return h >>> 0
}

/** HSL (h em graus, s/l em 0–1) → hex `#rrggbb`. Sem dependência: é só a fórmula padrão. */
function hslParaHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const paraHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${paraHex(r)}${paraHex(g)}${paraHex(b)}`
}

/** Saturação e luminância fixas (doutrina de cor de `salaMapa.ts`: tom médio, não berrante —
 * mesma faixa das cores de sala ali, ~25-30% de saturação e ~30-35% de luminância). Luminância
 * fixa e baixa o bastante pra garantir contraste contra a arte clara (`CREME`/`ACO` em
 * `arteInventario.tsx`) sem precisar calcular por cor. */
const SATURACAO_FUNDO_ITEM = 0.28
const LUMINANCIA_FUNDO_ITEM = 0.33

/**
 * Paleta FIXA e discreta de matizes — 6 cores a 60° de distância no círculo (vermelho,
 * amarelo, verde, ciano, azul, magenta), a distância angular máxima que 6 pontos permitem.
 * Isso é o que dá a propriedade que faltava: com matiz CONTÍNUO (`hash % 360`), dois itens
 * podiam cair a poucos graus um do outro — visualmente idênticos de longe, mas tecnicamente
 * "diferentes", o que foi exatamente o defeito relatado (Poção de Cura × Manto: RGB a 10
 * pontos num canal só). Com paleta discreta, duas células só podem sair EXATAMENTE iguais
 * (mesmo índice) ou CLARAMENTE diferentes (índice diferente, ≥60° de matiz) — nunca "quase
 * iguais". Não depende de sorte de distribuição: a garantia é estrutural, vale pra qualquer
 * par, em qualquer cofre, com qualquer quantidade de itens (ver `distanciaCorPerceptual` e o
 * teste de propriedade em `arteItem.test.ts`).
 */
const PALETA_FUNDO_ITEM: readonly string[] = [0, 60, 120, 180, 240, 300].map((matiz) =>
  hslParaHex(matiz, SATURACAO_FUNDO_ITEM, LUMINANCIA_FUNDO_ITEM),
)

/**
 * Cor de fundo do slot do inventário, por item (`id`) — mas sorteada de uma PALETA FIXA, não
 * de um matiz contínuo. Estável (mesmo id, mesma cor, sempre) e sem cadastro manual (`Item`
 * não tem campo de categoria), mas agora com garantia de separação: ver `PALETA_FUNDO_ITEM`.
 */
export function corFundoItem(id: string): string {
  return PALETA_FUNDO_ITEM[hashEstavel(id) % PALETA_FUNDO_ITEM.length]
}

/**
 * Distância perceptual aproximada entre duas cores hex — fórmula "redmean", que pondera os
 * canais pela luminosidade média do vermelho (aproxima a sensibilidade do olho humano melhor
 * que Euclidiana pura em RGB, sem o custo de converter pra Lab). Usada só em teste, pra medir
 * — não achar — se um par de cores da paleta (ou de dois ids quaisquer) vira "a mesma mancha".
 */
export function distanciaCorPerceptual(hexA: string, hexB: string): number {
  const paraRgb = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
  }
  const [r1, g1, b1] = paraRgb(hexA)
  const [r2, g2, b2] = paraRgb(hexB)
  const rMedio = (r1 + r2) / 2
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt((2 + rMedio / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMedio) / 256) * db * db)
}

const CONTADOR_MAXIMO = 999

/**
 * Texto do contador no canto do slot. `undefined` (item único, ver `definirQtd` em
 * `acervoCenario.ts`) não ganha contador — nada de "1×" ocupando espaço pra não dizer nada.
 * Acima de `CONTADOR_MAXIMO` satura em "999+": um número de 5 dígitos estouraria o canto do slot.
 */
export function formatarContador(qtd: number | undefined): string | null {
  if (qtd === undefined || !Number.isFinite(qtd) || qtd < 2) return null
  return qtd > CONTADOR_MAXIMO ? `${CONTADOR_MAXIMO}+` : String(qtd)
}
