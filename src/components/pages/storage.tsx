'use client';

import { useState, useEffect } from 'react';
import { apiFetch, membersApi } from '@/lib/api-client';
import { MemberAvatar } from '@/components/member-avatar';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/store';
import { sanitizeError } from '@/lib/errors';
import { t } from '@/lib/messages';
import {
  Database,
  FolderOpen,
  Trash2,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  Loader2,
  FileX,
  Users,
} from 'lucide-react';

interface CollectionStat {
  name: string;
  count: number;
  estimatedBytes: number;
}

interface StaleMember {
  id: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  photoThumb?: string | null;
  lastPaymentDate: string | null;
}

interface StorageData {
  firestore: {
    collections: CollectionStat[];
    totalBytes: number;
    freeLimit: number;
    usedPercent: number;
  };
  storage: {
    files: number;
    bytes: number;
    filesByPrefix: { prefix: string; count: number; bytes: number }[];
    freeLimit: number;
    usedPercent: number;
  };
  staleMonths: number;
  staleMembers: StaleMember[];
  formatBytes: (bytes: number) => string;
}

const GB = 1073741824;
const MB = 1048576;
const KB = 1024;

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${bytes} B`;
}

const FREE_TIERS = {
  firestore: { storage: '1 GB', reads: '50K/day', writes: '20K/day' },
  storage: { storage: '5 GB', download: '1 GB/day' },
};

function UsageBar({ used, label }: { used: number; label: string }) {
  const color =
    used > 90 ? 'bg-red-500' : used > 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used}%</span>
      </div>
      <Progress value={used} className="h-2" indicatorClassName={color} />
    </div>
  );
}

export function StoragePage() {
  const locale = useAppStore((s) => s.locale);
  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<StorageData>('/storage');
      setData(result);
    } catch {
      toast.error(t(locale, 'Failed to load storage data', 'የማከማቻ መረጃዎችን መጫን አልተሳካም'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCleanup = async (action: string, label: string) => {
    setCleaning(action);
    try {
      const result = await apiFetch<{ message: string }>(`/storage?action=${action}`, {
        method: 'DELETE',
      });
      toast.success(result.message);
      fetchData();
    } catch {
      toast.error(t(locale, `Failed to ${label.toLowerCase()}`, `ማጽዳት አልተሳካም`));
    } finally {
      setCleaning(null);
    }
  };

  const handleSoftDelete = async (memberId?: string) => {
    const target = memberId ? [memberId] : data?.staleMembers.map((m) => m.id) ?? [];
    if (target.length === 0) return;
    try {
      const result = await membersApi.bulkSoftDelete(target);
      toast.success(result.message);
      fetchData();
    } catch {
      toast.error(t(locale, 'Failed to soft-delete members', 'አባላትን መሰረዝ አልተሳካም'));
    }
  };

  const monthsAgo = (iso: string | null): string => {
    if (!iso) return t(locale, 'Never paid', 'ፈጽሞ አልከፈለም');
    const months = Math.floor((Date.now() - new Date(iso).getTime()) / (30 * 24 * 60 * 60 * 1000));
    return t(locale, `${months} months ago`, `ከ${months} ወር በፊት`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Could not load storage data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Storage</h1>
          <p className="text-muted-foreground">
            Monitor usage and free up space
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Free Tier Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Free Tier Limits
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium">Firestore</p>
            <p className="text-muted-foreground">Storage: {FREE_TIERS.firestore.storage}</p>
            <p className="text-muted-foreground">Reads: {FREE_TIERS.firestore.reads}</p>
            <p className="text-muted-foreground">Writes: {FREE_TIERS.firestore.writes}</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Storage (Files)</p>
            <p className="text-muted-foreground">Storage: {FREE_TIERS.storage.storage}</p>
            <p className="text-muted-foreground">Download: {FREE_TIERS.storage.download}</p>
          </div>
        </CardContent>
      </Card>

      {/* Usage Bars */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Firestore
            </CardTitle>
            <CardDescription>
              {formatBytes(data.firestore.totalBytes)} used of {formatBytes(data.firestore.freeLimit)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageBar used={data.firestore.usedPercent} label="Storage Used" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              File Storage
            </CardTitle>
            <CardDescription>
              {formatBytes(data.storage.bytes)} used of {formatBytes(data.storage.freeLimit)} ({data.storage.files} files)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageBar used={data.storage.usedPercent} label="Storage Used" />
          </CardContent>
        </Card>
      </div>

      {/* Collection Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Collection Breakdown</CardTitle>
          <CardDescription>Document count and estimated size per collection</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.firestore.collections.map((col) => (
              <div key={col.name} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">{col.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Badge variant="outline">{col.count} docs</Badge>
                  <span className="text-muted-foreground w-20 text-right">
                    {formatBytes(col.estimatedBytes)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* File Storage Breakdown */}
      {data.storage.filesByPrefix.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Files by Folder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.storage.filesByPrefix.map((prefix) => (
                <div key={prefix.prefix} className="flex items-center justify-between text-sm">
                  <span className="font-medium">/{prefix.prefix}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{prefix.count} files</span>
                    <span className="w-20 text-right">{formatBytes(prefix.bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Hygiene */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Data Hygiene
          </CardTitle>
          <CardDescription>
            Members with no payment in the last {data.staleMonths} months. Soft-delete is
            reversible — they can be restored anytime from the Members page, and their payment
            history is kept forever.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.staleMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No stale members found — everyone has paid within the last {data.staleMonths} months.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                {data.staleMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar
                        photo={member.photo}
                        photoThumb={member.photoThumb}
                        firstName={member.firstName}
                        lastName={member.lastName}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {member.firstName} {member.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last payment:{' '}
                          {member.lastPaymentDate
                            ? `${formatDate(member.lastPaymentDate)} (${monthsAgo(member.lastPaymentDate)})`
                            : monthsAgo(null)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSoftDelete(member.id)}
                      disabled={cleaning !== null}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Soft delete
                    </Button>
                  </div>
                ))}
              </div>
              <ConfirmButton
                action="bulk-soft-delete"
                label="Soft Delete All"
                cleaning={cleaning}
                onConfirm={() => handleSoftDelete()}
                variant="outline"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Cleanup Tools */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" />
            Cleanup Tools
          </CardTitle>
          <CardDescription>Irreversible. Remove unnecessary data to free up space</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-start gap-3">
              <FileX className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Orphaned Files</p>
                <p className="text-xs text-muted-foreground">
                  Delete upload files with no matching member record
                </p>
              </div>
            </div>
            <ConfirmButton
              action="purge-orphaned-files"
              label="Purge Orphans"
              cleaning={cleaning}
              onConfirm={handleCleanup}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-start gap-3">
              <FileX className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Soft-Deleted Member Photos</p>
                <p className="text-xs text-muted-foreground">
                  Delete photos of members you already soft-deleted
                </p>
              </div>
            </div>
            <ConfirmButton
              action="purge-deleted-member-photos"
              label="Purge Photos"
              cleaning={cleaning}
              onConfirm={handleCleanup}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Soft-Deleted Members</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete members that were soft-deleted
                </p>
              </div>
            </div>
            <ConfirmButton
              action="purge-deleted-members"
              label="Purge Members"
              cleaning={cleaning}
              onConfirm={handleCleanup}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmButton({
  action,
  label,
  cleaning,
  onConfirm,
  variant = 'destructive',
}: {
  action: string;
  label: string;
  cleaning: string | null;
  onConfirm: (action: string, label: string) => void;
  variant?: 'destructive' | 'outline';
}) {
  const [open, setOpen] = useState(false);
  const isCleaning = cleaning === action;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" disabled={isCleaning}>
          {isCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm {label}</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Are you sure you want to proceed?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm(action, label);
            }}
          >
            Yes, {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
