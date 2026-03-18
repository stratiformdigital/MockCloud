import type { ResourceProvider, ProvisionContext, ProvisionResult } from '../types.js';
import { stages, createStage } from '../../../apigateway/index.js';

export const apigatewayStageProvider: ResourceProvider = {
  type: 'AWS::ApiGateway::Stage',
  create(_logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const stageName = properties.StageName as string;
    const deploymentId = properties.DeploymentId as string;

    createStage(restApiId, stageName, deploymentId);

    return {
      physicalId: stageName,
      attributes: {},
    };
  },
  update(physicalId: string, _logicalId: string, properties: Record<string, unknown>, _context: ProvisionContext): ProvisionResult {
    const restApiId = properties.RestApiId as string;
    const deploymentId = properties.DeploymentId as string;
    const stageName = physicalId;

    const stageMap = stages.get(restApiId);
    const existing = stageMap?.get(stageName);
    if (stageMap && existing) {
      existing.deploymentId = deploymentId;
      stages.set(restApiId, stageMap);
    }

    return {
      physicalId,
      attributes: {},
    };
  },
};
