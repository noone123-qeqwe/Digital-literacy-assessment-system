# Topic assessments

Content version: `mc-topic-assessments-2026.1`. Researched and authored on 17 November 2026.

Six original educational assessments extend the existing baseline and follow-up course. They use different assessment approaches while keeping the original five-domain research questionnaire and its scoring unchanged.

| Assessment | Approach | Minutes | Main coverage |
| --- | --- | --- | --- |
| Digital Essentials — Knowledge Check | Knowledge check | 15 | Files, browsers, software, backups and troubleshooting |
| Cybersecurity & Privacy — Scenario Assessment | Scenario decisions | 18 | Phishing, sign-in security, permissions, sessions and updates |
| Fact-checking & Media — Case Assessment | Case interpretation | 18 | Claims, original sources, images, graphs and sponsorship |
| Communication & Collaboration — Situational Judgment | Situational judgment | 18 | Email, respectful communication, coauthoring and accessibility |
| Productivity & Data — Applied Knowledge | Applied knowledge | 20 | Documents, spreadsheets, formulas, charts and data checks |
| Responsible AI & Citizenship — Decision Assessment | Responsible-use decisions | 18 | Verification, privacy, bias, disclosure and accountability |

Each assessment contains 12 distinct questions: eight multiple-choice, two true/false and two identification items. Every question is worth one point. An achievement certificate requires at least 80% (10 of 12 correct); lower scores still produce a saved result. All eight established quiz categories are represented across the pack.

These are knowledge and decision questions about simulated situations. They do not measure a student's ability to carry out a task in an actual office application. They are not copied provider tests, officially accredited examinations or validated research instruments.

## Student experience

Published assessments are assigned to active, verified student accounts and automatically become available to students verified later. Each permits one attempt, requires acceptance of the independent-work instructions, and randomizes questions and answer options. Resuming keeps the same randomized snapshot. Students can review responses before submitting.

New timed attempts pause when the assessment server stops receiving connection checks. Questions and answer entry resume after reconnection. After a blackout, return to the same attempt to recover the remaining time. Up to 15 seconds may elapse after the last successful connection check. Any scheduled closing date still applies. Answers must reach the server before time runs out to count. Results include explanations and supporting references once detailed review is available.

These topic quizzes have no baseline prerequisite and do not participate in the paired baseline/follow-up comparison. Existing research assessments, course snapshots and participant scores are preserved. Publication creates no accounts, attempts, responses or certificates.

## Sources and authorship

The following primary sources informed original scenarios, learning objectives and answer explanations:

- [European Commission JRC — DigComp digital competence framework](https://joint-research-centre.ec.europa.eu/scientific-activities/key-competences-lifelong-learning/digital-competence-framework-digcomp_en)
- [Literacy Minnesota — Northstar standards](https://www.literacymn.org/northstar-standards)
- [UNESCO — Global Media and Information Literacy Assessment Framework](https://www.unesco.org/en/articles/global-media-and-information-literacy-assessment-framework)
- [UNESCO — AI Competency Framework for Students](https://www.unesco.org/en/articles/ai-competency-framework-students?hub=66961)
- [CISA — Four easy ways to stay safe online](https://www.cisa.gov/sites/default/files/2024-09/Secure-Our-World-4-Easy-Ways-Stay-Safe-Online-Tip-Sheet.pdf)
- [Microsoft — Create a formula using a function](https://support.microsoft.com/en-us/excel/create-a-formula-by-using-a-function)
- [Microsoft — AVERAGE function](https://support.microsoft.com/en-us/excel/functions/average-function)
- [Microsoft — Relative, absolute and mixed references](https://support.microsoft.com/en-us/excel/switch-between-relative-absolute-and-mixed-references)
- [Microsoft — Share OneDrive files and folders](https://support.microsoft.com/en-us/onedrive/share-files-and-folders-in-microsoft-onedrive)
- [W3C WAI — Image text alternatives decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/)
- [UNESCO — Misinformation](https://www.unesco.org/en/query-list/m/misinformation)

Northstar's public standards were consulted; its proprietary assessment questions were not copied. Frameworks provide content guidance, not validation of these newly authored items. The newer framework guidance does not replace the thesis questionnaire's five-domain instrument.

## Private publication and maintenance

The canonical questions, distractors, accepted answers and explanations are stored outside Git at `C:\Users\mcg45\DLAS-Operations\Content\topic-assessments-2026.1.private.json`, with access restricted to the configuring Windows user. Live content resides in the private database. The public repository contains the publisher, synthetic test fixtures and this blueprint, without the real question bank.

Validate without opening a database:

```text
npm --prefix server run publish:assessments -- --file <private-pack.json>
```

Publish with production settings loaded privately and an active verified administrator:

```text
npm --prefix server run publish:assessments -- --file <private-pack.json> --administrator-id <id> --apply
```

Publication validates every item and reference, rejects duplicate prompts, and inserts the questions, immutable assessment snapshots, scoped assignments, audit entry and version manifest in one transaction. A failure rolls back all new rows. Repeating the identical pack creates no duplicates. Editing content requires a new version. Re-importing does not override staff archival or unpublication choices.

Staff can use the existing assessment management controls to unpublish or archive a quiz. Authorized staff retain existing question-bank access. Keeping keys private, enforcing server deadlines and limiting attempts reduces avoidable exposure, but cannot stop students sharing content or using another device.

## Verification

The private content passed 25 isolated publication and assessment checks, including validation, enrollment, answer-key protection, ownership boundaries, stable resume, all three response formats, scoring, certificate PDF download, attempt limits, version immutability and rollback. The test creates temporary accounts and scores only in a disposable local database.

Browser testing completed all six actual 12-question forms in an isolated database. It checked instructions, required confirmation, answering, saving, review, submission and certificate eligibility at 10 of 12 points. Catalog and answering layouts were checked at 390, 768 and 1365 pixels with no horizontal overflow or uncaught browser errors. The complete backend suite and production libSQL-driver suite also passed.

The six forms were published to the persistent live database on 17 November 2026 as assessment IDs **4–9**, with 72 new items and five eligible students assigned to each. The site now has eight published knowledge assessments and 136 bank items. Publication verification confirmed that existing account records, research content, attempts, responses, results and prior course snapshots were unchanged. No production student results were created by testing.

Run the reproducible synthetic suite with `npm --prefix server run test:assessment-pack`. Set `DLAS_PRIVATE_ASSESSMENT_FILE` to the private pack path to check the actual content in the same isolated flow; the test logs outcomes without printing answer keys.
