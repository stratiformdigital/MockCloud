import { randomUUID } from 'node:crypto';
import type { ApiResponse, AzureParsedRequest, AzureServiceDefinition } from '../../../types.js';
import { PersistentMap } from '../../../state/store.js';
import { azureError, jsonOk, noContent } from '../../response.js';

interface GraphUser {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
  mailNickname?: string;
  accountEnabled?: boolean;
  createdDateTime: string;
  [key: string]: unknown;
}

interface GraphGroup {
  id: string;
  displayName?: string;
  mailNickname?: string;
  mailEnabled?: boolean;
  securityEnabled?: boolean;
  createdDateTime: string;
  [key: string]: unknown;
}

interface GraphApplication {
  id: string;
  appId: string;
  displayName?: string;
  identifierUris?: string[];
  signInAudience?: string;
  passwordCredentials?: unknown[];
  createdDateTime: string;
  [key: string]: unknown;
}

interface GraphServicePrincipal {
  id: string;
  appId: string;
  displayName?: string;
  servicePrincipalType?: string;
  accountEnabled?: boolean;
  createdDateTime: string;
  [key: string]: unknown;
}

type GraphEntity = GraphUser | GraphGroup | GraphApplication | GraphServicePrincipal;

const users = new PersistentMap<string, GraphUser>('azure-graph-users');
const groups = new PersistentMap<string, GraphGroup>('azure-graph-groups');
const applications = new PersistentMap<string, GraphApplication>('azure-graph-applications');
const servicePrincipals = new PersistentMap<string, GraphServicePrincipal>('azure-graph-service-principals');

interface GraphMessage {
  userId: string;
  id: string;
  subject?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  isRead: boolean;
  hasAttachments: boolean;
  folder: string;
  createdDateTime: string;
  [key: string]: unknown;
}

interface GraphAttachment {
  userId: string;
  messageId: string;
  id: string;
  '@odata.type': string;
  name?: string;
  contentType?: string;
  contentBytes?: string;
  isInline: boolean;
  size: number;
  [key: string]: unknown;
}

const messages = new PersistentMap<string, GraphMessage>('azure-graph-messages');
const attachments = new PersistentMap<string, GraphAttachment>('azure-graph-attachments');

function messageKey(userId: string, id: string): string {
  return `${userId}\0${id}`;
}

function attachmentKey(userId: string, messageId: string, id: string): string {
  return `${userId}\0${messageId}\0${id}`;
}

function pathParts(req: AzureParsedRequest): string[] {
  const parts = req.azurePath.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0]?.toLowerCase() === 'v1.0' || parts[0]?.toLowerCase() === 'beta') {
    return parts.slice(1);
  }
  return parts;
}

function collectionFor(name: string): PersistentMap<string, GraphEntity> | null {
  switch (name.toLowerCase()) {
    case 'users': return users as PersistentMap<string, GraphEntity>;
    case 'groups': return groups as PersistentMap<string, GraphEntity>;
    case 'applications': return applications as PersistentMap<string, GraphEntity>;
    case 'serviceprincipals': return servicePrincipals as PersistentMap<string, GraphEntity>;
    default: return null;
  }
}

function collectionName(name: string): string {
  switch (name.toLowerCase()) {
    case 'serviceprincipals': return 'servicePrincipals';
    default: return name.toLowerCase();
  }
}

