import type { ProgramId } from "@/engine";

/**
 * Candidate-facing Hebrew copy for the V3 experience (`/v3`). Structured presentation copy kept out of components so
 * wording can be reviewed in one place. Everything here is deterministic template text: no runtime generation.
 *
 * V3 is a presentation layer over the SAME engine as V2. Nothing in this file affects routing or scoring, and nothing
 * makes academic or career claims: the per-program lines describe what the CANDIDATE is drawn to (interest-level
 * statements), and "what you will find" reuses the programs' verified work-imagination statements.
 */

export const V3_COPY = {
  appTitle: "StudyMatch — איזה תחום לימודים יכול להתאים לכם?",
  appDescription: "כמה שאלות קצרות על מה שמעניין אתכם לעשות, ואנחנו נעזור לכם לצמצם את האפשרויות.",
  logoAlt: "המכללה למינהל",
  landing: {
    headline: "איזה תחום לימודים יכול להתאים לכם?",
    support: "כמה שאלות קצרות על מה שמעניין אתכם לעשות, ואנחנו נעזור לכם לצמצם את האפשרויות.",
    expectations: ["כ־3–5 דקות", "לא צריך לדעת מראש מה ללמוד", "בסוף תקבלו כיוון ומסלול שכדאי להכיר"],
    cta: "בואו נמצא את הכיוון שלכם",
    note: "מספר השאלות משתנה מעט לפי התשובות שלכם.",
    resume: "להמשיך מאיפה שעצרתם",
    startOver: "להתחיל מחדש",
  },
  discovery: {
    headline: "באיזה פרויקט הייתם הכי רוצים להשתתף?",
    support: "בחרו עד שניים שהכי מסקרנים אתכם. אין תשובה נכונה.",
    projectsLabel: "פרויקטים לבחירה",
    selectedBadge: "נבחר",
    selectedCount: (count: number) => `נבחרו ${count} מתוך 2`,
    limit: "אפשר לבחור עד שני פרויקטים. בטלו בחירה אחת כדי לבחור אחרת.",
    next: "בואו נמשיך",
  },
  /** World-led discovery (DEC-034). Headline and helper come from the world data file. */
  worlds: {
    entriesLabel: "עולמות עשייה לבחירה",
    limit: "אפשר לבחור עד שני עולמות. בטלו בחירה אחת כדי לבחור עולם אחר.",
  },
  /** Company label overrides for the synthetic (non-company) project (brand-led variant only). */
  companyLabels: { ai_feature_privacy: "AI" } as Readonly<Record<string, string>>,
  transition: {
    headline: "מעולה, עכשיו נחדד את הכיוון",
    body: "מכאן בכל שאלה בוחרים אפשרות אחת. השאלות משתנות לפי התשובות שלכם כדי להתמקד במה שרלוונטי לכם.",
    cta: "לשאלה הראשונה",
  },
  questions: {
    optionsLabel: "אפשרויות",
    continue: "המשך",
    back: "חזרה",
    restart: "התחלה מחדש",
    gapTitle: "לא הצלחנו להמשיך",
    gapBody: "משהו בבחירות האלה לא הסתדר לנו. אפשר לחזור צעד אחורה או להתחיל מחדש עם פרויקטים אחרים.",
  },
  progress: {
    label: "שלבי המסע",
    stage: (n: number) => `שלב ${n} מתוך 3`,
    stageNames: { 1: "בוחרים מה מסקרן אתכם", 2: "מדייקים את הכיוון", 3: "הכיוון שלכם" } as Readonly<
      Record<number, string>
    >,
    early: "כמה שאלות קצרות",
    middle: "אנחנו כבר מתחילים לראות כיוון",
    late: "הכיוון כבר מתחיל להתחדד",
  },
  result: {
    recommendedLabel: "הכיוון שהכי מתאים לכם",
    nearTieHeading: "נראה שיש לכם שני כיוונים חזקים",
    nearTieBody: "שניהם מתאימים לכם, וזה לגמרי בסדר. הנה מה שמבדיל ביניהם.",
    insufficientHeading: "לא קיבלנו עדיין כיוון מספיק ברור",
    insufficientBody:
      "בכמה מהשאלות לא הרגשתם שאחת האפשרויות באמת מתאימה לכם, וזו תוצאה לגמרי לגיטימית. אפשר לנסות שוב ולבחור אחרת.",
    weakLabel: "כיוון שכדאי לבדוק",
    whyTitle: "למה זה מתאים לכם?",
    secondaryTitle: "כיוון נוסף שכדאי להכיר",
    differenceTitle: "מה ההבדל ביניהם?",
    guidanceTitle: "איך לבחור?",
    colmanTitle: "לאיזה סוג עשייה המסלול מתחבר?",
    colmanExamples: "דוגמאות למה שאפשר לעשות בתחום:",
    colmanFactsNote: "את פרטי התוכנית, הקורסים ותנאי הקבלה תמצאו באתר המכללה.",
    programCta: "הכירו את המסלול במכללה",
    programCtaFor: (name: string) => `הכירו את ${name}`,
    contactCta: "דברו איתנו על המסלול",
    notRightTitle: "לא מרגיש לכם נכון?",
    notRightBody: "זה בסדר. אפשר לחזור ולבדוק כיוון אחר.",
    tryAgain: "לנסות שוב",
    allPrograms: "לכל תוכניות הלימוד במכללה",
    detailChosenTitle: "למה קיבלתי את התוצאה הזו?",
    detailChosenLead: "אלה הבחירות שעזרו לנו להבין את הכיוון שלכם:",
    detailMoreTitle: "מה עוד כדאי לדעת?",
    importantNoteTitle: "נקודה שכדאי לקחת בחשבון",
    contactStickyHint: "השאירו פרטים ונחזור אליכם",
  },
  lead: {
    placeholders: { firstName: "לדוגמה: דנה", lastName: "לדוגמה: לוי", phone: "לדוגמה: 050-1234567" },
  },
} as const;

