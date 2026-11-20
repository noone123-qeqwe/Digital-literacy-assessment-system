import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CircleHelp, Mail, Wifi } from 'lucide-react';
import api from '../../api/axios';
import PageHeader from '../../components/common/PageHeader';

const HelpCard = ({ title, children, Icon }) => <section className="rounded-2xl border border-slate-200/85 bg-white p-5 shadow-xs transition-all hover:border-slate-300/90 hover:shadow-md sm:p-6">
  <div className="flex items-center gap-3.5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700 ring-4 ring-green-50/70"><Icon aria-hidden="true" className="h-5 w-5" /></span><h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2></div>
  <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
</section>;

export default function StudentHelp() {
  const [studyInfo, setStudyInfo] = useState(null);
  useEffect(() => { api.get('/system/study-information').then((response) => setStudyInfo(response.data?.data?.studyInfo || null)).catch(() => {}); }, []);
  return <div className="mx-auto max-w-5xl space-y-6 pb-8">
    <PageHeader eyebrow="Student support" title="Help and getting started" description="What to expect, how your progress is saved, and where to ask for help." action={<Link to="/respondent/knowledge" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-green-700">Take assessment <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>} />
    <div className="grid gap-4 md:grid-cols-2">
      <HelpCard title="Your first assessment" Icon={BookOpenCheck}>
        <ol className="list-inside list-decimal space-y-2">
          <li>Verify the email address linked to your account and sign in.</li>
          <li>Open <Link to="/respondent/knowledge" className="font-semibold text-green-800 underline">Take Assessment</Link> and choose an available quiz.</li>
          <li>Read the instructions and time limit before you begin. Research questionnaires are listed separately in the menu and may require consent and profile information.</li>
          <li>Choose the best answer for knowledge quizzes. For research questionnaires, answer honestly using the scale shown on the screen.</li>
          <li>Review your answers and submit to see your results and learning recommendations.</li>
        </ol>
      </HelpCard>
      <HelpCard title="Saving and resuming" Icon={Wifi}>
        <p>After power and internet return, sign in and select <strong>Resume assessment</strong> in <Link to="/respondent/knowledge" className="font-semibold text-green-800 underline">Knowledge assessments</Link>. Use the same device and browser to recover any answers that were saved locally but had yet to reach the server.</p>
        <p className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-green-950">For new timed quizzes, questions pause when the connection drops. The server can count up to 15 seconds after its last connection check. Your remaining time returns when you reconnect. The scheduled closing date still applies.</p>
        <p className="mt-3">Older quiz attempts with fixed timers and timed research questionnaires continue counting during an outage. If a research questionnaire expires, contact your instructor about reopening it. <Link to="/respondent/assessments" className="font-semibold text-green-800 underline">Open research questionnaires</Link>.</p>
      </HelpCard>
      <HelpCard title="Understanding your results" Icon={CircleHelp}>
        <p>Knowledge quiz results show your scored answers. Research questionnaire results summarize your self-reported skills using a separate scoring method. Use your lower-scoring areas to choose learning resources; the results do not measure every real-world digital skill or replace instructor guidance.</p>
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
