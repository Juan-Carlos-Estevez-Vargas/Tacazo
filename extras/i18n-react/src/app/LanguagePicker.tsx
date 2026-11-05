import { useId } from "react";
import { LOCALES, setLocale, useLocale, useT, type Locale } from "@/i18n";

/**
 * Selector de idioma. Arranca con el idioma del navegador/PC y, al cambiarlo,
 * lo recuerda en este navegador. Es un <select> nativo: funciona con teclado,
 * lector de pantalla y el selector del sistema en el celular.
 */
export function LanguagePicker({ compact }: { compact?: boolean }) {
  const t = useT().common.language;
  const locale = useLocale();
  const id = useId();
  return (
    <div className={`lang-picker${compact ? " lang-picker--compact" : ""}`}>
      <label htmlFor={id} className={compact ? "visually-hidden" : "lang-picker__label"}>
        <span aria-hidden>🌐 </span>{t.label}
      </label>
      {compact && <span className="lang-picker__icon" aria-hidden>🌐</span>}
      <select id={id} value={locale} title={t.choose} onChange={(e) => void setLocale(e.target.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.tag}>{compact ? l.code.toUpperCase() : l.name}</option>
        ))}
      </select>
    </div>
  );
}
