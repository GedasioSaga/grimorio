/**
 * A sala do mapa e o seu ESTADO.
 *
 * Nas referências do usuário (mapas do Resident Evil 2), a cor da sala não é decoração —
 * é a informação principal que o mapa existe para dar: vermelho quer dizer "ainda tem
 * coisa aqui", azul quer dizer "já limpei", escuro quer dizer "não sei o que tem". Numa
 * mesa de RPG, é o que o mestre lê de relance no meio da cena.
 *
 * Por que a sala é desenhada por nós e não é uma forma `geo` do tldraw pintada: as cores
 * abaixo não existem na paleta do tldraw e não há como redefini-la. No tema escuro, a
 * cor `red` com preenchimento sólido resolve para `#382726` (quase marrom) — conferido em
 * node_modules/@tldraw/tlschema/src/styles/TLColorStyle.ts, bloco `darkMode`. O preço é
 * que a sala é retangular; forma irregular se compõe com salas encostadas, como o próprio
 * usuário já desenha.
 */

export type EstadoSala = 'pendente' | 'limpa' | 'sem-info'

/**
 * Preto ou branco por cima de `fundo`, escolhido por luminância (fórmula YIQ — mais barata
 * que contraste WCAG completo, e sobra precisão pra só decidir entre duas opções).
 *
 * Existe porque `CORES_SALA` ganhou tom claro (ex.: marfim) e texto branco sobre marfim
 * some. Calculado a partir do preenchimento FINAL (estado ou cor escolhida à mão) em vez
 * de fixo por estado, porque senão toda cor clara nova exigiria lembrar de acertar o
 * texto à parte — e um dia alguém esquece.
 */
function corTextoContraste(fundo: string): string {
  const hex = fundo.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const luminancia = (r * 299 + g * 587 + b * 114) / 1000
  return luminancia > 140 ? '#1a1a1a' : '#efefef'
}

export interface AparenciaSala {
  estado: EstadoSala
  rotulo: string
  preenchimento: string
  contorno: string
  /** cor do nome do cômodo escrito dentro da sala */
  texto: string
}

/**
 * Contorno da sala — deliberadamente IGUAL ao traço que a ferramenta de linha do tldraw
 * produz com `color: grey, size: s` no tema escuro: `#9fa8b2` e 2px de espessura
 * (conferido em node_modules/@tldraw/tlschema/src/styles/TLColorStyle.ts, bloco
 * `darkMode`, e em node_modules/tldraw/src/lib/shapes/shared/default-shape-constants.ts:13-18).
 *
 * A divisória interna precisa ser indistinguível do contorno da sala. A primeira
 * tentativa foi o caminho inverso — um shape de linha nosso com a cor exata da sala — e
 * saiu ruim de usar: sem o comportamento de linha do tldraw, esticar era imprevisível
 * ("do nada ela estica muito"). Casar a NOSSA cor com a da ferramenta nativa dá o mesmo
 * resultado visual e devolve ao usuário uma linha de verdade, com alças e pontos que já
 * funcionam.
 */
export const CONTORNO_SALA = '#9fa8b2'
/** Espessura do contorno, igual ao `size: s` do tldraw. */
export const ESPESSURA_CONTORNO_SALA = 2
const CONTORNO = CONTORNO_SALA

/**
 * Distância do topo da sala até a primeira linha do rótulo (`desenhoSala.tsx` e
 * `desenhoSalaPoligono.tsx`).
 *
 * O rótulo é ancorado no TOPO, não centralizado na sala — mudança desta leva. A revisão
 * cega achou colisão real: "Torre de Vigia" caindo em cima do ícone da escada, "Depósito
 * Seguro" cortado pelo baú, porque o nome do cômodo (centralizado) e o ícone da peça
 * largada dentro da sala (também tendendo ao centro) disputavam o mesmo ponto. Nas
 * referências o nome é sempre uma faixa no topo do cômodo — o miolo fica livre para
 * qualquer ícone que o mestre arraste para lá, sem precisar saber de antemão o que vai
 * ser largado dentro. Ancorar no topo resolve a colisão para QUALQUER peça futura, sem
 * detecção de colisão em tempo real (as duas formas são shapes independentes no
 * tldraw — a sala não sabe o que está por cima dela).
 */
export const MARGEM_TOPO_ROTULO = 10

/**
 * Preenchimento de cada estado — tom MÉDIO, não escuro-muddy.
 *
 * `#7d3b3b`/`#40596b` (duas versões atrás) ficavam próximos demais do preto: o resultado
 * era a "sala feia" que o usuário reclamou. A versão seguinte (`#9c4f4a`/`#43698c`)
 * corrigiu isso subindo brilho e saturação — e foi longe demais na outra direção: a
 * revisão cega leu o mapa como "planilha colorida por categoria" em vez de chão de um
 * mesmo edifício, porque cada estado virou um bloco de cor quase pura brigando com os
 * vizinhos. `sem-info` sobe de `#1c1c1c` pra `#3d3d3d`: perto do preto puro a sala some
 * contra o fundo escuro do editor; um cinza levemente mais claro que o fundo do canvas
 * ainda lê como "sala sem cor", só que sem sumir.
 *
 * Esta leva reduz saturação e brilho de `pendente`/`limpa`, aproximando as duas do tom
 * neutro de `sem-info` (que já era o "piso" do prédio) — o estado continua lendo pela
 * MATIZ (vermelho-acastanhado vs. azul-acinzentado), não pela intensidade da cor. O
 * usuário decidiu explicitamente MANTER a cor como estado (não virar monocromático,
 * que era a sugestão da revisão): ela é a informação que se lê de relance na mesa. O
 * ajuste aqui é só baixar o volume, não desligar o som.
 *
 * `texto` não é mais fixo por estado — ver `corTextoContraste`, calculado em cima do
 * preenchimento final (estado ou cor escolhida à mão).
 */
