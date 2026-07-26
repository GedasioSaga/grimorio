// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { chaveDeCofre, listar, migrarDoLegado, migrarFiltroLegado, nomePadrao, normalizarCaminho, registrar, remover, renomear } from '../lib/cofres'

beforeEach(() => {
  localStorage.clear()
})

describe('normalização e chaves', () => {
  it('normalizarCaminho troca \\ por /', () => {
    expect(normalizarCaminho('C:\\Users\\x\\RPG')).toBe('C:/Users/x/RPG')
  })
  it('nomePadrao usa o último segmento', () => {
    expect(nomePadrao('C:\\Users\\x\\RPG')).toBe('RPG')
    expect(nomePadrao('C:/Users/x/RPG/')).toBe('RPG')
  })
  it('chaveDeCofre normaliza antes de compor', () => {
    expect(chaveDeCofre('grimorio.campanhaFiltro', 'C:\\x\\RPG')).toBe('grimorio.campanhaFiltro.C:/x/RPG')
  })
})

describe('registro', () => {
  it('registrar insere com nome padrão e ordena o mais recente primeiro', () => {
    registrar('C:/a/Alfa', 1000)
    registrar('C:/b/Beta', 2000)
    expect(listar().map((c) => c.nome)).toEqual(['Beta', 'Alfa'])
  })
  it('registrar o mesmo cofre atualiza o acesso sem duplicar', () => {
    registrar('C:/a/Alfa', 1000)
    registrar('C:/b/Beta', 2000)
    registrar('C:\\a\\Alfa', 3000)
    expect(listar()).toHaveLength(2)
    expect(listar()[0].caminho).toBe('C:/a/Alfa')
  })
  it('registrar preserva o rótulo já renomeado', () => {
    registrar('C:/a/Alfa', 1000)
    renomear('C:/a/Alfa', 'Mesa de Terça')
    registrar('C:/a/Alfa', 2000)
    expect(listar()[0].nome).toBe('Mesa de Terça')
  })
  it('remover tira da lista', () => {
    registrar('C:/a/Alfa', 1000)
    registrar('C:/b/Beta', 2000)
    expect(remover('C:/a/Alfa')).toHaveLength(1)
    expect(listar()[0].caminho).toBe('C:/b/Beta')
  })
  it('listar devolve [] quando o JSON está corrompido', () => {
    localStorage.setItem('grimorio.cofres', '{isso não é json')
    expect(listar()).toEqual([])
  })
  it('listar descarta entradas com formato inválido', () => {
    localStorage.setItem('grimorio.cofres', JSON.stringify([{ caminho: 'C:/a', nome: 'A', ultimoAcesso: 1 }, { lixo: true }]))
    expect(listar()).toHaveLength(1)
  })
})

describe('migrações', () => {
  it('migrarDoLegado semeia a partir de grimorio.vault e é idempotente', () => {
    localStorage.setItem('grimorio.vault', 'C:\\a\\Alfa')
    migrarDoLegado()
    expect(listar()[0].caminho).toBe('C:/a/Alfa')
    remover('C:/a/Alfa')
    migrarDoLegado()
    expect(listar()).toEqual([])
  })
  it('migrarDoLegado não faz nada sem cofre antigo', () => {
    migrarDoLegado()
    expect(listar()).toEqual([])
  })
  it('migrarFiltroLegado move o filtro global para a chave do cofre', () => {
    localStorage.setItem('grimorio.vault', 'C:\\a\\Alfa')
    localStorage.setItem('grimorio.campanhaFiltro', 'camp-1')
    migrarFiltroLegado()
    expect(localStorage.getItem('grimorio.campanhaFiltro')).toBeNull()
    expect(localStorage.getItem('grimorio.campanhaFiltro.C:/a/Alfa')).toBe('camp-1')
  })
  it('migrarFiltroLegado apaga o filtro global mesmo sem cofre antigo', () => {
    localStorage.setItem('grimorio.campanhaFiltro', 'camp-1')
    migrarFiltroLegado()
    expect(localStorage.getItem('grimorio.campanhaFiltro')).toBeNull()
  })
})
