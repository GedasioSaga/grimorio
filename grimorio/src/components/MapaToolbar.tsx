import {
  createShapeId,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultSizeStyle,
  GeoShapeGeoStyle,
  useEditor,
  useValue,
  type StyleProp,
} from 'tldraw'
import { ELEMENTOS_PALETA, type ElementoPaleta } from '../lib/paletaMapa'
import { GavetaPecas } from './GavetaPecas'
import { ComandosMapa } from './ComandosMapa'
import { AcoesMapaIA } from './AcoesMapaIA'
// A barra não importa mais nenhum tamanho de peça: desde que as construções passaram a ser
// DESENHADAS (ver `FerramentasCaixaMapa.ts`), o tamanho de nascença mora só no
// `getDefaultProps` de cada shapeUtil. Antes vivia nos dois lugares, e o da barra vencia.
import { proximoNumero } from '../lib/portaMapa'
import { definicaoDoSimbolo, type SimboloId } from '../lib/simbolosMapa'
import { tamanhoDoSimbolo } from './SimboloMapaShape'
import { aceitaCanto, cantoDaPeca, OPCOES_CANTO, type CantoMapa } from '../lib/cantosMapa'
import { aplicarCanto, cantoAtivoAtom, setCantoAtivo } from '../lib/cantoAtivo'

/** Style props do tldraw indexados pelo mesmo nome usado em `ElementoPaleta.estilos`. */
const STYLE_PROPS_POR_NOME: Record<string, StyleProp<string>> = {
  // `geo` entra aqui para o "Converter em" poder trocar a forma junto com a pintura
  geo: GeoShapeGeoStyle,
  color: DefaultColorStyle,
  fill: DefaultFillStyle,
  dash: DefaultDashStyle,
  size: DefaultSizeStyle,
}

/**
 * Alinhar e distribuir usam as ações NATIVAS do tldraw — `editor.alignShapes(ids, op)`
 * e `editor.distributeShapes(ids, op)`, verificadas em
 * node_modules/@tldraw/editor/src/lib/editor/Editor.ts:7247-7250 (as seis operações
 * abaixo são exatamente a união aceita pela assinatura) e :7325. Nada de matemática
 * própria de bounds aqui.
 */
const ALINHAMENTOS = [
  { titulo: 'Alinhar à esquerda', icone: '⇤', operacao: 'left' },
  { titulo: 'Centralizar na horizontal', icone: '↔', operacao: 'center-horizontal' },
  { titulo: 'Alinhar à direita', icone: '⇥', operacao: 'right' },
  { titulo: 'Alinhar pelo topo', icone: '⤒', operacao: 'top' },
  { titulo: 'Centralizar na vertical', icone: '↕', operacao: 'center-vertical' },
  { titulo: 'Alinhar pela base', icone: '⤓', operacao: 'bottom' },
] as const

/** Espaçar igualmente — só faz sentido com 3+ formas (com 2 não há nada entre elas). */
const DISTRIBUICOES = [
  { titulo: 'Distribuir na horizontal', icone: '⋯', operacao: 'horizontal' },
  { titulo: 'Distribuir na vertical', icone: '⋮', operacao: 'vertical' },
] as const

const MINIMO_PARA_DISTRIBUIR = 3

/**
 * As peças de CONSTRUÇÃO não nascem mais prontas: elas armam uma ferramenta e o usuário
 * DESENHA no canvas.
 *
 * Antes, cada uma tinha aqui a própria função `criar*` fazendo `editor.createShape` no
 * centro da viewport. Sete funções quase idênticas, e as três coisas erradas que a
 * comparação cega contra o Dungeon Scrawl cobrou: a peça nascia longe de onde o usuário
 * queria (arrasto de reposicionamento obrigatório), nascia fora da grade (o centro da
 * viewport é ponto fracionário e nada passava por `maybeSnapToGrid`), e todas nasciam no
 * MESMO ponto, uma em cima da outra.
 *
 * Agora clicar no canvas coloca a peça no tamanho de nascença centrada no clique, e
 * arrastar desenha do tamanho arrastado — as duas com encaixe na grade. Quem entrega isso
 * é `FerramentasCaixaMapa.ts` (herdando `BaseBoxShapeTool`) e `SalaPoligonoMapaTool.ts`;
 * o `id` de cada ferramenta é o próprio tipo do shape, então o mapeamento é direto e não
 * precisa de tabela.
 *
 * Símbolo continua nascendo pronto (`criarSimbolo`, abaixo): ele é um ícone de tamanho
 * fixo, não uma área que se desenha — arrastar para definir o tamanho de um baú não
 * significa nada.
 */
