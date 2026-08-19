import { useEffect, useRef, useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useApp } from '../state/store'
import { useDocumentoTldraw } from './canvasDoc'
import { criarHandlersDeDrop } from './dropsDeEntidade'
import { exportarCanvas } from './exportarCanvas'
import { registrarAtalhos } from './atalhosCanvas'
import { registrarAncoraDePortas } from '../lib/ancoraPortaEditor'
import { PainelCamadas } from './PainelCamadas'
import { PainelPropriedades, ProvedorContagemCamadas, ProvedorSelecaoPropriedades, type SelecaoPropriedades } from './PainelPropriedades'
import { registrarEditor, desregistrarEditor } from '../lib/canvasAtivo'
import { criarUsuarioDoMapa } from '../lib/usuarioMapa'
import { QUADRADO_PX } from '../lib/quadrados'
import { useCamadasMapa } from '../lib/camadasMapaEditor'
import {
  COMPONENTS_MAPA_BASE,
  SHAPE_UTILS_CUSTOM_MAPA,
  SHAPE_UTILS_DO_STORE_MAPA,
  TOOLS_CUSTOM_MAPA,
  registrarBeforeCreateMapa,
  usePainelPropriedadesMapa,
} from '../lib/montagemMapa'
import { getCantoAtivo } from '../lib/cantoAtivo'
import { retirarPlantaPendente } from '../lib/mapaIAPendente'

