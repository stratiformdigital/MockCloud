import { randomBytes, randomUUID } from 'node:crypto';
import type { ApiResponse, ParsedApiRequest } from '../../types.js';
import { pools, poolClients, poolUsers } from './index.js';
import type { StoredUser } from './index.js';
import { jsonAmz11 as json, errorAmz11 as error } from '../response.js';
import { REGION } from '../../config.js';

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function getUserAttribute(user: StoredUser, name: string): string | undefined {
  return user.attributes.find((a) => a.Name === name)?.Value;
}

function findUserPoolByClientId(clientId: string): { userPoolId: string } | undefined {
  for (const [userPoolId, clients] of poolClients) {
    if (clients.some((c) => c.clientId === clientId)) {
      return { userPoolId };
    }
  }
  return undefined;
}

function generateTokens(
  user: StoredUser,
  userPoolId: string,
  clientId: string,
): { AccessToken: string; IdToken: string; RefreshToken: string } {
  const now = Math.floor(Date.now() / 1000);
  const sub = getUserAttribute(user, 'sub') ?? randomUUID();
  const iss = `https://cognito-idp.${REGION}.amazonaws.com/${userPoolId}`;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const sig = base64url('mockcloud-mock-signature');

  const idPayload: Record<string, unknown> = {
    sub,
    iss,
    aud: clientId,
    token_use: 'id',
    'cognito:username': user.username,
    auth_time: now,
    iat: now,
    exp: now + 3600,
  };
  for (const attr of user.attributes) {
    if (attr.Name && attr.Value !== undefined) {
      idPayload[attr.Name] = attr.Value;
    }
  }

  const accessPayload: Record<string, unknown> = {
    sub,
    iss,
    client_id: clientId,
    token_use: 'access',
    scope: 'aws.cognito.signin.user.admin',
    auth_time: now,
    iat: now,
    exp: now + 3600,
  };

  const IdToken = `${header}.${base64url(JSON.stringify(idPayload))}.${sig}`;
  const AccessToken = `${header}.${base64url(JSON.stringify(accessPayload))}.${sig}`;
  const RefreshToken = randomBytes(32).toString('hex');

  return { AccessToken, IdToken, RefreshToken };
}

function srpChallenge(user: StoredUser): ApiResponse {
  return json({
    ChallengeName: 'PASSWORD_VERIFIER',
    ChallengeParameters: {
      SALT: randomBytes(16).toString('hex'),
      SECRET_BLOCK: randomBytes(768).toString('base64'),
      SRP_B: randomBytes(384).toString('hex'),
      USERNAME: user.username,
      USER_ID_FOR_SRP: user.username,
    },
  });
}

function authResult(user: StoredUser, userPoolId: string, clientId: string): ApiResponse {
  const tokens = generateTokens(user, userPoolId, clientId);
  return json({
    AuthenticationResult: {
      ...tokens,
      ExpiresIn: 3600,
      TokenType: 'Bearer',
    },
  });
}

export function InitiateAuth(req: ParsedApiRequest): ApiResponse {
  const { AuthFlow, AuthParameters, ClientId } = req.body;
  if (!ClientId) return error('ValidationException', 'ClientId is required');
  if (!AuthParameters) return error('ValidationException', 'AuthParameters is required');

  const found = findUserPoolByClientId(ClientId);
  if (!found) return error('ResourceNotFoundException', `Client ${ClientId} not found.`, 404);

  const users = poolUsers.get(found.userPoolId) ?? [];
  const username = AuthParameters.USERNAME;
  if (!username) return error('ValidationException', 'USERNAME is required in AuthParameters');

  const user = users.find((u) => u.username === username || getUserAttribute(u, 'email') === username);
  if (!user) return error('UserNotFoundException', 'User does not exist.');

  if (AuthFlow === 'USER_SRP_AUTH' && !AuthParameters.PASSWORD) {
    return srpChallenge(user);
  }

  if (AuthFlow === 'USER_PASSWORD_AUTH' || AuthFlow === 'USER_SRP_AUTH') {
    if (user.password !== undefined && AuthParameters.PASSWORD !== user.password) {
      return error('NotAuthorizedException', 'Incorrect username or password.');
    }
    return authResult(user, found.userPoolId, ClientId);
  }

  if (AuthFlow === 'REFRESH_TOKEN_AUTH' || AuthFlow === 'REFRESH_TOKEN') {
    return authResult(user, found.userPoolId, ClientId);
  }

  return error('InvalidParameterException', `Unsupported auth flow: ${AuthFlow}`);
}

