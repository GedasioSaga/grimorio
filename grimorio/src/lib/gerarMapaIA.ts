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

/**
 * Modelo FIXO para gerar a planta, independente do modelo escolhido pelo usuário para
 * texto (`modeloSalvo()`, em `modeloIA.ts`) — decisão do usuário em 15/08/2026.
 *
 * O padrão barato do app (`MODELO_PADRAO` = "gemini-3.1-flash-lite") não dá conta do
 * raciocínio espacial que uma planta exige: cômodo vizinho precisa compartilhar parede,
 * corredor precisa ligar dois blocos separados, e um modelo lite devolve caixas soltas
 * com vão entre elas — a queixa original ("isso tá horrível", tudo vermelho, caixas
 * soltas, ver 5.png/6.png no relatório desta leva). O usuário testou na mão e teve que
 * trocar de modelo toda vez que ia gerar mapa; aqui a troca vira automática, só para esta
 * chamada — não mexe em `modeloSalvo()`, que continua valendo para chat/texto.
 *
 * `gemini-3-pro` é o mais capaz da tabela conhecida (`MODELOS_CONHECIDOS`, modeloIA.ts) —
 * a mesma nota "lore densa e coerência em texto longo" se aplica a manter dezenas de
 * cômodos coerentes entre si numa planta grande.
 */
