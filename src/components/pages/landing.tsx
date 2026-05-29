'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { authClient } from '@/lib/auth-client';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import {
  Dumbbell,
  Users,
  Calendar,
  BarChart3,
  ArrowDown,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  TrendingUp,
  CreditCard,
  Shield,
} from 'lucide-react';

function LoginDialog({ children }: { children: React.ReactNode }) {
  const { setSession } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: authError } = await authClient.signIn.email({ email, password });
      if (authError) {
        setError(authError.message || 'Invalid email or password');
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
        setOpen(false);
        toast.success('Welcome back!');
      }
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl">Sign In</DialogTitle>
              <DialogDescription>
                Enter your credentials to access the system
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@fcms.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
          <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Demo credentials:</p>
            <p>Owner: owner@fcms.com / owner123</p>
            <p>Manager: manager@fcms.com / manager123</p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:-translate-y-1">
      <CardContent className="p-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

export function LandingPage() {
  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Hero Section ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url("/uploads/img/hero%20img.jpg")' }} />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />

        <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-4xl mx-auto">
          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-6 shadow-lg shadow-primary/25">
            <Dumbbell className="w-10 h-10" />
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4 text-white">
            A-kiyon
            <span className="block text-2xl sm:text-3xl md:text-4xl font-normal text-white/60 mt-1">
              Fitness Center
            </span>
          </h1>

          {/* Tagline */}
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mb-8 leading-relaxed">
            The complete management system for your fitness center.
            Track members, subscriptions, payments, and revenue — all in one place.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <LoginDialog>
              <Button size="lg" className="min-w-[160px] text-base h-12">
                Sign In
              </Button>
            </LoginDialog>
            <Button
              size="lg"
              variant="secondary"
              className="min-w-[160px] text-base h-12 bg-white/10 text-white hover:bg-white/20 border border-white/30"
              onClick={scrollToFeatures}
            >
              Learn More
              <ArrowDown className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scroll indicator */}
        <button
          onClick={scrollToFeatures}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 hover:text-white transition-colors animate-bounce"
        >
          <ArrowDown className="h-6 w-6" />
        </button>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className="py-24 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Everything you need to manage your fitness center
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From member registration to payment tracking, we've got you covered
              with an intuitive and powerful management system.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={Users}
              title="Member Management"
              description="Register members with photos, health stats, and contact details. Search, filter, and manage your member base effortlessly."
            />
            <FeatureCard
              icon={Calendar}
              title="Subscriptions & Renewals"
              description="Track subscription periods with Ethiopian calendar support. Auto-calculate end dates and get expiry alerts at a glance."
            />
            <FeatureCard
              icon={CreditCard}
              title="Payments & Receipts"
              description="Record payments in cash, bank transfer, or mobile money. Print thermal-style receipts and export payment reports as CSV."
            />
            <FeatureCard
              icon={BarChart3}
              title="Reports & Analytics"
              description="View revenue charts, monthly trends, and expiring members. Export data and make informed business decisions."
            />
          </div>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Card className="border-0 bg-primary/5 text-center">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6" />
                </div>
                <div className="text-3xl font-bold mb-1">Smart</div>
                <p className="text-sm text-muted-foreground">Member Tracking</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-emerald-50 text-center">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="text-3xl font-bold mb-1">Auto</div>
                <p className="text-sm text-muted-foreground">Expiry Alerts</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-amber-50 text-center">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div className="text-3xl font-bold mb-1">Real-time</div>
                <p className="text-sm text-muted-foreground">Revenue Reports</p>
              </CardContent>
            </Card>
            <Card className="border-0 bg-primary/5 text-center">
              <CardContent className="p-8">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="text-3xl font-bold mb-1">Easy</div>
                <p className="text-sm text-muted-foreground">CSV Exports</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="max-w-3xl mx-auto text-center">
          <Shield className="w-12 h-12 mx-auto text-primary mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to streamline your operations?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
            Sign in to manage your members, track subscriptions, and stay on top of your fitness center&apos;s performance.
          </p>
          <LoginDialog>
            <Button size="lg" className="min-w-[200px] text-base h-12">
              Sign In to Get Started
            </Button>
          </LoginDialog>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 px-4 border-t">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Dumbbell className="w-4 h-4" />
            <span>A-kiyon Fitness Center</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} A-kiyon Fitness Center Management System. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
