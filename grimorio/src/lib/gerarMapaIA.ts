/**
 * I/O da "IA monta o mapa": chama o Gemini, lê a imagem de referência do disco, e converte
 * as especificações puras (`plantaMapaIA.ts`) em shapes de verdade no editor tldraw.
 *
 * Fica separado do núcleo puro pelo mesmo motivo de sempre no repo — aqui é onde vive tudo
 * que precisa de `editor`, `tldraw` e do plugin de HTTP/FS do Tauri, então é a parte que NÃO
 * dá para testar sem montar o app de verdade (ver relatório final).
 */
import { convertFileSrc } from '@tauri-apps/api/core'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'
import { gerarConteudo, type ImagemIA } from './gemini'
import { mimeDaImagem, uint8ParaBase64 } from './bin'
import { QUADRADO_PX, quadradosParaPx, type Caixa } from './quadrados'
import { proximoNumero } from './portaMapa'
import {
  bboxDaPlantaEmQuadrados,
  contarSalasSobrepostas,
  formatarResumoInsercao,
  parsearPlantaIA,
  plantaParaEspecificacoes,
  proximaAreaLivre,
  type EspecificacaoFormaIA,
  type PlantaIA,
} from './plantaMapaIA'
import { PORTA_ESPESSURA_PADRAO, PORTA_LARGURA_PADRAO } from './portaMapa'
import { tamanhoDoSimbolo } from '../components/SimboloMapaShape'

/** Margem entre o bloco novo e o que já existe no mapa, em quadrados. */
const MARGEM_AREA_LIVRE = 1

export type ResultadoGeracaoPlanta =
  | { ok: true; planta: PlantaIA; resumo: string }
  | { ok: false; erro: string }

/**
 * Chama a IA com o pedido do usuário (e imagem opcional) e devolve a planta já validada.
 * Nunca lança: erro de rede, de parse ou de validação vira `{ ok: false, erro }` em
 * português — quem chama só precisa decidir o que fazer com o resultado.
 */
export async function gerarPlantaIA(opts: {
  descricao: string
  imagem?: ImagemIA
  chaves: string[]
  modelo?: string
}): Promise<ResultadoGeracaoPlanta> {
  if (opts.chaves.length === 0) {
    return { ok: false, erro: 'IA não configurada. Cole sua chave da API do Gemini quando solicitado.' }
  }
  let texto: string
  try {
    texto = await gerarConteudo({
      system: promptSistemaMapa(),
      historico: [{ papel: 'user', texto: opts.descricao || 'Monte um mapa a partir da imagem anexada.' }],
      imagens: opts.imagem ? [opts.imagem] : [],
      chaves: opts.chaves,
      modelo: opts.modelo,
    })
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }

  const parse = parsearPlantaIA(texto)
  if (!parse.ok) return { ok: false, erro: parse.erro }

  const sobrepostas = contarSalasSobrepostas(parse.planta.salas)
  return { ok: true, planta: parse.planta, resumo: formatarResumoInsercao(parse.planta, sobrepostas) }
}

/**
 * O prompt vive aqui (não em `promptsIA.ts`) porque descreve um FORMATO de dado, não uma
 * instrução de escrita — é acoplado à validação de `plantaMapaIA.ts` a ponto de um campo
 * novo ali exigir mudar os dois juntos. `promptsIA.ts` continua sendo o lar dos prompts de
 * texto corrido (descrição, versão curta/longa etc.).
 */
