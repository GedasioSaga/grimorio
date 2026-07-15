/**
 * Copia a imagem em `src` para o clipboard do SO como PNG.
 * Passa por Blob + createImageBitmap para evitar canvas "tainted" (o bitmap
 * vem de um Blob, sem origem de rede). Converte qualquer formato para PNG,
 * exigência do clipboard do browser.
 */
export async function copiarImagemParaClipboard(src: string): Promise<void> {
  const resp = await fetch(src)
  if (!resp.ok) throw new Error(`fetch falhou: ${resp.status}`)
  const blob = await resp.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sem contexto 2d')
    ctx.drawImage(bitmap, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'),
    )
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
  } finally {
    bitmap.close()
  }
}
