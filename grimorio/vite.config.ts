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
