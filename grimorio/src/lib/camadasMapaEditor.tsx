import { useRef, useState } from 'react'
import { atom, useValue, type Editor, type TLEditorOptions, type TLShape, type TLShapePartial } from 'tldraw'
import {
  alternarOculta,
  alternarTravada,
  camadaDoShape,
  camadasDoDoc,
  criarCamada,
  migrarOrdemCamadas,
  moverCamada,
  ordemDasCamadas,
  removerCamada,
  renomearCamada,
  reordenarCamadaSoltando,
  type LadoSolto,
  shapeOculto,
} from './camadasMapa'
import { normalizarOrdemMapa, OPCOES_ORDEM } from './montagemMapa'
import type { CamadaMapa } from './types'
import type { ContagemPorCamada } from '../components/PainelPropriedades'

/**
 * Partial que muda a camada de UM shape, já com o que a camada de destino impõe: travada
 * carimba `isLocked` e a marca `travadoPelaCamada`; destravada solta só quem tem a marca,
 * preservando cadeado que o usuário pôs à mão na peça (o mesmo contrato de
 * `aoAlternarTravada`).
 */
function partialParaCamada(shape: TLShape, idCamada: string, camadaTravada: boolean) {
  const travadoPelaCamada = (shape.meta as Record<string, unknown>).travadoPelaCamada === true
  return {
    id: shape.id,
    type: shape.type,
    // `travadoPelaCamada: false`, e não `delete`: `meta` é MESCLADA chave a chave pelo
    // tldraw (`applyPartialToRecordWithProps`, Editor.ts:10872-10879), então apagar a chave
    // de uma cópia não a remove do shape gravado. Todo teste de marca usa `=== true`, então
    // `false` é indistinguível de ausente para quem lê — e some do arquivo na prática.
    meta: { camada: idCamada, travadoPelaCamada: camadaTravada },
    isLocked: camadaTravada ? true : travadoPelaCamada ? false : shape.isLocked,
  }
}

/**
 * Contagem crua (por `meta.camada`, com `''` para peça sem carimbo) redistribuída pelas
 * camadas que existem AGORA. Peça sem camada ou com camada órfã cai na primeira — a MESMA
 * regra de `camadaDoShape` e `indiceDaCamada`; as três precisam concordar, senão o número
 * mostrado no painel não bate com o que o olho da camada esconde.
 */
export function contagemPorCamada(crua: ContagemPorCamada, camadas: CamadaMapa[]): ContagemPorCamada {
  const conhecidas = new Set(camadas.map((c) => c.id))
  const resultado: ContagemPorCamada = {}
  for (const camada of camadas) resultado[camada.id] = 0
  for (const [id, quantas] of Object.entries(crua)) {
    const destino = conhecidas.has(id) ? id : camadas[0]?.id
    if (destino) resultado[destino] += quantas
  }
  return resultado
}

/**
 * Shapes que uma ação de camada deve carimbar, a partir do que está SELECIONADO.
 *
 * Um grupo selecionado devolve só o id do GRUPO em `getSelectedShapeIds`, e é o FILHO que
 * `getShapeVisibility` consulta (a função roda por shape e lê a `meta` de cada um). Carimbar
 * só o grupo deixaria o conjunto com metade da identidade em cada camada: esconder a camada
 * de destino não esconderia nada, esconder a de origem apagaria o conteúdo de um grupo que
 * "está" na outra, e `normalizarOrdemMapa` — que agrupa por `parentId` — ordenaria os filhos
 * entre si com a camada errada como chave externa.
 */
function selecaoComDescendentes(editor: Editor): TLShape[] {
  const ids = new Set<string>()
  for (const id of editor.getSelectedShapeIds()) {
    ids.add(id)
    for (const filho of editor.getShapeAndDescendantIds([id])) ids.add(filho)
  }
  return [...ids].map((id) => editor.getShape(id as Parameters<typeof editor.getShape>[0])).filter((s): s is TLShape => !!s)
}

