'use client';

import { useState, useEffect, useCallback } from 'react';
import { servicesApi } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Pencil,
  Power,
  PowerOff,
  Dumbbell,
  Loader2,
  Clock,
  Banknote,
} from 'lucide-react';
import { toast } from 'sonner';

interface Service {
  id: string;
  name: string;
  nameAm: string | null;
  description: string | null;
  descriptionAm: string | null;
  price: number;
  duration: number;
  isActive: boolean;
}

interface ServiceFormData {
  name: string;
  nameAm: string;
  description: string;
  descriptionAm: string;
  price: string;
  duration: string;
  isActive: boolean;
}

const emptyForm: ServiceFormData = {
  name: '',
  nameAm: '',
  description: '',
  descriptionAm: '',
  price: '',
  duration: '',
  isActive: true,
};

export function ServicesPage() {
  const { session, locale } = useAppStore();
  const isOwner = session?.role === 'owner';

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState<ServiceFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      const result = await servicesApi.list({
        includeInactive: showInactive || isOwner,
      });
      const data = (result as { data: Service[] }).data;
      setServices(data);
    } catch (err) {
      toast.error(
        locale === 'en'
          ? 'Failed to load services'
          : 'አገልግሎቶችን መጫን አልተሳካም'
      );
    } finally {
      setLoading(false);
    }
  }, [showInactive, isOwner, locale]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const openAddDialog = () => {
    setForm(emptyForm);
    setShowAddDialog(true);
  };

  const openEditDialog = (service: Service) => {
    setEditingService(service);
    setForm({
      name: service.name,
      nameAm: service.nameAm || '',
      description: service.description || '',
      descriptionAm: service.descriptionAm || '',
      price: String(service.price),
      duration: String(service.duration),
      isActive: service.isActive,
    });
    setShowEditDialog(true);
  };

  const handleAddService = async () => {
    if (!form.name.trim()) {
      toast.error(locale === 'en' ? 'Name is required' : 'ስም ያስፈልጋል');
      return;
    }
    if (!form.price || Number(form.price) < 0) {
      toast.error(
        locale === 'en'
          ? 'Valid price is required'
          : 'ትክክለኛ ዋጋ ያስፈልጋል'
      );
      return;
    }
    if (!form.duration || Number(form.duration) < 1) {
      toast.error(
        locale === 'en'
          ? 'Duration must be at least 1 day'
          : 'ርዝመት ቢያንስ 1 ቀን መሆን አለበት'
      );
      return;
    }

    try {
      setSubmitting(true);
      await servicesApi.create({
        name: form.name.trim(),
        nameAm: form.nameAm.trim() || null,
        description: form.description.trim() || null,
        descriptionAm: form.descriptionAm.trim() || null,
        price: Number(form.price),
        duration: Number(form.duration),
        isActive: form.isActive,
      });
      toast.success(
        locale === 'en'
          ? 'Service created successfully'
          : 'አገልግሎት በተሳካ ሁኔታ ተፈጥሯል'
      );
      setShowAddDialog(false);
      fetchServices();
    } catch (err) {
      toast.error(
        locale === 'en'
          ? 'Failed to create service'
          : 'አገልግሎት መፍጠር አልተሳካም'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditService = async () => {
    if (!editingService) return;
    if (!form.name.trim()) {
      toast.error(locale === 'en' ? 'Name is required' : 'ስም ያስፈልጋል');
      return;
    }
    if (!form.price || Number(form.price) < 0) {
      toast.error(
        locale === 'en'
          ? 'Valid price is required'
          : 'ትክክለኛ ዋጋ ያስፈልጋል'
      );
      return;
    }
    if (!form.duration || Number(form.duration) < 1) {
      toast.error(
        locale === 'en'
          ? 'Duration must be at least 1 day'
          : 'ርዝመት ቢያንስ 1 ቀን መሆን አለበት'
      );
      return;
    }

    try {
      setSubmitting(true);
      await servicesApi.update(editingService.id, {
        name: form.name.trim(),
        nameAm: form.nameAm.trim() || null,
        description: form.description.trim() || null,
        descriptionAm: form.descriptionAm.trim() || null,
        price: Number(form.price),
        duration: Number(form.duration),
        isActive: form.isActive,
      });
      toast.success(
        locale === 'en'
          ? 'Service updated successfully'
          : 'አገልግሎት በተሳካ ሁኔታ ዘምኗል'
      );
      setShowEditDialog(false);
      setEditingService(null);
      fetchServices();
    } catch (err) {
      toast.error(
        locale === 'en'
          ? 'Failed to update service'
          : 'አገልግሎት ማዘመን አልተሳካም'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (service: Service) => {
    const newActiveState = !service.isActive;
    const action = newActiveState
      ? locale === 'en'
        ? 'activate'
        : 'አጁስ'
      : locale === 'en'
        ? 'deactivate'
        : 'አጥፋ';

    try {
      await servicesApi.update(service.id, {
        isActive: newActiveState,
      });
      toast.success(
        newActiveState
          ? locale === 'en'
            ? 'Service activated'
            : 'አገልግሎት አጁስ ተደርጓል'
          : locale === 'en'
            ? 'Service deactivated'
            : 'አገልግሎት አጥፍቷል'
      );
      fetchServices();
    } catch (err) {
      toast.error(
        locale === 'en'
          ? `Failed to ${action} service`
          : `አገልግሎት ${action} አልተሳካም`
      );
    }
  };

  const renderServiceForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            {locale === 'en' ? 'Name' : 'ስም'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={
              locale === 'en' ? 'e.g. Monthly Membership' : 'ለምሳሌ ወርሃዊ አባልነት'
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameAm">
            {locale === 'en' ? 'Name (Amharic)' : 'ስም (አማርኛ)'}
          </Label>
          <Input
            id="nameAm"
            value={form.nameAm}
            onChange={(e) => setForm({ ...form, nameAm: e.target.value })}
            placeholder="ለምሳሌ ወርሃዊ አባልነት"
            dir="rtl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">
          {locale === 'en' ? 'Description' : 'መግለጫ'}
        </Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={
            locale === 'en'
              ? 'Describe the service...'
              : 'አገልግሎቱን ይግለጹ...'
          }
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="descriptionAm">
          {locale === 'en' ? 'Description (Amharic)' : 'መግለጫ (አማርኛ)'}
        </Label>
        <Textarea
          id="descriptionAm"
          value={form.descriptionAm}
          onChange={(e) =>
            setForm({ ...form, descriptionAm: e.target.value })
          }
          placeholder="አገልግሎቱን ይግለጹ..."
          rows={3}
          dir="rtl"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">
            {locale === 'en' ? 'Price (ETB)' : 'ዋጋ (ETB)'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">
            {locale === 'en' ? 'Duration (days)' : 'ርዝመት (ቀናት)'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="duration"
            type="number"
            min="1"
            step="1"
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value })}
            placeholder="30"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="isActive"
          checked={form.isActive}
          onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
        />
        <Label htmlFor="isActive">
          {form.isActive
            ? locale === 'en'
              ? 'Active'
              : 'ንቁ'
            : locale === 'en'
              ? 'Inactive'
              : 'የቦዘረ'}
        </Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {locale === 'en' ? 'Services' : 'አገልግሎቶች'}
          </h2>
          <p className="text-muted-foreground">
            {locale === 'en'
              ? 'Manage services and pricing'
              : 'የአካል ብቃት ማዕከል አገልግሎቶች እና ዋጋ አስተዳድር'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOwner && (
            <div className="flex items-center gap-2">
              <Switch
                id="showInactive"
                checked={showInactive}
                onCheckedChange={setShowInactive}
              />
              <Label htmlFor="showInactive" className="text-sm whitespace-nowrap">
                {locale === 'en' ? 'Show inactive' : 'የቦዘረ አሳይ'}
              </Label>
            </div>
          )}
          {isOwner && (
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              {locale === 'en' ? 'Add Service' : 'አገልግሎት ጨምር'}
            </Button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && services.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Dumbbell className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {locale === 'en'
                ? 'No services found'
                : 'ምንም አገልግሎት አልተገኘም'}
            </p>
            {isOwner && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={openAddDialog}
              >
                <Plus className="h-4 w-4 mr-2" />
                {locale === 'en'
                  ? 'Add your first service'
                  : 'የመጀመሪያ አገልግሎትዎን ያክሉ'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Services Grid */}
      {!loading && services.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {services.map((service) => (
            <Card
              key={service.id}
              className={!service.isActive ? 'opacity-60' : ''}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">
                    {service.name}
                    {service.nameAm && (
                      <span className="block text-sm font-normal text-muted-foreground mt-0.5">
                        {service.nameAm}
                      </span>
                    )}
                  </CardTitle>
                  <Badge
                    variant={service.isActive ? 'default' : 'secondary'}
                    className="shrink-0"
                  >
                    {service.isActive
                      ? locale === 'en'
                        ? 'Active'
                        : 'ንቁ'
                      : locale === 'en'
                        ? 'Inactive'
                        : 'የቦዘረ'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Description */}
                {(service.description || service.descriptionAm) && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {locale === 'am' && service.descriptionAm
                      ? service.descriptionAm
                      : service.description}
                  </p>
                )}

                {/* Price & Duration */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {formatCurrency(service.price)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      {service.duration}{' '}
                      {service.duration === 1
                        ? locale === 'en'
                          ? 'day'
                          : 'ቀን'
                        : locale === 'en'
                          ? 'days'
                          : 'ቀናት'}
                    </span>
                  </div>
                </div>

                {/* Owner Actions */}
                {isOwner && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(service)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      {locale === 'en' ? 'Edit' : 'አስተካክል'}
                    </Button>
                    <Button
                      variant={service.isActive ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => handleToggleActive(service)}
                    >
                      {service.isActive ? (
                        <>
                          <PowerOff className="h-3.5 w-3.5 mr-1.5" />
                          {locale === 'en' ? 'Deactivate' : 'አጥፋ'}
                        </>
                      ) : (
                        <>
                          <Power className="h-3.5 w-3.5 mr-1.5" />
                          {locale === 'en' ? 'Activate' : 'አጁስ'}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Service Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === 'en' ? 'Add New Service' : 'አዲስ አገልግሎት ጨምር'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'en'
                ? 'Create a new service with pricing and duration.'
                : 'አዲስ የአካል ብቃት ማዕከል አገልግሎት በዋጋ እና ርዝመት ይፍጠሩ።'}
            </DialogDescription>
          </DialogHeader>
          {renderServiceForm()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={submitting}
            >
              {locale === 'en' ? 'Cancel' : 'ሰርዝ'}
            </Button>
            <Button onClick={handleAddService} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {locale === 'en' ? 'Create Service' : 'አገልግሎት ፍጠር'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Service Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {locale === 'en' ? 'Edit Service' : 'አገልግሎት አስተካክል'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'en'
                ? 'Update service details, pricing, and duration.'
                : 'የአገልግሎት ዝርዝሮች፣ ዋጋ እና ርዝመት ያዘምኑ።'}
            </DialogDescription>
          </DialogHeader>
          {renderServiceForm()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                setEditingService(null);
              }}
              disabled={submitting}
            >
              {locale === 'en' ? 'Cancel' : 'ሰርዝ'}
            </Button>
            <Button onClick={handleEditService} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {locale === 'en' ? 'Save Changes' : 'ለውጦችን አስቀምጥ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
