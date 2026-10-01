import { criarFakeFs } from './fakeFs'
import type { PortasOrganizar } from '../lib/organizarImagens/tipos'

/**
 * Cofre de teste do "Organizar imagens": uma amostra de cada jeito que o app guarda imagem hoje,
 * com os nomes-código de verdade (`retrato-<id>-<ver>`, `galeria-<uuid>`, id do tldraw, id de nota).
 *
 * Fake em caixa INSENSÍVEL, como o NTFS onde o cofre mora: colisão `Gandalf`/`gandalf` e troca só
 * de caixa só aparecem assim.
 */
export const RAIZ = 'C:/cofre'

export type FakeFs = ReturnType<typeof criarFakeFs>

export async function gravarImagem(fs: FakeFs, rel: string, conteudo: string): Promise<void> {
  await fs.writeBinaryBase64(`${RAIZ}/${rel}`, btoa(conteudo))
}

export async function gravarJson(fs: FakeFs, rel: string, obj: unknown): Promise<void> {
  await fs.writeTextAtomic(`${RAIZ}/${rel}`, JSON.stringify(obj, null, 2))
}

/** O JSON como está no disco. Quem lê abre com `objeto`/`lista` ou confere com `toHaveProperty`. */
export async function lerJson(fs: FakeFs, rel: string): Promise<unknown> {
  return JSON.parse(await fs.readText(`${RAIZ}/${rel}`))
}

/** Abre um valor lido do disco como objeto, ou derruba o teste dizendo o que veio no lugar. */
export function objeto(valor: unknown, onde = 'valor'): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new Error(`${onde}: esperava objeto, veio ${JSON.stringify(valor)}`)
  }
  return Object.fromEntries(Object.entries(valor))
}

/** Abre um valor lido do disco como lista, ou derruba o teste dizendo o que veio no lugar. */
export function lista(valor: unknown, onde = 'valor'): unknown[] {
  if (!Array.isArray(valor)) throw new Error(`${onde}: esperava lista, veio ${JSON.stringify(valor)}`)
  return [...valor]
}

export function portasDe(fs: FakeFs): PortasOrganizar {
  return { fs, hash: (p) => fs.sha256(p) }
}

function versaoPersonagem(id: string, nome: string, retrato: string | null, imagens: string[] = [], descricao = '') {
  return {
    id, nome, retrato, resumo: '', descricao, informacao: '', historia: '', extras: '', anotacoes: '',
    imagens: imagens.map((rel) => ({ rel })), acervo: [],
  }
}

export function personagem(id: string, versoes: ReturnType<typeof versaoPersonagem>[], ativa: string) {
  const ativaV = versoes.find((v) => v.id === ativa) ?? versoes[0]
  return { id, nome: ativaV.nome, versoes, versaoAtivaId: ativa, criadoEm: '', modificadoEm: '' }
}
export { versaoPersonagem }

export function cenario(id: string, nome: string, retrato: string | null) {
  return {
    id, nome, personagens: [], versaoAtivaId: 'v1', criadoEm: '', modificadoEm: '',
    versoes: [{
      id: 'v1', nome: 'Base', retrato, resumo: '', descricao: '', informacao: '', historia: '',
      eventos: '', itens: '', acervo: [], anotacoes: '', imagens: [],
    }],
  }
}

export function item(id: string, nome: string, retrato: string | null) {
  return { id, nome, resumo: '', retrato, descricao: '', informacao: '', efeito: '', criadoEm: '', modificadoEm: '' }
}

export interface AssetDeTeste { id: string; rel: string; name: string; nomeOriginal?: string }

/** Documento tldraw mínimo com assets de imagem, no formato que `getSnapshot` grava. */
export function mapa(id: string, nome: string, assets: AssetDeTeste[], extraStore: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...extraStore }
  for (const a of assets) {
    store[`asset:${a.id}`] = {
      id: `asset:${a.id}`, typeName: 'asset', type: 'image',
      props: { name: a.name, src: `http://asset.localhost/${a.rel}`, w: 10, h: 10, isAnimated: false, mimeType: 'image/png' },
      meta: a.nomeOriginal === undefined ? { rel: a.rel } : { rel: a.rel, nomeOriginal: a.nomeOriginal },
    }
  }
  return { id, nome, documento: { document: { store, schema: {} }, session: {} }, camadas: [], criadoEm: '', modificadoEm: '' }
}

