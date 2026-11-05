import type { Messages } from "@/i18n";

export const common: Messages["common"] = {
  loading: "Loading…",
  cancel: "Cancel",
  save: "Save",
  close: "Close",
  skipToContent: "Skip to content",
  items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
  language: { label: "Language", choose: "Choose the language" },
};