/**
 * Sistema de CAMADAS do mapa ligado ao editor: estado, as sete ações do `PainelCamadas`, a
 * visibilidade que o `<Tldraw>` consome e a reaplicação da ordem de empilhamento.
 *
 * Mora aqui, e não dentro do `MapaView`, pelo mesmo motivo de `montagemMapa.tsx`: o app
 * real (`MapaView`, com cofre e autosave) e a bancada (`amostra/CenaMapa.tsx`, documento em
 * memória) precisam do MESMO comportamento, e a bancada é onde a interface do mapa é
 * conferida no navegador — o app real só abre dentro do Tauri. Enquanto isto viveu só no
 * MapaView, camada era a única parte grande do mapa que não dava para ver funcionando fora
 * do app empacotado.
 *
 * O que NÃO entra: persistência. O hook chama `persistir` e não sabe o que é um cofre — o
 * MapaView passa `salvarCamadasMapa`, a bancada não passa nada.
 */

export interface CamadasMapa {
  camadas: CamadaMapa[]
  camadaAtivaId: string
  /** quantas peças cada camada tem, já com as órfãs somadas na primeira. */
  contagemPorCamada: ContagemPorCamada
  /** recebe a contagem crua da ponte dentro do `<Tldraw>` — ver `ProvedorContagemCamadas`. */
  definirContagem: (c: ContagemPorCamada) => void
  /** para `<Tldraw getShapeVisibility>` — identidade ESTÁVEL, ver o porquê abaixo. */
  getShapeVisibility: TLEditorOptions['getShapeVisibility']
  /** para `registrarBeforeCreateMapa`: qual camada carimbar e se ela trava a peça nova. */
  getCamadaAtivaId: () => string
  getCamadaTravada: (id: string) => boolean
  getOrdemCamadas: () => string[]
  /**
   * Aplica as camadas vindas do doc lido do cofre, convertendo a convenção antiga de ordem
   * quando `versao` for anterior à atual. Não persiste de volta — a gravação com o marcador
   * de versão sai na primeira ação de camada do usuário.
   *
   * `versao` é OBRIGATÓRIA de propósito: com valor padrão, uma lista já escrita na convenção
   * atual (a da bancada, a de um teste) seria silenciosamente invertida por ser lida como
   * legado. Quem tem `CanvasDoc` passa `doc.versaoCamadas`; quem monta a lista no código
   * passa `VERSAO_CAMADAS`.
   */
  carregarCamadas: (camadas: CamadaMapa[] | undefined, versao: number | undefined) => void
  /** reaplica o empilhamento com a pilha atual — para o `onMount`, antes de qualquer ação. */
  reordenarPelaPilha: () => void
  acoesDoPainel: {
    aoSelecionarAtiva: (id: string) => void
    aoCriar: (nome: string) => void
    aoRenomear: (id: string, nome: string) => void
    aoExcluir: (id: string) => void
    aoAlternarOculta: (id: string) => void
    aoAlternarTravada: (id: string) => void
    aoMover: (id: string, direcao: 'cima' | 'baixo') => void
    /** arrasto: a camada arrastada entra antes/depois da alvo, na ordem que a tela mostra. */
    aoSoltarCamada: (idArrastada: string, idAlvo: string, lado: LadoSolto) => void
    aoMoverSelecaoPara: (id: string) => void
  }
}

