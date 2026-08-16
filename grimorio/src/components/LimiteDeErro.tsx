import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Rede de segurança contra a JANELA PRETA.
 *
 * Um erro durante o render desmonta a árvore inteira do React, e o que sobra é uma janela
 * vazia sem uma palavra — foi assim que um erro no Ctrl+K apagou o app inteiro para o
 * usuário, que não tinha como saber nem o que aconteceu nem o que fazer. Num app de desktop
 * isso é pior que no navegador: não há aba para fechar, nem console à mão.
 *
 * O que este limite garante: qualquer erro vira uma tela legível, com a mensagem, a origem e
 * um botão de voltar. Ele NÃO conserta o erro nem o esconde — só troca "sumiu tudo" por
 * "quebrou isto aqui, e o resto do app continua de pé".
 *
 * É um componente de CLASSE porque `getDerivedStateFromError`/`componentDidCatch` não têm
 * equivalente em hook — é a única parte do React que ainda exige classe.
 */
interface Estado {
  erro: Error | null
  pilha: string
}

export class LimiteDeErro extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { erro: null, pilha: '' }

  static getDerivedStateFromError(erro: Error): Partial<Estado> {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // console além da tela: a mensagem na tela é para o usuário, o console é para quem for
    // depurar depois — a pilha de componentes diz QUAL tela quebrou, não só qual função.
    console.error('Erro não tratado no render:', erro, info.componentStack)
    this.setState({ pilha: info.componentStack ?? '' })
  }

  render() {
    const { erro, pilha } = this.state
    if (!erro) return this.props.children

    return (
      <div className="limite-erro">
        <h1>Alguma coisa quebrou</h1>
        <p>
          O Grimório encontrou um erro e parou esta tela. Seus arquivos não foram afetados — o
          cofre só é gravado por ação sua.
        </p>
        <pre className="limite-erro-mensagem">{erro.message || String(erro)}</pre>
        {pilha && (
          <details>
            <summary>Detalhes técnicos</summary>
            <pre className="limite-erro-pilha">{pilha}</pre>
          </details>
        )}
        <button type="button" onClick={() => this.setState({ erro: null, pilha: '' })}>
          Tentar de novo
        </button>
      </div>
    )
  }
}