const FERRAMENTA_DA_PECA: Partial<Record<string, string>> = {
  sala: 'sala-mapa',
  'sala-poligono': 'sala-poligono-mapa',
  corredor: 'corredor-mapa',
  muralha: 'muralha-mapa',
  torre: 'torre-mapa',
  escada: 'escada-mapa',
  porta: 'porta-mapa',
}


/**
 * Toolbar própria do mapa, substituindo a do tldraw (slot `components.Toolbar`).
 *
 * Mecanismo verificado em `node_modules/tldraw/src/lib/ui/hooks/useTools.tsx`
 * (é o que a toolbar padrão do tldraw faz por trás de cada botão):
 * - trocar de ferramenta: `editor.setCurrentTool(id)`.
 * - retângulo/elipse são o mesmo tool `geo`; o que muda é o estilo aplicado à
 *   PRÓXIMA forma, setado com `editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle' | 'ellipse')`
 *   antes de `setCurrentTool('geo')` — os dois num `editor.run(...)` para não
 *   gerar dois passos de histórico/reatividade separados (mesmo padrão do useTools).
 *
 * Botão ativo: `editor.getCurrentToolId()` cobre a maioria; para retângulo/elipse
 * é preciso também comparar `editor.getStyleForNextShape(GeoShapeGeoStyle)`
 * (`Editor.ts` — `getStyleForNextShape`), senão os dois acendem juntos sempre
 * que a ferramenta corrente é `geo`. Ambos lidos via `useValue` para reagir a
 * mudança de ferramenta/estilo feita também pelo teclado (atalhos nativos:
 * este componente não intercepta teclado, só espelha o estado do editor).
 *
 * `.tlui-layout__bottom__main` (onde este slot é montado) já é
 * `display:flex; justify-content:center` e o ancestral `.tlui-layout` é
 * `pointer-events:none` — por isso só precisamos de `pointer-events:auto`
 * aqui, sem `position:absolute` manual (ver TldrawUi.tsx / tldraw.css).
 *
 * ## Paleta RPG (Parede, Porta, Janela, Escada)
 *
 * Parede/Porta/Janela usam o MESMO mecanismo geo acima: `editor.run(() => {
 * setStyleForNextShapes(cada style do elemento); setCurrentTool('geo') })`.
 *
 * Botão ativo da paleta: compara `geo` E TODOS os `estilos` do elemento contra o
 * estado corrente, num único `useValue` (as leituras de `getStyleForNextShape`
 * dentro do computed são todas rastreadas). Comparar só a cor acendia "Porta"
 * quando o usuário escolhia laranja à mão no painel de estilos sem nunca tocar na
 * paleta — e, pela precedência abaixo, ainda apagava "Retângulo" por tabela.
 *
 * Colisão entre grupos (fix de review): Parede/Porta/Janela pré-estilam
 * `GeoShapeGeoStyle` como `'rectangle'`, então sem tratamento os botões genéricos
 * "Retângulo"/"Elipse" acendiam junto com o elemento da paleta sempre que a
 * ferramenta corrente é `geo` + `rectangle` (mesmo estado que qualquer um dos 3
 * elementos deixa). Regra escolhida: a paleta tem precedência — `elementoAtivo`
 * (primeiro elemento da paleta cuja cor bate) é calculado uma vez, e o botão
 * "Retângulo"/"Elipse" só acende quando NENHUM elemento da paleta está ativo.
 *
 * Escada, muralha e torre são botões de AÇÃO, não de ferramenta: cada uma cria na hora
 * um shape próprio (`escada-mapa`/`muralha-mapa`/`torre-mapa`) centrado na viewport, via
 * `editor.createShape` — mesma mecânica de `criarCorredor`/`criarSala` (decisão
 * documentada em `src/lib/paletaMapa.ts` e nos respectivos `lib/*Mapa.ts`).
 *
 * ## Liga/desliga da grade (fix de review — Fatia 3, Task B)
 *
 * Morava num botão no canto de interseção das réguas (`ReguasMapa.tsx`), mas esse
 * canto fica em `top:0; left:0` com `z-index:260` — ATRÁS do MainMenu nativo do
 * tldraw (`.tlui-menu-zone`, mesmo canto, `z-index:300`), que capturava o clique
 * primeiro. Movido pra cá: botão de AÇÃO (não muda ferramenta), estado espelhado de
 * `editor.getInstanceState().isGridMode` via `useValue` (mesmo padrão de `toolId`/
 * `geoAtual` acima), alternado com `editor.updateInstanceState({ isGridMode: !atual })`
 * — a mesma chamada que `MapaView.tsx` usa para ligar a grade por padrão no `onMount`.
 *
 * ## Barra contextual de alinhar/distribuir (Fatia 3, Task D)
 *
 * Aparece ACIMA da toolbar principal, não dentro dela: `.tlui-layout__bottom__main` é
 * `justify-content: center` (tldraw.css:3007-3012), então engordar a fileira de baixo
 * empurraria horizontalmente todos os botões já existentes toda vez que a seleção
 * passasse de 1 para 2 formas — o botão que o usuário ia clicar fugiria do lugar. Numa
 * segunda linha, a toolbar principal fica parada.
 *
 * Sem animação de entrada, de propósito: selecionar formas é a ação mais repetida da
 * tela, e movimento repetido vira ruído e lentidão percebida.
 */
