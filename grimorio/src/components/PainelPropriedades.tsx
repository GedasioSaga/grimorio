import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'
import { QUADRADO_PX, emQuadrados, parseQuadrados } from '../lib/quadrados'
import {
  ANCORAS_ROTULO,
  CORES_SALA,
  ESPESSURAS_SALA,
  ESPESSURA_CONTORNO_SALA,
  ESTADOS_SALA,
  FONTE_ROTULO_PADRAO,
  TAMANHOS_ROTULO,
  aparenciaDaSala,
  ehAncoraRotulo,
  type AncoraRotulo,
} from '../lib/salaMapa'
import { ehTipoSala } from '../lib/tiposSala'
import { definicaoDoSimbolo } from '../lib/simbolosMapa'
import { ESTADOS_PORTA, aparenciaDaPorta } from '../lib/portaMapa'
import { opcoesDeCenario, resolverVinculoSala } from '../lib/vinculoSalaCenario'
import { coletarCenarioRefs } from '../lib/cenarioArvore'
import { useApp } from '../state/store'
import { COR_LINHA_PADRAO, CORES_LINHA } from '../lib/coresLinha'
import { OPCOES_CANTO, cantoDeMeta, ehCantoMapa, type CantoMapa } from '../lib/cantosMapa'
import { RETANGULO_COR_PADRAO, RETANGULO_ESPESSURA_PADRAO } from '../lib/retanguloMapa'
import '../estilos/linha-mapa.css'
import '../estilos/mapa-formas.css'

/** Peças de desenho que aceitam canto reto/arredondado. */
const TIPOS_COM_CANTOS = new Set(['line', 'retangulo-mapa'])

/** Espessuras de traço oferecidas ao retângulo, em px de página. */
const ESPESSURAS_RETANGULO = [1, 2, 4, 6, 10]

/**
 * Snapshot reativo da seleção que os painéis precisam para se desenhar.
 *
 * `camadasDaSelecao` existe nas DUAS variantes porque quem consome não é só o painel de
 * propriedades: o painel de camadas destaca a linha da camada onde a seleção mora — sem
 * isso o usuário seleciona uma porta e não tem como descobrir de qual camada ela é, que é
 * metade da queixa "as camadas não funcionam". Photopea e Figma marcam a camada do objeto
 * selecionado pelo mesmo motivo.
 */
export type SelecaoPropriedades =
  | {
      tipo: 'single'
      id: TLShapeId
      x: number
      y: number
      w: number
      h: number
      /** tipo do shape tldraw ('sala-mapa', 'porta-mapa', 'geo'…) */
      tipoShape: string
      /** estado atual, quando a peça tem estado (sala e porta) */
      estado?: string
      /** texto que a própria forma desenha: nome do cômodo, número do marcador, andar */
      rotuloSala?: string
      /** símbolo desenhado, quando o shape é `simbolo-mapa` */
      simbolo?: string
      /** cor escolhida à mão na sala; vazio = usa a cor do estado */
      cor?: string
      /** id do Cenário vinculado à sala; vazio = sem vínculo (só faz sentido p/ sala — ver tiposSala.ts) */
      cenarioId?: string
      /** cor da divisória (`meta.corPersonalizada`, não `props` — ver LinhaMapaColoridaShapeUtil.tsx) */
      corLinha?: string
      /** canto reto/arredondado: `meta.cantos` na linha, `props.cantos` no retângulo — ver cantosMapa.ts */
      cantos?: CantoMapa
      /** espessura do traço em px: contorno da sala (os dois formatos) ou traço do retângulo */
      espessura?: number
      /** só `retangulo-mapa`: preenchimento ligado/desligado (sala é sempre preenchida) */
      preenchido?: boolean
      /** corpo, posição e orientação do nome do cômodo — só sala (ver `layoutDoRotulo`) */
      rotuloTamanho?: number
      rotuloAncora?: AncoraRotulo
      rotuloVertical?: boolean
      /** contorno da sala ligado/desligado */
      contorno?: boolean
      /** `meta.camada` da peça; vazio quando ela nunca foi carimbada (mapa antigo). */
      camadasDaSelecao: string[]
    }
  | {
      tipo: 'multi'
      w: number
      h: number
      /** ids selecionados, para as ações em lote */
      ids: TLShapeId[]
      /** tipos distintos na seleção; uma só entrada = seleção homogênea */
      tiposShape: string[]
      /**
       * Valor comum a TODAS as peças selecionadas, ou `undefined` quando elas discordam.
       *
       * Mostrar o valor da primeira peça seria mentira: o usuário veria "azul" com metade da
       * seleção vermelha e concluiria que já está tudo azul. `undefined` deixa o controle sem
       * opção acesa, que é a verdade — "não há um valor, escolha um".
       */
      estado?: string
      cor?: string
      espessura?: number
      contorno?: boolean
      rotuloTamanho?: number
      rotuloAncora?: AncoraRotulo
      rotuloVertical?: boolean
      camadasDaSelecao: string[]
    }
  | null

