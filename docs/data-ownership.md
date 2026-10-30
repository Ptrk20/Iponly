# User Data Ownership

Every user-owned repository operation must obtain its owner from the authenticated server session. Never accept `userId` as an authoritative value from a form, URL, request body, or AI tool.

Required query shapes for future financial repositories:

```ts
findByIdForUser(recordId: string, userId: string)
updateForUser(recordId: string, userId: string, input: UpdateInput)
archiveForUser(recordId: string, userId: string)
```

Every read, update, and archive query must constrain both the record ID and authenticated user ID. Return not-found behavior when the pair does not match; do not reveal whether another user owns the record.

Phase 2 demonstrates the rule in `preferences-repository.ts`: each query is scoped by its `userId` argument, and server actions derive that argument through `getCurrentUser()`. The PGlite tests create two users and verify that changing one user’s preferences leaves the other user and profile untouched.

Do not create placeholder financial tables or seed demo finance fixtures into registered users. Later financial repositories must use the same ownership pattern and add two-user isolation tests for every new user-owned data family.