import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChalkTable, ChalkHeader, ChalkTextFilter, ChalkSpinner, ChalkSpaceBetween,
  ChalkLink, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkBox,
  useChalkCollection,
} from '../../chalk';
import { DescribeSecurityGroupsCommand, CreateSecurityGroupCommand, DeleteSecurityGroupCommand, SecurityGroup } from '@aws-sdk/client-ec2';
import { ec2 } from '../../api/clients';

export default function SecurityGroups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createVpcId, setCreateVpcId] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteGroup, setDeleteGroup] = useState<SecurityGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await ec2.send(new DescribeSecurityGroupsCommand({}));
      setGroups(res.SecurityGroups ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await ec2.send(
        new CreateSecurityGroupCommand({
          GroupName: createName,
          Description: createDescription,
          VpcId: createVpcId || undefined,
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreateVpcId('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteGroup?.GroupId) return;
    setDeleting(true);
    try {
      await ec2.send(new DeleteSecurityGroupCommand({ GroupId: deleteGroup.GroupId }));
      setDeleteGroup(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(groups, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.GroupName ?? '').toLowerCase().includes(text.toLowerCase()) ||
        (item.GroupId ?? '').toLowerCase().includes(text.toLowerCase()),
    },
    sorting: {},
  });

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkTable
        {...collectionProps}
        header={
          <ChalkHeader
            variant="h1"
            counter={`(${groups.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create security group
              </ChalkButton>
            }
          >
            Security Groups
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find security groups" />}
        columnDefinitions={[
          {
            id: 'groupId',
            header: 'Group ID',
            cell: (item) => (
              <ChalkLink onFollow={(e) => { e.preventDefault(); navigate(`/ec2/security-groups/${item.GroupId}`); }}>
                {item.GroupId ?? '-'}
              </ChalkLink>
            ),
            sortingField: 'GroupId',
          },
          {
            id: 'groupName',
            header: 'Group Name',
            cell: (item) => item.GroupName ?? '-',
            sortingField: 'GroupName',
          },
          {
            id: 'vpcId',
            header: 'VPC ID',
            cell: (item) => item.VpcId ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteGroup(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        items={items}
        variant="full-page"
        stickyHeader
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create security group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={creating} disabled={!createName || !createDescription}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-security-group" />
          </ChalkFormField>
          <ChalkFormField label="Description">
            <ChalkInput value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} placeholder="Security group description" />
          </ChalkFormField>
          <ChalkFormField label="VPC ID" description="Optional">
            <ChalkInput value={createVpcId} onChange={({ detail }) => setCreateVpcId(detail.value)} placeholder="vpc-xxxxxxxx" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteGroup !== null}
        onDismiss={() => setDeleteGroup(null)}
        header="Delete security group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteGroup(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteGroup?.GroupName}</b> ({deleteGroup?.GroupId})?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
