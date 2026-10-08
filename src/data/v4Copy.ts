/**
 * Candidate-facing Hebrew copy specific to the V4 dual-entry experiment (DEC-035). Everything else in V4 reuses the
 * approved V3 copy (landing, world discovery, transition, questions, result) and the V2 project content.
 */
export const V4_COPY = {
  appTitle: "StudyMatch — איזה תחום לימודים יכול להתאים לכם?",
  appDescription: "כמה שאלות קצרות על מה שמעניין אתכם לעשות, ואנחנו נעזור לכם לצמצם את האפשרויות.",
  method: {
    headline: "איך הכי קל לכם לחשוב על העתיד שלכם?",
    support: "אפשר להתחיל מסוג העבודה שמעניין אתכם, או מפרויקט שהייתם רוצים להיות חלק ממנו.",
    optionsLabel: "דרכים להתחיל",
    worlds: {
      title: "דרך עולם שמעניין אותי",
      description: "טכנולוגיה, אנשים, חינוך, משפטים, עסקים, עיצוב ועוד.",
      cue: "מתאים אם קל לכם לדמיין באיזה סוג סביבה או עשייה הייתם רוצים להיות.",
    },
    projects: {
      title: "דרך פרויקט שהייתי רוצה לעבוד עליו",
      description: "Spotify, Wolt, TikTok ופרויקטים מוכרים אחרים.",
      cue: "מתאים אם קל לכם להתחיל ממשימה או מוצר שמסקרנים אתכם.",
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
