/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const empacotarBancada = process.env.GRIMORIO_BANCADA === "1";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  /**
   * Configuração do Vitest. Mora aqui de propósito: um `vitest.config.ts` separado
   * SUBSTITUI este arquivo (não soma), e a suíte perderia o plugin do React — todo
   * `.test.tsx` quebraria no JSX.
   *
   * Antes disto não havia bloco `test` nenhum: ambiente, alcance e rigor do portão
   * dependiam de convenção não escrita. O que cada opção segura:
   *
   * - `environment: 'node'` — é o default implícito de sempre, agora declarado. Os
   *   arquivos de interface continuam subindo jsdom pelo docblock
   *   `// @vitest-environment jsdom`, que tem precedência sobre isto.
   * - `setupFiles` — ver `src/test/setup.ts`: fecha a lacuna do jsdom que fazia o
   *   Vitest sair com código 1 enquanto imprimia "N passed".
   * - `include` — varre `src/` inteiro, não só `src/test/`. Padrão mais estreito
   *   transformaria teste criado fora da pasta em teste pulado em silêncio.
   * - `allowOnly: false` — um `it.only` esquecido pula o resto do arquivo sem falhar.
   *   Fora de CI o default do Vitest é permitir; aqui não.
   * - `passWithNoTests: false` — suíte que não encontra teste é portão quebrado, não
   *   portão verde.
   * - `dangerouslyIgnoreUnhandledErrors: false` — explícito para que ninguém apague o
   *   sintoma (erro assíncrono não atribuído a caso) em vez da causa.
   * - `testTimeout` / `hookTimeout` — ver o bloco abaixo.
   */
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    allowOnly: false,
    passWithNoTests: false,
    dangerouslyIgnoreUnhandledErrors: false,

    /**
     * Por que o limite de tempo sobe para 30s na suíte inteira.
     *
     * O portão só serve para alguma coisa se VERMELHO significar "o código quebrou". Com o
     * padrão de 5s, esta suíte saía com código 1 em máquina de cache frio sem nenhuma
     * asserção quebrada: `src/test/mapaComponentes.test.ts` carrega o subsistema de mapa por
     * `await import()` — tldraw e os 13 shapeUtils —, e a primeira transformação desses
     * módulos passa dos 5s enquanto o `node_modules/.vite` ainda está vazio. Com o cache
     * quente o mesmo arquivo roda em ~2,5s. Portão que depende de o disco estar morno não é
     * portão: ou some o vermelho verdadeiro no meio do ruído, ou o operador aprende a
     * descartar `EXIT=1` como "é só o cache" — e é assim que uma falha real passa.
     *
     * Aquele arquivo já tinha percebido o problema e elevado o limite para 30s, mas só no
     * primeiro `describe` (mapaComponentes.test.ts:31). Os outros dois (:74 e :183) importam
     * os mesmos módulos de tldraw sob o padrão de 5s — o remendo local cobria um terço do
     * arquivo. O limite pertence à configuração da suíte, não a um `describe`.
     *
     * O que se perde, dito às claras: um teste que trave de verdade agora demora 30s para
     * ser reportado em vez de 5s. É latência, não sinal — nenhum teste deste projeto afirma
     * nada sobre duração, então o relógio nunca foi asserção aqui; ele só decidia em quanto
     * tempo a falha aparecia. Nenhum teste passa a ficar verde por causa disto: quem falhava
     * por asserção continua falhando por asserção.
     *
     * `hookTimeout` sobe pelo mesmo motivo, com um agravante: `portaoDiscoReal.test.ts` monta
     * um cofre em disco de verdade no `beforeEach` (`mkdtemp` + `inicializar`) e o apaga no
     * `afterEach`. Isso é I/O real, e o padrão de 10s é medido na mesma máquina fria.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },

  /**
   * A bancada de interface (`amostra.html` + `src/amostra/`) fica FORA do app publicado.
   *
   * Em dev ela é servida de graça, só por existir na raiz — é lá que a interface é vista e
   * testada, já que o app real só abre dentro do Tauri (tudo passa por `invoke`, e o seletor
   * de cofre usa diálogo nativo). Mas ela monta dados falsos e expõe o editor do mapa num
   * global (`window.__editorMapa`, ver `src/amostra/CenaMapa.tsx`) para que a automação
   * alcance o canvas do tldraw, que resolve forma por coordenada e ignora seletor de CSS.
   * Nada disso tem por que viajar dentro do instalador que o usuário recebe.
   *
   * `GRIMORIO_BANCADA=1 npm run build` empacota as duas, para conferir a bancada em build de
   * produção quando fizer falta.
   */
  build: empacotarBancada
    ? { rollupOptions: { input: { main: "index.html", amostra: "amostra.html" } } }
    : {},

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
