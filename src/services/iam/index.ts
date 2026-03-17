import { defineMockService } from '../service.js';
import { xml, iamError, NS, META, getUsersStore, getOidcProvidersStore, createOidcProvider, generateUserId, userArn } from './types.js';
import type { StoredUser } from './types.js';
import { ServiceError } from '../response.js';
import {
  CreateRole, GetRole, ListRoles, DeleteRole,
  PutRolePolicy, GetRolePolicy, DeleteRolePolicy, ListRolePolicies,
  AttachRolePolicy, ListAttachedRolePolicies, UpdateAssumeRolePolicy,
} from './roles.js';
import {
  CreatePolicy, GetPolicy, ListPolicies, DeletePolicy,
  GetPolicyVersion, CreatePolicyVersion,
} from './policies.js';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function userFieldsXml(u: StoredUser): string {
  return `<Path>${u.Path}</Path>
      <UserName>${u.UserName}</UserName>
      <UserId>${u.UserId}</UserId>
      <Arn>${u.Arn}</Arn>
      <CreateDate>${u.CreateDate}</CreateDate>`;
}

function userXml(u: StoredUser): string {
  return `<User>
      ${userFieldsXml(u)}
    </User>`;
}

export const iamService = defineMockService({
  name: 'iam',
  hostPatterns: ['iam.amazonaws.com'],
  protocol: 'query',
  signingName: 'iam',
  handlers: {
    CreateRole,
    GetRole,
    ListRoles,
    DeleteRole,
    PutRolePolicy,
    GetRolePolicy,
    DeleteRolePolicy,
    ListRolePolicies,
    AttachRolePolicy,
    ListAttachedRolePolicies,
    UpdateAssumeRolePolicy,

    CreatePolicy,
    GetPolicy,
    ListPolicies,
    DeletePolicy,
    GetPolicyVersion,
    CreatePolicyVersion,

    GetUser: (req) => {
      const users = getUsersStore();
      const name = str(req.body['UserName']) || 'mockcloud-user';
      const user = users.get(name);
      if (!user) return iamError('NoSuchEntity', `User ${name} not found.`, 404);

      return xml(`<GetUserResponse xmlns="${NS}">
  <GetUserResult>${userXml(user)}</GetUserResult>
  ${META}
</GetUserResponse>`);
    },

    ListUsers: () => {
      const users = getUsersStore();
      const members = Array.from(users.values()).map((u) => `<member>${userFieldsXml(u)}</member>`).join('');

      return xml(`<ListUsersResponse xmlns="${NS}">
  <ListUsersResult><Users>${members}</Users><IsTruncated>false</IsTruncated></ListUsersResult>
  ${META}
</ListUsersResponse>`);
    },

    CreateUser: (req) => {
      const users = getUsersStore();
      const name = str(req.body['UserName']);
      if (!name) return iamError('ValidationError', 'UserName is required');
      if (users.has(name)) return iamError('EntityAlreadyExists', `User ${name} already exists.`, 409);

      const user: StoredUser = {
        UserName: name,
        UserId: generateUserId(),
        Arn: userArn(name),
        Path: str(req.body['Path']) || '/',
        CreateDate: new Date().toISOString(),
      };
      users.set(name, user);

      return xml(`<CreateUserResponse xmlns="${NS}">
  <CreateUserResult>${userXml(user)}</CreateUserResult>
  ${META}
</CreateUserResponse>`);
    },

    ListAccountAliases: () =>
      xml(`<ListAccountAliasesResponse xmlns="${NS}">
  <ListAccountAliasesResult><AccountAliases/><IsTruncated>false</IsTruncated></ListAccountAliasesResult>
  ${META}
</ListAccountAliasesResponse>`),

    ListAttachedUserPolicies: () =>
      xml(`<ListAttachedUserPoliciesResponse xmlns="${NS}">
  <ListAttachedUserPoliciesResult><AttachedPolicies/><IsTruncated>false</IsTruncated></ListAttachedUserPoliciesResult>
  ${META}
</ListAttachedUserPoliciesResponse>`),

    ListAccessKeys: () =>
      xml(`<ListAccessKeysResponse xmlns="${NS}">
  <ListAccessKeysResult><AccessKeyMetadata/><IsTruncated>false</IsTruncated></ListAccessKeysResult>
  ${META}
</ListAccessKeysResponse>`),

    ListMFADevices: () =>
      xml(`<ListMFADevicesResponse xmlns="${NS}">
  <ListMFADevicesResult><MFADevices/><IsTruncated>false</IsTruncated></ListMFADevicesResult>
  ${META}
</ListMFADevicesResponse>`),

    ListGroupsForUser: () =>
      xml(`<ListGroupsForUserResponse xmlns="${NS}">
  <ListGroupsForUserResult><Groups/><IsTruncated>false</IsTruncated></ListGroupsForUserResult>
  ${META}
</ListGroupsForUserResponse>`),

    ListUserPolicies: () =>
      xml(`<ListUserPoliciesResponse xmlns="${NS}">
  <ListUserPoliciesResult><PolicyNames/><IsTruncated>false</IsTruncated></ListUserPoliciesResult>
  ${META}
</ListUserPoliciesResponse>`),

    ListGroups: () =>
      xml(`<ListGroupsResponse xmlns="${NS}">
  <ListGroupsResult><Groups/><IsTruncated>false</IsTruncated></ListGroupsResult>
  ${META}
</ListGroupsResponse>`),

    GetAccountAuthorizationDetails: () =>
      xml(`<GetAccountAuthorizationDetailsResponse xmlns="${NS}">
  <GetAccountAuthorizationDetailsResult>
    <UserDetailList/><GroupDetailList/><RoleDetailList/><Policies/><IsTruncated>false</IsTruncated>
  </GetAccountAuthorizationDetailsResult>
  ${META}
</GetAccountAuthorizationDetailsResponse>`),

    GenerateCredentialReport: () =>
      xml(`<GenerateCredentialReportResponse xmlns="${NS}">
  <GenerateCredentialReportResult><State>COMPLETE</State></GenerateCredentialReportResult>
  ${META}
</GenerateCredentialReportResponse>`),

    GetCredentialReport: () =>
      xml(`<GetCredentialReportResponse xmlns="${NS}">
  <GetCredentialReportResult>
    <Content>${Buffer.from('user,arn,user_creation_time,password_enabled,password_last_used,password_last_changed,password_next_rotation,mfa_active,access_key_1_active,access_key_1_last_rotated,access_key_1_last_used_date,access_key_1_last_used_region,access_key_1_last_used_service,access_key_2_active,access_key_2_last_rotated,access_key_2_last_used_date,access_key_2_last_used_region,access_key_2_last_used_service,cert_1_active,cert_1_last_rotated,cert_2_active,cert_2_last_rotated\n').toString('base64')}</Content>
    <ReportFormat>text/csv</ReportFormat>
    <GeneratedTime>${new Date().toISOString()}</GeneratedTime>
  </GetCredentialReportResult>
  ${META}
</GetCredentialReportResponse>`),

    ListAccessKeyLastUsedForMultipleAccessKeys: (req) => {
      if ((req.headers['content-type'] ?? '').includes('amz-json')) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/x-amz-json-1.0' },
          body: JSON.stringify({ AccessKeyLastUsedDetails: [] }),
        };
      }
      return xml(`<ListAccessKeyLastUsedForMultipleAccessKeysResponse xmlns="${NS}">
  <ListAccessKeyLastUsedForMultipleAccessKeysResult><AccessKeyLastUsedDetails/></ListAccessKeyLastUsedForMultipleAccessKeysResult>
  ${META}
</ListAccessKeyLastUsedForMultipleAccessKeysResponse>`);
    },

    GetAccountSummary: () =>
      xml(`<GetAccountSummaryResponse xmlns="${NS}">
  <GetAccountSummaryResult>
    <SummaryMap>
      <entry><key>Users</key><value>0</value></entry>
      <entry><key>Roles</key><value>0</value></entry>
      <entry><key>Groups</key><value>0</value></entry>
      <entry><key>Policies</key><value>0</value></entry>
      <entry><key>UsersQuota</key><value>5000</value></entry>
      <entry><key>RolesQuota</key><value>1000</value></entry>
      <entry><key>GroupsQuota</key><value>300</value></entry>
      <entry><key>PoliciesQuota</key><value>1500</value></entry>
      <entry><key>MFADevices</key><value>0</value></entry>
      <entry><key>AccountMFAEnabled</key><value>0</value></entry>
      <entry><key>AccessKeysPerUserQuota</key><value>2</value></entry>
      <entry><key>ServerCertificates</key><value>0</value></entry>
    </SummaryMap>
  </GetAccountSummaryResult>
  ${META}
</GetAccountSummaryResponse>`),

    GetLoginProfile: (req) => iamError('NoSuchEntity', `Login Profile for user ${req.body['UserName'] || 'unknown'} cannot be found.`, 404),

    CreateOpenIDConnectProvider: (req) => {
      const url = str(req.body['Url']);
      if (!url) return iamError('ValidationError', 'Url is required');
      try {
        const provider = createOidcProvider(
          url,
          (req.body['ClientIDList'] as string[]) ?? [],
          (req.body['ThumbprintList'] as string[]) ?? [],
        );
        return xml(`<CreateOpenIDConnectProviderResponse xmlns="${NS}">
  <CreateOpenIDConnectProviderResult><OpenIDConnectProviderArn>${provider.Arn}</OpenIDConnectProviderArn></CreateOpenIDConnectProviderResult>
  ${META}
</CreateOpenIDConnectProviderResponse>`);
      } catch (e) {
        if (e instanceof ServiceError) return iamError(e.code, e.message, e.statusCode);
        throw e;
      }
    },

    ListOpenIDConnectProviders: () => {
      const providers = getOidcProvidersStore();
      const members = Array.from(providers.values()).map((p) => `<member><Arn>${p.Arn}</Arn></member>`).join('');
      return xml(`<ListOpenIDConnectProvidersResponse xmlns="${NS}">
  <ListOpenIDConnectProvidersResult><OpenIDConnectProviderList>${members}</OpenIDConnectProviderList></ListOpenIDConnectProvidersResult>
  ${META}
</ListOpenIDConnectProvidersResponse>`);
    },

    _default: (req) => {
      if ((req.headers['content-type'] ?? '').includes('amz-json')) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/x-amz-json-1.0' }, body: '{}' };
      }
      return xml(`<Response xmlns="${NS}">${META}</Response>`);
    },
  },
});
