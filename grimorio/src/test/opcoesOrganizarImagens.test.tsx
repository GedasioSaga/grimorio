// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SituacaoDoDesfazer } from '../lib/organizarImagens/executar'
import type { Plano } from '../lib/organizarImagens/tipos'
import type { ResultadoOrganizacao } from '../state/organizarImagens'

/**
 * Portão da aba "Imagens" das Opções (`OpcoesOrganizarImagens`).
 *
 * O motor (planejar/executar/desfazer) tem portão próprio contra um cofre fake; aqui se julga só
 * o que o usuário encosta: a prévia agrupada por pasta, a confirmação antes de mexer, o botão que
 * mostra que está trabalhando, o progresso, a recusa que gera prévia nova sozinha e o desfazer.
 * A costura com o Tauri (`state/organizarImagens`) é substituída por dublês.
 */
const dialogo = vi.hoisted(() => ({ ask: vi.fn(async () => true), message: vi.fn(async () => undefined) }))
vi.mock('@tauri-apps/plugin-dialog', () => dialogo)

const costura = vi.hoisted(() => ({
  preverOrganizacao: vi.fn(),
  aplicarOrganizacao: vi.fn(),
  situacaoDoDesfazer: vi.fn(async (): Promise<SituacaoDoDesfazer> => 'nada'),
  desfazerUltimaOrganizacao: vi.fn(),
  abandonarUltimaOrganizacao: vi.fn(),
}))
vi.mock('../state/organizarImagens', () => costura)

import { OpcoesOrganizarImagens } from '../components/OpcoesOrganizarImagens'
import { ErroOrganizar } from '../lib/organizarImagens/executar'
import { useApp } from '../state/store'

const PLANO: Plano = {
  versao: 1,
  id: 'abc123',
  hashEntrada: 'h',
  movimentos: [
    { de: 'personagens-soltos/assets/retrato-p1-v1.png', para: 'imagens/personagens/Gandalf/retrato.png', sha256: 's1' },
    { de: 'personagens-soltos/assets/galeria-aaa.png', para: 'imagens/personagens/Gandalf/01.png', sha256: 's2' },
    { de: 'imagens-canvas/A1.png', para: 'imagens/mapas/Masmorra/porta secreta.png', sha256: 's3' },
  ],
  reescritas: [
    { arquivo: 'personagens-soltos/gandalf.json', pares: [] },
    { arquivo: 'mapas-soltos/masmorra.json', pares: [] },
  ],
  remocoes: [{ rel: 'imagens-notas/dup.png', sha256: 's3', motivo: 'copia-de-imagem-com-dono', mantida: 'imagens/mapas/Masmorra/porta secreta.png' }],
  avisos: ['itens/escudo.json cita imagens-itens/sumiu.png, que não existe no cofre (referência já quebrada).'],
  repetidasEntreDonos: [],
}
const VAZIO: Plano = { ...PLANO, id: 'vazio', movimentos: [], reescritas: [], remocoes: [], avisos: [] }
const RESULTADO: ResultadoOrganizacao = { fase: 'concluido', movidos: 3, reescritos: 2, removidos: 1, problemas: [], avisos: [] }

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<OpcoesOrganizarImagens />)
  })
}

function botao(texto: string): HTMLButtonElement {
  const achado = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === texto)
  if (!achado) throw new Error(`nenhum botão "${texto}"; há: ${Array.from(container.querySelectorAll('button')).map((b) => b.textContent).join(' | ')}`)
  return achado
}

async function clicar(texto: string) {
  await act(async () => {
    botao(texto).click()
  })
}

const texto = () => container.textContent ?? ''

beforeEach(() => {
  vi.clearAllMocks()
  dialogo.ask.mockResolvedValue(true)
  costura.situacaoDoDesfazer.mockResolvedValue('nada')
  useApp.setState({ vaultPath: 'C:/Cofre' })
})

afterEach(() => {
  root.unmount()
  container.remove()
})

