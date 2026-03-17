import { defineMockService } from '../service.js';
import type { ApiResponse } from '../../types.js';
import { ACCOUNT_ID } from '../../config.js';

const xml = (body: string): ApiResponse => ({
  statusCode: 200,
  headers: { 'Content-Type': 'text/xml' },
  body,
});

export const stsService = defineMockService({
  name: 'sts',
  hostPatterns: ['sts.*.amazonaws.com', 'sts.amazonaws.com'],
  protocol: 'query',
  signingName: 'sts',
  handlers: {
    GetCallerIdentity: () =>
      xml(`<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <GetCallerIdentityResult>
    <Arn>arn:aws:iam::${ACCOUNT_ID}:user/mockcloud-user</Arn>
    <UserId>AIDANAWSEXAMPLEUSER</UserId>
    <Account>${ACCOUNT_ID}</Account>
  </GetCallerIdentityResult>
  <ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata>
</GetCallerIdentityResponse>`),

    GetSessionToken: () =>
      xml(`<GetSessionTokenResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <GetSessionTokenResult>
    <Credentials>
      <AccessKeyId>ASIANAWSEXAMPLEKEY</AccessKeyId>
      <SecretAccessKey>mockcloud-secret-key</SecretAccessKey>
      <SessionToken>mockcloud-session-token</SessionToken>
      <Expiration>2099-12-31T23:59:59Z</Expiration>
    </Credentials>
  </GetSessionTokenResult>
  <ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata>
</GetSessionTokenResponse>`),

    AssumeRole: () =>
      xml(`<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIANAWSEXAMPLEKEY</AccessKeyId>
      <SecretAccessKey>mockcloud-secret-key</SecretAccessKey>
      <SessionToken>mockcloud-session-token</SessionToken>
      <Expiration>2099-12-31T23:59:59Z</Expiration>
    </Credentials>
    <AssumedRoleUser>
      <AssumedRoleId>AROANAWSEXAMPLE:session</AssumedRoleId>
      <Arn>arn:aws:sts::${ACCOUNT_ID}:assumed-role/mockcloud-role/session</Arn>
    </AssumedRoleUser>
  </AssumeRoleResult>
  <ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata>
</AssumeRoleResponse>`),

    _default: () =>
      xml(`<Response xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <ResponseMetadata><RequestId>00000000-0000-0000-0000-000000000000</RequestId></ResponseMetadata>
</Response>`),
  },
});
