/**
 * Dados falsos da bancada (`amostra.html`): nunca tocam o cofre nem o disco — só
 * populam o estado em memória para os componentes REAIS terem o que desenhar.
 */
import type { Cenario, Item, ItemNoCenario, Personagem, VaultTree } from '../lib/types'

const CRIADO_EM = new Date('2026-01-01T12:00:00Z').toISOString()

function itemFalso(id: string, nome: string, resumo: string): Item {
  return {
    id,
    nome,
    resumo,
    retrato: null,
    descricao: '',
    informacao: '',
    efeito: '',
    criadoEm: CRIADO_EM,
    modificadoEm: CRIADO_EM,
  }
}

/** Ao menos 8 itens, nomes de RPG — para a cena #ficha ter densidade real. */
export const ITENS_FALSOS: Item[] = [
  itemFalso('item-espada-longa', 'Espada Longa de Aço Élfico', 'Lâmina leve, brilha perto de mortos-vivos.'),
  itemFalso('item-pocao-cura', 'Poção de Cura Menor', 'Restaura 2d4+2 pontos de vida ao ser bebida.'),
  itemFalso('item-manto-sombras', 'Manto do Andarilho das Sombras', 'Vantagem em testes de furtividade à noite.'),
  itemFalso('item-anel-protecao', 'Anel de Proteção +1', 'Bônus de +1 na Classe de Armadura enquanto usado.'),
  itemFalso('item-arco-elfico', 'Arco Élfico Trançado', 'Alcance longo, disparo praticamente silencioso.'),
  itemFalso('item-escudo-chamas', 'Escudo em Chamas', 'Causa 1d6 de dano de fogo a quem acerta golpe corpo a corpo.'),
  itemFalso('item-grimorio-necromante', 'Grimório do Necromante Perdido', 'Guarda três feitiços esquecidos de necromancia.'),
  itemFalso('item-botas-silenciosas', 'Botas de Salto Silencioso', 'Passos não emitem som nem deixam pegada.'),
  itemFalso('item-adaga-envenenada', 'Adaga Envenenada', 'Veneno de contato: 1d4 de dano contínuo por três rodadas.'),
  itemFalso('item-cajado-cinzento', 'Cajado do Feiticeiro Cinzento', ''),
]

/** Acervo inicial: mistura item único (sem `qtd`) com pilha (`qtd` >= 2) — mesma regra de `definirQtd`. */
export const ACERVO_INICIAL: ItemNoCenario[] = [
  { itemId: 'item-espada-longa' },
  { itemId: 'item-pocao-cura', qtd: 6 },
  { itemId: 'item-manto-sombras' },
  { itemId: 'item-adaga-envenenada', qtd: 3 },
  { itemId: 'item-grimorio-necromante' },
]

/**
 * Planta de exemplo para a cena #mapa: mesmo formato que "IA monta o mapa" valida
 * (`lib/plantaMapaIA.ts`) — massa contínua (salas encostadas compartilhando parede),
 * corredor ligando a Masmorra ao resto, escada dentro do corredor, muralha com torre em
 * cada canto, sala em polígono (Capela em L) e portas variadas. Passa pelo MESMO
 * `parsearPlantaIA` → `especificacoesParaMapaNovo` que a IA usa — a bancada nasce
 * desenhada como um usuário competente desenharia, não com peças soltas no vazio.
 */
