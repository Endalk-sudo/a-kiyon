'use client';

import { useState, useEffect, useCallback } from 'react';
import { auditLogsApi } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EthiopianDateInput } from '@/components/ethiopian-date-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  Filter,
  X,
} from 'lucide-react';

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  details: string | null;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
}

interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_TYPES = [
  'member.create',
  'member.update',
  'member.delete',
  'member.restore',
  'service.create',
  'service.update',
  'service.deactivate',
  'subscription.create',
  'subscription.update',
  'invoice.update',
  'payment.create',
  'payment.void',
  'user.create',
];

const ENTITY_TYPES = [
  'member',
  'service',
  'subscription',
  'invoice',
  'payment',
  'user',
];

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [filterUser, setFilterUser] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStartDateIso, setFilterStartDateIso] = useState<string | null>(null);
  const [filterEndDateIso, setFilterEndDateIso] = useState<string | null>(null);

  // Detail dialog
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (filterAction && filterAction !== 'all') params.action = filterAction;
      if (filterEntity && filterEntity !== 'all') params.entity = filterEntity;
      if (filterUser.trim()) params.userId = filterUser.trim();
      if (filterStartDateIso) params.startDate = filterStartDateIso;
      if (filterEndDateIso) params.endDate = filterEndDateIso;

      const result = (await auditLogsApi.list(params)) as {
        data: AuditLog[];
        pagination: PaginationInfo;
      };
      setLogs(result.data);
      setPagination(result.pagination);
    } catch {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterEntity, filterUser, filterStartDateIso, filterEndDateIso]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchLogs(newPage);
    }
  };

  const clearFilters = () => {
    setFilterAction('all');
    setFilterEntity('all');
    setFilterUser('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterStartDateIso(null);
    setFilterEndDateIso(null);
  };

  const hasActiveFilters =
    filterAction !== 'all' ||
    filterEntity !== 'all' ||
    filterUser.trim() !== '' ||
    filterStartDateIso !== null ||
    filterEndDateIso !== null;

  const parseDetails = (details: string | null): Record<string, unknown> | null => {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return { raw: details };
    }
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('create')) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (action.includes('update')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (action.includes('delete')) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    if (action.includes('void')) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    if (action.includes('restore')) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    if (action.includes('deactivate')) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">User ID</Label>
              <Input
                placeholder="Filter by user ID"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Action Type</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {ACTION_TYPES.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Entity Type</Label>
              <Select value={filterEntity} onValueChange={setFilterEntity}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {ENTITY_TYPES.map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {entity.charAt(0).toUpperCase() + entity.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <EthiopianDateInput
              value={filterStartDate}
              onChange={(value, isoDate) => {
                setFilterStartDate(value);
                setFilterStartDateIso(isoDate);
              }}
              label="Start Date (EC)"
              placeholder="dd/mm/yyyy"
            />

            <EthiopianDateInput
              value={filterEndDate}
              onChange={(value, isoDate) => {
                setFilterEndDate(value);
                setFilterEndDateIso(isoDate);
              }}
              label="End Date (EC)"
              placeholder="dd/mm/yyyy"
            />
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Audit Logs</CardTitle>
            <span className="text-sm text-muted-foreground">
              {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No audit logs found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="hidden md:table-cell">Entity ID</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">
                              {log.user?.name || 'System'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.user?.email || ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getActionBadgeColor(log.action)}`}
                          >
                            {log.action}
                          </span>
                        </TableCell>
                        <TableCell className="capitalize text-sm">
                          {log.entity || '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">
                          {log.entityId ? (
                            <span title={log.entityId}>
                              {log.entityId.length > 12
                                ? `${log.entityId.slice(0, 12)}...`
                                : log.entityId}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Log Detail</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="text-sm font-medium">{formatDateTime(selectedLog.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="text-sm font-medium">{selectedLog.user?.name || 'System'}</p>
                  {selectedLog.user?.email && (
                    <p className="text-xs text-muted-foreground">{selectedLog.user.email}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Action</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getActionBadgeColor(selectedLog.action)}`}
                  >
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entity</p>
                  <p className="text-sm font-medium capitalize">{selectedLog.entity || '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Entity ID</p>
                  <p className="text-sm font-mono break-all">{selectedLog.entityId || '-'}</p>
                </div>
              </div>

              {selectedLog.details && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Details</p>
                  <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-60 whitespace-pre-wrap break-words">
                    {JSON.stringify(parseDetails(selectedLog.details), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