const APARENCIAS: Record<EstadoSala, Omit<AparenciaSala, 'estado' | 'texto'>> = {
  pendente: { rotulo: 'Ainda tem coisa', preenchimento: '#6e433f', contorno: CONTORNO },
  limpa: { rotulo: 'Já limpei', preenchimento: '#3f5568', contorno: CONTORNO },
  'sem-info': { rotulo: 'Sem informação', preenchimento: '#3d3d3d', contorno: CONTORNO },
}

/**
 * Ordem em que os estados aparecem no painel de propriedades. `sem-info` vem primeiro
 * porque é o estado em que a sala nasce agora (ver `getDefaultProps` em
 * `SalaMapaShape.tsx`) — o seletor deve ler como "neutro → descobri algo → resolvi",
 * não mais abrir já em "pendente".
 */
export const ESTADOS_SALA: EstadoSala[] = ['sem-info', 'pendente', 'limpa']

/**
 * Cores que o usuário pode escolher para uma sala, além da cor padrão do estado.
 *
 * O estado continua sendo a SEMÂNTICA (o que aquela sala significa para o mestre); a cor
 * escolhida à mão é aparência, e sobrepõe só naquela sala. Serve para o que o estado não
 * cobre: separar alas de um castelo, marcar território de uma facção, distinguir andares
 * que se encostam no mesmo mapa.
 *
 * A paleta é fechada de propósito e no mesmo registro de tom médio dos estados acima —
 * cor livre de seletor RGB dá salas berrantes que brigam com o resto do mapa.
 *
 * `marfim` é a primeira cor CLARA da paleta (pedido do usuário: o mapa que ele mesmo
 * desenha à mão tem salas claras com texto escuro). `corTextoContraste`, usada em
 * `aparenciaDaSala`, garante que o rótulo vire escuro sozinho quando a sala usa marfim —
 * sem isso o texto branco padrão some no fundo claro.
 */
export const CORES_SALA: Array<{ id: string; nome: string; valor: string }> = [
  { id: 'tijolo', nome: 'Tijolo', valor: '#8a4340' },
  { id: 'petroleo', nome: 'Petróleo', valor: '#3f6d86' },
  { id: 'carvao', nome: 'Carvão', valor: '#3a3a3a' },
  { id: 'musgo', nome: 'Musgo', valor: '#3f6b4a' },
  { id: 'ametista', nome: 'Ametista', valor: '#55406b' },
  { id: 'ocre', nome: 'Ocre', valor: '#7d6535' },
  { id: 'chumbo', nome: 'Chumbo', valor: '#4a4a4a' },
  { id: 'vinho', nome: 'Vinho', valor: '#6b2f4a' },
  { id: 'marfim', nome: 'Marfim', valor: '#e8dfc8' },
]

/**
 * Aparência de um estado. Estado desconhecido (arquivo de versão futura, ou editado à
 * mão) cai em `sem-info` em vez de sumir: sala invisível seria pior que sala neutra.
 */
export function aparenciaDaSala(estado: string, corEscolhida?: string): AparenciaSala {
  const chave = (ESTADOS_SALA as string[]).includes(estado) ? (estado as EstadoSala) : 'sem-info'
  const aparenciaEstado = APARENCIAS[chave]
  // cor escolhida à mão sobrepõe só o preenchimento: o contorno continua vindo do estado,
  // senão o usuário precisaria acertar duas cores para trocar uma. A cor do texto é
  // recalculada em cima do preenchimento final — ver `corTextoContraste`.
  const preenchimento = corEscolhida || aparenciaEstado.preenchimento
  return { estado: chave, ...aparenciaEstado, preenchimento, texto: corTextoContraste(preenchimento) }
}

/**
 * Quebra o nome do cômodo em linhas que cabem na largura da sala.
 *
 * As referências fazem isso o tempo todo ("Safety Deposit Room" em duas linhas dentro de
 * uma sala estreita). A conta é aproximada de propósito — largura média de caractere — e
 * não precisa ser exata: erra para menos, e o texto sobra dentro da caixa em vez de
 * vazar.
 */
export function quebrarRotulo(rotulo: string, larguraPx: number, tamanhoFontePx: number): string[] {
  const texto = rotulo.trim()
  if (!texto) return []

  const larguraMediaChar = tamanhoFontePx * 0.55
  const maxChars = Math.max(4, Math.floor((larguraPx - 8) / larguraMediaChar))

  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/)) {
    const candidata = atual ? `${atual} ${palavra}` : palavra
    if (candidata.length <= maxChars) {
      atual = candidata
      continue
    }
    if (atual) linhas.push(atual)
    atual = palavra
  }
  if (atual) linhas.push(atual)
  return linhas
}
