const BASE64_CHUNK = 8192

/** Converte bytes para base64 em blocos (evita estourar a pilha com spread gigante). */
export function uint8ParaBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(bin)
}
