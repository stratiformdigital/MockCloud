import { defineMockService } from '../service.js';
import type { ApiResponse } from '../../types.js';
import { PersistentMap } from '../../state/store.js';
import {
  buildDescribeVpcsXml,
  buildDescribeSubnetsXml,
  buildDescribeRouteTablesXml,
  buildDescribeAvailabilityZonesXml,
  buildDescribeVpnGatewaysXml,
} from './vpc-data.js';
import { ACCOUNT_ID } from '../../config.js';
import type { SecurityGroup as Ec2SecurityGroup } from '@aws-sdk/client-ec2';

const NS = 'http://ec2.amazonaws.com/doc/2016-11-15/';
const REQ_ID = '<requestId>00000000-0000-0000-0000-000000000000</requestId>';

const xml = (body: string): ApiResponse => ({
  statusCode: 200,
  headers: { 'Content-Type': 'text/xml' },
  body,
});

const emptySet = (action: string, setName: string): ApiResponse =>
  xml(`<${action}Response xmlns="${NS}">${REQ_ID}<${setName}/></${action}Response>`);

const securityGroups = new PersistentMap<string, Ec2SecurityGroup>('ec2-security-groups');

interface StoredVpcEndpoint {
  VpcEndpointId: string;
  VpcId: string;
  ServiceName: string;
  VpcEndpointType: string;
  CreationTimestamp: string;
}

export const vpcEndpoints = new PersistentMap<string, StoredVpcEndpoint>('ec2-vpc-endpoints');

export function createSecurityGroup(groupId: string, groupName: string, description: string, vpcId: string): void {
  securityGroups.set(groupId, {
    GroupId: groupId,
    GroupName: groupName,
    Description: description,
    VpcId: vpcId,
    OwnerId: ACCOUNT_ID,
  });
}

export function deleteSecurityGroup(groupId: string): void {
  securityGroups.delete(groupId);
}

function buildDescribeSecurityGroupsXml(body: Record<string, unknown>): string {
  let groups = [...securityGroups.values()];

  const filterGroupIds: string[] = [];
  for (let i = 1; ; i++) {
    const name = body[`Filter.${i}.Name`] as string | undefined;
    if (!name) break;
    if (name === 'group-id') {
      for (let j = 1; ; j++) {
        const val = body[`Filter.${i}.Value.${j}`] as string | undefined;
        if (!val) break;
        filterGroupIds.push(val);
      }
    }
  }

  if (filterGroupIds.length > 0) {
    groups = groups.filter(sg => filterGroupIds.includes(sg.GroupId!));
  }

  if (groups.length === 0) {
    return `<DescribeSecurityGroupsResponse xmlns="${NS}">${REQ_ID}<securityGroupInfo/></DescribeSecurityGroupsResponse>`;
  }

  const items = groups.map(sg => [
    '<item>',
    `<groupId>${sg.GroupId}</groupId>`,
    `<groupName>${sg.GroupName}</groupName>`,
    `<groupDescription>${sg.Description}</groupDescription>`,
    `<vpcId>${sg.VpcId}</vpcId>`,
    `<ownerId>${sg.OwnerId}</ownerId>`,
    '<ipPermissions/>',
    '<ipPermissionsEgress/>',
    '</item>',
  ].join('')).join('');

  return `<DescribeSecurityGroupsResponse xmlns="${NS}">${REQ_ID}<securityGroupInfo>${items}</securityGroupInfo></DescribeSecurityGroupsResponse>`;
}

