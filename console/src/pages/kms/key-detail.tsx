import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkContainer, ChalkKeyValuePairs, ChalkStatusIndicator, ChalkSpinner, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkBox, ChalkTable, ChalkFlashbar } from '../../chalk';
import {
  DescribeKeyCommand,
  EnableKeyCommand,
  DisableKeyCommand,
  ScheduleKeyDeletionCommand,
  ListAliasesCommand,
  CreateAliasCommand,
  DeleteAliasCommand,
  UpdateKeyDescriptionCommand,
  KeyMetadata,
  AliasListEntry,
} from '@aws-sdk/client-kms';
import { kms } from '../../api/clients';

function statusType(state: string | undefined): 'success' | 'error' | 'warning' | 'info' {
  if (state === 'Enabled') return 'success';
  if (state === 'Disabled') return 'error';
  if (state === 'PendingDeletion') return 'warning';
  return 'info';
}

export default function KeyDetail() {
  const { keyId } = useParams<{ keyId: string }>();
  const navigate = useNavigate();
  const [key, setKey] = useState<KeyMetadata | null>(null);
  const [aliases, setAliases] = useState<AliasListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [pendingDays, setPendingDays] = useState('7');
  const [schedulingDeletion, setSchedulingDeletion] = useState(false);

  const [showCreateAlias, setShowCreateAlias] = useState(false);
  const [aliasName, setAliasName] = useState('');
  const [creatingAlias, setCreatingAlias] = useState(false);

  const [deleteAlias, setDeleteAlias] = useState<AliasListEntry | null>(null);
  const [deletingAlias, setDeletingAlias] = useState(false);

  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [showEditDesc, setShowEditDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  const load = useCallback(async () => {
    try {
      const [descRes, aliasRes] = await Promise.all([
        kms.send(new DescribeKeyCommand({ KeyId: keyId })),
        kms.send(new ListAliasesCommand({ KeyId: keyId })),
      ]);
      setKey(descRes.KeyMetadata ?? null);
      setAliases(aliasRes.Aliases ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [keyId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (!key?.KeyId) return;
    setToggling(true);
    try {
      if (key.KeyState === 'Enabled') {
        await kms.send(new DisableKeyCommand({ KeyId: key.KeyId }));
      } else {
        await kms.send(new EnableKeyCommand({ KeyId: key.KeyId }));
      }
      await load();
    } finally {
      setToggling(false);
    }
  };

  const handleScheduleDeletion = async () => {
    if (!key?.KeyId) return;
    setSchedulingDeletion(true);
    try {
      await kms.send(
        new ScheduleKeyDeletionCommand({
          KeyId: key.KeyId,
          PendingWindowInDays: parseInt(pendingDays, 10) || 7,
        })
      );
      navigate('/kms');
    } finally {
      setSchedulingDeletion(false);
    }
  };

  const handleCreateAlias = async () => {
    if (!key?.KeyId || !aliasName) return;
    setCreatingAlias(true);
    try {
      const fullName = aliasName.startsWith('alias/') ? aliasName : `alias/${aliasName}`;
      await kms.send(new CreateAliasCommand({ AliasName: fullName, TargetKeyId: key.KeyId }));
      setShowCreateAlias(false);
      setAliasName('');
      await load();
    } finally {
      setCreatingAlias(false);
    }
  };

  const handleDeleteAlias = async () => {
    if (!deleteAlias?.AliasName) return;
    setDeletingAlias(true);
    try {
      await kms.send(new DeleteAliasCommand({ AliasName: deleteAlias.AliasName }));
      setDeleteAlias(null);
      await load();
      setFlash([{ type: 'success', content: `Alias "${deleteAlias.AliasName}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingAlias(false);
    }
  };

  const handleEditDescription = async () => {
    if (!key?.KeyId) return;
    setSavingDesc(true);
    try {
      await kms.send(new UpdateKeyDescriptionCommand({ KeyId: key.KeyId, Description: descDraft }));
      setShowEditDesc(false);
      await load();
    } finally {
      setSavingDesc(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!key) return <ChalkHeader variant="h1">Key not found</ChalkHeader>;

  const canToggle = key.KeyState === 'Enabled' || key.KeyState === 'Disabled';
  const canDelete = key.KeyState !== 'PendingDeletion';

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
          { text: 'KMS', href: '/kms' },
          { text: 'Keys', href: '/kms' },
          { text: keyId!, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkSpaceBetween direction="horizontal" size="xs">
            <ChalkButton onClick={() => { setDescDraft(key.Description ?? ''); setShowEditDesc(true); }}>
              Edit description
            </ChalkButton>
            {canToggle && (
              <ChalkButton onClick={handleToggle} loading={toggling}>
                {key.KeyState === 'Enabled' ? 'Disable key' : 'Enable key'}
              </ChalkButton>
            )}
            {canDelete && (
              <ChalkButton onClick={() => setShowDelete(true)}>Schedule deletion</ChalkButton>
            )}
          </ChalkSpaceBetween>
        }
      >
        {keyId}
      </ChalkHeader>
      <ChalkContainer header={<ChalkHeader variant="h2">Key details</ChalkHeader>}>
        <ChalkKeyValuePairs
          columns={2}
          items={[
            { label: 'Key ID', value: key.KeyId ?? '-' },
            { label: 'ARN', value: key.Arn ?? '-' },
            { label: 'Description', value: key.Description || '-' },
            {
              label: 'Status',
              value: (
                <ChalkStatusIndicator type={statusType(key.KeyState)}>
                  {key.KeyState}
                </ChalkStatusIndicator>
              ),
            },
            { label: 'Key Usage', value: key.KeyUsage ?? '-' },
            { label: 'Key Spec', value: key.KeySpec ?? '-' },
            { label: 'Created', value: key.CreationDate?.toLocaleString() ?? '-' },
            { label: 'Enabled', value: key.Enabled ? 'Yes' : 'No' },
          ]}
        />
      </ChalkContainer>
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${aliases.length})`}
            actions={
              <ChalkButton onClick={() => setShowCreateAlias(true)}>Create alias</ChalkButton>
            }
          >
            Aliases
          </ChalkHeader>
        }
        items={aliases}
        columnDefinitions={[
          { id: 'name', header: 'Alias Name', cell: (item) => item.AliasName ?? '-' },
          { id: 'arn', header: 'Alias ARN', cell: (item) => item.AliasArn ?? '-' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteAlias(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No aliases</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Schedule key deletion"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDelete(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleScheduleDeletion} loading={schedulingDeletion}>
                Schedule deletion
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkBox>
            Are you sure you want to schedule deletion of key <b>{key.KeyId}</b>?
          </ChalkBox>
          <ChalkFormField label="Pending window (days)">
            <ChalkInput value={pendingDays} onChange={({ detail }) => setPendingDays(detail.value)} type="number" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showCreateAlias}
        onDismiss={() => setShowCreateAlias(false)}
        header="Create alias"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateAlias(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateAlias} loading={creatingAlias} disabled={!aliasName}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Alias name" description="Will be prefixed with alias/ if not already">
          <ChalkInput value={aliasName} onChange={({ detail }) => setAliasName(detail.value)} placeholder="my-key-alias" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showEditDesc}
        onDismiss={() => setShowEditDesc(false)}
        header="Edit description"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowEditDesc(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleEditDescription} loading={savingDesc}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Description">
          <ChalkInput
            value={descDraft}
            onChange={({ detail }) => setDescDraft(detail.value)}
            placeholder="Key description"
          />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={deleteAlias !== null}
        onDismiss={() => setDeleteAlias(null)}
        header="Delete alias"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteAlias(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteAlias} loading={deletingAlias}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete alias <b>{deleteAlias?.AliasName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
