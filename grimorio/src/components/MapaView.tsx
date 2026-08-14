import { useEffect, useRef, useState } from 'react'
import { atom, Tldraw, useValue, defaultShapeUtils, type Editor, type TLComponents, type TLEditorOptions } from 'tldraw'
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
import { PainelCamadas } from './PainelCamadas'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'
import { QUADRADO_PX } from '../lib/quadrados'
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
    </>
  )
}

// constante de módulo: não recriar o objeto de components a cada render
const componentsMapa: TLComponents = { InFrontOfTheCanvas: MapaOverlay, Toolbar: MapaToolbar }

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

  const [camadaAtivaId, setCamadaAtivaId] = useState('base')
  const camadaAtivaIdRef = useRef(camadaAtivaId)
  camadaAtivaIdRef.current = camadaAtivaId

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

  function aoAlternarOcultaCamada(id: string) {
    atualizarCamadas(alternarOculta(camadasAtom.get(), id))
  }

  /**
   * Trava/destrava em massa: não existe `getShapeLocked` (só `getShapeVisibility` tem
   * esse mecanismo — Editor.ts:266), então travar aplica `isLocked` diretamente nos
   * shapes da camada via `editor.updateShapes([{id, type, isLocked}])` — o MESMO
   * mecanismo que `editor.toggleLock` usa por trás (verificado em
   * node_modules/@tldraw/editor/src/lib/editor/Editor.ts:6660-6671).
   */
  function aoAlternarTravadaCamada(id: string) {
    const novo = alternarTravada(camadasAtom.get(), id)
    const camada = novo.find((c) => c.id === id)
    const editor = editorRef.current
    if (editor && camada) {
      const daCamada = editor.getCurrentPageShapes().filter((s) => camadaDoShape(s.meta, novo).id === id)
      if (daCamada.length) {
        editor.updateShapes(daCamada.map((s) => ({ id: s.id, type: s.type, isLocked: camada.travada })))
      }
    }
    atualizarCamadas(novo)
  }

  function aoMoverCamada(id: string, direcao: 'cima' | 'baixo') {
    atualizarCamadas(moverCamada(camadasAtom.get(), id, direcao))
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
      <Tldraw
        store={store}
        shapeUtils={shapeUtilsCustom}
        components={componentsMapa}
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
           * próximo travar/destravar.
           */
          const cancelarSideEffect = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
            if (source !== 'user') return shape
            const metaAtual = shape.meta as Record<string, unknown>
            if (typeof metaAtual.camada === 'string') return shape
            const ativa = camadaAtivaIdRef.current
            const camadaAtiva = camadasAtom.get().find((c) => c.id === ativa)
            return {
              ...shape,
              meta: { ...shape.meta, camada: ativa },
              isLocked: camadaAtiva?.travada ? true : shape.isLocked,
            }
          })
          return () => {
            desregistrarEditor(editor)
            cancelarAtalhos()
            cancelarSideEffect()
          }
        }}
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
      />
      <div className="canvas-banners">
        {salvandoErro && <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>}
        {copiaOk && <div className="canvas-copia-ok">Imagem copiada</div>}
        {copiaErro && <div className="canvas-salvar-erro">Falha ao copiar: {copiaErro}</div>}
      </div>
    </div>
  )
}