function randomHex(len: number): string {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export function createVpcEndpoint(vpcId: string, serviceName: string, vpcEndpointType: string): StoredVpcEndpoint {
  const id = `vpce-${randomHex(17)}`;
  const endpoint: StoredVpcEndpoint = {
    VpcEndpointId: id,
    VpcId: vpcId,
    ServiceName: serviceName,
    VpcEndpointType: vpcEndpointType || 'Gateway',
    CreationTimestamp: new Date().toISOString(),
  };
  vpcEndpoints.set(id, endpoint);
  return endpoint;
}

export function deleteVpcEndpoint(id: string): void {
  vpcEndpoints.delete(id);
}

function buildVpcEndpointXml(ep: StoredVpcEndpoint): string {
  return [
    '<item>',
    `<vpcEndpointId>${ep.VpcEndpointId}</vpcEndpointId>`,
    `<vpcId>${ep.VpcId}</vpcId>`,
    `<serviceName>${ep.ServiceName}</serviceName>`,
    `<vpcEndpointType>${ep.VpcEndpointType}</vpcEndpointType>`,
    `<state>available</state>`,
    `<creationTimestamp>${ep.CreationTimestamp}</creationTimestamp>`,
    '</item>',
  ].join('');
}

function buildDescribeVpcEndpointsXml(body: Record<string, unknown>): string {
  let endpoints = [...vpcEndpoints.values()];

  const filterIds: string[] = [];
  for (let i = 1; ; i++) {
    const id = body[`VpcEndpointId.${i}`] as string | undefined;
    if (!id) break;
    filterIds.push(id);
  }
  if (filterIds.length > 0) {
    endpoints = endpoints.filter(ep => filterIds.includes(ep.VpcEndpointId));
  }

  if (endpoints.length === 0) {
    return `<DescribeVpcEndpointsResponse xmlns="${NS}">${REQ_ID}<vpcEndpointSet/></DescribeVpcEndpointsResponse>`;
  }

  const items = endpoints.map(buildVpcEndpointXml).join('');
  return `<DescribeVpcEndpointsResponse xmlns="${NS}">${REQ_ID}<vpcEndpointSet>${items}</vpcEndpointSet></DescribeVpcEndpointsResponse>`;
}

export const ec2Service = defineMockService({
  name: 'ec2',
  hostPatterns: ['ec2.*.amazonaws.com'],
  protocol: 'query',
  signingName: 'ec2',
  handlers: {
    DescribeVpcs: (req) => xml(buildDescribeVpcsXml(req.body)),

    DescribeSubnets: (req) => xml(buildDescribeSubnetsXml(req.body)),

    DescribeSecurityGroups: (req) => xml(buildDescribeSecurityGroupsXml(req.body)),

    DescribeInstances: () => emptySet('DescribeInstances', 'reservationSet'),

    DescribeRouteTables: (req) => xml(buildDescribeRouteTablesXml(req.body)),

    DescribeInternetGateways: () => emptySet('DescribeInternetGateways', 'internetGatewaySet'),

    DescribeEgressOnlyInternetGateways: () =>
      emptySet('DescribeEgressOnlyInternetGateways', 'egressOnlyInternetGatewaySet'),

    DescribeDhcpOptions: () => emptySet('DescribeDhcpOptions', 'dhcpOptionsSet'),

    DescribeVpcEndpoints: (req) => xml(buildDescribeVpcEndpointsXml(req.body)),

    CreateVpcEndpoint: (req) => {
      const body = req.body as Record<string, string>;
      const ep = createVpcEndpoint(body.VpcId ?? 'vpc-mockcloud0001', body.ServiceName ?? '', body.VpcEndpointType ?? 'Gateway');
      return xml(`<CreateVpcEndpointResponse xmlns="${NS}">${REQ_ID}<vpcEndpoint>${buildVpcEndpointXml(ep)}</vpcEndpoint></CreateVpcEndpointResponse>`);
    },

    DeleteVpcEndpoints: (req) => {
      const body = req.body as Record<string, string>;
      for (let i = 1; ; i++) {
        const id = body[`VpcEndpointId.${i}`];
        if (!id) break;
        deleteVpcEndpoint(id);
      }
      return xml(`<DeleteVpcEndpointsResponse xmlns="${NS}">${REQ_ID}<unsuccessful/></DeleteVpcEndpointsResponse>`);
    },

    DescribeInstanceConnectEndpoints: () =>
      emptySet('DescribeInstanceConnectEndpoints', 'instanceConnectEndpointSet'),

    DescribeVpcEndpointServiceConfigurations: () =>
      emptySet('DescribeVpcEndpointServiceConfigurations', 'serviceConfigurationSet'),

    DescribeNatGateways: () => emptySet('DescribeNatGateways', 'natGatewaySet'),

    DescribeVpcPeeringConnections: () =>
      emptySet('DescribeVpcPeeringConnections', 'vpcPeeringConnectionSet'),

    DescribeNetworkAcls: () => emptySet('DescribeNetworkAcls', 'networkAclSet'),

    DescribeTags: () => emptySet('DescribeTags', 'tagSet'),

    DescribeCustomerGateways: () => emptySet('DescribeCustomerGateways', 'customerGatewaySet'),

    DescribeVpnGateways: () => xml(buildDescribeVpnGatewaysXml()),

    DescribeVpnConnections: () => emptySet('DescribeVpnConnections', 'vpnConnectionSet'),

    DescribeVpcBlockPublicAccessOptions: () =>
      xml(`<DescribeVpcBlockPublicAccessOptionsResponse xmlns="${NS}">${REQ_ID}<vpcBlockPublicAccessOptions><internetGatewayBlockMode>off</internetGatewayBlockMode></vpcBlockPublicAccessOptions></DescribeVpcBlockPublicAccessOptionsResponse>`),

    DescribeAccountAttributes: () =>
      xml(`<DescribeAccountAttributesResponse xmlns="${NS}">${REQ_ID}<accountAttributeSet><item><attributeName>supported-platforms</attributeName><attributeValueSet><item><attributeValue>VPC</attributeValue></item></attributeValueSet></item></accountAttributeSet></DescribeAccountAttributesResponse>`),

    DescribeRegions: () =>
      xml(`<DescribeRegionsResponse xmlns="${NS}">
  ${REQ_ID}
  <regionInfo>
    <item><regionName>us-east-1</regionName><regionEndpoint>ec2.us-east-1.amazonaws.com</regionEndpoint></item>
    <item><regionName>us-east-2</regionName><regionEndpoint>ec2.us-east-2.amazonaws.com</regionEndpoint></item>
    <item><regionName>us-west-1</regionName><regionEndpoint>ec2.us-west-1.amazonaws.com</regionEndpoint></item>
    <item><regionName>us-west-2</regionName><regionEndpoint>ec2.us-west-2.amazonaws.com</regionEndpoint></item>
    <item><regionName>eu-west-1</regionName><regionEndpoint>ec2.eu-west-1.amazonaws.com</regionEndpoint></item>
    <item><regionName>eu-central-1</regionName><regionEndpoint>ec2.eu-central-1.amazonaws.com</regionEndpoint></item>
    <item><regionName>ap-southeast-1</regionName><regionEndpoint>ec2.ap-southeast-1.amazonaws.com</regionEndpoint></item>
    <item><regionName>ap-northeast-1</regionName><regionEndpoint>ec2.ap-northeast-1.amazonaws.com</regionEndpoint></item>
  </regionInfo>
</DescribeRegionsResponse>`),

    DescribeAvailabilityZones: () => xml(buildDescribeAvailabilityZonesXml()),

    _default: () =>
      xml(`<?xml version="1.0" encoding="UTF-8"?>\n<Response xmlns="${NS}">${REQ_ID}</Response>`),
  },
});