export function AdminInitiateAuth(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, AuthFlow, AuthParameters } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!AuthParameters) return error('ValidationException', 'AuthParameters is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }

  const users = poolUsers.get(UserPoolId) ?? [];
  const username = AuthParameters.USERNAME;
  if (!username) return error('ValidationException', 'USERNAME is required in AuthParameters');

  const user = users.find((u) => u.username === username || getUserAttribute(u, 'email') === username);
  if (!user) return error('UserNotFoundException', 'User does not exist.');

  const clients = poolClients.get(UserPoolId) ?? [];
  const clientId = clients[0]?.clientId ?? 'mock-client-id';

  if (AuthFlow === 'USER_SRP_AUTH' && !AuthParameters.PASSWORD) {
    return srpChallenge(user);
  }

  if (AuthFlow === 'ADMIN_USER_PASSWORD_AUTH' || AuthFlow === 'USER_PASSWORD_AUTH' || AuthFlow === 'USER_SRP_AUTH') {
    if (user.password !== undefined && AuthParameters.PASSWORD && AuthParameters.PASSWORD !== user.password) {
      return error('NotAuthorizedException', 'Incorrect username or password.');
    }
    return authResult(user, UserPoolId, clientId);
  }

  if (AuthFlow === 'REFRESH_TOKEN_AUTH' || AuthFlow === 'REFRESH_TOKEN') {
    return authResult(user, UserPoolId, clientId);
  }

  return error('InvalidParameterException', `Unsupported auth flow: ${AuthFlow}`);
}

export function AdminRespondToAuthChallenge(req: ParsedApiRequest): ApiResponse {
  const { ChallengeResponses, UserPoolId } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }

  const users = poolUsers.get(UserPoolId) ?? [];
  const username = ChallengeResponses?.USERNAME ?? ChallengeResponses?.USER_ID_FOR_SRP;
  const user = username
    ? users.find((u) => u.username === username || getUserAttribute(u, 'email') === username)
    : users[0];

  if (!user) return error('UserNotFoundException', 'User does not exist.');

  const clients = poolClients.get(UserPoolId) ?? [];
  const clientId = clients[0]?.clientId ?? 'mock-client-id';
  return authResult(user, UserPoolId, clientId);
}

export function RespondToAuthChallenge(req: ParsedApiRequest): ApiResponse {
  const { ChallengeResponses, ClientId } = req.body;
  if (!ClientId) return error('ValidationException', 'ClientId is required');

  const found = findUserPoolByClientId(ClientId);
  if (!found) return error('ResourceNotFoundException', `Client ${ClientId} not found.`, 404);

  const users = poolUsers.get(found.userPoolId) ?? [];
  const username = ChallengeResponses?.USERNAME ?? ChallengeResponses?.USER_ID_FOR_SRP;
  const user = username
    ? users.find((u) => u.username === username || getUserAttribute(u, 'email') === username)
    : users[0];

  if (!user) return error('UserNotFoundException', 'User does not exist.');

  return authResult(user, found.userPoolId, ClientId);
}

