export interface ImagemPersonagem {
  rel: string        // caminho relativo ao cofre (portável entre PCs)
  legenda?: string
}

export interface Personagem {
  id: string
  nome: string
  retrato: string | null // caminho relativo ao cofre, ex.: "campanhas/x/assets/foo.png"
  resumo: string
  descricao: string // HTML gerado pelo TipTap (era `corpo`)
  informacao: string // HTML (caixa "Informações" do card no canvas)
  historia: string  // HTML
  extras: string    // HTML
  anotacoes: string // HTML
  imagens: ImagemPersonagem[]
  criadoEm: string // ISO-8601
  modificadoEm: string
}

export interface Cenario {
  id: string
  nome: string
  retrato: string | null // rel ao cofre, ex.: "imagens-cenarios/retrato-x.png"
  resumo: string
  descricao: string  // HTML TipTap
  informacao: string // HTML (caixa "Informações" do card no canvas)
  historia: string   // HTML
  eventos: string    // HTML — v1 texto; vira entidade própria no futuro
  itens: string      // HTML — idem
  anotacoes: string  // HTML
  imagens: ImagemPersonagem[]
  personagens: string[] // ids de personagens vinculados (N:N)
  criadoEm: string // ISO-8601
  modificadoEm: string
}

/** Ponta de vínculo entre entidades. Canvas só participa de campanha (nunca é alvo de relação). */
export type TipoEntidadeVinculo = 'personagem' | 'cenario' | 'canvas'

/** Relação tipada entre entidades OU participação em campanha (tipo TIPO_PARTICIPA). */
export interface Vinculo {
  id: string
  deTipo: TipoEntidadeVinculo
  deId: string
  paraTipo: TipoEntidadeVinculo | 'campanha'
  paraId: string
  tipo: string      // 'conhece', 'mora em', … ou texto livre
  notas: string     // '' quando vazia
  criadoEm: string  // ISO-8601
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
  id?: string // id do doc (canvas/personagem) p/ etiqueta de campanha; ausente se ilegível
  erro?: boolean // arquivo ilegível/corrompido
}

export interface CampanhaNode {
  id: string // do campanha.json ('' se ilegível/sem id)
  slug: string
  nome: string
  erro?: boolean
  sessoes: ItemRef[]
  personagens: ItemRef[]
  canvases: ItemRef[]
  escritas: ItemRef[]
}

/** Nó de pasta na área de Personagens soltos (pastas aninhadas + personagens). */
export interface PastaNode {
  slug: string
  nome: string
  caminho: string // dir relativo ao cofre, ex.: "personagens-soltos/vilões"
  subpastas: PastaNode[]
  personagens: ItemRef[]
}

/** Referência leve de cenário na árvore. `caminho` é o DIRETÓRIO do cenário. */
export interface CenarioRef {
  id: string
  slug: string
  nome: string
  caminho: string // dir relativo ao cofre, ex.: "cenarios/reino/cidade-alta"
  erro?: boolean
}

export interface CenarioNode extends CenarioRef {
  filhos: CenarioNode[]
}

/** Pasta organizacional de cenários: contém pastas e cenários raiz. */
export interface PastaCenarioNode {
  slug: string
  nome: string
  caminho: string
  subpastas: PastaCenarioNode[]
  cenarios: CenarioNode[]
}

export interface VaultTree {
  campanhas: CampanhaNode[]
  canvasesSoltos: ItemRef[]
  /** raiz da área de personagens fora de campanha (caminho = "personagens-soltos") */
  personagensSoltos: PastaNode
  /** raiz da seção de cenários (caminho = "cenarios") */
  cenarios: PastaCenarioNode
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
