export interface Personagem {
  id: string
  nome: string
  retrato: string | null // caminho relativo ao cofre, ex.: "campanhas/x/assets/foo.png"
  resumo: string
  corpo: string // HTML gerado pelo TipTap
  criadoEm: string // ISO-8601
  modificadoEm: string
}

export interface CanvasDoc {
  id: string
  nome: string
  documento: unknown | null // snapshot tldraw { document, session }
  criadoEm: string
  modificadoEm: string
}

export interface Campanha {
  id: string
  nome: string
  descricao: string
  criadoEm: string
  modificadoEm: string
}

/** Referência leve de item na árvore da sidebar. */
export interface ItemRef {
  slug: string
  nome: string
  caminho: string // relativo ao cofre, ex.: "campanhas/x/sessoes/sessao-01.json"
  erro?: boolean // arquivo ilegível/corrompido
}

export interface CampanhaNode {
  slug: string
  nome: string
  erro?: boolean
  sessoes: ItemRef[]
  personagens: ItemRef[]
  canvases: ItemRef[]
}

export interface VaultTree {
  campanhas: CampanhaNode[]
  canvasesSoltos: ItemRef[]
}

export interface Pagina {
  id: string
  titulo: string
  paiId: string | null
  ordem: number
  corpo: string // HTML do TipTap (imagens guardam data-rel, sem caminho absoluto)
  criadoEm: string
  modificadoEm: string
}

/** Referência leve de página na árvore. */
export interface PaginaRef {
  slug: string
  id: string
  titulo: string
  erro?: boolean
}

export interface PaginaNode extends PaginaRef {
  paiId: string | null
  ordem: number
  filhos: PaginaNode[]
}
