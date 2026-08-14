import type { Editor } from 'tldraw'
import { save, message } from '@tauri-apps/plugin-dialog'
import type { VaultRepo } from '../lib/vaultRepo'
import { slugify } from '../lib/slug'
import { uint8ParaBase64 } from '../lib/bin'

/** Exporta a seleção (ou o canvas inteiro, sem seleção) como PNG ou SVG e grava no cofre. */
export async function exportarCanvas(
  editor: Editor,
  repo: VaultRepo,
  nome: string,
  formato: 'png' | 'svg',
): Promise<void> {
  const selecionados = editor.getSelectedShapeIds()
  const ids = selecionados.length > 0 ? selecionados : [...editor.getCurrentPageShapeIds()]
  if (ids.length === 0) return

  const destino = await save({
    title: `Exportar ${formato.toUpperCase()}`,
    defaultPath: `${slugify(nome)}.${formato}`,
    filters: [{ name: formato.toUpperCase(), extensions: [formato] }],
  })
  if (!destino) return

  try {
    if (formato === 'png') {
      const { blob } = await editor.toImage(ids, { format: 'png', background: true, scale: 2, darkMode: true })
      const buf = new Uint8Array(await blob.arrayBuffer())
      await repo.escreverBinarioAbsoluto(destino, uint8ParaBase64(buf))
    } else {
      const svg = await editor.getSvgString(ids, { background: true, darkMode: true })
      if (!svg) throw new Error('não foi possível gerar o SVG')
      await repo.escreverTextoAbsoluto(destino, svg.svg)
    }
  } catch (e) {
    await message(`Falha ao exportar: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}