/** Interest-level meaning of each program for the candidate. Never an academic fact about the program. */
export interface ProgramMeaning {
  /** One line for the hero: who the direction suits. */
  summaryHe: string;
  /** Three statements about what the candidate is drawn to; the result shows two or three of them, in this order. */
  whyHe: readonly [string, string, string];
}

export const PROGRAM_MEANING: Readonly<Record<ProgramId, ProgramMeaning>> = {
  computer_science: {
    summaryHe: "מתאים למי שנהנה לפתור בעיות מורכבות ולבנות מערכות ותוכנה שעובדות באמת.",
    whyHe: [
      "אתם נמשכים לפתור בעיות בצורה שיטתית ומדויקת.",
      "מעניין אתכם להבין איך מערכות ותוכנות עובדות מבפנים.",
      "אתם אוהבים לבנות משהו שאפשר להריץ ולראות שהוא עובד.",
    ],
  },
  data_science: {
    summaryHe: "מתאים למי שרוצה להפוך נתונים להחלטות: למצוא דפוסים ולהסביר מה קורה.",
    whyHe: [
      "מעניין אתכם לגלות דפוסים בתוך כמויות גדולות של מידע.",
      "חשוב לכם להחליט לפי נתונים ולא רק לפי תחושת בטן.",
      "אתם נהנים לשלב חשיבה כמותית עם שאלות מהעולם האמיתי.",
    ],
  },
  management_information_systems: {
    summaryHe: "מתאים למי שרוצה לחבר בין טכנולוגיה לבין עולם העסקים והארגונים.",
    whyHe: [
      "אתם נמשכים גם לצד הטכנולוגי וגם לצד העסקי.",
      "מעניין אתכם איך מערכות משפרות את הדרך שבה ארגון עובד.",
      "אתם אוהבים לתרגם צורך עסקי לפתרון מעשי.",
    ],
  },
  business_administration: {
    summaryHe: "מתאים למי שרוצה לקבל החלטות עסקיות: על מוצר, שוק, תמחור וניהול.",
    whyHe: [
      "חשוב לכם לראות אם מהלך עסקי באמת עובד.",
      "אתם נמשכים להחליט ולהוביל מהלך מהרעיון ועד הביצוע.",
      "מעניין אתכם לחבר בין שיווק, תפעול וכסף.",
    ],
  },
  economics_and_management: {
    summaryHe: "מתאים למי שרוצה להבין איך שווקים, מחירים והחלטות של אנשים וחברות משפיעים זה על זה.",
    whyHe: [
      "מעניין אתכם להבין למה שווקים ואנשים מתנהגים כפי שהם מתנהגים.",
      "אתם אוהבים לבדוק מה יקרה אם משהו משתנה, כמו מחיר או ביקוש.",
      "אתם נהנים לעבוד עם נתונים כדי לתמוך בהחלטה.",
    ],
  },
  accounting: {
    summaryHe: "מתאים למי שאוהב דיוק וסדר, ורוצה להבין את המצב הכספי האמיתי של עסק.",
    whyHe: [
      "חשוב לכם שמספרים יהיו מדויקים ומסודרים.",
      "מעניין אתכם להבין מה באמת קורה בכסף של עסק.",
      "אתם נוטים לבדוק, לוודא ולהגיע למסקנה ברורה.",
    ],
  },
  psychology: {
    summaryHe: "מתאים למי שרוצה להבין איך אנשים חושבים, מרגישים ומתנהגים.",
    whyHe: [
      "מעניין אתכם להבין למה אנשים מתנהגים כפי שהם מתנהגים.",
      "אתם נמשכים לעולם של רגשות, מוטיבציה והבנה של אנשים.",
      "חשוב לכם לעזור לאנשים להרגיש או לתפקד טוב יותר.",
    ],
  },
  behavioral_science: {
    summaryHe: "מתאים למי שרוצה להבין איך קבוצות, ארגונים והסביבה החברתית משפיעים על הדרך שבה אנשים מתנהגים.",
    whyHe: [
      "מעניין אתכם להבין איך אנשים מתנהגים בתוך קבוצות וארגונים.",
      "מסקרן אתכם איך תרבות, נורמות וסביבה משפיעות על התנהגות.",
      "אתם נמשכים להבין יחסים ודינמיקות בין אנשים, ולא רק אדם אחד בפני עצמו.",
    ],
  },
  education: {
    summaryHe: "מתאים למי שרוצה ללמד, להנחות ולעזור לאנשים להתפתח ולהתמיד.",
    whyHe: [
      "חשוב לכם לעזור לאנשים ללמוד ולהתקדם.",
      "מעניין אתכם מה גורם לאדם להתמיד ולהמשיך.",
      "אתם נמשכים להנחות, להסביר ולהשפיע על אחרים.",
    ],
  },
  economics_and_psychology: {
    summaryHe: "מתאים למי שרוצה לחבר בין הבנת אנשים לבין הבנת שווקים והחלטות כלכליות.",
    whyHe: [
      "אתם נמשכים גם להבנת אנשים וגם להבנת כסף ושווקים.",
      "מעניין אתכם למה אנשים מחליטים החלטות כלכליות כפי שהם מחליטים.",
      "אתם אוהבים לחבר בין הבנה של התנהגות לבין החלטות בעולם האמיתי.",
    ],
  },
  communication: {
    summaryHe: "מתאים למי שרוצה ליצור תוכן, לספר סיפור ולהשפיע דרך מסרים ומדיה.",
    whyHe: [
      "מעניין אתכם להבין איך אנשים מגיבים למסרים.",
      "אתם נמשכים לצד היצירתי: סיפור, תוכן ומדיה.",
      "חשוב לכם שהמסר יגיע לאנשים ויעשה משהו.",
    ],
  },
  communication_and_management: {
    summaryHe: "מתאים למי שרוצה לחבר בין תקשורת למטרות, לאסטרטגיה ולהחלטות של ארגון.",
    whyHe: [
      "אתם נמשכים גם לצד יצירתי וגם לצד עסקי.",
      "חשוב לכם לראות אם מהלך תקשורתי באמת עובד, ולמדוד אותו.",
      "מעניין אתכם להתאים מסר לקהל ולמטרה של ארגון.",
    ],
  },
  law: {
    summaryHe: "מתאים למי שאוהב לנתח טיעונים, לחשוב על כללים והשלכות ולהגן על עמדה.",
    whyHe: [
      "אתם נמשכים לנתח מצבים לפי כללים, זכויות והשלכות.",
      "חשוב לכם לחשוב על הצד ההוגן והחוקי של החלטות.",
      "אתם אוהבים לבנות טיעון ולהסביר אותו בצורה ברורה.",
    ],
  },
  interior_design: {
    summaryHe: "מתאים למי שרוצה לעצב חללים שאנשים מרגישים בהם ומשתמשים בהם.",
    whyHe: [
      "מעניין אתכם איך חלל משפיע על ההרגשה והחוויה של אנשים.",
      "אתם נמשכים לשלב יצירתיות עם פתרון מעשי לחלל.",
      "חשוב לכם לראות רעיון הופך למשהו שאפשר לראות ולהיכנס אליו.",
    ],
  },
};

