# Notifications

In-app notifications for MyCompound. Each user has their own list of
notifications — things like "Rent Payment Received", "Rent Due Soon", or "New
Tenant Added". This document explains how the feature is put together, how to
raise a notification from other parts of the app, and the endpoints the frontend
uses.

---

## What a notification looks like

A notification always belongs to **one user** (the recipient). It carries three
lines of text plus a category and a read flag:

| Field       | Type      | Required | What it holds                                                        |
| ----------- | --------- | -------- | -------------------------------------------------------------------- |
| `recipient` | User ID   | Yes      | Who the notification is for. Every query is scoped to this user.     |
| `category`  | enum      | Yes      | One of the tabs in the UI (see below). Also picks the row icon.      |
| `title`     | string    | Yes      | The bold headline, e.g. `Rent Payment Received`.                     |
| `subtitle`  | string    | No       | The context line, e.g. `Flat 3B - Sunshine Apartments`.              |
| `message`   | string    | Yes      | The body line, e.g. `Chinedu Okafor has paid N850,000 for the rent`. |
| `isRead`    | boolean   | No       | `false` when new. Drives the unread dot and the unread count.        |
| `readAt`    | date      | No       | Stamped the moment it is marked read. Stays `null` while unread.     |
| `meta`      | object    | No       | Extra data for deep-linking, e.g. `{ unitId, paymentId }`.           |
| timestamps  | dates     | —        | `createdAt` / `updatedAt` are added automatically.                   |

### Why `subtitle` is stored, not looked up

A notification is a record of something that already happened. So we save the
`subtitle` text (like `Flat 3B - Sunshine Apartments`) at the moment it is
created. Even if that unit is later renamed or deleted, the old notification
still reads correctly.

### Categories

The category decides which tab a notification shows under and which icon it
gets. The values come straight from the design:

- `payments` — rent received, rent due soon, rent overdue
- `properties` — a property or unit update (e.g. a unit marked vacant)
- `tenants` — tenant changes (e.g. a new tenant added to a property)
- `maintenance` — maintenance requests raised against a unit

The **"All"** tab in the design is just the full list with no category filter —
it is not a category on its own.

---

## Raising a notification from other features

Notifications are created by the **system**, never by the client directly. There
is no "create notification" endpoint. Instead, whichever feature causes the
event calls the `createNotification` service.

For example, the payments feature would call this after confirming a rent
payment:

```ts
import { createNotification } from '@/services/notification.service';
import { NotificationCategory } from '@/constants/notification-category';

await createNotification({
  recipient: landlordId,
  category: NotificationCategory.PAYMENTS,
  title: 'Rent Payment Received',
  subtitle: 'Flat 3B - Sunshine Apartments',
  message: 'Chinedu Okafor has paid N850,000 for the Annual rent.',
  meta: { unitId, paymentId },
});
```

`recipient` accepts either an ID string or an ObjectId, so you do not have to
convert it first. `subtitle` and `meta` are optional.

> As of now nothing calls `createNotification` yet — the triggers get wired in
> as the Payments, Tenants, and Maintenance features are built.

---

## Endpoints

All endpoints sit under `/api/v1/notifications` and require a logged-in user
(send the access token as `Authorization: Bearer <token>`). A user only ever
sees and touches their own notifications. Asking for a notification that belongs
to someone else returns **404** — the same "not found" you would get for an ID
that does not exist, so no one can probe for other people's IDs.

| Method   | Path                            | What it does                                                    |
| -------- | ------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/notifications`                | List the user's notifications, newest first. Supports filters. |
| `GET`    | `/notifications/unread-count`   | Return the number of unread notifications (the badge count).   |
| `PATCH`  | `/notifications/read-all`       | Mark every unread notification as read ("Mark all as read").   |
| `PATCH`  | `/notifications/:id/read`       | Mark one notification as read.                                  |
| `DELETE` | `/notifications/:id`            | Delete one notification.                                       |

### Listing and filtering

`GET /notifications` accepts these query parameters (all optional):

| Query      | Example              | Meaning                                              |
| ---------- | -------------------- | ---------------------------------------------------- |
| `page`     | `1`                  | Page number. Defaults to `1`.                        |
| `limit`    | `20`                 | Items per page. Defaults to `20`, max `100`.         |
| `category` | `payments`           | Show only one tab. Omit for the "All" view.          |
| `isRead`   | `false`              | `true` for read only, `false` for unread only.       |

Example — the unread "Payments" tab:

```
GET /api/v1/notifications?category=payments&isRead=false
```

### Response shapes

**List** (`GET /notifications`):

```json
{
  "success": true,
  "notifications": [
    {
      "id": "6a60b9659c16fbcbeab13e4a",
      "category": "payments",
      "title": "Rent Payment Received",
      "subtitle": "Flat 3B - Sunshine Apartments",
      "message": "Chinedu Okafor has paid N850,000 for the Annual rent.",
      "isRead": false,
      "readAt": null,
      "meta": { "unitId": "6a60b8659c16fbcbeab13e49" },
      "createdAt": "2026-07-20T10:46:15.836Z",
      "updatedAt": "2026-07-20T10:46:15.836Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 }
}
```

**Unread count** (`GET /notifications/unread-count`):

```json
{ "success": true, "data": { "count": 3 } }
```

**Mark all as read** (`PATCH /notifications/read-all`) — `updated` is how many
rows were flipped, so the client can update the badge without re-fetching:

```json
{ "success": true, "message": "All notifications marked as read", "data": { "updated": 5 } }
```

**Mark one as read** (`PATCH /notifications/:id/read`) returns the updated
notification. **Delete** returns a plain success message.

### The "Today / This Week / Earlier" groups

The time groups and the "10 mins ago" labels in the design are handled on the
**frontend**. The API just returns `createdAt` for each notification and the
client buckets and formats them. There is nothing to store for this on the
backend.

---

## Where the code lives

| Part          | File                                          |
| ------------- | --------------------------------------------- |
| Categories    | `src/constants/notification-category.ts`      |
| Model         | `src/db/models/notification.model.ts`         |
| Validation    | `src/validations/notification.validation.ts`  |
| Service       | `src/services/notification.service.ts`        |
| Controller    | `src/controllers/notification.controller.ts`  |
| Routes        | `src/routes/notification.routes.ts`           |
| API docs      | `src/lib/notification.docs.ts`                |
| Tests         | `tests/integration/notification.spec.ts`      |

The Swagger docs for these endpoints show up at the running server's `/docs`
page alongside the rest of the API.

---

## Testing

Coverage lives in `tests/integration/notification.spec.ts` and runs against a
real MongoDB and Redis, like the rest of the suite. Because notifications are
created by the system (no create endpoint), the tests seed them straight through
the model — the same shape `createNotification` produces.

```bash
npm run test:run -- tests/integration/notification.spec.ts
```
