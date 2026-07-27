import { useEffect, useState } from 'react'
import { googleConta, googleDesconectar, googleIniciarLogin } from '../lib/googleAuth'
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
  const [conta, setConta] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [entrando, setEntrando] = useState(false)
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
      {!carregando && conta && <PainelSync onFechar={onFechar} />}
    </div>
  )
}
