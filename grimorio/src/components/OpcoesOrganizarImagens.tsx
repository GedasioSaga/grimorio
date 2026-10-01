import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import {
  abandonarUltimaOrganizacao, aplicarOrganizacao, desfazerUltimaOrganizacao, preverOrganizacao, situacaoDoDesfazer,
} from '../state/organizarImagens'
import { ErroOrganizar, type SituacaoDoDesfazer } from '../lib/organizarImagens/executar'
import type { Plano } from '../lib/organizarImagens/tipos'

type Tarefa = 'prevendo' | 'organizando' | 'desfazendo' | 'liberando'

/**
 * A saída de uma organização (ou volta) pela metade, para quem não consegue — ou não quer — terminar
 * a volta. O aviso e a recusa do desfazer apontam para este botão pelo nome, então ele mora num lugar só.
 */
const MANTER = 'Manter o cofre como está'

interface Progresso {
  feito: number
  total: number
  fase: string
}

/** Fase do executor em palavra de gente. */
const FASE: Record<string, string> = {
  movendo: 'Copiando para o endereço novo',
  reescrevendo: 'Atualizando fichas, mapas e notas',
  removendo: 'Tirando os originais',
  verificando: 'Conferindo',
  concluido: 'Pronto',
}

interface Grupo {
  pasta: string
  itens: { de: string; nome: string }[]
}

/** Movimentos agrupados pela pasta de DESTINO — é como o usuário vai achar as imagens depois. */
function agruparPorPasta(plano: Plano): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const m of plano.movimentos) {
    const corte = m.para.lastIndexOf('/')
    const pasta = corte < 0 ? '' : m.para.slice(0, corte)
    const grupo = grupos.get(pasta) ?? { pasta, itens: [] }
    grupo.itens.push({ de: m.de, nome: m.para.slice(corte + 1) })
    grupos.set(pasta, grupo)
  }
  return [...grupos.values()].sort((a, b) => (a.pasta < b.pasta ? -1 : a.pasta > b.pasta ? 1 : 0))
}

function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Até aqui, todo grupo nasce aberto; acima, fechado — a lista inteira aberta vira um paredão. */
const GRUPOS_ABERTOS_ATE = 6

/**
 * Aba Imagens: dá nome legível às imagens do cofre e as põe na pasta do dono
 * (`imagens/personagens/Gandalf/retrato.png`), com prévia antes e desfazer depois.
 * Nada muda no disco até o clique em "Organizar" — e confirmado.
 */
