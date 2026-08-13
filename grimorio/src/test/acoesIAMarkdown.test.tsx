// @vitest-environment jsdom
/**
 * O caminho que o usuário reclamou, de ponta a ponta: a IA responde em Markdown, o preview
 * mostra, ele aceita, e aquilo é gravado na aba do perfil.
 *
 * Antes disto os modais convertiam com `textoParaHtml`, que envolve cada linha num `<p>` e
 * escapa o resto — `**Alto**` era gravado com os asteriscos à mostra e `## Aparência` virava
 * um parágrafo começado por cerquilha. O conversor certo já existia; só não estava ligado aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AcoesIA, type ModoInserir } from '../components/AcoesIA'
import { markdownParaHtml } from '../lib/markdownHtml'

const gerarConteudo = vi.fn()

vi.mock('../lib/gemini', () => ({ gerarConteudo: (...a: unknown[]) => gerarConteudo(...a) }))
vi.mock('../lib/chavesIA', () => ({ garantirChaves: async () => ({ gemini: 'k' }) }))
vi.mock('../lib/modeloIA', () => ({ modeloSalvo: () => 'modelo-teste' }))
vi.mock('../components/dialogos', () => ({ pedirTexto: async () => null }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: async () => true }))

/** Resposta como o modelo devolve depois de SYSTEM_ESCRITOR: Markdown de verdade. */
const RESPOSTA_IA = [
  '## Aparência',
  '',
  'Homem **alto** e de fala *mansa*.',
  '',
  '- Cicatriz no rosto',
  '- Equipamento',
  '  - Espada longa',
  '  - Escudo amassado',
].join('\n')

let container: HTMLDivElement
let root: Root
let inserido: { destino: string; texto: string; modo: ModoInserir } | null = null

async function montar(conteudoAtual = '') {
  inserido = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <AcoesIA
        system="persona"
        abaAtual="descricao"
        rotuloAbaAtual="Descrição"
        abaEhTexto
        acoes={[]}
        snapshot={() => ({ dadosBase: '# Personagem', textoAtual: '', contexto: '' })}
        conteudoDoDestino={() => conteudoAtual}
        onInserir={(destino, texto, modo) => { inserido = { destino, texto, modo } }}
      />,
    )
  })
}

const botao = (texto: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto)!
const preview = () => container.querySelector('.acoes-ia-preview-texto')

/** Abre o ✨ e roda "Versão longa" até o preview aparecer. */
async function rodarAcao() {
  await act(async () => { container.querySelector<HTMLButtonElement>('.acoes-ia > .btn-icon')!.click() })
  await act(async () => { botao('Versão longa').click() })
}

beforeEach(() => {
  gerarConteudo.mockReset()
  gerarConteudo.mockResolvedValue(RESPOSTA_IA)
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
})

describe('preview das ações de IA', () => {
  it('renderiza o Markdown em vez de mostrar a marcação crua', async () => {
    await montar()
    await rodarAcao()

    const html = preview()!.innerHTML
    expect(html).toContain('<h2>Aparência</h2>')
    expect(html).toContain('<strong>alto</strong>')
    expect(html).toContain('<em>mansa</em>')
    expect(html).toContain('<ul>')
  })

  it('nenhum asterisco nem cerquilha sobra visível para o usuário', async () => {
    await montar()
    await rodarAcao()

    const visivel = preview()!.textContent ?? ''
    expect(visivel).not.toContain('**')
    expect(visivel).not.toContain('## ')
    expect(visivel).toContain('Aparência') // o conteúdo continua lá, só sem a marcação
  })

  it('a sublista do equipamento vira aninhamento de verdade', async () => {
    await montar()
    await rodarAcao()

    // a <ul> de dentro é filha de um <li>, não irmã da lista de fora
    expect(preview()!.querySelector('li > ul > li')?.textContent).toBe('Espada longa')
  })
})

describe('o que é entregue ao modal', () => {
  it('"Substituir" entrega o texto CRU — a conversão é do pai', async () => {
    await montar()
    await rodarAcao()
    await act(async () => { botao('Substituir em Descrição').click() })

    expect(inserido).not.toBeNull()
    expect(inserido!.modo).toBe('substituir')
    expect(inserido!.destino).toBe('descricao')
    expect(inserido!.texto).toBe(RESPOSTA_IA)
  })

  it('"Adicionar" usa o mesmo texto, mudando só o modo', async () => {
    await montar()
    await rodarAcao()
    await act(async () => { botao('Adicionar em Descrição').click() })

    expect(inserido!.modo).toBe('adicionar')
    expect(inserido!.texto).toBe(RESPOSTA_IA)
  })

  /**
   * O passo que estava quebrado. Prende o resultado final: o que os modais gravam a partir
   * do texto cru é HTML que o TipTap entende, não Markdown escapado dentro de `<p>`.
   */
  it('o texto entregue vira HTML de editor, não parágrafos com asterisco', async () => {
    await montar()
    await rodarAcao()
    await act(async () => { botao('Substituir em Descrição').click() })

    const gravado = markdownParaHtml(inserido!.texto)
    expect(gravado).toContain('<h2>Aparência</h2>')
    expect(gravado).toContain('<strong>alto</strong>')
    expect(gravado).toContain('<li>Equipamento<ul><li>Espada longa</li>')
    expect(gravado).not.toContain('<p>## Aparência</p>')
    expect(gravado).not.toContain('**')
  })
})
