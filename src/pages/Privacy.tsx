import { Link } from "react-router-dom";
import { Shield, Megaphone, Cookie, Database, Mail, Baby, Smartphone, UserCheck } from "lucide-react";
import PageLayout from "@/components/layout/PageLayout";
import PageBanner from "@/components/shared/PageBanner";

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy (/privacy)
// ─────────────────────────────────────────────────────────────────────────────
// Exists primarily to satisfy the disclosure requirements that come with
// running third-party advertising (Adsterra) on a school website: visitors
// must be told that third-party vendors, including ad networks, serve ads,
// use cookies/identifiers and may personalise advertising. Written for a
// non-technical audience (students, parents, teachers). Last updated:
// September 2026.
// ─────────────────────────────────────────────────────────────────────────────

const LAST_UPDATED = "September 2026";

interface Section {
  id: string;
  icon: typeof Shield;
  title: string;
  body: string[];
}

const SECTIONS: Section[] = [
  {
    id: "overview",
    icon: Shield,
    title: "1. Overview",
    body: [
      "This Privacy Policy explains how the official website of Government High School Babi Khel (\"we\", \"our\", the \"Website\") collects, uses and protects information when you visit ghsbabikhel.indevs.in, use it as an installed app (PWA), submit an admission application, check results, or read notes and notices.",
      "We keep data collection to the minimum a school website needs: accounts for students and staff, admission applications you choose to submit, and anonymous usage statistics that help us improve the Website. We never sell your personal information.",
      "By using the Website you agree to this policy. If you do not agree, please discontinue use and contact the school office with any concerns.",
    ],
  },
  {
    id: "advertising",
    icon: Megaphone,
    title: "2. Third-Party Advertising (Adsterra)",
    body: [
      "IMPORTANT: This Website displays third-party advertisements to help cover hosting and development costs. We use Adsterra, an independent advertising network, to serve ads. This includes in-content native banners, a floating social bar widget, and occasionally interstitial/pop-under formats that may open in a new tab or window when you interact with a page.",
      "Adsterra and its advertising partners may use cookies, web beacons, pixels, device or advertising identifiers, and similar technologies to measure ad performance, limit how often you see the same ad, detect fraud, and in some cases show advertising that is more relevant to you. These technologies are controlled by the ad network and its partners, not by the school.",
      "Third-party vendors and ad networks generally receive only non-personal information such as your approximate region (derived from IP address), device type, browser, pages visited and timestamps. We do not provide advertisers with students' names, roll numbers, results, admission data, contact details or any account information.",
      "Advertisement content is selected by the ad network. The school does not control which specific ads appear and their display does not imply our endorsement. If an advertisement asks you for personal information, downloads, or payments, use caution — such offers are not from the school.",
    ],
  },
  {
    id: "choices",
    icon: Cookie,
    title: "3. Cookies & Your Ad Choices",
    body: [
      "Essential cookies and browser storage keep the Website working (for example, your sign-in session and your theme preference). Advertising cookies are set by Adsterra and its partners and are governed by their own privacy policies.",
      "You can control or delete cookies through your browser settings at any time. Blocking advertising cookies will not break the Website — ads may simply become less relevant.",
      "To opt out of interest-based advertising from many participating companies, you can visit industry opt-out pages such as the Digital Advertising Alliance's WebChoices tool (optout.aboutads.info), the Network Advertising Initiative (optout.networkadvertising.org) or Your Online Choices (youronlinechoices.com). On mobile devices you can also turn on \"Limit Ad Tracking\" / \"Opt out of Ads Personalisation\" in your device settings.",
    ],
  },
  {
    id: "information",
    icon: Database,
    title: "4. Information We Collect",
    body: [
      "Account data: students, teachers and administrators create accounts with a name, email address, class/role and password. Passwords are stored only in hashed (unreadable) form by our authentication provider, Supabase.",
      "Application data: admission applications include the details you enter, such as the student's name, B-Form number, contact number, address, previous school and uploaded documents. This information is used only to process and track the application and is visible only to authorised school staff.",
      "Usage data: we collect anonymous analytics (pages visited, approximate country, device type, referrer) through our privacy-friendly analytics tool (Plausible Analytics), which does not use cookies and does not identify individuals.",
      "We do not collect biometric data, payment card data, or precise location. Exam results and roll numbers on this Website are shown only in response to a roll-number lookup and are not combined with advertising data.",
    ],
  },
  {
    id: "pwa",
    icon: Smartphone,
    title: "5. Offline App (PWA) Storage",
    body: [
      "The Website is an installable Progressive Web App (PWA). To make pages open when your internet is slow or unavailable, your browser stores a copy of the app itself (pages, scripts, recently viewed images and notices) on your device using service-worker caches and IndexedDB.",
      "This offline storage stays on your device only — it is not uploaded anywhere. Uninstalling the web app or clearing your browser's \"site data\" removes it completely.",
    ],
  },
  {
    id: "children",
    icon: Baby,
    title: "6. Children's Privacy",
    body: [
      "This Website serves a school community that includes minors. We take that responsibility seriously: accounts and personal records are managed through the school, and we do not knowingly collect personal information from children beyond what is required for education and administration.",
      "Parents and guardians are encouraged to review this policy with their children, including the section on third-party advertising, and to supervise internet use. If you believe a child has provided unnecessary personal information through the Website, contact us and we will promptly delete it.",
    ],
  },
  {
    id: "sharing",
    icon: UserCheck,
    title: "7. How Information Is Shared",
    body: [
      "We share data only with the service providers needed to run the Website, each under its own privacy commitments: Supabase (database, authentication and file storage), Vercel (website hosting), Plausible Analytics (cookie-less statistics), Cloudinary (image hosting), and Adsterra (advertising).",
      "We may disclose information if required by law or to protect the safety of students and staff. We never sell or rent personal information to anyone.",
    ],
  },
  {
    id: "changes-contact",
    icon: Mail,
    title: "8. Changes & Contact",
    body: [
      "We may update this policy from time to time. The \"last updated\" date at the top of this page always shows the current version, and significant changes will be announced on the Website.",
      "Questions, requests or complaints about privacy can be sent to the school office: ghsbabikhel@gmail.com or +92 346 9898295, Government High School Babi Khel, District Mohmand, Khyber Pakhtunkhwa, Pakistan.",
    ],
  },
];