export function AdminSetUserPassword(req: ParsedApiRequest): ApiResponse {
  const { UserPoolId, Username, Password, Permanent } = req.body;
  if (!UserPoolId) return error('ValidationException', 'UserPoolId is required');
  if (!Username) return error('ValidationException', 'Username is required');
  if (!Password) return error('ValidationException', 'Password is required');
  if (!pools.has(UserPoolId)) {
    return error('ResourceNotFoundException', `User pool ${UserPoolId} does not exist.`, 404);
  }

  const users = poolUsers.get(UserPoolId) ?? [];
  const userIndex = users.findIndex((u) => u.username === Username);
  if (userIndex === -1) return error('UserNotFoundException', 'User does not exist.', 404);

  poolUsers.set(UserPoolId, users.map((u, i) =>
    i === userIndex ? { ...u, password: Password, ...(Permanent ? { userStatus: 'CONFIRMED' } : {}) } : u
  ));

  return json({});
}

export function SignUp(req: ParsedApiRequest): ApiResponse {
  const { ClientId, Username, Password, UserAttributes } = req.body;
  if (!ClientId) return error('ValidationException', 'ClientId is required');
  if (!Username) return error('ValidationException', 'Username is required');
  if (!Password) return error('ValidationException', 'Password is required');

  const found = findUserPoolByClientId(ClientId);
  if (!found) return error('ResourceNotFoundException', `Client ${ClientId} not found.`, 404);

  const users = poolUsers.get(found.userPoolId) ?? [];
  if (users.some((u) => u.username === Username)) {
    return error('UsernameExistsException', 'User account already exists.');
  }

  const now = Date.now() / 1000;
  const sub = randomUUID();
  const attrs = [...(UserAttributes ?? [])];
  if (!attrs.some((a) => a.Name === 'sub')) {
    attrs.push({ Name: 'sub', Value: sub });
  }

  const user: StoredUser = {
    username: Username,
    attributes: attrs,
    enabled: true,
    userStatus: 'UNCONFIRMED',
    userCreateDate: now,
    userLastModifiedDate: now,
    password: Password,
  };
  poolUsers.set(found.userPoolId, [...users, user]);

  return json({ UserConfirmed: false, UserSub: sub });
}

export function ConfirmSignUp(req: ParsedApiRequest): ApiResponse {
  const { ClientId, Username } = req.body;
  if (!ClientId) return error('ValidationException', 'ClientId is required');
  if (!Username) return error('ValidationException', 'Username is required');

  const found = findUserPoolByClientId(ClientId);
  if (!found) return error('ResourceNotFoundException', `Client ${ClientId} not found.`, 404);

  const users = poolUsers.get(found.userPoolId) ?? [];
  const userIndex = users.findIndex((u) => u.username === Username);
  if (userIndex === -1) return error('UserNotFoundException', 'User does not exist.');

  poolUsers.set(found.userPoolId, users.map((u, i) =>
    i === userIndex ? { ...u, userStatus: 'CONFIRMED' } : u
  ));
  return json({});
}

export function GlobalSignOut(_req: ParsedApiRequest): ApiResponse {
  return json({});
}

export function GetUser(req: ParsedApiRequest): ApiResponse {
  const { AccessToken } = req.body;
  if (!AccessToken) return error('ValidationException', 'AccessToken is required');

  let username: string | undefined;
  let userPoolId: string | undefined;
  try {
    const parts = AccessToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    username = payload['cognito:username'] ?? payload.sub;
    const iss = payload.iss;
    if (iss) userPoolId = iss.split('/').pop();
  } catch {
    return error('NotAuthorizedException', 'Invalid access token.');
  }

  if (!username) return error('NotAuthorizedException', 'Invalid access token.');

  if (userPoolId) {
    const users = poolUsers.get(userPoolId) ?? [];
    const user = users.find((u) => u.username === username);
    if (user) {
      return json({ Username: user.username, UserAttributes: user.attributes });
    }
  }

  for (const [, users] of poolUsers) {
    const user = users.find((u) => u.username === username);
    if (user) {
      return json({ Username: user.username, UserAttributes: user.attributes });
    }
  }

  return error('UserNotFoundException', 'User does not exist.');
}
