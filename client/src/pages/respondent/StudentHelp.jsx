import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CircleHelp, Mail, Wifi } from 'lucide-react';
import api from '../../api/axios';
import PageHeader from '../../components/common/PageHeader';

const HelpCard = ({ title, children, Icon }) => <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
  <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-800"><Icon aria-hidden="true" className="h-5 w-5" /></span><h2 className="text-base font-bold text-slate-900">{title}</h2></div>
  <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
</section>;

export default function StudentHelp() {
  const [studyInfo, setStudyInfo] = useState(null);
  useEffect(() => { api.get('/system/study-information').then((response) => setStudyInfo(response.data?.data?.studyInfo || null)).catch(() => {}); }, []);
  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader eyebrow="Student support" title="Help and getting started" description="What to expect, how your progress is saved, and where to ask for help." action={<Link to="/respondent/assessments" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800">My assessments <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>} />
    <div className="grid gap-4 md:grid-cols-2">
      <HelpCard title="Your first assessment" Icon={BookOpenCheck}>
        <ol className="list-inside list-decimal space-y-2">
          <li>Verify the email address linked to your account and sign in.</li>
          <li>Open <Link to="/respondent/assessments" className="font-semibold text-green-800 underline">My assessments</Link> and choose an assigned assessment.</li>
          <li>Review the study information, consent choices, and profile fields before you begin.</li>
          <li>Answer each item honestly. Your assessment uses the published four-point scale.</li>
          <li>Review your answers and submit to see your results and learning recommendations.</li>
        </ol>
      </HelpCard>
      <HelpCard title="Saving and resuming" Icon={Wifi}>
        <p>Your answers are backed up in this browser on the device you are using, then saved to the assessment system when it can be reached. If the internet drops or the device shuts down, the recovery copy remains in that browser and is restored when you return. After power or connection returns, sign in using the same account, device, and browser to continue syncing.</p>
        <p className="mt-3">Do not clear browser data or use a different device before the system confirms your answers. Local recovery cannot be accessed from another device, and browser storage may be cleared by device settings. Submission requires a connection and confirmation that every answer reached the system. You can resume from <Link to="/respondent/assessments" className="font-semibold text-green-800 underline">My assessments</Link>.</p>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">If your assessment has a timer, it keeps running while the device is off. Your saved answers remain available, but contact your instructor if the time limit expires and you need the attempt reopened.</p>
      </HelpCard>
      <HelpCard title="Understanding your results" Icon={CircleHelp}>
        <p>Your overall and competence-area scores summarize self-reported answers. Use your lower-scoring areas to choose learning resources; the results do not measure every real-world digital skill or replace instructor guidance.</p>
        <p className="mt-3"><Link to="/respondent/learning" className="font-semibold text-green-800 underline">Open your learning path</Link> to find recommended resources and track your progress.</p>
      </HelpCard>
      <HelpCard title="Research questions or account help" Icon={Mail}>
        {studyInfo?.researcherEmail ? <>
          <p>For study participation, consent, or data questions, contact the research team:</p>
          <p className="mt-2 font-semibold text-slate-900">{studyInfo.researcherName || 'Research team'}</p>
          <a href={`mailto:${studyInfo.researcherEmail}`} className="mt-1 inline-block break-all font-semibold text-green-800 underline">{studyInfo.researcherEmail}</a>
        </> : <p>The study contact details are not configured yet. Please ask the College of Computer Studies office or your authorized instructor for assistance.</p>}
        <p className="mt-3">For sign-in problems, use the password reset link on the login page. Never send your password or verification code to another person.</p>
      </HelpCard>
    </div>
    <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">Taking part is voluntary. You may stop or withdraw through the assessment consent page without a grade penalty. Your consent page explains what is stored and how to withdraw.</p>
  </div>;
}
