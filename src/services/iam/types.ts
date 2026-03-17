import type { Role, Policy, User } from '@aws-sdk/client-iam';
import type { ApiResponse } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import { ServiceError } from '../response.js';
import { ACCOUNT_ID } from '../../config.js';

function isoNow(): string {
  return new Date().toISOString();
}

type Definite<T, K extends keyof T> = { [P in K]-?: NonNullable<T[P]> };

export interface StoredRole extends Definite<Role, 'Path' | 'RoleName' | 'RoleId' | 'Arn' | 'AssumeRolePolicyDocument' | 'Description'> {
  CreateDate: string;
  inlinePolicies: Map<string, string>;
  attachedPolicies: string[];
}

export interface StoredPolicy extends Definite<Policy, 'PolicyName' | 'PolicyId' | 'Arn' | 'Path' | 'DefaultVersionId' | 'AttachmentCount'> {
  CreateDate: string;
  versions: Map<string, string>;
}

export interface StoredUser extends Definite<User, 'Path' | 'UserName' | 'UserId' | 'Arn'> {
  CreateDate: string;
}

export interface StoredOidcProvider {
  Arn: string;
  Url: string;
  ClientIDList: string[];
  ThumbprintList: string[];
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomAlphanumeric(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)];
  return out;
}

export function generateRoleId(): string {
  return 'AROA' + randomAlphanumeric(17);
}

export function generatePolicyId(): string {
  return 'ANPA' + randomAlphanumeric(17);
}

export function generateUserId(): string {
  return 'AIDA' + randomAlphanumeric(17);
}

export function roleArn(path: string, name: string): string {
  const p = path === '/' ? '' : path;
  return `arn:aws:iam::${ACCOUNT_ID}:role/${p}${name}`;
}

export function policyArn(path: string, name: string): string {
  const p = path === '/' ? '' : path;
  return `arn:aws:iam::${ACCOUNT_ID}:policy/${p}${name}`;
}

export function userArn(name: string): string {
  return `arn:aws:iam::${ACCOUNT_ID}:user/${name}`;
}

export const NS = 'https://iam.amazonaws.com/doc/2010-05-08/';
export const META = '<ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata>';

export function xml(body: string): ApiResponse {
  return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body };
}

export function iamError(code: string, message: string, status = 400): ApiResponse {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/xml' },
    body: `<ErrorResponse xmlns="${NS}"><Error><Type>Sender</Type><Code>${code}</Code><Message>${message}</Message></Error>${META}</ErrorResponse>`,
  };
}

const roles = new PersistentMap<string, StoredRole>('iam-roles');
const policies = new PersistentMap<string, StoredPolicy>('iam-policies');
const users = new PersistentMap<string, StoredUser>('iam-users');
const oidcProviders = new PersistentMap<string, StoredOidcProvider>('iam-oidc-providers');

export function getRolesStore(): Map<string, StoredRole> { return roles; }
export function getPoliciesStore(): Map<string, StoredPolicy> { return policies; }
export function getUsersStore(): Map<string, StoredUser> { return users; }
export function getOidcProvidersStore(): Map<string, StoredOidcProvider> { return oidcProviders; }

export function createOidcProvider(url: string, clientIdList: string[], thumbprintList: string[]): StoredOidcProvider {
  const normalizedUrl = url.replace(/^https?:\/\//, '');
  const arn = `arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${normalizedUrl}`;
  if (oidcProviders.has(arn)) {
    throw new ServiceError('EntityAlreadyExists', `An OIDC provider already exists with url ${normalizedUrl}`, 409);
  }
  const provider: StoredOidcProvider = {
    Arn: arn,
    Url: normalizedUrl,
    ClientIDList: clientIdList,
    ThumbprintList: thumbprintList,
  };
  oidcProviders.set(arn, provider);
  return provider;
}

export interface CreateRoleParams {
  roleName: string;
  path?: string;
  assumeRolePolicyDocument: string;
  description?: string;
  inlinePolicies?: Map<string, string>;
  attachedPolicies?: string[];
}

export function createRole(params: CreateRoleParams): StoredRole {
  if (roles.has(params.roleName)) {
    throw new ServiceError('EntityAlreadyExists', `Role with name ${params.roleName} already exists.`, 409);
  }
  const path = params.path || '/';
  const role: StoredRole = {
    RoleName: params.roleName,
    RoleId: generateRoleId(),
    Arn: roleArn(path, params.roleName),
    Path: path,
    AssumeRolePolicyDocument: params.assumeRolePolicyDocument,
    CreateDate: isoNow(),
    Description: params.description ?? '',
    inlinePolicies: params.inlinePolicies ?? new Map(),
    attachedPolicies: params.attachedPolicies ?? [],
  };
  roles.set(params.roleName, role);
  return role;
}

export function deleteRole(roleName: string): void {
  if (!roles.has(roleName)) {
    throw new ServiceError('NoSuchEntity', `Role ${roleName} not found.`, 404);
  }
  roles.delete(roleName);
}

