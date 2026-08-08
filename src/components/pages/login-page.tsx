'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Dumbbell, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { normalizePhone, isValidPhone } from '@/lib/phone-auth';
import { useAppStore } from '@/lib/store';
import { sanitizeError } from '@/lib/errors';
import { t } from '@/lib/messages';
import { toast } from 'sonner';

export function LoginPage() {
  const setSession = useAppStore((s) => s.setSession);
  const setPublicPage = useAppStore((s) => s.setPublicPage);
  const locale = useAppStore((s) => s.locale);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = (): boolean => {
    let valid = true;
    if (!phone.trim()) {
      setPhoneError(t(locale, 'Phone number is required', 'ስልክ ቁጥር ያስፈልጋል'));
      valid = false;
    } else if (!isValidPhone(normalizePhone(phone))) {
      setPhoneError(t(locale, 'Invalid phone number format', 'የተሳሳተ የስልክ ቁጥር ቅርጸት'));
      valid = false;
    } else {
      setPhoneError('');
    }
    if (!password) {
      setPasswordError(t(locale, 'Password is required', 'የይለፍ ቃል ያስፈልጋል'));
      valid = false;
    } else {
      setPasswordError('');
    }
    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const { data, error: authError } = await authClient.signIn.phone({
        phone: normalizePhone(phone),
        password,
      });
      if (authError) {
        setPhoneError(sanitizeError({ message: authError.message } as Error, locale, 'Invalid phone number or password', 'የተሳሳተ የስልክ ቁጥር ወይም የይለፍ ቃል'));
        return;
      }
      if (data?.user) {
        const u = data.user as { id: string; email: string; name: string | null; role?: string };
        setSession({
          userId: u.id,
          email: u.email,
          name: u.name || '',
          role: u.role || 'manager',
        });
        toast.success(t(locale, 'Welcome back!', 'እንኳን ደህና መጡ!'));
      }
    } catch {
      setPhoneError(t(locale, 'Invalid phone number or password', 'የተሳሳተ የስልክ ቁጥር ወይም የይለፍ ቃል'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/5 px-4 py-10">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardContent className="p-6 sm:p-8">
          <button
            type="button"
            onClick={() => setPublicPage('landing')}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t(locale, 'Back to Home', 'ወደ መነሻ ገፅ ተመለስ')}
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">
                {t(locale, 'Sign In', 'ግባ')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(locale, 'Enter your phone number and password to access the system', 'የስልክ ቁጥርዎን እና የይለፍ ቃልዎን ያስገቡ')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-phone">{t(locale, 'Phone Number', 'ስልክ ቁጥር')}</Label>
              <Input
                id="login-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                placeholder="+251 9XX XXX XXX"
                required
                autoComplete="tel"
                className={phoneError ? 'border-destructive' : ''}
              />
              {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">{t(locale, 'Password', 'የይለፍ ቃል')}</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                  placeholder={t(locale, 'Enter your password', 'የይለፍ ቃልዎን ያስገቡ')}
                  required
                  autoComplete="current-password"
                  className={passwordError ? 'border-destructive' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
              <p className="text-right -mt-2 text-xs text-muted-foreground">
                {t(locale, 'Forgot your password? Contact your administrator.', 'የይለፍ ቃልዎን ረስተዋል? አስተዳዳሪዎን ያነጋግሩ።')}
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(locale, 'Sign In', 'ግባ')}
            </Button>
            {process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true' && (
              <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Demo credentials:</p>
                <p>Owner: +251911000000 / owner123</p>
                <p>Manager: +251922000000 / manager123</p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}