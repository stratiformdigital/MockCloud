import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkCards, ChalkLink, ChalkSpinner, ChalkBox } from '../../chalk';
import { ListStacksCommand, StackStatus } from '@aws-sdk/client-cloudformation';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { ListRolesCommand, ListPoliciesCommand } from '@aws-sdk/client-iam';
import { ListUserPoolsCommand } from '@aws-sdk/client-cognito-identity-provider';
import { ListIdentityPoolsCommand } from '@aws-sdk/client-cognito-identity';
import { GetRestApisCommand } from '@aws-sdk/client-api-gateway';
import { GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { ListKeysCommand } from '@aws-sdk/client-kms';
import { DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { ListRulesCommand } from '@aws-sdk/client-eventbridge';
import { DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import { ListWebACLsCommand } from '@aws-sdk/client-wafv2';
import {
  cfn, lambda, dynamodb, s3, iam, cognitoIdp, cognitoIdentity,
  apigateway, ssm, kms, logs, eventbridge, ec2,
  secretsmanager, wafv2, ENDPOINT,
} from '../../api/clients';
import {
  listAzureAppConfigSettings,
  listAzureApiManagementApis,
  listAzureContainers,
  listAzureCosmosDatabases,
  listAzureDefenderPlans,
  listAzureEventGridEvents,
  listAzureFunctions,
  listAzureGraphApplications,
  listAzureGraphGroups,
  listAzureGraphServicePrincipals,
  listAzureGraphUsers,
  listAzureKeys,
  listAzureManagedIdentities,
  listAzureMonitorTables,
  listAzureNetworkSecurityGroups,
  listAzureResourceGroups,
  listAzureRoleAssignments,
  listAzureSecrets,
  listAzureWafPolicies,
} from '../../api/azure';

interface ServiceCard {
  name: string;
  href: string;
  count: number | null;
}

const SERVICES: { name: string; href: string; fetch: () => Promise<number> }[] = [
  {
    name: 'CloudFormation',
    href: '/cloudformation',
    fetch: async () => {
      const res = await cfn.send(new ListStacksCommand({}));
      return (res.StackSummaries ?? []).filter(
        (s) => s.StackStatus !== StackStatus.DELETE_COMPLETE
      ).length;
    },
  },
  {
    name: 'Lambda',
    href: '/lambda',
    fetch: async () => {
      const res = await lambda.send(new ListFunctionsCommand({}));
      return (res.Functions ?? []).length;
    },
  },
  {
    name: 'DynamoDB',
    href: '/dynamodb',
    fetch: async () => {
      const res = await dynamodb.send(new ListTablesCommand({}));
      return (res.TableNames ?? []).length;
    },
  },
  {
    name: 'S3',
    href: '/s3',
    fetch: async () => {
      const res = await s3.send(new ListBucketsCommand({}));
      return (res.Buckets ?? []).length;
    },
  },
  {
    name: 'IAM Roles',
    href: '/iam',
    fetch: async () => {
      const res = await iam.send(new ListRolesCommand({}));
      return (res.Roles ?? []).length;
    },
  },
  {
    name: 'Cognito',
    href: '/cognito',
    fetch: async () => {
      const res = await cognitoIdp.send(new ListUserPoolsCommand({ MaxResults: 60 }));
      return (res.UserPools ?? []).length;
    },
  },
  {
    name: 'Identity Pools',
    href: '/cognito/identity-pools',
    fetch: async () => {
      const res = await cognitoIdentity.send(new ListIdentityPoolsCommand({ MaxResults: 60 }));
      return (res.IdentityPools ?? []).length;
    },
  },
  {
    name: 'API Gateway',
    href: '/apigateway',
    fetch: async () => {
      const res = await apigateway.send(new GetRestApisCommand({}));
      return (res.items ?? []).length;
    },
  },
  {
    name: 'SSM Parameters',
    href: '/ssm',
    fetch: async () => {
      const res = await ssm.send(new GetParametersByPathCommand({ Path: '/', Recursive: true }));
      return (res.Parameters ?? []).length;
    },
  },
  {
    name: 'KMS',
    href: '/kms',
    fetch: async () => {
      const res = await kms.send(new ListKeysCommand({}));
      return (res.Keys ?? []).length;
    },
  },
  {
    name: 'CloudWatch Logs',
    href: '/logs',
    fetch: async () => {
      const res = await logs.send(new DescribeLogGroupsCommand({}));
      return (res.logGroups ?? []).length;
    },
  },
  {
    name: 'EventBridge',
    href: '/eventbridge',
    fetch: async () => {
      const res = await eventbridge.send(new ListRulesCommand({}));
      return (res.Rules ?? []).length;
    },
  },
  {
    name: 'Security Groups',
    href: '/ec2',
    fetch: async () => {
      const res = await ec2.send(new DescribeSecurityGroupsCommand({}));
      return (res.SecurityGroups ?? []).length;
    },
  },
  {
    name: 'Secrets Manager',
    href: '/secretsmanager',
    fetch: async () => {
      const res = await secretsmanager.send(new ListSecretsCommand({}));
      return (res.SecretList ?? []).length;
    },
  },
  {
    name: 'WAFv2',
    href: '/wafv2',
    fetch: async () => {
      const res = await wafv2.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
      return (res.WebACLs ?? []).length;
    },
  },
  {
    name: 'IAM Managed Policies',
    href: '/iam',
    fetch: async () => {
      const res = await iam.send(new ListPoliciesCommand({}));
      return res.Policies?.length ?? 0;
    },
  },
  {
    name: 'GuardDuty Malware Plans',
    href: '/guardduty',
    fetch: async () => {
      const res = await fetch(`${ENDPOINT}/api/guardduty.us-east-1.amazonaws.com/malware-protection-plan`);
      const data = await res.json();
      return data.MalwareProtectionPlans?.length ?? 0;
    },
  },
  {
    name: 'Azure',
    href: '/azure',
    fetch: async () => {
      const [containers, secrets, keys, resourceGroups, cosmosDatabases, appConfigSettings, functions, eventGridEvents, apiManagementApis, networkSecurityGroups, monitorTables, wafPolicies, defenderPlans, managedIdentities, roleAssignments, graphUsers, graphGroups, graphApplications, graphServicePrincipals] = await Promise.all([
        listAzureContainers(),
        listAzureSecrets(),
        listAzureKeys(),
        listAzureResourceGroups(),
        listAzureCosmosDatabases(),
        listAzureAppConfigSettings(),
        listAzureFunctions(),
        listAzureEventGridEvents(),
        listAzureApiManagementApis(),
        listAzureNetworkSecurityGroups(),
        listAzureMonitorTables(),
        listAzureWafPolicies(),
        listAzureDefenderPlans(),
        listAzureManagedIdentities(),
        listAzureRoleAssignments(),
        listAzureGraphUsers(),
        listAzureGraphGroups(),
        listAzureGraphApplications(),
        listAzureGraphServicePrincipals(),
      ]);
      return containers.length + secrets.length + keys.length + resourceGroups.length + cosmosDatabases.length + appConfigSettings.length + functions.length + eventGridEvents.length + apiManagementApis.length + networkSecurityGroups.length + monitorTables.length + wafPolicies.length + defenderPlans.length + managedIdentities.length + roleAssignments.length + graphUsers.length + graphGroups.length + graphApplications.length + graphServicePrincipals.length;
    },
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<ServiceCard[]>(
    SERVICES.map((s) => ({ name: s.name, href: s.href, count: null }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const results = await Promise.allSettled(
        SERVICES.map(async (svc) => {
          const count = await svc.fetch();
          return { name: svc.name, href: svc.href, count };
        })
      );
      if (cancelled) return;
      setCards(
        results.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : { name: SERVICES[i].name, href: SERVICES[i].href, count: -1 }
        )
      );
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <ChalkHeader variant="h1">MockCloud</ChalkHeader>
      {loading && cards.every((c) => c.count === null) ? (
        <ChalkSpinner />
      ) : (
        <div className="chalk-home-list">
          {cards.filter((item) => item.count === null || item.count !== 0).map((item) => (
            <div
              key={item.name}
              className="chalk-home-row"
              onClick={() => navigate(item.href)}
            >
              <span className="chalk-home-service">
                {item.name}
              </span>
              <span className="chalk-home-count">
                {item.count === null ? '...' : item.count === -1 ? 'error' : item.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