describe('Opções › Imagens — prévia', () => {
  it('antes da prévia, Organizar está desabilitado e a razão está escrita', async () => {
    await montar()
    expect(botao('Organizar').disabled).toBe(true)
    expect(texto()).toContain('Nada muda no cofre até você clicar em Organizar')
  })

  it('Ver prévia mostra os números e a lista de → para agrupada por pasta de destino', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    await montar()
    await clicar('Ver prévia')

    expect(costura.preverOrganizacao).toHaveBeenCalledWith('C:/Cofre')
    const resumo = container.querySelector('.organizar-resumo')?.textContent ?? ''
    expect(resumo).toContain('3')
    expect(resumo).toContain('imagens mudam de lugar')
    const pastas = Array.from(container.querySelectorAll('.organizar-grupo summary')).map((s) => s.textContent ?? '')
    expect(pastas[0]).toContain('imagens/mapas/Masmorra/')
    expect(pastas[1]).toContain('imagens/personagens/Gandalf/')
    expect(pastas[1]).toContain('2')
    expect(texto()).toContain('personagens-soltos/assets/retrato-p1-v1.png')
    expect(texto()).toContain('retrato.png')
    expect(texto()).toContain('imagens-notas/dup.png')
    expect(texto()).toContain('sumiu.png')
    expect(botao('Organizar').disabled).toBe(false)
  })

  it('enquanto gera a prévia, o próprio botão diz que está trabalhando e não aceita outro clique', async () => {
    let terminar: (p: Plano) => void = () => {}
    costura.preverOrganizacao.mockImplementation(() => new Promise<Plano>((r) => { terminar = r }))
    await montar()
    await clicar('Ver prévia')
    expect(botao('Gerando prévia…').disabled).toBe(true)
    expect(botao('Organizar').disabled).toBe(true)
    await act(async () => { terminar(PLANO) })
    expect(botao('Gerar prévia de novo').disabled).toBe(false)
  })

  it('cofre já organizado: diz isso e Organizar continua desabilitado', async () => {
    costura.preverOrganizacao.mockResolvedValue(VAZIO)
    await montar()
    await clicar('Ver prévia')
    expect(texto()).toContain('Tudo já está organizado')
    expect(botao('Organizar').disabled).toBe(true)
  })

  it('imagens repetidas entre donos viram UMA linha, com a lista inteira atrás de "ver"; os outros avisos seguem um por linha', async () => {
    costura.preverOrganizacao.mockResolvedValue({
      ...PLANO,
      repetidasEntreDonos: [
        ['imagens-canvas/A3.png', 'imagens-notas/dup.png'],
        ['imagens-canvas/K1.png', 'imagens-cenarios/retrato-c1.png', 'personagens-soltos/assets/retrato-p1.png'],
      ],
    })
    await montar()
    await clicar('Ver prévia')

    const linhas = Array.from(container.querySelectorAll('.organizar-avisos > li'))
    expect(linhas).toHaveLength(2)
    expect(linhas[0].textContent).toContain('sumiu.png')
    const detalhe = linhas[1].querySelector('details')
    if (!detalhe) throw new Error(`a linha das repetidas não tem o "ver": ${linhas[1].outerHTML}`)
    expect(detalhe.open).toBe(false) // a lista começa escondida
    const resumo = detalhe.querySelector('summary')?.textContent ?? ''
    expect(resumo).toContain('5 imagens repetidas entre donos diferentes ficaram separadas')
    expect(resumo).toContain('ver')
    expect(Array.from(detalhe.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'imagens-canvas/A3.png, imagens-notas/dup.png',
      'imagens-canvas/K1.png, imagens-cenarios/retrato-c1.png, personagens-soltos/assets/retrato-p1.png',
    ])
  })

  it('sem imagem repetida entre donos, a linha delas não aparece', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    await montar()
    await clicar('Ver prévia')
    expect(container.querySelector('.organizar-avisos details')).toBeNull()
    expect(texto()).not.toContain('repetidas entre donos')
  })

  it('cofre já organizado, só com repetidas entre donos: a linha aparece mesmo sem outro aviso', async () => {
    costura.preverOrganizacao.mockResolvedValue({ ...VAZIO, repetidasEntreDonos: [['a/x.png', 'b/x.png']] })
    await montar()
    await clicar('Ver prévia')
    expect(texto()).toContain('Tudo já está organizado')
    expect(texto()).toContain('2 imagens repetidas entre donos diferentes ficaram separadas')
  })

  it('falha na prévia aparece perto da ação e o botão volta a funcionar', async () => {
    costura.preverOrganizacao.mockRejectedValue(new Error('1 gravação pendente falhou.'))
    await montar()
    await clicar('Ver prévia')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('1 gravação pendente falhou.')
    expect(botao('Ver prévia').disabled).toBe(false)
  })
})

