/**
 * Tipos do motor de sync. O manifesto é o estado conhecido do ÚLTIMO SYNC BEM-SUCEDIDO —
 * é comparando cada lado contra ele (e não um lado contra o outro) que o motor distingue
 * "mudou" de "sempre foi assim", e é isso que impede um arquivo apagado de ressuscitar a
 * cada ciclo. Mesmo conceito que o rclone chama de .lst e o Unison de archive.
 */

/** Estado de um arquivo no último sync bem-sucedido. */
export interface EntradaArquivo {
  fileId: string
  hash: string
  tamanho: number
  mtimeLocal: number
  versaoRemota: string
}

export interface Manifesto {
  versao: 1
  cofreId: string
  pastaRaizId: string
  startPageToken: string
  deviceId: string
  /** Só serve para nomear cópias de conflito ("Gandalf (conflito — PC Casa …)"). */
  deviceNome: string
  ultimoSync: string
  /** caminho relativo → fileId da pasta no Drive */
  pastas: Record<string, string>
  /** caminho relativo → estado no último sync */
  arquivos: Record<string, EntradaArquivo>
}

/** O que a varredura local encontrou agora. */
export interface EstadoLocal {
  hash: string
  tamanho: number
  mtime: number
}

/** O que o Drive reporta agora. `removido` cobre deleção E perda de acesso — a API não distingue. */
export interface EstadoRemoto {
  fileId: string
  hash?: string
  versao: string
  removido?: boolean
  /**
   * De que computador veio esta versão, do `appProperties` que cada upload grava
   * (`ItemRemoto.deviceNome`). Só serve para ASSINAR a cópia de conflito quando é o lado remoto
   * que perde — o manifesto conhece o nome desta máquina e de nenhuma outra, então sem isto
   * metade das cópias ficaria sem dizer de onde veio a edição descartada. Ausente em arquivo
   * enviado por uma versão do app anterior à propriedade; a reconciliação ignora este campo.
   */
  deviceNome?: string
}

export type Acao =
  | { tipo: 'subir'; caminho: string }
  | { tipo: 'baixar'; caminho: string }
  | { tipo: 'apagarLocal'; caminho: string }
  | { tipo: 'apagarRemoto'; caminho: string }
  | { tipo: 'conflito'; caminho: string; vencedor: 'local' | 'remoto' }
  | { tipo: 'registrar'; caminho: string }

/**
 * Resultado da reconciliação. A recusa é um valor de retorno, não uma exceção: o freio de
 * deleção em massa é uma decisão de produto (perguntar ao usuário), não um erro de programa.
 */
export type Plano =
  | { ok: true; acoes: Acao[] }
  | { ok: false; motivo: 'delecao-em-massa'; apagaria: number; total: number }
