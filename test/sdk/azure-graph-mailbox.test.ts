import { describe, expect, test } from 'vitest';
import { getTestEndpoint } from './client-factory.js';

function graphEndpoint(path: string): string {
  return `${getTestEndpoint()}/azure/graph.microsoft.com/v1.0${path}`;
}

async function graph(path: string, init?: RequestInit): Promise<Response> {
  return fetch(graphEndpoint(path), {
    ...init,
    headers: {
      Authorization: 'Bearer mockcloud-token',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function seedMailbox(userId: string): Promise<{ readId: string; unreadWithAttachmentId: string }> {
  const readMessage = await json<Record<string, any>>(
    await graph(`/users/${userId}/mailFolders/inbox/messages`, {
      method: 'POST',
      body: JSON.stringify({
        subject: 'already read',
        isRead: true,
        from: { emailAddress: { address: 'noreply@example.com' } },
      }),
    }),
  );

  const unread = await json<Record<string, any>>(
    await graph(`/users/${userId}/mailFolders/inbox/messages`, {
      method: 'POST',
      body: JSON.stringify({
        subject: 'intake submission',
        isRead: false,
        from: { emailAddress: { address: 'sender@example.com' } },
      }),
    }),
  );

  const attachResponse = await graph(`/users/${userId}/messages/${unread.id}/attachments`, {
    method: 'POST',
    body: JSON.stringify({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'contract.pdf',
      contentType: 'application/pdf',
      contentBytes: Buffer.from('%PDF-1.4 mock').toString('base64'),
    }),
  });
  expect(attachResponse.status).toBe(201);

  return { readId: readMessage.id, unreadWithAttachmentId: unread.id };
}

describe('Microsoft Graph mailbox', () => {
  test('filter returns only unread messages with attachments', async () => {
    const userId = `user-${Date.now()}`;
    const { unreadWithAttachmentId } = await seedMailbox(userId);

    const filtered = await json<Record<string, any>>(
      await graph(
        `/users/${userId}/mailFolders/inbox/messages?$filter=isRead eq false and hasAttachments eq true&$top=10`,
      ),
    );
    expect(filtered.value.length).toBe(1);
    expect(filtered.value[0].id).toBe(unreadWithAttachmentId);
  });

  test('listing attachments returns seeded contract.pdf', async () => {
    const userId = `user-${Date.now()}`;
    const { unreadWithAttachmentId } = await seedMailbox(userId);

    const attResponse = await json<Record<string, any>>(
      await graph(`/users/${userId}/messages/${unreadWithAttachmentId}/attachments`),
    );
    expect(attResponse.value.length).toBe(1);
    expect(attResponse.value[0].name).toBe('contract.pdf');
    expect(attResponse.value[0].contentType).toBe('application/pdf');
  });

  test('PATCH marks message read and subsequent filter excludes it', async () => {
    const userId = `user-${Date.now()}`;
    const { unreadWithAttachmentId } = await seedMailbox(userId);

    const patchResponse = await graph(`/users/${userId}/messages/${unreadWithAttachmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
    expect(patchResponse.status).toBe(200);

    const filtered = await json<Record<string, any>>(
      await graph(`/users/${userId}/mailFolders/inbox/messages?$filter=isRead eq false`),
    );
    expect(filtered.value.map((m: Record<string, any>) => m.id)).not.toContain(unreadWithAttachmentId);
  });
});
