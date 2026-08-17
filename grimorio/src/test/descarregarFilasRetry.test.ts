import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../state/store'
import { VaultRepo } from '../lib/vaultRepo'
import type { Cenario, Personagem, Item } from '../lib/types'

/**
 * Terceira auditoria — mesmo defeito crítico do CenarioModal/PerfilModal/ItemModal, mas na
 * versão de nível de MÓDULO: `descarregarFilasPendentes` (state/store.ts) limpava
 * `timersSalvarParcial`/`timersSalvarCenario`/`timersSalvarItem`/os timers de vínculos e
 * layout ANTES de saber se a gravação ia dar certo. Numa falha, o id não sobrava pendente em
 * lugar nenhum: a PRÓXIMA chamada a `descarregarFilas()` (ex.: outro clique em "Mover" na
 * Barra de Localização, para uma entidade QUALQUER) não encontrava timer nenhum para aquele
 * id, reportava `[]` (sem falhas) sem ter tentado gravar de novo — e o ciclo de sync
 * (`recarregarDoDisco`) podia sobrescrever o cache com o disco desatualizado, perdendo a
 * edição de vez.
 *
 * O conserto introduz `personagensSujos`/`cenariosSujos`/`itensSujos` (Sets) e
 * `vinculosSujo`/`layoutTeiaSujo` (booleanos) — dirty tracking SEPARADO dos timers, que só
 * volta a "limpo" quando `repo.salvar*` confirma sucesso. Estes testes provam que uma
 * SEGUNDA chamada a `descarregarFilas()`, sem reagendar nada, tenta gravar de novo de
 * verdade — para os cinco tipos de fila que a função cobre.
 */