function promptSistemaMapa(): string {
  return (
    'Você monta a PLANTA de um mapa de RPG top-down (estilo Resident Evil) a partir de um ' +
    'pedido em texto e/ou uma imagem de referência. Você NÃO desenha nada — devolve só a ' +
    'estrutura em coordenadas de GRADE, e o aplicativo desenha exatamente no estilo dele.\n\n' +
    'Responda com um único objeto JSON, SEM markdown, SEM texto antes ou depois, no formato:\n' +
    '{\n' +
    '  "salas": [{ "x": 0, "y": 0, "w": 5, "h": 4, "rotulo": "Salão principal", "estado": "pendente" }],\n' +
    '  "portas": [{ "x": 5, "y": 2, "orientacao": "vertical", "estado": "livre" }],\n' +
    '  "simbolos": [{ "x": 6, "y": 2, "simbolo": "armadilha" }]\n' +
    '}\n\n' +
    'Regras:\n' +
    '1. Todo x/y/w/h é um INTEIRO em QUADRADOS da grade (não em pixel). x/y é o canto ' +
    'superior-esquerdo da sala. w/h é a largura/altura em quadrados, sempre maior que zero.\n' +
    '2. "estado" da sala é um destes três: "pendente" (ainda tem algo, vira vermelho), ' +
    '"limpa" (já foi resolvida, vira azul), "sem-info" (o mestre ainda não decidiu, vira escuro). ' +
    'Comece tudo como "pendente" a menos que o pedido diga o contrário.\n' +
    '3. "rotulo" da sala é o nome do cômodo ("Salão principal", "Masmorra"), pode ser "" se não houver nome.\n' +
    '4. Porta: "x"/"y" é a CÉLULA da grade onde ela fica (normalmente na borda entre duas ' +
    'salas vizinhas); "orientacao" é "horizontal" (atravessa uma parede horizontal, a porta ' +
    'fica deitada) ou "vertical" (atravessa parede vertical, a porta fica em pé). "estado" é ' +
    '"livre" (passa), "trancada" (precisa de chave) ou "atencao" (precisa de item/ação).\n' +
    '5. Símbolo: "simbolo" é um destes IDs — "janela", "secreta" (passagem secreta), ' +
    '"armadilha", "marcador" (referência numerada, "rotulo" opcional vira o número), "mesa", ' +
    '"cama", "bau", "andar" (rótulo do andar — "rotulo" tipo "1F"), "pocao", "erva", "chave", ' +
    '"documento", "moeda", "espada", "municao", "livro", "tocha", "comida". "x"/"y" é a célula ' +
    'da grade; o app centraliza o desenho nela.\n' +
    '6. Salas NÃO devem se sobrepor propositalmente — encoste as bordas (a sala B começa onde ' +
    'a sala A termina) em vez de empilhar uma em cima da outra.\n' +
    '7. Distribua as salas em torno de (0,0), crescendo para a direita/baixo (x/y positivos).\n' +
    '8. Nunca invente campo fora deste formato, e nunca omita "salas"/"portas"/"simbolos" — use ' +
    'lista vazia [] quando não houver.'
  )
}

/** Lê uma imagem de um caminho ABSOLUTO do disco (não do cofre) para anexar ao pedido da IA. */
export async function carregarImagemDeArquivo(caminhoAbsoluto: string): Promise<ImagemIA | null> {
  try {
    const resp = await fetch(convertFileSrc(caminhoAbsoluto))
    if (!resp.ok) return null
    const bytes = new Uint8Array(await (await resp.blob()).arrayBuffer())
    return { mimeType: mimeDaImagem(caminhoAbsoluto), base64: uint8ParaBase64(bytes) }
  } catch {
    return null
  }
}

function proximoMarcadorNoEditor(editor: Editor): number {
  const rotulos = editor
    .getCurrentPageShapes()
    .filter((s) => s.type === 'simbolo-mapa')
    .map((s) => s as unknown as { props: { simbolo: string; rotulo: string } })
    .filter((s) => s.props.simbolo === 'marcador')
    .map((s) => s.props.rotulo)
  return proximoNumero(rotulos)
}

/** Especificação → parâmetros de `editor.createShape`, em PX de página. */
function especificacaoParaCriarShape(
  spec: EspecificacaoFormaIA,
): Parameters<Editor['createShape']>[0] {
  const id = createShapeId()

  if (spec.tipo === 'sala') {
    return {
      id,
      type: 'sala-mapa',
      x: quadradosParaPx(spec.xQuad, QUADRADO_PX),
      y: quadradosParaPx(spec.yQuad, QUADRADO_PX),
      props: { w: quadradosParaPx(spec.wQuad, QUADRADO_PX), h: quadradosParaPx(spec.hQuad, QUADRADO_PX), ...spec.props },
    }
  }

  if (spec.tipo === 'porta') {
    // a barra é menor que o quadrado da grade — centraliza dentro da célula, como um vão de parede
    const w = spec.orientacao === 'horizontal' ? PORTA_LARGURA_PADRAO : PORTA_ESPESSURA_PADRAO
    const h = spec.orientacao === 'horizontal' ? PORTA_ESPESSURA_PADRAO : PORTA_LARGURA_PADRAO
    const centroX = quadradosParaPx(spec.xQuad, QUADRADO_PX) + QUADRADO_PX / 2
    const centroY = quadradosParaPx(spec.yQuad, QUADRADO_PX) + QUADRADO_PX / 2
    return {
      id,
      type: 'porta-mapa',
      x: centroX - w / 2,
      y: centroY - h / 2,
      props: { w, h, ...spec.props },
    }
  }

  const { w, h } = tamanhoDoSimbolo(spec.simbolo)
  const centroX = quadradosParaPx(spec.xQuad, QUADRADO_PX) + QUADRADO_PX / 2
  const centroY = quadradosParaPx(spec.yQuad, QUADRADO_PX) + QUADRADO_PX / 2
  return {
    id,
    type: 'simbolo-mapa',
    x: centroX - w / 2,
    y: centroY - h / 2,
    props: { w, h, simbolo: spec.simbolo, ...spec.props },
  }
}

