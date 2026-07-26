import { useState } from 'react'
import { lerChaves, salvarChaves } from '../lib/chavesIA'
import { pedirTexto } from './dialogos'

/** Aba IA: mostra e troca as chaves do Gemini guardadas nesta máquina. */
export function OpcoesIA() {
  const [chaves, setChaves] = useState<string[]>(() => lerChaves())

  async function alterar() {
    // pedirTexto devolve null para vazio, então limpar tem botão próprio
    const raw = await pedirTexto(
      'Cole sua chave da API do Gemini (várias separadas por vírgula):',
      chaves.join(', '),
      'Salvar',
    )
    if (raw === null) return
    salvarChaves(raw)
    setChaves(lerChaves())
  }

  function limpar() {
    salvarChaves('')
    setChaves([])
  }

  return (
    <div className="opcoes-secao">
      <h3>Gemini</h3>
      <p className="opcoes-vazio">
        {chaves.length === 0
          ? 'Nenhuma chave salva. O Grimório pede uma na primeira vez que você usar a IA.'
          : `${chaves.length} ${chaves.length === 1 ? 'chave salva' : 'chaves salvas'} nesta máquina.`}
      </p>
      <button className="opcoes-acao" onClick={alterar}>Alterar chaves</button>
      {chaves.length > 0 && <button className="opcoes-acao" onClick={limpar}>Remover chaves salvas</button>}
    </div>
  )
}