/** Curated "what is the difference" content for the pairs that most often tie. Anything else falls back to work statements. */
export interface PairGuidance {
  ifHe: string;
  programId: ProgramId;
}

export interface PairContent {
  programs: readonly [ProgramId, ProgramId];
  /** Short differentiators per program (same order as `programs`). */
  bullets: readonly [readonly string[], readonly string[]];
  guidance: readonly [PairGuidance, PairGuidance];
}

export const PAIR_CONTENT: readonly PairContent[] = [
  {
    programs: ["communication", "communication_and_management"],
    bullets: [
      ["תוכן וסיפור", "מדיה", "תקשורת יצירתית"],
      ["קהלים ואסטרטגיה", "מטרות עסקיות וארגוניות", "מדידה וקבלת החלטות"],
    ],
    guidance: [
      { ifHe: "אם מושך אתכם בעיקר ליצור ולהשפיע דרך תוכן", programId: "communication" },
      { ifHe: "אם מושך אתכם לחבר תקשורת להחלטות ולביצועים של ארגון", programId: "communication_and_management" },
    ],
  },
  {
    programs: ["computer_science", "data_science"],
    bullets: [
      ["לבנות מערכות ותוכנה", "אלגוריתמים ופתרון בעיות", "להבין איך דברים עובדים מבפנים"],
      ["לגלות דפוסים בנתונים", "ללמוד מנתונים ולחזות", "להפוך נתונים להחלטות"],
    ],
    guidance: [
      { ifHe: "אם מושך אתכם לבנות ולהריץ מערכות", programId: "computer_science" },
      { ifHe: "אם מושך אתכם לגלות דפוסים ולהסיק מנתונים", programId: "data_science" },
    ],
  },
  {
    programs: ["business_administration", "economics_and_management"],
    bullets: [
      ["החלטות עסקיות: מוצר, שוק ותמחור", "הובלת מהלך מהרעיון ועד הביצוע", "חיבור בין שיווק, תפעול וכסף"],
      ["הבנת שווקים, מחירים וביקוש", "ניתוח נתונים כדי להסביר התנהגות", "בדיקה מה ישתנה כשתנאים משתנים"],
    ],
    guidance: [
      { ifHe: "אם מושך אתכם להחליט ולהוביל מהלך עסקי", programId: "business_administration" },
      { ifHe: "אם מושך אתכם להבין למה שווקים ואנשים מתנהגים כך", programId: "economics_and_management" },
    ],
  },
  {
    programs: ["psychology", "behavioral_science"],
    bullets: [
      ["האדם עצמו", "רגשות, מחשבות ומוטיבציה", "איך אדם חושב ומתנהג"],
      ["קבוצות וארגונים", "תרבות, יחסים ונורמות", "איך הסביבה החברתית משפיעה על אנשים"],
    ],
    guidance: [
      { ifHe: "אם מושך אתכם להבין אדם לעומק: מה הוא מרגיש, חושב ולמה הוא פועל כך", programId: "psychology" },
      { ifHe: "אם מושך אתכם להבין אנשים בתוך קבוצות, ארגונים וסביבות חברתיות", programId: "behavioral_science" },
    ],
  },
];

export function findPairContent(a: ProgramId, b: ProgramId): PairContent | null {
  return PAIR_CONTENT.find((pair) => pair.programs.includes(a) && pair.programs.includes(b) && a !== b) ?? null;
}