/**
 * Quantas peças moram em cada camada, por `meta.camada`. Peça sem camada conta na primeira
 * (mesma regra de `camadaDoShape`), então a soma bate com o total da página.
 *
 * Existe porque o painel de camadas não dizia NADA sobre o conteúdo: o usuário apertava o
 * olho de uma linha e o mapa inteiro sumia, sem que nada antes indicasse que aquela camada
 * guardava tudo e a outra estava vazia. É a informação que a miniatura resolve no Photoshop
 * e que aqui não faz sentido (peça de mapa é ícone, não pixel) — o número resolve igual.
 */
export type ContagemPorCamada = Record<string, number>

/**
 * `components.InFrontOfTheCanvas` do `<Tldraw>` é uma constante de módulo (motivo
 * inteiro em `COMPONENTS_MAPA_BASE`, lib/montagemMapa.tsx: identidade instável por
 * chave remontaria aquele slot, perdendo o estado local dele — mecanismo diferente do
 * `getShapeVisibilityRef` do MapaView, que recria o EDITOR inteiro), então não dá pra
 * passar o `setSelecaoProp` de uma instância de MapaView como prop direta pro
 * `MapaOverlayBase`/`SelecaoPropriedadesBridge`. Um Context resolve: o Provider é
 * montado DENTRO do MapaView (escopo por instância), e o valor chega à ponte não
 * importa onde ela seja renderizada dentro da árvore do `<Tldraw>`.
 */
const SelecaoPropriedadesContext = createContext<(s: SelecaoPropriedades) => void>(() => {})
export const ProvedorSelecaoPropriedades = SelecaoPropriedadesContext.Provider

/** Mesma ponte, para a contagem de peças por camada — ver `ContagemPorCamada`. */
const ContagemCamadasContext = createContext<(c: ContagemPorCamada) => void>(() => {})
export const ProvedorContagemCamadas = ContagemCamadasContext.Provider

/**
 * Ponte para dentro da árvore do `<Tldraw>`: só ela usa `useEditor`/`useValue` (exige
 * o `EditorContext` que o `<Tldraw>` provê aos próprios filhos — por isso vive no
 * slot `InFrontOfTheCanvas`, igual `MedidasMapa`/`ReguasMapa`). Reporta a seleção pro
 * MapaView via Context, que guarda em `useState` e repassa como prop pro
 * `PainelPropriedades` — componente burro, sibling do `<Tldraw>`, MESMO padrão do
 * `PainelCamadas` (estado no MapaView, painel só apresenta). Sem essa ponte, o painel
 * teria que morar dentro do `<Tldraw>` e brigar de z-index/posição com o `PainelCamadas`,
 * que é um sibling fora dele.
 */
export function SelecaoPropriedadesBridge() {
  const editor = useEditor()
  const onChange = useContext(SelecaoPropriedadesContext)
  const onContagem = useContext(ContagemCamadasContext)

  // reage a criar/apagar/mover-de-camada, porque `getCurrentPageShapes` é rastreado.
  const contagem = useValue(
    'mapa-contagem-camadas',
    (): ContagemPorCamada => {
      const por: ContagemPorCamada = {}
      for (const shape of editor.getCurrentPageShapes()) {
        const camada = (shape.meta as Record<string, unknown>).camada
        const chave = typeof camada === 'string' ? camada : ''
        por[chave] = (por[chave] ?? 0) + 1
      }
      return por
    },
    [editor],
  )

  useEffect(() => onContagem(contagem), [contagem, onContagem])

  const selecao = useValue(
    'mapa-propriedades-selecao',
    (): SelecaoPropriedades => {
      const ids = editor.getSelectedShapeIds()
      if (ids.length === 0) return null
      const camadasDaSelecao = [
        ...new Set(
          ids
            .map((sid) => (editor.getShape(sid)?.meta as Record<string, unknown> | undefined)?.camada)
            .filter((c): c is string => typeof c === 'string'),
        ),
      ]
      if (ids.length > 1) {
        const bounds = editor.getSelectionPageBounds()
        if (!bounds) return null
        const formas = ids.map((sid) => editor.getShape(sid)).filter((f): f is NonNullable<typeof f> => !!f)

        /** Valor da prop quando TODAS concordam; `undefined` quando discordam. */
        function comum<T>(ler: (p: Record<string, unknown>) => T | undefined): T | undefined {
          let visto: T | undefined
          for (const forma of formas) {
            const v = ler(forma.props as Record<string, unknown>)
            if (v === undefined) return undefined
            if (visto === undefined) visto = v
            else if (visto !== v) return undefined
          }
          return visto
        }

        return {
          tipo: 'multi',
          w: bounds.w,
          h: bounds.h,
          ids,
          tiposShape: [...new Set(formas.map((f) => f.type))],
          estado: comum((p) => (typeof p.estado === 'string' ? p.estado : undefined)),
          cor: comum((p) => (typeof p.cor === 'string' ? p.cor : undefined)),
          espessura: comum((p) => (typeof p.espessura === 'number' ? p.espessura : undefined)),
          contorno: comum((p) => (typeof p.contorno === 'boolean' ? p.contorno : undefined)),
          rotuloTamanho: comum((p) => (typeof p.rotuloTamanho === 'number' ? p.rotuloTamanho : undefined)),
          rotuloAncora: comum((p) => (ehAncoraRotulo(p.rotuloAncora) ? p.rotuloAncora : undefined)),
          rotuloVertical: comum((p) => (typeof p.rotuloVertical === 'boolean' ? p.rotuloVertical : undefined)),
          camadasDaSelecao,
        }
      }
      const id = ids[0]
      const bounds = editor.getShapePageBounds(id)
      if (!bounds) return null
      const forma = editor.getShape(id)
      const props = (forma?.props ?? {}) as Record<string, unknown>
      const meta = (forma?.meta ?? {}) as Record<string, unknown>
      return {
        tipo: 'single',
        id,
        x: bounds.x,
        y: bounds.y,
        w: bounds.w,
        h: bounds.h,
        tipoShape: forma?.type ?? '',
        estado: typeof props.estado === 'string' ? props.estado : undefined,
        rotuloSala: typeof props.rotulo === 'string' ? props.rotulo : undefined,
        simbolo: typeof props.simbolo === 'string' ? props.simbolo : undefined,
        cor: typeof props.cor === 'string' ? props.cor : undefined,
        cenarioId: typeof props.cenarioId === 'string' ? props.cenarioId : undefined,
        corLinha: typeof meta.corPersonalizada === 'string' ? meta.corPersonalizada : undefined,
        // linha guarda em `meta` (tipo nativo, não aceita prop nova); retângulo em `props`.
        cantos: ehCantoMapa(props.cantos) ? props.cantos : forma?.type === 'line' ? cantoDeMeta(meta) : undefined,
        espessura: typeof props.espessura === 'number' ? props.espessura : undefined,
        preenchido: typeof props.preenchido === 'boolean' ? props.preenchido : undefined,
        rotuloTamanho: typeof props.rotuloTamanho === 'number' ? props.rotuloTamanho : undefined,
        rotuloAncora: ehAncoraRotulo(props.rotuloAncora) ? props.rotuloAncora : undefined,
        rotuloVertical: typeof props.rotuloVertical === 'boolean' ? props.rotuloVertical : undefined,
        contorno: typeof props.contorno === 'boolean' ? props.contorno : undefined,
        camadasDaSelecao,
      }
    },
    [editor],
  )

  useEffect(() => onChange(selecao), [selecao, onChange])

  return null
}

