# User Data Ownership

Every user-owned repository operation must obtain its owner from the authenticated server session. Never accept `userId` as an authoritative value from a form, URL, request body, or AI tool.

Required query shapes for user-owned repositories:

```ts
findByIdForUser(recordId: string, userId: string)
updateForUser(recordId: string, userId: string, input: UpdateInput)
archiveForUser(recordId: string, userId: string)
```

Every read, update, and archive query must constrain both the record ID and authenticated user ID. Return not-found behavior when the pair does not match; do not reveal whether another user owns the record.

The preferences and Savings repositories follow this rule: each query takes the authenticated `userId`, and Server Actions derive it through `getCurrentUser()`. Account details are loaded using both account ID and user ID. Composite account/user/currency foreign keys enforce ownership and currency consistency for transactions and linked goals. The Savings PGlite tests create two users and verify that one user cannot access or mutate the other's records.

Do not seed demo finance fixtures into registered users. Future financial repositories must continue the same ownership pattern and add two-user isolation tests for each user-owned data family.