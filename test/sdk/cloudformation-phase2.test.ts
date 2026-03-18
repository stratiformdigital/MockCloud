import { describe, test, expect } from 'vitest';
import {
  CreateStackCommand,
  UpdateStackCommand,
  DescribeStacksCommand,
  DescribeStackResourcesCommand,
  DeleteStackCommand,
} from '@aws-sdk/client-cloudformation';
import { GetFunctionCommand } from '@aws-sdk/client-lambda';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import {
  createCloudFormationClient,
  createLambdaClient,
  createLogsClient,
  createSSMClient,
} from './client-factory.js';

const TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: '2010-09-09',
  Description: 'Phase 2 test: new providers, conditions, update',
  Parameters: {
    Env: { Type: 'String', Default: 'staging' },
    CreateLogGroup: { Type: 'String', Default: 'true' },
  },
  Conditions: {
    ShouldCreateLogGroup: { 'Fn::Equals': [{ Ref: 'CreateLogGroup' }, 'true'] },
    ShouldNotCreate: { 'Fn::Equals': [{ Ref: 'CreateLogGroup' }, 'nope'] },
  },
  Resources: {
    MyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: { 'Fn::Sub': 'p2-${Env}-fn' },
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
        Role: 'arn:aws:iam::000000000000:role/fake-role',
      },
    },
    MyParam: {
      Type: 'AWS::SSM::Parameter',
      Properties: {
        Name: { 'Fn::Sub': '/p2/${Env}/config' },
        Type: 'String',
        Value: 'hello-world',
      },
    },
    MyLogGroup: {
      Type: 'AWS::Logs::LogGroup',
      Condition: 'ShouldCreateLogGroup',
      Properties: {
        LogGroupName: { 'Fn::Sub': '/p2/${Env}/logs' },
        RetentionInDays: 7,
      },
    },
    SkippedResource: {
      Type: 'AWS::Logs::LogGroup',
      Condition: 'ShouldNotCreate',
      Properties: {
        LogGroupName: '/p2/should-not-exist',
      },
    },
  },
  Outputs: {
    FunctionArn: {
      Value: { 'Fn::GetAtt': ['MyFunction', 'Arn'] },
    },
    ConditionalOutput: {
      Condition: 'ShouldNotCreate',
      Value: 'should-not-appear',
    },
  },
});

const UPDATED_TEMPLATE = JSON.stringify({
  AWSTemplateFormatVersion: '2010-09-09',
  Parameters: {
    Env: { Type: 'String', Default: 'staging' },
  },
  Resources: {
    MyFunction: {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: { 'Fn::Sub': 'p2-${Env}-fn' },
        Runtime: 'nodejs20.x',
        Handler: 'app.handler',
        Role: 'arn:aws:iam::000000000000:role/updated-role',
      },
    },
    MyParam: {
      Type: 'AWS::SSM::Parameter',
      Properties: {
        Name: { 'Fn::Sub': '/p2/${Env}/config' },
        Type: 'String',
        Value: 'updated-value',
      },
    },
    NewBucket: {
      Type: 'AWS::S3::Bucket',
      Properties: {
        BucketName: 'p2-update-bucket',
      },
    },
  },
  Outputs: {
    FunctionArn: {
      Value: { 'Fn::GetAtt': ['MyFunction', 'Arn'] },
    },
  },
});

describe('CloudFormation Phase 2', () => {
  test('CreateStack with conditions, verify resources and outputs, UpdateStack, DeleteStack', async () => {
    const cf = createCloudFormationClient();
    const lambda = createLambdaClient();
    const logs = createLogsClient();
    const ssm = createSSMClient();
    const stackName = `cf-phase2-test-${Date.now()}`;

    console.log('Phase 2: CreateStack with conditions...');
    await cf.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: TEMPLATE,
      Parameters: [
        { ParameterKey: 'Env', ParameterValue: 'staging' },
        { ParameterKey: 'CreateLogGroup', ParameterValue: 'true' },
      ],
    }));

    console.log('Phase 2: DescribeStacks...');
    const desc = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    const stack = desc.Stacks?.[0];
    expect(stack?.StackStatus).toBe('CREATE_COMPLETE');
    console.log('  Status:', stack?.StackStatus);

    console.log('Phase 2: Check resources (conditions)...');
    const res = await cf.send(new DescribeStackResourcesCommand({ StackName: stackName }));
    const resourceIds = res.StackResources!.map(r => r.LogicalResourceId).sort();
    expect(resourceIds.includes('MyFunction')).toBeTruthy();
    expect(resourceIds.includes('MyParam')).toBeTruthy();
    expect(resourceIds.includes('MyLogGroup')).toBeTruthy();
    expect(resourceIds.includes('SkippedResource')).toBeFalsy();
    console.log('  Resources:', resourceIds.join(', '));
    console.log('  SkippedResource correctly excluded by condition');

    console.log('Phase 2: Check outputs (conditional output excluded)...');
    const outputs = stack!.Outputs!;
    const fnArn = outputs.find(o => o.OutputKey === 'FunctionArn');
    expect(fnArn).toBeTruthy();
    expect(fnArn!.OutputValue?.includes('p2-staging-fn')).toBeTruthy();
    const conditionalOut = outputs.find(o => o.OutputKey === 'ConditionalOutput');
    expect(conditionalOut).toBeFalsy();
    console.log('  FunctionArn:', fnArn!.OutputValue);
    console.log('  ConditionalOutput correctly excluded');

    console.log('Phase 2: Verify Lambda function exists...');
    const fnResult = await lambda.send(new GetFunctionCommand({ FunctionName: 'p2-staging-fn' }));
    expect(fnResult.Configuration?.FunctionName).toBe('p2-staging-fn');
    expect(fnResult.Configuration?.Runtime).toBe('nodejs20.x');
    console.log('  Lambda p2-staging-fn exists, runtime:', fnResult.Configuration?.Runtime);

    console.log('Phase 2: UpdateStack...');
    await cf.send(new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: UPDATED_TEMPLATE,
      Parameters: [{ ParameterKey: 'Env', ParameterValue: 'staging' }],
    }));

    const afterUpdate = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
    const updatedStack = afterUpdate.Stacks?.[0];
    expect(updatedStack?.StackStatus).toBe('UPDATE_COMPLETE');
    console.log('  Status after update:', updatedStack?.StackStatus);

    const updatedRes = await cf.send(new DescribeStackResourcesCommand({ StackName: stackName }));
    const updatedIds = updatedRes.StackResources!.map(r => r.LogicalResourceId).sort();
    expect(updatedIds.includes('NewBucket')).toBeTruthy();
    expect(updatedIds.includes('MyLogGroup')).toBeFalsy();
    console.log('  Updated resources:', updatedIds.join(', '));

    const logGroupResult = await logs.send(new DescribeLogGroupsCommand({
      logGroupNamePrefix: '/p2/staging/logs',
    }));
    expect(logGroupResult.logGroups ?? []).toHaveLength(0);

    console.log('Phase 2: DeleteStack...');
    await cf.send(new DeleteStackCommand({ StackName: stackName }));
    await expect(lambda.send(new GetFunctionCommand({ FunctionName: 'p2-staging-fn' }))).rejects.toThrow();
    await expect(ssm.send(new GetParameterCommand({ Name: '/p2/staging/config' }))).rejects.toThrow();
    console.log('  Deleted');
  });
});
