import { createApp } from '@/app';
import { NotificationCategory } from '@/constants/notification-category';
import Notification from '@/db/models/notification.model';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

const app = await createApp();

const userPayload = {
  fullName: 'Notify User',
  email: 'notify@example.com',
  password: 'StrongPass1',
};

const otherUserPayload = {
  fullName: 'Other User',
  email: 'other@example.com',
  password: 'StrongPass1',
};

const login = (email: string, password: string) =>
  request(app).post('/api/v1/auth/login').send({ email, password });

const signupAndLogin = async (payload: typeof userPayload) => {
  const signupRes = await request(app).post('/api/v1/auth/signup').send(payload);
  const loginRes = await login(payload.email, payload.password);

  return {
    id: signupRes.body.data.id as string,
    accessToken: loginRes.body.data.accessToken as string,
  };
};

// Notifications are system-created (no HTTP create endpoint), so tests seed them
// straight through the model — the same way createNotification() will at runtime.
const seedNotification = (
  recipient: string,
  overrides: Partial<{
    category: NotificationCategory;
    title: string;
    subtitle: string;
    message: string;
    isRead: boolean;
  }> = {},
) =>
  Notification.create({
    recipient,
    category: NotificationCategory.PAYMENTS,
    title: 'Rent Payment Received',
    subtitle: 'Flat 3B - Sunshine Apartments',
    message: 'Chinedu Okafor has paid N850,000 for the Annual rent.',
    ...overrides,
  });

describe('GET /api/v1/notifications', () => {
  it("returns only the logged-in user's notifications, newest first", async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    const { id: otherId } = await signupAndLogin(otherUserPayload);

    await seedNotification(id, { title: 'Older' });
    await seedNotification(id, { title: 'Newer' });
    await seedNotification(otherId, { title: 'Not mine' });

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(2);
    // newest first
    expect(res.body.notifications[0].title).toBe('Newer');
    expect(res.body.notifications[1].title).toBe('Older');
  });

  it('exposes the full row shape (title, subtitle, message, isRead)', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    await seedNotification(id);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications[0]).toMatchObject({
      category: 'payments',
      title: 'Rent Payment Received',
      subtitle: 'Flat 3B - Sunshine Apartments',
      message: 'Chinedu Okafor has paid N850,000 for the Annual rent.',
      isRead: false,
    });
  });

  it('filters by category', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    await seedNotification(id, { category: NotificationCategory.PAYMENTS });
    await seedNotification(id, { category: NotificationCategory.MAINTENANCE, title: 'Leak' });

    const res = await request(app)
      .get('/api/v1/notifications?category=maintenance')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].category).toBe('maintenance');
  });

  it('filters by unread only', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    await seedNotification(id, { isRead: true, title: 'Read one' });
    await seedNotification(id, { isRead: false, title: 'Unread one' });

    const res = await request(app)
      .get('/api/v1/notifications?isRead=false')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].title).toBe('Unread one');
  });

  it('rejects an invalid category', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .get('/api/v1/notifications?category=bogus')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(422);
  });

  it('rejects a request with no access token', async () => {
    const res = await request(app).get('/api/v1/notifications');

    expect(res.status).toBe(401);
  });

  it('defaults page and limit when the query is omitted', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('counts only the unread notifications belonging to the user', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    const { id: otherId } = await signupAndLogin(otherUserPayload);

    await seedNotification(id, { isRead: false });
    await seedNotification(id, { isRead: false });
    await seedNotification(id, { isRead: true });
    await seedNotification(otherId, { isRead: false });

    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('marks a single notification as read and stamps readAt', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    const notification = await seedNotification(id, { isRead: false });

    const res = await request(app)
      .patch(`/api/v1/notifications/${notification._id.toString()}/read`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);
    expect(res.body.data.readAt).not.toBeNull();
  });

  it("returns 404 when marking someone else's notification", async () => {
    const { accessToken } = await signupAndLogin(userPayload);
    const { id: otherId } = await signupAndLogin(otherUserPayload);
    const notification = await seedNotification(otherId);

    const res = await request(app)
      .patch(`/api/v1/notifications/${notification._id.toString()}/read`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects an invalid id format', async () => {
    const { accessToken } = await signupAndLogin(userPayload);

    const res = await request(app)
      .patch('/api/v1/notifications/not-a-valid-id/read')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('returns 404 for a nonexistent notification', async () => {
    const { accessToken } = await signupAndLogin(userPayload);
    const nonexistentId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .patch(`/api/v1/notifications/${nonexistentId}/read`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  it('marks every unread notification for the user as read', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    const { id: otherId } = await signupAndLogin(otherUserPayload);

    await seedNotification(id, { isRead: false });
    await seedNotification(id, { isRead: false });
    await seedNotification(otherId, { isRead: false });

    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    // the other user's notification is untouched
    const stillUnread = await Notification.countDocuments({ recipient: otherId, isRead: false });
    expect(stillUnread).toBe(1);
  });
});

describe('DELETE /api/v1/notifications/:id', () => {
  it('deletes the user own notification', async () => {
    const { id, accessToken } = await signupAndLogin(userPayload);
    const notification = await seedNotification(id);

    const res = await request(app)
      .delete(`/api/v1/notifications/${notification._id.toString()}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const exists = await Notification.findById(notification._id);
    expect(exists).toBeNull();
  });

  it("returns 404 when deleting someone else's notification", async () => {
    const { accessToken } = await signupAndLogin(userPayload);
    const { id: otherId } = await signupAndLogin(otherUserPayload);
    const notification = await seedNotification(otherId);

    const res = await request(app)
      .delete(`/api/v1/notifications/${notification._id.toString()}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);

    // it must not have been deleted
    const exists = await Notification.findById(notification._id);
    expect(exists).not.toBeNull();
  });
});