/**
 * Painel de propriedades do Mapa (Task C, fatia 3): coluna direita do `.mapa-wrap`,
 * ACIMA do `PainelCamadas` — componente burro, só apresenta `selecao` e chama os
 * callbacks; quem lê/escreve no editor é o MapaView (via `SelecaoPropriedadesBridge`
 * + as funções `aoAplicar*`), mesmo padrão do `PainelCamadas`.
 *
 * Mover (X/Y): quem aplica (`MapaView`) usa `editor.updateShape({x,y})`, que espera
 * coordenadas do PARENT space, convertidas de page space com
 * `editor.getPointInParentSpace` — ver comentário completo no MapaView.
 * Redimensionar (L/A): `editor.resizeShape(id, scale, { scaleOrigin })` — idem.
 */
export function PainelPropriedades({
  selecao,
  aoAplicarX,
  aoAplicarY,
  aoAplicarL,
  aoAplicarA,
  aoTrocarEstado,
  aoRenomearSala,
  aoTrocarCor,
  aoVincularCenario,
  aoTrocarCorLinha,
  pegandoCorLinhaId,
  aoIniciarContaGotasLinha,
  aoTrocarCantos,
  aoTrocarEspessura,
  aoTrocarPreenchido,
  aoTrocarEstiloRotulo,
  aoTrocarContorno,
  aoAplicarEmLote,
}: {
  selecao: SelecaoPropriedades
  aoAplicarX: (id: TLShapeId, quadrados: number) => void
  aoAplicarY: (id: TLShapeId, quadrados: number) => void
  aoAplicarL: (id: TLShapeId, quadrados: number) => void
  aoAplicarA: (id: TLShapeId, quadrados: number) => void
  aoTrocarEstado: (id: TLShapeId, estado: string) => void
  aoRenomearSala: (id: TLShapeId, nome: string) => void
  aoTrocarCor: (id: TLShapeId, cor: string) => void
  aoVincularCenario: (id: TLShapeId, cenarioId: string) => void
  /** cor da divisória — ver `SeletorCorLinha` */
  aoTrocarCorLinha: (id: TLShapeId, cor: string) => void
  /** id da linha aguardando o clique do conta-gotas; `null` = conta-gotas inativo */
  pegandoCorLinhaId: TLShapeId | null
  aoIniciarContaGotasLinha: (id: TLShapeId | null) => void
  /** canto reto/arredondado da peça selecionada (linha ou retângulo) */
  aoTrocarCantos: (id: TLShapeId, canto: CantoMapa) => void
  aoTrocarEspessura: (id: TLShapeId, espessura: number) => void
  aoTrocarPreenchido: (id: TLShapeId, preenchido: boolean) => void
  /** corpo/posição/orientação do nome do cômodo; só as chaves que mudaram */
  aoTrocarEstiloRotulo: (id: TLShapeId, estilo: EstiloRotuloPainel) => void
  /** liga/desliga a linha de contorno da sala */
  aoTrocarContorno: (id: TLShapeId, ligado: boolean) => void
  /** roda a mesma ação em várias peças como um gesto só (um Ctrl+Z) */
  aoAplicarEmLote: (ids: TLShapeId[], aplicar: (id: TLShapeId) => void) => void
}) {
  const [colapsado, setColapsado] = useState(false)

  if (!selecao) return null

  if (colapsado) {
    return (
      <button
        type="button"
        className="painel-propriedades-reabrir"
        title="Mostrar propriedades"
        onClick={() => setColapsado(false)}
      >
        📐
      </button>
    )
  }

  return (
    <div className="painel-propriedades">
      <div className="painel-propriedades-cabecalho">
        <span>Propriedades</span>
        <button type="button" className="btn-icon" title="Esconder painel" onClick={() => setColapsado(true)}>»</button>
      </div>
      {selecao.tipo === 'multi' ? (
        <>
          <div className="painel-propriedades-multi">
            {selecao.ids.length} peças · {medidaMulti(selecao.w, selecao.h)}
          </div>
          {(() => {
            const lote = (aplicar: (id: TLShapeId) => void) => aoAplicarEmLote(selecao.ids, aplicar)
            const soSalas = selecao.tiposShape.every((t) => ehTipoSala(t))
            const estados = estadosComunsDaSelecao(selecao.tiposShape)
            return (
              <>
                {estados.length > 0 && (
                  <SeletorEstado
                    opcoes={estados}
                    atual={selecao.estado}
                    onEscolher={(estado) => lote((id) => aoTrocarEstado(id, estado))}
                  />
                )}
                {soSalas && (
                  <SeletorCor
                    atual={selecao.cor ?? ''}
                    onEscolher={(cor) => lote((id) => aoTrocarCor(id, cor))}
                  />
                )}
                {soSalas && (
                  <SeletorEspessura
                    titulo="Contorno"
                    opcoes={ESPESSURAS_SALA}
                    espessura={selecao.espessura ?? ESPESSURA_CONTORNO_SALA}
                    onEspessura={(px) =>
                      lote((id) => {
                        aoTrocarContorno(id, true)
                        aoTrocarEspessura(id, px)
                      })
                    }
                    desligado={selecao.contorno === false}
                    onDesligar={() => lote((id) => aoTrocarContorno(id, false))}
                  />
                )}
                {soSalas && (
                  <SeletorRotulo
                    tamanho={selecao.rotuloTamanho ?? FONTE_ROTULO_PADRAO}
                    ancora={selecao.rotuloAncora ?? 'topo'}
                    vertical={selecao.rotuloVertical ?? false}
                    onMudar={(estilo) => lote((id) => aoTrocarEstiloRotulo(id, estilo))}
                  />
                )}
              </>
            )
          })()}
        </>
      ) : (
        // key = id da forma: força remount ao trocar de seleção, descartando rascunho
        // de edição em andamento de uma forma que deixou de ser a selecionada.
        <div key={selecao.id}>
          {rotuloEditavel(selecao.tipoShape, selecao.simbolo) && (
            <CampoNome
              titulo={tituloDoCampoTexto(selecao.tipoShape, selecao.simbolo)}
              valor={selecao.rotuloSala ?? ''}
              onAplicar={(nome) => aoRenomearSala(selecao.id, nome)}
            />
          )}
          {ehTipoSala(selecao.tipoShape) && (
            <SeletorRotulo
              tamanho={selecao.rotuloTamanho ?? FONTE_ROTULO_PADRAO}
              ancora={selecao.rotuloAncora ?? 'topo'}
              vertical={selecao.rotuloVertical ?? false}
              onMudar={(estilo) => aoTrocarEstiloRotulo(selecao.id, estilo)}
            />
          )}
          {estadosDaPeca(selecao.tipoShape).length > 0 && (
            <SeletorEstado
              opcoes={estadosDaPeca(selecao.tipoShape)}
              atual={selecao.estado}
              onEscolher={(estado) => aoTrocarEstado(selecao.id, estado)}
            />
          )}
          {ehTipoSala(selecao.tipoShape) && (
            <SeletorCor atual={selecao.cor ?? ''} onEscolher={(cor) => aoTrocarCor(selecao.id, cor)} />
          )}
          {ehTipoSala(selecao.tipoShape) && (
            <SeletorEspessura
              titulo="Contorno"
              opcoes={ESPESSURAS_SALA}
              espessura={selecao.espessura ?? ESPESSURA_CONTORNO_SALA}
              onEspessura={(px) => {
                // escolher uma espessura RELIGA o contorno: quem clica numa grossura está
                // pedindo para ver a linha, e exigir dois cliques para isso seria pegadinha.
                aoTrocarContorno(selecao.id, true)
                aoTrocarEspessura(selecao.id, px)
              }}
              desligado={selecao.contorno === false}
              onDesligar={() => aoTrocarContorno(selecao.id, false)}
            />
          )}
          {ehTipoSala(selecao.tipoShape) && (
            <SeletorCenarioDaSala
              atual={selecao.cenarioId ?? ''}
              onEscolher={(cenarioId) => aoVincularCenario(selecao.id, cenarioId)}
            />
          )}
          {selecao.tipoShape === 'line' && (
            <SeletorCorLinha
              atual={selecao.corLinha ?? COR_LINHA_PADRAO}
              pegandoCor={pegandoCorLinhaId === selecao.id}
              onEscolher={(cor) => aoTrocarCorLinha(selecao.id, cor)}
              onContaGotas={() => aoIniciarContaGotasLinha(pegandoCorLinhaId === selecao.id ? null : selecao.id)}
            />
          )}
          {selecao.tipoShape === 'retangulo-mapa' && (
            <SeletorCorLinha
              titulo="Cor do traço"
              atual={selecao.cor || RETANGULO_COR_PADRAO}
              pegandoCor={pegandoCorLinhaId === selecao.id}
              onEscolher={(cor) => aoTrocarCorLinha(selecao.id, cor)}
              onContaGotas={() => aoIniciarContaGotasLinha(pegandoCorLinhaId === selecao.id ? null : selecao.id)}
            />
          )}
          {TIPOS_COM_CANTOS.has(selecao.tipoShape) && (
            <SeletorCantos atual={selecao.cantos} onEscolher={(canto) => aoTrocarCantos(selecao.id, canto)} />
          )}
          {selecao.tipoShape === 'retangulo-mapa' && (
            <SeletorTracoRetangulo
              espessura={selecao.espessura ?? RETANGULO_ESPESSURA_PADRAO}
              preenchido={selecao.preenchido ?? false}
              onEspessura={(px) => aoTrocarEspessura(selecao.id, px)}
              onPreenchido={(ligado) => aoTrocarPreenchido(selecao.id, ligado)}
            />
          )}
          <div className="painel-propriedades-grade">
          <CampoQuadrado label="X" valorPx={selecao.x} onAplicar={(q) => aoAplicarX(selecao.id, q)} />
          <CampoQuadrado label="Y" valorPx={selecao.y} onAplicar={(q) => aoAplicarY(selecao.id, q)} />
          <CampoQuadrado label="L" valorPx={selecao.w} onAplicar={(q) => aoAplicarL(selecao.id, q)} minimoPositivo />
          <CampoQuadrado label="A" valorPx={selecao.h} onAplicar={(q) => aoAplicarA(selecao.id, q)} minimoPositivo />
          </div>
        </div>
      )}
    </div>
  )
}

