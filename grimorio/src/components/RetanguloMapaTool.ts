import { BaseBoxShapeTool } from 'tldraw'

/**
 * Ferramenta do retângulo do mapa.
 *
 * Herda `BaseBoxShapeTool` inteiro — é a MESMA base que o tldraw usa para as ferramentas de
 * caixa dele, e ela já resolve as duas interações que o usuário espera, sem escolher uma:
 * clicar COLOCA um retângulo do tamanho padrão centrado no clique (o
 * `getDefaultProps` da shapeUtil manda) e volta pra seleção; arrastar desenha do tamanho
 * arrastado (`select.resizing` com `isCreating`). Verificado em
 * `node_modules/@tldraw/editor/src/lib/editor/tools/BaseBoxShapeTool/children/Pointing.ts`.
 *
 * É exatamente o comportamento que faltava na ferramenta de linha (ver `LinhaMapaTool.ts`)
 * e a razão de o retângulo não precisar de nenhum estado próprio aqui.
 */
export class RetanguloMapaTool extends BaseBoxShapeTool {
  static override id = 'retangulo-mapa'
  static override initial = 'idle'
  override shapeType = 'retangulo-mapa' as const
}
