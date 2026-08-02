// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mexeuNoDiscoLocal } from '../lib/sync/ciclo'
import { estadoLimpoDeCofre, useApp } from '../state/store'
import { criarFakeFs } from './fakeFs'
import { VaultRepo } from '../lib/vaultRepo'
import type { Acao } from '../lib/sync/tipos'

/**
 * O sync escreve e apaga arquivos do cofre sem passar pelo app. Enquanto ninguém avisava o
 * store, a árvore e os caches continuavam sendo o retrato de ANTES do ciclo — e daí saíam os
 * três sintomas que motivaram isto:
 *
 * 1. sessão listada na sidebar que, ao abrir, dá "os error 2" (o arquivo já não existe);
 * 2. arquivo baixado do outro computador que não aparece até você mexer em alguma coisa;
 * 3. o autosave seguinte grava o cache VELHO por cima do que acabou de ser baixado, o que
 *    recria a divergência — é o "do nada tem conflito".
 *
 * `mexeuNoDiscoLocal` é o gatilho da recarga. Ele precisa ser exato nos dois sentidos: um
 * falso-negativo devolve os três sintomas; um falso-positivo relê o cofre inteiro (centenas
 * de arquivos) a cada 60 segundos, sem nada ter mudado.
 */

const subir: Acao = { tipo: 'subir', caminho: 'a.json' }
const baixar: Acao = { tipo: 'baixar', caminho: 'a.json' }
const apagarLocal: Acao = { tipo: 'apagarLocal', caminho: 'a.json' }
const apagarRemoto: Acao = { tipo: 'apagarRemoto', caminho: 'a.json' }
const registrar: Acao = { tipo: 'registrar', caminho: 'a.json' }
const conflito: Acao = { tipo: 'conflito', caminho: 'a.json', vencedor: 'local' }

describe('mexeuNoDiscoLocal', () => {
  it('plano vazio não mexeu em nada', () => {
    expect(mexeuNoDiscoLocal([])).toBe(false)
  })

  it('baixar mexe: o arquivo local foi reescrito', () => {
    expect(mexeuNoDiscoLocal([baixar])).toBe(true)
  })

  it('apagarLocal mexe: é ele que produz o item fantasma na sidebar', () => {
    expect(mexeuNoDiscoLocal([apagarLocal])).toBe(true)
  })

  it('conflito mexe SEMPRE — a cópia do perdedor nasce no disco', () => {
    // vale para os dois vencedores: com vencedor local a cópia é do lado remoto baixado,
    // com vencedor remoto o próprio arquivo é sobrescrito depois da cópia
    expect(mexeuNoDiscoLocal([conflito])).toBe(true)
    expect(mexeuNoDiscoLocal([{ tipo: 'conflito', caminho: 'a.json', vencedor: 'remoto' }])).toBe(true)
  })

  it('subir NÃO mexe: só lê o disco', () => {
    expect(mexeuNoDiscoLocal([subir])).toBe(false)
  })

  it('apagarRemoto NÃO mexe: acontece só no Drive', () => {
    expect(mexeuNoDiscoLocal([apagarRemoto])).toBe(false)
  })

  it('registrar NÃO mexe: não transfere nada, só acerta o manifesto', () => {
    expect(mexeuNoDiscoLocal([registrar])).toBe(false)
  })

  it('ciclo só de envio não relê o cofre — senão seriam centenas de arquivos a cada 60s', () => {
    expect(mexeuNoDiscoLocal([subir, subir, apagarRemoto, registrar])).toBe(false)
  })

  it('uma única ação local no meio de muitas remotas já obriga a recarga', () => {
    expect(mexeuNoDiscoLocal([subir, registrar, apagarRemoto, baixar, subir])).toBe(true)
  })
})

/**
 * O sintoma que o usuário viu, reproduzido: o sync mexe no disco por fora do app, e o store
 * tem de conseguir voltar a bater com o que está lá.
 */
const RAIZ = 'C:/Cofre'