/** Só as chaves que mudaram — o handler mescla no shape. */
export interface EstiloRotuloPainel {
  tamanho?: number
  ancora?: AncoraRotulo
  vertical?: boolean
}

/**
 * Nome do cômodo: corpo, onde fica dentro da sala, e se corre deitado ou em pé.
 *
 * As três moram num bloco só porque são a MESMA decisão do mestre ("como esse nome aparece
 * na planta"), tomada de uma vez enquanto ele olha para a sala. Espalhadas em três seções
 * do painel, cada ajuste exigiria procurar a próxima.
 *
 * Em pé serve ao caso que o mapa cria sozinho: corredor e ala estreitos e altos, onde
 * "Salão de Armas" deitado quebra em quatro linhas ou vaza pela parede. É rotação do bloco
 * inteiro, não `writing-mode` — ver `layoutDoRotulo`.
 */
function SeletorRotulo({
  tamanho,
  ancora,
  vertical,
  onMudar,
}: {
  tamanho: number
  ancora: AncoraRotulo
  vertical: boolean
  onMudar: (estilo: EstiloRotuloPainel) => void
}) {
  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">Nome — tamanho</span>
      <div className="painel-estado-opcoes painel-opcoes-lado-a-lado">
        {TAMANHOS_ROTULO.map((px) => (
          <button
            key={px}
            type="button"
            className={`painel-estado-opcao painel-opcao-tamanho-rotulo${tamanho === px ? ' ativo' : ''}`}
            title={`Corpo ${px}px`}
            aria-label={`Tamanho do nome: ${px} pixels`}
            aria-pressed={tamanho === px}
            onClick={() => onMudar({ tamanho: px })}
          >
            {/* a própria amostra usa o corpo que ela representa: escolher tamanho de texto
                por um número exige imaginar o resultado; por uma amostra, não. */}
            <span style={{ fontSize: Math.min(px, 16), lineHeight: 1 }}>A</span>
          </button>
        ))}
      </div>

      <span className="painel-propriedades-label painel-rotulo-sub">Posição</span>
      <div className="painel-estado-opcoes painel-opcoes-lado-a-lado">
        {ANCORAS_ROTULO.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            className={`painel-estado-opcao${ancora === opcao.id ? ' ativo' : ''}`}
            title={`Nome no ${opcao.rotulo.toLowerCase()} da sala`}
            aria-pressed={ancora === opcao.id}
            onClick={() => onMudar({ ancora: opcao.id })}
          >
            <span aria-hidden="true">{opcao.icone}</span>
            {opcao.rotulo}
          </button>
        ))}
      </div>

      <span className="painel-propriedades-label painel-rotulo-sub">Direção</span>
      <div className="painel-estado-opcoes painel-opcoes-lado-a-lado">
        <button
          type="button"
          className={`painel-estado-opcao${!vertical ? ' ativo' : ''}`}
          title="Nome deitado"
          aria-pressed={!vertical}
          onClick={() => onMudar({ vertical: false })}
        >
          <span aria-hidden="true">→</span>
          Deitado
        </button>
        <button
          type="button"
          className={`painel-estado-opcao${vertical ? ' ativo' : ''}`}
          title="Nome em pé — para cômodo estreito e alto"
          aria-pressed={vertical}
          onClick={() => onMudar({ vertical: true })}
        >
          <span aria-hidden="true">↑</span>
          Em pé
        </button>
      </div>
    </div>
  )
}