export function pagina(id: string, titulo: string, corpo: string) {
  return { id, titulo, paiId: null, ordem: 0, corpo, criadoEm: '', modificadoEm: '' }
}

/**
 * O cofre-amostra do plano: personagem com 2 versões e galeria (com uma CÓPIA do próprio retrato —
 * duplicata do mesmo dono), cenário com subcenário, item, mapa com 3 imagens (nome original, nome
 * genérico de clipboard, nome do arquivo), nota com uma imagem própria e uma cópia byte a byte de
 * uma imagem do mapa (duplicata entre donos diferentes), referência quebrada e imagem órfã.
 */
export async function montarCofreAmostra(): Promise<FakeFs> {
  const fs = criarFakeFs({ caixa: 'insensivel' })
  await gravarImagem(fs, 'personagens-soltos/assets/retrato-p1-v1.png', 'cinzento')
  await gravarImagem(fs, 'personagens-soltos/assets/retrato-p1-v2.png', 'branco')
  await gravarImagem(fs, 'personagens-soltos/assets/galeria-aaa.png', 'galeria 1')
  await gravarImagem(fs, 'personagens-soltos/assets/galeria-bbb.jpg', 'galeria 2')
  await gravarImagem(fs, 'personagens-soltos/assets/galeria-ccc.png', 'cinzento')
  await gravarJson(fs, 'personagens-soltos/gandalf.json', personagem('p1', [
    versaoPersonagem('v1', 'Gandalf, o Cinzento', 'personagens-soltos/assets/retrato-p1-v1.png', [
      'personagens-soltos/assets/galeria-aaa.png',
      'personagens-soltos/assets/galeria-bbb.jpg',
      'personagens-soltos/assets/galeria-ccc.png',
    ]),
    versaoPersonagem('v2', 'Gandalf, o Branco', 'personagens-soltos/assets/retrato-p1-v2.png'),
  ], 'v1'))

  await gravarImagem(fs, 'imagens-cenarios/retrato-c1-v1.png', 'reino')
  await gravarImagem(fs, 'imagens-cenarios/retrato-c2-v1.png', 'cidade')
  await gravarJson(fs, 'cenarios/reino/cenario.json', cenario('c1', 'Reino', 'imagens-cenarios/retrato-c1-v1.png'))
  await gravarJson(fs, 'cenarios/reino/cidade-alta/cenario.json', cenario('c2', 'Cidade Alta', 'imagens-cenarios/retrato-c2-v1.png'))

  await gravarImagem(fs, 'imagens-itens/retrato-i1.png', 'espada')
  await gravarJson(fs, 'itens/espada.json', item('i1', 'Espada Élfica', 'imagens-itens/retrato-i1.png'))
  await gravarJson(fs, 'itens/escudo.json', item('i2', 'Escudo', 'imagens-itens/sumiu.png'))

  await gravarImagem(fs, 'imagens-canvas/A1.png', 'porta')
  await gravarImagem(fs, 'imagens-canvas/A2.png', 'colado')
  await gravarImagem(fs, 'imagens-canvas/A3.png', 'altar')
  await gravarJson(fs, 'mapas-soltos/masmorra.json', mapa('m1', 'Masmorra', [
    { id: 'a1', rel: 'imagens-canvas/A1.png', name: 'x.png', nomeOriginal: 'porta secreta.png' },
    { id: 'a2', rel: 'imagens-canvas/A2.png', name: 'image.png' },
    { id: 'a3', rel: 'imagens-canvas/A3.png', name: 'Altar.png' },
  ]))

  await gravarImagem(fs, 'imagens-notas/0123456789abcdef.png', 'nota')
  await gravarImagem(fs, 'imagens-notas/dup.png', 'altar')
  await gravarJson(fs, 'mapas-soltos/masmorra.notas/sessao-1.json', pagina('n1', 'Sessão 1',
    '<p>a</p><img data-rel="imagens-notas/0123456789abcdef.png" data-largura="50"><img data-rel="imagens-notas/dup.png">'))

  await gravarImagem(fs, 'imagens-canvas/orfa.png', 'ninguém me cita')
  return fs
}
