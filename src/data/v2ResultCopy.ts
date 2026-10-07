/**
 * Candidate-facing Hebrew copy for the generic V2 result and the generated focus question wrapper (THI-16).
 * Structured presentation copy, kept out of components so wording can be reviewed in one place. Templates are
 * deterministic: nothing is generated at runtime, nothing here mentions scores, percentages or program facts.
 * The 11 programs without curated facts (`facts_status: pending_curation`) get only the candidate's own choices,
 * their work-imagination statements and official links; this copy makes no academic or career claims.
 */

const COUNT_WORDS: Record<number, string> = { 2: "שתי", 3: "שלוש", 4: "ארבע", 5: "חמש" };

export const V2_RESULT_COPY = {
  /** Wrapper prompt of a generated 2-/3-way focus question (the options are the programs' work statements). */
  generatedFocusPrompt: "איזה יום עבודה נשמע לכם הכי מעניין?",
  recommended: {
    eyebrow: "הכיוון שהכי בולט אצלכם",
    whyTitle: "מה בלט בבחירות שלכם",
    /** `n` is the number of independent choices that pointed to the direction (2 or more). */
    pattern: (n: number) => `ב${COUNT_WORDS[n] ?? "כמה"} בחירות שונות חזרתם לכיוון הזה.`,
    chosenLead: "בחרתם:",
    secondaryTitle: "כיוון נוסף שכדאי להכיר",
    secondaryBody: "גם הוא הופיע בבחירות שלכם:",
  },
  nearTie: {
    eyebrow: "נראה שיש לכם שני כיוונים חזקים",
    body: "שני הכיוונים הופיעו בבחירות שלכם בעוצמה דומה, וזה לגמרי בסדר. הנה מה שמשך אתכם לכל אחד מהם.",
    pulledTitle: "מה משך אתכם לכיוון הזה",
  },
  insufficient: {
    heading: "לא קיבלנו עדיין כיוון מספיק ברור",
    body: "בכמה מהשאלות לא הרגשתם שאחת האפשרויות באמת מתאימה לכם, וזו תוצאה לגמרי לגיטימית. אפשר לחזור לשאלה האחרונה ולענות אחרת, או להתחיל מחדש ולבחור פרויקטים אחרים.",
    weakTitle: "כיוון שכדאי לבדוק",
    weakBody: "זה הכיוון היחיד שקיבל ביטוי בבחירות שלכם, בלי עדיין תמונה ברורה:",
    restartPrimary: "לבחירת פרויקטים אחרים",
  },
  mainDecision: {
    title: "ההתלבטות המרכזית שלכם",
    /** `a`/`b` are program display names; `workA`/`workB` their work-imagination statements. */
    recommended: (a: string, workA: string, b: string, workB: string) =>
      `אם מה שהכי מושך אתכם הוא ״${workA}״ — הכיוון של ${a} קרוב יותר. אם זה ״${workB}״ — כדאי לבדוק גם את ${b}.`,
    nearTie: (a: string, workA: string, b: string, workB: string) =>
      `כשהמשימה היא ״${workA}״ — ${a}. כשהמשימה היא ״${workB}״ — ${b}.`,
  },
  reality: {
    title: "נקודה שכדאי לקחת בחשבון",
    answered: "התשובה שלכם:",
    heading: { positive: "נראה שזה מסתדר לכם", neutral: "כדאי לזכור", negative: "נקודה שכדאי לקחת בחשבון" },
    negativeNote: "זה לא פוסל את הכיוון — רק כדאי לבדוק אותו לעומק לפני שמחליטים.",
  },
  explore: {
    title: "רוצים להכיר מקרוב?",
    programPage: (name: string) => `לעמוד התוכנית באתר המכללה: ${name}`,
    factsNote: "כאן מוצגות הבחירות שלכם בלבד. פרטי התוכנית, הקורסים ותנאי הקבלה — באתר המכללה.",
  },
  actions: {
    admission: "לבדיקת תנאי הקבלה",
    advisor: "אני רוצה לשוחח עם יועץ",
    restart: "התחלה מחדש",
    backToQuestion: "חזרה לשאלה האחרונה",
    notYouTitle: "לא מרגיש לכם נכון?",
    notYouBody: "אפשר לחזור לשאלה האחרונה ולענות אחרת, או להתחיל מחדש עם פרויקטים אחרים.",
  },
} as const;
