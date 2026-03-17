import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkTabs, ChalkTable, ChalkSpinner, ChalkSpaceBetween, ChalkBox, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, ChalkSelect, ChalkFlashbar } from '../../chalk';
import {
  GetRestApiCommand,
  GetResourcesCommand,
  GetStagesCommand,
  DeleteRestApiCommand,
  CreateResourceCommand,
  DeleteResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  RestApi,
  Resource,
  Stage,
} from '@aws-sdk/client-api-gateway';
import { apigateway } from '../../api/clients';

function formatDate(d: Date | undefined): string {
  if (!d) return '-';
  return d.toLocaleString();
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map((m) => ({
  label: m,
  value: m,
}));

function ResourcesTab({ apiId }: { apiId: string }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateResource, setShowCreateResource] = useState(false);
  const [pathPart, setPathPart] = useState('');
  const [creatingResource, setCreatingResource] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [deletingResource, setDeletingResource] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const [methodTarget, setMethodTarget] = useState<Resource | null>(null);
  const [selectedMethod, setSelectedMethod] = useState(HTTP_METHODS[0]);
  const [addingMethod, setAddingMethod] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apigateway.send(new GetResourcesCommand({ restApiId: apiId }));
      setResources(res.items ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [apiId]);

  useEffect(() => {
    load();
  }, [load]);

  const rootResourceId = resources.find((r) => r.path === '/')?.id;

  const handleCreateResource = async () => {
    if (!rootResourceId || !pathPart) return;
    setCreatingResource(true);
    try {
      await apigateway.send(
        new CreateResourceCommand({ restApiId: apiId, parentId: rootResourceId, pathPart })
      );
      setShowCreateResource(false);
      setPathPart('');
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setCreatingResource(false);
    }
  };

  const handleDeleteResource = async () => {
    if (!deleteTarget?.id) return;
    setDeletingResource(true);
    try {
      await apigateway.send(
        new DeleteResourceCommand({ restApiId: apiId, resourceId: deleteTarget.id })
      );
      setDeleteTarget(null);
      await load();
      setFlash([{ type: 'success', content: `Resource "${deleteTarget.path}" deleted.` }]);
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeletingResource(false);
    }
  };

  const handleAddMethod = async () => {
    if (!methodTarget?.id || !selectedMethod) return;
    setAddingMethod(true);
    try {
      const httpMethod = selectedMethod.value;
      await apigateway.send(
        new PutMethodCommand({
          restApiId: apiId,
          resourceId: methodTarget.id,
          httpMethod,
          authorizationType: 'NONE',
        })
      );
      await apigateway.send(
        new PutIntegrationCommand({
          restApiId: apiId,
          resourceId: methodTarget.id,
          httpMethod,
          type: 'MOCK',
        })
      );
      setMethodTarget(null);
      await load();
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setAddingMethod(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkBox color="text-status-error">{error}</ChalkBox>;

  return (
    <>
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
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${resources.length})`}
            actions={
              <ChalkButton onClick={() => setShowCreateResource(true)} disabled={!rootResourceId}>
                Create resource
              </ChalkButton>
            }
          >
            Resources
          </ChalkHeader>
        }
        columnDefinitions={[
          {
            id: 'path',
            header: 'Path',
            cell: (item) => item.path ?? '-',
            sortingField: 'path',
          },
          {
            id: 'id',
            header: 'Resource ID',
            cell: (item) => item.id ?? '-',
          },
          {
            id: 'methods',
            header: 'Methods',
            cell: (item) => {
              const methods = item.resourceMethods ? Object.keys(item.resourceMethods) : [];
              return methods.length > 0 ? methods.join(', ') : '-';
            },
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkSpaceBetween direction="horizontal" size="xs">
                <ChalkButton
                  variant="inline-link"
                  onClick={() => {
                    setSelectedMethod(HTTP_METHODS[0]);
                    setMethodTarget(item);
                  }}
                >
                  Add method
                </ChalkButton>
                {item.path !== '/' && (
                  <ChalkButton variant="inline-link" onClick={() => setDeleteTarget(item)}>
                    Delete
                  </ChalkButton>
                )}
              </ChalkSpaceBetween>
            ),
          },
        ]}
        items={resources}
        sortingDisabled={false}
      />

      <ChalkModal
        visible={showCreateResource}
        onDismiss={() => setShowCreateResource(false)}
        header="Create resource"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateResource(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateResource} loading={creatingResource} disabled={!pathPart}>
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Path part" description="e.g. users or {id}">
          <ChalkInput
            value={pathPart}
            onChange={({ detail }) => setPathPart(detail.value)}
            placeholder="users"
          />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={methodTarget !== null}
        onDismiss={() => setMethodTarget(null)}
        header={`Add method to ${methodTarget?.path ?? ''}`}
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setMethodTarget(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleAddMethod} loading={addingMethod}>
                Add
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="HTTP method">
          <ChalkSelect
            selectedOption={selectedMethod}
            onChange={({ detail }) => setSelectedMethod(detail.selectedOption as typeof selectedMethod)}
            options={HTTP_METHODS}
          />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={deleteTarget !== null}
        onDismiss={() => setDeleteTarget(null)}
        header="Delete resource"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteTarget(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteResource} loading={deletingResource}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete resource <b>{deleteTarget?.path}</b>?
      </ChalkModal>
    </>
  );
}

function StagesTab({ apiId }: { apiId: string }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apigateway.send(new GetStagesCommand({ restApiId: apiId }));
        if (cancelled) return;
        setStages(res.item ?? []);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiId]);

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkBox color="text-status-error">{error}</ChalkBox>;

  return (
    <ChalkTable
      header={<ChalkHeader counter={`(${stages.length})`}>Stages</ChalkHeader>}
      columnDefinitions={[
        {
          id: 'name',
          header: 'Stage Name',
          cell: (item) => item.stageName ?? '-',
          sortingField: 'stageName',
        },
        {
          id: 'deploymentId',
          header: 'Deployment ID',
          cell: (item) => item.deploymentId ?? '-',
        },
        {
          id: 'description',
          header: 'Description',
          cell: (item) => item.description ?? '-',
        },
        {
          id: 'lastUpdated',
          header: 'Last Updated',
          cell: (item) => formatDate(item.lastUpdatedDate),
        },
        {
          id: 'created',
          header: 'Created',
          cell: (item) => formatDate(item.createdDate),
        },
      ]}
      items={stages}
      sortingDisabled={false}
    />
  );
}

export default function ApiDetail() {
  const { apiId } = useParams<{ apiId: string }>();
  const navigate = useNavigate();
  const [api, setApi] = useState<RestApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; content: string }[]>([]);

  const load = useCallback(async () => {
    if (!apiId) return;
    try {
      const res = await apigateway.send(new GetRestApiCommand({ restApiId: apiId }));
      setApi(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [apiId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!apiId) return;
    setDeleting(true);
    try {
      await apigateway.send(new DeleteRestApiCommand({ restApiId: apiId }));
      navigate('/apigateway');
    } catch (err) {
      setFlash([{ type: 'error', content: String(err) }]);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!api || !apiId) return <ChalkHeader variant="h1">API not found</ChalkHeader>;

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

      <ChalkHeader
        variant="h1"
        description={api.description ?? ''}
        actions={
          <ChalkButton onClick={() => setShowDelete(true)}>Delete</ChalkButton>
        }
      >
        {api.name}
      </ChalkHeader>
      <ChalkTabs
        tabs={[
          {
            id: 'resources',
            label: 'Resources',
            content: <ResourcesTab apiId={apiId} />,
          },
          {
            id: 'stages',
            label: 'Stages',
            content: <StagesTab apiId={apiId} />,
          },
        ]}
      />

      <ChalkModal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete API"
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
        Are you sure you want to delete <b>{api.name}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