export const PLANTA_EXEMPLO_JSON = JSON.stringify({
  salas: [
    { x: 0, y: 0, w: 8, h: 6, rotulo: 'Salão de Armas', estado: 'sem-info' },
    { x: 8, y: 0, w: 4, h: 6, rotulo: 'Cozinha', estado: 'sem-info' },
    { x: 0, y: 6, w: 12, h: 5, rotulo: 'Pátio Interno', estado: 'sem-info' },
    { x: 3, y: 14, w: 6, h: 4, rotulo: 'Masmorra', estado: 'pendente' },
  ],
  salasPoligono: [
    {
      pontos: [{ x: 12, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 4 }, { x: 14, y: 4 }, { x: 14, y: 6 }, { x: 12, y: 6 }],
      rotulo: 'Capela',
      estado: 'limpa',
    },
  ],
  corredores: [{ x: 4, y: 11, w: 2, h: 3 }],
  muralhas: [{ x: -3, y: -3, w: 22, h: 24 }],
  torres: [
    { x: -4, y: -4, tamanho: 2 },
    { x: 18, y: -4, tamanho: 2 },
    { x: -4, y: 20, tamanho: 2 },
    { x: 18, y: 20, tamanho: 2 },
  ],
  escadas: [{ x: 4, y: 12, w: 2, h: 2 }],
  portas: [
    { x: 8, y: 3, orientacao: 'vertical', estado: 'livre' },
    { x: 4, y: 6, orientacao: 'horizontal', estado: 'livre' },
    { x: 12, y: 3, orientacao: 'vertical', estado: 'trancada' },
    { x: 5, y: 14, orientacao: 'horizontal', estado: 'atencao' },
  ],
  simbolos: [
    { x: 4, y: 15, simbolo: 'marcador' },
    { x: 9, y: 1, simbolo: 'bau' },
    { x: 1, y: 7, simbolo: 'tocha' },
    { x: -4, y: -6, simbolo: 'andar', rotulo: '1F' },
  ],
})

/**
 * Personagem falso da cena #ficha (`BarraLocalizacao` + inventário): mora numa pasta
 * aninhada de "Personagens soltos" (ver `ARVORE_FALSA`, abaixo) e carrega dois itens do
 * próprio acervo — o mesmo componente `AcervoCenario` que `PerfilModal.tsx` usa na aba
 * "Itens".
 */
export const PERSONAGEM_FALSO: Personagem = {
  id: 'personagem-thorin',
  nome: 'Thorin Escudo-de-Carvalho',
  criadoEm: CRIADO_EM,
  modificadoEm: CRIADO_EM,
  versaoAtivaId: 'versao-thorin-base',
  versoes: [
    {
      id: 'versao-thorin-base',
      nome: 'Thorin Escudo-de-Carvalho',
      retrato: null,
      resumo: 'Anão taciturno, herdeiro de um trono que ninguém mais reivindica.',
      descricao: '',
      informacao: '',
      historia: '',
      extras: '',
      anotacoes: '',
      imagens: [],
      acervo: [
        { itemId: 'item-espada-longa' },
        { itemId: 'item-escudo-chamas' },
      ],
    },
  ],
}

/**
 * Dois cenários falsos — um com SUB-cenário — para a `BarraLocalizacao` da cena #ficha
 * ter o que mostrar de verdade (caminho com mais de um nível).
 */
export const CENARIO_FALSO: Cenario = {
  id: 'cenario-torre',
  nome: 'Torre do Mágo Cinzento',
  personagens: [],
  criadoEm: CRIADO_EM,
  modificadoEm: CRIADO_EM,
  versaoAtivaId: 'versao-torre-base',
  versoes: [
    {
      id: 'versao-torre-base',
      nome: 'Base',
      retrato: null,
      resumo: 'Torre isolada no topo da colina, cercada de névoa.',
      descricao: '',
      informacao: '',
      historia: '',
      eventos: '',
      itens: '',
      acervo: [],
      anotacoes: '',
      imagens: [],
    },
  ],
}

export const CENARIO_SUBSOLO_FALSO: Cenario = {
  ...CENARIO_FALSO,
  id: 'cenario-torre-subsolo',
  nome: 'Torre do Mágo Cinzento — Subsolo',
  versaoAtivaId: 'versao-subsolo-base',
  versoes: [{ ...CENARIO_FALSO.versoes[0], id: 'versao-subsolo-base', resumo: 'Masmorra sob a torre, ainda inexplorada.' }],
}

