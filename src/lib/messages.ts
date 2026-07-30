export function t(locale: string, en: string, am: string): string {
  return locale === 'am' ? am : en;
}
