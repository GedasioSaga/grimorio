import type { Cenario, Personagem, VaultTree, VersaoCenario, VersaoPersonagem } from './types'
import { comNomeEspelho, versaoAtivaPersonagem } from './personagemVersao'
import { versaoAtiva } from './cenarioVersao'
import type { DonoImagem } from './organizarImagens/nomes'

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

/** O que importa da imagem para posicionar o card que a substitui. `x`/`y` são no espaço do PAI. */
export interface LugarDaImagem<P extends string = string> {
  parentId: P
  x: number
  y: number
  rotation: number
  props: { w: number; h: number }
}

/**
 * Onde nasce o card que substitui a imagem: dentro do mesmo pai e com o mesmo centro.
 *
 * `x`/`y` de um shape do tldraw são relativos ao PAI. Dentro de um Frame, criar o card sem o
 * `parentId` da imagem jogava essas coordenadas locais direto na página, e o card aparecia em
 * outro ponto do canvas — tanto mais longe quanto mais longe da origem o Frame estivesse.
 *
 * O centro leva a rotação em conta porque o tldraw gira o shape em volta de `x`/`y` (o canto de
 * cima-esquerda), não do meio. O card nasce reto, centrado onde a imagem aparecia.
 */
export function lugarDoCardNaImagem<P extends string>(
  imagem: LugarDaImagem<P>,
  card: { w: number; h: number },
): { parentId: P; x: number; y: number } {
  const cos = Math.cos(imagem.rotation)
  const sin = Math.sin(imagem.rotation)
  const meioW = imagem.props.w / 2
  const meioH = imagem.props.h / 2
  const centroX = imagem.x + meioW * cos - meioH * sin
  const centroY = imagem.y + meioW * sin + meioH * cos
  return { parentId: imagem.parentId, x: centroX - card.w / 2, y: centroY - card.h / 2 }
}

/** Diretório da entidade a partir do caminho do seu JSON (ou o próprio caminho, se já for dir). */
export function dirDoCaminho(caminho: string): string {
  return caminho.replace(/[\\/][^\\/]+\.json$/i, '')
}

/**
 * De quem é o retrato, para `reservarDestino` escolher o endereço legível
 * (`imagens/personagens/<Nome>/retrato.png`, `imagens/cenarios/<Pai>/<Filho>/retrato.png`,
 * `imagens/itens/<Nome>.png`) — o mesmo que o "Organizar imagens" daria.
 *
 * `nome` do personagem é o da PRIMEIRA forma (a pasta não muda quando a forma ativa muda);
 * `cadeia` do cenário vai do cenário raiz até ele (`cadeiaCenario`).
 */
export function donoDoRetrato(tipo: TipoTransformacao, nome: string, cadeia?: string[]): DonoImagem {
  if (tipo === 'personagem') return { tipo: 'personagem', nome }
  if (tipo === 'cenario') return { tipo: 'cenario', nomes: cadeia !== undefined && cadeia.length > 0 ? cadeia : [nome] }
  return { tipo: 'item', nome }
}

/**
 * Nova versão (transformação) de um PERSONAGEM já existente: clona a versão ativa com
 * nome e retrato novos, e a torna ativa. Espelha `adicionarVersaoPersonagem` do store
 * (mesmo padrão de clone), mas o retrato já nasce setado — o fluxo de "transformar
 * imagem" não tem um segundo passo para preenchê-lo depois. Pura: não lê/grava disco.
 *
 * `idVersao` é opcional (default aleatório) para o caso comum, mas o chamador pode
 * fixá-lo — quem precisa do id antes de criar a versão (para registrar em outro lugar)
 * não depende do valor sorteado aqui.
 */
export function novaVersaoPersonagemComRetrato(
  p: Personagem, nomeVersao: string, retrato: string, idVersao: string = crypto.randomUUID(),
): Personagem {
  const base = versaoAtivaPersonagem(p)
  const nova: VersaoPersonagem = {
    ...base,
    id: idVersao,
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
export function novaVersaoCenarioComRetrato(
  c: Cenario, nomeVersao: string, retrato: string, idVersao: string = crypto.randomUUID(),
): Cenario {
  const base = versaoAtiva(c)
  const nova: VersaoCenario = {
    ...base,
    id: idVersao,
    nome: nomeVersao,
    retrato,
    imagens: base.imagens.map((i) => ({ ...i })),
  }
  return { ...c, versoes: [...c.versoes, nova], versaoAtivaId: nova.id }
}