/**
 * Árvore do cofre falsa (`VaultTree`): alimenta a `BarraLocalizacao` das TRÊS fichas.
 * Contém, de propósito:
 * - pasta ANINHADA em "Personagens soltos" (Vagabundos), onde mora `PERSONAGEM_FALSO`;
 * - uma segunda pasta SEM `id` (sem `pasta.json` no disco) — exercita o fallback de nome
 *   que `vaultRepo.montarArvoreDeArquivos` faria (usar o slug quando não há `pasta.json`);
 * - cenário com SUB-cenário (Torre → Subsolo);
 * - itens dentro de uma pasta ("Armas e Relíquias").
 */
export const ARVORE_FALSA: VaultTree = {
  campanhas: [],
  canvasesSoltos: [],
  mapasSoltos: [],
  personagensSoltos: {
    slug: '',
    nome: 'Personagens soltos',
    caminho: 'personagens-soltos',
    subpastas: [
      {
        slug: 'vagabundos',
        nome: 'Vagabundos',
        caminho: 'personagens-soltos/vagabundos',
        id: 'pasta-vagabundos',
        subpastas: [],
        personagens: [
          { slug: 'thorin', nome: PERSONAGEM_FALSO.nome, caminho: 'personagens-soltos/vagabundos/thorin.json', id: PERSONAGEM_FALSO.id },
        ],
      },
      {
        // sem `id`: pasta legada sem `pasta.json` — o `nome` já chega igual ao slug,
        // simulando o fallback que `montarArvoreDeArquivos` faria no app real.
        slug: 'sem-pasta-json',
        nome: 'sem-pasta-json',
        caminho: 'personagens-soltos/sem-pasta-json',
        subpastas: [],
        personagens: [],
      },
    ],
    personagens: [],
  },
  cenarios: {
    slug: '',
    nome: 'Cenários',
    caminho: 'cenarios',
    subpastas: [],
    cenarios: [
      {
        id: CENARIO_FALSO.id,
        slug: 'torre-do-mago-cinzento',
        nome: CENARIO_FALSO.nome,
        caminho: 'cenarios/torre-do-mago-cinzento',
        filhos: [
          {
            id: CENARIO_SUBSOLO_FALSO.id,
            slug: 'subsolo',
            nome: CENARIO_SUBSOLO_FALSO.nome,
            caminho: 'cenarios/torre-do-mago-cinzento/subsolo',
            filhos: [],
          },
        ],
      },
    ],
  },
  itens: {
    slug: '',
    nome: 'Itens',
    caminho: 'itens',
    subpastas: [
      {
        slug: 'armas-e-reliquias',
        nome: 'Armas e Relíquias',
        caminho: 'itens/armas-e-reliquias',
        id: 'pasta-armas-e-reliquias',
        subpastas: [],
        itens: ITENS_FALSOS.map((i) => ({
          slug: i.id.replace(/^item-/, ''),
          nome: i.nome,
          caminho: `itens/armas-e-reliquias/${i.id}.json`,
          id: i.id,
        })),
      },
    ],
    itens: [],
  },
}

/** `caminhoPorId`/`caminhoCenarioPorId`/`caminhoItemPorId` que o store real manteria ao lado da árvore. */
export const CAMINHO_PERSONAGEM_POR_ID_FALSO: Record<string, string> = {
  [PERSONAGEM_FALSO.id]: 'personagens-soltos/vagabundos/thorin.json',
}
export const CAMINHO_CENARIO_POR_ID_FALSO: Record<string, string> = {
  [CENARIO_FALSO.id]: 'cenarios/torre-do-mago-cinzento',
  [CENARIO_SUBSOLO_FALSO.id]: 'cenarios/torre-do-mago-cinzento/subsolo',
}
export const CAMINHO_ITEM_POR_ID_FALSO: Record<string, string> = Object.fromEntries(
  ITENS_FALSOS.map((i) => [i.id, `itens/armas-e-reliquias/${i.id}.json`]),
)
