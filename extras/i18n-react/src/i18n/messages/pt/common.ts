import type { Messages } from "@/i18n";

export const common: Messages["common"] = {
  loading: "Carregando…",
  cancel: "Cancelar",
  save: "Salvar",
  close: "Fechar",
  skipToContent: "Pular para o conteúdo",
  items: (n: number) => `${n} ${n === 1 ? "item" : "itens"}`,
  language: { label: "Idioma", choose: "Escolha o idioma" },
};
