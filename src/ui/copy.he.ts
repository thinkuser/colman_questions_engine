/**
 * Hebrew UI copy (interface chrome), centralized so wording can be reviewed without touching components.
 * Question and answer copy is NOT here: it is structured data in src/data/content/question_copy_he.json.
 */
export const copy = {
  appTitle: "StudyMatch — השוואת תוכניות לימוד",
  appDescription: "כלי שעוזר להבין איזו תוכנית לימוד מתאימה לך יותר, ולמה.",
  brand: "COLMAN StudyMatch",
  steps: {
    select: "בחירת תוכניות",
    questions: "שאלות",
    result: "תוצאה",
  },
  select: {
    heading: "אילו תוכניות לימוד אתם שוקלים?",
    instructions: "בחרו 2–3 תוכניות להשוואה.",
    selectedCount: (count: number, max: number) => `נבחרו ${count} מתוך ${max}`,
    selectedLabel: "נבחרה",
    start: "התחילו בהשוואה",
  },
  questions: {
    comparing: "משווים בין:",
    progress: (questionNumber: number) => `שאלה ${questionNumber}`,
    typicalLength: (min: number, max: number) => `בדרך כלל ${min}–${max} שאלות`,
    optionsLabel: "אפשרויות תשובה",
    back: "חזרה",
    restart: "התחלה מחדש",
  },
  result: {
    heading: "סיימנו — התוצאה שלך מוכנה",
    placeholder: "מסך ההמלצה המלא יתווסף בשלב הבא. בינתיים, כך נראה סיכום התשובות שלכם.",
    compared: "התוכניות שהשוויתם:",
    summaryHeading: "סיכום זמני של התשובות (לפיתוח)",
    answeredCount: (count: number) => `נענו ${count} שאלות`,
    back: "חזרה לשאלה האחרונה",
    restart: "השוואה חדשה",
  },
} as const;