export function MapaToolbar() {
  const editor = useEditor()

  const toolId = useValue('mapa-toolbar-tool-atual', () => editor.getCurrentToolId(), [editor])
  const qtdSelecionada = useValue('mapa-toolbar-qtd-selecionada', () => editor.getSelectedShapeIds().length, [editor])
  const geoAtual = useValue(
    'mapa-toolbar-geo-atual',
    () => editor.getStyleForNextShape(GeoShapeGeoStyle),
    [editor],
  )
  const isGridMode = useValue('mapa-toolbar-grade', () => editor.getInstanceState().isGridMode, [editor])
  /**
   * O que os botões de canto ACENDEM, e se eles estão disponíveis.
   *
   * Com seleção, o aceso vem da SELEÇÃO, não do padrão guardado: o painel de propriedades
   * mostra o canto da peça selecionada, e as duas superfícies exibindo valores diferentes na
   * mesma tela fariam o usuário clicar no botão "já aceso" achando que confirma o estado — e
   * converter a peça sem querer. Seleção mista (uma reta, uma arredondada) não acende
   * nenhum: não há valor comum para mostrar.
   *
   * `disponivel` é falso quando há seleção e NENHUMA peça dela tem canto (parede da paleta,
   * sala, e todo retângulo `geo` de mapa antigo). Sem isso o botão acendia e nada acontecia
   * — feedback positivo para ação que não ocorreu, pior que botão desabilitado.
   */
  const canto = useValue(
    'mapa-toolbar-canto',
    () => {
      const selecionadas = editor.getSelectedShapeIds().map((id) => editor.getShape(id))
      const comCanto = selecionadas.filter((s): s is NonNullable<typeof s> => !!s && aceitaCanto(s.type))
      if (selecionadas.length === 0) return { aceso: cantoAtivoAtom(editor).get(), disponivel: true }
      if (comCanto.length === 0) return { aceso: null, disponivel: false }
      const valores = new Set(comCanto.map((s) => cantoDaPeca(s)))
      return { aceso: valores.size === 1 ? [...valores][0] : null, disponivel: true }
    },
    [editor],
  )
  // Elemento da paleta cujo estado corrente bate POR INTEIRO (geo + todos os estilos).
  // Tem precedência sobre Retângulo/Elipse — ver JSDoc "Colisão entre grupos".
  const elementoPaletaAtivo = useValue(
    'mapa-toolbar-paleta-ativa',
    () => {
      /**
       * Peça de CONSTRUÇÃO agora arma uma ferramenta, e o botão dela tem que acender
       * enquanto ela está armada — senão o usuário clica em "Sala", nada aparece na tela (o
       * certo: ele ainda vai desenhar) e nada na interface diz que o próximo clique no canvas
       * vira uma sala. Modo sem indicação lê como botão quebrado.
       *
       * O `id` da ferramenta é o tipo do shape (`sala-mapa`), e o `id` do elemento da paleta
       * é o nome curto (`sala`) — `FERRAMENTA_DA_PECA` é a única tabela entre os dois, então
       * a busca é por ela e não por uma segunda lista que poderia discordar.
       */
      const ferramentaAtual = editor.getCurrentToolId()
      const pecaDesenhada = Object.keys(FERRAMENTA_DA_PECA).find(
        (peca) => FERRAMENTA_DA_PECA[peca] === ferramentaAtual,
      )
      if (pecaDesenhada) return ELEMENTOS_PALETA.find((e) => e.id === pecaDesenhada)

      if (ferramentaAtual !== 'geo') return undefined
      const geo = editor.getStyleForNextShape(GeoShapeGeoStyle)
      return ELEMENTOS_PALETA.find(
        (e) =>
          e.geo === geo &&
          Object.entries(e.estilos).every(([nome, valor]) => {
            const style = STYLE_PROPS_POR_NOME[nome]
            return style !== undefined && editor.getStyleForNextShape(style) === valor
          }),
      )
    },
    [editor],
  )

  function selecionarFerramenta(id: string) {
    editor.setCurrentTool(id)
  }

  function alternarGrade() {
    editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode })
  }

  function selecionarGeo(geo: 'rectangle' | 'ellipse') {
    editor.run(() => {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
      editor.setCurrentTool('geo')
    })
  }

  /**
   * Canto reto/arredondado. Um clique faz as DUAS coisas, como no Excalidraw: vira o padrão
   * das próximas peças E aplica na seleção atual, se houver. Sem aplicar na seleção, trocar
   * o canto exigiria apagar e redesenhar; sem virar padrão, cada peça nova voltaria ao
   * arredondado e o usuário reclicaria o botão a cada desenho.
   */
  function escolherCanto(canto: CantoMapa) {
    editor.run(() => {
      setCantoAtivo(editor, canto)
      aplicarCanto(editor, editor.getSelectedShapeIds(), canto)
    })
  }

  function aplicarElementoPaleta(elemento: ElementoPaleta) {
    if (elemento.tipo === 'acao') {
      const ferramenta = FERRAMENTA_DA_PECA[elemento.id]
      if (ferramenta) editor.setCurrentTool(ferramenta)
      else if (elemento.simbolo) criarSimbolo(elemento.simbolo)
      return
    }

    editor.run(() => {
      if (elemento.geo) editor.setStyleForNextShapes(GeoShapeGeoStyle, elemento.geo)
      for (const [nomeStyle, valor] of Object.entries(elemento.estilos)) {
        const style = STYLE_PROPS_POR_NOME[nomeStyle]
        if (style) editor.setStyleForNextShapes(style, valor)
      }
      const ferramenta =
        elemento.tipo === 'texto' ? 'text' : elemento.tipo === 'linha' ? 'line' : 'geo'
      editor.setCurrentTool(ferramenta)
    })
  }

  /**
   * Cria um símbolo DESENHADO no centro da tela (janela, secreta, armadilha, marcador,
   * mesa, cama, baú). Nasce selecionado para o usuário já arrastar até o lugar.
   *
   * O marcador é o único que carrega texto: o número sai de `proximoNumero` (lib pura)
   * lendo o `rotulo` dos marcadores que já existem na página. Somar 1 ao MAIOR, e não
   * contar quantos são, é o que evita repetir número depois de apagar um do meio.
   */
  function criarSimbolo(simbolo: SimboloId) {
    const centro = editor.getViewportPageBounds().center
    const { w, h } = tamanhoDoSimbolo(simbolo)

    let rotulo = ''
    if (definicaoDoSimbolo(simbolo)?.numerado) {
      const existentes = editor
        .getCurrentPageShapes()
        .filter((s) => s.type === 'simbolo-mapa')
        .map((s) => s as unknown as { props: { simbolo: string; rotulo: string } })
        .filter((s) => s.props.simbolo === simbolo)
        .map((s) => s.props.rotulo)
      rotulo = String(proximoNumero(existentes))
    }

    const id = createShapeId()
    editor.run(() => {
      editor.createShape({
        id,
        type: 'simbolo-mapa',
        x: centro.x - w / 2,
        y: centro.y - h / 2,
        props: { w, h, simbolo, rotulo },
      })
      editor.setCurrentTool('select')
      editor.setSelectedShapes([id])
    })
  }

  const botoes: Array<{ titulo: string; icone: string; ativo: boolean; aoClicar: () => void }> = [
    { titulo: 'Selecionar', icone: '↖', ativo: toolId === 'select', aoClicar: () => selecionarFerramenta('select') },
    { titulo: 'Mão', icone: '✋', ativo: toolId === 'hand', aoClicar: () => selecionarFerramenta('hand') },
    { titulo: 'Caneta', icone: '✏️', ativo: toolId === 'draw', aoClicar: () => selecionarFerramenta('draw') },
    {
      // Peça PRÓPRIA do mapa (`retangulo-mapa`), não mais o `geo` nativo: só assim o canto
      // arredondado existe (o `geo` do tldraw não tem raio de canto) e a peça ganha cor
      // livre, espessura e preenchimento — ver `lib/retanguloMapa.ts`.
      titulo: 'Retângulo',
      icone: '▭',
      ativo: toolId === 'retangulo-mapa',
      aoClicar: () => selecionarFerramenta('retangulo-mapa'),
    },
    {
      titulo: 'Elipse',
      icone: '◯',
      ativo: toolId === 'geo' && geoAtual === 'ellipse' && !elementoPaletaAtivo,
      aoClicar: () => selecionarGeo('ellipse'),
    },
    { titulo: 'Linha', icone: '／', ativo: toolId === 'line', aoClicar: () => selecionarFerramenta('line') },
    { titulo: 'Texto', icone: 'T', ativo: toolId === 'text', aoClicar: () => selecionarFerramenta('text') },
    {
      // Peça C: o `eraser` foi trocado por `BorrachaTrechoMapaTool` (mesmo id, ver
      // MapaView.tsx) — em cima de uma divisória apaga só o trecho coberto; em
      // qualquer outra peça continua apagando o shape inteiro, como sempre foi.
      titulo: 'Borracha (em divisórias, apaga só o trecho passado)',
      icone: '⌫',
      ativo: toolId === 'eraser',
      aoClicar: () => selecionarFerramenta('eraser'),
    },
  ]

  return (
    <div className="mapa-toolbar-coluna">
      {qtdSelecionada >= 2 && (
        <div className="mapa-toolbar mapa-toolbar-contextual">
          {ALINHAMENTOS.map((a) => (
            <button
              key={a.operacao}
              type="button"
              className="btn-icon"
              title={a.titulo}
              onClick={() => editor.alignShapes(editor.getSelectedShapeIds(), a.operacao)}
            >
              {a.icone}
            </button>
          ))}
          <div className="mapa-toolbar-divisor" aria-hidden="true" />
          {DISTRIBUICOES.map((d) => (
            <button
              key={d.operacao}
              type="button"
              className="btn-icon"
              title={
                qtdSelecionada < MINIMO_PARA_DISTRIBUIR
                  ? `${d.titulo} (precisa de ${MINIMO_PARA_DISTRIBUIR} formas)`
                  : d.titulo
              }
              disabled={qtdSelecionada < MINIMO_PARA_DISTRIBUIR}
              onClick={() => editor.distributeShapes(editor.getSelectedShapeIds(), d.operacao)}
            >
              {d.icone}
            </button>
          ))}
        </div>
      )}
      <div className="mapa-toolbar">
        {botoes.map((b) => (
          <button
            key={b.titulo}
            type="button"
            className={`btn-icon${b.ativo ? ' ativo' : ''}`}
            title={b.titulo}
            onClick={b.aoClicar}
          >
            {b.icone}
          </button>
        ))}
        <button
          type="button"
          className={`btn-icon${isGridMode ? ' ativo' : ''}`}
          title={isGridMode ? 'Esconder grade' : 'Mostrar grade'}
          onClick={alternarGrade}
        >
          ⊞
        </button>
        <div className="mapa-toolbar-divisor" aria-hidden="true" />
        {OPCOES_CANTO.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            className={`btn-icon${canto.aceso === opcao.id ? ' ativo' : ''}`}
            disabled={!canto.disponivel}
            title={
              canto.disponivel
                ? `Canto ${opcao.rotulo.toLowerCase()} (vale para a seleção e para as próximas peças)`
                : 'Nenhuma peça selecionada tem canto — só linha e retângulo do mapa têm'
            }
            onClick={() => escolherCanto(opcao.id)}
          >
            {opcao.icone}
          </button>
        ))}
        <div className="mapa-toolbar-divisor" aria-hidden="true" />
        <GavetaPecas pecaAtivaId={elementoPaletaAtivo?.id} aoEscolher={aplicarElementoPaleta} />
        <div className="mapa-toolbar-divisor" aria-hidden="true" />
        <ComandosMapa stylePropsPorNome={STYLE_PROPS_POR_NOME} />
        <AcoesMapaIA />
      </div>
    </div>
  )
}

