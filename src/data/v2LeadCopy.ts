/**
 * Candidate-facing Hebrew copy for the V2 lead form (THI-16 review pass). Structured copy, kept out of components.
 *
 * LEGAL: the consent wording below is the College-style baseline and is SUBJECT TO COLLEGE LEGAL APPROVAL before
 * launch. No privacy-policy URL exists in the structured source data, so none is linked (none is invented). When the
 * wording changes, bump `LEAD_CONSENT_VERSION`: the version is sent with every lead so the wording a candidate agreed
 * to can always be identified.
 */

export const LEAD_CONSENT_VERSION = "2026-10-draft-1";

export const V2_LEAD_COPY = {
  title: "רוצים שנעזור לכם לעשות את הצעד הבא?",
  intro: "השאירו פרטים, ונציגי המכללה יחזרו אליכם עם מידע על המסלולים שקרובים לכיוון שלכם.",
  fields: {
    firstName: "שם פרטי",
    lastName: "שם משפחה",
    phone: "טלפון",
  },
  phoneHint: "למשל 050-1234567",
  consent:
    "אני מאשר/ת ומסכים/ה לרישום פרטי במאגרי המידע של המסלול האקדמי המכללה למינהל, לרבות לצורך דיוור ישיר של דברי פרסומת ועדכונים באמצעי ההתקשרות השונים.",
  submit: "חזרו אליי עם פרטים",
  submitting: "שולחים…",
  errors: {
    firstName: "נא למלא שם פרטי.",
    lastName: "נא למלא שם משפחה.",
    phone: "נא להזין מספר טלפון תקין, למשל 050-1234567.",
    consent: "כדי להמשיך יש לאשר את הסכמתכם.",
    summary: "יש להשלים כמה פרטים כדי שנוכל לשלוח.",
    send: "כרגע לא הצלחנו לשלוח את הפרטים. נסו שוב בעוד רגע.",
  },
  success: {
    title: "תודה, הפרטים התקבלו.",
    body: "נציגי המכללה יחזרו אליכם.",
  },
} as const;
