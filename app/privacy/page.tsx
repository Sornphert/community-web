import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PLATFORM_NAME } from '@/lib/config'

export const metadata = {
  title: `Privacy Policy · ${PLATFORM_NAME}`,
}

// ---------------------------------------------------------------------------
// VERIFY(Sorn) before relying on this for store submission, and have the final text
// reviewed by someone qualified (a lawyer / your DPO). The SUBSTANCE below is accurate
// to how the app handles data; these are the legal identifiers — confirm each:
//   • LEGAL_ENTITY  — must be your EXACT registered company name (SSM).
//   • CONTACT_EMAIL — a monitored inbox. Currently theprophetsystem's support address;
//                     consider a platform address (e.g. support@thetreewisdom.com) once
//                     that mailbox exists.
//   • EFFECTIVE_DATE — set to the date you actually publish/deploy this.
const LEGAL_ENTITY = 'The Tree Solutions'
const CONTACT_EMAIL = 'support@theprophetsystem.com'
const EFFECTIVE_DATE = 'July 2026'
// Data is stored in Supabase's Southeast Asia (Singapore) region.
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-fg-secondary">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-secondary transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to communities
      </Link>

      <h1 className="text-2xl font-semibold text-fg">Privacy Policy</h1>
      <p className="mt-2 text-sm text-fg-muted">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-relaxed text-fg-secondary">
        {PLATFORM_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by{' '}
        {LEGAL_ENTITY}. It hosts private, invite-only membership communities where
        a teacher and their members share posts, discussion, and classroom
        content. This policy explains what personal data we collect, how we use
        it, who we share it with, and the choices you have.
      </p>

      <Section title="Information we collect">
        <p>We collect only what the service needs to work:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Account information</strong> — your email address and
            password (passwords are stored only as a salted hash; we never see
            them), and the display name, profile photo, bio, and social links you
            choose to add.
          </li>
          <li>
            <strong>Content you create</strong> — posts, comments, likes, images
            and files you upload, and your progress through classroom material.
          </li>
          <li>
            <strong>Membership information</strong> — which communities you belong
            to and your role in each.
          </li>
          <li>
            <strong>Notification data</strong> — if you enable push
            notifications, a device push token so we can deliver them. You can
            turn this off at any time.
          </li>
          <li>
            <strong>Technical data</strong> — a session cookie to keep you signed
            in, and a local setting for your light/dark theme preference. We do
            not use advertising or third-party tracking cookies.
          </li>
        </ul>
        <p>
          We do not sell your personal data, and we do not use it for
          advertising.
        </p>
      </Section>

      <Section title="How we use your information">
        <ul className="ml-5 list-disc space-y-1">
          <li>To create and secure your account and sign you in.</li>
          <li>
            To operate the communities — show your posts and profile to the other
            members of the communities you belong to.
          </li>
          <li>
            To send you notifications you have opted into, and essential account
            emails (for example, password resets).
          </li>
          <li>To keep the service secure and to prevent abuse.</li>
        </ul>
        <p>
          Your profile and the content you post are visible to the other members
          of your community. Posts a community chooses to feature publicly may
          also appear on our public homepage; you control whether your own posts
          are shared publicly.
        </p>
      </Section>

      <Section title="Service providers we share data with">
        <p>
          We use a small number of trusted providers to run the service. They
          process data only to provide their service to us:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Supabase</strong> — database, authentication, and file storage
            (hosted in the Southeast Asia / Singapore region).
          </li>
          <li>
            <strong>Vercel</strong> — application hosting and delivery.
          </li>
          <li>
            <strong>Bunny Stream</strong> — hosting and streaming of classroom
            videos.
          </li>
          <li>
            <strong>Resend</strong> — delivery of account emails.
          </li>
          <li>
            <strong>Apple and Google push services</strong> — delivery of push
            notifications, if you enable them.
          </li>
        </ul>
        <p>
          We may also disclose information if required by law or to protect the
          rights and safety of our users.
        </p>
      </Section>

      <Section title="Data retention and deleting your account">
        <p>
          We keep your information for as long as your account is active. You can
          delete your account at any time from your profile screen. When you do:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            Your profile is anonymised (your name, photo, bio and links are
            removed) so past discussions still read correctly, and your account,
            memberships, notifications, and uploaded files are deleted.
          </li>
          <li>
            Your posts and comments are kept but shown as from a deleted user, so
            other members&rsquo; conversations remain intact.
          </li>
          <li>Your login is removed and your email is freed.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>
          You can access and update your profile information at any time from your
          profile screen, and delete your account as described above. Depending on
          where you live, you may also have rights under applicable data
          protection law (including Malaysia&rsquo;s Personal Data Protection Act)
          to request access to, correction of, or deletion of your personal data.
          To make a request, contact us at the address below.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The service is intended for adults and is not directed at children. We
          do not knowingly collect personal data from anyone under 18. If you
          believe a child has provided us personal data, contact us and we will
          remove it.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Access to community content is restricted to that community&rsquo;s
          members, enforced at the database level. Passwords are stored only as
          salted hashes, and traffic is encrypted in transit. No system is
          perfectly secure, but we take reasonable measures to protect your data.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will change
          the effective date above, and for material changes we will provide
          notice within the app.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data? Contact {LEGAL_ENTITY} at{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-fg underline underline-offset-2"
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </div>
  )
}
