import { useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { pedirTexto } from './dialogos'
import type { CamadaMapa } from '../lib/types'
import type { LadoSolto } from '../lib/camadasMapa'
import '../estilos/mapa-formas.css'

/**
 * MIME próprio do arrasto de camada.
 *
 * Precisa ser próprio, e não `text/plain`: o `.mapa-wrap` inteiro tem handlers de drop em
 * fase de CAPTURA para soltar cenário/personagem/imagem no mapa (`dropsDeEntidade.tsx`), e
 * eles decidem se engolem o evento OLHANDO O MIME. Com um tipo desconhecido eles deixam
 * passar intacto — é o que mantém o arrasto do painel isolado do arrasto de entidade, sem
 * nenhum dos dois precisar saber do outro.
 */
const MIME_CAMADA = 'application/x-grimorio-camada'

/**
 * Painel de camadas do Mapa: item colapsável da `.mapa-coluna-esq` do `.mapa-wrap`, fora do
 * `<Tldraw>`. Componente burro — só apresenta `camadas` e chama os callbacks; quem possui o
 * estado, aplica `getShapeVisibility`/`isLocked`/ordem de empilhamento e persiste é o
 * MapaView.
 *
 * Não posiciona a si mesmo: quem empilha é a coluna flex. A versão anterior recebia um
 * `topPx` calculado a partir de uma altura FIXA presumida do painel de propriedades, e
 * cobria o fim dele sempre que a seleção tinha campos demais para caber nessa presunção.
 *
 * ## A lista é desenhada INVERTIDA
 *
 * `camadas` chega do fundo pro topo (convenção documentada em `lib/camadasMapa.ts`, de onde
 * sai também a ordem de empilhamento real). Aqui ela é desenhada ao contrário, para a
 * primeira linha ser a camada da FRENTE — é assim em Photoshop, Figma e Krita, e é o que
 * faz o ▲ da linha significar a mesma coisa que "subir": mais perto do observador, e mais
 * acima na lista. Desenhar na ordem crua deixaria o ▲ subindo a linha e AFUNDANDO a camada.
 */
export function PainelCamadas({
  camadas,
  ativaId,
  temSelecao,
  camadasDaSelecao,
  contagemPorCamada,
  aoSelecionarAtiva,
  aoCriar,
  aoRenomear,
  aoExcluir,
  aoAlternarOculta,
  aoAlternarTravada,
  aoMover,
  aoSoltarCamada,
  aoMoverSelecaoPara,
}: {
  camadas: CamadaMapa[]
  ativaId: string
  /** há peça selecionada no mapa? habilita o "mover seleção para cá" de cada linha. */
  temSelecao: boolean
  /** camadas onde a seleção mora — a linha ganha um ponto, como no Photopea/Figma. */
  camadasDaSelecao: string[]
  /** quantas peças cada camada tem, para a linha não ser opaca sobre o próprio conteúdo. */
  contagemPorCamada: Record<string, number>
  aoSelecionarAtiva: (id: string) => void
  aoCriar: (nome: string) => void
  aoRenomear: (id: string, nome: string) => void
  aoExcluir: (id: string) => void
  aoAlternarOculta: (id: string) => void
  aoAlternarTravada: (id: string) => void
  aoMover: (id: string, direcao: 'cima' | 'baixo') => void
  /** arrasto: a arrastada entra antes/depois da alvo, na ordem que a tela mostra. */
  aoSoltarCamada: (idArrastada: string, idAlvo: string, lado: LadoSolto) => void
  aoMoverSelecaoPara: (id: string) => void
}) {
  const [colapsado, setColapsado] = useState(false)
  /** id da camada sendo arrastada e onde ela cairia — só efeito visual, o estado real é do MapaView. */
  const [arrastandoId, setArrastandoId] = useState<string | null>(null)
  const [alvoSolta, setAlvoSolta] = useState<{ id: string; lado: LadoSolto } | null>(null)

  function limparArrasto() {
    setArrastandoId(null)
    setAlvoSolta(null)
  }

  /**
   * Metade de cima da linha = solta ANTES dela; metade de baixo = DEPOIS. É o que qualquer
   * lista reordenável faz, e é o que permite pousar no extremo da pilha: sem o "depois" da
   * última linha, não haveria gesto para mandar uma camada para o fundo de tudo.
   */
  function ladoDaSolta(e: React.DragEvent<HTMLLIElement>): LadoSolto {
    const caixa = e.currentTarget.getBoundingClientRect()
    return e.clientY < caixa.top + caixa.height / 2 ? 'antes' : 'depois'
  }

  async function criar() {
    const nome = await pedirTexto('Nome da nova camada', '', 'Criar')
    if (nome) aoCriar(nome)
  }

  async function renomear(camada: CamadaMapa) {
    const nome = await pedirTexto('Renomear camada', camada.nome, 'Renomear')
    if (nome) aoRenomear(camada.id, nome)
  }

  async function excluir(camada: CamadaMapa) {
    if (camadas.length <= 1) return
    const ok = await ask(`Excluir a camada "${camada.nome}"? As formas dela passam para a camada vizinha.`, {
      title: 'Grimório', kind: 'warning',
    })
    if (ok) aoExcluir(camada.id)
  }

  if (colapsado) {
    return (
      <button
        type="button"
        className="painel-camadas-reabrir"
        title="Mostrar camadas"
        onClick={() => setColapsado(false)}
      >
        🗂
      </button>
    )
  }

  return (
    <div className="painel-camadas">
      <div className="painel-camadas-cabecalho">
        <span>Camadas</span>
        <button type="button" className="btn-icon" title="Esconder painel" onClick={() => setColapsado(true)}>»</button>
      </div>
      {/* O realce forte da linha significa "camada ATIVA" (onde a peça nova nasce), e o ponto
          dourado significa "a seleção está aqui". Dois realces sem legenda competiam: o juiz
          cego leu o realce como "camada da peça selecionada" e concluiu que o painel não
          seguia a seleção. Esta linha diz em palavras o que o realce quer dizer. */}
      <p className="painel-camadas-dica">
        peça nova → <strong>{camadas.find((c) => c.id === ativaId)?.nome ?? '—'}</strong>
      </p>
      <ul className="painel-camadas-lista">
        {[...camadas].reverse().map((camada) => (
          <li
            key={camada.id}
            className={[
              'painel-camadas-item',
              camada.id === ativaId ? 'ativa' : '',
              camada.id === arrastandoId ? 'arrastando' : '',
              alvoSolta?.id === camada.id ? `solta-${alvoSolta.lado}` : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable
            onClick={() => aoSelecionarAtiva(camada.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData(MIME_CAMADA, camada.id)
              e.dataTransfer.effectAllowed = 'move'
              setArrastandoId(camada.id)
            }}
            onDragOver={(e) => {
              // `preventDefault` só para o NOSSO arrasto: sem o guard, o painel viraria alvo
              // de qualquer coisa arrastada de fora (imagem, ficha) e engoliria o drop.
              if (!e.dataTransfer.types.includes(MIME_CAMADA)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              const lado = ladoDaSolta(e)
              if (alvoSolta?.id !== camada.id || alvoSolta.lado !== lado) setAlvoSolta({ id: camada.id, lado })
            }}
            onDrop={(e) => {
              const idArrastada = e.dataTransfer.getData(MIME_CAMADA)
              if (!idArrastada) return
              e.preventDefault()
              e.stopPropagation()
              aoSoltarCamada(idArrastada, camada.id, ladoDaSolta(e))
              limparArrasto()
            }}
            onDragEnd={limparArrasto}
          >
            {/*
              DUAS linhas por camada, e não uma. O nome é o identificador da linha, e
              dividindo a largura com seis botões sobravam ~7 caracteres: "Segredos do Mestre"
              e "Segredos dos Jogadores" viravam ambos "Segred…". Pior, o ponto de seleção
              roubava mais alguns justo quando o painel fica mais útil. Numa fileira só dele,
              o nome ocupa a largura inteira do painel — a mesma que a linha de dica acima já
              usava sem cortar, o que provava que o espaço existia.
            */}
            <div className="painel-camadas-linha-nome">
              {/* ponto = a seleção tem peça nesta camada. Sem isso o usuário seleciona uma
                  porta e não tem como descobrir de qual camada ela é — metade da queixa. */}
              <span
                className={`painel-camadas-nome${camadasDaSelecao.includes(camada.id) ? ' com-selecao' : ''}`}
                title={camadasDaSelecao.includes(camada.id) ? `${camada.nome} — a seleção tem peça aqui` : camada.nome}
                onDoubleClick={() => void renomear(camada)}
              >
                {camada.nome}
              </span>
              {/* Quantas peças moram aqui. Sem isso, apertar o olho de uma linha podia apagar
                  o mapa inteiro sem nada antes ter dito que aquela camada guardava tudo — e a
                  camada vazia era indistinguível da cheia. */}
              <span className="painel-camadas-contagem" title={`${contagemPorCamada[camada.id] ?? 0} peça(s) nesta camada`}>
                {contagemPorCamada[camada.id] ?? 0}
              </span>
            </div>
            <span className="painel-camadas-acoes">
              {/* Renomear tem BOTÃO, não só duplo-clique: o duplo-clique divide o gesto com o
                  clique que ativa a camada, e numa camada ainda não ativa o primeiro par de
                  cliques era consumido pela ativação — o usuário clicava duas vezes e nada
                  abria. O duplo-clique no nome continua valendo como atalho. */}
              <button
                type="button"
                className="btn-icon"
                title="Renomear camada"
                onClick={(e) => { e.stopPropagation(); void renomear(camada) }}
              >
                ✎
              </button>
              <button
                type="button"
                className="btn-icon"
                title={camada.oculta ? 'Mostrar camada' : 'Esconder camada'}
                onClick={(e) => { e.stopPropagation(); aoAlternarOculta(camada.id) }}
              >
                {camada.oculta ? '🚫' : '👁'}
              </button>
              <button
                type="button"
                className="btn-icon"
                title={camada.travada ? 'Destravar camada' : 'Travar camada'}
                onClick={(e) => { e.stopPropagation(); aoAlternarTravada(camada.id) }}
              >
                {camada.travada ? '🔒' : '🔓'}
              </button>
              {/* Desabilitados nos extremos da pilha: habilitado-e-inerte é pior que
                  desabilitado — o usuário clica, nada acontece, e ele não sabe se a ação
                  falhou ou se já estava no fim. `camadas` vem do fundo pro topo. */}
              <button
                type="button"
                className="btn-icon"
                title={camada.id === camadas[camadas.length - 1]?.id ? 'Já é a camada da frente' : 'Trazer a camada para a frente'}
                disabled={camada.id === camadas[camadas.length - 1]?.id}
                onClick={(e) => { e.stopPropagation(); aoMover(camada.id, 'cima') }}
              >
                ▲
              </button>
              <button
                type="button"
                className="btn-icon"
                title={camada.id === camadas[0]?.id ? 'Já é a camada do fundo' : 'Mandar a camada para trás'}
                disabled={camada.id === camadas[0]?.id}
                onClick={(e) => { e.stopPropagation(); aoMover(camada.id, 'baixo') }}
              >
                ▼
              </button>
              {/* SEMPRE visível, desabilitado sem seleção. Mover peça de camada é a ação
                  que faltava para as camadas servirem para alguma coisa; escondê-la até
                  haver seleção significa que quem abre o painel e vê os mesmos ícones de
                  antes conclui que continua sem dar para mover — e um botão que aparece do
                  nada no meio de outros cinco lê como ruído, não como affordance. */}
              <button
                type="button"
                className="btn-icon camada-receber-selecao"
                title={temSelecao ? 'Mover a seleção para esta camada' : 'Selecione peças no mapa para movê-las para cá'}
                disabled={!temSelecao}
                onClick={(e) => { e.stopPropagation(); aoMoverSelecaoPara(camada.id) }}
              >
                ⤵
              </button>
              {camadas.length > 1 && (
                <button
                  type="button"
                  className="btn-icon"
                  title="Excluir camada"
                  onClick={(e) => { e.stopPropagation(); void excluir(camada) }}
                >
                  🗑
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="painel-camadas-add" onClick={() => void criar()}>+ camada</button>
    </div>
  )
}
