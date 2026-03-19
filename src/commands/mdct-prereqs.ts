import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseDotenv } from 'dotenv';
import {
  App,
  SecretValue,
  Stack,
  aws_iam as iam,
  aws_secretsmanager as secretsmanager,
  type StackProps,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ACCOUNT_ID, REGION } from '../config.js';

export function loadMdctAppEnv(appDir: string): void {
  const envFile = resolve(appDir, '.env');
  if (!existsSync(envFile)) return;

  const parsed = parseDotenv(readFileSync(envFile, 'utf-8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

class MockCloudPrereqsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const app = process.env.PROJECT!;

    new secretsmanager.Secret(this, 'DefaultSecret', {
      secretName: `${app}-default`,
      secretObjectValue: {
        vpcName: SecretValue.unsafePlainText('mockcloud-dev'),
        brokerString: SecretValue.unsafePlainText('localstack'),
        kafkaAuthorizedSubnetIds: SecretValue.unsafePlainText('subnet-mockcloud0004'),
        oktaMetadataUrl: SecretValue.unsafePlainText('localstack'),
        launchDarklyClient: SecretValue.unsafePlainText(process.env.REACT_APP_LD_SDK_CLIENT || 'localstack'),
        launchDarklyServer: SecretValue.unsafePlainText(process.env.LD_SDK_KEY || 'localstack'),
        redirectSignout: SecretValue.unsafePlainText('http://localhost:3000'),
        docraptorApiKey: SecretValue.unsafePlainText(process.env.docraptorApiKey || 'localstack'),
        mpriamrole: SecretValue.unsafePlainText(`arn:aws:iam::${ACCOUNT_ID}:role/mockcloud-mpriamrole`),
        mprdeviam: SecretValue.unsafePlainText(`arn:aws:iam::${ACCOUNT_ID}:role/mockcloud-mprdeviam`),
        vpnIpSetArn: SecretValue.unsafePlainText(`arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:regional/ipset/mockcloud-vpn-ipv4/00000000-0000-0000-0000-000000000001`),
        vpnIpv6SetArn: SecretValue.unsafePlainText(`arn:aws:wafv2:${REGION}:${ACCOUNT_ID}:regional/ipset/mockcloud-vpn-ipv6/00000000-0000-0000-0000-000000000002`),
      },
    });

    new iam.ManagedPolicy(this, 'ADORestrictionPolicy', {
      managedPolicyName: 'ADO-Restriction-Policy',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['*'],
          resources: ['*'],
        }),
      ],
    });

    new iam.ManagedPolicy(this, 'CMSApprovedAWSServices', {
      managedPolicyName: 'CMSApprovedAWSServices',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['*'],
          resources: ['*'],
        }),
      ],
    });
  }
}

async function main() {
  const app = new App();
  new MockCloudPrereqsStack(app, `${process.env.PROJECT!}-mockcloud-prereqs`);
  app.synth();
}
if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
