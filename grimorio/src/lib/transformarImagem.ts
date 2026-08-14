import type { Cenario, Personagem, VaultTree, VersaoCenario, VersaoPersonagem } from './types'
import { comNomeEspelho, versaoAtivaPersonagem } from './personagemVersao'
import { versaoAtiva } from './cenarioVersao'

export type TipoTransformacao = 'personagem' | 'cenario' | 'item'

export const ROTULO_TIPO: Record<TipoTransformacao, string> = {
  personagem: 'Personagem',
  cenario: 'Cenário',
  item: 'Item',
}

/** Opção de pasta destino no diálogo de transformação (nivel = recuo visual). */
export interface OpcaoPasta {
  nome: string
  caminho: string
  nivel: number
}

type NoDePasta = { nome: string; caminho: string; subpastas: NoDePasta[] }

function achatar(no: NoDePasta, nivel: number, saida: OpcaoPasta[]): void {
  saida.push({ nome: no.nome, caminho: no.caminho, nivel })
  for (const sub of no.subpastas) achatar(sub, nivel + 1, saida)
}

/** Pastas da seção do tipo, raiz primeiro, em pré-ordem com nível de recuo. */
export function pastasDaSecao(tree: VaultTree | null, tipo: TipoTransformacao): OpcaoPasta[] {
  if (!tree) return []
  const raiz: NoDePasta =
    tipo === 'personagem' ? tree.personagensSoltos : tipo === 'cenario' ? tree.cenarios : tree.itens
  const saida: OpcaoPasta[] = []
  achatar(raiz, 0, saida)
  return saida
}

/** Sugestão de nome de entidade a partir do nome do arquivo da imagem (sem extensão). */
export function sugestaoDeNome(nomeArquivo: string): string {
  return nomeArquivo.trim().replace(/\.[a-z0-9]+$/i, '').trim()
}

/** Extensão do arquivo em minúsculas; png quando não dá para deduzir. */
export function extensaoDe(rel: string): string {
  return rel.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? 'png'
}

/** Diretório da entidade a partir do caminho do seu JSON (ou o próprio caminho, se já for dir). */
export function dirDoCaminho(caminho: string): string {
  return caminho.replace(/[\\/][^\\/]+\.json$/i, '')
}

/**
 * Destino do retrato no cofre, seguindo o padrão que cada entidade já usa:
 * personagem em assets/ da própria pasta; cenário e item nas pastas globais de imagem.
 */
export function destinoRetrato(
  tipo: TipoTransformacao,
  ent: { id: string; caminho: string; versaoAtivaId?: string },
  ext: string,
): string {
  if (tipo === 'personagem') {
    return `${dirDoCaminho(ent.caminho)}/assets/retrato-${ent.id}-${ent.versaoAtivaId}.${ext}`
  }
  if (tipo === 'cenario') return `imagens-cenarios/retrato-${ent.id}-${ent.versaoAtivaId}.${ext}`
  return `imagens-itens/retrato-${ent.id}.${ext}`
}

/**
 * Nova versão (transformação) de um PERSONAGEM já existente: clona a versão ativa com
 * nome e retrato novos, e a torna ativa. Espelha `adicionarVersaoPersonagem` do store
 * (mesmo padrão de clone), mas o retrato já nasce setado — o fluxo de "transformar
 * imagem" não tem um segundo passo para preenchê-lo depois. Pura: não lê/grava disco.
 */
export function novaVersaoPersonagemComRetrato(p: Personagem, nomeVersao: string, retrato: string): Personagem {
  const base = versaoAtivaPersonagem(p)
  const nova: VersaoPersonagem = {
    ...base,
    id: crypto.randomUUID(),
    nome: nomeVersao,
    retrato,
    imagens: base.imagens.map((i) => ({ ...i })), // cópia por valor: a versão nova não deve arrastar a lista da base
  }
  return comNomeEspelho({ ...p, versoes: [...p.versoes, nova], versaoAtivaId: nova.id })
}

/**
 * Como `novaVersaoPersonagemComRetrato`, para CENÁRIO — sem espelho de nome no topo:
 * versão de cenário tem nome próprio (ex. "Noite"), não é a mesma forma que o personagem.
 */
export function novaVersaoCenarioComRetrato(c: Cenario, nomeVersao: string, retrato: string): Cenario {
  const base = versaoAtiva(c)
  const nova: VersaoCenario = {
    ...base,
    id: crypto.randomUUID(),
    nome: nomeVersao,
    retrato,
    imagens: base.imagens.map((i) => ({ ...i })),
  }
  return { ...c, versoes: [...c.versoes, nova], versaoAtivaId: nova.id }
}
