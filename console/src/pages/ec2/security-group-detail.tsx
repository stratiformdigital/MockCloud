import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkContainer,
  ChalkKeyValuePairs, ChalkTabs, ChalkTable, ChalkBox, ChalkButton,
  ChalkModal, ChalkFormField, ChalkInput, ChalkSelect, ChalkSpinner,
  ChalkLink, ChalkFlashbar,
} from '../../chalk';
import {
  DescribeSecurityGroupsCommand,
  AuthorizeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand,
  DeleteSecurityGroupCommand,
  SecurityGroup,
  IpPermission,
} from '@aws-sdk/client-ec2';
import { ec2 } from '../../api/clients';

const PROTOCOL_OPTIONS = [
  { label: 'TCP', value: 'tcp' },
  { label: 'UDP', value: 'udp' },
  { label: 'ICMP', value: 'icmp' },
  { label: 'All traffic', value: '-1' },
];

function formatPortRange(perm: IpPermission): string {
  if (perm.IpProtocol === '-1') return 'All';
  if (perm.FromPort === perm.ToPort) return String(perm.FromPort ?? '-');
  return `${perm.FromPort} - ${perm.ToPort}`;
}

function formatSource(perm: IpPermission): string {
  const sources: string[] = [];
  for (const r of perm.IpRanges ?? []) {
    if (r.CidrIp) sources.push(r.CidrIp);
  }
  for (const r of perm.Ipv6Ranges ?? []) {
    if (r.CidrIpv6) sources.push(r.CidrIpv6);
  }
  for (const g of perm.UserIdGroupPairs ?? []) {
    if (g.GroupId) sources.push(g.GroupId);
  }
  return sources.length > 0 ? sources.join(', ') : '-';
}

function parsePortRange(value: string): { fromPort?: number; toPort?: number } {
  if (value.includes('-')) {
    const [from, to] = value.split('-').map((s) => parseInt(s.trim(), 10));
    return { fromPort: from, toPort: to };
  }
  const port = parseInt(value, 10);
  return { fromPort: port, toPort: port };
}

