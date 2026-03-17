import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkBox, ChalkFormField, ChalkInput, ChalkTextarea, ChalkCheckbox, ChalkStatusIndicator, useChalkCollection } from '../../chalk';
import { ListStacksCommand, DeleteStackCommand, CreateStackCommand, StackStatus, StackSummary } from '@aws-sdk/client-cloudformation';
import { cfn } from '../../api/clients';

function statusType(status: string | undefined): 'success' | 'error' | 'in-progress' | 'stopped' | 'info' {
  if (!status) return 'info';
  if (status.endsWith('_COMPLETE') && !status.startsWith('DELETE')) return 'success';
  if (status.endsWith('_FAILED') || status === 'ROLLBACK_COMPLETE') return 'error';
  if (status.endsWith('_IN_PROGRESS')) return 'in-progress';
  if (status === StackStatus.DELETE_COMPLETE) return 'stopped';
  return 'info';
}

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

export default function Stacks() {
  const navigate = useNavigate();
  const [stacks, setStacks] = useState<StackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTemplate, setCreateTemplate] = useState('');
  const [createCapNamedIam, setCreateCapNamedIam] = useState(true);
  const [creating, setCreating] = useState(false);

  const [deleteStack, setDeleteStack] = useState<StackSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await cfn.send(new ListStacksCommand({}));
      setStacks(
        (res.StackSummaries ?? []).filter(
          (s) => s.StackStatus !== StackStatus.DELETE_COMPLETE
        )
      );
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
      const capabilities: ('CAPABILITY_NAMED_IAM')[] = [];
      if (createCapNamedIam) capabilities.push('CAPABILITY_NAMED_IAM');
      await cfn.send(new CreateStackCommand({
        StackName: createName,
        TemplateBody: createTemplate,
        Capabilities: capabilities,
      }));
      setShowCreate(false);
      setCreateName('');
      setCreateTemplate('');
      setCreateCapNamedIam(true);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteStack?.StackName) return;
    setDeleting(true);
    try {
      await cfn.send(new DeleteStackCommand({ StackName: deleteStack.StackName }));
      setDeleteStack(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(stacks, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.StackName ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${stacks.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create stack
              </ChalkButton>
            }
          >
            Stacks
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find stacks" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Stack Name',
            cell: (item) => (
              <ChalkLink
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/cloudformation/stacks/${encodeURIComponent(item.StackName!)}`);
                }}
              >
                {item.StackName}
              </ChalkLink>
            ),
            sortingField: 'StackName',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => (
              <ChalkStatusIndicator type={statusType(item.StackStatus)}>
                {item.StackStatus}
              </ChalkStatusIndicator>
            ),
            sortingField: 'StackStatus',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.CreationTime),
            sortingField: 'CreationTime',
          },
          {
            id: 'updated',
            header: 'Updated',
            cell: (item) => formatDate(item.LastUpdatedTime),
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.StackStatusReason ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteStack(item)}>
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
        header="Create stack"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={creating} disabled={!createName || !createTemplate}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Stack name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-stack" />
          </ChalkFormField>
          <ChalkFormField label="Template file" description="Choose a .yml, .yaml, .json, or .template file">
            <input
              type="file"
              accept=".yml,.yaml,.json,.template"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setCreateTemplate(reader.result as string);
                reader.readAsText(file);
              }}
            />
          </ChalkFormField>
          <ChalkFormField label="Template body" description="Loaded from file above, or paste manually">
            <ChalkTextarea value={createTemplate} onChange={({ detail }) => setCreateTemplate(detail.value)} rows={16} />
          </ChalkFormField>
          <ChalkCheckbox checked={createCapNamedIam} onChange={({ detail }) => setCreateCapNamedIam(detail.checked)}>
            CAPABILITY_NAMED_IAM
          </ChalkCheckbox>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteStack !== null}
        onDismiss={() => setDeleteStack(null)}
        header="Delete stack"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteStack(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete stack <b>{deleteStack?.StackName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