function medidaMulti(wPx: number, hPx: number): string {
  return `${emQuadrados(wPx, QUADRADO_PX)}×${emQuadrados(hPx, QUADRADO_PX)}`
}

function CampoQuadrado({
  label,
  valorPx,
  onAplicar,
  minimoPositivo,
}: {
  label: string
  valorPx: number
  onAplicar: (quadrados: number) => void
  minimoPositivo?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState('')

  const exibido = editando ? rascunho : emQuadrados(valorPx, QUADRADO_PX)

  function aplicar() {
    setEditando(false)
    const numero = parseQuadrados(rascunho)
    if (numero === null) return // inválido: reverte pro valor atual sem aplicar
    if (minimoPositivo && numero <= 0) return
    onAplicar(numero)
  }

  return (
    <label className="painel-propriedades-campo">
      <span className="painel-propriedades-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="painel-propriedades-input"
        value={exibido}
        onFocus={() => {
          setRascunho(emQuadrados(valorPx, QUADRADO_PX))
          setEditando(true)
        }}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          /**
           * Escape tem que descartar o RASCUNHO, não só sair do modo de edição.
           *
           * `setEditando(false)` sozinho fazia o campo voltar a MOSTRAR o valor certo, o que
           * parecia cancelar — mas `rascunho` continuava com o texto abandonado, e o
           * `onBlur` logo em seguida chama `aplicar()`, que lê `rascunho`. Digitar 999 em X,
           * apertar Esc e clicar em qualquer outro lugar mandava a sala para 999 quadrados,
           * fora da tela. `CampoNome`, no mesmo arquivo, sempre fez isto certo.
           */
          if (e.key === 'Escape') {
            setRascunho(emQuadrados(valorPx, QUADRADO_PX))
            setEditando(false)
          }
        }}
      />
    </label>
  )
}

