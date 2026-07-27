import { useEffect, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { googleConta, googleDesconectar, googleIniciarLogin } from '../lib/googleAuth'
import { definirNomeDoDispositivo, nomeDoDispositivo } from '../lib/dispositivo'
import { textoDoPareamento } from '../lib/painelSync'
import { outroSincronizadorNoCaminho } from '../lib/sync/parear'
import { concluirPareamento, inspecionarCofreAtual, sincronizarAgora } from '../state/sync'
import { useApp } from '../state/store'
import { pedirTexto } from './dialogos'
import { PainelSync } from './PainelSync'

/**
 * As mensagens do `auth.rs` já são escritas para o usuário final, em português, e culpam
 * o empacotamento quando faltam credenciais. Por isso a string do Tauri passa inteira,
 * sem prefixo nosso — envelopar só afastaria o usuário da explicação real.
 */
function mensagemDoErro(erro: unknown): string {
  return typeof erro === 'string' ? erro : String(erro)
}

/**
 * Aba Nuvem: a conta do Google e, depois dela, o estado do sync com o Drive.
 *
 * `onFechar` existe por causa do painel: abrir uma cópia de conflito significa abrir o
 * PerfilModal, que fica ATRÁS desta janela se as Opções continuarem de pé.
 */
export function OpcoesNuvem({ onFechar }: { onFechar: () => void }) {
  const vaultPath = useApp((s) => s.vaultPath)
  const [conta, setConta] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [entrando, setEntrando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    // Fechar o modal desmonta a árvore inteira, e trocar de aba desmonta só esta. A
    // consulta ao Gerenciador de Credenciais pode chegar depois de qualquer um dos dois.
    let vivo = true
    googleConta()
      .then((email) => { if (vivo) setConta(email) })
      .catch((e) => { if (vivo) setErro(mensagemDoErro(e)) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [])

  /**
   * `entrando` desabilita o botão porque dois cliques rápidos abririam dois servidores de
   * retorno e duas abas do navegador. Ambos concluem, e o último a terminar sobrescreve o
   * token guardado — dava para entrar na conta A, depois na B, e a tela ainda mostrar A.
   */
  async function entrar() {
    setErro(null)
    setEntrando(true)
    try {
      setConta(await googleIniciarLogin())
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setEntrando(false)
    }
  }

  async function desconectar() {
    setErro(null)
    try {
      await googleDesconectar()
      setConta(null)
    } catch (e) {
      setErro(mensagemDoErro(e))
    }
  }

  /**
   * O aviso do spec: cofre dentro de OneDrive/Dropbox/iCloud tem DOIS programas mexendo nos
   * mesmos bytes. Vem antes de qualquer conversa com o Drive de propósito — é o único momento em
   * que ainda dá para mover o cofre sem desfazer nada.
   *
   * Avisa e deixa seguir, em vez de bloquear: o cofre do app empacotado nasce dentro do OneDrive,
   * e recusar aqui deixaria o dono sem saída dentro do próprio app.
   */
  async function passouPeloAvisoDePasta(caminho: string): Promise<boolean> {
    const servico = outroSincronizadorNoCaminho(caminho)
    if (servico === null) return true
    return ask(
      `Este cofre está dentro do ${servico}, que já sincroniza esta pasta por conta própria.\n\n`
        + 'Dois programas cuidando dos mesmos arquivos podem embaralhar o cofre. O ideal é mover a '
        + `pasta do cofre para fora do ${servico} antes de ligar a sincronização do Grimório.\n\n`
        + 'Ligar assim mesmo?',
      { title: 'Esta pasta já é sincronizada', kind: 'warning' },
    )
  }

  /**
   * Pareamento: o momento em que este cofre passa a ter uma pasta no Drive e um manifesto.
   *
   * Três perguntas em sequência, e nenhuma delas grava nada antes de ser respondida: o aviso da
   * pasta, o nome deste computador (que assina as cópias de conflito — dois PCs chamados "Este
   * computador" não assinam nada) e, por fim, a confirmação que diz em qual das duas histórias
   * ele está: primeiro computador ou encontro com um cofre que já está lá.
   */
  async function ligarNaNuvem() {
    if (!vaultPath) return
    setErro(null)
    if (!(await passouPeloAvisoDePasta(vaultPath))) return

    const nome = await pedirTexto(
      'Como você chama este computador? O nome aparece nas cópias que o Grimório cria quando o mesmo item é editado em dois lugares.',
      nomeDoDispositivo(),
      'Continuar',
    )
    if (nome === null) return
    definirNomeDoDispositivo(nome)

    setOcupado(true)
    try {
      const alvo = await inspecionarCofreAtual()
      const confirmou = await ask(textoDoPareamento(alvo.nome, alvo.nuvem.arquivos), {
        title: 'Ligar este cofre ao Google Drive',
      })
      if (!confirmou) return
      await concluirPareamento(alvo)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function sincronizar() {
    setErro(null)
    setOcupado(true)
    try {
      await sincronizarAgora()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="opcoes-secao">
      <h3>Conta do Google</h3>

      {carregando && <p className="opcoes-vazio">Verificando se há uma conta conectada…</p>}

      {!carregando && conta && (
        <>
          <p className="opcoes-caminho">{conta}</p>
          <button className="opcoes-acao" onClick={desconectar}>Desconectar</button>
        </>
      )}

      {!carregando && !conta && (
        <>
          <p className="opcoes-vazio">
            Conectar sua conta é o primeiro passo para guardar o cofre no Google Drive.
            O Grimório enxerga apenas os arquivos que ele mesmo criar lá.
          </p>
          {/* Sem este aviso o app parece travado: o comando bloqueia até o usuário
              terminar no navegador, e desiste só depois de cinco minutos. */}
          {entrando && (
            <p className="opcoes-vazio">
              Abri a página de login do Google no seu navegador. Conclua o acesso por lá e
              volte para o Grimório.
            </p>
          )}
          <button className="opcoes-acao" disabled={entrando} onClick={entrar}>
            {entrando ? 'Aguardando o navegador…' : 'Entrar com Google'}
          </button>
        </>
      )}

      {erro && <p className="opcoes-erro">{erro}</p>}

      {/* Sem conta não há sync: todo ciclo fala com o Drive na primeira linha. */}
      {!carregando && conta && (
        <PainelSync
          onFechar={onFechar}
          onLigar={ligarNaNuvem}
          onSincronizar={sincronizar}
          ocupado={ocupado}
        />
      )}
    </div>
  )
}
