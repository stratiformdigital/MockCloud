import { useCallback, useEffect, useState } from 'react';
import {
  ChalkBox,
  ChalkButton,
  ChalkFormField,
  ChalkHeader,
  ChalkInput,
  ChalkModal,
  ChalkSpaceBetween,
  ChalkSpinner,
  ChalkTable,
  ChalkTabs,
  ChalkTextarea,
} from '../../chalk';
import {
  AZURE_SUBSCRIPTION_ID,
  type AzureAppConfigSetting,
  type AzureApiManagementApi,
  type AzureApiManagementOperation,
  type AzureBlob,
  type AzureContainer,
  type AzureCosmosContainer,
  type AzureCosmosDatabase,
  type AzureCosmosItem,
  type AzureDefenderPlan,
  type AzureEventGridEvent,
  type AzureEventGridSubscription,
  type AzureFunctionDefinition,
  type AzureGraphApplication,
  type AzureGraphGroup,
  type AzureGraphServicePrincipal,
  type AzureGraphUser,
  type AzureKey,
  type AzureManagedIdentity,
  type AzureMonitorRecord,
  type AzureMonitorTable,
  type AzureNetworkSecurityGroup,
  type AzureResourceGroup,
  type AzureRoleAssignment,
  type AzureSecret,
  type AzureWafPolicy,
  createAzureContainer,
  createAzureCosmosContainer,
  createAzureCosmosDatabase,
  createAzureGraphApplication,
  createAzureGraphGroup,
  createAzureGraphServicePrincipal,
  createAzureGraphUser,
  createAzureKey,
  createAzureResourceGroup,
  deleteAzureApiManagementApi,
  deleteAzureApiManagementOperation,
  deleteAzureAppConfigSetting,
  deleteAzureBlob,
  deleteAzureContainer,
  deleteAzureCosmosContainer,
  deleteAzureCosmosDatabase,
  deleteAzureCosmosItem,
  deleteAzureDefenderPlan,
  deleteAzureFunction,
  deleteAzureGraphApplication,
  deleteAzureGraphGroup,
  deleteAzureGraphServicePrincipal,
  deleteAzureGraphUser,
  deleteAzureManagedIdentity,
  deleteAzureNetworkSecurityGroup,
  deleteAzureResourceGroup,
  deleteAzureRoleAssignment,
  deleteAzureSecret,
  deleteAzureWafPolicy,
  getAzureSecret,
  ingestAzureMonitorRecord,
  listAzureAppConfigSettings,
  listAzureApiManagementApis,
  listAzureApiManagementOperations,
  listAzureBlobs,
  listAzureContainers,
  listAzureCosmosContainers,
  listAzureCosmosDatabases,
  listAzureCosmosItems,
  listAzureDefenderPlans,
  listAzureEventGridEvents,
  listAzureEventGridSubscriptions,
  listAzureFunctions,
  listAzureGraphApplications,
  listAzureGraphGroups,
  listAzureGraphServicePrincipals,
  listAzureGraphUsers,
  listAzureKeys,
  listAzureManagedIdentities,
  listAzureMonitorRecords,
  listAzureMonitorTables,
  listAzureNetworkSecurityGroups,
  listAzureResourceGroups,
  listAzureRoleAssignments,
  listAzureSecrets,
  listAzureWafPolicies,
  putAzureApiManagementApi,
  putAzureApiManagementOperation,
  publishAzureEventGridEvent,
  invokeAzureApiManagementEndpoint,
  putAzureBlob,
  putAzureDefenderPlan,
  setAzureAppConfigSetting,
  setAzureSecret,
  putAzureFunction,
  putAzureManagedIdentity,
  putAzureNetworkSecurityGroup,
  putAzureRoleAssignment,
  putAzureWafPolicy,
  queryAzureMonitorLogs,
  invokeAzureFunction,
  upsertAzureCosmosItem,
} from '../../api/azure';

function formatDate(value?: string | number): string {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <ChalkBox color="text-status-error">{error}</ChalkBox>;
}

