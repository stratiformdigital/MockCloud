import { randomUUID } from 'node:crypto';
import type { ResourceProvider, ProvisionResult } from '../types.js';
import { createSecurityGroup, deleteSecurityGroup } from '../../../ec2/index.js';

export const ec2SecurityGroupProvider: ResourceProvider = {
  type: 'AWS::EC2::SecurityGroup',
  create(_logicalId: string, properties: Record<string, unknown>): ProvisionResult {
    const physicalId = `sg-${randomUUID().replace(/-/g, '').slice(0, 17)}`;
    const vpcId = (properties.VpcId as string) || 'vpc-mockcloud0001';
    const groupName = (properties.GroupName as string) || _logicalId;
    const description = (properties.GroupDescription as string) || '';
    createSecurityGroup(physicalId, groupName, description, vpcId);
    return {
      physicalId,
      attributes: { GroupId: physicalId, VpcId: vpcId },
    };
  },
  update(physicalId: string): ProvisionResult {
    return {
      physicalId,
      attributes: { GroupId: physicalId, VpcId: 'vpc-mockcloud0001' },
    };
  },
  delete(physicalId: string): void {
    deleteSecurityGroup(physicalId);
  },
};
