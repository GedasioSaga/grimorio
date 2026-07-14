import type { FsBridge } from '../lib/fsBridge'

/** FsBridge em memória. Chaves = caminhos com '/' normalizado. */
export function criarFakeFs(): FsBridge & { arquivos: Map<string, string>; atrasoEscritaMs: number } {
  const arquivos = new Map<string, string>()
  const dirs = new Set<string>()
  const estado = { atrasoEscritaMs: 0 } // latência de escrita opt-in (0 = sem timer real)
  const norm = (p: string) => p.replace(/\\/g, '/')

  return {
    arquivos,
    get atrasoEscritaMs() {
      return estado.atrasoEscritaMs
    },
    set atrasoEscritaMs(ms: number) {
      estado.atrasoEscritaMs = ms
    },
    async readText(path) {
      const c = arquivos.get(norm(path))
      if (c === undefined) throw new Error(`não existe: ${path}`)
      return c
    },
    async writeTextAtomic(path, content) {
      // latência real (opt-in) para expor corridas de escrita em testes de serialização
      if (estado.atrasoEscritaMs > 0) await new Promise((r) => setTimeout(r, estado.atrasoEscritaMs))
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
    async rename(from, to) {
      const f = norm(from)
      const t = norm(to)
      const existe =
        arquivos.has(f) || dirs.has(f) || [...arquivos.keys(), ...dirs].some((k) => k.startsWith(f + '/'))
      if (!existe) throw new Error(`não existe: ${from}`)
      for (const k of [...arquivos.keys()]) {
        if (k === f) {
          arquivos.set(t, arquivos.get(k)!)
          arquivos.delete(k)
        } else if (k.startsWith(f + '/')) {
          arquivos.set(t + k.slice(f.length), arquivos.get(k)!)
          arquivos.delete(k)
        }
      }
      for (const d of [...dirs]) {
        if (d === f || d.startsWith(f + '/')) {
          dirs.add(t + d.slice(f.length))
          dirs.delete(d)
        }
      }
    },
    async exists(path) {
      const p = norm(path)
      return arquivos.has(p) || dirs.has(p) || [...arquivos.keys(), ...dirs].some((k) => k.startsWith(p + '/'))
    },
  }
}
