/**
 * El servidor (base de datos, funciones) responde en español. Si el texto es
 * uno de los conocidos, se devuelve en el idioma activo; si no, tal cual.
 */
import spanish from "./messages/es";
import { msg } from "./store";

const normalize = (text: string) => text.trim().replace(/[.\s]+$/, "").toLowerCase();
const KEYS = new Map(
  (Object.keys(spanish.errors.server) as Array<keyof typeof spanish.errors.server>)
    .map((k) => [normalize(spanish.errors.server[k]), k]),
);

export function fromServer(text: string): string {
  const key = KEYS.get(normalize(text));
  return key ? msg().errors.server[key] : text;
}
