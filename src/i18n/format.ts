/** Fills the `{name}` placeholders of a UI string; unknown placeholders are left as they are. */
export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}

/** A UI string in its singular and plural forms, chosen by `{count}`. */
export interface PluralForms {
  one: string;
  other: string;
}

const frenchPlural = new Intl.PluralRules('fr');

/** Picks the French form for `count` (0 and 1 are singular), then fills the placeholders. */
export function formatCount(
  forms: PluralForms,
  count: number,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const template = frenchPlural.select(count) === 'one' ? forms.one : forms.other;
  return format(template, { ...values, count });
}