export function useCamadasMapa(
  editorRef: React.RefObject<Editor | null>,
  opts: { persistir?: (camadas: CamadaMapa[]) => void } = {},
): CamadasMapa {
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

  const [camadaAtivaId, setCamadaAtivaId] = useState(() => camadasAtom.get()[0].id)
  const camadaAtivaIdRef = useRef(camadaAtivaId)
  camadaAtivaIdRef.current = camadaAtivaId

  const [contagemCrua, setContagemCrua] = useState<ContagemPorCamada>({})

  // identidade estável (mesmo motivo do atom acima): criada uma única vez via useRef, e
  // ainda reage porque lê `camadasAtom.get()` por dentro.
  const getShapeVisibilityRef = useRef<TLEditorOptions['getShapeVisibility']>((shape) => {
    return shapeOculto(shape.meta, camadasAtom.get()) ? 'hidden' : 'inherit'
  })

  /**
   * Reaplica o empilhamento com a pilha de camadas dada. Camada é a chave EXTERNA da ordem
   * (ver `ordemMapa.ts`), então qualquer mexida na lista — subir, descer, criar, excluir,
   * mover peça — muda o `index` de TODAS as peças daquelas camadas de uma vez. Sem esta
   * chamada, subir uma camada no painel não moveria nada na tela: era exatamente a queixa
   * "ponho a porta numa camada superior e ela continua embaixo".
   */
  function reordenarCom(camadasAtuais: CamadaMapa[], opcoes: { registrarNoHistorico?: boolean } = {}) {
    const editor = editorRef.current
    if (editor) normalizarOrdemMapa(editor, ordemDasCamadas(camadasAtuais), opcoes)
  }

  function atualizarCamadas(novo: CamadaMapa[]) {
    camadasAtom.set(novo)
    reordenarCom(novo)
    opts.persistir?.(novo)
  }

  function carregarCamadas(doDoc: CamadaMapa[] | undefined, versao: number | undefined) {
    const normalizadas = camadasDoDoc(migrarOrdemCamadas(doDoc, versao))
    camadasAtom.set(normalizadas)
    // camada ATIVA é a da FRENTE (última do array): é onde o usuário espera desenhar ao
    // abrir o mapa, do mesmo jeito que a camada de cima é a selecionada no Photoshop.
    setCamadaAtivaId(normalizadas[normalizadas.length - 1].id)
    reordenarCom(normalizadas)
  }

  function aoCriar(nomeCamada: string) {
    const r = criarCamada(camadasAtom.get(), nomeCamada)
    atualizarCamadas(r.camadas)
    setCamadaAtivaId(r.novaId)
  }

  function aoRenomear(id: string, nomeCamada: string) {
    atualizarCamadas(renomearCamada(camadasAtom.get(), id, nomeCamada))
  }

  /**
   * Excluir a camada migra as peças dela para a herdeira. A camada excluída pode estar
   * TRAVADA — e aí o cadeado dela não pode virar prisão perpétua: a camada some do painel,
   * então nenhum 🔓 alcançaria mais aquelas peças (o toggle só percorre camadas existentes).
   * Por isso a migração destrava quem estava travado PELA CAMADA (marca `travadoPelaCamada`)
   * quando a herdeira está destravada, e trava quando ela está travada. Cadeado que o
   * usuário pôs à mão numa peça individual (sem a marca) continua intocado.
   */
  function aoExcluir(id: string) {
    const { camadas: restantes, idHerdeira } = removerCamada(camadasAtom.get(), id)
    if (restantes.length === camadasAtom.get().length) return // nunca removeu (era a última)
    const editor = editorRef.current
    if (editor) {
      const orfaos = editor.getCurrentPageShapes().filter((s) => camadaDoShape(s.meta, camadasAtom.get()).id === id)
      const herdeiraTravada = !!restantes.find((c) => c.id === idHerdeira)?.travada
      if (orfaos.length) {
        // `as TLShapePartial[]`: o `.map` genérico sobre shapes de tipos MISTOS perde a
        // correlação individual entre `id`/`type` que o tipo discriminado de
        // `TLShapePartial` exige por elemento (TS não distribui a união de `s.type` de
        // volta por item) — mesmo objeto que `editor.updateShapes` aceita em runtime,
        // só o checker que não consegue provar. Ver mesma nota nos outros usos abaixo.
        editor.run(
          () => editor.updateShapes(orfaos.map((s) => partialParaCamada(s, idHerdeira, herdeiraTravada)) as TLShapePartial[]),
          OPCOES_ORDEM,
        )
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
  function aoAlternarOculta(id: string) {
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
   * Destravar em massa não pode reverter um travamento MANUAL que o usuário fez num shape
   * individual (cadeado do próprio tldraw, fora do painel de camadas). Por isso
   * `meta.travadoPelaCamada: true` marca só os shapes que ESTE toggle travou (os que já
   * chegaram travados ficam sem marca — preservados como estão); destravar só mexe em quem
   * tem a marca, e a remove ao destravar. A mesma marca é carimbada no side-effect de
   * criação quando a forma nasce numa camada já travada — senão ela ficaria travada "sem
   * dono" para sempre.
   */
  function aoAlternarTravada(id: string) {
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
            })) as TLShapePartial[],
          )
        }
      } else {
        const aDestravar = daCamada.filter((s) => (s.meta as Record<string, unknown>).travadoPelaCamada === true)
        if (aDestravar.length) {
          // `ignoreShapeLock`: os shapes a destravar estão, por definição, TRAVADOS — sem a
          // flag o tldraw descartaria justamente estes updates e o 🔓 do painel não abriria
          // nada. (Travar não precisa da flag: parte de shape destravado.)
          editor.run(
            () =>
              editor.updateShapes(
                aDestravar.map((s) => ({
                  id: s.id,
                  type: s.type,
                  isLocked: false,
                  // `false` em vez de `delete`: `meta` é MESCLADA chave a chave pelo tldraw
                  // (Editor.ts:10872-10879), então apagar a chave de uma cópia não a remove
                  // do shape gravado — a marca ficava para trás e um cadeado que o usuário
                  // pusesse à mão DEPOIS seria solto pelo próximo destravar da camada.
                  meta: { travadoPelaCamada: false },
                })) as TLShapePartial[],
              ),
            { ignoreShapeLock: true },
          )
        }
      }
    }
    atualizarCamadas(novo)
  }

  function aoMover(id: string, direcao: 'cima' | 'baixo') {
    atualizarCamadas(moverCamada(camadasAtom.get(), id, direcao))
  }

  /**
   * Arrasto no painel. `reordenarCamadaSoltando` devolve a MESMA lista quando o gesto não
   * muda nada (soltou onde já estava, soltou em si mesma) — e aí o trabalho todo é pulado:
   * nada de reindexar a página inteira nem gravar o arquivo por um arrasto que não moveu.
   */
  function aoSoltarCamada(idArrastada: string, idAlvo: string, lado: LadoSolto) {
    const atual = camadasAtom.get()
    const novo = reordenarCamadaSoltando(atual, idArrastada, idAlvo, lado)
    if (novo !== atual) atualizarCamadas(novo)
  }

  /**
   * Move as peças SELECIONADAS para uma camada. É a ação que faltava para as camadas
   * servirem para alguma coisa: até aqui, `meta.camada` só era carimbada no NASCIMENTO da
   * peça (`registrarBeforeCreateMapa`) e não havia caminho nenhum para mudá-la depois —
   * peça nascia numa camada e morria nela, que é a raiz de "camadas não funciona".
   *
   * Herda da camada de destino o que a camada impõe: se ela está travada, a peça vai
   * travada e marcada com `travadoPelaCamada`; se está oculta, a peça sai da seleção, senão
   * ficaria selecionada-e-invisível obedecendo às setas do teclado e ao painel de
   * propriedades às cegas — mesmo cuidado de `aoAlternarOculta`.
   */
  function aoMoverSelecaoPara(idCamada: string) {
    const editor = editorRef.current
    if (!editor) return
    const listaAtual = camadasAtom.get()
    const destino = listaAtual.find((c) => c.id === idCamada)
    if (!destino) return
    // grupo selecionado devolve só o id do grupo; quem carrega a camada é o filho.
    const selecionadas = selecaoComDescendentes(editor)
    if (!selecionadas.length) return

    editor.run(
      () => {
        editor.updateShapes(
          selecionadas.map((s) => partialParaCamada(s, idCamada, destino.travada)) as TLShapePartial[],
        )
        reordenarCom(listaAtual, { registrarNoHistorico: true })
        if (destino.oculta) editor.setSelectedShapes([])
      },
      // a peça pode já estar travada pela camada de ORIGEM — sem a flag, mover uma peça
      // para fora de uma camada travada seria descartado em silêncio.
      { ignoreShapeLock: true },
    )
  }

  return {
    camadas,
    camadaAtivaId,
    contagemPorCamada: contagemPorCamada(contagemCrua, camadas),
    definirContagem: setContagemCrua,
    getShapeVisibility: getShapeVisibilityRef.current,
    getCamadaAtivaId: () => camadaAtivaIdRef.current,
    getCamadaTravada: (id) => !!camadasAtom.get().find((c) => c.id === id)?.travada,
    getOrdemCamadas: () => ordemDasCamadas(camadasAtom.get()),
    carregarCamadas,
    reordenarPelaPilha: () => reordenarCom(camadasAtom.get()),
    acoesDoPainel: {
      aoSelecionarAtiva: setCamadaAtivaId,
      aoCriar,
      aoRenomear,
      aoExcluir,
      aoAlternarOculta,
      aoAlternarTravada,
      aoMover,
      aoSoltarCamada,
      aoMoverSelecaoPara,
    },
  }
}
