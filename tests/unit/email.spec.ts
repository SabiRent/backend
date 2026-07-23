import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SMTP transport so no real mail is sent and no network is touched.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));

vi.mock('@/config/mail.config', () => ({
  mailTransport: { sendMail: sendMailMock },
}));

import { sendEmail } from '@/services/email.service';

describe('sendEmail', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'test-message-id' });
  });

  it('forwards the payload to the SMTP transport', async () => {
    await sendEmail({ to: 'landlord@example.com', subject: 'Hello', html: '<p>Hi</p>' });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.to).toBe('landlord@example.com');
    expect(payload.subject).toBe('Hello');
    expect(payload.html).toBe('<p>Hi</p>');
  });

  it('uses the explicit `from` when provided', async () => {
    await sendEmail({ to: 'a@b.com', subject: 'x', from: 'custom@sender.com' });

    expect(sendMailMock.mock.calls[0][0].from).toBe('custom@sender.com');
  });
});
