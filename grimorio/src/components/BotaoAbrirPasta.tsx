import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { message } from '@tauri-apps/plugin-dialog'
import { caminhoAbsolutoImagem } from '../lib/caminhos'

/**
 * Botão 📁 do cabeçalho dos modais: abre a pasta da imagem principal (retrato)
 * no explorador, com o arquivo já selecionado. Sem retrato, fica desabilitado.
 */
export function BotaoAbrirPasta({ vaultPath, rel }: { vaultPath: string | null; rel: string | null | undefined }) {
  const habilitado = !!vaultPath && !!rel

  async function abrir() {
    if (!vaultPath || !rel) return
    // O explorador do Windows só seleciona o arquivo com separador nativo
    const bruto = caminhoAbsolutoImagem(vaultPath, rel)
    const caminho = /^[a-zA-Z]:/.test(bruto) ? bruto.replace(/\//g, '\\') : bruto
    try {
      await revealItemInDir(caminho)
    } catch (e) {
      await message(`Não consegui abrir a pasta da imagem.\n${String(e)}`, { kind: 'error' })
    }
  }

  return (
    <button className="btn-icon" disabled={!habilitado}
      title={habilitado ? 'Abrir pasta da imagem' : 'Sem imagem principal'}
      onClick={() => void abrir()}>
      📁
    </button>
  )
}
