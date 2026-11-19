# Digital Literacy Foundations

Version: `mc-digital-foundations-2026.1`, authored and reviewed for publication on 16 November 2026. These are original educational knowledge questions. They are separate from the original thesis questionnaire, and are not presented as a validated research instrument or a professional qualification examination.

## Published forms

| Setting | Baseline | Follow-up |
| --- | --- | --- |
| Purpose | Starting knowledge before reviewing learning guides | Knowledge after learning |
| Questions | 32 | 32 different questions |
| Coverage | Four questions in each of the eight categories | The same category weights and learning objectives |
| Question mix per category | Two multiple-choice, one true/false, one identification | Two multiple-choice, one true/false, one identification |
| Points | One per question; 32 possible | One per question; 32 possible |
| Timer | 35 minutes | 35 minutes |
| Attempt limit | One | One |
| Certificate | At least 80%; requires 26/32 points | At least 80%; requires 26/32 points |
| Availability | Published without a calendar deadline | Published; server requires the student's completed baseline |
| Assignment | Current and newly verified active student accounts | The same enrollment policy |

Completing the baseline unlocks the follow-up regardless of the baseline score. A score below the certificate threshold still produces a saved result. The threshold is an educational achievement rule; it is not a claim of official institutional accreditation.

Both forms require an affirmative independent-work confirmation. Questions and multiple-choice options are randomized per attempt; that snapshot is retained when resuming. Students can review answers before submission. The timer continues during disconnection; answers must reach the server before the deadline to be scored. Typed answers ignore capitalization and repeated whitespace and accept the recorded variants. The instructions explain these rules before the timer begins.

## Category blueprint

| Category | Learning objectives covered by both forms |
| --- | --- |
| Computer Literacy | Input/output devices, file organization, safe installation/update decisions, hardware terminology |
| Internet Literacy | Check website destinations, use browser navigation, understand private-browsing limits, save website shortcuts |
| Information Literacy | Select responsible sources, examine evidence and dates, acknowledge paraphrases, understand citations |
| Digital Communication | Choose recipients, grant suitable collaboration permissions, communicate respectfully, understand Cc/Bcc |
| Digital Safety and Security | Recognize suspicious credential requests, verify backups, protect sign-in, recognize security terminology |
| Digital Citizenship | Respect consent and privacy, follow reuse conditions, support accessibility, recognize responsible-use concepts |
| Productivity Tools | Use spreadsheet expressions, recover versions, structure documents, identify spreadsheet cells |
| Media Literacy | Check original context, identify promotional purposes, verify claims, distinguish misleading information by intent |

The forms use different items and are not statistically equated. The progress page compares the student's paired overall and eight category percentages as learning indicators. It does not claim that observed change alone proves an intervention effect. Generic retake comparisons and research scores remain separate.

## Content provenance and answer protection

Prompts, choices and explanations were authored for this course. They are not copied from an external proprietary test. Relevant guidance was checked against primary sources, including:

- [CISA — Four easy ways to stay safe online](https://www.cisa.gov/sites/default/files/2024-09/Secure-Our-World-4-Easy-Ways-Stay-Safe-Online-Tip-Sheet.pdf)
- [Google Chrome Help — Private browsing limits](https://support.google.com/chrome/answer/95464?hl=en)
- [Gmail Help — Recipient fields](https://support.google.com/mail/answer/2819488?hl=en)
- [Microsoft Support — Spreadsheet formulas](https://support.microsoft.com/en-us/excel/create-a-simple-formula-in-excel)
- [Microsoft Support — Version history](https://support.microsoft.com/en-us/office/restore-a-previous-version-of-a-file-stored-in-onedrive-159cad6d-d76e-4981-88ef-de6e96c93893)
- [UNESCO — Understanding media and information literacy](https://www.unesco.org/mil4teachers/en/module1/unit1?hl=en-US)
- [UNESCO — Media and information literate citizens](https://www.unesco.org/en/articles/media-and-information-literate-citizens)
- [Creative Commons — License conditions](https://creativecommons.org/share-your-work/use-remix/cc-licenses/)
- [W3C WAI — Text alternatives for images](https://www.w3.org/WAI/tutorials/images/)

The source file with live questions and keys is private, outside the Git workspace, at `C:\Users\mcg45\DLAS-Operations\Content\foundationCourse-2026.1.private.json`. Its folder is restricted to the configuring Windows user and SYSTEM. Live questions and answer keys reside in the private database, not in public GitHub source or frontend assets. Completed results reveal their own explanations; active attempts omit keys and explanations. Authorized staff retain their existing question-bank permissions.

This reduces avoidable exposure; it cannot prevent students from sharing content or using another device. One-attempt policies, distinct forms, immutable snapshots, server deadlines and permission checks support assessment integrity without claiming cheat-proof testing.

## Publication and maintenance

Validate a private input without opening the database:

```text
npm --prefix server run publish:foundations -- --file <private-course.json>
```

Publish only with the real-account production cloud settings already loaded privately:

```text
npm --prefix server run publish:foundations -- --file <private-course.json> --administrator-id <id> --apply
```

The import validates all 64 questions, the type mix, matched objectives and references before writing. Publication inserts the bank, two snapshots, enrollment and a version manifest in one transaction. Repeating the same input is idempotent. Changing a published input requires a new version/program; it never silently rewrites prior snapshots or republishes an assessment that staff unpublish or archive. A baseline required by another form cannot be deleted underneath it.

Staff can unpublish or archive either form using existing assessment controls. Unpublished forms stop automatic enrollment and new attempts. Existing attempts and results retain their established access rules. The live publication creates no sample accounts, responses, results or certificates.

Research collection and the original five-domain scoring rules are unaffected by this educational course.

## Publication validation

Both forms were published to the live persistent database on 16 November 2026: baseline assessment **2** and follow-up assessment **3**. The new bank contains 64 active items, eight per category across the two forms. Publication created no student accounts or attempts.

The backend suite passes 176 checks, and 150 account/research, quiz and curriculum checks also pass with the production libSQL driver. The private real content separately passed the 19 curriculum checks in an isolated database. Browser testing completed both 32-question forms using the actual private bank, checked the below-threshold baseline and qualifying follow-up, verified the unlock and paired progress, and checked phone, tablet and desktop layouts. These browser results were temporary local test data; they were not recorded as live participant scores.

The follow-up gate is enforced by the server as well as the visible interface. Tests confirm automatic enrollment after email verification, student ownership and administrator access boundaries, idempotent imports, immutable scoring snapshots and preservation of staff unpublication choices.