export const MODELO_MAPA_PADRAO = 'gemini-3-pro'

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
      modelo: opts.modelo ?? MODELO_MAPA_PADRAO,
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
    '  "salas": [{ "x": 0, "y": 0, "w": 5, "h": 4, "rotulo": "Salão principal", "estado": "sem-info" }],\n' +
    '  "salasPoligono": [{ "pontos": [{"x":5,"y":0},{"x":9,"y":0},{"x":9,"y":3},{"x":7,"y":3},{"x":7,"y":4},{"x":5,"y":4}], "rotulo": "Cripta em L", "estado": "sem-info" }],\n' +
    '  "corredores": [{ "x": 5, "y": 1, "w": 1, "h": 2 }],\n' +
    '  "muralhas": [{ "x": -1, "y": -1, "w": 12, "h": 7 }],\n' +
    '  "torres": [{ "x": -2, "y": -2, "tamanho": 2 }],\n' +
    '  "escadas": [{ "x": 5, "y": 1, "w": 1, "h": 2 }],\n' +
    '  "portas": [{ "x": 5, "y": 2, "orientacao": "vertical", "estado": "livre" }],\n' +
    '  "simbolos": [{ "x": 6, "y": 2, "simbolo": "armadilha" }]\n' +
    '}\n\n' +
    'Peças disponíveis — use TODAS que fizerem sentido para o pedido, não só "salas":\n' +
    '- "salas": cômodo RETANGULAR. Use para qualquer sala simples.\n' +
    '- "salasPoligono": cômodo de forma IRREGULAR (L, T, chanfro) — "pontos" é a lista de ' +
    'vértices, em ordem ao redor do contorno (sentido horário ou anti-horário, tanto faz), ' +
    'mínimo 3. Use só quando o cômodo NÃO for um retângulo simples.\n' +
    '- "corredores": trecho de PASSAGEM entre dois blocos de sala que não encostam — sem ' +
    'corredor, o vão entre eles fica PRETO (vazio) no mapa, o que é um erro grave. É a peça ' +
    'que faz o mapa ler como prédio contínuo, não como caixas soltas no nada.\n' +
    '- "muralhas": contorno externo que cerca o conjunto inteiro (só a linha, sem preencher ' +
    'por dentro) — use quando o pedido envolver "castelo", "fortaleza", "muro", "cercado", ou ' +
    'qualquer construção com um perímetro claro. "x"/"y" pode ser NEGATIVO (a muralha nasce um ' +
    'pouco antes da primeira sala, para sobrar folga ao redor de tudo).\n' +
    '- "torres": marcador redondo no CANTO da muralha (torre de vigia, torreão). Um por canto ' +
    'é o padrão em castelo; "tamanho" é o lado do quadrado que a contém.\n' +
    '- "escadas": trecho de degraus, sempre DENTRO de um corredor (ou de uma sala) que já ' +
    'existe ali — não cria caminho novo sozinha, marca onde o caminho já desenhado sobe/desce.\n\n' +
    'Regras:\n' +
    '1. Todo x/y/w/h/tamanho é um INTEIRO em QUADRADOS da grade (não em pixel, pode ser ' +
    'negativo). x/y é o canto superior-esquerdo da peça (ou, em "salasPoligono", a origem dos ' +
    'vértices). w/h é a largura/altura em quadrados, sempre maior que zero.\n' +
    '2. "estado" da sala (retangular ou polígono) é um destes três: "sem-info" (o mestre ainda ' +
    'não decidiu o que tem ali, vira cinza-escuro — ESTE é o padrão, comece toda sala aqui), ' +
    '"pendente" (o texto do usuário diz explicitamente que ainda tem algo lá — monstro, tesouro, ' +
    'perigo —, vira vermelho), "limpa" (o texto diz que já foi resolvida, vira azul). NUNCA marque ' +
    '"pendente" por padrão: metade das salas de um pedido genérico não tem informação nenhuma, ' +
    'e pintar tudo de vermelho é o erro mais grave que esta planta pode cometer.\n' +
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
    '6. MASSA CONTÍNUA, NUNCA caixas soltas com vão preto entre elas — esta é a regra mais ' +
    'importante. Duas salas vizinhas DEVEM compartilhar a parede: a borda direita de uma é ' +
    'EXATAMENTE a borda esquerda da outra (mesma coordenada, sem gap). Exemplo CORRETO — sala A ' +
    '"x":0,"w":5" encostada em sala B: a sala B começa em "x":5 (não em "x":6, não em "x":7). Se ' +
    'duas salas não podem encostar (estão em partes separadas do prédio), ligue-as com um ' +
    '"corredores" preenchendo o vão inteiro entre as duas bordas — nunca deixe o vão sem peça ' +
    'nenhuma. Isso vale para TODAS as peças de sala/corredor/escada juntas: o conjunto inteiro ' +
    'tem de formar um bloco sem buraco preto no meio, só o exterior (fora da muralha, se houver) ' +
    'fica vazio.\n' +
    '7. Distribua as salas em torno de (0,0), crescendo para a direita/baixo (x/y positivos); ' +
    'muralha/torre podem usar coordenada negativa para sobrar margem ao redor do conjunto (ver ' +
    'regra 1).\n' +
    '8. Nunca invente campo fora deste formato, e nunca omita nenhuma das 8 listas — use lista ' +
    'vazia [] quando não houver peça daquele tipo. Um pedido só de "uma sala" ainda precisa de ' +
    'todas as 8 chaves no JSON, as demais vazias.\n' +
    '9. Se vier uma IMAGEM de referência: ela é uma PLANTA a LER, não uma foto a descrever. ' +
    'Identifique cada cômodo, corredor, muralha, torre, escada, porta e símbolo que aparece nela ' +
    'e TRADUZA cada um numa peça deste formato, na mesma disposição relativa (que sala fica ao ' +
    'lado de qual, onde ficam as portas) — não escreva um resumo em prosa do que a imagem mostra, ' +
    'e não invente peça que não está nela.'
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

  // sala em polígono: os vértices do shape são LOCAIS (relativos ao x/y de página do
  // próprio shape), diferente da sala retangular — a origem é o mínimo dos vértices, e
  // cada ponto vira o deslocamento até ela, já em px.
  if (spec.tipo === 'sala-poligono') {
    const minXQuad = Math.min(...spec.pontosQuad.map((p) => p.x))
    const minYQuad = Math.min(...spec.pontosQuad.map((p) => p.y))
    return {
      id,
      type: 'sala-poligono-mapa',
      x: quadradosParaPx(minXQuad, QUADRADO_PX),
      y: quadradosParaPx(minYQuad, QUADRADO_PX),
      props: {
        pontos: spec.pontosQuad.map((p) => ({
          x: quadradosParaPx(p.x - minXQuad, QUADRADO_PX),
          y: quadradosParaPx(p.y - minYQuad, QUADRADO_PX),
        })),
        ...spec.props,
      },
    }
  }

  // corredor, muralha e escada são a mesma família de caixa simples (w/h, sem estado nem
  // rótulo) que a sala — só muda o `type` do shape.
  if (spec.tipo === 'corredor' || spec.tipo === 'muralha' || spec.tipo === 'escada') {
    const type = spec.tipo === 'corredor' ? 'corredor-mapa' : spec.tipo === 'muralha' ? 'muralha-mapa' : 'escada-mapa'
    return {
      id,
      type,
      x: quadradosParaPx(spec.xQuad, QUADRADO_PX),
      y: quadradosParaPx(spec.yQuad, QUADRADO_PX),
      props: { w: quadradosParaPx(spec.wQuad, QUADRADO_PX), h: quadradosParaPx(spec.hQuad, QUADRADO_PX) },
    }
  }

  if (spec.tipo === 'torre') {
    const ladoPx = quadradosParaPx(spec.tamanhoQuad, QUADRADO_PX)
    return {
      id,
      type: 'torre-mapa',
      x: quadradosParaPx(spec.xQuad, QUADRADO_PX),
      y: quadradosParaPx(spec.yQuad, QUADRADO_PX),
      props: { w: ladoPx, h: ladoPx },
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
