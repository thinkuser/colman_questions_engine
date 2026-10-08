/**
 * Candidate-facing Hebrew copy specific to the V4 dual-entry experiment (DEC-035). Everything else in V4 reuses the
 * approved V3 copy (landing, world discovery, transition, questions, result) and the V2 project content, rendered
 * through the gender-inclusive V4 presentation layer (`v4InclusiveCopy.ts`, DEC-036). V4 copy is gender-inclusive.
 */
export const V4_COPY = {
  appTitle: "StudyMatch — איזה תחום לימודים יכול להתאים לך?",
  appDescription: "כמה שאלות קצרות על מה שמעניין אותך לעשות, ואנחנו נעזור לצמצם את האפשרויות.",
  method: {
    headline: "מה הכי מתאר את השלב הנוכחי בבחירה של מה ללמוד?",
    support: "אפשר לבחור את האפשרות שהכי מתאימה — ונמשיך משם.",
    optionsLabel: "דרכים להתחיל",
    // First in the list = the RIGHT card in the RTL layout.
    worlds: {
      title: "יש לי כיוון שאני רוצה ללמוד",
      description: "יש תחום שמושך אותי, ואני רוצה לדייק איזה מסלול הכי מתאים לי.",
      cue: "נתחיל מעולמות כמו טכנולוגיה, אנשים, חינוך, משפטים, עסקים ועיצוב.",
    },
    // Second = the LEFT card.
    projects: {
      title: "אין לי מושג מה אני רוצה ללמוד",
      description: "אני רוצה להתחיל לחקור ולגלות מה באמת מסקרן אותי.",
      cue: "נתחיל מפרויקטים ומשימות מוכרות ונבין יחד לאלו כיוונים יש יותר חיבור.",
    },
    back: "חזרה",
  },
  projects: {
    headline: "לאיזה פרויקט היית הכי רוצה להצטרף?",
    support: "אפשר לבחור עד שניים שהכי מסקרנים אותך. אין תשובה נכונה.",
  },
  discovery: {
    backToMethod: "לבחירת דרך אחרת",
  },
} as const;
