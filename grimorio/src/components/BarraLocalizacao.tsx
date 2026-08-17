import { useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { flushModalPendente, useApp, type FalhaDescarga } from '../state/store'
import { contarDescendentes, encontrarCenarioNode } from '../lib/cenarioArvore'
import {
  caminhoLegivelCenario, caminhoLegivelItem, caminhoLegivelPersonagem,
  cenarioDestinoValido, destinosAbsorverCenario, destinosItem, destinosMoverCenario, destinosPersonagem,
  type OpcaoDestino,
} from '../lib/localizacaoEntidade'
import { SeletorDestino } from './SeletorDestino'

type TipoLocalizacao = 'personagem' | 'cenario' | 'item'

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    await message(`Operação falhou: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

/**
 * Barra fixa no topo da ficha (abaixo do nome/versões, acima das abas): mostra onde a
 * entidade mora no cofre e oferece mover dali mesmo. Fica FORA de theme.css de propósito
 * (ver src/estilos/localizacao.css) — theme.css é área disputada.
 */
export function BarraLocalizacao({ tipo, id }: { tipo: TipoLocalizacao; id: string }) {
  const tree = useApp((s) => s.tree)
  const nomePersonagem = useApp((s) => (tipo === 'personagem' ? s.personagens[id]?.nome : undefined))
  const nomeCenario = useApp((s) => (tipo === 'cenario' ? s.cenarios[id]?.nome : undefined))
  const nomeItem = useApp((s) => (tipo === 'item' ? s.itens[id]?.nome : undefined))
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const carregarPersonagens = useApp((s) => s.carregarPersonagens)
  const carregarCenarios = useApp((s) => s.carregarCenarios)
  const carregarItens = useApp((s) => s.carregarItens)
  const [seletor, setSeletor] = useState<'mover' | 'absorver' | null>(null)

  const nome = tipo === 'personagem' ? nomePersonagem : tipo === 'cenario' ? nomeCenario : nomeItem
  if (!tree || !nome) return null

  const caminho =
    tipo === 'personagem' ? caminhoLegivelPersonagem(tree, id, nome)
    : tipo === 'cenario' ? caminhoLegivelCenario(tree, id, nome)
    : caminhoLegivelItem(tree, id, nome)

  /**
   * Caminho de arquivo (não o rótulo legível) da entidade ATUAL — usado para separar, dentro
   * de `falhas` (que cobre o cofre inteiro), a que é desta entidade das que são de outra.
   */
  function caminhoArquivoAtual(): string | undefined {
    const s = useApp.getState()
    return tipo === 'personagem' ? s.caminhoPorId[id]
      : tipo === 'item' ? s.caminhoItemPorId[id]
      : s.caminhoCenarioPorId[id]
  }

  /**
   * `descarregarFilas()` descarrega TODAS as gravações pendentes do cofre, não só a desta
   * entidade — uma falha em um cartão qualquer no canvas não pode travar o mover/absorver da
   * entidade atual com uma mensagem que dá a entender que é a edição DELA. Proporcional: falha
   * na própria entidade bloqueia (lança); falha alheia é avisada com honestidade (dizendo
   * qual) e a operação segue, porque a edição da entidade atual está confirmada em disco.
   */
  async function checarFalhasDescarga(falhas: FalhaDescarga[], flushOk: boolean, verbo: string) {
    const caminhoAtual = caminhoArquivoAtual()
    const falhaPropria = falhas.some((f) => f.caminho === caminhoAtual)
    if (!flushOk || falhaPropria) {
      throw new Error(
        `Não foi possível gravar uma edição pendente antes de ${verbo} — nada foi alterado, ` +
        'para não perder essa edição. A edição continua na tela; tente salvar de novo.',
      )
    }
    const falhasAlheias = falhas.filter((f) => f.caminho !== caminhoAtual)
    if (falhasAlheias.length > 0) {
      const rotulos = falhasAlheias.map((f) => f.rotulo || f.caminho).join(', ')
      await message(
        `A edição de "${nome}" foi gravada e a operação vai continuar, mas uma edição pendente ` +
        `de outra entidade não pôde ser gravada: ${rotulos}. Essa edição continua pendente — ` +
        'abra a ficha dela e tente salvar de novo.',
        { title: 'Grimório', kind: 'warning' },
      )
    }
  }

  async function mover(destino: OpcaoDestino) {
    setSeletor(null)
    const { repo } = useApp.getState()
    if (!repo) return
    await comAviso(async () => {
      // descarrega QUALQUER gravação pendente ANTES de mover: o autosave local do modal
      // (800ms) e os timers de módulo (canvas/vínculos/layout) foram agendados com o
      // caminho de ANTES — se disparassem depois do fs.rename, escreveriam no lugar
      // errado (cenário) ou ressuscitariam um .json fantasma na pasta antiga
      // (personagem/item, que só perdem o ARQUIVO ao mover — a pasta continua existindo).
      // Ver `registrarFlushModal`/`flushModalPendente` em state/store.ts.
      //
      // Os DOIS retornos precisam ser checados: se a gravação de segurança falhou (disco
      // cheio, permissão negada etc.), mover mesmo assim seria pior que o defeito original —
      // a edição não estaria em lugar nenhum, e ninguém saberia. Por isso a falha aqui
      // interrompe (lança, `comAviso` mostra o diálogo) ANTES de tocar no arquivo/pasta: a
      // reorganização é adiável, perder texto digitado não é. Mas só quando a falha é DESTA
      // entidade — `checarFalhasDescarga` separa a própria de uma alheia (ver docstring dela).
      const flushOk = await flushModalPendente(tipo, id)
      const falhas = await useApp.getState().descarregarFilas()
      await checarFalhasDescarga(falhas, flushOk, 'mover')
      if (tipo === 'personagem') {
        const caminhoAtual = useApp.getState().caminhoPorId[id]
        if (!caminhoAtual) return
        await repo.moverPersonagem(caminhoAtual, destino.caminho)
        await recarregarArvore()
        await carregarPersonagens()
      } else if (tipo === 'item') {
        const caminhoAtual = useApp.getState().caminhoItemPorId[id]
        if (!caminhoAtual) return
        await repo.moverItem(caminhoAtual, destino.caminho)
        await recarregarArvore()
        await carregarItens()
      } else {
        const t = useApp.getState().tree
        if (!t || !cenarioDestinoValido(t, id, destino.caminho)) {
          await message('Não é possível mover um cenário para dentro dele mesmo ou de um sub-cenário dele.', { title: 'Grimório', kind: 'error' })
          return
        }
        const caminhoAtual = useApp.getState().caminhoCenarioPorId[id]
        if (!caminhoAtual) return
        await repo.moverCenario(caminhoAtual, destino.caminho)
        await recarregarArvore()
        await carregarCenarios()
      }
    })
  }

  async function absorver(destino: OpcaoDestino) {
    setSeletor(null)
    if (!destino.id) return
    const t = useApp.getState().tree
    if (!t || !cenarioDestinoValido(t, id, destino.caminho)) {
      await message('Destino inválido para transformar em versão.', { title: 'Grimório', kind: 'error' })
      return
    }
    const node = encontrarCenarioNode(t.cenarios, id)
    const qtdDescendentes = node ? contarDescendentes(node) : 0
    const aviso = qtdDescendentes > 0
      ? ` Os ${qtdDescendentes} sub-cenário(s) dele também vão para a lixeira junto.`
      : ''
    const nomeDestino = destino.rotulo.split(' > ').pop() ?? destino.rotulo
    const ok = await ask(
      `"${nome}" vai deixar de existir como cenário próprio e virar uma versão de "${nomeDestino}". ` +
      `O que sobrar dele vai para a lixeira — dá para restaurar o "${nome}" separado de volta, ` +
      `MAS as versões dele que entraram em "${nomeDestino}" ficam lá para sempre (restaurar não ` +
      `desfaz a fusão, e a única forma de tirá-las de lá é excluir a versão à mão).${aviso} Continuar?`,
      { title: 'Grimório', kind: 'warning' },
    )
    if (!ok) return
    await comAviso(async () => {
      // mesmo racional de `mover`: flush do pendente ANTES de absorver, senão o autosave
      // local do modal grava por cima do cenário-origem já esvaziado/mandado pra lixeira.
      // E mesma checagem de falha (proporcional — ver `checarFalhasDescarga`): se a gravação
      // de segurança DESTA entidade não deu certo, NÃO absorve — a origem seria mandada pra
      // lixeira sem a edição pendente ter chegado nela em lugar nenhum (nem no arquivo
      // antigo, nem migrada pro destino).
      const flushOk = await flushModalPendente(tipo, id)
      const falhas = await useApp.getState().descarregarFilas()
      await checarFalhasDescarga(falhas, flushOk, 'transformar em versão')
      await useApp.getState().absorverCenarioComoVersao(id, destino.id!)
    })
  }

  const destinos =
    seletor === 'mover'
      ? (tipo === 'personagem' ? destinosPersonagem(tree)
        : tipo === 'item' ? destinosItem(tree)
        : destinosMoverCenario(tree, id))
      : seletor === 'absorver' && tipo === 'cenario'
        ? destinosAbsorverCenario(tree, id)
        : []

  return (
    <div className="barra-localizacao">
      {caminho ? (
        <span className="barra-localizacao-caminho" title={caminho.join(' › ')}>
          {caminho.map((rotulo, i) => (
            <span key={i}>
              {i > 0 && <span className="barra-localizacao-separador">›</span>}
              <span className={i === caminho.length - 1 ? 'barra-localizacao-atual' : ''}>{rotulo}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="barra-localizacao-caminho barra-localizacao-desconhecida">Localização desconhecida</span>
      )}
      <span className="barra-localizacao-acoes">
        <button className="barra-localizacao-btn" onClick={() => setSeletor('mover')}>
          {tipo === 'cenario' ? 'Mover para dentro de…' : 'Mover para pasta…'}
        </button>
        {tipo === 'cenario' && (
          <button className="barra-localizacao-btn" onClick={() => setSeletor('absorver')}>
            Transformar em versão de…
          </button>
        )}
      </span>
      {seletor && (
        <SeletorDestino
          titulo={seletor === 'mover' ? 'Mover para…' : 'Transformar em versão de…'}
          opcoes={destinos}
          aoEscolher={(destino) => void (seletor === 'mover' ? mover(destino) : absorver(destino))}
          aoFechar={() => setSeletor(null)}
        />
      )}
    </div>
  )
}
