import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LimiteDeErro } from "./components/LimiteDeErro";
import { aplicarTema, temaSalvo } from "./lib/tema";

// aplica o tema salvo antes do 1º paint (sem flash de tema)
aplicarTema(temaSalvo());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Sem este limite, um erro de render deixa a janela do Tauri PRETA e muda — sem console
        à mão, sem aba para fechar, sem uma palavra ao usuário. Ver LimiteDeErro.tsx. */}
    <LimiteDeErro>
      <App />
    </LimiteDeErro>
  </React.StrictMode>,
);
