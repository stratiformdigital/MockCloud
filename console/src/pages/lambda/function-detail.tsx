import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  GetFunctionCommand,
  InvokeCommand,
  DeleteFunctionCommand,
  UpdateFunctionConfigurationCommand,
  FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import {
  ChalkHeader,
  ChalkSpaceBetween,
  ChalkContainer,
  ChalkTabs,
  ChalkBreadcrumbs,
  ChalkButton,
  ChalkFormField,
  ChalkInput,
  ChalkTextarea,
  ChalkModal,
  ChalkBox,
  ChalkKeyValuePairs,
  ChalkTable,
  ChalkSpinner,
} from '../../chalk';
import { lambda } from '../../api/clients';

export default function FunctionDetail() {
  const { functionName } = useParams<{ functionName: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<FunctionConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState('{}');
  const [response, setResponse] = useState<string | null>(null);
  const [invoking, setInvoking] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editMemory, setEditMemory] = useState('');
  const [editTimeout, setEditTimeout] = useState('');
  const [editEnvVars, setEditEnvVars] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    lambda.send(new GetFunctionCommand({ FunctionName: functionName })).then((res) => {
      setConfig(res.Configuration ?? null);
    }).catch((err) => {
      setError(String(err));
    }).finally(() => {
      setLoading(false);
    });
  }, [functionName]);

  const invoke = async () => {
    setInvoking(true);
    setResponse(null);
    try {
      const res = await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: new TextEncoder().encode(payload),
        })
      );
      const body = res.Payload ? new TextDecoder().decode(res.Payload) : '';
      try {
        setResponse(JSON.stringify(JSON.parse(body), null, 2));
      } catch {
        setResponse(body);
      }
    } catch (err: unknown) {
      setResponse(String(err));
    } finally {
      setInvoking(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
      navigate('/lambda');
    } finally {
      setDeleting(false);
    }
  };

  const openEditModal = () => {
    if (!config) return;
    setEditDescription(config.Description ?? '');
    setEditMemory(String(config.MemorySize ?? 128));
    setEditTimeout(String(config.Timeout ?? 3));
    setEditEnvVars(JSON.stringify(config.Environment?.Variables ?? {}, null, 2));
    setShowEdit(true);
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      let envVars: Record<string, string>;
      try {
        envVars = JSON.parse(editEnvVars);
      } catch {
        alert('Invalid JSON for environment variables');
        setSaving(false);
        return;
      }
      const res = await lambda.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Description: editDescription,
          MemorySize: parseInt(editMemory, 10) || 128,
          Timeout: parseInt(editTimeout, 10) || 3,
          Environment: { Variables: envVars },
        })
      );
      setConfig(res);
      setShowEdit(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;
  if (!config) return <ChalkHeader variant="h1">Function not found</ChalkHeader>;

  const envVars = config.Environment?.Variables ?? {};

  return (
    <ChalkSpaceBetween size="l">
      <ChalkBreadcrumbs
        items={[
          { text: 'MockCloud', href: '/' },
          { text: 'Lambda', href: '/lambda' },
          { text: 'Functions', href: '/lambda' },
          { text: functionName!, href: '' },
        ]}
        onNavigate={(href) => {
          if (href) navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkSpaceBetween direction="horizontal" size="xs">
            <ChalkButton onClick={() => navigate(`/logs/log-groups/aws/lambda/${functionName}`)}>View logs</ChalkButton>
            <ChalkButton onClick={() => setShowDelete(true)}>Delete</ChalkButton>
            <ChalkButton variant="primary" onClick={invoke}>Invoke</ChalkButton>
          </ChalkSpaceBetween>
        }
      >
        {functionName}
      </ChalkHeader>
      <ChalkTabs
        tabs={[
          {
            label: 'Configuration',
            id: 'configuration',
            content: (
              <ChalkSpaceBetween size="l">
                <ChalkContainer
                  header={
                    <ChalkHeader
                      variant="h2"
                      actions={
                        <ChalkButton onClick={openEditModal}>Edit</ChalkButton>
                      }
                    >
                      General configuration
                    </ChalkHeader>
                  }
                >
                  <ChalkKeyValuePairs
                    columns={2}
                    items={[
                      { label: 'Function ARN', value: config.FunctionArn ?? '-' },
                      { label: 'Runtime', value: config.Runtime ?? '-' },
                      { label: 'Handler', value: config.Handler ?? '-' },
                      { label: 'Memory (MB)', value: String(config.MemorySize ?? '-') },
                      { label: 'Timeout (s)', value: String(config.Timeout ?? '-') },
                      { label: 'Description', value: config.Description || '-' },
                      { label: 'Role', value: config.Role ?? '-' },
                    ]}
                  />
                </ChalkContainer>
                {Object.keys(envVars).length > 0 && (
                  <ChalkContainer header={<ChalkHeader variant="h2">Environment variables</ChalkHeader>}>
                    <ChalkTable
                      variant="embedded"
                      columnDefinitions={[
                        { id: 'key', header: 'Key', cell: (item: { key: string; value: string }) => item.key },
                        { id: 'value', header: 'Value', cell: (item: { key: string; value: string }) => item.value },
                      ]}
                      items={Object.entries(envVars).map(([k, v]) => ({ key: k, value: v }))}
                      sortingDisabled
                    />
                  </ChalkContainer>
                )}
              </ChalkSpaceBetween>
            ),
          },
          {
            label: 'Test',
            id: 'test',
            content: (
              <ChalkSpaceBetween size="l">
                <ChalkContainer header={<ChalkHeader variant="h2">Test event</ChalkHeader>}>
                  <ChalkSpaceBetween size="m">
                    <ChalkFormField label="Event JSON">
                      <ChalkTextarea
                        value={payload}
                        onChange={({ detail }) => setPayload(detail.value)}
                        rows={10}
                      />
                    </ChalkFormField>
                    <ChalkButton variant="primary" onClick={invoke} disabled={invoking}>
                      Invoke
                    </ChalkButton>
                  </ChalkSpaceBetween>
                </ChalkContainer>
                {response !== null && (
                  <ChalkContainer header={<ChalkHeader variant="h2">Response</ChalkHeader>}>
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      padding: '12px',
                      fontFamily: "'Monaco', 'Menlo', 'Consolas', monospace",
                      fontSize: '13px',
                      lineHeight: '1.5',
                      backgroundColor: '#0f1b2a',
                      color: '#d1d5db',
                      borderRadius: '4px',
                    }}>
                      {response}
                    </pre>
                  </ChalkContainer>
                )}
              </ChalkSpaceBetween>
            ),
          },
        ]}
      />

      <ChalkModal
        visible={showDelete}
        onDismiss={() => setShowDelete(false)}
        header="Delete function"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDelete(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} disabled={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{functionName}</b>? This action cannot be undone.
      </ChalkModal>

      <ChalkModal
        visible={showEdit}
        onDismiss={() => setShowEdit(false)}
        header="Edit configuration"
        size="large"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowEdit(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleSaveConfig} disabled={saving}>
                Save
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Description">
            <ChalkInput value={editDescription} onChange={({ detail }) => setEditDescription(detail.value)} />
          </ChalkFormField>
          <ChalkFormField label="Memory (MB)">
            <ChalkInput value={editMemory} onChange={({ detail }) => setEditMemory(detail.value)} type="number" />
          </ChalkFormField>
          <ChalkFormField label="Timeout (seconds)">
            <ChalkInput value={editTimeout} onChange={({ detail }) => setEditTimeout(detail.value)} type="number" />
          </ChalkFormField>
          <ChalkFormField label="Environment variables (JSON)">
            <ChalkTextarea value={editEnvVars} onChange={({ detail }) => setEditEnvVars(detail.value)} rows={8} />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
