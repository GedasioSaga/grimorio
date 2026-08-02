// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorTexto } from '../components/EditorTexto'

/**
 * O editor tem de acompanhar `value` quando ele muda POR FORA — que é o que acontece quando a
 * IA escreve na aba em que o usuário já está.
 *
 * O bug: `useEditor({ content: value })` lê `content` só na montagem. Os modais remontam o
 * editor por `key={aba}`, então trocar de aba funcionava; mas "Melhorar"/"Versão longa"
 * escrevem na aba ATUAL, a key não muda, e o texto novo só aparecia depois de sair da aba e
 * voltar.
 *
 * O outro lado é igualmente importante: enquanto o usuário digita, o pai devolve o mesmo HTML
 * de volta em `value`. Reagir a esse eco reescreveria o documento a cada tecla e jogaria o
 * cursor para o começo.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(value: string, onChange: (html: string) => void = () => {}) {
  await act(async () => {
    root.render(<EditorTexto value={value} onChange={onChange} />)
  })
}

function textoNaTela(): string {
  return container.querySelector('.perfil-corpo')?.textContent ?? ''
}

function htmlNaTela(): string {
  return container.querySelector('.perfil-corpo .ProseMirror')?.innerHTML ?? ''
}

describe('EditorTexto — conteúdo vindo de fora', () => {
  it('mostra o value inicial', async () => {
    await render('<p>original</p>')
    expect(textoNaTela()).toContain('original')
  })

  it('acompanha o value trocado SEM remontar — é o caso da IA escrevendo na aba atual', async () => {
    await render('<p>original</p>')
    await render('<p>reescrito pela IA</p>')
    expect(textoNaTela()).toContain('reescrito pela IA')
    expect(textoNaTela()).not.toContain('original')
  })

  it('substituir por texto mais curto não deixa sobra do anterior', async () => {
    await render('<p>um texto bem longo que existia antes</p>')
    await render('<p>curto</p>')
    expect(textoNaTela().trim()).toBe('curto')
  })

  it('acompanha várias trocas seguidas', async () => {
    await render('<p>a</p>')
    await render('<p>b</p>')
    await render('<p>c</p>')
    expect(textoNaTela().trim()).toBe('c')
  })

  it('mantém a marcação rica que a IA gerou', async () => {
    await render('<p>simples</p>')
    await render('<h2>Título</h2><ul><li>item</li></ul>')
    expect(htmlNaTela()).toContain('<h2>')
    expect(htmlNaTela()).toContain('<li>')
  })

  it('value IGUAL não reescreve o documento — é o eco da própria digitação', async () => {
    // sem esta guarda, cada tecla faria o pai devolver o mesmo HTML, o efeito chamaria
    // setContent e o cursor voltaria para o começo do texto a cada letra
    await render('<p>digitando</p>')
    const antes = container.querySelector('.perfil-corpo .ProseMirror')
    await render('<p>digitando</p>')
    // mesmo nó do DOM = o ProseMirror não foi reconstruído
    expect(container.querySelector('.perfil-corpo .ProseMirror')).toBe(antes)
  })

  it('não dispara onChange ao receber conteúdo de fora', async () => {
    // se disparasse, o modal agendaria uma gravação do texto que ele mesmo acabou de mandar —
    // ruído no autosave e, com o sync ligado, um ciclo extra à toa
    const vistos: string[] = []
    await render('<p>antes</p>', (h) => vistos.push(h))
    await render('<p>depois</p>', (h) => vistos.push(h))
    expect(vistos).toEqual([])
  })

  it('value vazio limpa o editor', async () => {
    await render('<p>tinha coisa</p>')
    await render('')
    expect(textoNaTela().trim()).toBe('')
  })
})
