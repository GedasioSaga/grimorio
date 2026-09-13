// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Portão da store `prefixoCenario` — a parte que o teste de árvore NÃO alcança.
 *
 * `prefixoCenarioRail.test.tsx` monta a árvore e, no `beforeEach`, força
 * `usePrefixoCenario.setState({ ocultar: true })`. Isso é correto para o que aquele arquivo
 * julga (o desenho da linha), mas deixa dois trechos sem cobertura nenhuma:
 *
 * - o PADRÃO (`src/state/prefixoCenario.ts:13`): trocar `true` por `false` não derruba
 *   nenhum teste, e a opção nasceria desligada no dispositivo de todo mundo;
 * - a LEITURA do que foi salvo (`salvo()`): o teste "persiste a escolha" prova só o
 *   `setItem`. Uma `salvo()` que devolvesse sempre o padrão — ou que lesse a chave errada —
 *   passaria verde, e a escolha do usuário se perderia a cada abertura do app.
 *
 * O estado inicial da store é calculado na importação do módulo (`ocultar: salvo()`), então
 * cada caso aqui recarrega o módulo com `vi.resetModules()` + `import()` dinâmico: é o
 * equivalente honesto a "abrir o app de novo".
 */
const CHAVE = 'grimorio.prefixoCenarioRail'

/** Recarrega o módulo do zero: simula uma sessão nova lendo o localStorage atual. */
async function abrirOApp() {
  vi.resetModules()
  const mod = await import('../state/prefixoCenario')
  return mod.usePrefixoCenario
}

beforeEach(() => {
  localStorage.clear()
})

describe('prefixoCenario: padrão do dispositivo', () => {
  it('sem nada salvo, a opção nasce LIGADA (nome curto na árvore)', async () => {
    const store = await abrirOApp()
    expect(store.getState().ocultar).toBe(true)
    // ninguém gravou nada só por ler o padrão
    expect(localStorage.getItem(CHAVE)).toBeNull()
  })
})

describe('prefixoCenario: leitura do que ficou salvo', () => {
  it('salvo como desligado, abre desligado', async () => {
    localStorage.setItem(CHAVE, '0')
    const store = await abrirOApp()
    expect(store.getState().ocultar).toBe(false)
  })

  it('salvo como ligado, abre ligado', async () => {
    localStorage.setItem(CHAVE, '1')
    const store = await abrirOApp()
    expect(store.getState().ocultar).toBe(true)
  })

  /**
   * A chave é escrita só pelo app; qualquer outro conteúdo é corrupção. O lado seguro é o
   * desligado: mostrar o nome completo nunca esconde informação do mestre.
   */
  it('valor corrompido cai no lado seguro: nome completo', async () => {
    localStorage.setItem(CHAVE, 'sim')
    const store = await abrirOApp()
    expect(store.getState().ocultar).toBe(false)
  })
})

describe('prefixoCenario: a escolha atravessa a sessão', () => {
  it('desligar hoje é o estado inicial de amanhã, e religar volta atrás', async () => {
    const sessao1 = await abrirOApp()
    sessao1.getState().alternar(false)
    expect(localStorage.getItem(CHAVE)).toBe('0')

    const sessao2 = await abrirOApp()
    expect(sessao2.getState().ocultar).toBe(false)

    sessao2.getState().alternar(true)
    const sessao3 = await abrirOApp()
    expect(sessao3.getState().ocultar).toBe(true)
  })
})
