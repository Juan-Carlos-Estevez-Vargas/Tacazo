import { POOL_9FT } from "@tacazo/core";
import { iniciarIdiomas } from "./i18n/index.js";
import { Juego } from "./juego.js";
import { VistaMesa } from "./mesa.js";
import { Sonido } from "./sonido.js";

await iniciarIdiomas();
const contenedor = document.getElementById("mesa");
if (contenedor) {
  const vista = new VistaMesa(POOL_9FT);
  await vista.iniciar(contenedor);
  new Juego(vista, new Sonido()).iniciar();
}
