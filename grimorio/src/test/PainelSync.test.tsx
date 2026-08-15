// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { estadoInicialSync, type EstadoSync } from '../lib/sync/sincronizador'
import { nomeDaCopia } from '../lib/sync/conflito'

vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }))

const QUANDO_MARCA = new Date(2026, 6, 26, 14, 32)

/** Caminho de cópia GERADA por `nomeDaCopia` — a marca de verdade que `temMarcaDeCopia` exige. */
function caminhoMarcado(original: string): string {
  return nomeDaCopia(original, 'PC Casa', QUANDO_MARCA, 0)
}

/** `caminhoCenarioPorId` guarda a PASTA, não o `cenario.json` — mesma forma que o store usa. */
function dirCenarioMarcado(original: string): string {
  const marcado = caminhoMarcado(original)
  return marcado.slice(0, marcado.length - '/cenario.json'.length)
}

// Sem @testing-library no projeto: monta com react-dom/client + act, como AbaVinculos.test.tsx.
// Os dois stores são mockados para o teste escolher o retrato do sync e o conteúdo do cofre.
const h = vi.hoisted(() => ({
  sync: {} as EstadoSync,
  cofre: {} as Record<string, unknown>,
  abrirPerfil: vi.fn(),
  abrirCenario: vi.fn(),
  abrirDocumento: vi.fn(),
  recarregarArvore: vi.fn(async () => {}),
  carregarPersonagens: vi.fn(async () => {}),
  carregarCenarios: vi.fn(async () => {}),
  repo: {
    excluirItem: vi.fn(async () => {}),
    excluirCenario: vi.fn(async () => {}),
    excluirItemComNotas: vi.fn(async () => {}),
  },
}))
vi.mock('../state/syncStore', () => ({ useSync: () => h.sync }))
vi.mock('../state/store', () => ({
  useApp: (sel: (s: unknown) => unknown) => sel({
    tree: null,
    caminhoPorId: {},
    caminhoCenarioPorId: {},
    ...h.cofre,
    abrirPerfil: h.abrirPerfil,
    abrirCenario: h.abrirCenario,
    abrirDocumento: h.abrirDocumento,
    recarregarArvore: h.recarregarArvore,
    carregarPersonagens: h.carregarPersonagens,
    carregarCenarios: h.carregarCenarios,
    repo: h.repo,
  }),
}))

import { ask, message } from '@tauri-apps/plugin-dialog'
import { PainelSync } from '../components/PainelSync'

const onFechar = vi.fn()
const onLigar = vi.fn()
const onSincronizar = vi.fn()
let container: HTMLDivElement
let root: Root

async function montar(ocupado = false) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <PainelSync
        onFechar={onFechar}
        onLigar={onLigar}
        onSincronizar={onSincronizar}
        ocupado={ocupado}
      />,
    )
  })
}

/** O botão de ação da aba (parear ou sincronizar). É sempre um só. */
function botaoDeAcao(): HTMLButtonElement {
  const botao = container.querySelector<HTMLButtonElement>('button.opcoes-acao')
  if (botao === null) throw new Error('a aba Nuvem não mostrou botão de ação nenhum')
  return botao
}

const texto = () => container.textContent ?? ''
const clicar = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

function personagem(id: string, nome: string) {
  return { id, nome, versoes: [], versaoAtivaId: '', criadoEm: '', modificadoEm: '' }
}

function cenario(id: string, nome: string) {
  return { id, nome, personagens: [], versoes: [], versaoAtivaId: '', criadoEm: '', modificadoEm: '' }
}

function item(caminho: string, nome: string) {
  return { slug: nome, nome, caminho }
}

beforeEach(() => {
  onFechar.mockReset()
  onLigar.mockReset()
  onSincronizar.mockReset()
  h.abrirPerfil.mockReset()
  h.abrirCenario.mockReset()
  h.abrirDocumento.mockReset()
  h.recarregarArvore.mockClear()
  h.carregarPersonagens.mockClear()
  h.carregarCenarios.mockClear()
  h.repo.excluirItem.mockReset().mockResolvedValue(undefined)
  h.repo.excluirCenario.mockReset().mockResolvedValue(undefined)
  h.repo.excluirItemComNotas.mockReset().mockResolvedValue(undefined)
  vi.mocked(ask).mockReset()
  vi.mocked(message).mockReset()
  h.sync = estadoInicialSync()
  h.cofre = { personagens: {}, cenarios: {}, campanhaFiltro: null, tree: null }
})
afterEach(() => { root.unmount(); container.remove() })