function BlobStoragePanel() {
  const [containers, setContainers] = useState<AzureContainer[]>([]);
  const [blobs, setBlobs] = useState<AzureBlob[]>([]);
  const [selectedContainer, setSelectedContainer] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingBlobs, setLoadingBlobs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateContainer, setShowCreateContainer] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [blobName, setBlobName] = useState('');
  const [blobContent, setBlobContent] = useState('');
  const [blobContentType, setBlobContentType] = useState('text/plain');
  const [busy, setBusy] = useState(false);

  const loadContainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAzureContainers();
      setContainers(result);
      if (!selectedContainer && result[0]) setSelectedContainer(result[0].name);
      if (selectedContainer && !result.some((container) => container.name === selectedContainer)) {
        setSelectedContainer(result[0]?.name ?? '');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedContainer]);

  const loadBlobs = useCallback(async () => {
    if (!selectedContainer) {
      setBlobs([]);
      return;
    }
    setLoadingBlobs(true);
    setError(null);
    try {
      setBlobs(await listAzureBlobs(selectedContainer));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingBlobs(false);
    }
  }, [selectedContainer]);

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  useEffect(() => {
    loadBlobs();
  }, [loadBlobs]);

  const handleCreateContainer = async () => {
    setBusy(true);
    try {
      await createAzureContainer(containerName);
      setShowCreateContainer(false);
      setContainerName('');
      await loadContainers();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteContainer = async (name: string) => {
    setBusy(true);
    try {
      await deleteAzureContainer(name);
      if (selectedContainer === name) setSelectedContainer('');
      await loadContainers();
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedContainer) return;
    setBusy(true);
    try {
      await putAzureBlob(selectedContainer, blobName, blobContent, blobContentType);
      setShowUpload(false);
      setBlobName('');
      setBlobContent('');
      await loadBlobs();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBlob = async (name: string) => {
    if (!selectedContainer) return;
    setBusy(true);
    try {
      await deleteAzureBlob(selectedContainer, name);
      await loadBlobs();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${containers.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreateContainer(true)}>Create container</ChalkButton>}
          >
            Blob Containers
          </ChalkHeader>
        }
        items={containers}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setSelectedContainer(item.name)}>
                {item.name}
              </ChalkButton>
            ),
            sortingField: 'name',
          },
          {
            id: 'lastModified',
            header: 'Last Modified',
            cell: (item) => formatDate(item.lastModified),
            sortingField: 'lastModified',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteContainer(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No containers</ChalkBox>}
      />

      <ChalkTable
        loading={loadingBlobs}
        header={
          <ChalkHeader
            counter={`(${blobs.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowUpload(true)} disabled={!selectedContainer}>
                Upload blob
              </ChalkButton>
            }
          >
            {selectedContainer ? `Blobs in ${selectedContainer}` : 'Blobs'}
          </ChalkHeader>
        }
        items={blobs}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'size', header: 'Size', cell: (item) => item.size, sortingField: 'size' },
          { id: 'contentType', header: 'Content Type', cell: (item) => item.contentType || '-', sortingField: 'contentType' },
          { id: 'lastModified', header: 'Last Modified', cell: (item) => formatDate(item.lastModified), sortingField: 'lastModified' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteBlob(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">{selectedContainer ? 'No blobs' : 'Select a container'}</ChalkBox>}
      />

      <ChalkModal
        visible={showCreateContainer}
        onDismiss={() => setShowCreateContainer(false)}
        header="Create container"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateContainer(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateContainer} loading={busy} disabled={!containerName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Container name">
          <ChalkInput value={containerName} onChange={({ detail }) => setContainerName(detail.value)} placeholder="my-container" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showUpload}
        onDismiss={() => setShowUpload(false)}
        header="Upload blob"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowUpload(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleUpload} loading={busy} disabled={!blobName}>Upload</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Blob name">
            <ChalkInput value={blobName} onChange={({ detail }) => setBlobName(detail.value)} placeholder="path/file.txt" />
          </ChalkFormField>
          <ChalkFormField label="Content type">
            <ChalkInput value={blobContentType} onChange={({ detail }) => setBlobContentType(detail.value)} placeholder="text/plain" />
          </ChalkFormField>
          <ChalkFormField label="Content">
            <ChalkTextarea value={blobContent} onChange={({ detail }) => setBlobContent(detail.value)} rows={8} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function KeyVaultPanel() {
  const [secrets, setSecrets] = useState<AzureSecret[]>([]);
  const [keys, setKeys] = useState<AzureKey[]>([]);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showSecretModal, setShowSecretModal] = useState(false);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [secretContentType, setSecretContentType] = useState('text/plain');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyName, setKeyName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [secretResult, keyResult] = await Promise.all([listAzureSecrets(), listAzureKeys()]);
      setSecrets(secretResult);
      setKeys(keyResult);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revealSecret = async (name: string) => {
    if (secretValues[name] !== undefined) return;
    setBusy(true);
    try {
      const secret = await getAzureSecret(name);
      setSecretValues((values) => ({ ...values, [name]: secret.value ?? '' }));
    } finally {
      setBusy(false);
    }
  };

  const handleSetSecret = async () => {
    setBusy(true);
    try {
      await setAzureSecret(secretName, secretValue, secretContentType);
      setShowSecretModal(false);
      setSecretName('');
      setSecretValue('');
      setSecretValues({});
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSecret = async (name: string) => {
    setBusy(true);
    try {
      await deleteAzureSecret(name);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateKey = async () => {
    setBusy(true);
    try {
      await createAzureKey(keyName);
      setShowKeyModal(false);
      setKeyName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${secrets.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowSecretModal(true)}>Set secret</ChalkButton>}
          >
            Key Vault Secrets
          </ChalkHeader>
        }
        items={secrets}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'contentType', header: 'Content Type', cell: (item) => item.contentType ?? '-', sortingField: 'contentType' },
          { id: 'updated', header: 'Updated', cell: (item) => formatDate(item.attributes?.updated), sortingField: 'updated' },
          {
            id: 'value',
            header: 'Value',
            cell: (item) => (
              secretValues[item.name] !== undefined ? (
                <ChalkBox variant="code">{secretValues[item.name]}</ChalkBox>
              ) : (
                <ChalkButton variant="inline-link" onClick={() => revealSecret(item.name)} disabled={busy}>
                  Show value
                </ChalkButton>
              )
            ),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteSecret(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No secrets</ChalkBox>}
      />

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${keys.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowKeyModal(true)}>Create key</ChalkButton>}
          >
            Key Vault Keys
          </ChalkHeader>
        }
        items={keys}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'updated', header: 'Updated', cell: (item) => formatDate(item.attributes?.updated), sortingField: 'updated' },
          { id: 'id', header: 'ID', cell: (item) => item.id },
        ]}
        empty={<ChalkBox textAlign="center">No keys</ChalkBox>}
      />

      <ChalkModal
        visible={showSecretModal}
        onDismiss={() => setShowSecretModal(false)}
        header="Set secret"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowSecretModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleSetSecret} loading={busy} disabled={!secretName}>Save</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Secret name">
            <ChalkInput value={secretName} onChange={({ detail }) => setSecretName(detail.value)} placeholder="my-secret" />
          </ChalkFormField>
          <ChalkFormField label="Content type">
            <ChalkInput value={secretContentType} onChange={({ detail }) => setSecretContentType(detail.value)} placeholder="text/plain" />
          </ChalkFormField>
          <ChalkFormField label="Value">
            <ChalkTextarea value={secretValue} onChange={({ detail }) => setSecretValue(detail.value)} rows={6} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showKeyModal}
        onDismiss={() => setShowKeyModal(false)}
        header="Create key"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowKeyModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateKey} loading={busy} disabled={!keyName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Key name">
          <ChalkInput value={keyName} onChange={({ detail }) => setKeyName(detail.value)} placeholder="my-key" />
        </ChalkFormField>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function ResourceGroupsPanel() {
  const [groups, setGroups] = useState<AzureResourceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('eastus');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await listAzureResourceGroups());
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
    setBusy(true);
    try {
      await createAzureResourceGroup(name, location);
      setShowCreate(false);
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (groupName: string) => {
    setBusy(true);
    try {
      await deleteAzureResourceGroup(groupName);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${groups.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreate(true)}>Create resource group</ChalkButton>}
          >
            Resource Groups
          </ChalkHeader>
        }
        items={groups}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'location', header: 'Location', cell: (item) => item.location, sortingField: 'location' },
          { id: 'state', header: 'State', cell: (item) => item.properties?.provisioningState ?? '-', sortingField: 'state' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No resource groups</ChalkBox>}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create resource group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={busy} disabled={!name}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Resource group name">
            <ChalkInput value={name} onChange={({ detail }) => setName(detail.value)} placeholder="my-resource-group" />
          </ChalkFormField>
          <ChalkFormField label="Location">
            <ChalkInput value={location} onChange={({ detail }) => setLocation(detail.value)} placeholder="eastus" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function AppConfigurationPanel() {
  const [settings, setSettings] = useState<AzureAppConfigSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSetModal, setShowSetModal] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [contentType, setContentType] = useState('text/plain');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await listAzureAppConfigSettings());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSet = async () => {
    setBusy(true);
    setError(null);
    try {
      await setAzureAppConfigSetting(key, label, value, contentType);
      setShowSetModal(false);
      setKey('');
      setLabel('');
      setValue('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (setting: AzureAppConfigSetting) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureAppConfigSetting(setting.key, setting.label);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${settings.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowSetModal(true)}>Set setting</ChalkButton>}
          >
            App Configuration Settings
          </ChalkHeader>
        }
        items={settings}
        columnDefinitions={[
          { id: 'key', header: 'Key', cell: (item) => item.key, sortingField: 'key' },
          { id: 'label', header: 'Label', cell: (item) => item.label ?? '-', sortingField: 'label' },
          { id: 'contentType', header: 'Content Type', cell: (item) => item.content_type ?? '-', sortingField: 'contentType' },
          { id: 'value', header: 'Value', cell: (item) => <ChalkBox variant="code">{item.value ?? ''}</ChalkBox> },
          { id: 'updated', header: 'Updated', cell: (item) => formatDate(item.last_modified), sortingField: 'updated' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(item)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No settings</ChalkBox>}
      />

      <ChalkModal
        visible={showSetModal}
        onDismiss={() => setShowSetModal(false)}
        header="Set setting"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowSetModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleSet} loading={busy} disabled={!key}>Save</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Key">
            <ChalkInput value={key} onChange={({ detail }) => setKey(detail.value)} placeholder="app:message" />
          </ChalkFormField>
          <ChalkFormField label="Label">
            <ChalkInput value={label} onChange={({ detail }) => setLabel(detail.value)} placeholder="dev" />
          </ChalkFormField>
          <ChalkFormField label="Content type">
            <ChalkInput value={contentType} onChange={({ detail }) => setContentType(detail.value)} placeholder="text/plain" />
          </ChalkFormField>
          <ChalkFormField label="Value">
            <ChalkTextarea value={value} onChange={({ detail }) => setValue(detail.value)} rows={6} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function FunctionsPanel() {
  const [appName, setAppName] = useState('mockfunc');
  const [functions, setFunctions] = useState<AzureFunctionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [functionName, setFunctionName] = useState('');
  const [invokeFunctionName, setInvokeFunctionName] = useState('');
  const [invokeBody, setInvokeBody] = useState('{\n  "message": "hello"\n}');
  const [invokeResult, setInvokeResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFunctions(await listAzureFunctions(appName));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [appName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await putAzureFunction(appName, functionName);
      setShowCreate(false);
      setFunctionName('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureFunction(appName, name);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInvoke = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await invokeAzureFunction(appName, name, JSON.parse(invokeBody));
      setInvokeFunctionName(name);
      setInvokeResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkFormField label="Function app">
        <ChalkInput value={appName} onChange={({ detail }) => setAppName(detail.value)} placeholder="mockfunc" />
      </ChalkFormField>
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${functions.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreate(true)}>Create function</ChalkButton>}
          >
            Functions
          </ChalkHeader>
        }
        items={functions}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'invokeUrl', header: 'Invoke URL', cell: (item) => item.properties?.invoke_url_template ?? '-' },
          { id: 'updated', header: 'Updated', cell: (item) => formatDate(item.properties?.updated), sortingField: 'updated' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkSpaceBetween direction="horizontal" size="xs">
                <ChalkButton variant="inline-link" onClick={() => handleInvoke(item.name)} disabled={busy}>
                  Invoke
                </ChalkButton>
                <ChalkButton variant="inline-link" onClick={() => handleDelete(item.name)} disabled={busy}>
                  Delete
                </ChalkButton>
              </ChalkSpaceBetween>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No functions</ChalkBox>}
      />

      <ChalkFormField label="Invoke payload">
        <ChalkTextarea value={invokeBody} onChange={({ detail }) => setInvokeBody(detail.value)} rows={5} />
      </ChalkFormField>
      {invokeResult && (
        <ChalkBox variant="code">
          {invokeFunctionName ? `${invokeFunctionName}\n` : ''}{invokeResult}
        </ChalkBox>
      )}

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create function"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={busy} disabled={!functionName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Function name">
          <ChalkInput value={functionName} onChange={({ detail }) => setFunctionName(detail.value)} placeholder="httpTrigger" />
        </ChalkFormField>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function ApiManagementPanel() {
  const [serviceName, setServiceName] = useState('mockapim');
  const [apis, setApis] = useState<AzureApiManagementApi[]>([]);
  const [operations, setOperations] = useState<AzureApiManagementOperation[]>([]);
  const [selectedApi, setSelectedApi] = useState('');
  const [loadingApis, setLoadingApis] = useState(true);
  const [loadingOperations, setLoadingOperations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showApiModal, setShowApiModal] = useState(false);
  const [apiName, setApiName] = useState('');
  const [apiPath, setApiPath] = useState('');
  const [showOperationModal, setShowOperationModal] = useState(false);
  const [operationName, setOperationName] = useState('');
  const [operationMethod, setOperationMethod] = useState('GET');
  const [operationPath, setOperationPath] = useState('/');
  const [invokePath, setInvokePath] = useState('orders');
  const [invokeMethod, setInvokeMethod] = useState('GET');
  const [invokeBody, setInvokeBody] = useState('{\n  "message": "hello"\n}');
  const [invokeResult, setInvokeResult] = useState('');

  const loadApis = useCallback(async () => {
    setLoadingApis(true);
    setError(null);
    try {
      const result = await listAzureApiManagementApis(serviceName);
      setApis(result);
      if (!selectedApi && result[0]) setSelectedApi(result[0].name);
      if (selectedApi && !result.some((api) => api.name === selectedApi)) {
        setSelectedApi(result[0]?.name ?? '');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingApis(false);
    }
  }, [serviceName, selectedApi]);

  const loadOperations = useCallback(async () => {
    if (!selectedApi) {
      setOperations([]);
      return;
    }
    setLoadingOperations(true);
    setError(null);
    try {
      setOperations(await listAzureApiManagementOperations(serviceName, selectedApi));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingOperations(false);
    }
  }, [serviceName, selectedApi]);

  useEffect(() => {
    loadApis();
  }, [loadApis]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const handleCreateApi = async () => {
    setBusy(true);
    setError(null);
    try {
      await putAzureApiManagementApi(serviceName, apiName, apiPath);
      setShowApiModal(false);
      setSelectedApi(apiName);
      setApiName('');
      setApiPath('');
      await loadApis();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteApi = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureApiManagementApi(serviceName, name);
      if (selectedApi === name) setSelectedApi('');
      await loadApis();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOperation = async () => {
    if (!selectedApi) return;
    setBusy(true);
    setError(null);
    try {
      await putAzureApiManagementOperation(serviceName, selectedApi, operationName, operationMethod, operationPath);
      setShowOperationModal(false);
      setOperationName('');
      setOperationMethod('GET');
      setOperationPath('/');
      await loadOperations();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOperation = async (name: string) => {
    if (!selectedApi) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAzureApiManagementOperation(serviceName, selectedApi, name);
      await loadOperations();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleInvoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = invokeMethod.toUpperCase() === 'GET' ? {} : JSON.parse(invokeBody);
      const result = await invokeAzureApiManagementEndpoint(serviceName, invokePath, invokeMethod.toUpperCase(), input);
      setInvokeResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadingApis) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkFormField label="API Management service">
        <ChalkInput value={serviceName} onChange={({ detail }) => setServiceName(detail.value)} placeholder="mockapim" />
      </ChalkFormField>

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${apis.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowApiModal(true)}>Create API</ChalkButton>}
          >
            API Management APIs
          </ChalkHeader>
        }
        items={apis}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setSelectedApi(item.name)}>
                {item.name}
              </ChalkButton>
            ),
            sortingField: 'name',
          },
          { id: 'path', header: 'Path', cell: (item) => item.properties?.path ?? '-', sortingField: 'path' },
          { id: 'protocols', header: 'Protocols', cell: (item) => item.properties?.protocols?.join(', ') || '-' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteApi(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No APIs</ChalkBox>}
      />

      <ChalkTable
        loading={loadingOperations}
        header={
          <ChalkHeader
            counter={`(${operations.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowOperationModal(true)} disabled={!selectedApi}>
                Create operation
              </ChalkButton>
            }
          >
            {selectedApi ? `Operations in ${selectedApi}` : 'Operations'}
          </ChalkHeader>
        }
        items={operations}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'method', header: 'Method', cell: (item) => item.properties?.method ?? '-', sortingField: 'method' },
          { id: 'path', header: 'Path', cell: (item) => item.properties?.urlTemplate ?? '-', sortingField: 'path' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteOperation(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">{selectedApi ? 'No operations' : 'Select an API'}</ChalkBox>}
      />

      <ChalkSpaceBetween size="m">
        <ChalkHeader variant="h2">Invoke Gateway</ChalkHeader>
        <ChalkFormField label="Method">
          <ChalkInput value={invokeMethod} onChange={({ detail }) => setInvokeMethod(detail.value.toUpperCase())} placeholder="GET" />
        </ChalkFormField>
        <ChalkFormField label="Path">
          <ChalkInput value={invokePath} onChange={({ detail }) => setInvokePath(detail.value)} placeholder="orders/123" />
        </ChalkFormField>
        <ChalkFormField label="Body JSON">
          <ChalkTextarea value={invokeBody} onChange={({ detail }) => setInvokeBody(detail.value)} rows={5} />
        </ChalkFormField>
        <ChalkButton variant="primary" onClick={handleInvoke} loading={busy} disabled={!invokePath}>
          Invoke
        </ChalkButton>
        {invokeResult && <ChalkBox variant="code">{invokeResult}</ChalkBox>}
      </ChalkSpaceBetween>

      <ChalkModal
        visible={showApiModal}
        onDismiss={() => setShowApiModal(false)}
        header="Create API"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowApiModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateApi} loading={busy} disabled={!apiName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="API name">
            <ChalkInput value={apiName} onChange={({ detail }) => setApiName(detail.value)} placeholder="orders" />
          </ChalkFormField>
          <ChalkFormField label="Path">
            <ChalkInput value={apiPath} onChange={({ detail }) => setApiPath(detail.value)} placeholder="orders" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showOperationModal}
        onDismiss={() => setShowOperationModal(false)}
        header="Create operation"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowOperationModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateOperation} loading={busy} disabled={!operationName || !selectedApi}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Operation name">
            <ChalkInput value={operationName} onChange={({ detail }) => setOperationName(detail.value)} placeholder="getOrder" />
          </ChalkFormField>
          <ChalkFormField label="Method">
            <ChalkInput value={operationMethod} onChange={({ detail }) => setOperationMethod(detail.value.toUpperCase())} placeholder="GET" />
          </ChalkFormField>
          <ChalkFormField label="Path template">
            <ChalkInput value={operationPath} onChange={({ detail }) => setOperationPath(detail.value)} placeholder="/{id}" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function MonitorLogsPanel() {
  const [workspaceName, setWorkspaceName] = useState('mockworkspace');
  const [tables, setTables] = useState<AzureMonitorTable[]>([]);
  const [records, setRecords] = useState<AzureMonitorRecord[]>([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showIngest, setShowIngest] = useState(false);
  const [tableName, setTableName] = useState('AppEvents');
  const [recordJson, setRecordJson] = useState('{\n  "message": "hello",\n  "level": "info"\n}');
  const [query, setQuery] = useState('AppEvents | take 10');
  const [queryResult, setQueryResult] = useState('');

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const result = await listAzureMonitorTables(workspaceName);
      setTables(result);
      if (!selectedTable && result[0]) setSelectedTable(result[0].name);
      if (selectedTable && !result.some((table) => table.name === selectedTable)) {
        setSelectedTable(result[0]?.name ?? '');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingTables(false);
    }
  }, [workspaceName, selectedTable]);

  const loadRecords = useCallback(async () => {
    if (!selectedTable) {
      setRecords([]);
      return;
    }
    setLoadingRecords(true);
    setError(null);
    try {
      setRecords(await listAzureMonitorRecords(workspaceName, selectedTable));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingRecords(false);
    }
  }, [workspaceName, selectedTable]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleIngest = async () => {
    setBusy(true);
    setError(null);
    try {
      await ingestAzureMonitorRecord(workspaceName, tableName, JSON.parse(recordJson));
      setShowIngest(false);
      setSelectedTable(tableName);
      await loadTables();
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleQuery = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await queryAzureMonitorLogs(workspaceName, query);
      setQueryResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadingTables) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkFormField label="Workspace">
        <ChalkInput value={workspaceName} onChange={({ detail }) => setWorkspaceName(detail.value)} placeholder="mockworkspace" />
      </ChalkFormField>

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${tables.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowIngest(true)}>Ingest record</ChalkButton>}
          >
            Log Analytics Tables
          </ChalkHeader>
        }
        items={tables}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Name',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setSelectedTable(item.name)}>
                {item.name}
              </ChalkButton>
            ),
            sortingField: 'name',
          },
          { id: 'records', header: 'Records', cell: (item) => item.properties?.recordCount ?? 0, sortingField: 'records' },
          { id: 'retention', header: 'Retention', cell: (item) => item.properties?.retentionInDays ?? '-', sortingField: 'retention' },
          { id: 'state', header: 'State', cell: (item) => item.properties?.provisioningState ?? '-', sortingField: 'state' },
        ]}
        empty={<ChalkBox textAlign="center">No tables</ChalkBox>}
      />

      <ChalkTable
        loading={loadingRecords}
        header={<ChalkHeader counter={`(${records.length})`}>{selectedTable ? `Records in ${selectedTable}` : 'Records'}</ChalkHeader>}
        items={records}
        columnDefinitions={[
          { id: 'time', header: 'TimeGenerated', cell: (item) => formatDate(item.timeGenerated), sortingField: 'timeGenerated' },
          { id: 'data', header: 'Data', cell: (item) => <ChalkBox variant="code">{JSON.stringify(item.data, null, 2)}</ChalkBox> },
        ]}
        empty={<ChalkBox textAlign="center">{selectedTable ? 'No records' : 'Select a table'}</ChalkBox>}
      />

      <ChalkSpaceBetween size="m">
        <ChalkHeader variant="h2">Query Logs</ChalkHeader>
        <ChalkFormField label="KQL">
          <ChalkInput value={query} onChange={({ detail }) => setQuery(detail.value)} placeholder="AppEvents | take 10" />
        </ChalkFormField>
        <ChalkButton variant="primary" onClick={handleQuery} loading={busy} disabled={!query}>
          Run query
        </ChalkButton>
        {queryResult && <ChalkBox variant="code">{queryResult}</ChalkBox>}
      </ChalkSpaceBetween>

      <ChalkModal
        visible={showIngest}
        onDismiss={() => setShowIngest(false)}
        header="Ingest record"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowIngest(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleIngest} loading={busy} disabled={!tableName}>Ingest</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Table">
            <ChalkInput value={tableName} onChange={({ detail }) => setTableName(detail.value)} placeholder="AppEvents" />
          </ChalkFormField>
          <ChalkFormField label="Record JSON">
            <ChalkTextarea value={recordJson} onChange={({ detail }) => setRecordJson(detail.value)} rows={8} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function NetworkPanel() {
  const [groups, setGroups] = useState<AzureNetworkSecurityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [ruleName, setRuleName] = useState('allowHttp');
  const [priority, setPriority] = useState('100');
  const [port, setPort] = useState('80');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await listAzureNetworkSecurityGroups());
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
    setBusy(true);
    setError(null);
    try {
      await putAzureNetworkSecurityGroup(groupName, ruleName, Number(priority) || 100, port);
      setShowCreate(false);
      setGroupName('');
      setRuleName('allowHttp');
      setPriority('100');
      setPort('80');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureNetworkSecurityGroup(name);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${groups.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreate(true)}>Create network security group</ChalkButton>}
          >
            Network Security Groups
          </ChalkHeader>
        }
        items={groups}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'location', header: 'Location', cell: (item) => item.location ?? '-', sortingField: 'location' },
          { id: 'state', header: 'State', cell: (item) => item.properties?.provisioningState ?? '-', sortingField: 'state' },
          {
            id: 'rules',
            header: 'Rules',
            cell: (item) => (
              <ChalkBox variant="code">
                {JSON.stringify(item.properties?.securityRules ?? [], null, 2)}
              </ChalkBox>
            ),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No network security groups</ChalkBox>}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create network security group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={busy} disabled={!groupName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={groupName} onChange={({ detail }) => setGroupName(detail.value)} placeholder="web-nsg" />
          </ChalkFormField>
          <ChalkFormField label="Rule name">
            <ChalkInput value={ruleName} onChange={({ detail }) => setRuleName(detail.value)} placeholder="allowHttp" />
          </ChalkFormField>
          <ChalkFormField label="Priority">
            <ChalkInput value={priority} onChange={({ detail }) => setPriority(detail.value)} placeholder="100" />
          </ChalkFormField>
          <ChalkFormField label="Destination port">
            <ChalkInput value={port} onChange={({ detail }) => setPort(detail.value)} placeholder="80" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function WafPanel() {
  const [policies, setPolicies] = useState<AzureWafPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [mode, setMode] = useState('Prevention');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPolicies(await listAzureWafPolicies());
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
    setBusy(true);
    setError(null);
    try {
      await putAzureWafPolicy(policyName, mode);
      setShowCreate(false);
      setPolicyName('');
      setMode('Prevention');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureWafPolicy(name);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${policies.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreate(true)}>Create WAF policy</ChalkButton>}
          >
            Web Application Firewall Policies
          </ChalkHeader>
        }
        items={policies}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'location', header: 'Location', cell: (item) => item.location ?? '-', sortingField: 'location' },
          { id: 'state', header: 'State', cell: (item) => item.properties?.provisioningState ?? '-', sortingField: 'state' },
          { id: 'mode', header: 'Mode', cell: (item) => String(item.properties?.policySettings?.mode ?? '-'), sortingField: 'mode' },
          {
            id: 'rules',
            header: 'Rules',
            cell: (item) => (
              <ChalkBox variant="code">
                {JSON.stringify({
                  managedRules: item.properties?.managedRules ?? {},
                  customRules: item.properties?.customRules ?? [],
                }, null, 2)}
              </ChalkBox>
            ),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No WAF policies</ChalkBox>}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create WAF policy"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={busy} disabled={!policyName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={policyName} onChange={({ detail }) => setPolicyName(detail.value)} placeholder="web-waf" />
          </ChalkFormField>
          <ChalkFormField label="Mode">
            <ChalkInput value={mode} onChange={({ detail }) => setMode(detail.value)} placeholder="Prevention" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function DefenderPanel() {
  const [plans, setPlans] = useState<AzureDefenderPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [planName, setPlanName] = useState('');
  const [pricingTier, setPricingTier] = useState('Standard');
  const [subPlan, setSubPlan] = useState('DefenderForStorageV2');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await listAzureDefenderPlans());
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
    setBusy(true);
    setError(null);
    try {
      await putAzureDefenderPlan(planName, pricingTier, subPlan);
      setShowCreate(false);
      setPlanName('');
      setPricingTier('Standard');
      setSubPlan('DefenderForStorageV2');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureDefenderPlan(name);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${plans.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreate(true)}>Create Defender plan</ChalkButton>}
          >
            Defender for Cloud Plans
          </ChalkHeader>
        }
        items={plans}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'tier', header: 'Tier', cell: (item) => item.properties?.pricingTier ?? '-', sortingField: 'tier' },
          { id: 'subPlan', header: 'Sub-plan', cell: (item) => item.properties?.subPlan ?? '-', sortingField: 'subPlan' },
          {
            id: 'extensions',
            header: 'Extensions',
            cell: (item) => (
              <ChalkBox variant="code">
                {JSON.stringify(item.properties?.extensions ?? [], null, 2)}
              </ChalkBox>
            ),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No Defender plans</ChalkBox>}
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create Defender plan"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreate} loading={busy} disabled={!planName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Name">
            <ChalkInput value={planName} onChange={({ detail }) => setPlanName(detail.value)} placeholder="StorageAccounts" />
          </ChalkFormField>
          <ChalkFormField label="Pricing tier">
            <ChalkInput value={pricingTier} onChange={({ detail }) => setPricingTier(detail.value)} placeholder="Standard" />
          </ChalkFormField>
          <ChalkFormField label="Sub-plan">
            <ChalkInput value={subPlan} onChange={({ detail }) => setSubPlan(detail.value)} placeholder="DefenderForStorageV2" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function IdentityPanel() {
  const defaultRoleDefinitionId = `/subscriptions/${AZURE_SUBSCRIPTION_ID}/providers/Microsoft.Authorization/roleDefinitions/b24988ac-6180-42a0-ab88-20f7382dd24c`;
  const [identities, setIdentities] = useState<AzureManagedIdentity[]>([]);
  const [assignments, setAssignments] = useState<AzureRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreateIdentity, setShowCreateIdentity] = useState(false);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [identityName, setIdentityName] = useState('');
  const [assignmentName, setAssignmentName] = useState<string>(() => crypto.randomUUID());
  const [principalId, setPrincipalId] = useState('');
  const [roleDefinitionId, setRoleDefinitionId] = useState(defaultRoleDefinitionId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextIdentities, nextAssignments] = await Promise.all([
        listAzureManagedIdentities(),
        listAzureRoleAssignments(),
      ]);
      setIdentities(nextIdentities);
      setAssignments(nextAssignments);
      if (!principalId && nextIdentities[0]?.properties?.principalId) {
        setPrincipalId(nextIdentities[0].properties.principalId);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [principalId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateIdentity = async () => {
    setBusy(true);
    setError(null);
    try {
      await putAzureManagedIdentity(identityName);
      setShowCreateIdentity(false);
      setIdentityName('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteIdentity = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureManagedIdentity(name);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAssignment = async () => {
    setBusy(true);
    setError(null);
    try {
      await putAzureRoleAssignment(assignmentName, principalId, roleDefinitionId);
      setShowCreateAssignment(false);
      setAssignmentName(crypto.randomUUID());
      setRoleDefinitionId(defaultRoleDefinitionId);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAssignment = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAzureRoleAssignment(name);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${identities.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreateIdentity(true)}>Create identity</ChalkButton>}
          >
            User Assigned Managed Identities
          </ChalkHeader>
        }
        items={identities}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'location', header: 'Location', cell: (item) => item.location ?? '-', sortingField: 'location' },
          { id: 'clientId', header: 'Client ID', cell: (item) => item.properties?.clientId ?? '-', sortingField: 'clientId' },
          {
            id: 'principalId',
            header: 'Principal ID',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setPrincipalId(item.properties?.principalId ?? '')}>
                {item.properties?.principalId ?? '-'}
              </ChalkButton>
            ),
            sortingField: 'principalId',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteIdentity(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No managed identities</ChalkBox>}
      />

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${assignments.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowCreateAssignment(true)}>Create role assignment</ChalkButton>}
          >
            Role Assignments
          </ChalkHeader>
        }
        items={assignments}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'principalId', header: 'Principal ID', cell: (item) => item.properties?.principalId ?? '-', sortingField: 'principalId' },
          { id: 'principalType', header: 'Principal Type', cell: (item) => item.properties?.principalType ?? '-', sortingField: 'principalType' },
          { id: 'roleDefinitionId', header: 'Role Definition', cell: (item) => item.properties?.roleDefinitionId ?? '-', sortingField: 'roleDefinitionId' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteAssignment(item.name)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No role assignments</ChalkBox>}
      />

      <ChalkModal
        visible={showCreateIdentity}
        onDismiss={() => setShowCreateIdentity(false)}
        header="Create managed identity"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateIdentity(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateIdentity} loading={busy} disabled={!identityName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Name">
          <ChalkInput value={identityName} onChange={({ detail }) => setIdentityName(detail.value)} placeholder="web-identity" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showCreateAssignment}
        onDismiss={() => setShowCreateAssignment(false)}
        header="Create role assignment"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreateAssignment(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateAssignment} loading={busy} disabled={!assignmentName || !principalId}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Assignment name">
            <ChalkInput value={assignmentName} onChange={({ detail }) => setAssignmentName(detail.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </ChalkFormField>
          <ChalkFormField label="Principal ID">
            <ChalkInput value={principalId} onChange={({ detail }) => setPrincipalId(detail.value)} placeholder="principal id" />
          </ChalkFormField>
          <ChalkFormField label="Role definition ID">
            <ChalkInput value={roleDefinitionId} onChange={({ detail }) => setRoleDefinitionId(detail.value)} placeholder={defaultRoleDefinitionId} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function EntraPanel() {
  const [users, setUsers] = useState<AzureGraphUser[]>([]);
  const [groups, setGroups] = useState<AzureGraphGroup[]>([]);
  const [applications, setApplications] = useState<AzureGraphApplication[]>([]);
  const [servicePrincipals, setServicePrincipals] = useState<AzureGraphServicePrincipal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [showPrincipalModal, setShowPrincipalModal] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userPrincipalName, setUserPrincipalName] = useState('');
  const [groupDisplayName, setGroupDisplayName] = useState('');
  const [applicationDisplayName, setApplicationDisplayName] = useState('');
  const [principalAppId, setPrincipalAppId] = useState('');
  const [principalDisplayName, setPrincipalDisplayName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextUsers, nextGroups, nextApplications, nextPrincipals] = await Promise.all([
        listAzureGraphUsers(),
        listAzureGraphGroups(),
        listAzureGraphApplications(),
        listAzureGraphServicePrincipals(),
      ]);
      setUsers(nextUsers);
      setGroups(nextGroups);
      setApplications(nextApplications);
      setServicePrincipals(nextPrincipals);
      if (!principalAppId && nextApplications[0]?.appId) {
        setPrincipalAppId(nextApplications[0].appId);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [principalAppId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateUser = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAzureGraphUser(userDisplayName, userPrincipalName);
      setShowUserModal(false);
      setUserDisplayName('');
      setUserPrincipalName('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateGroup = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAzureGraphGroup(groupDisplayName);
      setShowGroupModal(false);
      setGroupDisplayName('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateApplication = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAzureGraphApplication(applicationDisplayName);
      setShowApplicationModal(false);
      setApplicationDisplayName('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreatePrincipal = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAzureGraphServicePrincipal(principalAppId, principalDisplayName);
      setShowPrincipalModal(false);
      setPrincipalDisplayName('');
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${users.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowUserModal(true)}>Create user</ChalkButton>}
          >
            Users
          </ChalkHeader>
        }
        items={users}
        columnDefinitions={[
          { id: 'displayName', header: 'Display Name', cell: (item) => item.displayName ?? '-', sortingField: 'displayName' },
          { id: 'userPrincipalName', header: 'User Principal Name', cell: (item) => item.userPrincipalName ?? '-', sortingField: 'userPrincipalName' },
          { id: 'accountEnabled', header: 'Enabled', cell: (item) => String(item.accountEnabled ?? '-'), sortingField: 'accountEnabled' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(() => deleteAzureGraphUser(item.id))} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No users</ChalkBox>}
      />

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${groups.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowGroupModal(true)}>Create group</ChalkButton>}
          >
            Groups
          </ChalkHeader>
        }
        items={groups}
        columnDefinitions={[
          { id: 'displayName', header: 'Display Name', cell: (item) => item.displayName ?? '-', sortingField: 'displayName' },
          { id: 'mailNickname', header: 'Mail Nickname', cell: (item) => item.mailNickname ?? '-', sortingField: 'mailNickname' },
          { id: 'securityEnabled', header: 'Security Enabled', cell: (item) => String(item.securityEnabled ?? '-'), sortingField: 'securityEnabled' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(() => deleteAzureGraphGroup(item.id))} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No groups</ChalkBox>}
      />

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${applications.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowApplicationModal(true)}>Create application</ChalkButton>}
          >
            App Registrations
          </ChalkHeader>
        }
        items={applications}
        columnDefinitions={[
          { id: 'displayName', header: 'Display Name', cell: (item) => item.displayName ?? '-', sortingField: 'displayName' },
          {
            id: 'appId',
            header: 'App ID',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setPrincipalAppId(item.appId)}>
                {item.appId}
              </ChalkButton>
            ),
            sortingField: 'appId',
          },
          { id: 'audience', header: 'Audience', cell: (item) => item.signInAudience ?? '-', sortingField: 'audience' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(() => deleteAzureGraphApplication(item.id))} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No app registrations</ChalkBox>}
      />

      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${servicePrincipals.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowPrincipalModal(true)}>Create service principal</ChalkButton>}
          >
            Service Principals
          </ChalkHeader>
        }
        items={servicePrincipals}
        columnDefinitions={[
          { id: 'displayName', header: 'Display Name', cell: (item) => item.displayName ?? '-', sortingField: 'displayName' },
          { id: 'appId', header: 'App ID', cell: (item) => item.appId, sortingField: 'appId' },
          { id: 'type', header: 'Type', cell: (item) => item.servicePrincipalType ?? '-', sortingField: 'type' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDelete(() => deleteAzureGraphServicePrincipal(item.id))} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No service principals</ChalkBox>}
      />

      <ChalkModal
        visible={showUserModal}
        onDismiss={() => setShowUserModal(false)}
        header="Create user"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowUserModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateUser} loading={busy} disabled={!userDisplayName || !userPrincipalName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Display name">
            <ChalkInput value={userDisplayName} onChange={({ detail }) => setUserDisplayName(detail.value)} placeholder="Local User" />
          </ChalkFormField>
          <ChalkFormField label="User principal name">
            <ChalkInput value={userPrincipalName} onChange={({ detail }) => setUserPrincipalName(detail.value)} placeholder="local.user@example.com" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showGroupModal}
        onDismiss={() => setShowGroupModal(false)}
        header="Create group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowGroupModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateGroup} loading={busy} disabled={!groupDisplayName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Display name">
          <ChalkInput value={groupDisplayName} onChange={({ detail }) => setGroupDisplayName(detail.value)} placeholder="Developers" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showApplicationModal}
        onDismiss={() => setShowApplicationModal(false)}
        header="Create application"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowApplicationModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateApplication} loading={busy} disabled={!applicationDisplayName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Display name">
          <ChalkInput value={applicationDisplayName} onChange={({ detail }) => setApplicationDisplayName(detail.value)} placeholder="web-app" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showPrincipalModal}
        onDismiss={() => setShowPrincipalModal(false)}
        header="Create service principal"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowPrincipalModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreatePrincipal} loading={busy} disabled={!principalAppId}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="App ID">
            <ChalkInput value={principalAppId} onChange={({ detail }) => setPrincipalAppId(detail.value)} placeholder="app id" />
          </ChalkFormField>
          <ChalkFormField label="Display name">
            <ChalkInput value={principalDisplayName} onChange={({ detail }) => setPrincipalDisplayName(detail.value)} placeholder="web-app" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function EventGridPanel() {
  const [topicName, setTopicName] = useState('mocktopic');
  const [events, setEvents] = useState<AzureEventGridEvent[]>([]);
  const [subscriptions, setSubscriptions] = useState<AzureEventGridSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [subject, setSubject] = useState('/mockcloud/console');
  const [eventType, setEventType] = useState('MockCloud.Console');
  const [eventData, setEventData] = useState('{\n  "message": "hello"\n}');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEvents, nextSubscriptions] = await Promise.all([
        listAzureEventGridEvents(topicName),
        listAzureEventGridSubscriptions(topicName),
      ]);
      setEvents(nextEvents);
      setSubscriptions(nextSubscriptions);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [topicName]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await publishAzureEventGridEvent(topicName, subject, eventType, JSON.parse(eventData));
      setShowPublish(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkFormField label="Topic">
        <ChalkInput value={topicName} onChange={({ detail }) => setTopicName(detail.value)} placeholder="mocktopic" />
      </ChalkFormField>
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${events.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowPublish(true)}>Publish event</ChalkButton>}
          >
            Event Grid Events
          </ChalkHeader>
        }
        items={events}
        columnDefinitions={[
          { id: 'subject', header: 'Subject', cell: (item) => item.subject ?? '-', sortingField: 'subject' },
          { id: 'eventType', header: 'Event Type', cell: (item) => item.eventType ?? '-', sortingField: 'eventType' },
          { id: 'schema', header: 'Schema', cell: (item) => item.schema, sortingField: 'schema' },
          { id: 'eventTime', header: 'Time', cell: (item) => formatDate(item.eventTime), sortingField: 'eventTime' },
          {
            id: 'data',
            header: 'Data',
            cell: (item) => (
              <ChalkBox variant="code">
                {item.data === undefined ? '-' : JSON.stringify(item.data, null, 2)}
              </ChalkBox>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No events</ChalkBox>}
      />

      <ChalkTable
        header={<ChalkHeader counter={`(${subscriptions.length})`}>Event Subscriptions</ChalkHeader>}
        items={subscriptions}
        columnDefinitions={[
          { id: 'name', header: 'Name', cell: (item) => item.name, sortingField: 'name' },
          { id: 'state', header: 'State', cell: (item) => item.properties?.provisioningState ?? '-', sortingField: 'state' },
          { id: 'labels', header: 'Labels', cell: (item) => item.properties?.labels?.join(', ') || '-' },
          {
            id: 'destination',
            header: 'Destination',
            cell: (item) => (
              <ChalkBox variant="code">
                {item.properties?.destination ? JSON.stringify(item.properties.destination, null, 2) : '-'}
              </ChalkBox>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No subscriptions</ChalkBox>}
      />

      <ChalkModal
        visible={showPublish}
        onDismiss={() => setShowPublish(false)}
        header="Publish event"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowPublish(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handlePublish} loading={busy} disabled={!topicName || !subject || !eventType}>Publish</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Subject">
            <ChalkInput value={subject} onChange={({ detail }) => setSubject(detail.value)} placeholder="/mockcloud/console" />
          </ChalkFormField>
          <ChalkFormField label="Event type">
            <ChalkInput value={eventType} onChange={({ detail }) => setEventType(detail.value)} placeholder="MockCloud.Console" />
          </ChalkFormField>
          <ChalkFormField label="Data JSON">
            <ChalkTextarea value={eventData} onChange={({ detail }) => setEventData(detail.value)} rows={8} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

function CosmosDbPanel() {
  const [databases, setDatabases] = useState<AzureCosmosDatabase[]>([]);
  const [containers, setContainers] = useState<AzureCosmosContainer[]>([]);
  const [items, setItems] = useState<AzureCosmosItem[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [selectedContainer, setSelectedContainer] = useState('');
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showDatabaseModal, setShowDatabaseModal] = useState(false);
  const [databaseName, setDatabaseName] = useState('');
  const [showContainerModal, setShowContainerModal] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [partitionKeyPath, setPartitionKeyPath] = useState('/pk');
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemJson, setItemJson] = useState('{\n  "id": "item-1",\n  "pk": "local"\n}');

  const loadDatabases = useCallback(async () => {
    setLoadingDatabases(true);
    setError(null);
    try {
      const result = await listAzureCosmosDatabases();
      setDatabases(result);
      if (!selectedDatabase && result[0]) setSelectedDatabase(result[0].id);
      if (selectedDatabase && !result.some((database) => database.id === selectedDatabase)) {
        setSelectedDatabase(result[0]?.id ?? '');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingDatabases(false);
    }
  }, [selectedDatabase]);

  const loadContainers = useCallback(async () => {
    if (!selectedDatabase) {
      setContainers([]);
      setSelectedContainer('');
      return;
    }
    setLoadingContainers(true);
    setError(null);
    try {
      const result = await listAzureCosmosContainers(selectedDatabase);
      setContainers(result);
      if (!selectedContainer && result[0]) setSelectedContainer(result[0].id);
      if (selectedContainer && !result.some((container) => container.id === selectedContainer)) {
        setSelectedContainer(result[0]?.id ?? '');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingContainers(false);
    }
  }, [selectedDatabase, selectedContainer]);

  const loadItems = useCallback(async () => {
    if (!selectedDatabase || !selectedContainer) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    setError(null);
    try {
      setItems(await listAzureCosmosItems(selectedDatabase, selectedContainer));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingItems(false);
    }
  }, [selectedDatabase, selectedContainer]);

  useEffect(() => {
    loadDatabases();
  }, [loadDatabases]);

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreateDatabase = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAzureCosmosDatabase(databaseName);
      setShowDatabaseModal(false);
      setDatabaseName('');
      await loadDatabases();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    setBusy(true);
    try {
      await deleteAzureCosmosDatabase(id);
      if (selectedDatabase === id) {
        setSelectedDatabase('');
        setSelectedContainer('');
      }
      await loadDatabases();
    } finally {
      setBusy(false);
    }
  };

  const handleCreateContainer = async () => {
    if (!selectedDatabase) return;
    setBusy(true);
    setError(null);
    try {
      await createAzureCosmosContainer(selectedDatabase, containerName, partitionKeyPath);
      setShowContainerModal(false);
      setContainerName('');
      await loadContainers();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteContainer = async (id: string) => {
    if (!selectedDatabase) return;
    setBusy(true);
    try {
      await deleteAzureCosmosContainer(selectedDatabase, id);
      if (selectedContainer === id) setSelectedContainer('');
      await loadContainers();
    } finally {
      setBusy(false);
    }
  };

  const handleUpsertItem = async () => {
    if (!selectedDatabase || !selectedContainer) return;
    setBusy(true);
    setError(null);
    try {
      const item = JSON.parse(itemJson) as AzureCosmosItem;
      await upsertAzureCosmosItem(selectedDatabase, selectedContainer, item);
      setShowItemModal(false);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!selectedDatabase || !selectedContainer) return;
    setBusy(true);
    try {
      await deleteAzureCosmosItem(selectedDatabase, selectedContainer, id);
      await loadItems();
    } finally {
      setBusy(false);
    }
  };

  if (loadingDatabases) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ErrorBox error={error} />
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${databases.length})`}
            actions={<ChalkButton variant="primary" onClick={() => setShowDatabaseModal(true)}>Create database</ChalkButton>}
          >
            Cosmos Databases
          </ChalkHeader>
        }
        items={databases}
        columnDefinitions={[
          {
            id: 'id',
            header: 'Name',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setSelectedDatabase(item.id)}>
                {item.id}
              </ChalkButton>
            ),
            sortingField: 'id',
          },
          { id: 'updated', header: 'Updated', cell: (item) => formatDate(item._ts), sortingField: 'updated' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteDatabase(item.id)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">No databases</ChalkBox>}
      />

      <ChalkTable
        loading={loadingContainers}
        header={
          <ChalkHeader
            counter={`(${containers.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowContainerModal(true)} disabled={!selectedDatabase}>
                Create container
              </ChalkButton>
            }
          >
            {selectedDatabase ? `Containers in ${selectedDatabase}` : 'Containers'}
          </ChalkHeader>
        }
        items={containers}
        columnDefinitions={[
          {
            id: 'id',
            header: 'Name',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setSelectedContainer(item.id)}>
                {item.id}
              </ChalkButton>
            ),
            sortingField: 'id',
          },
          { id: 'partitionKey', header: 'Partition Key', cell: (item) => item.partitionKey?.paths?.join(', ') ?? '-', sortingField: 'partitionKey' },
          { id: 'updated', header: 'Updated', cell: (item) => formatDate(item._ts), sortingField: 'updated' },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteContainer(item.id)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">{selectedDatabase ? 'No containers' : 'Select a database'}</ChalkBox>}
      />

      <ChalkTable
        loading={loadingItems}
        header={
          <ChalkHeader
            counter={`(${items.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowItemModal(true)} disabled={!selectedContainer}>
                Upsert item
              </ChalkButton>
            }
          >
            {selectedContainer ? `Items in ${selectedContainer}` : 'Items'}
          </ChalkHeader>
        }
        items={items}
        columnDefinitions={[
          { id: 'id', header: 'ID', cell: (item) => item.id, sortingField: 'id' },
          { id: 'json', header: 'JSON', cell: (item) => <ChalkBox variant="code">{JSON.stringify(item, null, 2)}</ChalkBox> },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => handleDeleteItem(item.id)} disabled={busy}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={<ChalkBox textAlign="center">{selectedContainer ? 'No items' : 'Select a container'}</ChalkBox>}
      />

      <ChalkModal
        visible={showDatabaseModal}
        onDismiss={() => setShowDatabaseModal(false)}
        header="Create database"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDatabaseModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateDatabase} loading={busy} disabled={!databaseName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Database name">
          <ChalkInput value={databaseName} onChange={({ detail }) => setDatabaseName(detail.value)} placeholder="my-database" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={showContainerModal}
        onDismiss={() => setShowContainerModal(false)}
        header="Create container"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowContainerModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleCreateContainer} loading={busy} disabled={!containerName}>Create</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Container name">
            <ChalkInput value={containerName} onChange={({ detail }) => setContainerName(detail.value)} placeholder="items" />
          </ChalkFormField>
          <ChalkFormField label="Partition key path">
            <ChalkInput value={partitionKeyPath} onChange={({ detail }) => setPartitionKeyPath(detail.value)} placeholder="/pk" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={showItemModal}
        onDismiss={() => setShowItemModal(false)}
        header="Upsert item"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowItemModal(false)}>Cancel</ChalkButton>
              <ChalkButton variant="primary" onClick={handleUpsertItem} loading={busy}>Save</ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkFormField label="Item JSON">
          <ChalkTextarea value={itemJson} onChange={({ detail }) => setItemJson(detail.value)} rows={10} />
        </ChalkFormField>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}

export default function Azure() {
  return (
    <ChalkSpaceBetween size="l">
      <ChalkHeader variant="h1">Azure</ChalkHeader>
      <ChalkTabs
        tabs={[
          { id: 'blob', label: 'Blob Storage', content: <BlobStoragePanel /> },
          { id: 'keyvault', label: 'Key Vault', content: <KeyVaultPanel /> },
          { id: 'appconfig', label: 'App Configuration', content: <AppConfigurationPanel /> },
          { id: 'functions', label: 'Functions', content: <FunctionsPanel /> },
          { id: 'apim', label: 'API Management', content: <ApiManagementPanel /> },
          { id: 'eventgrid', label: 'Event Grid', content: <EventGridPanel /> },
          { id: 'monitor', label: 'Monitor Logs', content: <MonitorLogsPanel /> },
          { id: 'network', label: 'Network', content: <NetworkPanel /> },
          { id: 'waf', label: 'WAF', content: <WafPanel /> },
          { id: 'defender', label: 'Defender', content: <DefenderPanel /> },
          { id: 'identity', label: 'Identity', content: <IdentityPanel /> },
          { id: 'entra', label: 'Entra', content: <EntraPanel /> },
          { id: 'cosmos', label: 'Cosmos DB', content: <CosmosDbPanel /> },
          { id: 'arm', label: 'Resource Groups', content: <ResourceGroupsPanel /> },
        ]}
      />
    </ChalkSpaceBetween>
  );
}
