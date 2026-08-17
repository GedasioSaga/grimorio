import { useRef, useState } from 'react'
import { createTLStore, getIndices, Tldraw, type Editor, type TLStore } from 'tldraw'
import 'tldraw/tldraw.css'
import { QUADRADO_PX } from '../lib/quadrados'
import { criarUsuarioDoMapa } from '../lib/usuarioMapa'
import { parsearPlantaIA } from '../lib/plantaMapaIA'
import { especificacoesParaMapaNovo } from '../lib/gerarMapaIA'
import {
  COMPONENTS_MAPA_BASE,
  SHAPE_UTILS_CUSTOM_MAPA,
  TOOLS_CUSTOM_MAPA,
  registrarBeforeCreateMapa,
  SHAPE_UTILS_DO_STORE_MAPA,
  usePainelPropriedadesMapa,
} from '../lib/montagemMapa'
import { PainelPropriedades, ProvedorContagemCamadas, ProvedorSelecaoPropriedades, type SelecaoPropriedades } from '../components/PainelPropriedades'
import { PainelCamadas } from '../components/PainelCamadas'
import { useCamadasMapa } from '../lib/camadasMapaEditor'
import { getCantoAtivo } from '../lib/cantoAtivo'
import type { CamadaMapa } from '../lib/types'
import { VERSAO_CAMADAS } from '../lib/camadasMapa'
import { PLANTA_EXEMPLO_JSON } from './dadosFalsos'

/**
 * Divisória interna — ferramenta NATIVA `line` do tldraw (cor/traço cinza, tamanho 's'),
 * não o shape legado `linha-mapa` (ver o cabeçalho de `LinhaMapaShape.tsx`: a divisória
 * de verdade virou a ferramenta `line` nesta leva, o shape próprio só continua registrado
 * para não quebrar mapas antigos). Três segmentos, não dois: dá pra testar a borracha de
 * trecho num meio de linha (b1→b2→b3) sem apagar a linha inteira, e ainda sobra a `a1→a2`
 * intacta para confirmar que só o trecho arrastado sumiu.
 */
function criarDivisorias(editor: Editor) {
  const [a1, a2] = getIndices(2)
  const [b1, b2, b3] = getIndices(3)
  editor.createShapes([
    {
      type: 'line',
      x: 0,
      y: 96, // 3 quadrados: parte o Salão de Armas ao meio
      props: {
        color: 'grey',
        dash: 'solid',
        size: 's',
        spline: 'line',
        scale: 1,
        points: { [a1]: { id: a1, index: a1, x: 0, y: 0 }, [a2]: { id: a2, index: a2, x: 256, y: 0 } },
      },
    },
    {
      type: 'line',
      x: 192,
      y: 192, // 6 quadrados: parte o Pátio Interno ao meio, em três trechos p/ testar a borracha
      props: {
        color: 'grey',
        dash: 'solid',
        size: 's',
        spline: 'line',
        scale: 1,
        points: {
          [b1]: { id: b1, index: b1, x: 0, y: 0 },
          [b2]: { id: b2, index: b2, x: 0, y: 80 },
          [b3]: { id: b3, index: b3, x: 0, y: 160 },
        },
      },
    },
  ])
}

/**
 * Monta a planta de exemplo pela MESMA pipeline de "IA monta o mapa"
 * (`parsearPlantaIA` → `especificacoesParaMapaNovo`, ver `lib/gerarMapaIA.ts`) — nasce
 * como massa contínua desenhada por alguém competente, não peças soltas no vazio.
 */
function montarMapaExemplo(editor: Editor) {
  const parse = parsearPlantaIA(PLANTA_EXEMPLO_JSON)
  if (parse.ok) editor.createShapes(especificacoesParaMapaNovo(parse.planta))
  criarDivisorias(editor)
}

/**
 * Camadas de exemplo, do FUNDO pro topo — convenção documentada em `lib/camadasMapa.ts`.
 *
 * Duas, e não uma, porque o que precisa ser visto funcionando é justamente o que uma camada
 * só não mostra: peça da camada de cima cobrindo peça da de baixo, ▲/▼ mudando o
 * empilhamento na hora, e o ⤵ movendo a seleção de uma camada para a outra.
 */
