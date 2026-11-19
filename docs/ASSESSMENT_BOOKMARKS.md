# Assessment bookmarks

Choose **Bookmark** on an assessment card, then choose **Bookmarked** above the assessment list to see saved assessments. Choose **Bookmarked** on the card again to remove it. Search and research status filters can be combined with the bookmark filter.

Bookmarks are personal account preferences stored in the database. They survive refreshes and are available when the same account signs in on another device. Students and administrators can bookmark assessments available in their own knowledge and research assessment lists. A bookmark does not start an attempt, submit an answer, change a deadline or unlock an assessment.

## Access and storage

- Authenticated `/api/bookmarks` returns only the current user's accessible knowledge and research assessment IDs. The route accepts no target-user selector.
- CSRF-protected `PUT /api/bookmarks/:kind/:id` saves an accessible assessment; `DELETE` removes the current user's bookmark. Both operations are idempotent. Kinds are restricted to `knowledge` and `research`.
- Visibility follows existing list permissions, including assignment ownership, publication status and already-ongoing knowledge attempts. Withdrawing access hides the bookmark. A user can remove their own stale bookmark without regaining assessment access.
- Separate `quiz_bookmarks` and `assessment_bookmarks` tables use unique user/assessment pairs and foreign keys. User or assessment deletion cascades to its bookmark records. Schema initialization preserves existing records. Normal whole-database backups include these tables.
- Saving requires a network connection. The interface confirms a bookmark only after a successful response; failures leave the saved state unchanged. Loading or bookmark-service failures do not block the assessment list, and a retry control is available.

## Verification

Twenty-nine isolated API checks cover sign-in and CSRF requirements, private ownership, role boundaries, revoked access, publication changes, idempotence/concurrent saves, validation, schema reinitialization and cleanup. These pass using both SQLite and the production libSQL driver. The complete existing backend suites also pass.

Browser verification covers save/remove, filtering and search, persistence across sessions, account isolation, research/knowledge separation, all three roles, retry and failed saves, rapid taps, keyboard operation, and phone/tablet/desktop layouts. Test accounts and records use temporary local databases; production study data is not used for these checks.
