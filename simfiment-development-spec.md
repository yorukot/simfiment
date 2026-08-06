# Simfiment Development Specification

> **Product name:** Simfiment  
> **Meaning:** Simple Financial Management  
> **Document type:** Product and engineering specification  
> **Audience:** Junior frontend, backend, and full-stack engineers  
> **Status:** Draft approved for MVP implementation  
> **Version:** 0.1  
> **Date:** 2026-08-05  
> **Default language of the product:** Traditional Chinese (`zh-TW`), with English (`en`) also supported
> **Default installation timezone:** `Asia/Taipei`  
> **Default installation currency:** `TWD`

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Product Definition](#2-product-definition)
3. [Confirmed Product Decisions](#3-confirmed-product-decisions)
4. [Goals and Non-Goals](#4-goals-and-non-goals)
5. [Primary User and Core User Journeys](#5-primary-user-and-core-user-journeys)
6. [Information Architecture](#6-information-architecture)
7. [Functional Requirements](#7-functional-requirements)
8. [Quick Transaction Entry Specification](#8-quick-transaction-entry-specification)
9. [Location Capture Specification](#9-location-capture-specification)
10. [Daily Dashboard Specification](#10-daily-dashboard-specification)
11. [Monthly Dashboard Specification](#11-monthly-dashboard-specification)
12. [Category Management Specification](#12-category-management-specification)
13. [Recurring Income and Expense Specification](#13-recurring-income-and-expense-specification)
14. [Authentication and Setup Specification](#14-authentication-and-setup-specification)
15. [UX and Visual Design Requirements](#15-ux-and-visual-design-requirements)
16. [System Architecture](#16-system-architecture)
17. [Backend Architecture](#17-backend-architecture)
18. [Frontend Architecture](#18-frontend-architecture)
19. [Domain Model](#19-domain-model)
20. [SQLite Database Design](#20-sqlite-database-design)
21. [HTTP API Specification](#21-http-api-specification)
22. [Validation Rules](#22-validation-rules)
23. [Error Handling](#23-error-handling)
24. [Security Requirements](#24-security-requirements)
25. [Configuration](#25-configuration)
26. [Deployment and Operations](#26-deployment-and-operations)
27. [Backup and Restore](#27-backup-and-restore)
28. [Logging and Observability](#28-logging-and-observability)
29. [Testing Strategy](#29-testing-strategy)
30. [Performance Requirements](#30-performance-requirements)
31. [Accessibility Requirements](#31-accessibility-requirements)
32. [Repository Structure](#32-repository-structure)
33. [Coding Standards](#33-coding-standards)
34. [Implementation Milestones](#34-implementation-milestones)
35. [Definition of Done](#35-definition-of-done)
36. [MVP Acceptance Criteria](#36-mvp-acceptance-criteria)
37. [Deferred Features](#37-deferred-features)
38. [Engineering Decision Log](#38-engineering-decision-log)
39. [Reference Material](#39-reference-material)

---

# 1. Purpose

This document defines the MVP product behavior and the base engineering architecture for **Simfiment**, a simple personal financial management web application.

The document is intentionally prescriptive. Junior engineers should implement the behavior described here rather than expanding the scope based on personal preference.

When a requirement is unclear:

1. Prefer the simplest implementation that preserves data correctness.
2. Preserve the quick-entry experience.
3. Do not add fields or workflows that are not listed in the MVP scope.
4. Raise an engineering decision for review before changing a confirmed product rule.

This document is the source of truth for MVP behavior. Wireframes and code must follow it unless a later approved document explicitly supersedes it.

---

# 2. Product Definition

**Simfiment** is a single-user personal finance web application.

Its purpose is to make recording income and expenses extremely fast while still providing useful daily and monthly summaries.

The product should feel:

- Fast
- Quiet
- Direct
- Predictable
- Private
- Mobile-first
- Easy to maintain
- Easy to self-host

The product is not intended to be full accounting software.

The main product promise is:

> A user should be able to record a normal transaction with only an amount, a category, and one save action.

A transaction may also contain an optional title and an automatically captured **entry location**—the browser position where the user recorded the transaction—but neither is allowed to slow down or block saving.

---

# 3. Confirmed Product Decisions

The following decisions are confirmed for the MVP.

| Area | Decision |
|---|---|
| Product name | Simfiment |
| Product meaning | Simple Financial Management |
| Form factor | Responsive web application |
| Frontend | React + TypeScript |
| Backend | Go monolith |
| Database | SQLite |
| Deployment | One backend process with one local persistent SQLite file |
| Authentication | Single user, one password, server-side sessions |
| Usernames | Not supported |
| Categories | User can add, rename, reorder, archive, and restore categories |
| Transaction type | Income or expense |
| Transaction title | Optional |
| Transaction amount | Required |
| Transaction category | Required |
| Transaction date/time | Defaults to now and can be edited |
| Transaction location | Optional, browser-based, non-blocking |
| Daily dashboard | Required |
| Monthly dashboard | Required |
| Recurring expenses | Required |
| Recurring income | Required |
| CSV import/export | Not included in MVP |
| Multi-user support | Not included |
| Multiple accounts | Not included |
| Budgets | Not included |
| Mixed currencies within one ledger | Not included |
| Bank integration | Not included |
| OCR or receipt scanning | Not included |
| Reverse geocoding | Not included |
| Offline write synchronization | Not included |

## 3.1 Installation-level assumptions

The application supports one configurable currency per installation. Setup and Settings use the server-owned supported-currency catalog; individual transactions cannot override it.

Default values:

```text
Currency: TWD
Currency exponent: 0
Timezone: Asia/Taipei
Locale: zh-TW
```

The schema stores the currency code on every financial record. Changing the installation currency atomically reinterprets every stored financial amount and code so aggregation never mixes currencies.

---

# 4. Goals and Non-Goals

## 4.1 Product goals

The MVP must:

1. Allow a user to create an expense or income record quickly.
2. Allow an optional short title.
3. Allow the user to create and manage custom categories.
4. Automatically use the current date and time unless edited.
5. Optionally attach the current browser location.
6. Never wait for location capture before saving a transaction.
7. Provide a useful dashboard for a selected day.
8. Provide a useful dashboard for a selected month.
9. Support recurring income and expenses through confirmable occurrences.
10. Preserve data integrity through SQLite constraints and backend validation.
11. Use a simple single-password authentication model.
12. Be deployable as a single Go service with an embedded React build.
13. Require minimal infrastructure.

## 4.2 UX goals

For a normal transaction:

```text
Open entry form → enter amount → choose category → save
```

The target flow must not require:

- Entering a title
- Entering a note
- Selecting an account
- Selecting a merchant
- Selecting a payment method
- Waiting for location
- Navigating to another page
- Confirming a second modal

## 4.3 Non-goals

The MVP must not attempt to implement:

- Double-entry accounting
- Balance sheets
- Account reconciliation
- Credit-card statement import
- Shared household accounting
- Family accounts
- Organization accounts
- Fine-grained access control
- Bank synchronization
- Receipt OCR
- AI categorization
- Tax reporting
- Invoice generation
- Investment tracking
- Asset valuation
- Debt management
- Currency conversion
- Location history maps
- Automatic place-name lookup
- CSV import or export
- Public APIs
- Webhooks
- Native mobile applications
- Background offline synchronization

---

# 5. Primary User and Core User Journeys

## 5.1 Primary user

There is exactly one financial user per Simfiment installation.

The user:

- Uses a password to access the application.
- Records personal income and expenses.
- Usually uses a mobile browser.
- Sometimes reviews data on desktop.
- Wants a very low-friction entry experience.
- May self-host the application.
- Is expected to control the server or trust the server operator.

## 5.2 Core journey: first-time setup

```text
Open Simfiment
→ Enter one-time setup code
→ Set password
→ Confirm timezone and currency
→ Choose whether automatic location capture is enabled
→ Enter the Today dashboard
```

## 5.3 Core journey: record an expense

```text
Open Simfiment
→ Tap the global add button
→ Expense is selected by default
→ Enter amount
→ Tap a category
→ Optionally type a title
→ Tap Save
→ Transaction appears on the selected day
→ Location is attached when available
```

## 5.4 Core journey: record income

```text
Open entry form
→ Switch from Expense to Income
→ Enter amount
→ Select an income category
→ Optionally type a title
→ Save
```

## 5.5 Core journey: review a day

```text
Open Today
→ Read income, expense, and net totals
→ Review category summary
→ Review transactions
→ Move to previous or next day if needed
```

## 5.6 Core journey: review a month

```text
Open Month
→ Read income, expense, and net totals
→ Review expense category breakdown
→ Review daily spending trend
→ Filter or inspect monthly transactions
```

## 5.7 Core journey: process a recurring expense

```text
Open Recurring
→ See pending occurrence
→ Confirm, edit-and-confirm, or skip
→ Confirmed occurrence creates a real transaction
→ Dashboard totals update
```

---

# 6. Information Architecture

## 6.1 Primary navigation

Mobile bottom navigation:

```text
Today     Month     Recurring     Settings
                    [ + ]
```

The central add button opens transaction entry from every authenticated page.

Desktop navigation:

```text
Simfiment
- Today
- Month
- Recurring
- Settings

[Record transaction]
```

## 6.2 Routes

Recommended frontend routes:

```text
/setup
/login
/today
/day/:date
/month
/month/:month
/recurring
/settings
/settings/categories
/settings/security
/settings/location
/transactions/:id
```

Examples:

```text
/day/2026-08-05
/month/2026-08
```

## 6.3 Route behavior

- `/` redirects based on application state.
- Uninitialized installation redirects to `/setup`.
- Initialized but unauthenticated user redirects to `/login`.
- Authenticated user redirects to `/today`.
- Invalid date or month route parameters show a controlled error and a return action.
- Protected routes must not render sensitive data before the session check completes.

---

# 7. Functional Requirements

## 7.1 Application setup

The application must support a one-time setup process.

Required setup fields:

- One-time setup code
- New password
- Confirm password
- Timezone
- Currency
- Locale
- Automatic location capture preference

After setup:

- The setup code becomes invalid.
- Setup endpoints cannot initialize the application again.
- Default categories are inserted.
- A server-side session is created.
- The user is redirected to Today.

## 7.2 Authentication

The application must support:

- Password login
- Logout
- Session restoration after page reload
- Password change
- Revoke all other sessions
- Server-side password reset through CLI for recovery

The application must not support:

- Usernames
- Email addresses
- Password-reset email
- OAuth
- Social login
- JWT authentication

## 7.3 Transactions

The user must be able to:

- Create an expense
- Create income
- View a transaction
- Edit a transaction
- Soft-delete a transaction
- Restore a soft-deleted transaction from the undo action
- Remove an attached location
- Retry location capture only within five minutes of creating a manual transaction when browser permission allows

A transaction contains:

| Field | Required | Notes |
|---|---:|---|
| Kind | Yes | `expense` or `income` |
| Amount | Yes | Positive integer in minor units |
| Category | Yes | Must match transaction kind |
| Title | No | Short title, maximum 80 characters |
| Occurred date/time | Yes | Defaults to current time |
| Location | No | Captured asynchronously |
| Currency | Server-managed | One installation currency |
| Source | Server-managed | `manual` or `recurring` |

The MVP does not include a separate note or description field.

## 7.4 Categories

The user must be able to:

- Add an expense category
- Add an income category
- Rename a category
- Select an icon key
- Reorder categories
- Archive a category
- Restore an archived category

Archived categories:

- Remain visible on historical transactions.
- Remain included in historical dashboard results.
- Cannot be selected for new transactions.
- Cannot be hard-deleted through the UI.
- Cannot be archived while used by an active recurring rule.

The transaction entry screen must allow creating a category without leaving the entry flow.

## 7.5 Daily dashboard

The daily dashboard must show:

- Selected local date
- Income total
- Expense total
- Net total
- Transaction count
- Top expense categories for that day
- Transactions for that day
- Previous-day and next-day navigation
- Quick return to today
- Add transaction action

## 7.6 Monthly dashboard

The monthly dashboard must show:

- Selected month
- Income total
- Expense total
- Net total
- Transaction count
- Expense breakdown by category
- Income breakdown by category
- Daily expense and income series
- Monthly transaction list or a link to the filtered list
- Previous-month and next-month navigation
- Quick return to current month

## 7.7 Recurring items

The user must be able to:

- Create recurring income
- Create recurring expenses
- Edit a recurring rule
- Enable or disable a recurring rule
- Archive a recurring rule
- View pending occurrences
- Confirm an occurrence
- Edit one occurrence before confirming
- Skip one occurrence
- View the next 30 days of expected occurrences

Supported recurrence units:

```text
Every N weeks
Every N months
Every N years
```

Unsupported recurrence patterns:

- Daily
- Weekdays only
- Business-day adjustment
- Holiday adjustment
- Last Friday of the month
- Arbitrary cron expressions
- Multiple dates in one rule

## 7.8 Settings

The Settings area must include:

- Locale
- Timezone
- Theme
- Location capture preference
- Password change
- Revoke other sessions
- Application version
- Database health summary
- Backup status summary

The normal UI must not include:

- Database file upload
- Database file download
- Destructive “delete all data” action
- Migration controls
- CSV controls

---

# 8. Quick Transaction Entry Specification

This is the most important workflow in Simfiment.

## 8.1 Primary rule

Saving must never depend on title entry or location capture.

The required entry path is:

```text
Amount → Category → Save
```

## 8.2 Entry layout

Recommended mobile layout:

```text
Record transaction

[ Expense ] [ Income ]

Amount
NT$ [            ]

Recent categories
[ Food ] [ Transport ] [ Shopping ]
[ Home ] [ Subscription ] [ More ]

Title (optional)
[ e.g. Lunch, Uber, Rent             ]

Additional options
Date and time: Now
Location: Automatic / Off / Unavailable

[ Save transaction ]
```

## 8.3 Initial state

When opened:

- Kind defaults to `expense`.
- Amount is empty.
- No category is preselected.
- Title is empty.
- Date/time defaults to now.
- Location behavior follows user settings.
- Amount input receives focus.
- A fresh `clientRequestId` is generated.
- The entry form does not perform a page navigation.

Do not automatically select a category. Accidental classification is worse than requiring one category tap.

## 8.4 Amount input

Behavior:

- Use a native numeric input optimized for mobile.
- Set the appropriate `inputmode`.
- Accept exactly the configured currency exponent: 0, 2, or 3 decimal places.
- Ignore grouping separators while editing.
- Display formatted amount after blur where practical.
- Reject zero.
- Reject negative values.
- Kind determines whether the record is income or expense.
- Preserve keyboard entry on desktop.
- Pressing Enter submits only when all required fields are valid.

Do not implement a custom calculator keypad in the first iteration unless usability testing shows a concrete need.

## 8.5 Category selection

The picker should display:

1. Recently used categories for the selected kind.
2. Remaining active categories in configured order.
3. “Add category” action.

On kind change:

- Clear the selected category.
- Display categories for the new kind.
- Keep amount and title unchanged.

Inline category creation:

```text
Tap Add category
→ Enter category name
→ Optionally select icon
→ Create
→ New category becomes selected
→ Return to entry form
```

Do not navigate to the Settings page during this flow.

## 8.6 Optional title

UI label:

```text
Title (optional)
```

Rules:

- Maximum 80 Unicode characters.
- Trim leading and trailing whitespace.
- Whitespace-only input becomes an empty title.
- One line only.
- Do not autofocus the title field.
- Do not require title entry.
- Do not display “Untitled” for empty titles.

Transaction list rendering:

With title:

```text
Beef noodles
Food · 12:31                   −NT$ 180
```

Without title:

```text
Food
12:31                          −NT$ 180
```

Frontend fallback:

```ts
const primaryText = transaction.title || transaction.category.name;
```

## 8.7 Additional options

The date/time and location controls are secondary.

They must not visually compete with amount, category, and save.

The section can be collapsed by default, but the current values must be understandable.

Date/time behavior:

- Defaults to now.
- User may edit before saving.
- Manual transactions may be current or historical.
- Reject a manual transaction timestamp more than five minutes in the future to tolerate minor device clock skew without supporting scheduled manual transactions.
- Future financial items belong in recurring preview, not actual dashboards.
- Editing date/time changes dashboard grouping.
- Backend computes and stores the local date using the configured timezone.

## 8.8 Save behavior

The Save button is enabled only when:

- Amount is valid.
- Category is selected.
- No request is currently being submitted.

On save:

1. Submit immediately.
2. Do not wait for location.
3. Prevent double submission.
4. Close the entry surface after success.
5. Refresh affected day and month queries.
6. Show a brief success toast with Undo.
7. Keep the user on the same dashboard.
8. If location arrives later, attach it through a second request.

On failure:

- Keep all entered values.
- Show a clear error.
- Keep focus near the failed field when validation-related.
- Allow retry with the same `clientRequestId`.
- Server idempotency must return the originally created transaction if the first request succeeded but the response was lost.

## 8.9 Keyboard behavior

Desktop requirements:

- Global shortcut such as `N` may open entry when focus is not inside an input.
- Escape closes the entry surface if no submission is in progress.
- Enter submits when valid.
- Tab order follows visual order.
- Focus returns to the original trigger after closing.

Do not add many shortcuts in the MVP.

## 8.10 Undo behavior

After successful soft-delete:

```text
Transaction deleted. [Undo]
```

Requirements:

- Undo is available for at least five seconds.
- Undo calls the restore endpoint.
- The record remains recoverable after the toast disappears through direct transaction details during the MVP development environment, but no trash-management UI is required.
- Deleted transactions are excluded from dashboards and normal lists.
- Restored transactions return to dashboards immediately.

---

# 9. Location Capture Specification

Location capture is important, but speed and user control are more important.

## 9.1 Core rule

Location capture must be asynchronous and non-blocking.

The stored coordinates represent the **entry location**: where the user was when the transaction was recorded in Simfiment. They do not claim to be the merchant location, purchase location, or place where the income/expense originally occurred. The UI must label this data as “Entry location” or the localized equivalent, not “Purchase location.”

The transaction must save even when:

- Permission is denied.
- Position lookup times out.
- The browser does not support geolocation.
- The device has no GPS.
- The app is not in a secure context during development.
- Location accuracy is poor.
- The user dismisses the permission prompt.

## 9.2 Permission flow

Recommended onboarding behavior:

```text
Automatically attach your current location to new transactions?

[Enable location] [Not now]
```

When the user explicitly enables it:

1. Explain that coordinates are stored in Simfiment.
2. Request browser permission.
3. Record the resulting permission state.
4. Never repeatedly trigger prompts after denial.
5. Provide a Settings page where the user can retry after changing browser permissions.

Location must be off when the user chooses “Not now.”

## 9.3 Capture timing

When automatic location capture is enabled:

1. Start `getCurrentPosition()` when the entry surface opens.
2. Do not block form use.
3. If position is available before save, include it in the create request.
4. If position arrives after save, attach it with a second request.
5. If capture fails, mark the attempt as failed without changing the saved transaction.

Recommended initial browser options:

```ts
{
  enableHighAccuracy: false,
  timeout: 3000,
  maximumAge: 60000
}
```

These are initial values, not immutable product rules. Change them only after device testing.

## 9.4 Per-entry behavior

The entry surface shows a small status:

```text
Location: Ready
Location: Finding…
Location: Off
Location: Permission denied
Location: Unavailable
```

The user may disable location for the current transaction without disabling the global preference.

A retry from transaction details is available only for a manual transaction created within the previous five minutes. The new `capturedAt` value must be shown accurately.

Location state is secondary and must not move or disable the Save button.

## 9.5 Stored data

Location is captured for manual quick-entry transactions. Confirming a recurring occurrence does not automatically attach location in the MVP because confirmation may happen during later review and would not meaningfully describe the original financial event.

Store only:

- Latitude
- Longitude
- Accuracy in meters when provided
- Capture timestamp
- Source (`browser`)
- Transaction relation

Do not store in MVP:

- Continuous location history
- Altitude
- Heading
- Speed
- IP-derived location
- Automatically resolved street address
- External place IDs

## 9.6 Privacy requirements

Coordinates are sensitive financial metadata.

The application must:

- Never write coordinates to ordinary request logs.
- Never include coordinates in analytics.
- Never send coordinates to third-party services.
- Never embed third-party maps in the MVP.
- Allow removing location from an individual transaction.
- Clearly indicate whether location was attached.
- Require HTTPS in production.

## 9.7 Location states

Server-side states:

```text
none
pending
attached
failed
skipped
```

Meaning:

| State | Meaning |
|---|---|
| `none` | Location capture was globally disabled |
| `pending` | Transaction saved while capture was still in progress |
| `attached` | A location row exists |
| `failed` | Capture was attempted but failed |
| `skipped` | User disabled capture for this transaction |

When a transaction with `pending` location status is read or listed more than five minutes after creation, the backend opportunistically persists the state as `failed`.

---

# 10. Daily Dashboard Specification

## 10.1 Purpose

The daily dashboard answers:

- How much did I spend on this day?
- How much income did I receive?
- What is the net amount?
- What categories were responsible?
- What transactions happened?
- Which transactions have locations?

## 10.2 Layout

Recommended structure:

```text
Wednesday, August 5
[Previous] [Today] [Next]

Income      +NT$ 5,000
Expense     −NT$   480
Net         +NT$ 4,520

Transactions
12:31  Beef noodles    Food        −NT$ 180
15:20  MRT             Transport   −NT$  40
18:00  Contract work   Freelance   +NT$ 5,000
20:10  Dinner          Food        −NT$ 260

Expense distribution
Food        NT$ 440   92%  █████████
Transport   NT$  40    8%  █

[Record transaction]
```

## 10.3 Required data

Daily aggregate:

```ts
type DailyDashboard = {
  date: string;
  currencyCode: string;
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
    transactionCount: number;
  };
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
};
```

Transactions are fetched with the same date filter or included in the response if the implementation intentionally combines them.

## 10.4 Ordering

Transactions are ordered by:

```text
occurred_at descending
id descending
```

Category totals are ordered by:

```text
amount descending
category sort order
category name
```

## 10.5 Empty state

For a day with no transactions:

```text
No transactions for this day.

Record an income or expense to start tracking.
[Record transaction]
```

Do not show an error-looking empty state.

## 10.6 Deleted records

Soft-deleted transactions:

- Do not appear.
- Do not contribute to totals.
- Return immediately after restore.

## 10.7 Location indication

A transaction row may show a subtle location icon when location is attached.

The icon:

- Must have an accessible label such as “Entry location attached.”
- Must not expose coordinates in a hover-only interaction.
- Opens transaction details on activation.

---

# 11. Monthly Dashboard Specification

## 11.1 Purpose

The monthly dashboard answers:

- What are the total income, expense, and net values?
- Which categories account for spending?
- Which days have the most spending?
- How does income compare with expense?
- Which transactions occurred this month?

## 11.2 Layout

Recommended structure:

```text
August 2026
[Previous] [Current month] [Next]

Income      +NT$ 42,000
Expense     −NT$ 18,420
Net         +NT$ 23,580

Expense by category
Food         NT$ 6,240  47%  █████
Home         NT$ 5,000  37%  ████
Transport    NT$ 2,180  16%  ██

Daily activity
Aug 1         Income 0      Expense 320
Aug 2         Income 0      Expense 180
Aug 3         Income 0      Expense 920

Transactions
[Filtered monthly list]
```

## 11.3 Required data

```ts
type MonthlyDashboard = {
  month: string;
  currencyCode: string;
  totals: {
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
    transactionCount: number;
  };
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  dailySeries: Array<{
    date: string;
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
  }>;
};
```

## 11.4 Visualization rules

- Category comparison should use horizontal bars.
- Category bars represent the category's share of the same-kind total for the selected period.
- Category rows show the exact amount and a whole-number percentage; non-zero shares below one percent display as `<1%`.
- Category bars do not use a full-width progress track because they do not represent a budget or completion state.
- Do not use a pie chart as the primary category visualization.
- Charts must have textual values.
- Charts must not rely on color alone.
- Income and expense must use signs and labels in addition to semantic color.
- Daily series must provide an accessible table or list representation.
- Pending recurring occurrences are not included in actual totals.

## 11.5 Month boundaries

The backend derives month boundaries from the installation timezone.

The API accepts:

```text
YYYY-MM
```

The server computes:

```text
first local date of month
first local date of next month
```

Queries use stored local dates rather than browser-local assumptions.

---

# 12. Category Management Specification

## 12.1 Category kinds

A category belongs to exactly one kind:

```text
expense
income
```

The MVP does not support a `both` category.

## 12.2 Default categories

Suggested expense defaults:

- Food
- Transport
- Shopping
- Home
- Entertainment
- Health
- Education
- Subscription
- Other

Suggested income defaults:

- Salary
- Bonus
- Freelance
- Interest
- Refund
- Other

The production UI supports Traditional Chinese and English system labels, while the database stores the user-created display name. User-created names are never translated when the interface locale changes.

## 12.3 Create category

Required fields:

- Kind
- Name

Optional:

- Icon key

Rules:

- Trim whitespace.
- Name length: 1–30 Unicode characters.
- Exact active duplicate names within the same kind are rejected.
- Category creation must be available from transaction entry.
- Newly created inline category is automatically selected.

## 12.4 Rename category

Renaming a category:

- Changes its display name on historical records.
- Does not create a snapshot of the old category name.
- Does not modify transaction kind.
- Must preserve uniqueness rules.

This behavior is accepted because categories are classification entities, not immutable transaction text.

## 12.5 Archive category

Archive is allowed only when:

- Category is not already archived.
- Category is not used by an enabled recurring rule.
- At least one other active category remains for that kind.

Archiving does not change historical transactions.

## 12.6 Restore category

Restoring:

- Makes it selectable again.
- Places it at the end of the active category order unless the server preserves its prior order.
- Must reject a name conflict with another active category.

## 12.7 Reorder category

Reordering endpoint accepts the complete active category ID order for one kind.

Server must validate:

- Every active category for that kind appears exactly once.
- No archived category appears.
- No category from another kind appears.
- No duplicate ID appears.

The update occurs in one SQL transaction.

---

# 13. Recurring Income and Expense Specification

## 13.1 Model

A recurring rule is not itself a transaction.

```text
Recurring rule
→ Scheduled occurrence
→ User confirms occurrence
→ Actual transaction
```

Dashboard totals include only actual transactions.

## 13.2 Rule fields

| Field | Required | Notes |
|---|---:|---|
| Kind | Yes | Income or expense |
| Amount | Yes | Positive minor-unit integer |
| Category | Yes | Active and matching kind |
| Title | No | Maximum 80 characters |
| Start date | Yes | Date-only |
| Frequency | Yes | Weekly, monthly, yearly |
| Interval count | Yes | Integer from 1 to 100 |
| Enabled | Server-managed/default | Defaults to true |

## 13.3 Recurrence calculation

Occurrences must be calculated from the original anchor date and sequence number.

Correct:

```text
occurrence = start_date + sequence × interval
```

Incorrect:

```text
occurrence = previous_occurrence + interval
```

The incorrect method causes month-end drift.

Example:

```text
Start: 2026-01-31
Every: 1 month

Expected:
2026-01-31
2026-02-28
2026-03-31
2026-04-30
```

The March occurrence must return to the 31st.

Yearly leap-day example:

```text
Start: 2028-02-29
Every: 1 year

Expected:
2028-02-29
2029-02-28
2030-02-28
2031-02-28
2032-02-29
```

## 13.4 Occurrence generation

The MVP does not require cron.

The backend lazily ensures occurrences through the installation’s current local date when:

- The user logs in.
- The recurring page is opened.
- Pending occurrences are requested.
- A dashboard request requires recurring status.
- A recurring rule is created or edited.

Generation rules:

1. Load enabled, non-archived rules.
2. Calculate due dates from `next_sequence`.
3. Insert pending occurrence snapshots up to today.
4. Rely on `UNIQUE(rule_id, scheduled_on)` for duplicate protection.
5. Advance `next_sequence` and `next_due_on` in the same SQL transaction.
6. Stop at a safety limit to avoid an unbounded loop from corrupt data.

## 13.5 Occurrence snapshot

When generated, store a snapshot of:

- Kind
- Amount
- Currency
- Category
- Title
- Scheduled date

Changing the rule later must not change an existing pending occurrence.

## 13.6 Pending occurrence actions

### Confirm

Creates a transaction using the snapshot.

The transaction date defaults to the scheduled date, with a deterministic local time such as noon unless the user chooses an exact time. Recurring confirmation sets location status to `none`; it does not start browser geolocation in the MVP.

### Edit and confirm

User may change for this occurrence only:

- Amount
- Category
- Title
- Occurred date/time

The recurring rule remains unchanged.

### Skip

Marks the occurrence as skipped.

A skipped occurrence:

- Does not create a transaction.
- Does not affect dashboards.
- Cannot be confirmed later in the normal UI.

## 13.7 Atomic confirmation

Confirming must use one SQL transaction:

1. Verify occurrence is pending.
2. Verify category is valid.
3. Insert actual transaction.
4. Update occurrence status to confirmed.
5. Commit.

Concurrent confirmation attempts must create only one transaction.

## 13.8 Rule editing

Rule changes affect future, not-yet-generated occurrences.

Editing must not modify:

- Confirmed transactions
- Skipped occurrences
- Existing pending occurrence snapshots

For a material schedule change, recompute `next_sequence` and `next_due_on` from the new anchor, but do not generate a duplicate date already represented by an existing occurrence.

## 13.9 Upcoming preview

The recurring page should show expected items for the next 30 days.

Future preview:

- May be calculated on demand without inserting database rows.
- Must not affect dashboards.
- Must clearly be labeled as upcoming, not recorded.

---

# 14. Authentication and Setup Specification

## 14.1 Single identity model

There is one application identity.

Do not create a general multi-user domain model for the MVP.

A singleton authentication row stores:

- Password hash
- Password algorithm parameters in the encoded hash
- Password version
- Timestamps

## 14.2 One-time setup code

On an uninitialized database:

1. Server generates a cryptographically random one-time setup code.
2. Code is shown once in the server console or written to a protected setup file.
3. Setup API requires this code.
4. Successful setup invalidates it.
5. The database is marked initialized.
6. Future setup requests return a conflict or not-found response.

Do not expose an unauthenticated “first person wins” setup endpoint on a public server.

## 14.3 Password requirements

MVP policy:

- Minimum 12 Unicode characters.
- Maximum 128 Unicode characters.
- No forced uppercase, lowercase, digit, or symbol rules.
- Accept spaces and international characters.
- Never trim the password automatically.
- Never log passwords.
- Never return the password.
- Password confirmation is a frontend setup/change-password requirement.

## 14.4 Password storage

Use Argon2id.

Initial baseline:

```text
memory: at least 19 MiB
iterations: at least 2
parallelism: 1
salt: random per password
output: encoded PHC-style string
```

The implementation should benchmark on expected deployment hardware and target a login verification duration that is secure but does not create an easy denial-of-service condition.

Store algorithm and parameter information with the hash so parameters can be upgraded later.

## 14.5 Session model

Use opaque server-side sessions.

On login:

1. Verify password.
2. Generate at least 32 random bytes for the session token.
3. Store only a cryptographic hash of the session token.
4. Generate a session-bound CSRF token.
5. Set an HttpOnly session cookie.
6. Return session metadata and CSRF token to the frontend.

Do not use JWT.

## 14.6 Cookie

Production cookie:

```text
Name: __Host-simfiment_session
HttpOnly: true
Secure: true
SameSite: Strict
Path: /
Domain: not set
```

Development may use a separate non-`__Host-` cookie over localhost HTTP.

## 14.7 Session lifetime

Default:

```text
Absolute lifetime: 30 days
Idle refresh: optional, at most once per hour
```

The server must support:

- Current-session logout
- Revoke all other sessions
- Expiration cleanup
- Password-version invalidation after password change

## 14.8 Login rate limiting

Minimum behavior:

- Limit by source IP and installation identity.
- Introduce increasing delay after repeated failure.
- Return the same public error for wrong password and missing identity state where appropriate.
- Do not reveal hash timing details.
- Reset or reduce penalty after successful login.

Because this is a self-hosted single-user app, the implementation may start with an in-memory limiter, but limitations must be documented.

## 14.9 Password recovery

There is no email recovery.

Recovery is an administrative server operation:

```bash
simfiment auth reset
```

The command:

- Requires filesystem/server access.
- Sets a new password.
- Revokes all sessions.
- Increments password version.
- Does not delete financial data.

---

# 15. UX and Visual Design Requirements

## 15.1 UX principles

Every interface decision must follow these priorities:

1. Correctness
2. Fast transaction entry
3. Clear hierarchy
4. Mobile usability
5. Predictability
6. Accessibility
7. Visual polish

Do not optimize decorative presentation at the cost of entry speed.

## 15.2 Home page

The authenticated home page is Today, not a generic analytics landing page.

The primary action is always visible:

```text
Record transaction
```

## 15.3 One primary action per screen

Examples:

| Screen | Primary action |
|---|---|
| Today | Record transaction |
| Month | Change or inspect month |
| Recurring | Process pending occurrence |
| Categories | Add category |
| Settings | Context-dependent; no permanent dominant CTA |

## 15.4 Money presentation

Rules:

- Use tabular numerals.
- Use locale-aware grouping.
- Income includes `+`.
- Expense includes `−`.
- Do not rely on red/green alone.
- Keep currency presentation consistent.
- Never use floating-point arithmetic for stored money.
- Do not abbreviate amounts in transaction lists.
- Charts may abbreviate only with an accessible exact value.

Examples:

```text
−NT$ 1,200
+NT$ 42,000
```

## 15.5 Responsive behavior

### Mobile

- Bottom navigation.
- Transaction entry uses a bottom sheet or full-height dialog.
- One-column dashboards.
- Large touch targets.
- Sticky save action when necessary.
- Important actions reachable with one hand.

### Tablet

- Bottom navigation or compact sidebar.
- Content width constrained.
- Transaction dialog around 520 px wide.

### Desktop

- Fixed or persistent left navigation.
- Centered content.
- Transaction entry uses a modal dialog.
- Do not add extra analytics only because more space exists.

## 15.6 Loading states

Use:

- Skeletons for dashboard totals and lists.
- Disabled submit state during mutation.
- Small progress state for location.
- No full-page spinner after initial application boot unless unavoidable.

## 15.7 Error states

Every networked surface must have:

- Human-readable message
- Retry action where applicable
- Request ID for support/debugging
- No stack trace
- No raw SQL error
- No internal path

## 15.8 Empty states

Empty states must explain:

- What is empty
- Why the screen is still useful
- The next available action

Do not make empty states celebratory or judgmental about spending.

## 15.9 Motion

Use motion only for:

- Opening and closing entry surfaces
- Toast appearance
- List insertion/removal
- Date/month transitions

Respect `prefers-reduced-motion`.

Do not use:

- Confetti
- Gamified streaks
- Animated counting on every load
- Continuous gradient motion
- Financial “success” celebrations

## 15.10 Design tokens

Use CSS custom properties for:

- Backgrounds
- Surfaces
- Text
- Muted text
- Borders
- Focus ring
- Income semantic state
- Expense semantic state
- Danger
- Spacing
- Radius
- Shadows
- Typography

Do not hard-code one-off colors throughout components.

## 15.11 Spacing baseline

Recommended:

```text
Base unit: 4 px
Spacing: 4, 8, 12, 16, 24, 32, 48
Mobile horizontal page padding: 16 px
Desktop content max-width: approximately 960 px
Primary touch target goal: 44 × 44 CSS px
```

---

# 16. System Architecture

## 16.1 High-level architecture

```text
┌─────────────────────────────────────────┐
│ Browser                                 │
│                                         │
│ React + TypeScript                      │
│ - UI                                    │
│ - Forms                                 │
│ - Dashboard rendering                   │
│ - Browser geolocation                   │
│ - Session-aware API client              │
└───────────────────┬─────────────────────┘
                    │ HTTPS / JSON
                    │ Same origin
┌───────────────────▼─────────────────────┐
│ Go monolith                             │
│                                         │
│ - Static React file serving             │
│ - Authentication                        │
│ - Session management                    │
│ - Transaction service                   │
│ - Category service                      │
│ - Dashboard queries                     │
│ - Recurrence engine                     │
│ - Backup and health functions           │
└───────────────────┬─────────────────────┘
                    │ database/sql
┌───────────────────▼─────────────────────┐
│ SQLite                                  │
│                                         │
│ /data/simfiment.db                      │
└─────────────────────────────────────────┘
```

## 16.2 Deployment shape

Production:

```text
Reverse proxy / TLS
        │
        ▼
One Simfiment process
        │
        ▼
Local persistent disk
/data/simfiment.db
```

Do not run multiple replicas against one shared SQLite file.

## 16.3 Same-origin policy

Frontend and API are served from the same origin.

Examples:

```text
GET  /
GET  /assets/*
GET  /api/v1/dashboards/day
POST /api/v1/transactions
```

Benefits:

- No production CORS configuration.
- Simpler cookie authentication.
- Simpler CSRF origin validation.
- One deployable service.

## 16.4 Single-binary build

Production build:

1. Build React into static assets.
2. Copy or expose assets to a Go package.
3. Embed assets with `go:embed`.
4. Build one Go executable.
5. Serve the SPA and API from the executable.

The SQLite file remains external and persistent.

---

# 17. Backend Architecture

## 17.1 Technology baseline

Required baseline:

- Go current team-approved stable version
- `net/http`
- `log/slog`
- `database/sql`
- `modernc.org/sqlite` as the pure-Go SQLite driver
- `golang.org/x/crypto/argon2`
- Standard library JSON encoder/decoder
- Standard library `embed`
- Minimal dependencies

Version rules:

- Pin Go toolchain in `go.mod`.
- Commit `go.sum`.
- Do not use unpinned development snapshots.
- Upgrade dependencies in dedicated pull requests.

## 17.2 Architectural layers

```text
HTTP handler
    ↓
Service/domain logic
    ↓
Store/database
```

### Handler responsibility

Handlers may:

- Parse path/query/body.
- Validate basic request shape.
- Call service methods.
- Map typed errors to HTTP responses.
- Write JSON.

Handlers must not:

- Contain SQL.
- Implement recurrence calculations.
- Calculate dashboard totals.
- Hash passwords directly.
- Format UI strings.

### Service responsibility

Services may:

- Enforce business rules.
- Coordinate SQL transactions.
- Validate category-kind compatibility.
- Normalize title.
- Confirm recurring occurrences.
- Control soft-delete/restore.
- Compute recurrence dates.
- Decide location state transitions.

Services must not:

- Depend on React.
- Produce HTML.
- Write HTTP headers directly.
- Contain raw response-writing logic.

### Store responsibility

Stores may:

- Execute parameterized SQL.
- Scan rows.
- Return domain records.
- Participate in a transaction.
- Implement aggregate queries.

Stores must not:

- Return raw driver-specific errors above the store boundary.
- Decide user-facing messages.
- Perform HTTP authorization.

## 17.3 Request middleware

Recommended order:

```text
Request ID
→ Panic recovery
→ Security headers
→ Access logging
→ Body size limit
→ Origin validation
→ Session authentication
→ CSRF validation for mutations
→ Handler
```

Public endpoints bypass session middleware only when explicitly listed.

## 17.4 Public endpoints

Only:

```text
GET  /health/live
GET  /health/ready
GET  /api/v1/meta
POST /api/v1/setup
POST /api/v1/session
```

All other `/api/v1/*` endpoints require authentication.

## 17.5 Database transaction helper

Create a helper that accepts a function:

```go
func WithTx(
    ctx context.Context,
    db *sql.DB,
    opts *sql.TxOptions,
    fn func(*sql.Tx) error,
) error
```

Rules:

- Roll back on any error.
- Commit once.
- Preserve wrapped error context.
- Do not call `Commit` from nested store methods.
- Service coordinates the transaction boundary.

## 17.6 Time abstraction

Use an injectable clock interface for testability:

```go
type Clock interface {
    Now() time.Time
}
```

Production uses real time.

Tests use fixed time.

This is required for:

- Daily dashboard boundaries
- Month boundaries
- Session expiration
- Recurring occurrence generation
- Soft-delete timestamps
- Location pending cleanup

## 17.7 ID strategy

Use SQLite `INTEGER PRIMARY KEY` for database entities.

Use UUID strings only for client idempotency keys:

```text
clientRequestId
```

Do not expose sequential IDs as a security boundary. Authentication is still required for every resource.

## 17.8 JSON decoding

For request bodies:

- Limit body size.
- Require `Content-Type: application/json`.
- Disallow unknown fields.
- Reject trailing JSON.
- Return field-level validation errors.
- Use explicit request DTOs rather than decoding into database structs.

## 17.9 SPA serving

The Go server must:

- Serve hashed static assets with long-lived cache headers.
- Serve `index.html` with no-cache or short-cache headers.
- Fall back to `index.html` for known frontend routes.
- Return normal 404 for unknown API routes.
- Never return the SPA document for `/api/*`.

---

# 18. Frontend Architecture

## 18.1 Technology baseline

Required baseline:

- React
- TypeScript with strict mode
- Vite
- React Router
- TanStack Query
- Native Fetch API wrapper
- CSS Modules plus CSS custom properties
- Vitest
- React Testing Library
- Playwright for end-to-end tests

Do not add a global client-state library unless a reviewed requirement proves it necessary.

## 18.2 State ownership

Use:

| State | Owner |
|---|---|
| Server data | TanStack Query |
| Entry form | Local component state |
| Modal open/closed | Local or route state |
| Session metadata | Query + small auth context |
| Theme | Settings query + theme context |
| Location attempt | Entry feature hook |
| Dashboard date/month | URL |
| Toasts | Small app-level provider |

Do not copy server data into a separate global store.

## 18.3 Query keys

Recommended:

```ts
["meta"]
["session"]
["settings"]
["categories", kind]
["transaction", id]
["transactions", filters]
["dashboard", "day", date]
["dashboard", "month", month]
["recurring-rules", filters]
["recurring-occurrences", status]
["recurring-preview", from, to]
```

## 18.4 Mutation invalidation

Creating or editing a transaction invalidates:

- Affected daily dashboard
- Affected monthly dashboard
- Relevant transaction lists
- Transaction detail
- Recurring pending list when source is recurring

If a transaction date changes, invalidate both old and new day/month keys.

## 18.5 API client

Provide one wrapper:

```ts
api.get<T>()
api.post<TRequest, TResponse>()
api.patch<TRequest, TResponse>()
api.delete<TResponse>()
```

It must:

- Send `credentials: "include"`.
- Send `X-CSRF-Token` for mutations.
- Set JSON headers.
- Parse the standard error envelope.
- Expose request ID.
- Handle `401` centrally.
- Use `AbortController`.
- Avoid retrying non-idempotent mutations automatically.
- Permit TanStack Query to retry safe GET requests with a small limit.

## 18.6 Feature folders

Frontend code should be organized by feature, not by file type alone.

Example:

```text
features/transactions/
  api.ts
  types.ts
  TransactionEntry.tsx
  TransactionRow.tsx
  TransactionDetails.tsx
  useTransactionLocation.ts
  validation.ts
```

## 18.7 UI primitives

Create a small shared layer:

- Button
- IconButton
- Input
- Dialog
- BottomSheet
- Select
- Tabs
- Toast
- Skeleton
- EmptyState
- ErrorState
- MoneyText
- DateNavigator

Use accessible primitives where needed, but do not import a full admin dashboard template.

## 18.8 Date and money formatting

Use browser `Intl` APIs.

Rules:

- API timestamps use RFC 3339.
- API date-only values use `YYYY-MM-DD`.
- API month values use `YYYY-MM`.
- Stored amount remains integer minor units.
- UI formats based on the active interface locale and installation currency.
- The web interface locale is a per-browser preference supporting `zh-TW` and `en`; it follows the browser language on first use and is then stored locally.
- API errors honor `Accept-Language` and fall back to `zh-TW`.
- Frontend must not perform financial aggregation as the source of truth.

## 18.9 Form validation

Frontend validation improves UX, but backend validation is authoritative.

The frontend must:

- Show required fields.
- Prevent obvious invalid submission.
- Map backend field errors to fields.
- Keep unsaved values after failure.

## 18.10 Location hook

A dedicated hook/service manages:

- Permission query
- Capture start
- Timeout
- Cancel/ignore after unmount
- Location result
- Failure reason
- Late attachment after transaction creation

Do not mix geolocation logic directly into the visual component.

---

# 19. Domain Model

## 19.1 Terms

| Term | Meaning |
|---|---|
| Transaction | Confirmed income or expense included in dashboards |
| Kind | `income` or `expense` |
| Category | User-managed classification for one kind |
| Title | Optional short identifier for a transaction |
| Recurring rule | Template and schedule for future occurrences |
| Recurring occurrence | One scheduled instance of a recurring rule |
| Pending occurrence | Occurrence waiting for confirmation or skip |
| Local date | Date used for daily/monthly grouping |
| Location | Coordinates attached to one transaction |
| Soft delete | Marking a transaction deleted without removing its row |

## 19.2 Money

Use integer minor units.

Examples for TWD:

```text
NT$ 180     → 180
NT$ 12,050  → 12050
```

Examples for other exponents:

```text
USD 12.34   → 1234
KWD 12.345  → 12345
```

Domain type:

```go
type Money struct {
    AmountMinor int64
    Currency    string
}
```

Rules:

- Amount is always positive.
- Kind supplies financial direction.
- No floating-point arithmetic.
- Net is `income - expense`.
- JSON uses integer values within JavaScript’s safe integer range.

## 19.3 Time

Store:

- Exact occurrence instant in UTC milliseconds.
- Local date used for dashboard grouping.
- Timezone identifier used during normalization.

Example:

```text
occurred_at_utc_ms: 1785904260000
occurred_local_date: 2026-08-05
occurred_timezone: Asia/Taipei
```

When date/time is edited:

- Parse with the configured timezone.
- Recompute UTC instant.
- Recompute local date.
- Recompute dashboard invalidation targets.

## 19.4 Transaction title

Title is descriptive, not classificatory.

Examples:

| Title | Category |
|---|---|
| Beef noodles | Food |
| Uber home | Transport |
| August salary | Salary |
| TypeScript book | Education |

Dashboard grouping uses category, never title.

## 19.5 Soft deletion

A transaction is active when:

```sql
deleted_at IS NULL
```

All normal reads and aggregates must include that predicate.

Delete and restore are idempotent:

- Deleting an already deleted transaction returns its current state.
- Restoring an active transaction returns its current state.

## 19.6 State transitions

### Transaction deletion state

```text
active ──delete──> deleted
deleted ──restore──> active
```

There is no permanent-delete API in the MVP.

### Location state

```text
none
skipped

pending ──successful attach──> attached
pending ──capture failure────> failed
pending ──user cancels───────> skipped

failed ──eligible quick retry──> pending
attached ──remove location─────> skipped
```

Rules:

- A manual create request starts in `none`, `skipped`, `pending`, or `attached`.
- A source-recurring transaction starts in `none`.
- Only a manual transaction created within the previous five minutes can move from `failed` to `pending`.
- `attached` requires exactly one `transaction_locations` row.
- Removing an attached location sets `skipped`, not `none`, because the user made an explicit choice.

### Recurring occurrence state

```text
pending ──confirm──> confirmed
pending ──skip─────> skipped
```

There is no normal transition out of `confirmed` or `skipped`.

Deleting a transaction created from a confirmed occurrence does not return the occurrence to pending. Restoring the transaction restores its dashboard effect.


---

# 20. SQLite Database Design

## 20.1 Database policy

SQLite is the operational source of truth.

CSV is not part of the MVP.

The database file is:

```text
<data-dir>/simfiment.db
```

Use local persistent storage, not a network-mounted shared filesystem.

## 20.2 Connection initialization

At startup, explicitly configure and verify:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

For the MVP, prefer a conservative pool:

```go
db.SetMaxOpenConns(1)
db.SetMaxIdleConns(1)
```

This simplifies connection-specific pragma behavior and write locking for a single-user application. Revisit only after measurement.

## 20.3 Migration rules

- Migrations are forward-only.
- Migration files are embedded in the binary.
- Each migration has an integer version.
- Applied migrations are recorded with checksum.
- Migration runs before the HTTP server becomes ready.
- Migration is transactional where SQLite permits.
- A consistent backup is created before a destructive migration.
- Never edit an already released migration file.

## 20.4 Initial schema

The following DDL is a baseline. Engineers may split it into migration files, but behavior and constraints must remain equivalent.

```sql
CREATE TABLE schema_migrations (
    version     INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    checksum    TEXT NOT NULL,
    applied_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE app_settings (
    id                          INTEGER PRIMARY KEY CHECK (id = 1),
    initialized_at              INTEGER,
    currency_code               TEXT NOT NULL DEFAULT 'TWD'
                                CHECK (length(currency_code) = 3),
    currency_exponent           INTEGER NOT NULL DEFAULT 0
                                CHECK (currency_exponent BETWEEN 0 AND 3),
    timezone                    TEXT NOT NULL DEFAULT 'Asia/Taipei',
    locale                      TEXT NOT NULL DEFAULT 'zh-TW',
    theme                       TEXT NOT NULL DEFAULT 'system'
                                CHECK (theme IN ('system', 'light', 'dark')),
    automatic_location_enabled  INTEGER NOT NULL DEFAULT 0
                                CHECK (automatic_location_enabled IN (0, 1)),
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL
) STRICT;

CREATE TABLE auth_credentials (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash     TEXT NOT NULL,
    password_version  INTEGER NOT NULL DEFAULT 1,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
    id                INTEGER PRIMARY KEY,
    token_hash        BLOB NOT NULL UNIQUE,
    csrf_token_hash   BLOB NOT NULL,
    password_version  INTEGER NOT NULL,
    created_at        INTEGER NOT NULL,
    last_seen_at      INTEGER NOT NULL,
    expires_at        INTEGER NOT NULL,
    revoked_at        INTEGER
) STRICT;

CREATE INDEX sessions_expires_at_idx
    ON sessions(expires_at);

CREATE TABLE categories (
    id           INTEGER PRIMARY KEY,
    kind         TEXT NOT NULL
                 CHECK (kind IN ('expense', 'income')),
    name         TEXT NOT NULL
                 CHECK (length(name) BETWEEN 1 AND 30),
    icon_key     TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    archived_at  INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
) STRICT;

CREATE INDEX categories_kind_order_idx
    ON categories(kind, archived_at, sort_order, id);

CREATE TABLE recurring_rules (
    id                 INTEGER PRIMARY KEY,
    client_request_id  TEXT NOT NULL UNIQUE,
    kind               TEXT NOT NULL
                       CHECK (kind IN ('expense', 'income')),
    amount_minor       INTEGER NOT NULL
                       CHECK (amount_minor > 0),
    currency_code      TEXT NOT NULL
                       CHECK (length(currency_code) = 3),
    category_id        INTEGER NOT NULL,
    title              TEXT NOT NULL DEFAULT ''
                       CHECK (length(title) <= 80),
    frequency          TEXT NOT NULL
                       CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
    interval_count     INTEGER NOT NULL DEFAULT 1
                       CHECK (interval_count BETWEEN 1 AND 100),
    start_on           TEXT NOT NULL
                       CHECK (length(start_on) = 10),
    next_sequence      INTEGER NOT NULL DEFAULT 0
                       CHECK (next_sequence >= 0),
    next_due_on        TEXT NOT NULL
                       CHECK (length(next_due_on) = 10),
    enabled            INTEGER NOT NULL DEFAULT 1
                       CHECK (enabled IN (0, 1)),
    archived_at        INTEGER,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL,

    FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT
) STRICT;

CREATE INDEX recurring_rules_active_idx
    ON recurring_rules(enabled, archived_at, next_due_on);

CREATE TABLE recurring_occurrences (
    id                    INTEGER PRIMARY KEY,
    rule_id               INTEGER NOT NULL,
    scheduled_on          TEXT NOT NULL
                          CHECK (length(scheduled_on) = 10),
    status                TEXT NOT NULL
                          CHECK (status IN ('pending', 'confirmed', 'skipped')),

    kind_snapshot         TEXT NOT NULL
                          CHECK (kind_snapshot IN ('expense', 'income')),
    amount_minor_snapshot INTEGER NOT NULL
                          CHECK (amount_minor_snapshot > 0),
    currency_snapshot     TEXT NOT NULL
                          CHECK (length(currency_snapshot) = 3),
    category_id_snapshot  INTEGER NOT NULL,
    title_snapshot        TEXT NOT NULL DEFAULT ''
                          CHECK (length(title_snapshot) <= 80),

    created_at            INTEGER NOT NULL,
    updated_at            INTEGER NOT NULL,

    UNIQUE (rule_id, scheduled_on),

    FOREIGN KEY (rule_id)
        REFERENCES recurring_rules(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (category_id_snapshot)
        REFERENCES categories(id)
        ON DELETE RESTRICT
) STRICT;

CREATE INDEX recurring_occurrences_status_date_idx
    ON recurring_occurrences(status, scheduled_on, id);

CREATE TABLE transactions (
    id                       INTEGER PRIMARY KEY,
    client_request_id        TEXT NOT NULL UNIQUE,
    kind                     TEXT NOT NULL
                             CHECK (kind IN ('expense', 'income')),
    amount_minor             INTEGER NOT NULL
                             CHECK (amount_minor > 0),
    currency_code            TEXT NOT NULL
                             CHECK (length(currency_code) = 3),
    category_id              INTEGER NOT NULL,
    title                    TEXT NOT NULL DEFAULT ''
                             CHECK (length(title) <= 80),

    occurred_at_utc_ms       INTEGER NOT NULL,
    occurred_local_date      TEXT NOT NULL
                             CHECK (length(occurred_local_date) = 10),
    occurred_timezone        TEXT NOT NULL,

    source                   TEXT NOT NULL DEFAULT 'manual'
                             CHECK (source IN ('manual', 'recurring')),
    recurring_occurrence_id  INTEGER UNIQUE,

    location_status          TEXT NOT NULL DEFAULT 'none'
                             CHECK (
                               location_status IN (
                                 'none',
                                 'pending',
                                 'attached',
                                 'failed',
                                 'skipped'
                               )
                             ),

    deleted_at               INTEGER,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL,

    CHECK (
      (source = 'manual' AND recurring_occurrence_id IS NULL)
      OR
      (source = 'recurring' AND recurring_occurrence_id IS NOT NULL)
    ),

    FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT,

    FOREIGN KEY (recurring_occurrence_id)
        REFERENCES recurring_occurrences(id)
        ON DELETE RESTRICT
) STRICT;

CREATE INDEX transactions_active_date_idx
    ON transactions(occurred_local_date, occurred_at_utc_ms, id)
    WHERE deleted_at IS NULL;

CREATE INDEX transactions_active_category_idx
    ON transactions(category_id, occurred_local_date)
    WHERE deleted_at IS NULL;

CREATE INDEX transactions_active_kind_date_idx
    ON transactions(kind, occurred_local_date)
    WHERE deleted_at IS NULL;

CREATE TABLE transaction_locations (
    transaction_id  INTEGER PRIMARY KEY,
    latitude        REAL NOT NULL
                    CHECK (latitude BETWEEN -90.0 AND 90.0),
    longitude       REAL NOT NULL
                    CHECK (longitude BETWEEN -180.0 AND 180.0),
    accuracy_m      REAL
                    CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
    captured_at     INTEGER NOT NULL,
    source          TEXT NOT NULL DEFAULT 'browser'
                    CHECK (source IN ('browser')),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,

    FOREIGN KEY (transaction_id)
        REFERENCES transactions(id)
        ON DELETE CASCADE
) STRICT;
```

## 20.5 Application-level constraints

The service must enforce constraints not fully represented in DDL:

- Category kind must equal transaction kind.
- Category must be active for new manual transactions.
- If an occurrence snapshot category becomes archived before confirmation, direct confirmation returns `category_inactive`; the user must use edit-and-confirm with an active compatible category.
- Active category names must be unique within kind after trimming.
- At least one active category remains per kind.
- Active recurring rules prevent category archive.
- Attached location requires a location row.
- A location row requires `location_status = 'attached'`.
- Confirmed occurrence requires exactly one source-recurring transaction.
- Skipped occurrence must not have a source-recurring transaction.

## 20.6 Dashboard aggregate query example

```sql
SELECT
    COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_minor ELSE 0 END), 0)
        AS income_minor,
    COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_minor ELSE 0 END), 0)
        AS expense_minor,
    COUNT(*) AS transaction_count
FROM transactions
WHERE occurred_local_date = ?
  AND deleted_at IS NULL;
```

Net is computed as:

```text
income_minor - expense_minor
```

## 20.7 Category aggregate example

```sql
SELECT
    c.id,
    c.name,
    c.icon_key,
    SUM(t.amount_minor) AS amount_minor,
    COUNT(*) AS transaction_count
FROM transactions t
JOIN categories c ON c.id = t.category_id
WHERE t.kind = 'expense'
  AND t.occurred_local_date >= ?
  AND t.occurred_local_date < ?
  AND t.deleted_at IS NULL
GROUP BY c.id, c.name, c.icon_key
ORDER BY amount_minor DESC, c.sort_order ASC, c.name ASC;
```

## 20.8 Data integrity checks

Operational checks:

```sql
PRAGMA quick_check;
PRAGMA foreign_key_check;
```

Run:

- `quick_check` on startup or scheduled maintenance.
- `foreign_key_check` after migration and restore.
- Both in `simfiment doctor`.

---

# 21. HTTP API Specification

## 21.1 Conventions

Base path:

```text
/api/v1
```

Content type:

```text
application/json
```

Date formats:

```text
Date: YYYY-MM-DD
Month: YYYY-MM
Timestamp: RFC 3339 with offset or Z
```

Money:

```text
amountMinor: integer
currencyCode: ISO-style three-letter code
```

All authenticated requests use the session cookie.

All state-changing authenticated requests require:

```text
X-CSRF-Token: <token>
```

## 21.2 Standard success envelope

All JSON success responses use a top-level `data` property. Pagination or other response metadata uses an optional top-level `meta` property.

```json
{
  "data": {},
  "meta": {}
}
```

A `204 No Content` response has no JSON body.

## 21.3 Standard error envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are invalid.",
    "fields": {
      "amountMinor": "Amount must be greater than zero."
    },
    "requestId": "req_..."
  }
}
```

## 21.4 Meta and setup

### `GET /api/v1/meta`

Public.

Response:

```json
{
  "data": {
    "name": "Simfiment",
    "version": "0.1.0",
    "initialized": false,
    "defaultLocale": "zh-TW",
    "currencies": [
      { "code": "TWD", "exponent": 0 },
      { "code": "USD", "exponent": 2 },
      { "code": "KWD", "exponent": 3 }
    ]
  }
}
```

### `POST /api/v1/setup`

Public only before initialization.

Request:

```json
{
  "password": "a sufficiently long password",
  "timezone": "Asia/Taipei",
  "locale": "zh-TW",
  "currencyCode": "TWD",
  "automaticLocationEnabled": true
}
```

Response:

```json
{
  "data": {
    "authenticated": true,
    "csrfToken": "..."
  }
}
```

## 21.5 Session endpoints

### `POST /api/v1/session`

Request:

```json
{
  "password": "..."
}
```

Response:

```json
{
  "data": {
    "authenticated": true,
    "expiresAt": "2026-09-04T12:00:00Z",
    "csrfToken": "..."
  }
}
```

### `GET /api/v1/session`

The endpoint authenticates through the HttpOnly session cookie, generates a fresh CSRF token, replaces the stored CSRF-token hash for the current session, and returns the fresh plaintext token to the frontend. This allows a page reload to recover a usable CSRF token without exposing the session cookie.

Response:

```json
{
  "data": {
    "authenticated": true,
    "expiresAt": "2026-09-04T12:00:00Z",
    "csrfToken": "...",
    "settings": {
      "locale": "zh-TW",
      "timezone": "Asia/Taipei",
      "currencyCode": "TWD",
      "theme": "system",
      "automaticLocationEnabled": true
    }
  }
}
```

### `DELETE /api/v1/session`

Logs out current session.

Response status:

```text
204 No Content
```

### `PUT /api/v1/password`

Request:

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

Behavior:

- Verify current password.
- Update hash and password version.
- Keep or recreate current session.
- Revoke all other sessions.

### `POST /api/v1/sessions/revoke-others`

Revokes every session except current.

## 21.6 Settings endpoints

### `GET /api/v1/settings`

### `PATCH /api/v1/settings`

Request example:

```json
{
  "theme": "dark",
  "automaticLocationEnabled": false
}
```

Currency change example:

```json
{
  "currencyCode": "USD",
  "confirmCurrencyChange": true
}
```

Timezone behavior is fixed as follows:

- Timezone is configured during setup.
- A later change is allowed only after a warning and explicit confirmation.
- Existing stored local dates are not automatically regrouped.
- New and edited transactions use the new timezone.
- The UI explains that historical day/month grouping remains unchanged unless a transaction is edited.

Document this clearly in the UI.

Currency behavior is fixed as follows:

- Setup and Settings accept only a code returned by `GET /api/v1/meta`; the server derives the exponent.
- A later change requires an explicit confirmation dialog and never applies an exchange rate.
- The major-unit number is preserved. Increasing the exponent multiplies stored minor units; decreasing it truncates extra digits without rounding.
- Transactions, soft-deleted rows, recurring rules, and occurrence snapshots are rewritten atomically with their currency codes.
- The entire change is rejected if any amount would truncate to zero or exceed the maximum.

## 21.7 Category endpoints

### `GET /api/v1/categories?kind=expense&includeArchived=false`

### `POST /api/v1/categories`

Request:

```json
{
  "kind": "expense",
  "name": "Medical",
  "iconKey": "medical"
}
```

### `PATCH /api/v1/categories/{id}`

Request:

```json
{
  "name": "Healthcare",
  "iconKey": "medical"
}
```

### `POST /api/v1/categories/{id}/archive`

### `POST /api/v1/categories/{id}/restore`

### `PUT /api/v1/categories/order`

Request:

```json
{
  "kind": "expense",
  "orderedIds": [1, 5, 2, 3, 4]
}
```

## 21.8 Transaction endpoints

### `GET /api/v1/transactions`

Supported query parameters:

```text
from=YYYY-MM-DD
to=YYYY-MM-DD
kind=expense|income
categoryId=<integer>
q=<title/category search text>
limit=<integer>
cursor=<opaque cursor>
```

Date range convention:

```text
from inclusive
to exclusive
```

Example:

```text
GET /api/v1/transactions?from=2026-08-01&to=2026-09-01
```

### `POST /api/v1/transactions`

Request without title or location:

```json
{
  "clientRequestId": "898934c9-f75a-4d1d-9847-d127f288c39a",
  "kind": "expense",
  "amountMinor": 180,
  "categoryId": 1,
  "occurredAt": "2026-08-05T12:31:00+08:00",
  "title": "",
  "locationIntent": "none"
}
```

Request with immediate location:

```json
{
  "clientRequestId": "898934c9-f75a-4d1d-9847-d127f288c39a",
  "kind": "expense",
  "amountMinor": 180,
  "categoryId": 1,
  "occurredAt": "2026-08-05T12:31:00+08:00",
  "title": "Beef noodles",
  "locationIntent": "capture",
  "location": {
    "latitude": 25.033,
    "longitude": 121.5654,
    "accuracyM": 28.4,
    "capturedAt": "2026-08-05T12:30:58+08:00"
  }
}
```

`locationIntent` values:

```text
none
capture
skip
```

Server behavior:

- `none` → `location_status = none`
- `skip` → `location_status = skipped`
- `capture` with location → attach and set `attached`
- `capture` without location → set `pending`

Response:

```json
{
  "data": {
    "id": 42,
    "kind": "expense",
    "amountMinor": 180,
    "currencyCode": "TWD",
    "title": "Beef noodles",
    "category": {
      "id": 1,
      "name": "Food",
      "iconKey": "food"
    },
    "occurredAt": "2026-08-05T12:31:00+08:00",
    "occurredLocalDate": "2026-08-05",
    "source": "manual",
    "locationStatus": "attached",
    "location": {
      "latitude": 25.033,
      "longitude": 121.5654,
      "accuracyM": 28.4,
      "capturedAt": "2026-08-05T12:30:58+08:00"
    },
    "createdAt": "2026-08-05T04:31:01Z",
    "updatedAt": "2026-08-05T04:31:01Z"
  }
}
```

Idempotency:

- Repeating the same `clientRequestId` returns the same transaction.
- Reusing the same ID with materially different data returns `409 idempotency_conflict`.

### `GET /api/v1/transactions/{id}`

### `PATCH /api/v1/transactions/{id}`

Request may include:

```json
{
  "kind": "expense",
  "amountMinor": 220,
  "categoryId": 1,
  "title": "Dinner",
  "occurredAt": "2026-08-05T20:10:00+08:00"
}
```

If kind changes:

- Category must be changed to a compatible category in the same request.

### `DELETE /api/v1/transactions/{id}`

Soft-delete.

Response includes deletion timestamp.

### `POST /api/v1/transactions/{id}/restore`

Restores soft-deleted transaction.

## 21.9 Location endpoints

### `PUT /api/v1/transactions/{id}/location`

Request:

```json
{
  "latitude": 25.033,
  "longitude": 121.5654,
  "accuracyM": 28.4,
  "capturedAt": "2026-08-05T12:30:58+08:00"
}
```

Behavior:

- Upsert location.
- Set transaction status to `attached`.
- Reject deleted transaction unless product review allows it.
- Be idempotent for equal data.

### `POST /api/v1/transactions/{id}/location-failure`

Request:

```json
{
  "reason": "timeout"
}
```

Allowed reasons:

```text
permission_denied
position_unavailable
timeout
unsupported
unknown
```

Do not store browser error text.

Set status to `failed`.

### `DELETE /api/v1/transactions/{id}/location`

Remove location row and set state to `skipped`.

## 21.10 Dashboard endpoints

### `GET /api/v1/dashboards/day?date=2026-08-05`

Response:

```json
{
  "data": {
    "date": "2026-08-05",
    "currencyCode": "TWD",
    "totals": {
      "incomeMinor": 5000,
      "expenseMinor": 480,
      "netMinor": 4520,
      "transactionCount": 4
    },
    "expenseCategories": [
      {
        "categoryId": 1,
        "name": "Food",
        "iconKey": "food",
        "amountMinor": 440,
        "transactionCount": 2
      }
    ],
    "incomeCategories": []
  }
}
```

### `GET /api/v1/dashboards/month?month=2026-08`

Response:

```json
{
  "data": {
    "month": "2026-08",
    "currencyCode": "TWD",
    "totals": {
      "incomeMinor": 42000,
      "expenseMinor": 18420,
      "netMinor": 23580,
      "transactionCount": 47
    },
    "expenseCategories": [],
    "incomeCategories": [],
    "dailySeries": [
      {
        "date": "2026-08-01",
        "incomeMinor": 0,
        "expenseMinor": 320,
        "netMinor": -320
      }
    ]
  }
}
```

## 21.11 Recurring rule endpoints

### `GET /api/v1/recurring-rules?includeArchived=false`

### `POST /api/v1/recurring-rules`

Request:

```json
{
  "clientRequestId": "8e5c...",
  "kind": "expense",
  "amountMinor": 10000,
  "categoryId": 4,
  "title": "Rent",
  "frequency": "monthly",
  "intervalCount": 1,
  "startOn": "2026-08-05"
}
```

### `PATCH /api/v1/recurring-rules/{id}`

### `POST /api/v1/recurring-rules/{id}/enable`

### `POST /api/v1/recurring-rules/{id}/disable`

### `POST /api/v1/recurring-rules/{id}/archive`

## 21.12 Recurring occurrence endpoints

### `GET /api/v1/recurring-occurrences?status=pending`

This call ensures occurrences through current local date before returning.

### `GET /api/v1/recurring-preview?from=2026-08-05&to=2026-09-05`

Returns projected future items without counting them as transactions.

### `POST /api/v1/recurring-occurrences/{id}/confirm`

Without override:

```json
{}
```

With override:

```json
{
  "clientRequestId": "7f9b...",
  "amountMinor": 10350,
  "categoryId": 4,
  "title": "August rent",
  "occurredAt": "2026-08-06T09:00:00+08:00"
}
```

### `POST /api/v1/recurring-occurrences/{id}/skip`

Request:

```json
{}
```

## 21.13 Health endpoints

### `GET /health/live`

Indicates process is alive.

Must not query all business tables.

### `GET /health/ready`

Checks:

- Database available
- Migrations complete
- Required pragmas verified

Do not expose financial data or secrets.

---

# 22. Validation Rules

## 22.1 General string normalization

For title and category name:

- Validate UTF-8.
- Trim leading/trailing Unicode whitespace.
- Preserve internal whitespace.
- Do not silently remove ordinary characters.
- Do not HTML-sanitize stored text; safely escape at rendering.
- Reject control characters except permitted whitespace.

## 22.2 Transaction validation

| Field | Rule |
|---|---|
| `clientRequestId` | Valid UUID-like opaque string, maximum 64 chars |
| `kind` | `expense` or `income` |
| `amountMinor` | Integer, greater than 0, below configured maximum |
| `categoryId` | Existing active category matching kind |
| `title` | 0–80 Unicode characters after trim |
| `occurredAt` | Valid RFC 3339 timestamp |
| `location` | Coordinates in legal range |
| `accuracyM` | Null or non-negative finite number |

Recommended maximum:

```text
amountMinor <= 9,000,000,000,000
```

This stays inside JavaScript’s safe integer range.

## 22.3 Category validation

| Field | Rule |
|---|---|
| `kind` | Required on create; immutable afterward |
| `name` | 1–30 Unicode characters |
| `iconKey` | Empty or from the application icon allowlist |
| duplicate | No active exact duplicate within kind |

## 22.4 Recurring validation

- Start date must be a valid local date.
- Interval count is 1–100.
- Category matches kind.
- Category is active on rule creation.
- Title is 0–80 characters.
- Frequency is weekly/monthly/yearly.
- Safety limit prevents generating more than 1,000 occurrences in one operation.

## 22.5 Password validation

- 12–128 Unicode characters.
- No automatic trimming.
- No composition rule.
- New password must differ from current password.
- Password hash timing is benchmarked and recorded.

---

# 23. Error Handling

## 23.1 Error categories

Typed internal errors:

```text
ErrNotFound
ErrUnauthorized
ErrForbidden
ErrValidation
ErrConflict
ErrRateLimited
ErrUnavailable
ErrInternal
```

Domain-specific codes:

```text
invalid_credentials
not_initialized
already_initialized
category_kind_mismatch
category_in_use
category_name_conflict
last_active_category
transaction_deleted
idempotency_conflict
occurrence_not_pending
location_unavailable
invalid_date
```

## 23.2 HTTP mapping

| Condition | HTTP |
|---|---:|
| Invalid JSON | 400 |
| Authentication required | 401 |
| CSRF or origin failure | 403 |
| Resource not found | 404 |
| Conflict or invalid state transition | 409 |
| Field validation error | 422 |
| Rate limited | 429 |
| Unexpected internal error | 500 |
| Temporary database unavailable | 503 |

## 23.3 Internal errors

Server logs may contain:

- Wrapped operation
- Request ID
- Resource ID
- Safe driver error classification

Response must not contain:

- SQL
- Table names
- Filesystem path
- Stack trace
- Password hash
- Token
- Raw panic message

---

# 24. Security Requirements

## 24.1 Transport

Production requires HTTPS.

The application should normally run behind a trusted TLS reverse proxy.

Do not enable geolocation expectations on non-secure production origins.

## 24.2 Passwords

- Argon2id.
- Unique random salt.
- Encoded parameterized hash.
- No plaintext storage.
- No plaintext logging.
- Constant-time hash comparison where applicable.
- Rate-limit verification attempts.
- Rehash on successful login when parameters become outdated.

## 24.3 Sessions

- Opaque random token.
- At least 32 random bytes.
- Store token hash only.
- HttpOnly cookie.
- Secure cookie in production.
- SameSite Strict.
- Session expiration.
- Revocation.
- Password-version invalidation.
- Cleanup expired sessions.

## 24.4 CSRF

For every authenticated state-changing request:

- Validate Origin against configured base URL.
- Require a session-bound CSRF token header.
- Reject missing or mismatched token.
- Do not treat SameSite cookies as the only defense.

Safe methods:

```text
GET
HEAD
OPTIONS
```

must not mutate state.

## 24.5 CORS

Production API is same-origin.

Do not add permissive CORS headers.

If development uses separate Vite and Go origins, use Vite proxying so browser requests still appear same-origin from the frontend.

## 24.6 Security headers

At minimum:

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy
frame-ancestors 'none' through CSP
```

Suggested Permissions Policy:

```text
geolocation=(self)
camera=()
microphone=()
```

CSP must be tested with the production build and must not require `unsafe-eval`.

## 24.7 SQL injection

- All values use bound parameters.
- Never concatenate user input into SQL.
- Dynamic sort/filter choices use allowlisted fragments.
- Backup filenames are generated internally.
- Migration SQL is trusted embedded application code.

## 24.8 XSS

- Render user text as text, not HTML.
- Do not use `dangerouslySetInnerHTML` for titles or category names.
- Keep CSP restrictive.
- Validate icon keys against an allowlist.

## 24.9 Location data

- Do not log coordinates.
- Do not expose location through unauthenticated endpoints.
- Do not send location to third parties.
- Allow deletion.
- Keep database and backups protected at filesystem level.
- Make location capture opt-in during setup.

## 24.10 Filesystem permissions

Recommended:

```text
data directory: 0700
database file: 0600
backup files: 0600
setup secret file: 0600
```

## 24.11 Request limits

Recommended initial limits:

```text
JSON body: 64 KiB
Title: 80 characters
Category name: 30 characters
Search query: 100 characters
Page size: maximum 200
```

No file upload endpoints exist in the MVP.

---

# 25. Configuration

## 25.1 Environment variables

```text
SIMFIMENT_ADDR=:8080
SIMFIMENT_DATA_DIR=/data
SIMFIMENT_BASE_URL=https://finance.example.com
SIMFIMENT_LOG_LEVEL=info
SIMFIMENT_SECURE_COOKIES=true
SIMFIMENT_SESSION_DAYS=30
SIMFIMENT_TRUSTED_PROXY_COUNT=0
```

Optional tuning:

```text
SIMFIMENT_ARGON2_MEMORY_KIB=19456
SIMFIMENT_ARGON2_ITERATIONS=2
SIMFIMENT_ARGON2_PARALLELISM=1
```

## 25.2 Configuration precedence

Recommended:

```text
CLI flags
→ environment variables
→ application defaults
```

Financial user settings remain in SQLite.

Secrets must not be accepted through URL query parameters except the one-time setup UI may read a setup code from the fragment portion and immediately remove it from visible history.

## 25.3 Startup validation

Startup must fail with a clear error when:

- Data directory cannot be created.
- Database cannot be opened.
- Base URL is invalid.
- Secure cookies are disabled for a non-development HTTPS deployment.
- Migration fails.
- Foreign keys cannot be enabled.
- Required embedded frontend assets are missing in production mode.

---

# 26. Deployment and Operations

## 26.1 Production deployment

Recommended container structure:

```text
/app/simfiment
/data/simfiment.db
/data/backups/
```

Docker or equivalent:

- One replica.
- Persistent `/data` volume.
- Read-only application filesystem where practical.
- Non-root user.
- Health checks configured.
- TLS terminated at trusted reverse proxy.

## 26.2 Static frontend

The production executable embeds the React build.

There is no independent frontend deployment.

## 26.3 SQLite limitation

Do not:

- Place active database on NFS or generic shared network storage.
- Mount the same database file into multiple app replicas.
- Scale horizontally without changing database architecture.
- copy only `simfiment.db` from an active WAL database as a casual backup.

## 26.4 Graceful shutdown

On SIGTERM/SIGINT:

1. Stop accepting new requests.
2. Wait for in-flight requests with timeout.
3. Close HTTP server.
4. Close database.
5. Exit with clear status.

## 26.5 CLI commands

Recommended:

```bash
simfiment serve
simfiment migrate status
simfiment backup create
simfiment backup restore <file>
simfiment auth reset
simfiment doctor
simfiment version
```

---

# 27. Backup and Restore

CSV import/export is out of scope, but operational backup is mandatory.

## 27.1 Backup requirements

- Create a consistent SQLite snapshot.
- Do not raw-copy an active database without handling WAL correctly.
- Use a driver-supported online backup mechanism or tested `VACUUM INTO` strategy.
- Write to a temporary file first.
- Verify backup.
- Atomically rename into final backup path.
- Use restrictive file permissions.

Filename:

```text
simfiment-2026-08-05T120000Z.db
```

## 27.2 Backup schedule

Recommended baseline:

- Before every schema migration that can modify existing data.
- Daily automatic snapshot.
- Keep last 7 daily backups.
- Keep last 4 weekly backups.

Automatic backup scheduling is a deployment responsibility in the MVP.

Use an external scheduler such as cron, a systemd timer, or the hosting platform scheduler to invoke:

```bash
simfiment backup create
```

The application itself does not run an internal daily-backup scheduler in the MVP.

## 27.3 Restore requirements

Restore requires the server to be stopped or placed in maintenance mode.

Steps:

1. Verify backup file exists.
2. Open backup read-only.
3. Run `PRAGMA quick_check`.
4. Preserve current database as emergency rollback copy.
5. Replace database.
6. Run migrations.
7. Run `PRAGMA foreign_key_check`.
8. Start server.
9. Verify readiness endpoint.

## 27.4 Backup status

Settings must display a backup summary derived from the configured backup directory:

- Last successful backup time
- Number of retained backups

Backup failures remain visible in operational logs and the CLI exit status.

It must not provide a database download button in MVP.

---

# 28. Logging and Observability

## 28.1 Structured logs

Use `log/slog`.

Recommended fields:

```text
timestamp
level
message
request_id
method
route
status
duration_ms
authenticated
resource_type
resource_id
error_code
```

## 28.2 Forbidden log data

Never log:

- Password
- Password hash
- Session token
- CSRF token
- Setup code after initial one-time display
- Full request body
- Full transaction title by default
- Latitude
- Longitude
- Database contents

## 28.3 Request IDs

- Accept a safe upstream request ID only from a trusted proxy, or generate one.
- Return it in a response header.
- Include it in error responses.
- Include it in logs.

Suggested header:

```text
X-Request-ID
```

## 28.4 Metrics

Metrics are optional for MVP.

At minimum, logs should make it possible to determine:

- Request latency
- HTTP error rates
- Login failures
- Database busy errors
- Backup failures
- Migration failures
- Location attach failures without coordinates

## 28.5 Health

Readiness must fail when the database cannot be queried.

Liveness should not fail due to one slow dashboard query.

---

# 29. Testing Strategy

## 29.1 Backend unit tests

Required areas:

- Money validation
- Title normalization
- Category normalization
- Date parsing
- Local-date derivation
- Recurrence calculation
- Month-end clamping
- Leap-year behavior
- Session expiration
- Password verification
- Location state transitions

## 29.2 Recurrence test cases

At minimum:

```text
2026-01-31 monthly
→ 2026-02-28
→ 2026-03-31
→ 2026-04-30

2028-02-29 yearly
→ 2029-02-28
→ 2030-02-28
→ 2031-02-28
→ 2032-02-29

Every 2 weeks
Every 3 months
Disabled rule creates no occurrences
Archived rule creates no occurrences
Past start date catches up through today
Concurrent generation creates no duplicates
Existing pending snapshot does not change after rule edit
Concurrent confirmation creates one transaction
```

## 29.3 Database integration tests

Each test uses a temporary SQLite database.

Required:

- Fresh migration.
- Upgrade migration.
- Foreign-key enforcement.
- STRICT constraint behavior.
- Soft-delete exclusion from aggregate.
- Restore inclusion in aggregate.
- Archived category preserved historically.
- Category-kind mismatch rejected.
- Active recurring rule blocks category archive.
- Duplicate `client_request_id` is idempotent.
- Different payload with same key conflicts.
- Confirm occurrence is atomic.
- Transaction rollback leaves no partial state.
- Location attach updates status and row atomically.

## 29.4 HTTP tests

Use `httptest`.

Required:

- Unauthenticated protected request returns 401.
- Wrong CSRF token returns 403.
- Wrong Origin returns 403.
- Unknown JSON field rejected.
- Oversized body rejected.
- Invalid amount returns 422.
- Invalid date returns 422.
- Category-kind mismatch returns 422.
- Duplicate create request returns original transaction.
- Password change revokes old sessions.
- Setup cannot run twice.
- Login rate limit activates.
- Internal database errors do not leak details.

## 29.5 Frontend unit/component tests

Required components:

- Amount input
- Kind switch
- Category picker
- Inline category creation
- Optional title
- Transaction entry surface
- Date navigator
- Dashboard summary
- Transaction row
- Undo toast
- Recurring confirmation
- Location status component

Required scenarios:

- Zero amount cannot save.
- Empty title can save.
- Whitespace title becomes empty.
- Switching kind clears category.
- Inline-created category becomes selected.
- Form values remain after API error.
- Double click sends one logical transaction.
- Location pending does not disable Save.
- Permission denial does not block save.
- Empty title uses category as primary row text.
- Focus is trapped and restored correctly.

## 29.6 End-to-end tests

Use Playwright.

Critical path:

1. Initialize a fresh installation.
2. Log in.
3. Create expense without title.
4. Verify daily total.
5. Create expense with title.
6. Create income.
7. Verify daily net.
8. Verify monthly totals.
9. Add a custom category inline.
10. Use the new category.
11. Edit a transaction.
12. Delete and undo.
13. Attach location with mocked geolocation.
14. Deny location and still save.
15. Create recurring expense.
16. Generate and confirm occurrence.
17. Skip another occurrence.
18. Change password.
19. Verify old session invalidation.
20. Log out and verify protected route behavior.

## 29.7 Accessibility tests

- Automated axe scan for primary pages.
- Keyboard-only critical flow.
- Screen-reader label review.
- Reduced-motion check.
- 320 px viewport check.
- 200% text zoom check.
- Contrast check.

Automated checks do not replace manual review.

## 29.8 Backup tests

- Create backup while server is running.
- Verify backup integrity.
- Restore into a fresh data directory.
- Run migrations after restore.
- Compare transaction and category counts.
- Verify dashboards after restore.

---

# 30. Performance Requirements

These are engineering targets, not hard contractual guarantees.

## 30.1 Frontend

On a mid-range mobile device and normal network:

- Initial authenticated shell usable within approximately 2.5 seconds.
- Entry surface opens within 100 ms after interaction.
- Amount typing has no visible lag.
- Category selection responds immediately.
- Dashboard navigation uses cached prior data where safe.
- No unnecessary full-page reloads.

## 30.2 API

On the intended single-user deployment:

- Transaction create p95 under 300 ms excluding password hashing.
- Daily dashboard p95 under 300 ms.
- Monthly dashboard p95 under 500 ms for up to 100,000 transactions.
- Login hash verification intentionally slower and separately measured.
- Location attachment p95 under 300 ms after coordinates are available.

## 30.3 Database

- Required date/category indexes exist.
- Dashboard aggregation occurs in SQL.
- Frontend does not download all transactions to calculate totals.
- Query plans are inspected for dashboard queries.
- Avoid N+1 category queries.

---

# 31. Accessibility Requirements

Target WCAG 2.2 AA behavior.

Required:

- All functionality keyboard accessible.
- Visible focus styles.
- Real labels for inputs.
- Programmatic error association.
- Dialog focus trap.
- Focus return after dialog close.
- Escape closes non-destructive overlays.
- Icon-only buttons have accessible names.
- Income/expense meaning not conveyed by color alone.
- Charts have textual equivalents.
- Touch targets should normally be at least 44 × 44 CSS px.
- Support `prefers-reduced-motion`.
- Support browser text zoom.
- Avoid horizontal scrolling at 320 px viewport width.
- Do not require drag-and-drop; reorder has button or keyboard alternative.

For transaction entry:

- Announce save success.
- Announce validation errors.
- Location status updates should not repeatedly interrupt screen readers.
- Save remains reachable and labeled.

---

# 32. Repository Structure

```text
simfiment/
├── cmd/
│   └── simfiment/
│       └── main.go
│
├── internal/
│   ├── app/
│   │   ├── app.go
│   │   ├── config.go
│   │   └── clock.go
│   │
│   ├── httpapi/
│   │   ├── router.go
│   │   ├── middleware.go
│   │   ├── json.go
│   │   ├── errors.go
│   │   └── security_headers.go
│   │
│   ├── auth/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── store.go
│   │   ├── password.go
│   │   ├── session.go
│   │   └── limiter.go
│   │
│   ├── settings/
│   │   ├── handler.go
│   │   ├── service.go
│   │   └── store.go
│   │
│   ├── category/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── store.go
│   │   └── model.go
│   │
│   ├── transaction/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── store.go
│   │   ├── model.go
│   │   └── location.go
│   │
│   ├── dashboard/
│   │   ├── handler.go
│   │   ├── service.go
│   │   └── store.go
│   │
│   ├── recurring/
│   │   ├── handler.go
│   │   ├── service.go
│   │   ├── store.go
│   │   ├── model.go
│   │   └── schedule.go
│   │
│   ├── database/
│   │   ├── open.go
│   │   ├── migrate.go
│   │   ├── tx.go
│   │   ├── backup.go
│   │   └── health.go
│   │
│   └── static/
│       └── static.go
│
├── migrations/
│   ├── 001_initial.sql
│   └── 002_example_future.sql
│
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── router.tsx
│   │   │   ├── providers.tsx
│   │   │   └── queryClient.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── errors.ts
│   │   │   └── types.ts
│   │   ├── components/
│   │   │   ├── Button/
│   │   │   ├── Dialog/
│   │   │   ├── Toast/
│   │   │   ├── MoneyText/
│   │   │   └── DateNavigator/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── settings/
│   │   │   ├── categories/
│   │   │   ├── transactions/
│   │   │   ├── dashboards/
│   │   │   └── recurring/
│   │   ├── routes/
│   │   ├── styles/
│   │   │   ├── tokens.css
│   │   │   ├── global.css
│   │   │   └── utilities.css
│   │   ├── test/
│   │   └── main.tsx
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── e2e/
├── docs/
│   ├── product-spec.md
│   ├── api.md
│   ├── operations.md
│   └── adr/
│       ├── 0001-go-monolith.md
│       ├── 0002-sqlite.md
│       ├── 0003-server-sessions.md
│       ├── 0004-non-blocking-location.md
│       └── 0005-single-currency.md
│
├── Dockerfile
├── compose.yaml
├── Makefile
├── go.mod
├── go.sum
├── README.md
└── LICENSE
```

---

# 33. Coding Standards

## 33.1 General

- Prefer clear code over clever abstraction.
- Keep functions focused.
- Avoid speculative generic frameworks.
- Add abstractions after repeated real use.
- Every exported Go identifier has a useful comment.
- TypeScript strict mode remains enabled.
- No ignored type errors.
- No commented-out production code.
- No TODO without an issue or explanation.

## 33.2 Go

- Run `gofmt`.
- Pass `go vet`.
- Wrap errors with operation context.
- Use `context.Context` for request/database calls.
- Do not store request context in structs.
- Use parameterized SQL.
- Close rows and check row iteration errors.
- Keep domain validation out of handlers.
- Avoid package names such as `utils` or `common`.
- Use typed errors and `errors.Is`/`errors.As`.
- Do not panic for normal errors.
- Use `int64` for money and timestamps.
- Use explicit DTO mapping.

## 33.3 React and TypeScript

- Use function components.
- Keep server state in TanStack Query.
- Avoid `any`.
- Prefer discriminated unions for state.
- Keep effects narrow and cancellable.
- Do not compute dashboard totals from transaction lists.
- Do not use index as key for persistent list entities.
- Keep form submission idempotency key stable across retries.
- Escape all user-provided text through normal React rendering.
- Use semantic HTML before custom ARIA.
- Keep visual components separate from API hooks where practical.

## 33.4 SQL

- Write explicit column lists.
- Avoid `SELECT *`.
- Include `deleted_at IS NULL` in active transaction queries.
- Add indexes for real query patterns.
- Document non-obvious queries.
- Test migrations on populated databases.
- Never rely on SQLite foreign keys being enabled by default.
- Treat every multi-step state change as transactional.

## 33.5 Pull requests

Each PR must include:

- Problem statement
- Scope
- Screenshots for UI changes
- Test evidence
- Migration notes
- Security/privacy impact
- Follow-up issues explicitly out of scope

Large vertical slices should be split, but do not merge half-connected API/UI behavior that leaves the main branch unusable.

---

# 34. Implementation Milestones

## Milestone 0: Project foundation and specification lock

Deliverables:

- Repository initialized
- This specification committed
- README
- ADRs
- Go and Node toolchains pinned
- CI skeleton
- Initial wireframes
- API error conventions

Exit criteria:

- Team can explain MVP scope.
- No open ambiguity about transaction fields.
- No CSV work exists.
- Location is understood as non-blocking.

## Milestone 1: Runtime foundation

Backend:

- Go server
- Config loading
- Structured logging
- Request IDs
- Health endpoints
- SQLite open and migration runner
- Frontend static embedding

Frontend:

- Vite React app
- Router
- App shell
- Query provider
- Error boundary
- Base design tokens

Exit criteria:

```text
One command starts a working development stack.
One production binary serves the React app and API.
Fresh database migrates automatically.
```

## Milestone 2: Setup and authentication

Implement:

- Setup code generation
- Setup UI
- Default settings
- Default categories
- Argon2id password hashing
- Login/logout
- Session cookie
- CSRF
- Protected routes
- Password change
- Session revocation

Exit criteria:

- Uninitialized app can be securely initialized.
- Setup cannot run twice.
- Unauthenticated user cannot read finance data.
- Password change invalidates old sessions.

## Milestone 3: Categories

Implement:

- List categories
- Add category
- Rename category
- Reorder
- Archive/restore
- Inline category creation component

Exit criteria:

- Expense and income categories are separate.
- New inline category is immediately selectable.
- Historical category references remain valid.
- Invalid archive operations are blocked.

## Milestone 4: Quick transaction entry and Today

Implement:

- Transaction create API
- Idempotency
- Transaction entry UI
- Optional title
- Date/time default
- Daily dashboard aggregates
- Daily transaction list
- Transaction detail
- Edit
- Soft-delete
- Undo restore

Exit criteria:

- Normal transaction requires amount, category, save.
- Empty title works.
- User remains on dashboard after save.
- Duplicate click does not create duplicate transaction.
- Daily totals remain correct after edit/delete/restore.

This is the first product-quality vertical slice and should be completed before advanced charts or recurrence.

## Milestone 5: Location

Implement:

- Setup/settings location preference
- Browser permission handling
- Non-blocking capture hook
- Immediate location create path
- Late location attachment
- Failure state
- Remove location
- Location indicator in transaction details

Exit criteria:

- Save never waits for location.
- Denied location does not break entry.
- Coordinates never appear in ordinary logs.
- Attached location persists after reload.
- User can remove location.

## Milestone 6: Monthly dashboard

Implement:

- Month routing
- Monthly aggregate endpoint
- Category breakdown
- Daily series
- Monthly transaction filtering
- Accessible visualizations

Exit criteria:

- Totals match transaction source of truth.
- Month boundaries use configured timezone.
- Empty months render correctly.
- Cross-year navigation works.

## Milestone 7: Recurring income and expenses

Implement:

- Recurring rule CRUD
- Anchor-based schedule calculation
- Lazy generation
- Pending occurrence UI
- Confirm
- Edit and confirm
- Skip
- Upcoming 30-day preview

Exit criteria:

- Month-end dates do not drift.
- Duplicate occurrences cannot be created.
- Rule edits do not mutate snapshots.
- Confirmation is atomic.
- Pending items are excluded from dashboards.

## Milestone 8: Operations and hardening

Implement:

- Backup create/restore
- Doctor command
- Migration backup
- Security headers
- Rate limiting
- Session cleanup
- Location pending cleanup
- Production Docker image
- Operations documentation

Exit criteria:

- Backup can be restored in a clean environment.
- Health checks work.
- Production runs as non-root.
- No known critical security issue remains.

## Milestone 9: UX and release candidate

Implement:

- Full loading/empty/error states
- Keyboard review
- Screen-reader review
- Mobile polish
- Desktop polish
- Dark theme
- Reduced motion
- E2E suite
- Performance review
- Upgrade test
- Release documentation

Exit criteria:

- All MVP acceptance criteria pass.
- Critical E2E path is stable.
- Backup restore is tested.
- No scope item remains partially exposed.

---

# 35. Definition of Done

A task is done only when all applicable items are true:

- Behavior matches this specification.
- Backend validation exists.
- Frontend UX exists.
- Loading state exists.
- Empty state exists where applicable.
- Error state exists.
- Keyboard behavior is verified.
- Mobile layout is verified.
- Tests cover success and important failure paths.
- No sensitive data is logged.
- API documentation is updated.
- Migration is included if data shape changed.
- Migration was tested on existing data.
- Query invalidation is correct.
- No unrelated scope was added.
- CI passes.
- Reviewer can reproduce behavior.

---

# 36. MVP Acceptance Criteria

## 36.1 Setup and authentication

- [ ] Fresh installation displays setup flow.
- [ ] Setup requires the one-time code.
- [ ] Setup inserts default categories.
- [ ] Setup code cannot be reused.
- [ ] Password is stored only as Argon2id hash.
- [ ] Login creates a server-side session.
- [ ] Protected endpoints reject unauthenticated access.
- [ ] Logout invalidates current session.
- [ ] Password change revokes other sessions.
- [ ] CLI password reset preserves finance data.

## 36.2 Quick transaction entry

- [ ] Add action is available from every authenticated primary page.
- [ ] Expense is selected by default.
- [ ] Amount input receives focus.
- [ ] Amount is required.
- [ ] Category is required.
- [ ] Title is optional.
- [ ] Empty title saves successfully.
- [ ] Date/time defaults to now.
- [ ] Save does not wait for location.
- [ ] Successful save returns user to the same dashboard.
- [ ] Duplicate submission creates one transaction.
- [ ] Transaction appears on the correct local date.
- [ ] Delete removes transaction from totals.
- [ ] Undo restores it.

## 36.3 Categories

- [ ] User can add expense category.
- [ ] User can add income category.
- [ ] User can add category inside entry flow.
- [ ] New inline category is selected automatically.
- [ ] User can rename category.
- [ ] User can reorder categories.
- [ ] User can archive category.
- [ ] Historical transactions retain archived category.
- [ ] Active recurring rule blocks category archive.
- [ ] At least one active category remains for each kind.

## 36.4 Daily dashboard

- [ ] Shows selected date.
- [ ] Shows income, expense, net, count.
- [ ] Shows category breakdown.
- [ ] Shows day transactions.
- [ ] Previous/next navigation works.
- [ ] Empty day state works.
- [ ] Edit/delete/restore immediately affects totals.

## 36.5 Monthly dashboard

- [ ] Shows selected month.
- [ ] Shows income, expense, net, count.
- [ ] Shows expense category breakdown.
- [ ] Shows income category breakdown.
- [ ] Shows daily series.
- [ ] Month navigation works across years.
- [ ] Pending recurring items are excluded.
- [ ] Soft-deleted transactions are excluded.

## 36.6 Location

- [ ] User explicitly enables or declines location.
- [ ] Browser permission state is handled.
- [ ] Capture starts without blocking form entry.
- [ ] Transaction saves when location fails.
- [ ] Late location attaches to the correct transaction.
- [ ] User can remove location.
- [ ] Coordinates are not logged.
- [ ] Production documentation requires HTTPS.

## 36.7 Recurring

- [ ] User can create recurring expense.
- [ ] User can create recurring income.
- [ ] Weekly, monthly, yearly intervals work.
- [ ] Month-end calculation does not drift.
- [ ] Leap-year calculation is correct.
- [ ] Pending occurrence is generated once.
- [ ] Confirm creates one actual transaction.
- [ ] Edit-and-confirm affects only that occurrence.
- [ ] Skip creates no transaction.
- [ ] Rule edit does not mutate existing snapshots.
- [ ] Upcoming preview is not counted in dashboards.

## 36.8 Operations

- [ ] Single production binary serves API and React.
- [ ] SQLite is stored in persistent data directory.
- [ ] Foreign keys are explicitly enabled.
- [ ] Migration runner works.
- [ ] Backup creates consistent snapshot.
- [ ] Restore works in clean environment.
- [ ] Health endpoints work.
- [ ] Graceful shutdown works.
- [ ] Production container runs one replica.

---

# 37. Deferred Features

Do not implement these unless a later approved milestone adds them:

## Data portability

- CSV import
- CSV export
- JSON export
- User-facing database download
- User-facing database upload

## Financial modeling

- Accounts
- Transfers
- Balances
- Credit cards
- Budgets
- Savings goals
- Debt
- Assets
- Investments
- Currency conversion

## Collaboration

- Multiple users
- Household sharing
- Roles
- Permissions
- Public links

## Automation

- Bank integrations
- Receipt OCR
- AI categorization
- Email parsing
- Webhooks
- Public API

## Location enhancements

- Reverse geocoding
- Place names
- Maps
- Geofencing
- Location-based auto-categorization
- Continuous tracking

## Platform

- Native iOS
- Native Android
- Offline mutation queue
- Cross-device local-first synchronization

---

# 38. Engineering Decision Log

The following decisions should be represented as ADRs.

## ADR-0001: Go monolith

Decision:

- One Go process handles API and static frontend.

Reason:

- Simplifies deployment and authentication.
- Keeps scope appropriate for a single-user product.

## ADR-0002: SQLite source of truth

Decision:

- SQLite is the operational database.

Reason:

- Simple deployment.
- Strong enough for single-user record keeping.
- Easy local backup.

Constraint:

- One server replica and local persistent disk.

## ADR-0003: Server-side opaque sessions

Decision:

- Opaque session cookie and server-side session row.

Reason:

- Revocation and password-change invalidation are simple.
- JWT provides no useful benefit for this deployment.

## ADR-0004: Non-blocking location

Decision:

- Save transaction independently from browser position lookup.

Reason:

- Location latency and permissions must not slow the core entry flow.

## ADR-0005: Optional title

Decision:

- Title is one optional short field.
- No separate note in MVP.

Reason:

- Improves recognition without adding required friction or duplicate text concepts.

## ADR-0006: Single installation currency

Decision:

- One currency per installation.

Reason:

- Avoids exchange rates and ambiguous aggregation.
- Keeps financial totals meaningful.

## ADR-0007: Anchor-based recurrence

Decision:

- Calculate every occurrence from start date and sequence.

Reason:

- Prevents month-end and leap-day drift.

## ADR-0008: Soft-delete transactions

Decision:

- Transaction delete sets `deleted_at`.

Reason:

- Supports immediate undo and reduces accidental data loss.

---

# 39. Reference Material

These references guide implementation details. They do not override the product behavior defined above.

## Go

- Go `embed` package:  
  https://pkg.go.dev/embed
- Go `net/http` package:  
  https://pkg.go.dev/net/http
- Go Argon2 package:  
  https://pkg.go.dev/golang.org/x/crypto/argon2

## SQLite

- Foreign-key support:  
  https://www.sqlite.org/foreignkeys.html
- Write-ahead logging:  
  https://www.sqlite.org/wal.html
- STRICT tables:  
  https://www.sqlite.org/stricttables.html
- Backup API:  
  https://www.sqlite.org/backup.html

## Browser location

- MDN Geolocation API:  
  https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API
- MDN `getCurrentPosition`:  
  https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- MDN Permissions API:  
  https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API

## Security

- OWASP Password Storage Cheat Sheet:  
  https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet:  
  https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet:  
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## Accessibility

- WCAG 2.2 target-size guidance:  
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

---

# Final Implementation Priority

The first production-quality vertical slice must be:

```text
Create database
→ Securely initialize password
→ Log in
→ Load categories
→ Record one expense
→ Show it on Today
→ Delete it
→ Undo deletion
```

Do not begin advanced monthly visualization or recurring-rule UI until this slice is usable on a mobile device and has end-to-end tests.

The core product rule remains:

> **Amount, category, save. Title is optional. Location is automatic when possible and never blocks the transaction.**
