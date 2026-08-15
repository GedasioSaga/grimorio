import { useEffect, useRef, useState } from 'react'
import { atom, Tldraw, useValue, defaultShapeUtils, type Editor, type TLComponents, type TLEditorOptions, type TLShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'
import { useDocumentoTldraw } from './canvasDoc'
import { criarHandlersDeDrop } from './dropsDeEntidade'
import { exportarCanvas } from './exportarCanvas'
import { registrarAtalhos } from './atalhosCanvas'
import { CharacterCardShapeUtil } from './CharacterCardShape'
import { CenarioCardShapeUtil } from './CenarioCardShape'
import { ItemCardShapeUtil } from './ItemCardShape'
import { MedidasMapa } from './MedidasMapa'
import { ReguasMapa } from './ReguasMapa'
import { MapaToolbar } from './MapaToolbar'
import { ControleZoom } from './ControleZoom'
import { PainelCamadas } from './PainelCamadas'
import {
  PainelPropriedades,
  ProvedorSelecaoPropriedades,
  SelecaoPropriedadesBridge,
  type SelecaoPropriedades,
} from './PainelPropriedades'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'
import { criarUsuarioDoMapa } from '../lib/usuarioMapa'
import { QUADRADO_PX, quadradosParaPx } from '../lib/quadrados'
import {
  alternarOculta,
  alternarTravada,
  camadaDoShape,
  camadasDoDoc,
  criarCamada,
  moverCamada,
  removerCamada,
  renomearCamada,
  shapeOculto,
} from '../lib/camadasMapa'
import type { CamadaMapa } from '../lib/types'

// mesmos card-shapes do canvas: mapa aceita drop de personagem/cenário/item
const shapeUtilsCustom = [CharacterCardShapeUtil, CenarioCardShapeUtil, ItemCardShapeUtil]
const shapeUtilsDoStore = [...defaultShapeUtils, ...shapeUtilsCustom]

// combina os overlays de espaço-de-tela num só slot (InFrontOfTheCanvas aceita 1 componente)
function MapaOverlay() {
  return (
    <>
      <MedidasMapa />
      <ReguasMapa />
      <SelecaoPropriedadesBridge />
    </>
  )
}

// constante de módulo: não recriar o objeto de components a cada render.
// `NavigationPanel` (minimap + menu de zoom nativos, em inglês) dá lugar ao
// `ControleZoom` — mesmo slot, mesma faixa de rodapé da toolbar; ver ControleZoom.tsx.
const componentsMapa: TLComponents = {
  InFrontOfTheCanvas: MapaOverlay,
  Toolbar: MapaToolbar,
  NavigationPanel: ControleZoom,
}

// altura aproximada do PainelPropriedades (cabeçalho + 4 campos + paddings), pra empurrar
// o PainelCamadas pra baixo sem sobrepor quando os dois estão visíveis na mesma coluna.
const ALTURA_PAINEL_PROPRIEDADES_PX = 184

export function MapaView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const editorRef = useRef<Editor | null>(null)
  const { store, erro, salvandoErro } = useDocumentoTldraw(caminho, shapeUtilsDoStore)
  const { aoArrastarSobre, aoSoltar } = criarHandlersDeDrop(editorRef, vaultPath)
  const [copiaOk, setCopiaOk] = useState(false)
  const [copiaErro, setCopiaErro] = useState<string | null>(null)

  /**
   * Camadas vivem num `atom` do tldraw (`@tldraw/state`, reexportado por `tldraw` —
   * verificado em node_modules/@tldraw/editor/src/index.ts:4 `export * from '@tldraw/state'`),
   * não em `useState` puro. Motivo: `getShapeVisibility` é lido por
   * `TldrawEditor.tsx:509-521` no array de deps do `useLayoutEffect` que CRIA o editor —
   * uma nova identidade de função ali recria o editor inteiro (perde seleção/câmera/
   * histórico). Com o valor num atom, a função passada para `getShapeVisibility` tem
   * identidade estável (criada uma vez via `useRef`) e ainda assim é reativa: o cache
   * de visibilidade por shape (`Editor.ts:832-844`, um `@computed`) rastreia a leitura
   * de `atom.get()` dentro do callback e invalida sozinho quando o atom muda.
   */
  const camadasAtomRef = useRef<ReturnType<typeof atom<CamadaMapa[]>> | null>(null)
  if (!camadasAtomRef.current) camadasAtomRef.current = atom<CamadaMapa[]>('mapa-camadas', camadasDoDoc(undefined))
  const camadasAtom = camadasAtomRef.current
  const camadas = useValue(camadasAtom)

  /**
   * Usuário só do mapa: snap sempre ligado sem contaminar o Canvas (o porquê inteiro
   * está em `usuarioMapa.ts`). Criado uma vez via `useRef` pelo mesmo motivo do atom
   * acima — `user` está no array de deps do `useLayoutEffect` que cria o editor
   * (node_modules/@tldraw/editor/src/lib/TldrawEditor.tsx:516), então uma identidade
   * nova a cada render recriaria o editor inteiro.
   */
  const usuarioMapaRef = useRef<ReturnType<typeof criarUsuarioDoMapa> | null>(null)
  if (!usuarioMapaRef.current) usuarioMapaRef.current = criarUsuarioDoMapa()

  const [camadaAtivaId, setCamadaAtivaId] = useState('base')
  const camadaAtivaIdRef = useRef(camadaAtivaId)
  camadaAtivaIdRef.current = camadaAtivaId

  // seleção pro PainelPropriedades: chega via SelecaoPropriedadesBridge (dentro do
  // <Tldraw>, único lugar com useEditor/useValue) através de contexto — ver
  // PainelPropriedades.tsx para o porquê de não dar pra passar como prop direta.
  const [selecaoProp, setSelecaoProp] = useState<SelecaoPropriedades>(null)

  // identidade estável (mesmo motivo do atom acima): fica fora do componente-render,
  // criada uma única vez via useRef, e ainda reage porque lê `camadasAtom.get()` por dentro.
  const getShapeVisibilityRef = useRef<TLEditorOptions['getShapeVisibility']>((shape) => {
    return shapeOculto(shape.meta, camadasAtom.get()) ? 'hidden' : 'inherit'
  })

  // carrega as camadas do doc (o hook useDocumentoTldraw devolve só o store tldraw;
  // ler `camadas` exige reler o doc — decisão da Task A: reler no MapaView em vez de
  // fazer o hook compartilhado devolver mais campos, para não arriscar comportamento
  // do CanvasView, que usa o mesmo `useDocumentoTldraw` sem tocar em `camadas`).
  useEffect(() => {
    let ativo = true
    if (!repo) return
    repo
      .lerCanvasDoc(caminho)
      .then((doc) => {
        if (!ativo) return
        const normalizadas = camadasDoDoc(doc.camadas)
        camadasAtom.set(normalizadas)
        setCamadaAtivaId(normalizadas[0].id)
      })
      .catch((e) => console.warn('Mapa: não deu para ler as camadas do doc:', e))
    return () => {
      ativo = false
    }
  }, [repo, caminho, camadasAtom])

  function atualizarCamadas(novo: CamadaMapa[]) {
    camadasAtom.set(novo)
    void repo?.salvarCamadasMapa(caminho, novo).catch((e) => console.error('Falha ao salvar camadas do mapa:', e))
  }

  function aoCriarCamada(nomeCamada: string) {
    const r = criarCamada(camadasAtom.get(), nomeCamada)
    atualizarCamadas(r.camadas)
    setCamadaAtivaId(r.novaId)
  }

  function aoRenomearCamada(id: string, nomeCamada: string) {
    atualizarCamadas(renomearCamada(camadasAtom.get(), id, nomeCamada))
  }

  function aoExcluirCamada(id: string) {
    const { camadas: restantes, idHerdeira } = removerCamada(camadasAtom.get(), id)
    if (restantes.length === camadasAtom.get().length) return // nunca removeu (era a última)
    const editor = editorRef.current
    if (editor) {
      const orfaos = editor
        .getCurrentPageShapes()
        .filter((s) => camadaDoShape(s.meta, camadasAtom.get()).id === id)
      if (orfaos.length) {
        editor.updateShapes(orfaos.map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, camada: idHerdeira } })))
      }
    }
    atualizarCamadas(restantes)
    if (camadaAtivaIdRef.current === id) setCamadaAtivaId(idHerdeira)
  }

  /**
   * Esconder uma camada também TIRA DA SELEÇÃO as formas dela: `getSelectedShapeIds`
   * devolve o estado de seleção cru da página, sem filtrar o que está escondido
   * (node_modules/@tldraw/editor/src/lib/editor/Editor.ts:1681-1683), e forma
   * selecionada-mas-invisível continua obedecendo a tudo — alinhar/distribuir da barra
   * contextual, os campos do painel de propriedades, as setas do teclado. O usuário
   * moveria às cegas algo que só reaparece deslocado ao religar a camada.
   */
  function aoAlternarOcultaCamada(id: string) {
    const novo = alternarOculta(camadasAtom.get(), id)
    const editor = editorRef.current
    if (editor && novo.find((c) => c.id === id)?.oculta) {
      const selecionadas = editor.getSelectedShapeIds()
      const visiveis = selecionadas.filter((sid) => {
        const shape = editor.getShape(sid)
        return shape ? camadaDoShape(shape.meta, novo).id !== id : false
      })
      if (visiveis.length !== selecionadas.length) editor.setSelectedShapes(visiveis)
    }
    atualizarCamadas(novo)
  }

  /**
   * Trava/destrava em massa: não existe `getShapeLocked` (só `getShapeVisibility` tem
   * esse mecanismo — Editor.ts:266), então travar aplica `isLocked` diretamente nos
   * shapes da camada via `editor.updateShapes([{id, type, isLocked}])` — o MESMO
   * mecanismo que `editor.toggleLock` usa por trás (verificado em
   * node_modules/@tldraw/editor/src/lib/editor/Editor.ts:6660-6671).
   *
   * FIX (review): destravar em massa não pode reverter um travamento MANUAL que o
   * usuário fez num shape individual (cadeado do próprio tldraw, fora do painel de
   * camadas). Por isso `meta.travadoPelaCamada: true` marca só os shapes que ESTE
   * toggle travou (os que já chegaram travados ficam sem marca — preservados como
   * estão); destravar só mexe em quem tem a marca, e a remove ao destravar. A mesma
   * marca é carimbada no side-effect de criação (`onMount`, abaixo) quando a forma
   * nasce numa camada já travada — senão ela ficaria travada "sem dono" para sempre.
   */
  function aoAlternarTravadaCamada(id: string) {
    const novo = alternarTravada(camadasAtom.get(), id)
    const camada = novo.find((c) => c.id === id)
    const editor = editorRef.current
    if (editor && camada) {
      const daCamada = editor.getCurrentPageShapes().filter((s) => camadaDoShape(s.meta, novo).id === id)
      if (camada.travada) {
        const aTravar = daCamada.filter((s) => !s.isLocked)
        if (aTravar.length) {
          editor.updateShapes(
            aTravar.map((s) => ({
              id: s.id,
              type: s.type,
              isLocked: true,
              meta: { ...s.meta, travadoPelaCamada: true },
            })),
          )
        }
      } else {
        const aDestravar = daCamada.filter((s) => (s.meta as Record<string, unknown>).travadoPelaCamada === true)
        if (aDestravar.length) {
          editor.updateShapes(
            aDestravar.map((s) => {
              // `delete` via cast local só pra tirar a marca; `metaRestante` continua
              // tipado como `s.meta` (JsonObject) — sem isso o updateShapes recusa o
              // objeto (meta vira Record<string, unknown>, incompatível com JsonObject).
              const metaRestante = { ...s.meta }
              delete (metaRestante as Record<string, unknown>).travadoPelaCamada
              return { id: s.id, type: s.type, isLocked: false, meta: metaRestante }
            }),
          )
        }
      }
    }
    atualizarCamadas(novo)
  }

  function aoMoverCamada(id: string, direcao: 'cima' | 'baixo') {
    atualizarCamadas(moverCamada(camadasAtom.get(), id, direcao))
  }

  /**
   * Mover (X/Y): `editor.updateShape({x,y})` espera coordenadas do PARENT space do
   * shape, não do page space — dentro de um grupo os dois divergem. Conversão feita
   * com `editor.getPointInParentSpace(id, pagePoint)`, verificado em
   * node_modules/@tldraw/editor/src/lib/editor/Editor.ts:5611-5620: aplica a inversa
   * da `getShapePageTransform` do PAI, ou devolve o ponto intacto quando o pai é a
   * própria página (`isPageId(freshShape.parentId)`) — caso simples sem grupo dá
   * exatamente o ponto de página, então X/Y aplicam sem desvio.
   */
  function aoAplicarX(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const shape = editor.getShape(id)
    const bounds = editor.getShapePageBounds(id)
    if (!shape || !bounds) return
    const local = editor.getPointInParentSpace(id, { x: quadradosParaPx(quadrados, QUADRADO_PX), y: bounds.y })
    editor.updateShape({ id, type: shape.type, x: local.x, y: local.y })
  }

  function aoAplicarY(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const shape = editor.getShape(id)
    const bounds = editor.getShapePageBounds(id)
    if (!shape || !bounds) return
    const local = editor.getPointInParentSpace(id, { x: bounds.x, y: quadradosParaPx(quadrados, QUADRADO_PX) })
    editor.updateShape({ id, type: shape.type, x: local.x, y: local.y })
  }

  /**
   * Redimensionar (L/A): não existe "setar w/h" genérico — `props.w/h` só existe em
   * `geo`. A API real é `editor.resizeShape(id, scale, { scaleOrigin })`, verificada
   * em Editor.ts:7568-7620 + `_scalePagePoint` (Editor.ts:7735-7752): o ponto igual a
   * `scaleOrigin` fica fixo sob a escala. Usando `scaleOrigin` = topo-esquerda ATUAL
   * dos page bounds, o canto superior-esquerdo não se move — só L/A mudam, X/Y ficam
   * intocados.
   */
  function aoAplicarL(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(id)
    if (!bounds || bounds.w <= 0) return
    const larguraAlvoPx = quadradosParaPx(quadrados, QUADRADO_PX)
    editor.resizeShape(id, { x: larguraAlvoPx / bounds.w, y: 1 }, { scaleOrigin: { x: bounds.x, y: bounds.y } })
  }

  function aoAplicarA(id: TLShapeId, quadrados: number) {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(id)
    if (!bounds || bounds.h <= 0) return
    const alturaAlvoPx = quadradosParaPx(quadrados, QUADRADO_PX)
    editor.resizeShape(id, { x: 1, y: alturaAlvoPx / bounds.h }, { scaleOrigin: { x: bounds.x, y: bounds.y } })
  }

  async function exportar(formato: 'png' | 'svg') {
    const editor = editorRef.current
    if (!editor || !repo) return
    await exportarCanvas(editor, repo, nome, formato)
  }

  if (erro) {
    return (
      <div className="canvas-erro">
        Não foi possível abrir "{nome}": arquivo com erro.
        <br />
        <code>{erro}</code>
      </div>
    )
  }
  if (!store) return <div className="canvas-carregando">Carregando…</div>

  return (
    <div className="mapa-wrap" onDragOverCapture={aoArrastarSobre} onDropCapture={aoSoltar}>
      <div className="canvas-toolbar">
        <span className="canvas-titulo">🗺 {nome}</span>
        <button onClick={() => void exportar('png')}>Exportar PNG</button>
        <button onClick={() => void exportar('svg')}>Exportar SVG</button>
      </div>
      <ProvedorSelecaoPropriedades value={setSelecaoProp}>
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        components={componentsMapa}
        user={usuarioMapaRef.current}
        getShapeVisibility={getShapeVisibilityRef.current}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
          // grade ligada por padrão: é a régua do mapa (1 quadrado = QUADRADO_PX)
          editor.updateInstanceState({ isGridMode: true })
          editor.updateDocumentSettings({ gridSize: QUADRADO_PX })
          const cancelarAtalhos = registrarAtalhos(editor, {
            aoCopiar() {
              setCopiaOk(true)
              setTimeout(() => setCopiaOk(false), 1500)
            },
            aoFalharCopia(erro) {
              setCopiaErro(erro)
              setTimeout(() => setCopiaErro(null), 4000)
            },
          })
          /**
           * Forma nova nasce na camada ativa: `registerBeforeCreateHandler('shape', ...)`
           * — mecanismo verificado em
           * node_modules/@tldraw/store/src/lib/StoreSideEffects.ts:458-484 (é o handler
           * que pode MODIFICAR o record antes de criar, ao contrário do afterCreate, que
           * só reage). Shapes coladas/remotas já com `meta.camada` não são sobrescritas.
           * Também carimba `isLocked` de saída quando a camada ativa já está travada —
           * sem isso, uma forma criada numa camada travada nasceria destravada até o
           * próximo travar/destravar. Ganha também `meta.travadoPelaCamada: true` nesse
           * caso — mesma marca de `aoAlternarTravadaCamada` — senão o destravar em
           * massa não saberia que foi a camada (e não um travamento manual do usuário)
           * quem travou essa forma, e ela ficaria presa travada para sempre.
           */
          const cancelarSideEffect = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
            if (source !== 'user') return shape
            const metaAtual = shape.meta as Record<string, unknown>
            if (typeof metaAtual.camada === 'string') return shape
            const ativa = camadaAtivaIdRef.current
            const camadaAtiva = camadasAtom.get().find((c) => c.id === ativa)
            const travadaPelaCamada = !!camadaAtiva?.travada
            return {
              ...shape,
              meta: { ...shape.meta, camada: ativa, ...(travadaPelaCamada ? { travadoPelaCamada: true } : {}) },
              isLocked: travadaPelaCamada ? true : shape.isLocked,
            }
          })
          return () => {
            desregistrarEditor(editor)
            cancelarAtalhos()
            cancelarSideEffect()
          }
        }}
      />
      </ProvedorSelecaoPropriedades>
      <PainelPropriedades
        selecao={selecaoProp}
        aoAplicarX={aoAplicarX}
        aoAplicarY={aoAplicarY}
        aoAplicarL={aoAplicarL}
        aoAplicarA={aoAplicarA}
      />
      <PainelCamadas
        camadas={camadas}
        ativaId={camadaAtivaId}
        aoSelecionarAtiva={setCamadaAtivaId}
        aoCriar={aoCriarCamada}
        aoRenomear={aoRenomearCamada}
        aoExcluir={aoExcluirCamada}
        aoAlternarOculta={aoAlternarOcultaCamada}
        aoAlternarTravada={aoAlternarTravadaCamada}
        aoMover={aoMoverCamada}
        topPx={selecaoProp ? 8 + ALTURA_PAINEL_PROPRIEDADES_PX : 8}
      />
      <div className="canvas-banners">
        {salvandoErro && <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>}
        {copiaOk && <div className="canvas-copia-ok">Imagem copiada</div>}
        {copiaErro && <div className="canvas-salvar-erro">Falha ao copiar: {copiaErro}</div>}
      </div>
    </div>
  )
}
