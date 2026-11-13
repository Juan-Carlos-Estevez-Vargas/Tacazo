// Importaciones `?raw` de Vite (solo las usan las pruebas).
declare module "*?raw" {
  const contenido: string;
  export default contenido;
}
