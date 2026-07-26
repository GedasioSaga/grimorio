import { useState } from 'react'
import { ask, message, open } from '@tauri-apps/plugin-dialog'
import { useApp, type FalhaDescarga } from '../state/store'
import { pedirTexto } from './dialogos'
import { tauriFs } from '../lib/fsBridge'
import { classificarPasta } from '../lib/classificarPasta'
import { listar, normalizarCaminho, remover, renomear, type CofreRegistrado } from '../lib/cofres'

/**
 * Motivo legível de qualquer coisa que tenha sido lançada — é o que diz ao usuário se
 * tentar de novo adianta (disco cheio) ou não (pasta somente leitura). O Tauri rejeita
 * com string, o resto do app com Error, e nada impede um throw de outra coisa.
 */
function motivoDaFalha(erro: unknown): string {
  if (typeof erro === 'string') return erro
  if (erro instanceof Error) return erro.message
  const texto = String(erro)
  return texto === '[object Object]' ? 'motivo desconhecido' : texto
}

/** Aba Cofre: cofre atual, recentes e "abrir outro". */
export function OpcoesCofre({ onFechar }: { onFechar: () => void }) {
  const vaultPath = useApp((s) => s.vaultPath)
  const carregando = useApp((s) => s.carregando)
  const trocarCofre = useApp((s) => s.trocarCofre)
  const [cofres, setCofres] = useState<CofreRegistrado[]>(() => listar())

  /**
   * Gravação pendente que falhou é perda definitiva: trocarCofre descarta o cache
   * logo em seguida. `ask` é modal, o que também trava a edição enquanto decide.
   */
  async function confirmarFalhas(falhas: FalhaDescarga[]): Promise<boolean> {
    const lista = falhas.map((f) => `• ${f.rotulo || f.caminho} — ${motivoDaFalha(f.erro)}`).join('\n')
    return ask(
      `Não foi possível salvar ${falhas.length === 1 ? 'este item' : 'estes itens'}:\n\n${lista}\n\nTrocar de cofre agora perde essas alterações. Continuar?`,
      { title: 'Alterações não salvas', kind: 'warning' },
    )
  }

  async function trocarPara(caminho: string) {
    onFechar()
    await trocarCofre(caminho, confirmarFalhas).catch(() => {})
  }

  async function abrirRecente(c: CofreRegistrado) {
    if (!(await tauriFs.exists(c.caminho))) {
      await message('Esta pasta não existe mais. Vou tirá-la da lista de recentes.', { title: 'Cofre não encontrado' })
      setCofres(remover(c.caminho))
      return
    }
    await trocarPara(c.caminho)
  }

  async function escolherOutro() {
    const dir = await open({ directory: true, title: 'Escolha a pasta do cofre' })
    if (typeof dir !== 'string') return
    if ((await classificarPasta(dir, tauriFs)) === 'estranha') {
      const ok = await ask(
        'Esta pasta não parece um cofre do Grimório e já tem outros arquivos. Criar um cofre novo aqui mesmo assim?',
        { title: 'Pasta não reconhecida', kind: 'warning' },
      )
      if (!ok) return
    }
    await trocarPara(dir)
  }

  async function renomearRotulo(c: CofreRegistrado) {
    const nome = await pedirTexto('Nome do cofre:', c.nome, 'Renomear')
    if (!nome) return
    setCofres(renomear(c.caminho, nome))
  }

  async function tirarDaLista(c: CofreRegistrado) {
    const ok = await ask(
      `Tirar "${c.nome}" da lista de recentes?\n\nNenhum arquivo é apagado — o cofre continua no disco.`,
      { title: 'Tirar da lista', kind: 'warning' },
    )
    if (!ok) return
    setCofres(remover(c.caminho))
  }

  return (
    <div className="opcoes-secao">
      <h3>Cofre atual</h3>
      <p className="opcoes-caminho">{vaultPath ?? '—'}</p>

      <h3>Cofres recentes</h3>
      {cofres.length === 0 && <p className="opcoes-vazio">Nenhum cofre registrado ainda.</p>}
      <ul className="opcoes-lista">
        {cofres.map((c) => {
          const atual = !!vaultPath && normalizarCaminho(c.caminho) === vaultPath
          return (
            <li key={c.caminho} className={`opcoes-cofre-item${atual ? ' atual' : ''}`}>
              <span className="opcoes-cofre-nome">{c.nome}{atual && ' (aberto)'}</span>
              <span className="opcoes-cofre-caminho">{c.caminho}</span>
              <span className="opcoes-cofre-acoes">
                {!atual && <button disabled={carregando} onClick={() => abrirRecente(c)}>Abrir</button>}
                <button className="btn-icon" title="Renomear rótulo" onClick={() => renomearRotulo(c)}>✏️</button>
                {!atual && <button className="btn-icon" title="Tirar da lista" onClick={() => tirarDaLista(c)}>🗑️</button>}
              </span>
            </li>
          )
        })}
      </ul>

      <button className="opcoes-acao" disabled={carregando} onClick={escolherOutro}>
        Abrir outro cofre…
      </button>
    </div>
  )
}