/**
 * Estados que TODOS os tipos da seleção aceitam.
 *
 * Interseção e não união: oferecer "trancada" com uma sala na seleção deixaria o clique sem
 * efeito em metade das peças, e um controle que às vezes não faz nada é pior que um controle
 * ausente. Tipos sem estado em comum devolvem lista vazia e o seletor some.
 */
function estadosComunsDaSelecao(tipos: string[]): Array<{ id: string; rotulo: string; cor: string }> {
  if (tipos.length === 0) return []
  const listas = tipos.map((t) => estadosDaPeca(t))
  if (listas.some((l) => l.length === 0)) return []
  const [primeira, ...resto] = listas
  return primeira.filter((op) => resto.every((l) => l.some((o) => o.id === op.id)))
}

/**
 * Estados que a peça selecionada aceita. Peça sem estado (parede, símbolo, forma comum)
 * devolve lista vazia e o seletor nem aparece — o painel só mostra o que faz sentido
 * para o que está selecionado.
 */
function estadosDaPeca(tipoShape: string): Array<{ id: string; rotulo: string; cor: string }> {
  if (ehTipoSala(tipoShape)) {
    return ESTADOS_SALA.map((estado) => {
      const a = aparenciaDaSala(estado)
      return { id: estado, rotulo: a.rotulo, cor: a.preenchimento }
    })
  }
  if (tipoShape === 'porta-mapa') {
    return ESTADOS_PORTA.map((estado) => {
      const a = aparenciaDaPorta(estado)
      return { id: estado, rotulo: a.rotulo, cor: a.cor }
    })
  }
  return []
}

/**
 * Seletor de estado: cada opção mostra a PRÓPRIA COR, porque no mapa é a cor que carrega
 * o significado — ler "Já limpei" e ver o azul ao lado ensina a legenda sem texto extra.
 */
