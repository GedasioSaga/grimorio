// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { HostDialogos, pedirTexto, useDialogo } from '../components/dialogos'

let container: HTMLDivElement
let root: Root

async function montar() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<HostDialogos />) })
}

/** Input controlado: mexer em .value direto não avisa o React — o setter nativo + evento avisa. */
async function digitar(texto: string) {
  const setar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setar.call(campo(), texto)
    campo().dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const chip = () => container.querySelector('.dialogo-sugestao') as HTMLButtonElement | null
const campo = () => container.querySelector('.dialogo-input') as HTMLInputElement
const ok = () => container.querySelector('.dialogo-ok') as HTMLButtonElement

afterEach(async () => {
  if (useDialogo.getState().pedido) useDialogo.getState().responder(null)
  await act(async () => { root.unmount() })
  container.remove()
})

describe('HostDialogos — chip de sugestão', () => {
  it('clicar no chip preenche o campo, e o nome final sai com o prefixo', async () => {
    await montar()
    let resolvido: string | null = null
    await act(async () => {
      void pedirTexto('Nome do sub-cenário:', '', 'OK', 'Reino de Goa: ').then((v) => { resolvido = v })
    })

    expect(chip()?.textContent).toContain('Reino de Goa:')
    await act(async () => { chip()!.click() })
    expect(campo().value).toBe('Reino de Goa: ')
    // cumpriu o papel: some pra não atrapalhar quem quer outro nome
    expect(chip()).toBeNull()

    await digitar('Reino de Goa: Cozinha')
    await act(async () => { ok().click() })
    expect(resolvido).toBe('Reino de Goa: Cozinha')
  })

  it('digitar sem clicar no chip faz ele sumir e o nome sai solto', async () => {
    await montar()
    let resolvido: string | null = null
    await act(async () => {
      void pedirTexto('Nome do sub-cenário:', '', 'OK', 'Reino de Goa: ').then((v) => { resolvido = v })
    })

    await digitar('Masmorra')
    expect(chip()).toBeNull()
    await act(async () => { ok().click() })
    expect(resolvido).toBe('Masmorra')
  })

  it('sem sugestão o chip não aparece (os outros diálogos não mudam)', async () => {
    await montar()
    await act(async () => { void pedirTexto('Nome da pasta:') })
    expect(campo()).toBeTruthy()
    expect(chip()).toBeNull()
  })
})
