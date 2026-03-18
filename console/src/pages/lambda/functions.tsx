import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListFunctionsCommand,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import {
  ChalkTable,
  ChalkHeader,
  ChalkSpaceBetween,
  ChalkTextFilter,
  ChalkLink,
  ChalkSpinner,
  ChalkButton,
  ChalkModal,
  ChalkFormField,
  ChalkInput,
  ChalkSelect,
  ChalkBox,
} from '../../chalk';
import { lambda } from '../../api/clients';

const RUNTIME_OPTIONS = [
  { label: 'nodejs22.x', value: 'nodejs22.x' },
  { label: 'nodejs20.x', value: 'nodejs20.x' },
  { label: 'python3.13', value: 'python3.13' },
  { label: 'python3.12', value: 'python3.12' },
];

const EMPTY_ZIP = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

export default function Functions() {
  const navigate = useNavigate();
  const [functions, setFunctions] = useState<FunctionConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createRuntime, setCreateRuntime] = useState(RUNTIME_OPTIONS[0]);
  const [createHandler, setCreateHandler] = useState('index.handler');
  const [createRole, setCreateRole] = useState('');
  const [createMemory, setCreateMemory] = useState('128');
  const [createTimeout, setCreateTimeout] = useState('3');
  const [creating, setCreating] = useState(false);

  const [deleteFunc, setDeleteFunc] = useState<FunctionConfiguration | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await lambda.send(new ListFunctionsCommand({}));
      setFunctions(res.Functions ?? []);
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
      await lambda.send(
        new CreateFunctionCommand({
          FunctionName: createName,
          Runtime: createRuntime.value as 'nodejs22.x' | 'nodejs20.x' | 'python3.13' | 'python3.12',
          Handler: createHandler,
          Role: createRole,
          MemorySize: Number(createMemory),
          Timeout: Number(createTimeout),
          Code: { ZipFile: EMPTY_ZIP },
        })
      );
      setShowCreate(false);
      setCreateName('');
      setCreateRuntime(RUNTIME_OPTIONS[0]);
      setCreateHandler('index.handler');
      setCreateRole('');
      setCreateMemory('128');
      setCreateTimeout('3');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFunc?.FunctionName) return;
    setDeleting(true);
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: deleteFunc.FunctionName }));
      setDeleteFunc(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const filtered = functions.filter(
    (f) => !filterText || f.FunctionName?.toLowerCase().includes(filterText.toLowerCase())
  );

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${filtered.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create function
              </ChalkButton>
            }
          >
            Functions
          </ChalkHeader>
        }
        items={filtered}
        filter={
          <ChalkTextFilter
            filteringPlaceholder="Find functions"
            filteringText={filterText}
            onChange={({ detail }) => setFilterText(detail.filteringText)}
          />
        }
        columnDefinitions={[
          {
            id: 'name',
            header: 'Function Name',
            cell: (item) => (
              <ChalkLink
                onFollow={() => navigate(`/lambda/functions/${item.FunctionName}`)}
              >
                {item.FunctionName}
              </ChalkLink>
            ),
            sortingField: 'FunctionName',
          },
          { id: 'runtime', header: 'Runtime', cell: (item) => item.Runtime ?? '-' },
          { id: 'handler', header: 'Handler', cell: (item) => item.Handler ?? '-' },
          { id: 'memory', header: 'Memory (MB)', cell: (item) => item.MemorySize ?? '-' },
          { id: 'timeout', header: 'Timeout (s)', cell: (item) => item.Timeout ?? '-' },
          {
            id: 'lastModified',
            header: 'Last Modified',
            cell: (item) => item.LastModified ?? '-',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteFunc(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={
          <ChalkSpaceBetween size="m" direction="vertical" alignItems="center">
            <b>No functions</b>
          </ChalkSpaceBetween>
        }
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create function"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowCreate(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton
                variant="primary"
                onClick={handleCreate}
                disabled={creating || !createName || !createRole}
              >
                Create
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        <ChalkSpaceBetween size="m">
          <ChalkFormField label="Function name">
            <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} />
          </ChalkFormField>
          <ChalkFormField label="Runtime">
            <ChalkSelect
              selectedOption={createRuntime}
              onChange={({ detail }) => setCreateRuntime(detail.selectedOption as typeof createRuntime)}
              options={RUNTIME_OPTIONS}
            />
          </ChalkFormField>
          <ChalkFormField label="Handler">
            <ChalkInput value={createHandler} onChange={({ detail }) => setCreateHandler(detail.value)} />
          </ChalkFormField>
          <ChalkFormField label="Role ARN">
            <ChalkInput value={createRole} onChange={({ detail }) => setCreateRole(detail.value)} placeholder="arn:aws:iam::000000000000:role/my-role" />
          </ChalkFormField>
          <ChalkFormField label="Memory (MB)">
            <ChalkInput value={createMemory} onChange={({ detail }) => setCreateMemory(detail.value)} type="number" />
          </ChalkFormField>
          <ChalkFormField label="Timeout (seconds)">
            <ChalkInput value={createTimeout} onChange={({ detail }) => setCreateTimeout(detail.value)} type="number" />
          </ChalkFormField>
        </ChalkSpaceBetween>
      </ChalkModal>

      <ChalkModal
        visible={deleteFunc !== null}
        onDismiss={() => setDeleteFunc(null)}
        header="Delete function"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteFunc(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} disabled={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteFunc?.FunctionName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