function body(req: AzureParsedRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function createUser(req: AzureParsedRequest): ApiResponse {
  const input = body(req);
  const id = typeof input.id === 'string' ? input.id : randomUUID();
  const user: GraphUser = {
    ...input,
    id,
    displayName: typeof input.displayName === 'string' ? input.displayName : undefined,
    userPrincipalName: typeof input.userPrincipalName === 'string' ? input.userPrincipalName : undefined,
    mailNickname: typeof input.mailNickname === 'string' ? input.mailNickname : undefined,
    accountEnabled: typeof input.accountEnabled === 'boolean' ? input.accountEnabled : true,
    createdDateTime: new Date().toISOString(),
  };
  users.set(id, user);
  return jsonOk(user, 201);
}

function createGroup(req: AzureParsedRequest): ApiResponse {
  const input = body(req);
  const id = typeof input.id === 'string' ? input.id : randomUUID();
  const group: GraphGroup = {
    ...input,
    id,
    displayName: typeof input.displayName === 'string' ? input.displayName : undefined,
    mailNickname: typeof input.mailNickname === 'string' ? input.mailNickname : undefined,
    mailEnabled: typeof input.mailEnabled === 'boolean' ? input.mailEnabled : false,
    securityEnabled: typeof input.securityEnabled === 'boolean' ? input.securityEnabled : true,
    createdDateTime: new Date().toISOString(),
  };
  groups.set(id, group);
  return jsonOk(group, 201);
}

function createApplication(req: AzureParsedRequest): ApiResponse {
  const input = body(req);
  const id = typeof input.id === 'string' ? input.id : randomUUID();
  const app: GraphApplication = {
    ...input,
    id,
    appId: typeof input.appId === 'string' ? input.appId : randomUUID(),
    displayName: typeof input.displayName === 'string' ? input.displayName : undefined,
    identifierUris: stringArray(input.identifierUris),
    signInAudience: typeof input.signInAudience === 'string' ? input.signInAudience : 'AzureADMyOrg',
    passwordCredentials: Array.isArray(input.passwordCredentials) ? input.passwordCredentials : [],
    createdDateTime: new Date().toISOString(),
  };
  applications.set(id, app);
  return jsonOk(app, 201);
}

function createServicePrincipal(req: AzureParsedRequest): ApiResponse {
  const input = body(req);
  const id = typeof input.id === 'string' ? input.id : randomUUID();
  const appId = typeof input.appId === 'string' ? input.appId : randomUUID();
  const app = Array.from(applications.values()).find((item) => item.appId === appId);
  const principal: GraphServicePrincipal = {
    ...input,
    id,
    appId,
    displayName: typeof input.displayName === 'string' ? input.displayName : app?.displayName,
    servicePrincipalType: typeof input.servicePrincipalType === 'string' ? input.servicePrincipalType : 'Application',
    accountEnabled: typeof input.accountEnabled === 'boolean' ? input.accountEnabled : true,
    createdDateTime: new Date().toISOString(),
  };
  servicePrincipals.set(id, principal);
  return jsonOk(principal, 201);
}

function createEntity(req: AzureParsedRequest, collection: string): ApiResponse {
  switch (collection.toLowerCase()) {
    case 'users': return createUser(req);
    case 'groups': return createGroup(req);
    case 'applications': return createApplication(req);
    case 'serviceprincipals': return createServicePrincipal(req);
    default: return azureError('Request_ResourceNotFound', `Resource '${collection}' was not found.`, 404);
  }
}

function defaultMe(): GraphUser {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    displayName: 'MockCloud User',
    userPrincipalName: 'mockcloud@example.com',
    mailNickname: 'mockcloud',
    accountEnabled: true,
    createdDateTime: '1970-01-01T00:00:00.000Z',
  };
}

