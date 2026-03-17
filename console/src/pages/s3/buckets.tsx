import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChalkTable, ChalkHeader, ChalkTextFilter, ChalkLink, ChalkSpinner, ChalkBox, ChalkSpaceBetween, ChalkButton, ChalkModal, ChalkFormField, ChalkInput, useChalkCollection } from '../../chalk';
import { ListBucketsCommand, CreateBucketCommand, DeleteBucketCommand, type Bucket } from '@aws-sdk/client-s3';
import { s3 } from '../../api/clients';

export default function Buckets() {
  const navigate = useNavigate();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  const [deleteBucket, setDeleteBucket] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await s3.send(new ListBucketsCommand({}));
      setBuckets(res.Buckets ?? []);
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
      await s3.send(new CreateBucketCommand({ Bucket: createName }));
      setShowCreate(false);
      setCreateName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteBucket) return;
    setDeleting(true);
    try {
      await s3.send(new DeleteBucketCommand({ Bucket: deleteBucket }));
      setDeleteBucket(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  const { items, filterProps, collectionProps } = useChalkCollection(buckets, {
    filtering: {
      filteringFunction: (item, text) =>
        (item.Name ?? '').toLowerCase().includes(text.toLowerCase()),
    },
    sorting: {},
  });

  if (loading) return <ChalkSpinner size="large" />;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkTable
        {...collectionProps}
        header={
          <ChalkHeader
            counter={`(${buckets.length})`}
            actions={
              <ChalkButton variant="primary" onClick={() => setShowCreate(true)}>
                Create bucket
              </ChalkButton>
            }
          >
            S3 Buckets
          </ChalkHeader>
        }
        items={items}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Bucket Name',
            cell: (item) => (
              <ChalkLink
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/s3/buckets/${item.Name}`);
                }}
              >
                {item.Name}
              </ChalkLink>
            ),
            sortingField: 'Name',
          },
          {
            id: 'created',
            header: 'Creation Date',
            cell: (item) => item.CreationDate?.toLocaleString() ?? '-',
            sortingField: 'CreationDate',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteBucket(item.Name!)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        filter={
          <ChalkTextFilter {...filterProps} filteringPlaceholder="Find buckets" />
        }
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No buckets</b>
          </ChalkBox>
        }
      />

      <ChalkModal
        visible={showCreate}
        onDismiss={() => setShowCreate(false)}
        header="Create bucket"
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
        <ChalkFormField label="Bucket name">
          <ChalkInput value={createName} onChange={({ detail }) => setCreateName(detail.value)} placeholder="my-bucket" />
        </ChalkFormField>
      </ChalkModal>

      <ChalkModal
        visible={deleteBucket !== null}
        onDismiss={() => setDeleteBucket(null)}
        header="Delete bucket"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteBucket(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDelete} loading={deleting}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{deleteBucket}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