export function OpcoesOrganizarImagens() {
  const vaultPath = useApp((s) => s.vaultPath)
  const [plano, setPlano] = useState<Plano | null>(null)
  const [tarefa, setTarefa] = useState<Tarefa | null>(null)
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [situacao, setSituacao] = useState<SituacaoDoDesfazer>('nada')
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  const ocupado = tarefa !== null
  const grupos = useMemo(() => (plano ? agruparPorPasta(plano) : []), [plano])
  // Conta imagens, não grupos: "144 imagens repetidas" para 144 pares esconderia metade delas.
  const repetidas = plano ? plano.repetidasEntreDonos.reduce((n, g) => n + g.length, 0) : 0
  const nadaAFazer = plano !== null && plano.movimentos.length === 0 && plano.remocoes.length === 0 && plano.reescritas.length === 0
  const podeDesfazer = situacao !== 'nada'
  // Organizar por cima de uma organização (ou volta) pela metade faria o desfazer esquecê-la; a
  // costura também recusa, isto só avisa antes do clique.
  const pelaMetade = situacao === 'pendente'

  async function consultarDesfazer(raiz: string) {
    try {
      setSituacao(await situacaoDoDesfazer(raiz))
    } catch {
      setSituacao('nada') // sem registro legível não há o que oferecer
    }
  }

  useEffect(() => {
    if (vaultPath) void consultarDesfazer(vaultPath)
  }, [vaultPath])

  async function gerarPrevia(raiz: string): Promise<void> {
    setTarefa('prevendo')
    try {
      setPlano(await preverOrganizacao(raiz))
    } catch (e) {
      setPlano(null)
      setErro(`Não deu para gerar a prévia: ${mensagemDe(e)}`)
    } finally {
      setTarefa(null)
    }
  }

  async function prever() {
    if (!vaultPath || ocupado) return
    setErro(null)
    setResultado(null)
    await gerarPrevia(vaultPath)
  }

  async function organizar() {
    if (!vaultPath || !plano || ocupado || nadaAFazer || pelaMetade) return
    const n = plano.movimentos.length
    const ok = await ask(
      `Organizar ${n} ${n === 1 ? 'imagem' : 'imagens'}?\n\n` +
      'Fichas, mapas e notas passam a apontar para o endereço novo. O mapa ou a página aberta é fechado antes. ' +
      'Dá para voltar atrás depois, neste computador, em "Desfazer última organização".',
      { title: 'Organizar imagens', kind: 'warning' },
    )
    if (!ok) return
    setErro(null)
    setResultado(null)
    setTarefa('organizando')
    setProgresso({ feito: 0, total: 1, fase: 'movendo' })
    let refazerPrevia = false
    try {
      const r = await aplicarOrganizacao(vaultPath, plano, (feito, total, fase) => setProgresso({ feito, total, fase }))
      setPlano(null)
      setResultado(
        `Pronto: ${r.movidos} ${r.movidos === 1 ? 'imagem organizada' : 'imagens organizadas'}, ` +
        `${r.reescritos} ${r.reescritos === 1 ? 'arquivo atualizado' : 'arquivos atualizados'}` +
        (r.removidos > 0 ? `, ${r.removidos} ${r.removidos === 1 ? 'cópia repetida juntada' : 'cópias repetidas juntadas'}` : '') +
        '.',
      )
      const alertas = [
        ...(r.problemas.length > 0
          ? [`A conferência final achou ${r.problemas.length === 1 ? 'um problema' : `${r.problemas.length} problemas`}: ${r.problemas.join(' ')}`]
          : []),
        ...r.avisos,
      ]
      if (alertas.length > 0) setErro(alertas.join(' '))
    } catch (e) {
      const desatualizada = e instanceof ErroOrganizar && (e.codigo === 'cofre-mudou' || e.codigo === 'destino-ocupado')
      setErro(desatualizada ? `${mensagemDe(e)} A prévia foi gerada de novo: confira antes de organizar.` : mensagemDe(e))
      refazerPrevia = desatualizada
    } finally {
      setProgresso(null)
      setTarefa(null)
    }
    await consultarDesfazer(vaultPath)
    if (refazerPrevia) await gerarPrevia(vaultPath)
  }

  async function desfazer() {
    if (!vaultPath || ocupado || !podeDesfazer) return
    const ok = await ask(
      'Desfazer a última organização?\n\nAs imagens voltam aos endereços antigos e as fichas, mapas e notas voltam a apontar para eles.',
      { title: 'Desfazer organização', kind: 'warning' },
    )
    if (!ok) return
    setErro(null)
    setResultado(null)
    setTarefa('desfazendo')
    try {
      const r = await desfazerUltimaOrganizacao(vaultPath)
      setPlano(null)
      if (r.completo) {
        setResultado('Organização desfeita: as imagens voltaram para onde estavam.')
        // completo com problema = só imagem nova que alguma ficha ainda cita ficou no cofre
        const alertas = [...(r.problemas.length > 0 ? [`Atenção: ${r.problemas.join(' ')}`] : []), ...r.avisos]
        if (alertas.length > 0) setErro(alertas.join(' '))
      } else {
        // a volta parou no meio e o diário continua valendo: o botão segue ativo para terminar
        setErro([
          `O desfazer não terminou: ${r.problemas.join(' ')} Tente de novo em "Desfazer última organização".`,
          ...r.avisos,
        ].join(' '))
      }
    } catch (e) {
      // Pela metade, a recusa por arquivo que mudou depois não passa tentando de novo: a saída é manter o cofre.
      const semVolta = pelaMetade && e instanceof ErroOrganizar && e.codigo === 'mudou-depois'
      setErro(semVolta ? `${mensagemDe(e)} Para ficar com o cofre como está e voltar a organizar, use "${MANTER}".` : mensagemDe(e))
    } finally {
      setTarefa(null)
    }
    await consultarDesfazer(vaultPath)
  }

  async function manter() {
    if (!vaultPath || ocupado || !pelaMetade) return
    const ok = await ask(
      'Manter o cofre como está agora?\n\n' +
      'Nada no cofre é movido nem apagado: o que a organização (ou o desfazer dela) já fez fica feito, e o resto fica como estava. ' +
      'Ela deixa de poder ser desfeita, e o botão Organizar volta a funcionar.',
      { title: MANTER, kind: 'warning' },
    )
    if (!ok) return
    setErro(null)
    setResultado(null)
    setTarefa('liberando')
    try {
      await abandonarUltimaOrganizacao(vaultPath)
      setResultado('O cofre ficou como está, e Organizar voltou a funcionar.')
    } catch (e) {
      setErro(mensagemDe(e))
    } finally {
      setTarefa(null)
    }
    await consultarDesfazer(vaultPath)
  }

  return (
    <div className="opcoes-secao">
      <h3>Organizar imagens</h3>
      <p className="opcoes-caminho">
        Dá nome legível às imagens do cofre e põe cada uma na pasta de quem a usa:
        {' '}<code>imagens/personagens/Gandalf/retrato.png</code>, <code>imagens/mapas/Masmorra/01.png</code>.
        Fichas, mapas e notas passam a apontar para o endereço novo, e cópias idênticas viram uma só.
      </p>

      {plano && !nadaAFazer && (
        <>
          <p className="organizar-resumo">
            <strong>{plano.movimentos.length}</strong> {plano.movimentos.length === 1 ? 'imagem muda' : 'imagens mudam'} de lugar
            {' · '}<strong>{plano.reescritas.length}</strong> {plano.reescritas.length === 1 ? 'arquivo passa' : 'arquivos passam'} a apontar para o endereço novo
            {plano.remocoes.length > 0 && (
              <>{' · '}<strong>{plano.remocoes.length}</strong> {plano.remocoes.length === 1 ? 'cópia repetida juntada' : 'cópias repetidas juntadas'}</>
            )}
          </p>
          <div className="organizar-previa">
            {grupos.map((g) => (
              <details key={g.pasta} className="organizar-grupo" open={grupos.length <= GRUPOS_ABERTOS_ATE}>
                <summary>
                  <span className="organizar-pasta">{g.pasta}/</span>
                  <span className="organizar-conta">{g.itens.length}</span>
                </summary>
                <ul>
                  {g.itens.map((i) => (
                    <li key={i.de}>
                      <span className="organizar-de" title={i.de}>{i.de}</span>
                      <span className="organizar-seta" aria-hidden="true">→</span>
                      <span className="organizar-para">{i.nome}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            {plano.remocoes.length > 0 && (
              <details className="organizar-grupo">
                <summary>
                  <span className="organizar-pasta">Cópias repetidas que saem</span>
                  <span className="organizar-conta">{plano.remocoes.length}</span>
                </summary>
                <ul>
                  {plano.remocoes.map((r) => (
                    <li key={r.rel}>
                      <span className="organizar-de" title={r.rel}>{r.rel}</span>
                      <span className="organizar-seta" aria-hidden="true">→</span>
                      <span className="organizar-para" title={r.mantida}>fica só {r.mantida}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </>
      )}

      {plano && nadaAFazer && <p className="opcoes-vazio">Tudo já está organizado: nenhuma imagem precisa mudar de lugar.</p>}

      {plano && (plano.avisos.length > 0 || repetidas > 0) && (
        <>
          <p className="organizar-dica">O que o organizador não resolve sozinho:</p>
          <ul className="organizar-avisos">
            {plano.avisos.map((a) => <li key={a}>{a}</li>)}
            {repetidas > 0 && (
              // Num cofre de verdade são dezenas de grupos: uma linha, e a lista só para quem pedir.
              <li>
                <details className="organizar-repetidas">
                  <summary>
                    {repetidas} imagens repetidas entre donos diferentes ficaram separadas, para mexer numa não estragar a outra.
                    {' '}<span className="organizar-ver organizar-ver-abrir">ver</span>
                    <span className="organizar-ver organizar-ver-fechar">esconder</span>
                  </summary>
                  <ul>
                    {plano.repetidasEntreDonos.map((g) => <li key={g.join('\n')}>{g.join(', ')}</li>)}
                  </ul>
                </details>
              </li>
            )}
          </ul>
        </>
      )}

      {progresso && (
        <div className="organizar-andamento">
          <progress
            className="organizar-progresso"
            value={progresso.feito}
            max={Math.max(progresso.total, 1)}
            aria-label="Andamento da organização"
          />
          <p className="organizar-fase">
            {FASE[progresso.fase] ?? progresso.fase} — {progresso.feito} de {progresso.total}
          </p>
        </div>
      )}

      {erro && <p className="opcoes-erro" role="alert">{erro}</p>}
      {resultado && <p className="organizar-resultado" role="status">{resultado}</p>}

      {pelaMetade && (
        <p className="opcoes-aviso">
          A última organização deste cofre ficou pela metade: ela, ou o desfazer dela, parou no meio.
          Termine a volta em "Desfazer última organização" antes de organizar de novo — ou, se o desfazer
          não der (uma ficha mudou depois) ou você quiser ficar com o que já foi feito, use "{MANTER}".
        </p>
      )}

      <div className="organizar-acoes">
        <button className="opcoes-acao" disabled={ocupado || !vaultPath} onClick={() => void prever()}>
          {tarefa === 'prevendo' ? 'Gerando prévia…' : plano ? 'Gerar prévia de novo' : 'Ver prévia'}
        </button>
        <button
          className="opcoes-acao"
          disabled={ocupado || !plano || nadaAFazer || pelaMetade}
          onClick={() => void organizar()}
        >
          {tarefa === 'organizando' ? 'Organizando…' : 'Organizar'}
        </button>
        <button className="opcoes-acao" disabled={ocupado || !podeDesfazer} onClick={() => void desfazer()}>
          {tarefa === 'desfazendo' ? 'Desfazendo…' : 'Desfazer última organização'}
        </button>
        {pelaMetade && (
          <button className="opcoes-acao" disabled={ocupado} onClick={() => void manter()}>
            {tarefa === 'liberando' ? 'Liberando…' : MANTER}
          </button>
        )}
      </div>
      {!plano && !ocupado && (
        <p className="organizar-dica">Veja a prévia primeiro. Nada muda no cofre até você clicar em Organizar.</p>
      )}
    </div>
  )
}
