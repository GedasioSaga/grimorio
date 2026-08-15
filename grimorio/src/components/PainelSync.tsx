import { useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import { useSync } from '../state/syncStore'
import {
  avisosDoSync,
  copiasDeConflito,
  resumirSync,
  type AvisoSync,
  type CopiaDeConflito,
} from '../lib/painelSync'

const ROTULO_DO_TIPO: Record<CopiaDeConflito['tipo'], string> = {
  personagem: 'Personagem',
  cenario: 'Cenário',
  canvas: 'Canvas',
  mapa: 'Mapa',
}

/** Mesmo padrão de `Sidebar.tsx`/`ItensSoltos.tsx`: erro de exclusão vira diálogo, nunca promise sem handler. */
async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    await message(`Operação falhou: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

/** Chave estável de uma cópia — id para personagem/cenário, caminho para canvas/mapa. */
function chaveDaCopia(copia: CopiaDeConflito): string {
  return `${copia.tipo}:${'id' in copia ? copia.id : copia.caminho}`
}

interface PainelSyncProps {
  onFechar: () => void
  /** Parear: ligar este cofre a uma pasta do Drive. Só aparece enquanto ele não estiver ligado. */
  onLigar: () => void
  /** Um ciclo agora, sem esperar o tique de 60 s. */
  onSincronizar: () => void
  /** Uma ação da aba está em andamento. Trava os dois botões. */
  ocupado: boolean
}

/**
 * O estado do sync com o Google Drive, dentro da aba Nuvem.
 *
 * Não decide nada: quem age é o sincronizador (`state/sync.ts`), e este painel só mostra o
 * retrato que ele publica e devolve os dois cliques que o usuário pode dar. O botão é UM só de
 * cada vez, e qual deles depende de `pareado` — oferecer "sincronizar agora" num cofre que nunca
 * foi ligado seria um botão que não tem o que fazer.
 *
 * `useSync()` sem seletor assina o retrato inteiro de propósito: é o store separado justamente
 * para que assinar tudo custe barato, e este painel usa todos os campos.
 */
export function PainelSync({ onFechar, onLigar, onSincronizar, ocupado }: PainelSyncProps) {
  const estado = useSync()
  const personagens = useApp((s) => s.personagens)
  const cenarios = useApp((s) => s.cenarios)
  const tree = useApp((s) => s.tree)
  const campanhaFiltro = useApp((s) => s.campanhaFiltro)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const abrirCenario = useApp((s) => s.abrirCenario)
  const abrirDocumento = useApp((s) => s.abrirDocumento)
  const repo = useApp((s) => s.repo)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const caminhoCenarioPorId = useApp((s) => s.caminhoCenarioPorId)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const carregarPersonagens = useApp((s) => s.carregarPersonagens)
  const carregarCenarios = useApp((s) => s.carregarCenarios)
  /** Chave da cópia cujo Descartar está em voo — trava só a LINHA dela, não a aba inteira. */
  const [emAndamento, setEmAndamento] = useState<string | null>(null)

  const resumo = resumirSync(estado, new Date())
  const avisos = avisosDoSync(estado)
  const copias = copiasDeConflito(
    personagens, cenarios, tree?.canvasesSoltos ?? [], tree?.mapasSoltos ?? [], caminhoPorId, caminhoCenarioPorId,
  )

  function abrirCopia(copia: CopiaDeConflito) {
    // As Opções são uma `.modal-overlay` com o mesmo z-index do PerfilModal e vêm DEPOIS dele no
    // DOM (App.tsx): sem fechar aqui, a cópia abriria atrás desta janela.
    onFechar()
    if (copia.tipo === 'personagem') abrirPerfil(copia.id)
    else if (copia.tipo === 'cenario') abrirCenario(copia.id)
    else abrirDocumento(copia.tipo, copia.caminho, copia.nome)
  }

  /**
   * Descarta a cópia — a metade que faltava do Defeito B: a cópia de mapa/canvas já existia no
   * disco e aparecia crua na sidebar, mas não havia como descartá-la por aqui. Confirmação
   * explícita porque é deleção de verdade, não um "mover para lixeira": `ask()` é o mesmo padrão
   * de `PainelCamadas.tsx`.
   *
   * Erro de exclusão vira `comAviso` (não fica sem handler), e caminho ausente no cache LANÇA em
   * vez de virar no-op silencioso: sem isso o usuário confirma "não pode ser desfeita", nada é
   * apagado, nenhum aviso aparece, e `recarregarArvore()` roda igual — ele sai achando que
   * descartou o que continua no disco.
   */
  async function descartarCopia(copia: CopiaDeConflito) {
    if (!repo || emAndamento !== null) return
    const ok = await ask(`Descartar "${copia.nome}"? Esta ação não pode ser desfeita.`, {
      title: 'Grimório', kind: 'warning',
    })
    if (!ok) return

    const chave = chaveDaCopia(copia)
    setEmAndamento(chave)
    await comAviso(async () => {
      if (copia.tipo === 'personagem') {
        const caminho = caminhoPorId[copia.id]
        if (!caminho) throw new Error(`não achei o arquivo de "${copia.nome}" no cofre — feche e abra a aba Nuvem de novo`)
        await repo.excluirItem(caminho)
        await carregarPersonagens()
      } else if (copia.tipo === 'cenario') {
        const caminho = caminhoCenarioPorId[copia.id]
        if (!caminho) throw new Error(`não achei a pasta de "${copia.nome}" no cofre — feche e abra a aba Nuvem de novo`)
        await repo.excluirCenario(caminho)
        await carregarCenarios()
      } else {
        // canvas e mapa podem ter uma pasta `.notas` irmã — mesma regra de `Sidebar.tsx`
        await repo.excluirItemComNotas(copia.caminho)
      }
      await recarregarArvore()
    })
    setEmAndamento(null)
  }

  return (
    <>
      <h3>Sincronização</h3>
      <p className={`sync-titulo sync-${resumo.tom}`}>{resumo.titulo}</p>
      {resumo.detalhe && <p className="opcoes-vazio">{resumo.detalhe}</p>}

      {estado.pareado ? (
        <button
          className="opcoes-acao"
          disabled={ocupado || estado.fase === 'sincronizando'}
          onClick={onSincronizar}
        >
          {estado.fase === 'sincronizando' ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      ) : (
        <button className="opcoes-acao" disabled={ocupado} onClick={onLigar}>
          {ocupado ? 'Ligando…' : 'Ligar este cofre ao Google Drive'}
        </button>
      )}

      {avisos.map((aviso) => (
        <Aviso key={aviso.chave} aviso={aviso} />
      ))}

      {copias.length > 0 && (
        <>
          <h3>Cópias criadas por conflito</h3>
          <p className="opcoes-vazio">
            O mesmo item foi editado em dois computadores. Nada se perdeu: a versão que ficou de
            fora virou uma cópia à parte, para você comparar e apagar a que não quiser.
          </p>
          {campanhaFiltro !== null && (
            <p className="opcoes-vazio">
              Uma cópia nasce sem campanha, então com o filtro de campanha ligado ela não aparece
              na barra lateral. Abrir por aqui funciona mesmo assim.
            </p>
          )}
          <ul className="opcoes-lista">
            {copias.map((copia) => {
              const chave = chaveDaCopia(copia)
              // trava só esta linha: duplo clique não dispara `descartarCopia` duas vezes em
              // paralelo, e apagar uma cópia não impede abrir/descartar as outras da lista
              const linhaOcupada = emAndamento === chave
              return (
                <li key={chave} className="sync-copia-item">
                  <span className="opcoes-cofre-nome">{copia.nome}</span>
                  <span className="opcoes-cofre-caminho">{ROTULO_DO_TIPO[copia.tipo]}</span>
                  <span className="opcoes-cofre-acoes">
                    <button disabled={linhaOcupada} onClick={() => abrirCopia(copia)}>Abrir</button>
                    <button disabled={linhaOcupada} onClick={() => descartarCopia(copia)}>
                      {linhaOcupada ? 'Descartando…' : 'Descartar'}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}

/** Um problema de pé: título, explicação e a lista de arquivos ou motivos por trás dele. */
function Aviso({ aviso }: { aviso: AvisoSync }) {
  return (
    <div className={`sync-aviso sync-aviso-${aviso.chave}`}>
      <strong className="sync-aviso-titulo">{aviso.titulo}</strong>
      {aviso.paragrafos.map((texto, i) => (
        // índice como chave: a lista é fixa por aviso e nunca reordena
        <p key={i}>{texto}</p>
      ))}
      {aviso.itens.length > 0 && (
        <ul className="sync-aviso-itens">
          {aviso.itens.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
