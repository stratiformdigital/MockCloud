import type { ResourceProvider, ProvisionResult } from '../types.js';
import { createVpcEndpoint, deleteVpcEndpoint } from '../../../ec2/index.js';

export const ec2VpcEndpointProvider: ResourceProvider = {
  type: 'AWS::EC2::VPCEndpoint',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const vpcId = (properties.VpcId as string) || 'vpc-mockcloud0001';
    const serviceName = (properties.ServiceName as string) || '';
    const vpcEndpointType = (properties.VpcEndpointType as string) || 'Gateway';
    const endpoint = createVpcEndpoint(vpcId, serviceName, vpcEndpointType);

    return {
      physicalId: endpoint.VpcEndpointId,
      attributes: {
        Id: endpoint.VpcEndpointId,
        CreationTimestamp: endpoint.CreationTimestamp,
      },
    };
  },
  update(physicalId: string): ProvisionResult {
    return {
      physicalId,
      attributes: {
        Id: physicalId,
        CreationTimestamp: new Date().toISOString(),
      },
    };
  },
  delete(physicalId: string): void {
    deleteVpcEndpoint(physicalId);
  },
};
