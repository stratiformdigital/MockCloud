import { STSClient } from '@aws-sdk/client-sts';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { IAMClient } from '@aws-sdk/client-iam';
import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { APIGatewayClient } from '@aws-sdk/client-api-gateway';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { KMSClient } from '@aws-sdk/client-kms';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient } from '@aws-sdk/client-ssm';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { WAFV2Client } from '@aws-sdk/client-wafv2';

export function getTestEndpoint(): string {
  const endpoint = process.env.MOCKCLOUD_TEST_ENDPOINT;
  if (!endpoint) {
    throw new Error('MOCKCLOUD_TEST_ENDPOINT must be set. Run tests via scripts/test.sh or scripts/run-with-server.sh.');
  }
  return endpoint;
}

const ENDPOINT = getTestEndpoint();
const REGION = 'us-east-1';

const commonConfig = {
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: 'AKIANAWSEXAMPLE',
    secretAccessKey: 'mockcloud-secret-key-1234567890',
  },
  maxAttempts: 1,
  tls: { rejectUnauthorized: false },
};

export function createSTSClient(): STSClient {
  return new STSClient(commonConfig);
}

export function createS3Client(): S3Client {
  return new S3Client({
    ...commonConfig,
    forcePathStyle: true,
  });
}

export function createDynamoDBClient(): DynamoDBClient {
  return new DynamoDBClient(commonConfig);
}

export function createLambdaClient(): LambdaClient {
  return new LambdaClient(commonConfig);
}

export function createIAMClient(): IAMClient {
  return new IAMClient(commonConfig);
}

export function createCloudFormationClient(): CloudFormationClient {
  return new CloudFormationClient(commonConfig);
}

export function createSecretsManagerClient(): SecretsManagerClient {
  return new SecretsManagerClient(commonConfig);
}

export function createAPIGatewayClient(): APIGatewayClient {
  return new APIGatewayClient(commonConfig);
}

export function createEventBridgeClient(): EventBridgeClient {
  return new EventBridgeClient(commonConfig);
}

export function createKMSClient(): KMSClient {
  return new KMSClient(commonConfig);
}

export function createEC2Client(): EC2Client {
  return new EC2Client(commonConfig);
}

export function createSSMClient(): SSMClient {
  return new SSMClient(commonConfig);
}

export function createLogsClient(): CloudWatchLogsClient {
  return new CloudWatchLogsClient(commonConfig);
}

export function createCognitoIdpClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient(commonConfig);
}

export function createCognitoIdentityClient(): CognitoIdentityClient {
  return new CognitoIdentityClient(commonConfig);
}

export function createWAFv2Client(): WAFV2Client {
  return new WAFV2Client(commonConfig);
}
