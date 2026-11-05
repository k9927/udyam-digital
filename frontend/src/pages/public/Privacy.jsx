import { ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui.jsx';

const SECTIONS = [
  ['What we collect, and why', ['Advisor: business type, size, locations, city type, GST yes/no, current internet, goal. No name, phone or ID.', 'Account: your mobile number, verified by a one-time code.', 'Verification: your GSTIN or Udyam number, checked against the registry only after you consent.', 'Documents: an address proof and the signatory ID. Text is read on your phone; the file is stored privately so a reviewer can check flagged items.']],
  ['Consent and purpose', ['Every registry lookup and document check needs your consent, recorded with its purpose and time.', 'Permission lasts 30 minutes for one application. You can withdraw it at any time; anything not yet verified is deleted.', 'We never use verification data for marketing.']],
  ['How it is protected', ['GSTIN and Udyam numbers are encrypted at rest and shown masked.', 'Documents are stored in a private bucket and opened only by you or a KYC officer; every staff view is logged.', 'Partners see only cases assigned to them, with identifiers masked.', 'The AI advisor (when enabled) receives only your chat text, never IDs or documents.']],
  ['How long we keep it', ['Unverified documents: deleted when you withdraw consent.', 'Verified business record: kept while you are a customer, then deleted per telecom KYC rules.', 'Orders and bills: kept for the contract and statutory period.']],
  ['Your rights', ['See a copy of your data, correct it, or ask us to delete it from My data. We respond within 30 days.', 'Grievance officer: privacy@accelbusiness.demo']],
];

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      
      <h1 className="mt-4 text-3xl font-extrabold">Privacy and your data</h1>
      <p className="mt-2 text-ink-muted">How Udyam Digital follows the Digital Personal Data Protection Act, 2023: collect only what each step needs, ask before we look, keep it briefly, and show you what happened.</p>
      <div className="mt-8 divide-y divide-line border-y border-line">{SECTIONS.map(([title, points]) => <Card key={title} className="rounded-none border-0 bg-transparent py-6"><h2 className="text-lg font-semibold">{title}</h2><ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">{points.map(point => <li key={point}>{point}</li>)}</ul></Card>)}</div>
      <p className="mt-6 text-xs text-ink-muted">Prototype on synthetic data. Retention periods must be confirmed against DPDP rules and telecom licence KYC conditions.</p>
    </div>
  );
}
