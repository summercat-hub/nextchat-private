import cn from "./cn";
import en from "./en";
import pt from "./pt";
import tw from "./tw";
import da from "./da";
import id from "./id";
import fr from "./fr";
import es from "./es";
import it from "./it";
import tr from "./tr";
import jp from "./jp";
import de from "./de";
import vi from "./vi";
import ru from "./ru";
import no from "./no";
import cs from "./cs";
import ko from "./ko";
import ar from "./ar";
import bn from "./bn";
import sk from "./sk";
import { merge } from "../utils/merge";

import type { LocaleType } from "./cn";
export type { LocaleType, PartialLocaleType } from "./cn";

const ALL_LANGS = {
  cn,
  en,
  tw,
  pt,
  da,
  jp,
  ko,
  id,
  fr,
  es,
  it,
  tr,
  de,
  vi,
  ru,
  cs,
  no,
  ar,
  bn,
  sk,
};

export type Lang = keyof typeof ALL_LANGS;

export const AllLangs = Object.keys(ALL_LANGS) as Lang[];

export const ALL_LANG_OPTIONS: Record<Lang, string> = {
  cn: "简体中文",
  en: "English",
  pt: "Português",
  tw: "繁體中文",
  da: "Dansk",
  jp: "日本語",
  ko: "한국어",
  id: "Indonesia",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  tr: "Türkçe",
  de: "Deutsch",
  vi: "Tiếng Việt",
  ru: "Русский",
  cs: "Čeština",
  no: "Nynorsk",
  ar: "العربية",
  bn: "বাংলা",
  sk: "Slovensky",
};

const DEFAULT_LANG: Lang = "cn";

const fallbackLang = en;
const targetLang = ALL_LANGS[getLang()] as LocaleType;

// if target lang missing some fields, it will use fallback lang string
merge(fallbackLang, targetLang);

export default fallbackLang as LocaleType;

export function getLang(): Lang {
  return DEFAULT_LANG;
}

export function getISOLang() {
  const isoLangString: Record<string, string> = {
    cn: "zh-Hans",
    tw: "zh-Hant",
  };

  const lang = getLang();
  return isoLangString[lang] ?? lang;
}

const DEFAULT_STT_LANG = "zh-CN";
export const STT_LANG_MAP: Record<Lang, string> = {
  cn: "zh-CN",
  en: "en-US",
  pt: "pt-BR",
  tw: "zh-TW",
  da: "da-DK",
  jp: "ja-JP",
  ko: "ko-KR",
  id: "id-ID",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  tr: "tr-TR",
  de: "de-DE",
  vi: "vi-VN",
  ru: "ru-RU",
  cs: "cs-CZ",
  no: "no-NO",
  ar: "ar-SA",
  bn: "bn-BD",
  sk: "sk-SK",
};

export function getSTTLang(): string {
  try {
    return STT_LANG_MAP[getLang()];
  } catch {
    return DEFAULT_STT_LANG;
  }
}