function cenario(id: string, nome: string): Cenario {
  return {
    id, nome, personagens: [],
    versoes: [{ id: `${id}-v1`, nome: 'Base', retrato: null, resumo: '', descricao: '', informacao: '', historia: '', eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
  }
}
function personagem(id: string, nome: string): Personagem {
  return {
    id, nome,
    versoes: [{ id: `${id}-v1`, nome, retrato: null, resumo: '', descricao: '', informacao: '', historia: '', extras: '', anotacoes: '', imagens: [] }],
    versaoAtivaId: `${id}-v1`, criadoEm: 'x', modificadoEm: 'y',
  }
}
function item(id: string, nome: string): Item {
  return {
    id, nome, resumo: '', descricao: '', informacao: '', efeito: '', retrato: null,
    criadoEm: 'x', modificadoEm: 'y',
  }
}
function calarConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

beforeEach(() => {
  useApp.setState({
    repo: null, vaultPath: null,
    cenarios: {}, caminhoCenarioPorId: {},
    personagens: {}, caminhoPorId: {},
    itens: {}, caminhoItemPorId: {},
    vinculos: [], layoutsTeia: {},
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('descarregarFilasPendentes — retry real após falha (reauditoria 3)', () => {
  it('personagem: falha na 1ª descarga mantém pendente; 2ª descarga tenta de novo e grava', async () => {
    calarConsole()
    let chamadas = 0
    const nomesGravados: string[] = []
    const repo = {
      async salvarPersonagem(_caminho: string, p: Personagem) {
        chamadas++
        if (chamadas === 1) throw new Error('disco cheio')
        nomesGravados.push(p.nome)
      },
    }
    useApp.setState({
      repo: repo as unknown as VaultRepo,
      personagens: { p1: personagem('p1', 'Bruce') }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' },
    })
    // agenda via API pública (não espera os 800ms — `descarregarFilas` cobre o pendente
    // independente do timer ainda estar rodando)
    useApp.getState().salvarPersonagemParcial('p1', { nome: 'Bruce Wayne' })

    const falhas1 = await useApp.getState().descarregarFilas()
    expect(falhas1).toHaveLength(1)
    expect(falhas1[0].rotulo).toBe('Bruce Wayne')
    expect(chamadas).toBe(1)

    // 2ª chamada, sem reagendar nada: o defeito fazia isto devolver `[]` sem tentar de novo
    const falhas2 = await useApp.getState().descarregarFilas()
    expect(chamadas).toBe(2) // tentou gravar de novo de verdade
    expect(falhas2).toHaveLength(0) // e desta vez conseguiu
    expect(nomesGravados).toEqual(['Bruce Wayne'])
  })

  it('cenário: falha na 1ª descarga mantém pendente; 2ª descarga tenta de novo e grava', async () => {
    calarConsole()
    let chamadas = 0
    const nomesGravados: string[] = []
    const repo = {
      async salvarCenario(_caminho: string, c: Cenario) {
        chamadas++
        if (chamadas === 1) throw new Error('disco cheio')
        nomesGravados.push(c.nome)
      },
    }
    useApp.setState({
      repo: repo as unknown as VaultRepo,
      cenarios: { c1: cenario('c1', 'Cidade') }, caminhoCenarioPorId: { c1: 'cenarios/a' },
    })
    useApp.getState().salvarCenarioParcial('c1', { nome: 'Cidade Renomeada' })

    const falhas1 = await useApp.getState().descarregarFilas()
    expect(falhas1).toHaveLength(1)
    expect(chamadas).toBe(1)

    const falhas2 = await useApp.getState().descarregarFilas()
    expect(chamadas).toBe(2)
    expect(falhas2).toHaveLength(0)
    expect(nomesGravados).toEqual(['Cidade Renomeada'])
  })

  it('item: falha na 1ª descarga mantém pendente; 2ª descarga tenta de novo e grava', async () => {
    calarConsole()
    let chamadas = 0
    const nomesGravados: string[] = []
    const repo = {
      async salvarItem(_caminho: string, i: Item) {
        chamadas++
        if (chamadas === 1) throw new Error('disco cheio')
        nomesGravados.push(i.nome)
      },
    }
    useApp.setState({
      repo: repo as unknown as VaultRepo,
      itens: { i1: item('i1', 'Espada') }, caminhoItemPorId: { i1: 'itens/espada.json' },
    })
    useApp.getState().salvarItemParcial('i1', { nome: 'Espada Flamejante' })

    const falhas1 = await useApp.getState().descarregarFilas()
    expect(falhas1).toHaveLength(1)
    expect(chamadas).toBe(1)

    const falhas2 = await useApp.getState().descarregarFilas()
    expect(chamadas).toBe(2)
    expect(falhas2).toHaveLength(0)
    expect(nomesGravados).toEqual(['Espada Flamejante'])
  })

  it('vínculos: falha na 1ª descarga mantém pendente; 2ª descarga tenta de novo e grava', async () => {
    calarConsole()
    let chamadas = 0
    const repo = {
      async salvarVinculos() {
        chamadas++
        if (chamadas === 1) throw new Error('disco cheio')
      },
    }
    useApp.setState({ repo: repo as unknown as VaultRepo, vinculos: [] })
    useApp.getState().adicionarVinculo({ deTipo: 'personagem', deId: 'p1', paraTipo: 'cenario', paraId: 'c1', tipo: 'mora em', notas: '' })

    const falhas1 = await useApp.getState().descarregarFilas()
    expect(falhas1).toHaveLength(1)
    expect(falhas1[0].rotulo).toBe('Vínculos')
    expect(chamadas).toBe(1)

    const falhas2 = await useApp.getState().descarregarFilas()
    expect(chamadas).toBe(2)
    expect(falhas2).toHaveLength(0)
  })

  it('layout da teia: falha na 1ª descarga mantém pendente; 2ª descarga tenta de novo e grava', async () => {
    calarConsole()
    let chamadas = 0
    const repo = {
      async salvarLayoutTeia() {
        chamadas++
        if (chamadas === 1) throw new Error('disco cheio')
      },
    }
    useApp.setState({ repo: repo as unknown as VaultRepo, layoutsTeia: {} })
    useApp.getState().salvarPosicaoTeia('cofre', new Set(['x']), 'x', { x: 0.5, y: 0.5 })

    const falhas1 = await useApp.getState().descarregarFilas()
    expect(falhas1).toHaveLength(1)
    expect(falhas1[0].rotulo).toBe('Layout da teia')
    expect(chamadas).toBe(1)

    const falhas2 = await useApp.getState().descarregarFilas()
    expect(chamadas).toBe(2)
    expect(falhas2).toHaveLength(0)
  })

  it('entidade excluída antes do disparo (sem caminho/entidade no cache) some da fila sem contar como falha', async () => {
    calarConsole()
    const repo = { async salvarPersonagem() { throw new Error('nunca deveria ser chamado') } }
    useApp.setState({
      repo: repo as unknown as VaultRepo,
      personagens: { p1: personagem('p1', 'Bruce') }, caminhoPorId: { p1: 'personagens-soltos/bruce.json' },
    })
    useApp.getState().salvarPersonagemParcial('p1', { nome: 'Bruce Wayne' })
    // simula exclusão: cache e caminho somem, mas o timer/dirty continuam agendados
    useApp.setState({ personagens: {}, caminhoPorId: {} })

    const falhas = await useApp.getState().descarregarFilas()
    expect(falhas).toHaveLength(0)
    // e não fica "pendente pra sempre": uma segunda chamada não tenta gravar de novo
    const falhas2 = await useApp.getState().descarregarFilas()
    expect(falhas2).toHaveLength(0)
  })
})
