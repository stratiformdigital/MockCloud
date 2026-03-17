import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChalkHeader, ChalkBreadcrumbs, ChalkSpaceBetween, ChalkTable, ChalkBox, ChalkButton, ChalkSpinner, ChalkModal, ChalkInput } from '../../chalk';
import {
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  DeleteLogGroupCommand,
  DeleteLogStreamCommand,
  LogStream,
  OutputLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import { logs } from '../../api/clients';

function formatDate(epoch: number | undefined): string {
  if (!epoch) return '-';
  return new Date(epoch).toLocaleString();
}

function formatTimestamp(epoch: number | undefined): string {
  if (!epoch) return '';
  const d = new Date(epoch);
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '-';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function LogGroupDetail() {
  const params = useParams();
  const rawName = params['*'] ?? '';
  const logGroupName = rawName.startsWith('/') ? rawName : '/' + rawName;
  const navigate = useNavigate();
  const [streams, setStreams] = useState<LogStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStream, setSelectedStream] = useState<string | null>(null);
  const [events, setEvents] = useState<OutputLogEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('');

  const [showDeleteGroup, setShowDeleteGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [deleteStream, setDeleteStream] = useState<LogStream | null>(null);
  const [deletingStream, setDeletingStream] = useState(false);

  const loadStreams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await logs.send(
        new DescribeLogStreamsCommand({
          logGroupName,
          orderBy: 'LastEventTime',
          descending: true,
        }),
      );
      const sorted = (res.logStreams ?? []).sort(
        (a, b) => (b.lastEventTimestamp ?? 0) - (a.lastEventTimestamp ?? 0),
      );
      setStreams(sorted);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [logGroupName]);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  const loadEvents = useCallback(
    async (streamName: string) => {
      setEventsLoading(true);
      setEventsError(null);
      try {
        const res = await logs.send(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName: streamName,
            startFromHead: true,
          }),
        );
        setEvents(res.events ?? []);
      } catch (err) {
        setEventsError(String(err));
      } finally {
        setEventsLoading(false);
      }
    },
    [logGroupName],
  );

  useEffect(() => {
    if (selectedStream) {
      loadEvents(selectedStream);
    }
  }, [selectedStream, loadEvents]);

  const handleDeleteGroup = async () => {
    setDeletingGroup(true);
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName }));
      navigate('/logs');
    } finally {
      setDeletingGroup(false);
    }
  };

  const handleDeleteStream = async () => {
    if (!deleteStream?.logStreamName) return;
    setDeletingStream(true);
    try {
      await logs.send(
        new DeleteLogStreamCommand({
          logGroupName,
          logStreamName: deleteStream.logStreamName,
        }),
      );
      setDeleteStream(null);
      if (selectedStream === deleteStream.logStreamName) {
        setSelectedStream(null);
        setEvents([]);
      }
      await loadStreams();
    } finally {
      setDeletingStream(false);
    }
  };

  const filteredEvents = eventFilter
    ? events.filter((e) => (e.message ?? '').toLowerCase().includes(eventFilter.toLowerCase()))
    : events;

  if (loading) return <ChalkSpinner size="large" />;
  if (error) return <ChalkHeader variant="h1">Error: {error}</ChalkHeader>;

  return (
    <ChalkSpaceBetween size="l">
      <ChalkBreadcrumbs
        items={[
          { text: 'MockCloud', href: '/' },
          { text: 'CloudWatch Logs', href: '/logs' },
          { text: 'Log Groups', href: '/logs' },
          { text: logGroupName, href: '#' },
        ]}
        onNavigate={(href) => {
          if (href !== '#') navigate(href);
        }}
      />
      <ChalkHeader
        variant="h1"
        actions={
          <ChalkButton onClick={() => setShowDeleteGroup(true)}>Delete log group</ChalkButton>
        }
      >
        {logGroupName}
      </ChalkHeader>
      <ChalkTable
        header={
          <ChalkHeader
            counter={`(${streams.length})`}
            actions={
              <ChalkButton variant="icon" iconName="refresh" onClick={loadStreams} />
            }
          >
            Log Streams
          </ChalkHeader>
        }
        items={streams}
        columnDefinitions={[
          {
            id: 'name',
            header: 'Stream Name',
            cell: (item) => (
              <ChalkButton
                variant="inline-link"
                onClick={() => {
                  setSelectedStream(item.logStreamName ?? null);
                  if (!item.logStreamName) setEvents([]);
                }}
              >
                {item.logStreamName ?? '-'}
              </ChalkButton>
            ),
            sortingField: 'logStreamName',
          },
          {
            id: 'lastEvent',
            header: 'Last Event Time',
            cell: (item) => formatDate(item.lastEventTimestamp),
            sortingField: 'lastEventTimestamp',
          },
          {
            id: 'firstEvent',
            header: 'First Event Time',
            cell: (item) => formatDate(item.firstEventTimestamp),
            sortingField: 'firstEventTimestamp',
          },
          {
            id: 'storedBytes',
            header: 'Stored Bytes',
            cell: (item) => formatBytes(item.storedBytes),
            sortingField: 'storedBytes',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <ChalkButton variant="inline-link" onClick={() => setDeleteStream(item)}>
                Delete
              </ChalkButton>
            ),
          },
        ]}
        empty={
          <ChalkBox textAlign="center" color="inherit">
            <b>No log streams</b>
          </ChalkBox>
        }
      />
      {selectedStream && (
        <ChalkSpaceBetween size="s">
          <ChalkHeader
            variant="h2"
            actions={
              <ChalkButton
                variant="icon"
                iconName="refresh"
                onClick={() => loadEvents(selectedStream)}
              />
            }
          >
            {selectedStream}
          </ChalkHeader>
          <ChalkInput
            value={eventFilter}
            onChange={({ detail }) => setEventFilter(detail.value)}
            placeholder="Filter log events..."
            type="search"
          />
          {eventsLoading ? (
            <ChalkSpinner size="large" />
          ) : eventsError ? (
            <ChalkBox color="text-status-error">{eventsError}</ChalkBox>
          ) : filteredEvents.length === 0 ? (
            <ChalkBox textAlign="center" color="inherit">
              <b>{eventFilter ? 'No matching log events' : 'No log events'}</b>
            </ChalkBox>
          ) : (
            <div
              style={{
                background: '#1a1a2e',
                color: '#e0e0e0',
                padding: '12px 16px',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '600px',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              {filteredEvents.map((event, i) => (
                <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  <span style={{ color: '#888' }}>{formatTimestamp(event.timestamp)}</span>
                  {'  '}
                  {event.message}
                </div>
              ))}
            </div>
          )}
        </ChalkSpaceBetween>
      )}

      <ChalkModal
        visible={showDeleteGroup}
        onDismiss={() => setShowDeleteGroup(false)}
        header="Delete log group"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setShowDeleteGroup(false)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteGroup} loading={deletingGroup}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete <b>{logGroupName}</b>?
      </ChalkModal>

      <ChalkModal
        visible={deleteStream !== null}
        onDismiss={() => setDeleteStream(null)}
        header="Delete log stream"
        footer={
          <ChalkBox float="right">
            <ChalkSpaceBetween direction="horizontal" size="xs">
              <ChalkButton variant="link" onClick={() => setDeleteStream(null)}>
                Cancel
              </ChalkButton>
              <ChalkButton variant="primary" onClick={handleDeleteStream} loading={deletingStream}>
                Delete
              </ChalkButton>
            </ChalkSpaceBetween>
          </ChalkBox>
        }
      >
        Are you sure you want to delete stream <b>{deleteStream?.logStreamName}</b>?
      </ChalkModal>
    </ChalkSpaceBetween>
  );
}
