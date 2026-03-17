import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkSpinner, ChalkSpaceBetween, ChalkLink, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkBox, useChalkCollection } from '../../chalk';
import {
  DescribeLogGroupsCommand,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  LogGroup,
} from '@aws-sdk/client-cloudwatch-logs';
import { logs } from '../../api/clients';

function formatDate(epoch: number | undefined): string {
  if (!epoch) return '-';
  return new Date(epoch).toLocaleString();
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function LogGroups() {
  const navigate = useNavigate();
  const [logGroups, setLogGroups] = useState<LogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteGroup, setDeleteGroup] = useState<LogGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await logs.send(new DescribeLogGroupsCommand({}));
      setLogGroups(res.logGroups ?? []);
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
      await logs.send(new CreateLogGroupCommand({ logGroupName: createName }));
      setShowCreate(false);
      setCreateName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteGroup?.logGroupName) return;
    setDeleting(true);
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName: deleteGroup.logGroupName }));
      setDeleteGroup(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(logGroups, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.logGroupName ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${logGroups.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create log group
              </ChalkButton>
            }
          >
            CloudWatch Log Groups
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find log groups" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Log Group Name',
            cell: (item) => (
              <ChalkLink onFollow={(e) => { e.preventDefault(); navigate(`/logs/log-groups/${item.logGroupName}`); }}>
                {item.logGroupName ?? '-'}
              </ChalkLink>
            ),
            sortingField: 'logGroupName',
          },
          {
            id: 'storedBytes',
            header: 'Stored Bytes',
            cell: (item) => formatBytes(item.storedBytes),
            sortingField: 'storedBytes',
          },
          {
            id: 'retention',
            header: 'Retention (days)',
            cell: (item) => item.retentionInDays ?? 'Never expire',
            sortingField: 'retentionInDays',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.creationTime),
            sortingField: 'creationTime',
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
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create log group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={creating} disabled={!createName}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Log group name">
          <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="/my/log-group" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={deleteGroup !== null}
        onDismiss={() => setDeleteGroup(null)}
        header="Delete log group"
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
        Are you sure you want to delete <b>{deleteGroup?.logGroupName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
