import { CloudFormationClient } from '@aws-sdk/client-cloudformation';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { IAMClient } from '@aws-sdk/client-iam';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { APIGatewayClient } from '@aws-sdk/client-api-gateway';
import { SSMClient } from '@aws-sdk/client-ssm';
import { KMSClient } from '@aws-sdk/client-kms';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { EC2Client } from '@aws-sdk/client-ec2';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { WAFV2Client } from '@aws-sdk/client-wafv2';

export const ENDPOINT = 'http://localhost:4444';
const CREDENTIALS = { accessKeyId: 'AKIANAWSEXAMPLEKEY00', secretAccessKey: 'mockcloud-secret-key' };
const REGION = 'us-east-1';

const config = { endpoint: ENDPOINT, credentials: CREDENTIALS, region: REGION };

export const cfn = new CloudFormationClient(config);
export const lambda = new LambdaClient(config);
export const dynamodb = new DynamoDBClient(config);
export const s3 = new S3Client({ ...config, forcePathStyle: true });
export const iam = new IAMClient(config);
export const cognitoIdp = new CognitoIdentityProviderClient(config);
export const cognitoIdentity = new CognitoIdentityClient(config);
export const apigateway = new APIGatewayClient(config);
export const ssm = new SSMClient(config);
export const kms = new KMSClient(config);
export const logs = new CloudWatchLogsClient(config);
export const eventbridge = new EventBridgeClient(config);
export const ec2 = new EC2Client(config);
export const secretsmanager = new SecretsManagerClient(config);
export const wafv2 = new WAFV2Client(config);