const CAMADAS_BANCADA: CamadaMapa[] = [
  { id: 'base', nome: 'Planta', oculta: false, travada: false },
  { id: 'notas', nome: 'Anotações', oculta: false, travada: false },
]

/**
 * Cena #mapa: o editor de mapa de verdade — MESMA montagem de `MapaView.tsx`
 * (`lib/montagemMapa.tsx`: shapeUtils, tools, toolbar, ordem por banda, cor padrão de
 * linha, e as ações do `PainelPropriedades`) —, mas com documento em MEMÓRIA (sem cofre,
 * sem `useDocumentoTldraw`, sem autosave, sem camadas persistidas). Uma ferramenta nova
 * registrada na fonte compartilhada aparece aqui sem precisar copiar nada.
 */
declare global {
  interface Window {
    /**
     * Gancho de automação, SÓ nesta bancada de teste. O tldraw captura todo evento de
     * ponteiro num container próprio e resolve a forma por COORDENADA — não há seletor
     * CSS estável para "a sala tal" ou "a divisória tal", então um driver de teste não
     * consegue montar um clique por seletor como faria em HTML comum. Expor o `Editor`
     * aqui deixa o driver usar a API real (`getShapeAtPoint`, `pageToScreen`, `select`,
     * `createShape` etc.) para localizar coordenadas e ler estado, e ainda assim disparar
     * o evento de ponteiro de verdade (via automação de mouse, não `dispatchEvent`
     * sintético — que quebra `setPointerCapture` dentro do tldraw). Não existe equivalente
     * em `MapaView.tsx`/`montagemMapa.tsx`: o app real não ganha essa superfície global.
     */
    __editorMapa?: Editor
  }
}

export function CenaMapa() {
  const [store] = useState<TLStore>(() => createTLStore({ shapeUtils: SHAPE_UTILS_DO_STORE_MAPA }))
  const usuarioMapaRef = useRef<ReturnType<typeof criarUsuarioDoMapa> | null>(null)
  if (!usuarioMapaRef.current) usuarioMapaRef.current = criarUsuarioDoMapa()
  const editorRef = useRef<Editor | null>(null)
  const [selecaoProp, setSelecaoProp] = useState<SelecaoPropriedades>(null)
  const acoesPropriedades = usePainelPropriedadesMapa(editorRef)
  // sem `persistir`: a bancada não tem cofre — só o app real salva as camadas no arquivo.
  const camadasMapa = useCamadasMapa(editorRef)

  return (
    <div className="mapa-wrap">
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
            editorRef.current = editor
            window.__editorMapa = editor // ver o comentário em `declare global` acima
            editor.user.updateUserPreferences({ colorScheme: 'dark' })
            // grade desligada de nascença, mesma razão de MapaView.tsx: ligada, ela
            // obriga toda forma a cair em múltiplo de quadrado ao mover/redimensionar.
            editor.updateInstanceState({ isGridMode: false })
            editor.updateDocumentSettings({ gridSize: QUADRADO_PX })
            camadasMapa.carregarCamadas(CAMADAS_BANCADA, VERSAO_CAMADAS)
            const cancelarSideEffect = registrarBeforeCreateMapa(editor, {
              getCamadaAtivaId: camadasMapa.getCamadaAtivaId,
              getCamadaTravada: camadasMapa.getCamadaTravada,
              getOrdemCamadas: camadasMapa.getOrdemCamadas,
              getCantoPadrao: () => getCantoAtivo(editor),
            })
            montarMapaExemplo(editor)
            camadasMapa.reordenarPelaPilha()
            editor.zoomToFit({ animation: { duration: 0 } })
            return () => cancelarSideEffect()
          }}
        />
      </ProvedorContagemCamadas>
      </ProvedorSelecaoPropriedades>
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
    </div>
  )
}
