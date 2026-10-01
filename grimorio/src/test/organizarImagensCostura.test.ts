import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A costura do "Organizar imagens" com o app (`state/organizarImagens.ts`), com o disco, o hash e a
 * pasta de configuração do Tauri trocados pelo cofre fake. O que se prova aqui é o que a costura faz
 * com as falhas que vêm DEPOIS do motor ter mexido no disco:
 * - reler o cofre falhando não pode sumir no console — com o cache velho, o próximo autosave
 *   gravaria os endereços antigos por cima das fichas reescritas;
 * - a organização é anotada como a última do cofre ANTES de mexer nele: se o app cair no meio, o
 *   botão de desfazer ainda a acha;
 * - organização (ou volta) pela metade não pode ser atropelada por outra organização — mas também
 *   não pode virar beco: quem não consegue (ou não quer) terminar a volta mantém o cofre como está.
 */
vi.mock('@tauri-apps/api/path', () => ({ appConfigDir: vi.fn(async () => 'C:/appdata') }))
vi.mock('../lib/fsBridge', async () => {
  const { criarFakeFs } = await import('./fakeFs')
  return { tauriFs: criarFakeFs({ caixa: 'insensivel' }) }
})
vi.mock('../lib/hashBridge', async () => {
  const { tauriFs } = await import('../lib/fsBridge')
  const { sha256Texto } = await import('../lib/organizarImagens/impressao')
  // qualquer hash determinístico serve: planejador, executor e diário usam todos este mesmo
  return { hashArquivo: async (p: string) => sha256Texto(await tauriFs.readText(p)), hashTexto: vi.fn() }
})

import {
  abandonarUltimaOrganizacao, aplicarOrganizacao, desfazerUltimaOrganizacao, preverOrganizacao, situacaoDoDesfazer,
} from '../state/organizarImagens'
import { ErroOrganizar } from '../lib/organizarImagens/executar'
import { tauriFs, type FsBridge } from '../lib/fsBridge'
import { useApp } from '../state/store'
import { objeto } from './cofreImagens'

const RAIZ = 'C:/cofre'
const FICHA = `${RAIZ}/itens/anel.json`
/** Os métodos de verdade do fake: cada teste troca alguns, e `destravar` põe todos de volta. */
const fsOriginal: FsBridge = { ...tauriFs }

function destravar(): void {
  Object.assign(tauriFs, fsOriginal)
}

/** O código da recusa, ou o que veio no lugar — para a asserção dizer o que aconteceu. */
function codigoDe(e: unknown): string {
  return e instanceof ErroOrganizar ? e.codigo : `não recusou: ${JSON.stringify(e)}`
}

/** A 1ª remoção de original falha — quando a ficha já aponta para o endereço novo. */
function recusarPrimeiraRemocao(): void {
  let recusou = false
  tauriFs.removePath = async (caminho) => {
    if (!recusou && caminho.startsWith(`${RAIZ}/`)) {
      recusou = true
      throw new Error('EPERM: sem permissão')
    }
    return fsOriginal.removePath(caminho)
  }
}

/** A ficha do anel travada para gravação: falha a cópia que cai nela (direto ou no temporário ao lado) e o rename para ela. */
function travarFicha(): void {
  tauriFs.copyFile = async (de, para) => {
    if (para.startsWith(FICHA)) throw new Error('EBUSY: arquivo em uso')
    return fsOriginal.copyFile(de, para)
  }
  tauriFs.rename = async (de, para) => {
    if (para === FICHA) throw new Error('EBUSY: arquivo em uso')
    return fsOriginal.rename(de, para)
  }
}

/**
 * Organiza e o app cai logo depois de reescrever a ficha: dali em diante nada mais chega ao disco,
 * nem a volta automática. Termina com o fake destravado, como o app aberto de novo.
 */
async function organizarECairDepoisDaFicha(): Promise<void> {
  const plano = await preverOrganizacao(RAIZ)
  let caiu = false
  const vivo = () => {
    if (caiu) throw new Error('o app caiu')
  }
  tauriFs.readText = async (p) => { vivo(); return fsOriginal.readText(p) }
  tauriFs.writeTextAtomic = async (p, conteudo) => {
    vivo()
    await fsOriginal.writeTextAtomic(p, conteudo)
    if (p === FICHA) {
      caiu = true
      throw new Error('o app caiu')
    }
  }
  tauriFs.copyFile = async (de, para) => { vivo(); return fsOriginal.copyFile(de, para) }
  tauriFs.rename = async (de, para) => { vivo(); return fsOriginal.rename(de, para) }
  tauriFs.removePath = async (p) => { vivo(); return fsOriginal.removePath(p) }
  tauriFs.exists = async (p) => { vivo(); return fsOriginal.exists(p) }
  tauriFs.listDir = async (p) => { vivo(); return fsOriginal.listDir(p) }
  tauriFs.mkdirAll = async (p) => { vivo(); return fsOriginal.mkdirAll(p) }
  await aplicarOrganizacao(RAIZ, plano).catch(() => undefined)
  expect(caiu).toBe(true)
  destravar() // o app abriu de novo
}

