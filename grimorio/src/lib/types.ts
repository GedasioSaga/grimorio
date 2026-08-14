export interface ImagemPersonagem {
  rel: string        // caminho relativo ao cofre (portável entre PCs)
  legenda?: string
}

/**
 * Enquadramento do retrato no círculo do perfil: vira `object-position: x% y%`.
 * Ausente = centro, que é como todo retrato sempre foi desenhado.
 */
export interface FocoRetrato {
  x: number // 0–100
  y: number // 0–100
}

export interface VersaoPersonagem {
  id: string
  nome: string        // nome do personagem NESTA forma (ex: "Bruce Banner", "Hulk")
  retrato: string | null // caminho relativo ao cofre, ex.: "campanhas/x/assets/foo.png"
  foco?: FocoRetrato  // enquadramento do retrato; ausente = centro
  resumo: string
  descricao: string  // HTML TipTap (era `corpo`)
  informacao: string // HTML (caixa "Informações" do card no canvas)
  historia: string   // HTML
  extras: string     // HTML
  anotacoes: string  // HTML
  imagens: ImagemPersonagem[]
}

export interface Personagem {
  id: string
  nome: string           // ESPELHO do nome da versão ativa (para sidebar/vínculos/refs que leem nome do topo)
  versoes: VersaoPersonagem[]
  versaoAtivaId: string  // id de uma versoes[]
  criadoEm: string // ISO-8601
  modificadoEm: string
}

/**
 * Item do acervo presente numa versão de cenário.
 *
 * Fica na VERSÃO, não no cenário: a taverna intacta tem o barril de cerveja, a
 * incendiada não. É a mesma razão pela qual `itens` (o texto livre) já é por versão.
 * `qtd` ausente = item único — o chip mostra só o nome, sem contador.
 */
export interface ItemNoCenario {
  itemId: string
  qtd?: number
}

export interface VersaoCenario {
  id: string
  nome: string          // "Base", "Dia", "Noite", "Destruído"
  retrato: string | null // rel ao cofre, ex.: "imagens-cenarios/retrato-<cenId>-<verId>.png"
  foco?: FocoRetrato    // enquadramento do retrato; ausente = centro
  resumo: string
  descricao: string  // HTML TipTap
  informacao: string // HTML (caixa "Informações" do card no canvas)
  historia: string   // HTML
  eventos: string    // HTML — v1 texto; vira entidade própria no futuro
  itens: string      // HTML — texto livre da aba Itens (convive com `acervo`)
  acervo: ItemNoCenario[] // itens de verdade vinculados; texto livre continua em `itens`
  anotacoes: string  // HTML
  imagens: ImagemPersonagem[]
}

export interface Cenario {
  id: string
  nome: string              // compartilhado por todas as versões
  personagens: string[]     // ids de personagens vinculados (N:N) — compartilhado
  versoes: VersaoCenario[]  // sempre >= 1
  versaoAtivaId: string     // id de uma versoes[]
  criadoEm: string // ISO-8601
  modificadoEm: string
}

/**
 * Item do acervo: arma, relíquia, poção, artefato.
 *
 * Sem versões, ao contrário de personagem e cenário. Aqueles têm versão porque a mesma
 * entidade assume ESTADOS (dia/noite, Bruce Banner/Hulk); um item que muda a ponto de
 * precisar disso é outro item. Se algum dia precisar, a migração preguiçosa dos outros
 * dois já é o molde pronto.
 */
export interface Item {
  id: string
  nome: string
  resumo: string       // aparece na sidebar, no contexto da IA e no grafo
  retrato: string | null // rel ao cofre, ex.: "imagens-itens/retrato-<itemId>.png"
  foco?: FocoRetrato   // enquadramento do retrato; ausente = centro
  descricao: string    // HTML TipTap — o que é e como se parece
  informacao: string   // HTML — dados secos: peso, raridade, valor, requisitos
  efeito: string       // HTML — o que faz em jogo
  criadoEm: string // ISO-8601
  modificadoEm: string
}

/** Ponta de vínculo. Canvas e pasta só participam de campanha (nunca são alvo de relação). */
export type TipoEntidadeVinculo = 'personagem' | 'cenario' | 'item' | 'canvas' | 'pasta'

/**
 * Subconjunto que pode ser ALVO de uma relação. Existe como tipo próprio para o
 * compilador barrar `paraTipo: 'canvas'` — antes a regra só vivia num comentário e na
 * checagem de `normalizarVinculos`, ou seja, só era descoberta em tempo de execução.
 */
export type TipoAlvoVinculo = 'personagem' | 'cenario' | 'item'

/** Relação tipada entre entidades OU participação em campanha (tipo TIPO_PARTICIPA). */
export interface Vinculo {
  id: string
  deTipo: TipoEntidadeVinculo
  deId: string
  paraTipo: TipoAlvoVinculo | 'campanha'
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
  /** id do pasta.json; ausente em pasta criada antes da campanha-em-pasta */
  id?: string
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
  /** id do pasta.json; ausente em pasta criada antes da campanha-em-pasta */
  id?: string
  subpastas: PastaCenarioNode[]
  cenarios: CenarioNode[]
}

/**
 * Pasta organizacional de itens. Mesma forma da de personagens: o item é um ARQUIVO
 * dentro da pasta, não uma pasta (como é o cenário). Isso mantém item fora do caso
 * especial do sincronizador, que precisa saber quando a entidade é um diretório.
 */
export interface PastaItemNode {
  slug: string
  nome: string
  caminho: string // dir relativo ao cofre, ex.: "itens/armas"
  /** id do pasta.json; ausente em pasta criada à mão no disco */
  id?: string
  subpastas: PastaItemNode[]
  itens: ItemRef[]
}

export interface VaultTree {
  campanhas: CampanhaNode[]
  canvasesSoltos: ItemRef[]
  /** mapas da seção "Mapas" (caminho = "mapas-soltos"); lista plana na v1 */
  mapasSoltos: ItemRef[]
  /** raiz da área de personagens fora de campanha (caminho = "personagens-soltos") */
  personagensSoltos: PastaNode
  /** raiz da seção de cenários (caminho = "cenarios") */
  cenarios: PastaCenarioNode
  /** raiz da seção de itens (caminho = "itens") */
  itens: PastaItemNode
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