describe('Opções › Imagens — organizar', () => {
  it('pergunta antes; recusar não mexe em nada', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    dialogo.ask.mockResolvedValue(false)
    await montar()
    await clicar('Ver prévia')
    await clicar('Organizar')
    expect(dialogo.ask).toHaveBeenCalledTimes(1)
    expect(costura.aplicarOrganizacao).not.toHaveBeenCalled()
  })

  it('confirma, mostra o progresso por fase e depois o resultado; Desfazer fica disponível', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    let terminar: (r: ResultadoOrganizacao) => void = () => {}
    let avisar: ((feito: number, total: number, fase: string) => void) | undefined
    costura.aplicarOrganizacao.mockImplementation((_raiz: string, _plano: Plano, aoProgresso?: typeof avisar) => {
      avisar = aoProgresso
      return new Promise<ResultadoOrganizacao>((r) => { terminar = r })
    })
    await montar()
    await clicar('Ver prévia')
    await clicar('Organizar')

    expect(costura.aplicarOrganizacao).toHaveBeenCalledWith('C:/Cofre', PLANO, expect.any(Function))
    expect(botao('Organizando…').disabled).toBe(true)
    await act(async () => { avisar?.(2, 7, 'movendo') })
    const barra = container.querySelector('progress')
    expect(barra?.getAttribute('value')).toBe('2')
    expect(barra?.getAttribute('max')).toBe('7')
    expect(texto()).toContain('2 de 7')

    costura.situacaoDoDesfazer.mockResolvedValue('desfazivel')
    await act(async () => { terminar(RESULTADO) })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('3 imagens organizadas')
    expect(container.querySelector('progress')).toBeNull()
    expect(botao('Desfazer última organização').disabled).toBe(false)
    expect(botao('Organizar').disabled).toBe(true) // a prévia antiga não vale mais
  })

  it('cofre mudou depois da prévia: explica e gera a prévia de novo sozinho', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    costura.aplicarOrganizacao.mockRejectedValue(new ErroOrganizar('cofre-mudou', 'O cofre mudou desde a prévia.'))
    await montar()
    await clicar('Ver prévia')
    await clicar('Organizar')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('O cofre mudou desde a prévia.')
    expect(costura.preverOrganizacao).toHaveBeenCalledTimes(2)
    expect(botao('Organizar').disabled).toBe(false)
  })

  it('problema achado na conferência final é mostrado, não engolido', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    costura.aplicarOrganizacao.mockResolvedValue({ ...RESULTADO, problemas: ['mapas-soltos/m.json ainda cita imagens-canvas/A1.png.'] })
    await montar()
    await clicar('Ver prévia')
    await clicar('Organizar')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('ainda cita imagens-canvas/A1.png')
  })

  it('organizou, mas o app não releu o cofre: o aviso aparece junto do resultado (não some no console)', async () => {
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    costura.aplicarOrganizacao.mockResolvedValue({ ...RESULTADO, avisos: ['Feche e abra o cofre de novo antes de continuar editando.'] })
    await montar()
    await clicar('Ver prévia')
    await clicar('Organizar')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('3 imagens organizadas')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Feche e abra o cofre de novo')
  })
})

describe('Opções › Imagens — desfazer', () => {
  it('sem organização registrada, Desfazer fica desabilitado', async () => {
    await montar()
    expect(costura.situacaoDoDesfazer).toHaveBeenCalledWith('C:/Cofre')
    expect(botao('Desfazer última organização').disabled).toBe(true)
  })

  it('com organização registrada: pergunta, desfaz e avisa', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('desfazivel')
    costura.desfazerUltimaOrganizacao.mockResolvedValue({ planoId: 'abc123', problemas: [], completo: true, avisos: [] })
    await montar()
    costura.situacaoDoDesfazer.mockResolvedValue('nada')
    await clicar('Desfazer última organização')
    expect(dialogo.ask).toHaveBeenCalledTimes(1)
    expect(costura.desfazerUltimaOrganizacao).toHaveBeenCalledWith('C:/Cofre')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('desfeita')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(botao('Desfazer última organização').disabled).toBe(true)
  })

  it('desfez, mas o app não releu o cofre: o aviso aparece', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('desfazivel')
    costura.desfazerUltimaOrganizacao.mockResolvedValue({ planoId: 'abc123', problemas: [], completo: true, avisos: ['Feche e abra o cofre de novo.'] })
    await montar()
    await clicar('Desfazer última organização')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Feche e abra o cofre de novo.')
  })

  it('a volta parou no meio: nada de "desfeita", o problema aparece e Desfazer continua disponível', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('desfazivel')
    costura.desfazerUltimaOrganizacao.mockResolvedValue({
      planoId: 'abc123',
      problemas: ['Não deu para devolver personagens-soltos/gandalf.json: EBUSY.'],
      completo: false,
      avisos: [],
    })
    await montar()
    await clicar('Desfazer última organização')
    expect(container.querySelector('[role="status"]')).toBeNull()
    const alerta = container.querySelector('[role="alert"]')?.textContent ?? ''
    expect(alerta).toContain('gandalf.json')
    expect(alerta).toContain('Tente de novo')
    expect(botao('Desfazer última organização').disabled).toBe(false)
  })

  it('organização ou desfazer pela metade: Organizar fica desabilitado e o porquê está escrito', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('pendente')
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    await montar()
    await clicar('Ver prévia')
    expect(botao('Organizar').disabled).toBe(true)
    expect(botao('Desfazer última organização').disabled).toBe(false)
    expect(texto()).toContain('ficou pela metade')
    expect(texto()).toContain('antes de organizar de novo')
  })

  it('recusa do desfazer (ficha editada depois) aparece como erro', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('desfazivel')
    costura.desfazerUltimaOrganizacao.mockRejectedValue(new ErroOrganizar('mudou-depois', 'Estes arquivos mudaram depois da organização: a.json.'))
    await montar()
    await clicar('Desfazer última organização')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('a.json')
    expect(botao('Desfazer última organização').disabled).toBe(false)
  })
})

