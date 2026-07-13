import type { FsBridge } from '../lib/fsBridge'

/** FsBridge em memória. Chaves = caminhos com '/' normalizado. */
export function criarFakeFs(): FsBridge & { arquivos: Map<string, string> } {
  const arquivos = new Map<string, string>()
  const dirs = new Set<string>()
  const norm = (p: string) => p.replace(/\\/g, '/')

  return {
    arquivos,
    async readText(path) {
      const c = arquivos.get(norm(path))
      if (c === undefined) throw new Error(`não existe: ${path}`)
      return c
    },
    async writeTextAtomic(path, content) {
      arquivos.set(norm(path), content)
    },
    async writeBinaryBase64(path, base64) {
      arquivos.set(norm(path), `<bin:${base64.length}>`)
    },
    async listDir(path) {
      const base = norm(path).replace(/\/$/, '') + '/'
      const nomes = new Map<string, boolean>() // nome -> isDir
      for (const k of [...arquivos.keys(), ...dirs]) {
        if (!k.startsWith(base)) continue
        const resto = k.slice(base.length)
        const primeiro = resto.split('/')[0]
        if (!primeiro) continue
        nomes.set(primeiro, resto.includes('/') || dirs.has(base + primeiro))
      }
      return [...nomes].map(([name, isDir]) => ({ name, isDir }))
    },
    async mkdirAll(path) {
      dirs.add(norm(path))
    },
    async removePath(path) {
      const p = norm(path)
      arquivos.delete(p)
      dirs.delete(p)
      for (const k of [...arquivos.keys()]) if (k.startsWith(p + '/')) arquivos.delete(k)
      for (const d of [...dirs]) if (d.startsWith(p + '/')) dirs.delete(d)
    },
    async copyFile(from, to) {
      const c = arquivos.get(norm(from))
      if (c === undefined) throw new Error(`não existe: ${from}`)
      arquivos.set(norm(to), c)
    },
    async exists(path) {
      const p = norm(path)
      return arquivos.has(p) || dirs.has(p) || [...arquivos.keys(), ...dirs].some((k) => k.startsWith(p + '/'))
    },
  }
}
