/** The V4 gender-inclusive copy scan (DEC-036), shared by the unit suite and the V4 browser suite. */

/**
 * Masculine-only ways of addressing or describing the candidate. Impersonal plurals ("בוחרים") are allowed. Words may
 * carry Hebrew prefix letters (ש, ו, ל, ב, כ, ה, מ): "שאתם", "ולכם", "שאוהב".
 */
const word = (alternatives: string, prefixes = "ושלבכהמ") =>
  new RegExp(`(^|[^א-ת])[${prefixes}]{0,2}(${alternatives})(?=[^א-ת]|$)`);
export const MASCULINE_ONLY: ReadonlyArray<[string, RegExp]> = [
  ["2pl pronoun", word("אתם|אתכם|לכם|שלכם|אליכם|בשבילכם|עליכם|מכם")],
  ["2pl suffix", /[א-ת]תכם(?=[^א-ת]|$)/],
  ["2pl past", /(^|[^א-ת])(?!אותם|סתם|חותם)[א-ת]{2,}תם(?=[^א-ת]|$)/],
  [
    "2pl imperative",
    word(
      "בחרו|בטלו|נסו|הכירו|דברו|השאירו|חזרו|בואו|ענו|לחצו|קראו|דמיינו|שימו|תנו|קחו|גלו|ספרו|היכנסו|המשיכו|חשבו",
      "וש",
    ),
  ],
  ["2pl future", word("תקבלו|תמצאו|תרצו|תבחרו|תלמדו|תוכלו|תגלו|תחשבו", "וש")],
  ["2sg masculine", word("אתה|תבחר", "וש")],
  ["masculine self-description", word("נהנה|נהנים|אוהב|אוהבים|מעדיף|מעדיפים|רוצים|נמשכים")],
  ["masculine role", /מי ש(מבין|מכיר|מחבר)(?=[^א-ת]|$)/],
];

export function masculineHits(text: string): string[] {
  return MASCULINE_ONLY.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