function SeletorEstado({
  opcoes,
  atual,
  onEscolher,
}: {
  opcoes: Array<{ id: string; rotulo: string; cor: string }>
  atual: string | undefined
  onEscolher: (estado: string) => void
}) {
  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">Estado</span>
      <div className="painel-estado-opcoes">
        {opcoes.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            className={`painel-estado-opcao${atual === opcao.id ? ' ativo' : ''}`}
            title={opcao.rotulo}
            onClick={() => onEscolher(opcao.id)}
          >
            <span className="painel-estado-cor" style={{ background: opcao.cor }} />
            {opcao.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Quais formas têm texto que o usuário escreve: a sala (nome do cômodo), o rótulo de
 * andar ("1F") e o marcador (o número, que nasce automático mas pode ser corrigido).
 */
function rotuloEditavel(tipoShape: string, simbolo: string | undefined): boolean {
  if (ehTipoSala(tipoShape)) return true
  if (tipoShape !== 'simbolo-mapa' || !simbolo) return false
  const definicao = definicaoDoSimbolo(simbolo)
  return Boolean(definicao?.textoLivre || definicao?.numerado)
}

function tituloDoCampoTexto(tipoShape: string, simbolo: string | undefined): string {
  if (ehTipoSala(tipoShape)) return 'Nome do cômodo'
  if (simbolo === 'andar') return 'Andar'
  if (simbolo === 'marcador') return 'Número'
  return 'Texto'
}

/** Texto que a própria forma desenha. Aplica no blur/Enter, igual X/Y/L/A. */
function CampoNome({
  titulo,
  valor,
  onAplicar,
}: {
  titulo: string
  valor: string
  onAplicar: (nome: string) => void
}) {
  const [rascunho, setRascunho] = useState(valor)

  return (
    <label className="painel-propriedades-campo painel-nome">
      <span className="painel-propriedades-label">{titulo}</span>
      <input
        type="text"
        className="painel-propriedades-input"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => onAplicar(rascunho)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setRascunho(valor)
        }}
      />
    </label>
  )
}

/**
 * Cor da sala escolhida à mão, que sobrepõe a do estado.
 *
 * O primeiro botão devolve o controle ao estado — sem ele, quem trocasse a cor uma vez
 * ficaria preso a ela e o vermelho/azul deixaria de significar pendente/limpa naquela
 * sala para sempre.
 */
function SeletorCor({ atual, onEscolher }: { atual: string; onEscolher: (cor: string) => void }) {
  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">Cor</span>
      <div className="painel-cores">
        <button
          type="button"
          className={`painel-cor-auto${atual === '' ? ' ativo' : ''}`}
          title="Usar a cor do estado"
          onClick={() => onEscolher('')}
        >
          auto
        </button>
        {CORES_SALA.map((cor) => (
          <button
            key={cor.id}
            type="button"
            className={`painel-cor${atual === cor.valor ? ' ativo' : ''}`}
            title={cor.nome}
            style={{ background: cor.valor }}
            onClick={() => onEscolher(cor.valor)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Cor da divisória: paleta fechada do Grimório (`CORES_LINHA`, moldada em `CORES_SALA`)
 * mais um seletor livre atrás de "Personalizada" — pedido do usuário. Nenhum botão de
 * "auto" aqui (diferente de `SeletorCor`/sala): a divisória não tem um "estado" que dê
 * cor por padrão, então a opção "Padrão" (o cinza-azulado de sempre) já entra como a
 * primeira cor da própria paleta, ver `CORES_LINHA`.
 *
 * O conta-gotas (💧) é um botão simples: liga/desliga `pegandoCor` no MapaView (`aoIniciar
 * ContaGotasLinha`), que arma um listener de um clique no canvas — este componente só
 * reflete o estado (classe `ativo`) e não sabe nada de captura de ponteiro.
 */
function SeletorCorLinha({
  atual,
  pegandoCor,
  onEscolher,
  onContaGotas,
  titulo = 'Cor da linha',
}: {
  atual: string
  pegandoCor: boolean
  onEscolher: (cor: string) => void
  onContaGotas: () => void
  /** o retângulo do mapa reusa este seletor; só o rótulo muda ("Cor do traço"). */
  titulo?: string
}) {
  const [personalizada, setPersonalizada] = useState(() => !CORES_LINHA.some((c) => c.valor === atual))

  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">{titulo}</span>
      <div className="painel-cores">
        {CORES_LINHA.map((cor) => (
          <button
            key={cor.id}
            type="button"
            className={`painel-cor${!personalizada && atual === cor.valor ? ' ativo' : ''}`}
            title={cor.nome}
            style={{ background: cor.valor }}
            onClick={() => {
              setPersonalizada(false)
              onEscolher(cor.valor)
            }}
          />
        ))}
        <button
          type="button"
          className={`painel-cor-auto${personalizada ? ' ativo' : ''}`}
          title="Cor personalizada"
          onClick={() => setPersonalizada(true)}
        >
          ✎
        </button>
        <button
          type="button"
          className={`btn-icon linha-conta-gotas${pegandoCor ? ' ativo' : ''}`}
          title={pegandoCor ? 'Clique numa peça do mapa para copiar a cor (Esc cancela)' : 'Conta-gotas: copiar cor de outra peça'}
          onClick={onContaGotas}
        >
          💧
        </button>
      </div>
      {personalizada && (
        <input
          type="color"
          className="linha-cor-personalizada-input"
          value={atual}
          onChange={(e) => onEscolher(e.target.value)}
        />
      )}
    </div>
  )
}

/**
 * Canto reto ou arredondado — a mesma escolha para a linha (ponta/quina do traço) e para o
 * retângulo (raio do canto), porque para quem desenha é uma coisa só: "essa peça tem quina
 * ou não". É o controle que o Excalidraw chama de "Edges: sharp/round".
 *
 * Aqui ele age só sobre a peça SELECIONADA. Para escolher ANTES de desenhar existe o mesmo
 * par de botões na barra do mapa (`MapaToolbar`), que define o canto das próximas peças.
 */
function SeletorCantos({ atual, onEscolher }: { atual: CantoMapa | undefined; onEscolher: (canto: CantoMapa) => void }) {
  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">Cantos</span>
      <div className="painel-estado-opcoes painel-opcoes-lado-a-lado">
        {OPCOES_CANTO.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            className={`painel-estado-opcao${atual === opcao.id ? ' ativo' : ''}`}
            title={opcao.rotulo}
            onClick={() => onEscolher(opcao.id)}
          >
            <span aria-hidden="true">{opcao.icone}</span>
            {opcao.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Traço do retângulo do mapa: espessura em px e preenchimento liga/desliga. Espessuras
 * fixas em vez de campo livre porque a escolha aqui é visual (fino / médio / grosso), não
 * numérica — e uma lista curta evita o retângulo de traço 0,3px que some no zoom de leitura.
 *
 * Preenchimento nasce DESLIGADO (ver `lib/retanguloMapa.ts`): caixa sólida por cima da
 * planta esconderia as salas já desenhadas.
 */
function SeletorTracoRetangulo({
  espessura,
  preenchido,
  onEspessura,
  onPreenchido,
}: {
  espessura: number
  preenchido: boolean
  onEspessura: (px: number) => void
  onPreenchido: (ligado: boolean) => void
}) {
  return (
    <SeletorEspessura titulo="Traço" opcoes={ESPESSURAS_RETANGULO} espessura={espessura} onEspessura={onEspessura}>
      <label className="painel-propriedades-campo painel-retangulo-preenchido">
        <input type="checkbox" checked={preenchido} onChange={(e) => onPreenchido(e.target.checked)} />
        <span>Preencher</span>
      </label>
    </SeletorEspessura>
  )
}

/**
 * Fileira de espessuras, cada botão mostrando uma barra da própria altura — o mesmo
 * controle serve ao traço do retângulo ("Traço") e ao contorno da sala ("Contorno").
 *
 * Compartilhado de propósito: o retângulo já tinha esta fileira, e desenhar uma diferente
 * para a sala faria "grosso" na sala não bater com "grosso" no retângulo ao lado, num mapa
 * onde as duas peças se encostam. `children` é o espaço para o que só uma delas tem — hoje,
 * o "Preencher" do retângulo (a sala é sempre preenchida pela cor do estado).
 */
function SeletorEspessura({
  titulo,
  opcoes,
  espessura,
  onEspessura,
  desligado,
  onDesligar,
  children,
}: {
  titulo: string
  opcoes: number[]
  espessura: number
  onEspessura: (px: number) => void
  /** só a sala: contorno pode ser removido de vez, não só afinado */
  desligado?: boolean
  onDesligar?: () => void
  children?: ReactNode
}) {
  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">{titulo}</span>
      <div className="painel-estado-opcoes painel-opcoes-lado-a-lado">
        {onDesligar && (
          /**
           * "sem" vem PRIMEIRO, no mesmo lugar em que o seletor de cor põe o "auto": as duas
           * são a opção de não escolher, e o olho procura no mesmo canto.
           *
           * Existe porque compor planta com salas sobrepostas — um salão de fundo com cômodos
           * por cima — deixa traço duplo em cada encosto. Apagar o contorno de quem está atrás
           * resolve, e sem isso a única saída era não sobrepor.
           */
          <button
            type="button"
            className={`painel-cor-auto${desligado ? ' ativo' : ''}`}
            title="Sem contorno — só a mancha de piso"
            aria-pressed={desligado}
            onClick={onDesligar}
          >
            sem
          </button>
        )}
        {opcoes.map((px) => (
          <button
            key={px}
            type="button"
            className={`painel-estado-opcao painel-opcao-espessura${
              espessura === px && !desligado ? ' ativo' : ''
            }`}
            title={`Espessura ${px}px`}
            aria-label={`Espessura ${px} pixels`}
            aria-pressed={espessura === px && !desligado}
            onClick={() => onEspessura(px)}
          >
            <span className="painel-amostra-espessura" style={{ height: px }} />
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}

/**
 * Cenário que a sala abre ao duplo clique. Segundo jeito de criar o vínculo (o primeiro
 * é arrastar o cenário da sidebar e soltar em cima da sala — ver `dropsDeEntidade.tsx`).
 * Escolher "— nenhum —" desfaz o vínculo sem apagar a sala.
 *
 * `useApp` é lido diretamente aqui (em vez de vir por prop do MapaView) porque é só
 * LEITURA — a lista de cenários existe pronta no store, e replicar esse fio por prop só
 * pra popular um <select> não ganha nada em troca.
 */
function SeletorCenarioDaSala({ atual, onEscolher }: { atual: string; onEscolher: (cenarioId: string) => void }) {
  const cenarios = useApp((s) => s.cenarios)
  const raizCenarios = useApp((s) => s.tree?.cenarios)
  const opcoes = opcoesDeCenario(raizCenarios ? coletarCenarioRefs(raizCenarios) : [])
  const nomeAtual = atual ? cenarios[atual]?.nome : undefined
  // ver `resolverVinculoSala`: sem isto, cenário ainda não carregado vira "vínculo quebrado"
  const carregando = useApp((s) => s.carregando)
  const vinculo = resolverVinculoSala(
    atual,
    nomeAtual !== undefined ? { [atual]: nomeAtual } : {},
    !carregando,
  )

  return (
    <div className="painel-estado">
      <span className="painel-propriedades-label">Cenário vinculado</span>
      <select
        className="painel-propriedades-input"
        value={vinculo.estado === 'quebrado' ? '' : atual}
        onChange={(e) => onEscolher(e.target.value)}
      >
        <option value="">— nenhum —</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
      {vinculo.estado === 'quebrado' && (
        <span className="painel-vinculo-quebrado">Vínculo quebrado — o cenário foi excluído. Escolha outro ou "— nenhum —" para limpar.</span>
      )}
    </div>
  )
}