const Privacy = () => {
  return (
    <PageLayout>
      <PageBanner
        title="Privacy Policy"
        subtitle="How we handle your data — including the third-party advertisements displayed on this Website"
      />

      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <p className="text-xs text-muted-foreground mb-8 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Last updated: {LAST_UPDATED}
        </p>

        {/* Quick summary box */}
        <div className="mb-10 rounded-2xl border border-gold/40 bg-gold/5 p-5">
          <h2 className="font-heading font-bold text-foreground mb-2 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-gold" /> Short version
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This is a school website. We collect the minimum data needed to run
            admissions, results, notes and accounts, and we never sell it. The
            Website <strong className="text-foreground">displays third-party
            advertisements served by Adsterra</strong>; those ads may use
            cookies and similar technologies, and their content is chosen by
            the ad network, not by the school. You can opt out of ad
            personalisation using the tools listed in Section 3.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {SECTIONS.map(({ id, icon: Icon, title, body }) => (
            <section key={id} id={id} aria-labelledby={`${id}-title`}>
              <h2
                id={`${id}-title`}
                className="font-heading font-bold text-lg text-foreground mb-3 flex items-center gap-2"
              >
                <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                {title}
              </h2>
              <div className="space-y-3 pl-0 sm:pl-10">
                {body.map((paragraph, i) => (
                  <p key={i} className="text-sm text-muted-foreground leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Related links */}
        <div className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/faq" className="hover:text-foreground transition-colors">FAQs</Link>
          <Link to="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
          <Link to="/about" className="hover:text-foreground transition-colors">About the School</Link>
        </div>
      </div>
    </PageLayout>
  );
};

export default Privacy;
