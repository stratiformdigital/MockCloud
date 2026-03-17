import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChalkTable, ChalkHeader, ChalkTextFilter, ChalkSpinner, ChalkSpaceBetween,
  ChalkLink, ChalkButton, ChalkModal, ChalkBox, ChalkFormField, ChalkInput,
  ChalkSelect, useChalkCollection,
} from '../../chalk';
import {
  ListWebACLsCommand,
  GetWebACLCommand,
  DeleteWebACLCommand,
  CreateWebACLCommand,
  WebACLSummary,
} from '@aws-sdk/client-wafv2';
import { wafv2 } from '../../api/clients';

export default function WebAcls() {
  const navigate = useNavigate();
  const [acls, setAcls] = useState<WebACLSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteAcl, setDeleteAcl] = useState<WebACLSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createScope, setCreateScope] = useState<{ label: string; value: string }>({ label: 'REGIONAL', value: 'REGIONAL' });
  const [createAction, setCreateAction] = useState<{ label: string; value: string }>({ label: 'Allow', value: 'Allow' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await wafv2.send(new ListWebACLsCommand({ Scope: 'REGIONAL' }));
      setAcls(res.WebACLs ?? []);
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
      const defaultAction = createAction.value === 'Allow' ? { Allow: {} } : { Block: {} };
      await wafv2.send(
        new CreateWebACLCommand({
          Name: createName,
          Scope: createScope.value as 'REGIONAL' | 'CLOUDFRONT',
          DefaultAction: defaultAction,
          VisibilityConfig: {
            SampledRequestsEnabled: true,
            CloudWatchMetricsEnabled: true,
            MetricName: createName,
          },
          Rules: [],
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateScope({ label: 'REGIONAL', value: 'REGIONAL' });
      setCreateAction({ label: 'Allow', value: 'Allow' });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAcl?.Id || !deleteAcl?.Name) return;
    setDeleting(true);
    try {
      const getRes = await wafv2.send(
        new GetWebACLCommand({ Name: deleteAcl.Name, Id: deleteAcl.Id, Scope: 'REGIONAL' })
      );
      await wafv2.send(
        new DeleteWebACLCommand({
          Name: deleteAcl.Name,
          Id: deleteAcl.Id,
          Scope: 'REGIONAL',
          LockToken: getRes.LockToken,
        })
      );
      setDeleteAcl(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(acls, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.Name ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${acls.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create Web ACL
              </ChalkButton>
            }
          >
            WAFv2 Web ACLs
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find Web ACLs" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <ChalkLink onFollow={(e) => { e.preventDefault(); navigate(`/wafv2/web-acls/${item.Name}/${item.Id}`); }}>
                {item.Name ?? '-'}
              </ChalkLink>
            ),
            sortingField: 'Name',
          },
          {
            id: 'id',
            header: 'ID',
            cell: (item) => item.Id ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.Description ?? '-',
          },
          {
            id: 'arn',
            header: 'ARN',
            cell: (item) => item.ARN ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteAcl(item)}>
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
        header="Create Web ACL"
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
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-web-acl" />
          </ChalkFormField>
          <ChalkFormField label="Scope">
            <ChalkSelect
              selectedOption={createScope}
              onChange={({ detail }) => setCreateScope(detail.selectedOption as typeof createScope)}
              options={[
                { label: 'REGIONAL', value: 'REGIONAL' },
                { label: 'CLOUDFRONT', value: 'CLOUDFRONT' },
              ]}
            />
          </ChalkFormField>
          <ChalkFormField label="Default Action">
            <ChalkSelect
              selectedOption={createAction}
              onChange={({ detail }) => setCreateAction(detail.selectedOption as typeof createAction)}
              options={[
                { label: 'Allow', value: 'Allow' },
                { label: 'Block', value: 'Block' },
              ]}
            />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteAcl !== null}
        onDismiss={() => setDeleteAcl(null)}
        header="Delete Web ACL"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteAcl(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete Web ACL <b>{deleteAcl?.Name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
