import { useArvoreRail, type SecaoRail } from '../state/arvoreRail'

/**
 * Toggle "abrir tudo / fechar tudo" do cabeçalho da seção.
 *
 * O ícone reflete o PADRÃO da seção — a última ação global —, não se existe alguma pasta
 * aberta agora. Assim o botão sempre faz o oposto do último clique, em vez de trocar de
 * cara sozinho conforme você abre pastas na mão.
 */
export function BotaoArvore({ secao }: { secao: SecaoRail }) {
  const aberto = useArvoreRail((s) => s.padrao[secao])
  const definirTodos = useArvoreRail((s) => s.definirTodos)
  const titulo = aberto ? 'Fechar tudo' : 'Abrir tudo'

  return (
    <button
      className="btn-icon"
      title={titulo}
      aria-label={titulo}
      onClick={() => definirTodos(secao, !aberto)}
    >
      {aberto ? '▾' : '▸'}
    </button>
  )
}
