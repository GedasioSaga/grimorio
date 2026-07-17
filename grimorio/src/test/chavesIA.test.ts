// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { garantirChaves, lerChaves, parsearChaves, salvarChaves } from '../lib/chavesIA'

beforeEach(() => {
  localStorage.clear()
})

describe('parsearChaves', () => {
  it('separa por vírgula e apara espaços', () => {
    expect(parsearChaves(' k1 , k2,k3 ')).toEqual(['k1', 'k2', 'k3'])
  })
  it('vazio/null/undefined → []', () => {
    expect(parsearChaves(undefined)).toEqual([])
    expect(parsearChaves(null)).toEqual([])
    expect(parsearChaves(' , ,')).toEqual([])
  })
})

describe('salvarChaves / lerChaves', () => {
  it('grava normalizado e relê', () => {
    salvarChaves(' k1 , k2 ')
    expect(lerChaves()).toEqual(['k1', 'k2'])
  })
  it('nada salvo → []', () => {
    expect(lerChaves()).toEqual([])
  })
  it('salvar só espaços apaga o que estava guardado', () => {
    salvarChaves('k1')
    salvarChaves('  ')
    expect(lerChaves()).toEqual([])
  })
})

describe('garantirChaves', () => {
  it('já salvas → devolve sem incomodar o usuário', async () => {
    salvarChaves('k1,k2')
    const pedir = vi.fn()
    expect(await garantirChaves(pedir)).toEqual(['k1', 'k2'])
    expect(pedir).not.toHaveBeenCalled()
  })

  it('nada salvo → pede, persiste e devolve (não pergunta de novo)', async () => {
    const pedir = vi.fn().mockResolvedValue('k9, k8')
    expect(await garantirChaves(pedir)).toEqual(['k9', 'k8'])
    expect(pedir).toHaveBeenCalledTimes(1)
    expect(lerChaves()).toEqual(['k9', 'k8'])
  })

  it('usuário cancela → [] e nada fica salvo', async () => {
    const pedir = vi.fn().mockResolvedValue(null)
    expect(await garantirChaves(pedir)).toEqual([])
    expect(lerChaves()).toEqual([])
  })
})
