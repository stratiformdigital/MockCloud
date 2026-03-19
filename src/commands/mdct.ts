import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { ACCOUNT_ID, REGION } from '../config.js';
import { stopServer } from '../server.js';
import { clearAllState } from '../state/store.js';
import { loadMdctAppEnv } from './mdct-prereqs.js';
import { nvmInstall, runAppCommand } from './mdct-util.js';

export async function runMdctApp(app: string): Promise<void> {
  const mockCloudDir = resolve(import.meta.dirname, '..', '..');
  const appDir = resolve(homedir(), 'Projects', `macpro-mdct-${app}`);

  if (!existsSync(appDir)) {
    throw new Error(`MDCT app not found: ${appDir}`);
  }

  stopServer();
  await clearAllState();
  execSync('./run start', { stdio: 'inherit', cwd: mockCloudDir });

  Object.assign(process.env, {
    AWS_ENDPOINT_URL: 'http://localhost:4444',
    AWS_ACCESS_KEY_ID: 'mockcloud',
    AWS_SECRET_ACCESS_KEY: 'mockcloud',
    AWS_DEFAULT_REGION: REGION,
    CDK_DEFAULT_ACCOUNT: ACCOUNT_ID,
    CDK_DEFAULT_REGION: REGION,
    PROJECT: app,
  });

  loadMdctAppEnv(appDir);

  await nvmInstall(appDir);

  await runAppCommand('Install', './run install', appDir);

  rmSync(resolve(appDir, '.cdk'), { recursive: true, force: true });

  await runAppCommand(
    'CDK Bootstrap',
    `yarn cdk bootstrap aws://${ACCOUNT_ID}/${REGION} --template deployment/bootstrap-template.yaml --context stage=bootstrap`,
    appDir,
  );

  const mockCloudCdk = resolve(mockCloudDir, 'node_modules', '.bin', 'cdk');
  await runAppCommand(
    'MockCloud prereqs',
    `${mockCloudCdk} deploy --app "yarn tsx ${resolve(import.meta.dirname, 'mdct-prereqs.ts')}" --all`,
    appDir,
  );

  await runAppCommand(
    'Prerequisites',
    'yarn cdk deploy --app "yarn tsx ./deployment/prerequisites.ts" --all',
    appDir,
  );

  await runAppCommand(
    'Deploy',
    'yarn cdk deploy --context stage=localstack --all --no-rollback',
    appDir,
  );

  await Promise.all([
    runAppCommand(
      'CDK watch',
      'yarn cdk watch --context stage=localstack --no-rollback',
      appDir,
    ),
    runAppCommand(
      'Frontend',
      `yarn tsx -e "import { runFrontendLocally } from '${resolve(appDir, 'cli', 'lib', 'utils.ts')}'; runFrontendLocally('localstack');"`,
      appDir,
    ),
  ]);
}