export default function SecurityGroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [sg, setSg] = useState<SecurityGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddInbound, setShowAddInbound] = useState(false);
  const [inboundProtocol, setInboundProtocol] = useState(PROTOCOL_OPTIONS[0]);
  const [inboundPortRange, setInboundPortRange] = useState('');
  const [inboundCidr, setInboundCidr] = useState('');
  const [addingInbound, setAddingInbound] = useState(false);

  const [showAddOutbound, setShowAddOutbound] = useState(false);
  const [outboundProtocol, setOutboundProtocol] = useState(PROTOCOL_OPTIONS[0]);
  const [outboundPortRange, setOutboundPortRange] = useState('');
  const [outboundCidr, setOutboundCidr] = useState('');
  const [addingOutbound, setAddingOutbound] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<{ direction: 'inbound' | 'outbound'; perm: IpPermission } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [groupId!] }));
      const groups = res.SecurityGroups ?? [];
      setSg(groups[0] ?? null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddInbound = async () => {
    setAddingInbound(true);
    try {
      const protocol = inboundProtocol.value;
      let fromPort: number | undefined;
      let toPort: number | undefined;
      if (protocol !== '-1') {
        ({ fromPort, toPort } = parsePortRange(inboundPortRange));
      }
      await ec2.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: groupId,
          IpPermissions: [
            {
              IpProtocol: protocol,
              FromPort: fromPort,
              ToPort: toPort,
              IpRanges: [{ CidrIp: inboundCidr }],
            },
          ],
        })
      );
      setShowAddInbound(false);
      setInboundProtocol(PROTOCOL_OPTIONS[0]);
      setInboundPortRange('');
      setInboundCidr('');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingInbound(false);
    }
  };

  const handleAddOutbound = async () => {
    setAddingOutbound(true);
    try {
      const protocol = outboundProtocol.value;
      let fromPort: number | undefined;
      let toPort: number | undefined;
      if (protocol !== '-1') {
        ({ fromPort, toPort } = parsePortRange(outboundPortRange));
      }
      await ec2.send(
        new AuthorizeSecurityGroupEgressCommand({
          GroupId: groupId,
          IpPermissions: [
            {
              IpProtocol: protocol,
              FromPort: fromPort,
              ToPort: toPort,
              IpRanges: [{ CidrIp: outboundCidr }],
            },
          ],
        })
      );
      setShowAddOutbound(false);
      setOutboundProtocol(PROTOCOL_OPTIONS[0]);
      setOutboundPortRange('');
      setOutboundCidr('');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingOutbound(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      if (revokeTarget.direction === 'inbound') {
        await ec2.send(new RevokeSecurityGroupIngressCommand({ GroupId: groupId, IpPermissions: [revokeTarget.perm] }));
      } else {
        await ec2.send(new RevokeSecurityGroupEgressCommand({ GroupId: groupId, IpPermissions: [revokeTarget.perm] }));
      }
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setRevoking(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await ec2.send(new DeleteSecurityGroupCommand({ GroupId: groupId }));
      navigate('/ec2');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!sg) return <ChalkHeader variant="h1">Security group not found</ChalkHeader>;

  const isInboundAllTraffic = inboundProtocol.value === '-1';
  const isOutboundAllTraffic = outboundProtocol.value === '-1';

  function inboundRulesTable(permissions: IpPermission[]) {
    return (
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${permissions.length})`}
            actions={
              <ChalkButton onClick={() => setShowAddInbound(true)}>Add inbound rule</ChalkButton>
            }
          >
            Inbound Rules
          </ChalkHeader>
        }
        items={permissions}
        columnDefinitions={[
          {
            id: 'protocol',
            header: 'Protocol',
            cell: (item) => item.IpProtocol === '-1' ? 'All' : item.IpProtocol ?? '-',
          },
          {
            id: 'portRange',
            header: 'Port Range',
            cell: (item) => formatPortRange(item),
          },
          {
            id: 'source',
            header: 'Source',
            cell: (item) => formatSource(item),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkLink onFollow={() => setRevokeTarget({ direction: 'inbound', perm: item })}>Revoke</ChalkLink>
            ),
          },
        ]}
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No rules</b>
          </ChalkBox>
        }
      />
    );
  }

  function outboundRulesTable(permissions: IpPermission[]) {
    return (
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${permissions.length})`}
            actions={
              <ChalkButton onClick={() => setShowAddOutbound(true)}>Add outbound rule</ChalkButton>
            }
          >
            Outbound Rules
          </ChalkHeader>
        }
        items={permissions}
        columnDefinitions={[
          {
            id: 'protocol',
            header: 'Protocol',
            cell: (item) => item.IpProtocol === '-1' ? 'All' : item.IpProtocol ?? '-',
          },
          {
            id: 'portRange',
            header: 'Port Range',
            cell: (item) => formatPortRange(item),
          },
          {
            id: 'destination',
            header: 'Destination',
            cell: (item) => formatSource(item),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkLink onFollow={() => setRevokeTarget({ direction: 'outbound', perm: item })}>Revoke</ChalkLink>
            ),
          },
        ]}
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No rules</b>
          </ChalkBox>
        }
      />
    );
  }

  return (
    <ChalkSpaceBetween size="l">
      {flash.length > 0 && (
        <ChalkFlashbar
          items={flash.map((f, i) => ({
            type: f.type,
            content: f.content,
            dismissible: true,
            id: String(i),
            onDismiss: () => setFlash([]),
          }))}
        />
      )}

      <ChalkBreadcrumbs
        items={[
          { text: 'MockCloud', href: '/' },
          { text: 'EC2', href: '/ec2' },
          { text: 'Security Groups', href: '/ec2' },
          { text: groupId!, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkButton onClick={() => setShowDelete(true)}>Delete</ChalkButton>
        }
      >
        {sg.GroupName ?? groupId}
      </ChalkHeader>
      <ChalkContainer header={<ChalkHeader variant="h2">Details</ChalkHeader>}>
        <ChalkKeyValuePairs
          columns={2}
          items={[
            { label: 'Group ID', value: sg.GroupId ?? '-' },
            { label: 'Group Name', value: sg.GroupName ?? '-' },
            { label: 'VPC ID', value: sg.VpcId ?? '-' },
            { label: 'Description', value: sg.Description ?? '-' },
          ]}
        />
      </ChalkContainer>
      <ChalkTabs
        tabs={[
          {
            id: 'inbound',
            label: 'Inbound Rules',
            content: inboundRulesTable(sg.IpPermissions ?? []),
          },
          {
            id: 'outbound',
            label: 'Outbound Rules',
            content: outboundRulesTable(sg.IpPermissionsEgress ?? []),
          },
        ]}
      />

      <ChalkModal
        visible={showAddInbound}
        onDismiss={() => setShowAddInbound(false)}
        header="Add inbound rule"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowAddInbound(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleAddInbound} loading={addingInbound} disabled={!inboundCidr || (!isInboundAllTraffic && !inboundPortRange)}>
                Add rule
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Protocol">
            <ChalkSelect
              selectedOption={inboundProtocol}
              onChange={({ detail }) => setInboundProtocol(detail.selectedOption as typeof inboundProtocol)}
              options={PROTOCOL_OPTIONS}
            />
          </ChalkFormField>
          {!isInboundAllTraffic && (
            <ChalkFormField label="Port Range">
              <ChalkInput value={inboundPortRange} onChange={({ detail }) => setInboundPortRange(detail.value)} placeholder="443 or 8000-9000" />
            </ChalkFormField>
          )}
          <ChalkFormField label="Source CIDR">
            <ChalkInput value={inboundCidr} onChange={({ detail }) => setInboundCidr(detail.value)} placeholder="0.0.0.0/0" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showAddOutbound}
        onDismiss={() => setShowAddOutbound(false)}
        header="Add outbound rule"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowAddOutbound(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleAddOutbound} loading={addingOutbound} disabled={!outboundCidr || (!isOutboundAllTraffic && !outboundPortRange)}>
                Add rule
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Protocol">
            <ChalkSelect
              selectedOption={outboundProtocol}
              onChange={({ detail }) => setOutboundProtocol(detail.selectedOption as typeof outboundProtocol)}
              options={PROTOCOL_OPTIONS}
            />
          </ChalkFormField>
          {!isOutboundAllTraffic && (
            <ChalkFormField label="Port Range">
              <ChalkInput value={outboundPortRange} onChange={({ detail }) => setOutboundPortRange(detail.value)} placeholder="443 or 8000-9000" />
            </ChalkFormField>
          )}
          <ChalkFormField label="Destination CIDR">
            <ChalkInput value={outboundCidr} onChange={({ detail }) => setOutboundCidr(detail.value)} placeholder="0.0.0.0/0" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={revokeTarget !== null}
        onDismiss={() => setRevokeTarget(null)}
        header={`Revoke ${revokeTarget?.direction} rule`}
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setRevokeTarget(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleRevoke} loading={revoking}>
                Revoke
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to revoke this {revokeTarget?.direction} rule?
        {revokeTarget && (
          <ChalkBox margin={{ top: 's' }}>
            <b>Protocol:</b> {revokeTarget.perm.IpProtocol === '-1' ? 'All' : revokeTarget.perm.IpProtocol}
            {' | '}
            <b>Port Range:</b> {formatPortRange(revokeTarget.perm)}
            {' | '}
            <b>{revokeTarget.direction === 'inbound' ? 'Source' : 'Destination'}:</b> {formatSource(revokeTarget.perm)}
          </ChalkBox>
        )}
      </ChalkModal>

      <ChalkModal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete security group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDelete(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{sg.GroupName}</b> ({sg.GroupId})? This will navigate back to the security groups list.
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
