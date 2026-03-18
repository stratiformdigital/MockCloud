import { describe, test, expect } from 'vitest';
import {
  PutRuleCommand,
  DescribeRuleCommand,
  ListRulesCommand,
  PutTargetsCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
} from '@aws-sdk/client-eventbridge';
import { createEventBridgeClient } from './client-factory.js';

describe('EventBridge', () => {
  const client = createEventBridgeClient();

  test('CRUD lifecycle', async () => {
    const timestamp = Date.now();
    const ruleName = `test-rule-${timestamp}`;

    const putRuleResult = await client.send(new PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: 'rate(1 hour)',
    }));
    expect(putRuleResult.RuleArn).toBeTruthy();

    const describeResult = await client.send(new DescribeRuleCommand({
      Name: ruleName,
    }));
    expect(describeResult.Name).toBe(ruleName);
    expect(describeResult.ScheduleExpression).toBe('rate(1 hour)');

    const listResult = await client.send(new ListRulesCommand({}));
    expect(Array.isArray(listResult.Rules)).toBe(true);
    expect(listResult.Rules!.some(r => r.Name === ruleName)).toBe(true);

    await client.send(new PutTargetsCommand({
      Rule: ruleName,
      Targets: [{
        Id: 'target1',
        Arn: 'arn:aws:lambda:us-east-1:000000000000:function:test',
      }],
    }));

    const targetsResult = await client.send(new ListTargetsByRuleCommand({
      Rule: ruleName,
    }));
    expect(Array.isArray(targetsResult.Targets)).toBe(true);
    expect(targetsResult.Targets!.some(t => t.Id === 'target1')).toBe(true);

    await client.send(new RemoveTargetsCommand({
      Rule: ruleName,
      Ids: ['target1'],
    }));

    await client.send(new DeleteRuleCommand({
      Name: ruleName,
    }));
  });

  test('DescribeRule on nonexistent rule returns ResourceNotFoundException', async () => {
    try {
      await client.send(new DescribeRuleCommand({
        Name: 'nonexistent-rule-xyz',
      }));
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.name).toBe('ResourceNotFoundException');
    }
  });
});