export function MapaView({ caminho, nome }: { caminho: string; nome: string }) {
  const repo = useApp((s) => s.repo)
  const vaultPath = useApp((s) => s.vaultPath)
  const editorRef = useRef<Editor | null>(null)
  // SHAPE_UTILS_DO_STORE_MAPA é constante de módulo de propósito: `useDocumentoTldraw` tem
  // esse array nas deps do efeito que monta o store, então identidade nova a cada render
  // remontaria o store em laço (o mapa piscando, canvas nunca carregando).
  const { store, erro, salvandoErro } = useDocumentoTldraw(caminho, SHAPE_UTILS_DO_STORE_MAPA)
  const { aoArrastarSobre, aoSoltar } = criarHandlersDeDrop(editorRef, vaultPath, { itemViraMiniatura: true })
  const [copiaOk, setCopiaOk] = useState(false)
  const [copiaErro, setCopiaErro] = useState<string | null>(null)

  /**
   * Usuário só do mapa: snap sempre ligado sem contaminar o Canvas (o porquê inteiro
   * está em `usuarioMapa.ts`). Criado uma vez via `useRef` porque `user` está no array de
   * deps do `useLayoutEffect` que cria o editor (node_modules/@tldraw/editor/src/lib/
   * TldrawEditor.tsx:516), então identidade nova a cada render recriaria o editor inteiro.
   */
  const usuarioMapaRef = useRef<ReturnType<typeof criarUsuarioDoMapa> | null>(null)
  if (!usuarioMapaRef.current) usuarioMapaRef.current = criarUsuarioDoMapa()

  /**
   * Camadas: estado, ações do painel, visibilidade e reaplicação da ordem de empilhamento
   * vêm todos de `lib/camadasMapaEditor.tsx` — MESMA fonte que a bancada
   * (`amostra/CenaMapa.tsx`) usa, pelo mesmo motivo de `lib/montagemMapa.tsx`. Daqui só
   * sai o que é do app real: a persistência no cofre.
   */
  const camadasMapa = useCamadasMapa(editorRef, {
    persistir: (novo) =>
      void repo?.salvarCamadasMapa(caminho, novo).catch((e) => console.error("Falha ao salvar camadas do mapa:", e)),
  })

  // seleção pro PainelPropriedades: chega via SelecaoPropriedadesBridge (dentro do
  // <Tldraw>, único lugar com useEditor/useValue) através de contexto — ver
  // PainelPropriedades.tsx para o porquê de não dar pra passar como prop direta.
  const [selecaoProp, setSelecaoProp] = useState<SelecaoPropriedades>(null)

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
        camadasMapa.carregarCamadas(doc.camadas, doc.versaoCamadas)
      })
      .catch((e) => console.warn("Mapa: não deu para ler as camadas do doc:", e))
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, caminho])

  // ações do PainelPropriedades (mover, redimensionar, estado, cor, conta-gotas) e a
  // ordenação/cor-padrão de criação: extraídas para `lib/montagemMapa.tsx`, a MESMA
  // fonte que a bancada (`amostra/CenaMapa.tsx`) usa — ver o cabeçalho de lá.
  const acoesPropriedades = usePainelPropriedadesMapa(editorRef)

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
      <ProvedorContagemCamadas value={camadasMapa.definirContagem}>
      <Tldraw
        store={store}
        shapeUtils={SHAPE_UTILS_CUSTOM_MAPA}
        tools={TOOLS_CUSTOM_MAPA}
        components={COMPONENTS_MAPA_BASE}
        user={usuarioMapaRef.current}
        getShapeVisibility={camadasMapa.getShapeVisibility}
        onMount={(editor) => {
          registrarEditor(editor)
          editorRef.current = editor
          editor.user.updateUserPreferences({ colorScheme: 'dark' })
          /**
           * Grade DESLIGADA ao abrir o mapa (o ⊞ da toolbar liga quando o usuário
           * quiser). Ligada, ela não é só um fundo pontilhado: o tldraw obriga toda
           * forma a cair em múltiplo de `gridSize` ao mover e ao redimensionar
           * (node_modules/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts:546
           * `averageSnappedPoint.snapToGrid(gridSize)` e Resizing.ts:279), o que
           * impede posicionar qualquer coisa ENTRE dois pontos — reclamação direta do
           * usuário. Não dá para separar as duas coisas sem reescrever o SelectTool:
           * desenho da grade e encaixe na grade são a mesma flag no core do tldraw.
           *
           * O `false` é explícito, e não apenas a ausência do `true`, porque
           * `isGridMode` viaja no snapshot de sessão gravado no arquivo do mapa
           * (@tldraw/editor/src/lib/config/TLSessionStateSnapshot.ts:105): mapas
           * criados antes desta mudança já têm `true` salvo e continuariam travados.
           */
          editor.updateInstanceState({ isGridMode: false })
          editor.updateDocumentSettings({ gridSize: QUADRADO_PX })
          /**
           * Portas ancoradas seguem a parede quando ela se move, cresce ou é reformada — ver
           * `registrarAncoraDePortas`. Sem isto o encaixe seria cosmético: bonito no drop e
           * desalinhado no primeiro gesto seguinte.
           */
          const cancelarAncoras = registrarAncoraDePortas(editor)
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
           * Forma nova nasce na camada ativa, com a ordem de empilhamento por banda e a
           * cor padrão de divisória: `registrarBeforeCreateMapa` (lib/montagemMapa.tsx) —
           * mesma função que a bancada usa, ver o cabeçalho de lá para o mecanismo
           * completo (`registerBeforeCreateHandler`).
           */
          const cancelarSideEffect = registrarBeforeCreateMapa(editor, {
            getCamadaAtivaId: camadasMapa.getCamadaAtivaId,
            getCamadaTravada: camadasMapa.getCamadaTravada,
            getOrdemCamadas: camadasMapa.getOrdemCamadas,
            getCantoPadrao: () => getCantoAtivo(editor),
          })
          /**
           * A normalização de ordem NÃO acontece aqui, e isso é deliberado.
           *
           * Neste ponto o atom de camadas ainda é a "Base" implícita: a lista de verdade só
           * chega pelo `lerCanvasDoc` do efeito acima, que é I/O assíncrono. Normalizar com
           * a pilha errada trata TODA peça como órfã (`indiceDaCamada` devolve 0 para id
           * fora da lista) e achata a página inteira só por banda — destruindo o
           * empilhamento por camada que o usuário montou, marcando o documento como editado
           * e fazendo o autosave regravar o arquivo a cada abertura, sem ninguém tocar em
           * nada. Em cofre sincronizado é exatamente a divergência que gera cópia de
           * conflito (ver `canvasDoc.ts`).
           *
           * Quem normaliza é `carregarCamadas`, já com a pilha certa. Se a leitura falhar, a
           * ordem salva fica como está — errada é melhor que achatada, porque achatar
           * PERSISTE o estrago.
           */
          /**
           * Planta de IA pendente (mapa criado pela "IA monta o mapa" — ver
           * `AcoesMapaIA.tsx` e `lib/mapaIAPendente.ts`): o mapa nasceu vazio nesta mesma
           * navegação, então não há nada pra sobrepor — insere direto, sem procurar área
           * livre, e seleciona tudo pelo mesmo motivo de qualquer criação em lote.
           */
          const pendente = retirarPlantaPendente(caminho)
          if (pendente && pendente.length > 0) {
            editor.run(() => {
              editor.createShapes(pendente)
              editor.setSelectedShapes(pendente.map((f) => f.id!))
            })
          }

          return () => {
            desregistrarEditor(editor)
            cancelarAtalhos()
            cancelarAncoras()
            cancelarSideEffect()
          }
        }}
      />
      </ProvedorContagemCamadas>
      </ProvedorSelecaoPropriedades>
      {/* Os dois painéis são itens de uma coluna flex — quem os empilha é o CSS, medindo a
          altura real de cada um. Empurrar o de camadas por um `top` calculado aqui é o que
          fazia ele cobrir o de propriedades quando a seleção tinha muitos campos. */}
      <div className="mapa-coluna-esq">
        <PainelPropriedades selecao={selecaoProp} {...acoesPropriedades} />
        <PainelCamadas
          camadas={camadasMapa.camadas}
          ativaId={camadasMapa.camadaAtivaId}
          temSelecao={selecaoProp !== null}
          camadasDaSelecao={selecaoProp?.camadasDaSelecao ?? []}
          contagemPorCamada={camadasMapa.contagemPorCamada}
          {...camadasMapa.acoesDoPainel}
        />
      </div>
      <div className="canvas-banners">
        {salvandoErro && <div className="canvas-salvar-erro">Falha ao salvar: {salvandoErro}</div>}
        {copiaOk && <div className="canvas-copia-ok">Imagem copiada</div>}
        {copiaErro && <div className="canvas-salvar-erro">Falha ao copiar: {copiaErro}</div>}
      </div>
    </div>
  )
}