describe('PainelSync', () => {
  it('cofre nunca pareado explica que nada sobe nem desce', async () => {
    await montar()
    expect(texto()).toContain('Este cofre ainda não está ligado ao Google Drive.')
    expect(container.querySelector('.sync-aviso')).toBeNull()
  })

  it('cofre não pareado oferece LIGAR, e nunca sincronizar', async () => {
    await montar()

    const botao = botaoDeAcao()
    expect(botao.textContent).toBe('Ligar este cofre ao Google Drive')
    await act(async () => { clicar(botao) })

    expect(onLigar).toHaveBeenCalledTimes(1)
    // "sincronizar agora" num cofre sem manifesto é um botão que não tem o que fazer
    expect(onSincronizar).not.toHaveBeenCalled()
    expect(texto()).not.toContain('Sincronizar agora')
  })

  it('cofre pareado oferece SINCRONIZAR, e nunca ligar de novo', async () => {
    h.sync = { ...estadoInicialSync(), pareado: true }
    await montar()

    const botao = botaoDeAcao()
    expect(botao.textContent).toBe('Sincronizar agora')
    await act(async () => { clicar(botao) })

    expect(onSincronizar).toHaveBeenCalledTimes(1)
    // parear de novo sobrescreveria o manifesto e faria todo arquivo divergente virar cópia
    expect(onLigar).not.toHaveBeenCalled()
  })

  it('ciclo em andamento trava o botão para não empilhar rodada', async () => {
    h.sync = { ...estadoInicialSync(), pareado: true, fase: 'sincronizando' }
    await montar()

    const botao = botaoDeAcao()
    expect(botao.disabled).toBe(true)
    expect(botao.textContent).toBe('Sincronizando…')
  })

  it('ação em andamento na aba trava o botão de ligar', async () => {
    await montar(true)

    const botao = botaoDeAcao()
    expect(botao.disabled).toBe(true)
    expect(botao.textContent).toBe('Ligando…')
  })

  it('o freio aparece com os números e sem botão de apagar mesmo assim', async () => {
    h.sync = { ...estadoInicialSync(), pareado: true, freio: { apagaria: 42, total: 50 } }
    await montar()

    const aviso = container.querySelector('.sync-aviso-freio')
    expect(aviso).toBeTruthy()
    expect(aviso?.textContent).toContain('apagar 42 dos 50 arquivos')
    expect(aviso?.textContent).toContain('nada foi apagado, nem aqui nem no Drive')
    // o plano recusado não carrega as ações: não há o que confirmar, então não há botão
    expect(aviso?.querySelector('button')).toBeNull()
  })

  it('lista a cópia de conflito e a abre fechando as Opções antes', async () => {
    h.cofre = {
      personagens: { p1: personagem('p1', 'Gandalf'), p2: personagem('p2', '(conflito) Gandalf') },
      cenarios: {},
      campanhaFiltro: null,
      caminhoPorId: { p2: caminhoMarcado('personagens-soltos/gandalf.json') },
    }
    await montar()

    const itens = container.querySelectorAll('.sync-copia-item')
    expect(itens).toHaveLength(1)
    expect(itens[0].textContent).toContain('(conflito) Gandalf')

    await act(async () => { clicar(itens[0].querySelector('button')!) })
    expect(h.abrirPerfil).toHaveBeenCalledWith('p2')
    expect(h.abrirCenario).not.toHaveBeenCalled()
    // fechar PRIMEIRO: as Opções pintam por cima do PerfilModal (mesmo z-index, depois no DOM)
    expect(onFechar.mock.invocationCallOrder[0]).toBeLessThan(h.abrirPerfil.mock.invocationCallOrder[0])
  })

  it('Defeito B: lista cópia de conflito de mapa e canvas, e abre pelo caminho', async () => {
    const caminhoCanvas = caminhoMarcado('canvases-soltos/x.json')
    const caminhoMapa = caminhoMarcado('mapas-soltos/y.json')
    h.cofre = {
      personagens: {},
      cenarios: {},
      campanhaFiltro: null,
      tree: {
        canvasesSoltos: [item(caminhoCanvas, '(conflito) Anotações')],
        mapasSoltos: [item(caminhoMapa, '(conflito) Mapa do Castelo L2')],
      },
    }
    await montar()

    const itens = container.querySelectorAll('.sync-copia-item')
    expect(itens).toHaveLength(2)
    expect(texto()).toContain('(conflito) Mapa do Castelo L2')
    expect(texto()).toContain('(conflito) Anotações')

    const itemMapa = [...itens].find((i) => i.textContent?.includes('Mapa do Castelo'))!
    await act(async () => { clicar(itemMapa.querySelector('button')!) })
    expect(h.abrirDocumento).toHaveBeenCalledWith('mapa', caminhoMapa, '(conflito) Mapa do Castelo L2')
  })

  it('CRÍTICO: entidade nomeada pelo usuário com o prefixo não aparece na lista nem pode ser descartada', async () => {
    // o caso do relato: mestre batiza um cenário assim de propósito — caminho real, sem a marca
    h.cofre = {
      personagens: {},
      cenarios: { c1: cenario('c1', '(conflito) na Ilha dos Piratas') },
      campanhaFiltro: null,
      caminhoCenarioPorId: { c1: 'cenarios/na-ilha-dos-piratas' },
    }
    await montar()

    expect(container.querySelectorAll('.sync-copia-item')).toHaveLength(0)
    expect(texto()).not.toContain('Cópias criadas por conflito')
  })

  it('descartar pede confirmação e só apaga se o usuário aceitar', async () => {
    vi.mocked(ask).mockResolvedValueOnce(false)
    h.cofre = {
      personagens: {},
      cenarios: {},
      campanhaFiltro: null,
      tree: { canvasesSoltos: [], mapasSoltos: [item(caminhoMarcado('mapas-soltos/y.json'), '(conflito) Castelo')] },
    }
    await montar()

    const botaoDescartar = container.querySelectorAll('.sync-copia-item button')[1]
    await act(async () => { clicar(botaoDescartar) })

    expect(h.repo.excluirItemComNotas).not.toHaveBeenCalled()
  })

  it('descartar confirmado apaga a cópia de mapa/canvas COM as notas e recarrega a árvore', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true)
    const caminho = caminhoMarcado('mapas-soltos/y.json')
    h.cofre = {
      personagens: {},
      cenarios: {},
      campanhaFiltro: null,
      tree: { canvasesSoltos: [], mapasSoltos: [item(caminho, '(conflito) Castelo')] },
    }
    await montar()

    const botaoDescartar = container.querySelectorAll('.sync-copia-item button')[1]
    await act(async () => { clicar(botaoDescartar) })

    expect(h.repo.excluirItemComNotas).toHaveBeenCalledWith(caminho)
    expect(h.recarregarArvore).toHaveBeenCalled()
  })

  it('descartar confirmado de personagem resolve o caminho pelo id e recarrega os personagens', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true)
    const caminho = caminhoMarcado('personagens-soltos/gandalf.json')
    h.cofre = {
      personagens: { p2: personagem('p2', '(conflito) Gandalf') },
      cenarios: {},
      campanhaFiltro: null,
      caminhoPorId: { p2: caminho },
    }
    await montar()

    const botaoDescartar = container.querySelectorAll('.sync-copia-item button')[1]
    await act(async () => { clicar(botaoDescartar) })

    expect(h.repo.excluirItem).toHaveBeenCalledWith(caminho)
    expect(h.carregarPersonagens).toHaveBeenCalled()
    expect(h.recarregarArvore).toHaveBeenCalled()
  })

  it('descartar confirmado de CENÁRIO resolve a pasta pelo id — o caso mais arriscado, entidade é diretório', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true)
    const dir = dirCenarioMarcado('cenarios/taverna/cenario.json')
    h.cofre = {
      personagens: {},
      cenarios: { c1: cenario('c1', '(conflito) Taverna') },
      campanhaFiltro: null,
      caminhoCenarioPorId: { c1: dir },
    }
    await montar()

    const botaoDescartar = container.querySelectorAll('.sync-copia-item button')[1]
    await act(async () => { clicar(botaoDescartar) })

    expect(h.repo.excluirCenario).toHaveBeenCalledWith(dir)
    expect(h.repo.excluirItem).not.toHaveBeenCalled()
    expect(h.carregarCenarios).toHaveBeenCalled()
    expect(h.recarregarArvore).toHaveBeenCalled()
  })

  it('SÉRIO: sem entrada no cache a entidade nem aparece na lista — não há botão que apague em silêncio', async () => {
    // é o achado 3 fechado pela raiz: `copiasDeConflito` agora exige a MESMA entrada de
    // `caminhoPorId`/`caminhoCenarioPorId` para listar E para descartar (fix do achado
    // CRÍTICO). Sem ela, o item não aparece — não existe mais um botão que "descarta" sem
    // saber o caminho e sai calado. Cobertura direta da função pura está em
    // `painelSync.test.ts` ("sem entrada no cache... fica de fora").
    h.cofre = {
      personagens: { p2: personagem('p2', '(conflito) Gandalf') },
      cenarios: { c1: cenario('c1', '(conflito) Taverna') },
      campanhaFiltro: null,
      // caminhoPorId/caminhoCenarioPorId ausentes de propósito — cache ainda não carregou
    }
    await montar()

    expect(container.querySelectorAll('.sync-copia-item')).toHaveLength(0)
  })

  it('SÉRIO: falha de repo.excluir* vira aviso, nunca promise sem handler', async () => {
    vi.mocked(ask).mockResolvedValueOnce(true)
    h.repo.excluirItemComNotas.mockRejectedValueOnce(new Error('arquivo em uso pelo OneDrive'))
    const caminho = caminhoMarcado('mapas-soltos/y.json')
    h.cofre = {
      personagens: {},
      cenarios: {},
      campanhaFiltro: null,
      tree: { canvasesSoltos: [], mapasSoltos: [item(caminho, '(conflito) Castelo')] },
    }
    await montar()

    const botaoDescartar = container.querySelectorAll('.sync-copia-item button')[1]
    await act(async () => { clicar(botaoDescartar) })

    expect(vi.mocked(message)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(message).mock.calls[0][0]).toContain('arquivo em uso pelo OneDrive')
    // e a linha volta a ficar clicável — não trava para sempre num estado "ocupado"
    const botaoDepois = container.querySelectorAll('.sync-copia-item button')[1] as HTMLButtonElement
    expect(botaoDepois.disabled).toBe(false)
  })

  it('MENOR: duplo clique não dispara a exclusão duas vezes em paralelo', async () => {
    vi.mocked(ask).mockResolvedValue(true)
    let resolverExclusao!: () => void
    h.repo.excluirItemComNotas.mockReset().mockReturnValueOnce(
      new Promise<void>((resolve) => { resolverExclusao = resolve }),
    )
    const caminho = caminhoMarcado('mapas-soltos/y.json')
    h.cofre = {
      personagens: {},
      cenarios: {},
      campanhaFiltro: null,
      tree: { canvasesSoltos: [], mapasSoltos: [item(caminho, '(conflito) Castelo')] },
    }
    await montar()

    const botaoDescartar = () => container.querySelectorAll('.sync-copia-item button')[1] as HTMLButtonElement
    await act(async () => { clicar(botaoDescartar()) })
    // a linha trava ANTES da exclusão terminar — o botão já está desabilitado aqui
    expect(botaoDescartar().disabled).toBe(true)
    await act(async () => { clicar(botaoDescartar()) })
    await act(async () => { resolverExclusao() })

    expect(h.repo.excluirItemComNotas).toHaveBeenCalledTimes(1)
  })

  it('só avisa do filtro de campanha quando há um filtro ligado', async () => {
    h.cofre = {
      personagens: { p2: personagem('p2', '(conflito) Gandalf') },
      cenarios: {},
      campanhaFiltro: null,
      caminhoPorId: { p2: caminhoMarcado('personagens-soltos/gandalf.json') },
    }
    await montar()
    expect(texto()).not.toContain('filtro de campanha')

    await act(async () => { root.unmount() })
    container.remove()
    h.cofre = { ...h.cofre, campanhaFiltro: 'camp1' }
    await montar()
    expect(texto()).toContain('não aparece na barra lateral')
  })

  it('cofre sem conflito não mostra a seção de cópias', async () => {
    h.sync = { ...estadoInicialSync(), pareado: true, ultimoSync: '2026-07-26T14:32:00' }
    await montar()
    expect(texto()).toContain('Tudo em dia com o Google Drive.')
    expect(container.querySelector('.sync-copia-item')).toBeNull()
    expect(texto()).not.toContain('Cópias criadas por conflito')
  })
})
