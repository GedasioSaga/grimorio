import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { aplicarTema, temaSalvo } from "./lib/tema";

// aplica o tema salvo antes do 1º paint (sem flash de tema)
aplicarTema(temaSalvo());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
