/**
 * Hebrew UI copy, centralized so wording can be reviewed without touching components.
 * Skeleton copy only — final product copy arrives with THI-9 / THI-10.
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
    start: "התחילו בהשוואה",
  },
  questions: {
    heading: "כמה שאלות קצרות",
    placeholder: "מנוע השאלות האדפטיבי עדיין לא חובר. כאן יוצגו 5–7 שאלות שמבחינות בין התוכניות שבחרתם.",
    comparing: "משווים בין:",
    toResult: "המשך לתוצאה",
    back: "חזרה לבחירת תוכניות",
  },
  result: {
    heading: "התוצאה",
    placeholder: "חישוב ההתאמה עדיין לא מומש. כאן תוצג ההמלצה, הסיבות לה וההחלטה המרכזית שלכם.",
    compared: "התוכניות שהשוויתם:",
    restart: "השוואה חדשה",
  },
} as const;
