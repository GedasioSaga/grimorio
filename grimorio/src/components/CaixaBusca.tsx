/** Campo de busca das seções da sidebar. Sem estado próprio: quem monta decide o que fazer. */
export function CaixaBusca({ valor, aoMudar, achados, total }: {
  valor: string
  aoMudar: (v: string) => void
  /** quantos casaram; só aparece com busca ativa */
  achados: number
  /** quantos existem na seção (já podados pelo filtro de campanha) */
  total: number
}) {
  const ativa = valor.trim().length > 0
  return (
    <div className="busca-caixa">
      <span className="busca-lupa">🔍</span>
      <input
        type="search"
        className="busca-input"
        placeholder="Buscar…"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => {
          // stopPropagation: sem ele o Escape sobe até a window, onde o HostOpcoes escuta,
          // e um único toque limparia a busca E fecharia as Opções
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); aoMudar('') }
        }}
      />
      {ativa && (
        <>
          <span className="busca-contador">{achados} de {total}</span>
          <button className="btn-icon" title="Limpar busca" onClick={() => aoMudar('')}>✕</button>
        </>
      )}
    </div>
  )
}
