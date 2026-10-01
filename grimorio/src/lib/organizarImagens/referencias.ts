import type { ParTroca } from './tipos'

/**
 * Como uma imagem é CITADA dentro de um arquivo de texto do cofre, e como trocar a citação.
 *
 * Vive à parte porque as duas metades do motor precisam da MESMA leitura: o planejador acha as
 * citações, o executor troca exatamente essas. Se cada lado tivesse o seu regex, um `&amp;` no
 * nome da pasta bastaria para o planejador ver uma citação que o executor não encontra — e a
 * imagem se mudaria deixando a nota apontando para o endereço velho.
 */

/** `data-rel="..."` — o atributo que o TipTap grava na imagem de página (`ImagemCofre.tsx`). */
const ATRIBUTO_DATA_REL = /data-rel="([^"]*)"/g

const ENTIDADES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

/** Desfaz o escape de HTML do valor de um atributo (o DOM grava `&` como `&amp;`). */
export function decodificarAtributo(valor: string): string {
  return valor.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, corpo: string) => {
    if (corpo[0] === '#') {
      const codigo = corpo[1] === 'x' || corpo[1] === 'X' ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10)
      return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : inteiro
    }
    return ENTIDADES[corpo.toLowerCase()] ?? inteiro
  })
}

/** Escape de atributo como o DOM faz ao serializar: `&` e `"` (o resto é seguro entre aspas duplas). */
export function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** Caminhos citados por `data-rel` num trecho de HTML, já sem escape, na ordem em que aparecem. */
export function relsEmHtml(html: string): string[] {
  if (!html.includes('data-rel=')) return []
  return [...html.matchAll(ATRIBUTO_DATA_REL)].map((m) => decodificarAtributo(m[1]))
}

/** Troca `data-rel` cujo valor (sem escape) é um `de` dos pares. Comparação do valor inteiro. */
export function trocarEmHtml(html: string, trocas: Map<string, string>): string {
  if (!html.includes('data-rel=')) return html
  return html.replace(ATRIBUTO_DATA_REL, (inteiro, bruto: string) => {
    const para = trocas.get(decodificarAtributo(bruto))
    return para === undefined ? inteiro : `data-rel="${escaparAtributo(para)}"`
  })
}

/** Visita toda string de um valor JSON, em qualquer profundidade. */
export function paraCadaString(valor: unknown, visitar: (s: string) => void): void {
  if (typeof valor === 'string') visitar(valor)
  else if (Array.isArray(valor)) for (const v of valor) paraCadaString(v, visitar)
  else if (typeof valor === 'object' && valor !== null) for (const v of Object.values(valor)) paraCadaString(v, visitar)
}

/**
 * Aplica as trocas num valor JSON: string IGUAL a um `de` vira o `para`; dentro de string com
 * HTML, o `data-rel` troca. Nunca substring solta — `a.png` não casa com `aa.png`.
 */
export function trocarEmJson(valor: unknown, trocas: Map<string, string>): unknown {
  if (typeof valor === 'string') return trocas.get(valor) ?? trocarEmHtml(valor, trocas)
  if (Array.isArray(valor)) return valor.map((v) => trocarEmJson(v, trocas))
  if (typeof valor === 'object' && valor !== null) {
    const saida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) saida[k] = trocarEmJson(v, trocas)
    return saida
  }
  return valor
}

/**
 * Reescreve o texto de um arquivo do cofre com as trocas. `.json` é reescrito pelo valor e volta
 * com a MESMA indentação e a mesma quebra final que tinha — o arquivo só muda onde a citação
 * mudou, e o sync não vê uma reformatação inteira. Qualquer outro texto é tratado como HTML.
 */
export function reescreverTexto(arquivo: string, texto: string, pares: ParTroca[]): string {
  const trocas = new Map(pares.map((p) => [p.de, p.para]))
  if (!arquivo.toLowerCase().endsWith('.json')) return trocarEmHtml(texto, trocas)
  const semBom = texto.replace(/^﻿/, '')
  const novo = trocarEmJson(JSON.parse(semBom), trocas)
  const indentacao = semBom.match(/^[{[]\r?\n([ \t]+)/)?.[1]
  const quebra = semBom.includes('\r\n') ? '\r\n' : '\n'
  let saida = indentacao === undefined ? JSON.stringify(novo) : JSON.stringify(novo, null, indentacao)
  if (quebra === '\r\n') saida = saida.replace(/\n/g, '\r\n')
  if (/\r?\n$/.test(semBom)) saida += quebra
  return (texto.startsWith('﻿') ? '﻿' : '') + saida
}
