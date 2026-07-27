// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { estadoInicialSync, type EstadoSync } from '../lib/sync/sincronizador'

// Sem @testing-library no projeto: monta com react-dom/client + act, como AbaVinculos.test.tsx.
// Os dois stores são mockados para o teste escolher o retrato do sync e o conteúdo do cofre.
const h = vi.hoisted(() => ({
  sync: {} as EstadoSync,
  cofre: {} as Record<string, unknown>,
  abrirPerfil: vi.fn(),
  abrirCenario: vi.fn(),
}))
vi.mock('../state/syncStore', () => ({ useSync: () => h.sync }))
vi.mock('../state/store', () => ({
  useApp: (sel: (s: unknown) => unknown) => sel({
    ...h.cofre,
    abrirPerfil: h.abrirPerfil,
    abrirCenario: h.abrirCenario,
  }),
}))

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

beforeEach(() => {
  onFechar.mockReset()
  onLigar.mockReset()
  onSincronizar.mockReset()
  h.abrirPerfil.mockReset()
  h.abrirCenario.mockReset()
  h.sync = estadoInicialSync()
  h.cofre = { personagens: {}, cenarios: {}, campanhaFiltro: null }
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

  it('só avisa do filtro de campanha quando há um filtro ligado', async () => {
    h.cofre = {
      personagens: { p2: personagem('p2', '(conflito) Gandalf') },
      cenarios: {},
      campanhaFiltro: null,
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
