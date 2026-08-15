/**
 * Catálogo dos símbolos desenhados do mapa (família "sólida", escolhida pelo usuário em
 * 15/08/2026 depois de ver as peças genéricas no app: "isso tá horrível").
 *
 * Por que símbolo desenhado e não forma do tldraw pintada: um triângulo vermelho vazio
 * não é uma armadilha, é um triângulo vermelho. Peça de mapa precisa de desenho próprio —
 * losango com "!", parede com "S", cama com travesseiro. Isso é impossível com
 * `setStyleForNextShapes` numa forma `geo`, que só troca cor/traço/preenchimento.
 *
 * Todos os símbolos vivem num ShapeUtil só (`SimboloMapaShape.tsx`) parametrizado por
 * `simbolo`, em vez de um ShapeUtil por peça: o comportamento é idêntico (caixa que
 * redimensiona e gira), só o desenho muda. Peça nova = mais uma entrada aqui e um `case`
 * no desenho.
 *
 * As cores são FIXAS por símbolo, não vêm do painel de estilos do tldraw. É deliberado:
 * a liberdade de cor foi justamente o que produziu o resultado genérico que o usuário
 * rejeitou. Vermelho é perigo, amarelo é referência numerada, violeta é segredo — a cor
 * carrega significado e não deve variar por acidente.
 */

export type SimboloId =
  | 'janela' | 'secreta' | 'armadilha' | 'marcador' | 'mesa' | 'cama' | 'bau' | 'andar'
  // itens largados pelo mapa, como as referências fazem: o mestre bate o olho e sabe o
  // que tem naquela sala sem abrir anotação nenhuma
  | 'pocao' | 'erva' | 'chave' | 'documento' | 'moeda'
  | 'espada' | 'municao' | 'livro' | 'tocha' | 'comida'

/** Lado do ícone de item, em px de página (~2/3 de um quadrado da grade). */
const ITEM_PX = 22

export interface DefinicaoSimbolo {
  id: SimboloId
  /** nome mostrado na gaveta de peças e na legenda */
  rotulo: string
  /** ícone do botão na gaveta */
  glifo: string
  /** tamanho de nascença, em px de página (1 quadrado = 32px) */
  largura: number
  altura: number
  /** símbolo que carrega texto próprio — hoje só o marcador numerado */
  numerado?: boolean
  /** item largado pelo mapa (poção, chave…), separado das peças de construção */
  item?: boolean
  /** símbolo cujo texto o usuário escreve (rótulo de andar) — editável no painel */
  textoLivre?: boolean
}

export const SIMBOLOS_MAPA: DefinicaoSimbolo[] = [
  // vão de parede com vidro: fica deitado sobre a parede, por isso largo e baixo
  { id: 'janela', rotulo: 'Janela', glifo: '▤', largura: 64, altura: 20 },
  // parede falsa: mesma proporção da parede, para encaixar na linha dela
  { id: 'secreta', rotulo: 'Passagem secreta', glifo: 'Ⓢ', largura: 64, altura: 24 },
  // marcadores de piso são quadrados: giram sem mudar de silhueta
  { id: 'armadilha', rotulo: 'Armadilha', glifo: '◆', largura: 40, altura: 40 },
  { id: 'marcador', rotulo: 'Marcador numerado', glifo: '①', largura: 40, altura: 40, numerado: true },
  { id: 'mesa', rotulo: 'Mesa', glifo: '▬', largura: 48, altura: 28 },
  { id: 'cama', rotulo: 'Cama', glifo: '▯', largura: 40, altura: 56 },
  { id: 'bau', rotulo: 'Baú', glifo: '▭', largura: 32, altura: 24 },
  // rótulo do andar: nas referências é um texto branco grande ao lado do bloco de salas
  // ("1F", "2F", "Upper"), sem moldura. Quem separa os andares de verdade são as camadas.
  { id: 'andar', rotulo: 'Rótulo de andar', glifo: 'ⁿF', largura: 96, altura: 44, textoLivre: true },

  // itens: todos no mesmo quadrado pequeno, para ficarem irmãos visualmente e caberem
  // dentro de uma sala sem cobrir o nome dela
  { id: 'pocao', rotulo: 'Poção', glifo: '🧪', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'erva', rotulo: 'Erva', glifo: '🌿', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'chave', rotulo: 'Chave', glifo: '🗝', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'documento', rotulo: 'Documento', glifo: '📄', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'moeda', rotulo: 'Moedas', glifo: '🪙', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'espada', rotulo: 'Arma', glifo: '⚔', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'municao', rotulo: 'Munição', glifo: '➶', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'livro', rotulo: 'Livro', glifo: '📕', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'tocha', rotulo: 'Tocha', glifo: '🔥', largura: ITEM_PX, altura: ITEM_PX, item: true },
  { id: 'comida', rotulo: 'Comida', glifo: '🍖', largura: ITEM_PX, altura: ITEM_PX, item: true },
]

/** Itens do mapa — o subconjunto que a gaveta agrupa numa seção própria. */
export const ITENS_MAPA = SIMBOLOS_MAPA.filter((s) => s.item)

export function definicaoDoSimbolo(id: string): DefinicaoSimbolo | undefined {
  return SIMBOLOS_MAPA.find((s) => s.id === id)
}

/** Símbolo válido? Usado ao ler forma vinda do disco, que pode ter sido editada à mão. */
export function ehSimboloConhecido(id: string): id is SimboloId {
  return SIMBOLOS_MAPA.some((s) => s.id === id)
}
