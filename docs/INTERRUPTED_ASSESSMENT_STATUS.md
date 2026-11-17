# Interrupted assessment status

An expired scored quiz used to display **Completed** when reopened, even with no answers. The timer continued after the student left. Reopening triggered automatic deadline finalization, and both manual submission and automatic finalization shared the same status. The assessment card also inferred completion from the attempt limit alone.

## Corrected behavior

- Before the server deadline, an interrupted attempt stays **In progress** and offers **Resume assessment**. Its saved responses, randomized snapshot and original deadline are retained.
- Once the deadline passes, the card shows **Time expired**, the saved-answer count, and access to the saved attempt/result. Reading the list or dashboard does not submit anything.
- Automatic deadline finalization records `completion_reason=time_expired`; an on-time full submission records `submitted`. The server decides this reason; request flags cannot change it.
- Results, notifications, history and exports distinguish these outcomes. Submitted dashboard counts exclude timed-out attempts; the expired count includes ended attempts that have not yet been reopened. Saved timeout scores remain in the existing scoring analytics and history.
- An attempt limit alone displays **Attempt limit reached**, rather than implying that the student finished.
- The instructions explain that leaving the page, closing the browser or losing connectivity does not pause the timer.

The additive database migration identifies legacy expired or incomplete finalized attempts without rewriting their scores, answers, snapshots, timestamps or account records. Ongoing attempts retain their original status. Existing research self-assessment behavior is unchanged.

Unanswered items retain the established zero-point scoring at expiry. Existing certificate thresholds and attempt limits remain server-enforced. An incomplete timed-out baseline does not unlock its follow-up or enter the paired course comparison; a finalized baseline with every answer received can still qualify regardless of its score. Whitespace-only typed answers do not count as answered, consistently with form submission validation.

This fix does not reset deadlines, grant extra attempts or restore answers that never reached the server. Pending local recovery data is retained under the existing synchronization rules.

## Verification

- 27 focused backend checks pass on SQLite and the production libSQL driver: interruption/resume, nonmutating reads, expiry counts, late-answer rejection, server-controlled outcome, idempotence, attempt limits, ownership, prerequisite gates, legacy migration and Unicode whitespace handling.
- Component tests cover active, expired, submitted and exhausted states; timeout result explanations and notifications; and saved result history.
- Full backend and client suites, lint and production build pass.
- An isolated browser workflow checks saved-answer resume before expiry, explicit full submission, zero-answer reopening after expiry, result history and dashboard counts on phone, tablet and desktop.

Tests use disposable accounts and scores in temporary local databases. They do not create production participant results.