beforeEach(async () => {
  await tauriFs.removePath(RAIZ)
  await tauriFs.removePath('C:/appdata')
  await tauriFs.writeBinaryBase64(`${RAIZ}/imagens-itens/retrato-i1.png`, btoa('anel'))
  await tauriFs.writeTextAtomic(FICHA, JSON.stringify({ id: 'i1', nome: 'Anel', retrato: 'imagens-itens/retrato-i1.png', efeito: '' }, null, 2))
  useApp.setState({ descarregarFilas: async () => [], recarregarDoDisco: async () => undefined })
})

afterEach(() => {
  destravar()
})

describe('costura — falhas depois de mexer no disco', () => {
  it('organizou, mas reler o cofre falhou: o resultado AVISA (e manda reabrir o cofre)', async () => {
    useApp.setState({ recarregarDoDisco: async () => { throw new Error('disco ocupado') } })
    const plano = await preverOrganizacao(RAIZ)
    const r = await aplicarOrganizacao(RAIZ, plano)
    expect(r.movidos).toBe(1)
    expect(r.avisos.join(' ')).toContain('disco ocupado')
    expect(r.avisos.join(' ')).toContain('abra o cofre de novo')
  })

  it('não deu para anotar o desfazer antes de começar: nada no cofre muda e o erro diz por quê', async () => {
    tauriFs.writeTextAtomic = async (caminho, conteudo) => {
      if (caminho.endsWith('/ultimas.json')) throw new Error('sem permissão')
      return fsOriginal.writeTextAtomic(caminho, conteudo)
    }
    const fichaAntes = await tauriFs.readText(FICHA)
    const plano = await preverOrganizacao(RAIZ)
    const erro = await aplicarOrganizacao(RAIZ, plano).catch((e: unknown) => e)
    expect(codigoDe(erro)).toBe('diario')
    expect(String(erro)).toContain('sem permissão')
    expect(await tauriFs.readText(FICHA)).toBe(fichaAntes)
    expect(await tauriFs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)
    expect(await tauriFs.exists(`${RAIZ}/imagens/itens/Anel.png`)).toBe(false)
  })

  it('desfez, mas reler o cofre falhou: o resultado avisa', async () => {
    const plano = await preverOrganizacao(RAIZ)
    await aplicarOrganizacao(RAIZ, plano)
    useApp.setState({ recarregarDoDisco: async () => { throw new Error('disco ocupado') } })
    const r = await desfazerUltimaOrganizacao(RAIZ)
    expect(r.problemas).toEqual([])
    expect(r.avisos.join(' ')).toContain('disco ocupado')
    expect(await tauriFs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)
  })

  it('a organização falhou e a volta parou no meio: o botão de desfazer aparece para terminar a volta', async () => {
    const plano = await preverOrganizacao(RAIZ)
    recusarPrimeiraRemocao()
    travarFicha() // ...e a volta não consegue devolver a ficha
    const erro = await aplicarOrganizacao(RAIZ, plano).catch((e: unknown) => e)
    expect(codigoDe(erro)).toBe('volta-incompleta')
    expect(await situacaoDoDesfazer(RAIZ)).toBe('pendente')

    destravar()
    const r = await desfazerUltimaOrganizacao(RAIZ)
    expect(r.completo).toBe(true)
    expect(r.problemas).toEqual([])
    expect(await tauriFs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)
    expect(await tauriFs.exists(`${RAIZ}/imagens/itens/Anel.png`)).toBe(false)
    expect(await situacaoDoDesfazer(RAIZ)).toBe('nada')
  })

  it('com a volta pela metade, organizar de novo é recusado sem mexer no cofre, e o desfazer pendente não some', async () => {
    const plano = await preverOrganizacao(RAIZ)
    recusarPrimeiraRemocao()
    travarFicha()
    expect(codigoDe(await aplicarOrganizacao(RAIZ, plano).catch((e: unknown) => e))).toBe('volta-incompleta')
    destravar()

    const outro = await preverOrganizacao(RAIZ)
    const fichaAntes = await tauriFs.readText(FICHA)
    const recusa = await aplicarOrganizacao(RAIZ, outro).catch((e: unknown) => e)
    expect(codigoDe(recusa)).toBe('pendente')
    expect(String(recusa)).toContain('Desfazer última organização')
    expect(await tauriFs.readText(FICHA)).toBe(fichaAntes)
    expect(await tauriFs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)
    expect(await tauriFs.exists(`${RAIZ}/imagens/itens/Anel.png`)).toBe(true)

    // o desfazer ainda é o da organização que parou no meio, e termina a volta dela
    const r = await desfazerUltimaOrganizacao(RAIZ)
    expect(r).toMatchObject({ completo: true, problemas: [] })
    expect(JSON.parse(await tauriFs.readText(FICHA))).toHaveProperty('retrato', 'imagens-itens/retrato-i1.png')
    expect(await tauriFs.exists(`${RAIZ}/imagens/itens/Anel.png`)).toBe(false)
  })

  it('o app caiu no meio de organizar: ao abrir de novo, o desfazer acha a organização e devolve o cofre', async () => {
    await organizarECairDepoisDaFicha()

    expect(await situacaoDoDesfazer(RAIZ)).toBe('pendente')
    const r = await desfazerUltimaOrganizacao(RAIZ)
    expect(r).toMatchObject({ completo: true, problemas: [] })
    expect(JSON.parse(await tauriFs.readText(FICHA))).toHaveProperty('retrato', 'imagens-itens/retrato-i1.png')
    expect(await tauriFs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)
    expect(await tauriFs.exists(`${RAIZ}/imagens/itens/Anel.png`)).toBe(false)
  })

  it('uma organização nova que falhou e voltou inteira não tira o desfazer da anterior', async () => {
    await aplicarOrganizacao(RAIZ, await preverOrganizacao(RAIZ)) // a do anel
    await tauriFs.writeBinaryBase64(`${RAIZ}/imagens-itens/retrato-i2.png`, btoa('elmo'))
    await tauriFs.writeTextAtomic(`${RAIZ}/itens/elmo.json`, JSON.stringify({ id: 'i2', nome: 'Elmo', retrato: 'imagens-itens/retrato-i2.png', efeito: '' }, null, 2))
    const doElmo = await preverOrganizacao(RAIZ)
    tauriFs.copyFile = async (de, para) => {
      if (para.startsWith(`${RAIZ}/imagens/`)) throw new Error('ENOSPC: disco cheio')
      return fsOriginal.copyFile(de, para)
    }
    expect(codigoDe(await aplicarOrganizacao(RAIZ, doElmo).catch((e: unknown) => e))).toBe('falhou')
    destravar()

    // o botão continua desfazendo a do anel
    expect(await situacaoDoDesfazer(RAIZ)).toBe('desfazivel')
    const r = await desfazerUltimaOrganizacao(RAIZ)
    expect(r).toMatchObject({ completo: true, problemas: [] })
    expect(await tauriFs.exists(`${RAIZ}/imagens-itens/retrato-i1.png`)).toBe(true)
    expect(await tauriFs.exists(`${RAIZ}/imagens/itens/Anel.png`)).toBe(false)
  })

  it('tudo certo: nenhum aviso', async () => {
    const plano = await preverOrganizacao(RAIZ)
    const r = await aplicarOrganizacao(RAIZ, plano)
    expect(r.avisos).toEqual([])
  })
})

