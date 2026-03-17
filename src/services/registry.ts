import type { MockServiceDefinition } from '../types.js';
import { stsService } from './sts/index.js';
import { iamService } from './iam/index.js';
import { s3Service } from './s3/index.js';
import { ec2Service } from './ec2/index.js';
import { lambdaService } from './lambda/index.js';
import { dynamodbService } from './dynamodb/index.js';
import { cloudformationService } from './cloudformation/index.js';
import { apiGatewayService } from './apigateway/index.js';
import { secretsmanagerService } from './secretsmanager/index.js';
import { cognitoIdpService } from './cognito-idp/index.js';
import { cognitoIdentityService } from './cognito-identity/index.js';
import { wafv2Service } from './wafv2/index.js';
import { kmsService } from './kms/index.js';
import { eventbridgeService } from './eventbridge/index.js';
import { ssmService } from './ssm/index.js';
import { logsService } from './logs/index.js';
import { monitoringService } from './monitoring/index.js';
import { guardDutyService } from './guardduty/index.js';

const ALL_SERVICES: MockServiceDefinition[] = [
  stsService,
  iamService,
  s3Service,
  ec2Service,
  lambdaService,
  dynamodbService,
  cloudformationService,
  apiGatewayService,
  secretsmanagerService,
  cognitoIdpService,
  cognitoIdentityService,
  wafv2Service,
  kmsService,
  eventbridgeService,
  ssmService,
  logsService,
  monitoringService,
  guardDutyService,
];

export function getAllMockServices(): MockServiceDefinition[] {
  return ALL_SERVICES;
}
