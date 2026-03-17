import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { waitForDynamoLocal } from '../../../dynamodb/local.js';
import { debug } from '../../../../util/logger.js';

async function dynamoFetch(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const port = await waitForDynamoLocal();
  const res = await fetch(`http://localhost:${port}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.0',
      'X-Amz-Target': `DynamoDB_20120810.${action}`,
      'Authorization': 'AWS4-HMAC-SHA256 Credential=AKIANAWSEXAMPLEKEY00/20260101/us-east-1/dynamodb/aws4_request, SignedHeaders=content-type;host;x-amz-target, Signature=mockcloud',
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export const dynamodbTableProvider: ResourceProvider = {
  type: 'AWS::DynamoDB::Table',
  async create(logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): Promise<ProvisionResult> {
    const tableName = (properties.TableName as string) ?? `${context.stackName}-${logicalId}`;
    const keySchema = (properties.KeySchema as Array<{ AttributeName: string; KeyType: string }>) ?? [];
    const attributeDefinitions = (properties.AttributeDefinitions as Array<{ AttributeName: string; AttributeType: string }>) ?? [];
    const billingMode = (properties.BillingMode as string) ?? 'PROVISIONED';

    const params: Record<string, unknown> = {
      TableName: tableName,
      KeySchema: keySchema,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: billingMode,
    };

    if (billingMode === 'PROVISIONED') {
      const pt = properties.ProvisionedThroughput as Record<string, unknown> | undefined;
      params.ProvisionedThroughput = {
        ReadCapacityUnits: Number(pt?.ReadCapacityUnits) || 5,
        WriteCapacityUnits: Number(pt?.WriteCapacityUnits) || 5,
      };
    }

    await dynamoFetch('CreateTable', params);

    const tableArn = `arn:aws:dynamodb:${context.region}:${context.accountId}:table/${tableName}`;
    return {
      physicalId: tableName,
      attributes: {
        Arn: tableArn,
        StreamArn: `${tableArn}/stream/${new Date().toISOString()}`,
      },
    };
  },
  async update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, context: ProvisionContext): Promise<ProvisionResult> {
    const params: Record<string, unknown> = { TableName: physicalId };
    const billingMode = properties.BillingMode as string | undefined;

    if (billingMode) {
      params.BillingMode = billingMode;
    }

    if (billingMode === 'PROVISIONED' && properties.ProvisionedThroughput) {
      const pt = properties.ProvisionedThroughput as Record<string, unknown>;
      params.ProvisionedThroughput = {
        ReadCapacityUnits: Number(pt.ReadCapacityUnits) || 5,
        WriteCapacityUnits: Number(pt.WriteCapacityUnits) || 5,
      };
    }

    if (properties.AttributeDefinitions) {
      params.AttributeDefinitions = properties.AttributeDefinitions;
    }

    await dynamoFetch('UpdateTable', params);

    const tableArn = `arn:aws:dynamodb:${context.region}:${context.accountId}:table/${physicalId}`;
    return {
      physicalId,
      attributes: {
        Arn: tableArn,
        StreamArn: `${tableArn}/stream/${new Date().toISOString()}`,
      },
    };
  },
  async delete(physicalId: string): Promise<void> {
    try {
      await dynamoFetch('DeleteTable', { TableName: physicalId });
    } catch (err) {
      debug(`DynamoDB table delete ${physicalId}: ${err instanceof Error ? err.message : err}`);
    }
  },
};
