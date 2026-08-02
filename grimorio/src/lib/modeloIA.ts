/**
 * Qual modelo do Gemini o app usa, guardado por máquina (localStorage), como o tema.
 *
 * A lista de IDs NÃO é fixa no código: as Opções perguntam à API quais modelos a chave
 * enxerga (`listarModelos` em gemini.ts) e esta tabela só diz em que ORDEM mostrar e o
 * quanto cada um custa. Modelo que a Google aposentar simplesmente some da lista; modelo
 * novo aparece no fim, em "outros", sem precisar de release. Uma lista fixa aqui viraria
 * armadilha: ID aposentado dá 404 no meio da sessão de mesa.
 *
 * Preço entra como FAIXA, não como número. O usuário pediu "do mais barato ao mais caro",
 * e faixa relativa continua verdadeira quando a Google reajusta a tabela — cifra copiada
 * da documentação envelhece calada.
 */

const CHAVE = 'grimorio.modeloIA'

/** Usado quando nada foi escolhido — o mesmo que o app sempre usou. */
export const MODELO_PADRAO = 'gemini-3.1-flash-lite'

export type Faixa = 'barato' | 'medio' | 'caro'

export interface ModeloConhecido {
  id: string
  rotulo: string
  faixa: Faixa
  /** Para que serve, em uma linha — é o que decide a escolha, não o nome do modelo. */
  nota: string
}

/**
 * Modelos que sabemos posicionar, do mais barato para o mais caro. A ordem DESTA lista é
 * a ordem da tela; `faixa` só pinta a etiqueta.
 */
export const MODELOS_CONHECIDOS: ModeloConhecido[] = [
  {
    id: 'gemini-3.1-flash-lite',
    rotulo: 'Gemini 3.1 Flash-Lite',
    faixa: 'barato',
    nota: 'O mais barato e o mais rápido. Bom para perguntas de mesa; fraco em descrição longa.',
  },
  {
    id: 'gemini-3.5-flash-lite',
    rotulo: 'Gemini 3.5 Flash-Lite',
    faixa: 'barato',
    nota: 'Ainda barato, escreve melhor que o 3.1. Boa troca para o dia a dia.',
  },
  {
    id: 'gemini-3-flash',
    rotulo: 'Gemini 3 Flash',
    faixa: 'medio',
    nota: 'Equilibrado: texto bem mais desenvolvido, custo intermediário.',
  },
  {
    id: 'gemini-3.6-flash',
    rotulo: 'Gemini 3.6 Flash',
    faixa: 'medio',
    nota: 'Melhor escrita da família Flash. Boa escolha para worldbuilding.',
  },
  {
    id: 'gemini-3-pro',
    rotulo: 'Gemini 3 Pro',
    faixa: 'caro',
    nota: 'O mais capaz e o mais caro. Para lore densa e coerência em texto longo.',
  },
]

export interface OpcaoModelo extends ModeloConhecido {
  /** false = a API ofereceu, mas não sabemos posicionar (vai para o fim da lista). */
  conhecido: boolean
}

const porId = new Map(MODELOS_CONHECIDOS.map((m) => [m.id, m]))

/** Descarta variantes que não servem ao chat: embedding, TTS, imagem, vídeo e afins. */
function ehConversavel(id: string): boolean {
  return !/embedding|aqa|imagen|veo|tts|image-generation|live/.test(id)
}

/**
 * Junta o que a API ofereceu com o que sabemos posicionar: conhecidos primeiro, na ordem
 * da tabela; o resto em seguida, em ordem alfabética, marcado como desconhecido.
 *
 * `idsDaApi` vazio (offline, sem chave) devolve a tabela inteira — é melhor oferecer a
 * lista curada do que uma tela vazia.
 */
export function montarOpcoes(idsDaApi: string[]): OpcaoModelo[] {
  const oferecidos = new Set(idsDaApi.filter(ehConversavel))
  if (oferecidos.size === 0) return MODELOS_CONHECIDOS.map((m) => ({ ...m, conhecido: true }))

  const conhecidos = MODELOS_CONHECIDOS.filter((m) => oferecidos.has(m.id)).map((m) => ({ ...m, conhecido: true }))
  const outros = [...oferecidos]
    .filter((id) => !porId.has(id))
    .sort((a, b) => a.localeCompare(b))
    .map((id): OpcaoModelo => ({ id, rotulo: id, faixa: 'medio', nota: 'Modelo novo — o Grimório ainda não sabe o preço dele.', conhecido: false }))
  return [...conhecidos, ...outros]
}

/** Modelo escolhido nesta máquina (o padrão quando nada foi escolhido). */
export function modeloSalvo(): string {
  const s = localStorage.getItem(CHAVE)
  return s && s.trim() ? s.trim() : MODELO_PADRAO
}

/** Persiste a escolha; vazio volta ao padrão. */
export function salvarModelo(id: string): void {
  const limpo = id.trim()
  if (!limpo || limpo === MODELO_PADRAO) localStorage.removeItem(CHAVE)
  else localStorage.setItem(CHAVE, limpo)
}

/** Rótulo legível de um id (o próprio id quando não conhecemos). */
export function rotuloDoModelo(id: string): string {
  return porId.get(id)?.rotulo ?? id
}
