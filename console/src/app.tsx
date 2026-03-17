import { lazy, Suspense, type ComponentType } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ChalkLayout, ChalkNav, ChalkSpinner } from './chalk';

const p = (load: () => Promise<{ default: ComponentType }>) => lazy(load);

const routes: { path: string; text?: string; component: ReturnType<typeof p> }[] = [
  { path: '/', component: p(() => import('./pages/home')) },
  { path: '/cloudformation', text: 'CloudFormation', component: p(() => import('./pages/cloudformation/stacks')) },
  { path: '/cloudformation/stacks/:stackName', component: p(() => import('./pages/cloudformation/stack-detail')) },
  { path: '/lambda', text: 'Lambda', component: p(() => import('./pages/lambda/functions')) },
  { path: '/lambda/functions/:functionName', component: p(() => import('./pages/lambda/function-detail')) },
  { path: '/dynamodb', text: 'DynamoDB', component: p(() => import('./pages/dynamodb/tables')) },
  { path: '/dynamodb/tables/:tableName', component: p(() => import('./pages/dynamodb/table-detail')) },
  { path: '/s3', text: 'S3', component: p(() => import('./pages/s3/buckets')) },
  { path: '/s3/buckets/:bucketName', component: p(() => import('./pages/s3/bucket-detail')) },
  { path: '/iam', text: 'IAM Roles', component: p(() => import('./pages/iam/roles')) },
  { path: '/iam/roles/:roleName', component: p(() => import('./pages/iam/role-detail')) },
  { path: '/cognito', text: 'Cognito User Pools', component: p(() => import('./pages/cognito/user-pools')) },
  { path: '/cognito/user-pools/:userPoolId', component: p(() => import('./pages/cognito/user-pool-detail')) },
  { path: '/cognito/identity-pools', text: 'Cognito Identity Pools', component: p(() => import('./pages/cognito/identity-pools')) },
  { path: '/apigateway', text: 'API Gateway', component: p(() => import('./pages/apigateway/apis')) },
  { path: '/apigateway/apis/:apiId', component: p(() => import('./pages/apigateway/api-detail')) },
  { path: '/ssm', text: 'SSM Parameters', component: p(() => import('./pages/ssm/parameters')) },
  { path: '/kms', text: 'KMS', component: p(() => import('./pages/kms/keys')) },
  { path: '/kms/keys/:keyId', component: p(() => import('./pages/kms/key-detail')) },
  { path: '/logs', text: 'CloudWatch Logs', component: p(() => import('./pages/logs/log-groups')) },
  { path: '/logs/log-groups/*', component: p(() => import('./pages/logs/log-group-detail')) },
  { path: '/eventbridge', text: 'EventBridge', component: p(() => import('./pages/eventbridge/rules')) },
  { path: '/eventbridge/rules/:ruleName', component: p(() => import('./pages/eventbridge/rule-detail')) },
  { path: '/ec2', text: 'Security Groups', component: p(() => import('./pages/ec2/security-groups')) },
  { path: '/ec2/security-groups/:groupId', component: p(() => import('./pages/ec2/security-group-detail')) },
  { path: '/secretsmanager', text: 'Secrets Manager', component: p(() => import('./pages/secretsmanager/secrets')) },
  { path: '/guardduty', text: 'GuardDuty', component: p(() => import('./pages/guardduty/malware-protection-plans')) },
  { path: '/wafv2', text: 'WAFv2', component: p(() => import('./pages/wafv2/web-acls')) },
  { path: '/wafv2/web-acls/:name/:id', component: p(() => import('./pages/wafv2/web-acl-detail')) },
];

const navItems = routes
  .filter((r): r is typeof r & { text: string } => 'text' in r && r.text !== undefined)
  .map(({ text, path }) => ({ text, href: path }));

export function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <ChalkLayout
      nav={
        <ChalkNav
          header="MockCloud"
          activeHref={location.pathname}
          items={navItems}
          onNavigate={navigate}
        />
      }
    >
      <Suspense fallback={<ChalkSpinner />}>
        <Routes>
          {routes.map(({ path, component: C }) => (
            <Route key={path} path={path} element={<C />} />
          ))}
        </Routes>
      </Suspense>
    </ChalkLayout>
  );
}
