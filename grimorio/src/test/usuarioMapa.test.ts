// @vitest-environment jsdom
// jsdom porque `setUserPreferences` do tldraw grava em localStorage.
import { describe, it, expect, beforeEach } from 'vitest'
import { getUserPreferences, setUserPreferences } from 'tldraw'
import { criarUsuarioDoMapa } from '../lib/usuarioMapa'

describe('usuário do mapa (snap sempre ligado, sem vazar pro resto do app)', () => {
  beforeEach(() => {
    setUserPreferences({ ...getUserPreferences(), isSnapMode: false, colorScheme: 'light' })
  })

  it('liga o snap só para o mapa; as preferências globais continuam com ele desligado', () => {
    const usuario = criarUsuarioDoMapa()

    expect(usuario.userPreferences.get().isSnapMode).toBe(true)
    expect(getUserPreferences().isSnapMode).toBe(false)
  })

  it('gravar pelo mapa não carimba o snap nas preferências globais', () => {
    const usuario = criarUsuarioDoMapa()

    // é o que `editor.user.updateUserPreferences({ colorScheme: 'dark' })` faz por baixo:
    // parte do valor corrente (já com a sobreposição) e grava o objeto inteiro.
    usuario.setUserPreferences({ ...usuario.userPreferences.get(), colorScheme: 'dark' })

    expect(getUserPreferences().colorScheme).toBe('dark')
    expect(getUserPreferences().isSnapMode).toBe(false)
  })

  it('preserva o snap global quando o usuário mesmo o tinha ligado', () => {
    setUserPreferences({ ...getUserPreferences(), isSnapMode: true })
    const usuario = criarUsuarioDoMapa()

    usuario.setUserPreferences({ ...usuario.userPreferences.get(), colorScheme: 'dark' })

    expect(getUserPreferences().isSnapMode).toBe(true)
  })

  it('continua reativo ao resto das preferências globais', () => {
    const usuario = criarUsuarioDoMapa()
    expect(usuario.userPreferences.get().colorScheme).toBe('light')

    setUserPreferences({ ...getUserPreferences(), colorScheme: 'dark' })

    expect(usuario.userPreferences.get().colorScheme).toBe('dark')
    expect(usuario.userPreferences.get().isSnapMode).toBe(true)
  })
})