function listMessages(userId: string, folder: string | null, req: AzureParsedRequest): ApiResponse {
  const filter = req.queryParams.$filter ?? '';
  const top = req.queryParams.$top ? Number(req.queryParams.$top) : undefined;
  const onlyUnread = /\bisRead\s+eq\s+false\b/i.test(filter);
  const onlyRead = /\bisRead\s+eq\s+true\b/i.test(filter);
  const needsAttachments = /\bhasAttachments\s+eq\s+true\b/i.test(filter);

  const matching = Array.from(messages.values())
    .filter((m) => m.userId === userId && (folder ? m.folder.toLowerCase() === folder.toLowerCase() : true))
    .filter((m) => (onlyUnread ? !m.isRead : true))
    .filter((m) => (onlyRead ? m.isRead : true))
    .filter((m) => (needsAttachments ? m.hasAttachments : true));

  const value = top ? matching.slice(0, top) : matching;
  return jsonOk({ '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#users('${userId}')/messages`, value });
}

function getMessage(userId: string, messageId: string): ApiResponse {
  const message = messages.get(messageKey(userId, messageId));
  if (!message) return azureError('Request_ResourceNotFound', `Message '${messageId}' was not found.`, 404);
  return jsonOk(message);
}

function createMessage(userId: string, folder: string, req: AzureParsedRequest): ApiResponse {
  const input = body(req);
  const id = typeof input.id === 'string' ? input.id : randomUUID();
  const message: GraphMessage = {
    ...input,
    userId,
    id,
    subject: typeof input.subject === 'string' ? input.subject : '(no subject)',
    from: (input.from as GraphMessage['from']) ?? { emailAddress: { address: 'mockcloud@example.com', name: 'MockCloud' } },
    isRead: input.isRead === true,
    hasAttachments: input.hasAttachments === true,
    folder,
    createdDateTime: new Date().toISOString(),
  };
  messages.set(messageKey(userId, id), message);
  return jsonOk(message, 201);
}

function patchMessage(userId: string, messageId: string, req: AzureParsedRequest): ApiResponse {
  const existing = messages.get(messageKey(userId, messageId));
  if (!existing) return azureError('Request_ResourceNotFound', `Message '${messageId}' was not found.`, 404);
  const input = body(req);
  const updated: GraphMessage = {
    ...existing,
    ...input,
    userId,
    id: messageId,
    folder: existing.folder,
    isRead: typeof input.isRead === 'boolean' ? input.isRead : existing.isRead,
  };
  messages.set(messageKey(userId, messageId), updated);
  return jsonOk(updated);
}

function deleteMessage(userId: string, messageId: string): ApiResponse {
  messages.delete(messageKey(userId, messageId));
  for (const att of Array.from(attachments.values())) {
    if (att.userId === userId && att.messageId === messageId) {
      attachments.delete(attachmentKey(userId, messageId, att.id));
    }
  }
  return noContent();
}

function listAttachments(userId: string, messageId: string): ApiResponse {
  if (!messages.get(messageKey(userId, messageId))) {
    return azureError('Request_ResourceNotFound', `Message '${messageId}' was not found.`, 404);
  }
  const value = Array.from(attachments.values()).filter(
    (a) => a.userId === userId && a.messageId === messageId,
  );
  return jsonOk({
    '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#users('${userId}')/messages('${messageId}')/attachments`,
    value,
  });
}

function createAttachment(userId: string, messageId: string, req: AzureParsedRequest): ApiResponse {
  const existingMessage = messages.get(messageKey(userId, messageId));
  if (!existingMessage) {
    return azureError('Request_ResourceNotFound', `Message '${messageId}' was not found.`, 404);
  }
  const input = body(req);
  const id = typeof input.id === 'string' ? input.id : randomUUID();
  const contentBytes = typeof input.contentBytes === 'string' ? input.contentBytes : '';
  const attachment: GraphAttachment = {
    ...input,
    userId,
    messageId,
    id,
    '@odata.type': typeof input['@odata.type'] === 'string' ? (input['@odata.type'] as string) : '#microsoft.graph.fileAttachment',
    name: typeof input.name === 'string' ? input.name : 'attachment',
    contentType: typeof input.contentType === 'string' ? input.contentType : 'application/octet-stream',
    contentBytes,
    isInline: input.isInline === true,
    size: Buffer.from(contentBytes, 'base64').length,
  };
  attachments.set(attachmentKey(userId, messageId, id), attachment);
  existingMessage.hasAttachments = true;
  messages.set(messageKey(userId, messageId), existingMessage);
  return jsonOk(attachment, 201);
}

function handleMailboxRoute(parts: string[], req: AzureParsedRequest): ApiResponse | null {
  if (parts[0]?.toLowerCase() !== 'users' || !parts[1]) return null;
  const userId = parts[1];

  if (parts[2]?.toLowerCase() === 'mailfolders' && parts[3] && parts[4]?.toLowerCase() === 'messages') {
    if (parts.length === 5 && req.method === 'GET') return listMessages(userId, parts[3], req);
    if (parts.length === 5 && req.method === 'POST') return createMessage(userId, parts[3], req);
  }

  if (parts[2]?.toLowerCase() === 'messages') {
    if (parts.length === 3 && req.method === 'GET') return listMessages(userId, null, req);
    if (parts.length === 3 && req.method === 'POST') return createMessage(userId, 'inbox', req);
    if (parts.length === 4) {
      const messageId = parts[3];
      if (req.method === 'GET') return getMessage(userId, messageId);
      if (req.method === 'PATCH') return patchMessage(userId, messageId, req);
      if (req.method === 'DELETE') return deleteMessage(userId, messageId);
    }
    if (parts.length === 5 && parts[4].toLowerCase() === 'attachments') {
      const messageId = parts[3];
      if (req.method === 'GET') return listAttachments(userId, messageId);
      if (req.method === 'POST') return createAttachment(userId, messageId, req);
    }
  }

  return null;
}

function routeRequest(req: AzureParsedRequest): ApiResponse {
  const parts = pathParts(req);
  if (parts.length === 1 && parts[0].toLowerCase() === 'me' && req.method === 'GET') {
    return jsonOk(defaultMe());
  }

  const mailboxResponse = handleMailboxRoute(parts, req);
  if (mailboxResponse) return mailboxResponse;

  const collection = parts[0];
  if (!collection) return azureError('BadRequest', 'The request URI is invalid.', 400);

  const store = collectionFor(collection);
  if (!store) return azureError('Request_ResourceNotFound', `Resource '${collection}' was not found.`, 404);

  const id = parts[1];
  if (!id) {
    if (req.method === 'GET') return jsonOk({ '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#${collectionName(collection)}`, value: Array.from(store.values()) });
    if (req.method === 'POST') return createEntity(req, collection);
    return azureError('BadRequest', 'The requested Microsoft Graph operation is not implemented.', 400);
  }

  if (req.method === 'GET') {
    const value = store.get(id);
    if (!value) return azureError('Request_ResourceNotFound', `Resource '${id}' was not found.`, 404);
    return jsonOk(value);
  }

  if (req.method === 'DELETE') {
    store.delete(id);
    return noContent();
  }

  return azureError('BadRequest', 'The requested Microsoft Graph operation is not implemented.', 400);
}

export const azureGraphService: AzureServiceDefinition = {
  name: 'azure-graph',
  hostPatterns: ['graph.microsoft.com'],
  handlers: {
    _default: routeRequest,
  },
};