describe('costura — manter o cofre como está', () => {
  it('caiu no meio e a ficha foi editada ao abrir de novo: manter o cofre como está destrava o Organizar sem mexer no cofre', async () => {
    await organizarECairDepoisDaFicha()
    // o app abriu de novo e o usuário editou a ficha que a organização já tinha reescrito
    const ficha = objeto(JSON.parse(await tauriFs.readText(FICHA)), 'anel.json')
    await tauriFs.writeTextAtomic(FICHA, JSON.stringify({ ...ficha, efeito: 'brilha no escuro' }, null, 2))
    // o beco: desfazer apagaria a edição, e organizar por cima esqueceria a volta pendente
    expect(codigoDe(await desfazerUltimaOrganizacao(RAIZ).catch((e: unknown) => e))).toBe('mudou-depois')
    expect(codigoDe(await aplicarOrganizacao(RAIZ, await preverOrganizacao(RAIZ)).catch((e: unknown) => e))).toBe('pendente')

    const fichaAntes = await tauriFs.readText(FICHA)
    await abandonarUltimaOrganizacao(RAIZ)
    expect(await tauriFs.readText(FICHA)).toBe(fichaAntes)
    expect(await situacaoDoDesfazer(RAIZ)).toBe('nada')

    // organizar volta a valer, e a edição continua lá, citando uma imagem que existe
    const r = await aplicarOrganizacao(RAIZ, await preverOrganizacao(RAIZ))
    expect(r.fase).toBe('concluido')
    const depois = objeto(JSON.parse(await tauriFs.readText(FICHA)), 'anel.json')
    expect(depois.efeito).toBe('brilha no escuro')
    expect(typeof depois.retrato).toBe('string')
    expect(await tauriFs.exists(`${RAIZ}/${String(depois.retrato)}`)).toBe(true)
  })

  it('sem organização registrada neste cofre, não há o que manter', async () => {
    expect(codigoDe(await abandonarUltimaOrganizacao(RAIZ).catch((e: unknown) => e))).toBe('nada-pendente')
  })
})
