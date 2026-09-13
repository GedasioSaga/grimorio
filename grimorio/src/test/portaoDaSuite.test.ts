import { describe, expect, it } from 'vitest'
// Sem @types/node neste projeto (frontend puro) — mesma supressão que `amostraMapa.test.ts`
// e `vite.config.ts` já usam. Os módulos existem em tempo de execução: o vitest roda em Node.
// @ts-expect-error node builtin sem @types/node
import { readFile, readdir } from 'node:fs/promises'
// @ts-expect-error node builtin sem @types/node
import { join } from 'node:path'
// @ts-expect-error node builtin sem @types/node
import { fileURLToPath } from 'node:url'

/**
 * Portão do próprio portão.
 *
 * "Suíte verde" só vale se ela de fato rodou. `vite.config.ts` já fecha duas portas
 * (`allowOnly: false`, `passWithNoTests: false`), mas teste PULADO não derruba run nenhum:
 * `it.skip` e `it.todo` aparecem como uma contagem discreta no rodapé, e um caso posto de
 * lado "por um dia" atravessa meses de commit sem nunca falhar.
 *
 * Este arquivo lê os arquivos de teste do disco — não do grafo de importação — e recusa
 * qualquer caso desligado no código. Para tirar um teste do caminho, apague-o (com o motivo
 * no commit) em vez de deixá-lo verde e inerte.
 */
const RAIZ_SRC = fileURLToPath(new URL('..', import.meta.url))

/**
 * A varredura pula este arquivo: é aqui que os nomes proibidos precisam aparecer escritos,
 * no comentário e na expressão. Qualquer outro arquivo que os contenha é achado de verdade.
 */
const ESTE_ARQUIVO = fileURLToPath(import.meta.url)

/**
 * Todas as formas de desligar um caso no código. O ponto é o desligamento, não a grafia:
 * - direto ou com modificador no meio: `it.skip(`, `test.skip.each(`, `test.concurrent.skip(`
 * - condicional: `it.skipIf(cond)(`, `describe.runIf(cond)(` — o jeito comum de pular por
 *   variável de ambiente ausente, e o que mais passa despercebido
 * - dentro do caso: `ctx.skip()`
 * - por opção: `{ skip: true }`, `{ todo: true }`
 * Varridas no texto INTEIRO, não linha a linha: `it` e `.skip(` em linhas separadas desligam igual.
 */
const DESLIGADO = [
  /\b(?:it|test|describe|suite)(?:\s*\.\s*\w+)*?\s*\.\s*(?:skipIf|runIf|skip|todo)\b/g,
  /\.\s*skip\s*\(/g,
  /\b(?:skip|todo)\s*:\s*true\b/g,
]

/** Linhas (1-based) de todo trecho do texto que desliga um caso. */
function linhasDesligadas(texto: string): number[] {
  const linhas = new Set<number>()
  for (const padrao of DESLIGADO) {
    for (const achado of texto.matchAll(padrao)) {
      linhas.add(texto.slice(0, achado.index).split('\n').length)
    }
  }
  return [...linhas].sort((a, b) => a - b)
}

/** Um arquivo de teste sem nenhum caso declarado é um arquivo que não prova nada. */
const TEM_CASO = /\b(?:it|test)\s*(?:\.\s*\w+\s*)*\(/

async function arquivosDeTeste(dir: string): Promise<string[]> {
  const achados: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) {
      achados.push(...(await arquivosDeTeste(caminho)))
    } else if (/\.test\.tsx?$/.test(e.name) && caminho !== ESTE_ARQUIVO) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('a suíte não esconde teste desligado', () => {
  // sem isto o portão pode estar cego e verde ao mesmo tempo: uma regex que não pega nada
  it('o detector reconhece cada forma de desligar um caso', () => {
    const desligados = [
      "it.skip('x', () => {})",
      "describe.todo('x')",
      "test.skip.each([1])('x', () => {})",
      "test.concurrent.skip('x', () => {})",
      "it.skipIf(!process.env.TOKEN)('x', () => {})",
      "describe.runIf(false)('x', () => {})",
      "it('x', (ctx) => { ctx.skip() })",
      "it('x', { skip: true }, () => {})",
      "it('x', { todo: true })",
      "it\n  .skip('x', () => {})",
    ]
    for (const trecho of desligados) expect(linhasDesligadas(trecho), trecho).not.toEqual([])

    const ligados = ["it('x', () => {})", "test.each([1])('x', () => {})", 'const todos = lista.slice(0, 4)']
    for (const trecho of ligados) expect(linhasDesligadas(trecho), trecho).toEqual([])
  })

  it('nenhum arquivo de teste em src/ desliga um caso', async () => {
    const arquivos = await arquivosDeTeste(RAIZ_SRC)
    // se a varredura não achar nada, o portão está cego — não verde
    expect(arquivos.length).toBeGreaterThan(0)

    const culpados: string[] = []
    for (const caminho of arquivos) {
      const texto = await readFile(caminho, 'utf8')
      for (const linha of linhasDesligadas(texto)) culpados.push(`${caminho.slice(RAIZ_SRC.length)}:${linha}`)
    }
    expect(culpados).toEqual([])
  })

  it('todo arquivo de teste declara pelo menos um caso', async () => {
    const vazios: string[] = []
    for (const caminho of await arquivosDeTeste(RAIZ_SRC)) {
      if (!TEM_CASO.test(await readFile(caminho, 'utf8'))) vazios.push(caminho.slice(RAIZ_SRC.length))
    }
    expect(vazios).toEqual([])
  })
})
