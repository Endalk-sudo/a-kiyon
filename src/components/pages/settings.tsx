'use client';

import { useState, useEffect, useCallback } from 'react';
import { usersApi } from '@/lib/api-client';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitle2,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  UserPlus,
  Shield,
  User,
  Mail,
  Phone,
  Loader2,
  Pencil,
  Power,
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export function SettingsPage() {
  const { session } = useAppStore();
  const isOwner = session?.role === 'owner';

  // Users list
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Create user dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    password: '',
    role: 'manager' as 'owner' | 'manager',
    phone: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Edit user dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', role: 'manager' as 'owner' | 'manager', phone: '', password: '' });
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Toggle active dialog
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [togglingUser, setTogglingUser] = useState<UserItem | null>(null);
  const [toggling, setToggling] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!isOwner) return;
    setUsersLoading(true);
    try {
      const result = (await usersApi.list()) as { data: UserItem[] };
      setUsers(result.data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (!formData.role) {
      errors.role = 'Role is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateUser = async () => {
    if (!validateForm()) return;

    setCreating(true);
    try {
      await usersApi.create({
        email: formData.email.trim(),
        name: formData.name.trim(),
        password: formData.password,
        role: formData.role,
        phone: formData.phone.trim() || null,
      });
      toast.success(`User "${formData.name}" created successfully`);
      setFormData({ email: '', name: '', password: '', role: 'manager', phone: '' });
      setFormErrors({});
      setCreateDialogOpen(false);
      fetchUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create user';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Edit user
  const openEditDialog = (user: UserItem) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name,
      email: user.email,
      role: user.role as 'owner' | 'manager',
      phone: user.phone || '',
      password: '',
    });
    setEditFormErrors({});
    setEditDialogOpen(true);
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditFormData((prev) => ({ ...prev, [field]: value }));
    if (editFormErrors[field]) {
      setEditFormErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }
  };

  const validateEditForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editFormData.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) errors.email = 'Invalid email format';
    if (!editFormData.name.trim()) errors.name = 'Name is required';
    if (editFormData.password && editFormData.password.length < 6) errors.password = 'Password must be at least 6 characters';
    setEditFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveUser = async () => {
    if (!editingUser || !validateEditForm()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editFormData.name.trim(),
        email: editFormData.email.trim(),
        role: editFormData.role,
        phone: editFormData.phone.trim() || null,
      };
      if (editFormData.password) payload.password = editFormData.password;
      await usersApi.update(editingUser.id, payload);
      toast.success('User updated successfully');
      setEditDialogOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  // Toggle active
  const openToggleDialog = (user: UserItem) => {
    setTogglingUser(user);
    setToggleDialogOpen(true);
  };

  const handleToggleActive = async () => {
    if (!togglingUser) return;
    setToggling(true);
    try {
      await usersApi.deactivate(togglingUser.id);
      toast.success(togglingUser.isActive ? 'User deactivated' : 'User reactivated');
      setToggleDialogOpen(false);
      setTogglingUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle user status');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current User Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Current User
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
              {session?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{session?.name}</h3>
                <Badge variant={session?.role === 'owner' ? 'default' : 'secondary'}>
                  {session?.role === 'owner' ? 'Owner' : 'Manager'}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {session?.email}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                User ID: {session?.userId}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Management (Owner Only) */}
      {isOwner && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  User Management
                </CardTitle>
                <CardDescription>Manage system users and their roles</CardDescription>
              </div>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New User</DialogTitle>
                    <DialogDescription>
                      Add a new user to the system. They will be able to log in immediately.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div className="space-y-2">
                      <Label htmlFor="create-email">Email *</Label>
                      <Input
                        id="create-email"
                        type="email"
                        placeholder="user@example.com"
                        value={formData.email}
                        onChange={(e) => handleFormChange('email', e.target.value)}
                        className={formErrors.email ? 'border-red-500' : ''}
                      />
                      {formErrors.email && (
                        <p className="text-xs text-red-500">{formErrors.email}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-name">Full Name *</Label>
                      <Input
                        id="create-name"
                        placeholder="Full name"
                        value={formData.name}
                        onChange={(e) => handleFormChange('name', e.target.value)}
                        className={formErrors.name ? 'border-red-500' : ''}
                      />
                      {formErrors.name && (
                        <p className="text-xs text-red-500">{formErrors.name}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-password">Password *</Label>
                      <Input
                        id="create-password"
                        type="password"
                        placeholder="Minimum 6 characters"
                        value={formData.password}
                        onChange={(e) => handleFormChange('password', e.target.value)}
                        className={formErrors.password ? 'border-red-500' : ''}
                      />
                      {formErrors.password && (
                        <p className="text-xs text-red-500">{formErrors.password}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-role">Role *</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value) => handleFormChange('role', value)}
                      >
                        <SelectTrigger id="create-role" className={formErrors.role ? 'border-red-500' : ''}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectContent>
                      </Select>
                      {formErrors.role && (
                        <p className="text-xs text-red-500">{formErrors.role}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="create-phone">
                        Phone
                        <span className="text-muted-foreground text-xs ml-1">(optional)</span>
                      </Label>
                      <Input
                        id="create-phone"
                        type="tel"
                        placeholder="+251 9XX XXX XXX"
                        value={formData.phone}
                        onChange={(e) => handleFormChange('phone', e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setCreateDialogOpen(false)}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleCreateUser} disabled={creating}>
                        {creating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          'Create User'
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden sm:table-cell">Phone</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <span>{user.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'owner' ? 'default' : 'secondary'}>
                            {user.role === 'owner' ? 'Owner' : 'Manager'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {user.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {user.phone}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Badge variant={user.isActive ? 'default' : 'destructive'} className="text-xs">
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(user)}
                              title="Edit user"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${user.id === session?.userId ? 'opacity-30 pointer-events-none' : ''}`}
                              onClick={() => openToggleDialog(user)}
                              title={user.isActive ? 'Deactivate user' : 'Activate user'}
                            >
                              <Power className={`h-4 w-4 ${user.isActive ? 'text-green-600' : 'text-red-600'}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Not Owner Notice */}
      {!isOwner && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">User Management</p>
              <p className="text-sm">Only owners can manage system users</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information and role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => handleEditFormChange('email', e.target.value)}
                className={editFormErrors.email ? 'border-red-500' : ''}
              />
              {editFormErrors.email && <p className="text-xs text-red-500">{editFormErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name *</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => handleEditFormChange('name', e.target.value)}
                className={editFormErrors.name ? 'border-red-500' : ''}
              />
              {editFormErrors.name && <p className="text-xs text-red-500">{editFormErrors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role *</Label>
              <Select value={editFormData.role} onValueChange={(v) => handleEditFormChange('role', v)}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">
                Phone <span className="text-muted-foreground text-xs ml-1">(optional)</span>
              </Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editFormData.phone}
                onChange={(e) => handleEditFormChange('phone', e.target.value)}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="edit-password">
                New Password <span className="text-muted-foreground text-xs ml-1">(leave blank to keep current)</span>
              </Label>
              <Input
                id="edit-password"
                type="password"
                placeholder="Minimum 6 characters"
                value={editFormData.password}
                onChange={(e) => handleEditFormChange('password', e.target.value)}
                className={editFormErrors.password ? 'border-red-500' : ''}
              />
              {editFormErrors.password && <p className="text-xs text-red-500">{editFormErrors.password}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSaveUser} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toggle Active Confirmation */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle2>
              {togglingUser?.isActive ? 'Deactivate User' : 'Activate User'}
            </AlertDialogTitle2>
            <AlertDialogDesc>
              {togglingUser && (
                <>
                  Are you sure you want to {togglingUser.isActive ? 'deactivate' : 'reactivate'}{' '}
                  <strong>{togglingUser.name}</strong>?
                  {togglingUser.isActive
                    ? ' They will not be able to log in.'
                    : ' They will regain access to the system.'}
                </>
              )}
            </AlertDialogDesc>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              disabled={toggling}
              className={togglingUser?.isActive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {toggling
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                : togglingUser?.isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
