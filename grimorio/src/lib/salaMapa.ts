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

export interface AparenciaSala {
  estado: EstadoSala
  rotulo: string
  preenchimento: string
  contorno: string
  /** cor do nome do cômodo escrito dentro da sala */
  texto: string
}

/**
 * Contorno da sala. Exportado porque a Divisória desenha a mesma linha: se a cor fosse
 * repetida à mão lá, um ajuste de tom aqui faria as duas pararem de combinar em silêncio.
 */
export const CONTORNO_SALA = '#b9c4c9'
const CONTORNO = CONTORNO_SALA

const APARENCIAS: Record<EstadoSala, Omit<AparenciaSala, 'estado'>> = {
  pendente: { rotulo: 'Ainda tem coisa', preenchimento: '#7d3b3b', contorno: CONTORNO, texto: '#ffffff' },
  limpa: { rotulo: 'Já limpei', preenchimento: '#40596b', contorno: CONTORNO, texto: '#ffffff' },
  'sem-info': { rotulo: 'Sem informação', preenchimento: '#1c1c1c', contorno: CONTORNO, texto: '#cfcfcf' },
}

/** Ordem em que os estados aparecem no painel de propriedades. */
export const ESTADOS_SALA: EstadoSala[] = ['pendente', 'limpa', 'sem-info']

/**
 * Cores que o usuário pode escolher para uma sala, além da cor padrão do estado.
 *
 * O estado continua sendo a SEMÂNTICA (o que aquela sala significa para o mestre); a cor
 * escolhida à mão é aparência, e sobrepõe só naquela sala. Serve para o que o estado não
 * cobre: separar alas de um castelo, marcar território de uma facção, distinguir andares
 * que se encostam no mesmo mapa.
 *
 * A paleta é fechada de propósito e no mesmo registro escuro das referências — cor livre
 * de seletor RGB dá salas berrantes que brigam com o resto do mapa.
 */
export const CORES_SALA: Array<{ id: string; nome: string; valor: string }> = [
  { id: 'tijolo', nome: 'Tijolo', valor: '#7d3b3b' },
  { id: 'petroleo', nome: 'Petróleo', valor: '#40596b' },
  { id: 'carvao', nome: 'Carvão', valor: '#1c1c1c' },
  { id: 'musgo', nome: 'Musgo', valor: '#3f6b4a' },
  { id: 'ametista', nome: 'Ametista', valor: '#55406b' },
  { id: 'ocre', nome: 'Ocre', valor: '#7d6535' },
  { id: 'chumbo', nome: 'Chumbo', valor: '#4a4a4a' },
  { id: 'vinho', nome: 'Vinho', valor: '#6b2f4a' },
]

/**
 * Aparência de um estado. Estado desconhecido (arquivo de versão futura, ou editado à
 * mão) cai em `sem-info` em vez de sumir: sala invisível seria pior que sala neutra.
 */
export function aparenciaDaSala(estado: string, corEscolhida?: string): AparenciaSala {
  const chave = (ESTADOS_SALA as string[]).includes(estado) ? (estado as EstadoSala) : 'sem-info'
  const base = { estado: chave, ...APARENCIAS[chave] }
  // cor escolhida à mão sobrepõe só o preenchimento: contorno e cor do texto continuam
  // vindo do estado, senão o usuário precisaria acertar três cores para trocar uma
  return corEscolhida ? { ...base, preenchimento: corEscolhida } : base
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
