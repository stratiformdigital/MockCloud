import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkBox, useChalkCollection } from '../../chalk';
import { GetRestApisCommand, CreateRestApiCommand, DeleteRestApiCommand, RestApi } from '@aws-sdk/client-api-gateway';
import { apigateway } from '../../api/clients';

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

export default function Apis() {
  const navigate = useNavigate();
  const [apis, setApis] = useState<RestApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteApi, setDeleteApi] = useState<RestApi | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apigateway.send(new GetRestApisCommand({}));
      setApis(res.items ?? []);
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
      await apigateway.send(new CreateRestApiCommand({ name: createName, description: createDescription }));
      setShowCreate(false);
      setCreateName('');
      setCreateDescription('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteApi?.id) return;
    setDeleting(true);
    try {
      await apigateway.send(new DeleteRestApiCommand({ restApiId: deleteApi.id }));
      setDeleteApi(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(apis, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.name ?? '').toLowerCase().includes(text.toLowerCase()),
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
            counter={`(${apis.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create API
              </ChalkButton>
            }
          >
            API Gateway APIs
          </ChalkHeader>
        }
        filter={<ChalkTextFilter {...filterProps} filteringPlaceholder="Find APIs" />}
        columnDefinitions={[
          {
            id: 'name',
            header: 'API Name',
            cell: (item) => (
              <ChalkLink
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/apigateway/apis/${encodeURIComponent(item.id!)}`);
                }}
              >
                {item.name}
              </ChalkLink>
            ),
            sortingField: 'name',
          },
          {
            id: 'id',
            header: 'API ID',
            cell: (item) => item.id ?? '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.description ?? '-',
          },
          {
            id: 'created',
            header: 'Created',
            cell: (item) => formatDate(item.createdDate),
            sortingField: 'createdDate',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteApi(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        items={items}
        variant="full-page"
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create API"
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
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="My REST API" />
          </ChalkFormField>
          <ChalkFormField label="Description">
            <ChalkInput value={createDescription} onChange={({ detail }) => setCreateDescription(detail.value)} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteApi !== null}
        onDismiss={() => setDeleteApi(null)}
        header="Delete API"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteApi(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteApi?.name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