describe('recarregarDoDisco', () => {
  let fs: ReturnType<typeof criarFakeFs>
  let repo: VaultRepo

  beforeEach(async () => {
    vi.restoreAllMocks()
    fs = criarFakeFs()
    repo = new VaultRepo(RAIZ, fs)
    await repo.inicializar()
    useApp.setState({ ...estadoLimpoDeCofre(), vaultPath: RAIZ, repo, carregando: false })
  })

  /** Nomes das sessões que a sidebar mostraria agora. */
  function sessoesNaTela(slugCampanha: string): string[] {
    const camp = useApp.getState().tree?.campanhas.find((c) => c.slug === slugCampanha)
    return (camp?.sessoes ?? []).map((s) => s.nome)
  }

  it('some da árvore a sessão que o sync apagou do disco — o item fantasma da sidebar', async () => {
    const slug = await repo.criarCampanha('One Piece')
    await repo.criarCanvasDoc(`campanhas/${slug}/sessoes`, 'Sessão 3: Reino de Goa')
    const copia = await repo.criarCanvasDoc(`campanhas/${slug}/sessoes`, '(conflito) Sessão 3: Reino de Goa')
    await useApp.getState().recarregarDoDisco()
    expect(sessoesNaTela(slug)).toHaveLength(2)

    // o sincronizador apaga a cópia direto no disco, sem passar pelo app
    await fs.removePath(`${RAIZ}/${copia.caminho}`)

    // sem a recarga a árvore continuaria com as duas, e clicar na fantasma daria "os error 2"
    await useApp.getState().recarregarDoDisco()
    expect(sessoesNaTela(slug)).toEqual(['Sessão 3: Reino de Goa'])
  })

  it('mostra o que o sync BAIXOU do outro computador', async () => {
    const slug = await repo.criarCampanha('One Piece')
    await useApp.getState().recarregarDoDisco()
    expect(sessoesNaTela(slug)).toEqual([])

    await fs.writeTextAtomic(
      `${RAIZ}/campanhas/${slug}/sessoes/vinda-de-fora.json`,
      JSON.stringify({ id: 'x1', nome: 'Vinda de fora', documento: null }),
    )
    await useApp.getState().recarregarDoDisco()
    expect(sessoesNaTela(slug)).toEqual(['Vinda de fora'])
  })

  it('relê o CONTEÚDO da entidade, não só a árvore — é o que impede o autosave de regravar o velho', async () => {
    const ref = await repo.criarPersonagemEm('personagens-soltos', 'Luffy')
    await useApp.getState().recarregarDoDisco()
    expect(useApp.getState().personagens[ref.id].versoes[0].descricao).toBe('')

    // o outro computador desenvolveu o personagem; o sync baixou por cima
    const doDrive = await repo.lerPersonagem(ref.caminho)
    doDrive.versoes[0].descricao = '<p>capitão dos Chapéus de Palha</p>'
    await repo.salvarPersonagem(ref.caminho, doDrive)

    await useApp.getState().recarregarDoDisco()
    expect(useApp.getState().personagens[ref.id].versoes[0].descricao).toBe('<p>capitão dos Chapéus de Palha</p>')
  })

  it('relê vinculos.json — sem isso a união do conflito era desfeita no autosave seguinte', async () => {
    await repo.salvarVinculos([
      { id: 'v1', deTipo: 'personagem', deId: 'a', paraTipo: 'personagem', paraId: 'b', tipo: 'conhece', notas: '', criadoEm: '' },
    ])
    await useApp.getState().recarregarDoDisco()
    expect(useApp.getState().vinculos).toHaveLength(1)

    // o ciclo mesclou os dois lados e gravou a união no disco
    await repo.salvarVinculos([
      { id: 'v1', deTipo: 'personagem', deId: 'a', paraTipo: 'personagem', paraId: 'b', tipo: 'conhece', notas: '', criadoEm: '' },
      { id: 'v2', deTipo: 'personagem', deId: 'c', paraTipo: 'cenario', paraId: 'd', tipo: 'mora em', notas: '', criadoEm: '' },
    ])
    await useApp.getState().recarregarDoDisco()
    expect(useApp.getState().vinculos.map((v) => v.id)).toEqual(['v1', 'v2'])
  })

  it('descarrega a fila ANTES de ler: edição pendente não é atropelada pela releitura', async () => {
    const ref = await repo.criarPersonagemEm('personagens-soltos', 'Zoro')
    await useApp.getState().recarregarDoDisco()

    // usuário digitou durante o ciclo: fica no cache, com gravação agendada em 800 ms
    useApp.getState().salvarPersonagemParcial(ref.id, { resumo: 'espadachim' })

    await useApp.getState().recarregarDoDisco()

    // sobreviveu no cache E chegou ao disco
    expect(useApp.getState().personagens[ref.id].versoes[0].resumo).toBe('espadachim')
    expect((await repo.lerPersonagem(ref.caminho)).versoes[0].resumo).toBe('espadachim')
  })

  it('sem cofre aberto não faz nada em vez de explodir', async () => {
    useApp.setState({ ...estadoLimpoDeCofre(), vaultPath: null, repo: null })
    await expect(useApp.getState().recarregarDoDisco()).resolves.toBeUndefined()
  })
})
