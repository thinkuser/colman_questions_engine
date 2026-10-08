/**
 * Candidate-facing Hebrew copy specific to the V4 dual-entry experiment (DEC-035). Everything else in V4 reuses the
 * approved V3 copy (landing, world discovery, transition, questions, result) and the V2 project content.
 */
export const V4_COPY = {
  appTitle: "StudyMatch — איזה תחום לימודים יכול להתאים לכם?",
  appDescription: "כמה שאלות קצרות על מה שמעניין אתכם לעשות, ואנחנו נעזור לכם לצמצם את האפשרויות.",
  method: {
    headline: "איפה אתם נמצאים כרגע בבחירה של מה ללמוד?",
    support: "בחרו את האפשרות שהכי מתארת אתכם — ונמשיך משם.",
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
      cue: "נתחיל מפרויקטים ומשימות מוכרות ונבין יחד לאילו כיוונים אתם נמשכים.",
    },
    back: "חזרה",
  },
  projects: {
    headline: "לאיזה פרויקט הייתם הכי רוצים להצטרף?",
    support: "בחרו עד שניים שהכי מסקרנים אתכם. אין תשובה נכונה.",
  },
  discovery: {
    backToMethod: "לבחירת דרך אחרת",
  },
} as const;