describe('Opções › Imagens — manter o cofre como está', () => {
  const MANTER = 'Manter o cofre como está'
  const temBotao = (rotulo: string) => Array.from(container.querySelectorAll('button')).some((b) => (b.textContent ?? '').trim() === rotulo)

  it('pela metade: pergunta, mostra que está trabalhando, libera, e o Organizar volta a funcionar', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('pendente')
    costura.preverOrganizacao.mockResolvedValue(PLANO)
    let terminar: () => void = () => {}
    costura.abandonarUltimaOrganizacao.mockImplementation(() => new Promise<void>((r) => { terminar = r }))
    await montar()
    await clicar('Ver prévia')
    expect(botao('Organizar').disabled).toBe(true)
    expect(texto()).toContain(MANTER) // o aviso de "pela metade" já aponta a saída

    await clicar(MANTER)
    expect(dialogo.ask).toHaveBeenCalledWith(expect.stringContaining('Nada no cofre é movido nem apagado'), expect.objectContaining({ kind: 'warning' }))
    expect(costura.abandonarUltimaOrganizacao).toHaveBeenCalledWith('C:/Cofre')
    expect(botao('Liberando…').disabled).toBe(true)
    expect(botao('Desfazer última organização').disabled).toBe(true)

    costura.situacaoDoDesfazer.mockResolvedValue('nada')
    await act(async () => { terminar() })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Organizar voltou a funcionar')
    expect(texto()).not.toContain('ficou pela metade')
    expect(temBotao(MANTER)).toBe(false)
    expect(botao('Organizar').disabled).toBe(false) // a prévia continua valendo: o cofre não mudou
  })

  it('recusar a pergunta não libera nada', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('pendente')
    dialogo.ask.mockResolvedValue(false)
    await montar()
    await clicar(MANTER)
    expect(costura.abandonarUltimaOrganizacao).not.toHaveBeenCalled()
    expect(texto()).toContain('ficou pela metade')
  })

  it.each<SituacaoDoDesfazer>(['nada', 'desfazivel'])('sem nada pela metade (%s), o botão não aparece', async (situacao) => {
    costura.situacaoDoDesfazer.mockResolvedValue(situacao)
    await montar()
    expect(temBotao(MANTER)).toBe(false)
  })

  it('não deu para liberar: o erro aparece e o botão continua lá para tentar de novo', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('pendente')
    costura.abandonarUltimaOrganizacao.mockRejectedValue(new ErroOrganizar('diario', 'Não deu para registrar no diário (ENOSPC).'))
    await montar()
    await clicar(MANTER)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('ENOSPC')
    expect(botao(MANTER).disabled).toBe(false)
  })

  it('pela metade, o desfazer recusou porque uma ficha mudou depois: o erro aponta a saída', async () => {
    costura.situacaoDoDesfazer.mockResolvedValue('pendente')
    costura.desfazerUltimaOrganizacao.mockRejectedValue(new ErroOrganizar('mudou-depois', 'Estes arquivos mudaram depois da organização: itens/espada.json.'))
    await montar()
    await clicar('Desfazer última organização')
    const alerta = container.querySelector('[role="alert"]')?.textContent ?? ''
    expect(alerta).toContain('itens/espada.json')
    expect(alerta).toContain(MANTER)
    expect(botao(MANTER).disabled).toBe(false)
  })
})