/**
 * Insere a planta no mapa ABERTO, em área vazia (sem encostar no que já existe) e com
 * tudo selecionado — um Ctrl+Z desfaz a inserção inteira (decisão 3). Portas ficam à
 * frente (mesma regra de `criarPorta` na toolbar: são uma marca sobre a parede).
 *
 * TUDO isto — criar, trazer porta à frente, trocar ferramenta, selecionar E mover a
 * câmera — acontece dentro de UM `editor.run()`. Verificado em
 * `node_modules/@tldraw/editor/src/lib/editor/managers/HistoryManager/HistoryManager.ts:85-113`:
 * `batch(fn)` acumula toda mudança do `fn` num `pendingDiff` só (via `transact`), e um
 * `run()` aninhado dentro de outro (`_isInBatch` já `true`) não abre um novo — continua no
 * mesmo. `_undo` (linha 116-130) desfaz o `pendingDiff` inteiro de uma vez quando ele não
 * está vazio, ou seja: span de um só `editor.run()` = um só Ctrl+Z. O único jeito de
 * quebrar isso em vários passos seria chamar `editor.markHistoryStoppingPoint()` no meio
 * — e o único lugar do editor que chama isso é o próprio método público (`Editor.ts:1203`,
 * única ocorrência), que nada aqui invoca. `createShapes`/`bringToFront`/`setCurrentTool`/
 * `setSelectedShapes`/`zoomToBounds` não abrem marca nenhuma.
 */
export function inserirPlantaNoMapaAberto(editor: Editor, planta: PlantaIA): void {
  const obstaculos: Caixa[] = editor
    .getCurrentPageShapes()
    .map((s) => editor.getShapePageBounds(s.id))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .map((b) => ({ x: b.x / QUADRADO_PX, y: b.y / QUADRADO_PX, w: b.w / QUADRADO_PX, h: b.h / QUADRADO_PX }))

  const tamanho = bboxDaPlantaEmQuadrados(planta)
  const viewport = editor.getViewportPageBounds()
  const preferido = {
    x: viewport.x / QUADRADO_PX + (viewport.w / QUADRADO_PX - tamanho.w) / 2,
    y: viewport.y / QUADRADO_PX + (viewport.h / QUADRADO_PX - tamanho.h) / 2,
  }
  const origemLivre = proximaAreaLivre(obstaculos, tamanho, preferido, MARGEM_AREA_LIVRE)
  const origem = { xQuad: Math.round(origemLivre.x), yQuad: Math.round(origemLivre.y) }

  const specs = plantaParaEspecificacoes(planta, origem, proximoMarcadorNoEditor(editor))
  const formas = specs.map(especificacaoParaCriarShape)
  const ids: TLShapeId[] = formas.map((f) => f.id as TLShapeId)
  const idsPortas = formas.filter((f) => f.type === 'porta-mapa').map((f) => f.id as TLShapeId)

  editor.run(() => {
    editor.createShapes(formas)
    if (idsPortas.length) editor.bringToFront(idsPortas)
    editor.setCurrentTool('select')
    editor.setSelectedShapes(ids)

    /**
     * `proximaAreaLivre` pode ter jogado a planta bem longe do que está na tela (regra
     * dela é "nunca sobrepor", não "ficar perto"). Sem mover a câmera, as formas nascem
     * selecionadas fora da vista — o usuário não vê nada acontecer e acha que falhou. Só
     * move quando precisa: se a seleção já cabe inteira no viewport, a câmera fica parada
     * (mover sem necessidade, logo depois de o usuário ter posicionado a própria view, é
     * o tipo de coisa que rouba orientação em vez de dar).
     */
    const bounds = editor.getSelectionPageBounds()
    if (bounds && !editor.getViewportPageBounds().contains(bounds)) {
      editor.zoomToBounds(bounds, { animation: { duration: 200 }, inset: 64 })
    }
  })
}

/**
 * Constrói as formas de uma planta para um mapa NOVO (sempre vazio, então nasce em 0,0 —
 * sem busca de área livre, não há nada pra encostar). Devolve os parâmetros prontos para
 * `editor.createShapes`; quem chama decide onde/quando montar o editor (ver `AcoesMapaIA`).
 */
export function especificacoesParaMapaNovo(planta: PlantaIA): Parameters<Editor['createShape']>[0][] {
  const specs = plantaParaEspecificacoes(planta, { xQuad: 0, yQuad: 0 }, 1)
  return specs.map(especificacaoParaCriarShape)
}
