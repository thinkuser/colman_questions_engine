import Script from "next/script";

/**
 * Google Tag Manager loader for the V5 pilot (DEC-038), OFF by default. The app already pushes every analytics event to
 * `window.dataLayer`; without a GTM container on the page those events reach no tool. This renders the standard GTM
 * snippet only when `NEXT_PUBLIC_GTM_ID` is set to a valid container id (e.g. GTM-ABC1234), and only inside the /v5
 * layout, so V1-V4 pages are never affected. The container id is public by design (it is in every page's HTML); it is
 * not a secret. No id, an invalid id, or server-only rendering: nothing is rendered.
 */
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,12}$/;

export function gtmContainerId(raw: string | undefined = process.env.NEXT_PUBLIC_GTM_ID): string | null {
  const id = raw?.trim().toUpperCase();
  return id && GTM_ID_PATTERN.test(id) ? id : null;
}

export function GtmLoader() {
  const id = gtmContainerId();
  if (!id) return null;
  return (
    <Script id="studymatch-gtm" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`}
    </Script>
  );
}
