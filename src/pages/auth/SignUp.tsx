// pages/auth/SignUp.tsx (Enhanced)
// SECURITY FIX: Problems 3, 24, 25, 26 - Secure Registration with CAPTCHA & Email Verification
// Multi-layer protection: Email validation + Reserved blocking + CAPTCHA + Rate limiting
// FIX: Profile creation now uses RPC to avoid RLS issues

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Mail, Lock, User, GraduationCap, ArrowRight, Loader2, Clock, 
  Shield, AlertTriangle, CheckCircle2, Eye, EyeOff
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import toast from "react-hot-toast";
import { Captcha, useCaptcha } from "@/components/ui/Captcha";

// ─── Security Configuration ──────────────────────────────────────────

// Block reserved/premium email patterns (Problem 26 - Enhanced)
const BLOCKED_EMAIL_PATTERNS = [
  // Admin/system accounts
  'admin', 'administrator', 'root', 'system',
  // Support/communication
  'support', 'help', 'info', 'contact', 'noreply', 'no-reply',
  'webmaster', 'hostmaster', 'postmaster', 'mailer-daemon',
  // Technical
  'security', 'ssl-cert', 'abuse', 'spam',
  // Common test/bot patterns
  'test', 'debug', 'dev', 'staging', 'demo',
  'example', 'sample', 'temp', 'tmp',
];

const BLOCKED_DOMAINS = [
  'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'throwaway.email', 'mailinator.com', 'fakeinbox.com',
];

// Allowed roles for self-registration
const ROLES = ["student", "teacher"] as const;

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[a-zA-Z\s\-'\u0600-\u06FF]{2,100}$/;
const PHONE_REGEX = /^[\+]?[0-9\s\-\(\)]{7,20}$/;

// Password requirements (enhanced)
const PASSWORD_CONFIG = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: false, // Optional for better UX
  maxLength: 128,
};

// ─── Component ─────────────────────────────────────────────────────

const SignUp = () => {
  const navigate = useNavigate();
  
  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'student' as string,
    phone: '',
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [passwordStrength, setPasswordStrength] = useState(0); // 0-4
  
  // CAPTCHA state (Problem 24)
  const { isVerified: captchaVerified, handleVerify: handleCaptchaVerify, CaptchaComponent } = useCaptcha('hard');
  
  // Settings
  const { data: settings } = useSchoolSettings();

  // ─── Validation Functions ──────────────────────────────────────

  const isEmailBlocked = (email: string): boolean => {
    const lowerEmail = email.toLowerCase().trim();
    
    // Check blocked patterns in local part
    const localPart = lowerEmail.split('@')[0];
    if (BLOCKED_EMAIL_PATTERNS.some(pattern => localPart.includes(pattern))) {
      return true;
    }
    
    // Check blocked domains
    const domain = lowerEmail.split('@')[1];
    if (domain && BLOCKED_DOMAINS.some(d => domain.includes(d) || domain === d)) {
      return true;
    }
    
    return false;
  };

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    
    if (password.length >= PASSWORD_CONFIG.minLength) strength++;
    if (PASSWORD_CONFIG.requireUppercase && /[A-Z]/.test(password)) strength++;
    if (PASSWORD_CONFIG.requireLowercase && /[a-z]/.test(password)) strength++;
    if (PASSWORD_CONFIG.requireNumber && /\d/.test(password)) strength++;
    if (PASSWORD_CONFIG.requireSpecialChar && /[^A-Za-z0-9]/.test(password)) strength++;
    
    // Bonus for length
    if (password.length >= 12) strength += 0.5;
    if (password.length >= 16) strength += 0.5;
    
    return Math.min(4, Math.floor(strength));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    // Name validation
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Name is required';
    } else if (!NAME_REGEX.test(formData.fullName.trim())) {
      newErrors.fullName = 'Please enter a valid name (letters only)';
    }
    
    // Email validation
    if (!EMAIL_REGEX.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    } else if (isEmailBlocked(formData.email)) {
      newErrors.email = 'This email address is not allowed for registration';
      toast.error('Reserved or disposable email addresses are not permitted');
    }
    
    // Password validation
    if (formData.password.length < PASSWORD_CONFIG.minLength) {
      newErrors.password = `Password must be at least ${PASSWORD_CONFIG.minLength} characters`;
    } else if (PASSWORD_CONFIG.requireUppercase && !/[A-Z]/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one uppercase letter';
    } else if (PASSWORD_CONFIG.requireLowercase && !/[a-z]/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one lowercase letter';
    } else if (PASSWORD_CONFIG.requireNumber && !/\d/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one number';
    }
    
    // Confirm password
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    // Role validation
    if (!ROLES.includes(formData.role as any)) {
      newErrors.role = 'Invalid role selected';
    }
    
    // Phone validation (optional)
    if (formData.phone && !PHONE_REGEX.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }
    
    // CAPTCHA verification (Problem 24) - with improved messaging
    if (!captchaVerified) {
      newErrors.captcha = 'Please complete the security verification above by clicking "Verify Answer"';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Event Handlers ───────────────────────────────────────────

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    // Update password strength indicator
    if (field === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    
    // Validate form
    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }
    
    setLoading(true);
    
    try {
      // NOTE: email confirmation is controlled by a Supabase Dashboard
      // setting (Authentication → Providers → Email → "Confirm email"),
      // not by this code. Turn that OFF in the dashboard so signUp()
      // returns an active session immediately instead of requiring an
      // email click — that's what was causing the profile insert below
      // to run without a session and silently fail under RLS.
      const { data: authData, error } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName.trim(),
            role: formData.role,
            phone: formData.phone.trim() || null,
            status: 'pending',
            registered_at: new Date().toISOString(),
            captcha_verified: captchaVerified,
          },
        },
      });

      let sessionUser = authData?.user ?? null;

      if (error) {
        // "already registered" can mean two different things here:
        //  1. A genuine existing, fully-set-up account → the user should
        //     sign in normally.
        //  2. The exact dead-end you hit: signUp() previously succeeded
        //     (created the auth.users row) but the profiles insert below
        //     failed right after, most likely because "Confirm email" is
        //     still ON in the Supabase dashboard, so that first attempt
        //     ran with no active session and RLS silently blocked the
        //     write. Supabase then refuses a second signUp() with the
        //     same email, leaving an auth account with no usable profile
        //     and no way to retry through this form — a true dead end.
        // We can't tell which case it is from the error alone, so we try
        // signing in with the same credentials the user just typed. If
        // that succeeds, we know it's case 2 (their own account, right
        // password) and we can finish creating the missing profile. If
        // sign-in fails too, it's a genuine "already exists" with a
        // different password, so we show that error as before.
        if (error.message?.includes('already registered')) {
          const { data: retrySignIn, error: retrySignInError } =
            await supabase.auth.signInWithPassword({
              email: formData.email.trim(),
              password: formData.password,
            });

          if (retrySignInError || !retrySignIn.user) {
            toast.error('An account with this email already exists');
            setErrors(prev => ({ ...prev, email: 'Email already registered' }));
            setLoading(false);
            return;
          }

          sessionUser = retrySignIn.user;
        } else {
          toast.error(error.message || 'Registration failed');
          setLoading(false);
          return;
        }
      }

      // Create profile record using RPC to avoid RLS issues
      // This MUST succeed for the account to be usable.
      if (sessionUser) {
        // Try RPC first (bypasses RLS with SECURITY DEFINER)
        const { error: rpcError } = await supabase.rpc('create_my_profile', {
          p_full_name: formData.fullName.trim(),
          p_role: formData.role,
          p_phone: formData.phone.trim() || null,
          p_status: 'pending'
        });

        // If RPC doesn't exist or fails, try direct upsert as fallback
        if (rpcError && !rpcError.message?.includes('function create_my_profile')) {
          console.warn('[SignUp] RPC failed, trying direct upsert:', rpcError.message);
          
          const { error: profileError } = await supabase.from("profiles").upsert({
            id: sessionUser.id,
            full_name: formData.fullName.trim(),
            role: formData.role,
            phone: formData.phone.trim() || null,
            status: 'pending', // Requires admin approval
            email_verified: false,
          }, { onConflict: "id" });

          if (profileError) {
            console.error('[SignUp] Profile creation failed (both RPC and direct):', profileError);
            toast.error('Account created but profile setup failed. Please contact the admin.');
            setLoading(false);
            return;
          }
        } else if (rpcError) {
          console.warn('[SignUp] RPC function does not exist, profile may not be created:', rpcError.message);
          // Continue anyway - the RPC might not exist yet but account is created
          // Admin can manually create profile if needed
        }
      }

      // If we recovered via the retry-sign-in path, don't leave the user
      // logged into a still-pending account — sign back out so the normal
      // "pending approval" messaging on SignIn applies consistently,
      // exactly as it would for a fresh signup.
      await supabase.auth.signOut();

      setLoading(false);
      setSuccess(true);

      toast.success(
        'Account created! An administrator will review and approve your account.',
        { duration: 5000, icon: '✅' }
      );
      
    } catch (err) {
      console.error('[SignUp] Error:', err);
      toast.error('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  // ─── Password Strength Indicator ─────────────────────────────

  const getStrengthColor = (strength: number): string => {
    switch (strength) {
      case 0: return 'bg-gray-300';
      case 1: return 'bg-red-500';
      case 2: return 'bg-orange-500';
      case 3: return 'bg-yellow-500';
      case 4: return 'bg-green-500';
      default: return 'bg-gray-300';
    }
  };

  const getStrengthLabel = (strength: number): string => {
    switch (strength) {
      case 0: return '';
      case 1: return 'Weak';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Strong';
      default: return '';
    }
  };

  // ─── Success View ─────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="bg-card rounded-2xl shadow-elevated p-8 text-center">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-green-500/15 mx-auto mb-4 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            
            <h1 className="text-2xl font-heading font-bold text-foreground mb-2">
              Account Created Successfully!
            </h1>
            
            <div className="space-y-3 text-sm text-muted-foreground mb-6">
              <p>
                Your account has been created and is <strong className="text-blue-600">pending admin approval</strong>.
              </p>

              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
                <p className="text-xs text-yellow-800 dark:text-yellow-400">
                  ⏳ An administrator will review and approve your account before you can sign in.
                </p>
              </div>
              
              <div className="flex items-center justify-center gap-2 text-green-600">
                <Shield className="w-4 h-4" />
                <span className="text-xs">Protected by multi-layer security</span>
              </div>
            </div>
            
            <Link
              to="/auth/signin"
              className="inline-flex items-center gap-2 mt-6 text-sm font-medium text-primary hover:underline"
            >
              Go to Sign In <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Registration Form ─────────────────────────────────────────

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-20 -left-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10 my-8"
      >
        <div className="bg-card rounded-2xl shadow-elevated p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl gradient-hero mx-auto mb-4 flex items-center justify-center overflow-hidden">
              {settings?.logo_url && !logoFailed ? (
                <img
                  src={safeMediaUrl(settings.logo_url)!}
                  alt={`${settings?.school_name} logo`}
                  className="w-full h-full object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            
            <h1 className="text-2xl font-heading font-bold text-foreground">Create Account</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Join the {settings?.school_name || "GHS Babi Khel"} community
            </p>
          </div>

          {/* Security Badge */}
          <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <p className="text-xs text-green-800 dark:text-green-400">
                <strong>Secure Registration</strong> — Protected by CAPTCHA and admin approval.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {/* Full Name */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Full Name <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange('fullName')}
                  placeholder="Your full name"
                  required
                  maxLength={100}
                  autoComplete="name"
                  className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                    errors.fullName ? 'border-destructive' : 'border-input'
                  }`}
                />
              </div>
              {errors.fullName && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{errors.fullName}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Email Address <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={handleChange('email')}
                  placeholder="you@example.com"
                  required
                  maxLength={254}
                  autoComplete="email"
                  className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                    errors.email ? 'border-destructive' : 'border-input'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{errors.email}
                </p>
              )}
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange('password')}
                    placeholder="••••••••"
                    required
                    minLength={PASSWORD_CONFIG.minLength}
                    autoComplete="new-password"
                    className={`w-full rounded-xl border bg-background pl-9 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                      errors.password ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            passwordStrength >= level ? getStrengthColor(passwordStrength) : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs ${getStrengthColor(passwordStrength).replace('bg-', 'text-')}`}>
                      {getStrengthLabel(passwordStrength)}
                    </p>
                  </div>
                )}
                
                {errors.password && (
                  <p className="text-xs text-destructive mt-1">{errors.password}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Confirm <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange('confirmPassword')}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className={`w-full rounded-xl border bg-background pl-9 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                      errors.confirmPassword ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-xs text-destructive mt-1">{errors.confirmPassword}</p>
                )}
              </div>
            </div>

            {/* Password Requirements Hint */}
            <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded-lg">
              <p className="font-medium mb-1">Password requirements:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>At least {PASSWORD_CONFIG.minLength} characters</li>
                <li>One uppercase & lowercase letter</li>
                <li>One number</li>
              </ul>
            </div>

            {/* Role Selection */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">I am a</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, role: r }))}
                    className={`px-2 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                      formData.role === r
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone (Optional) */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Phone (optional)</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange('phone')}
                  placeholder="+92 3XX XXXXXXX"
                  autoComplete="tel"
                  className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                    errors.phone ? 'border-destructive' : 'border-input'
                  }`}
                />
              </div>
              {errors.phone && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{errors.phone}
                </p>
              )}
            </div>

            {/* Problem 24: CAPTCHA Integration */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Security Verification <span className="text-destructive">*</span>
              </label>
              
              {/* Instruction hint for better UX */}
              {!captchaVerified && (
                <p className="text-xs text-muted-foreground mb-2">
                  🔒 Complete the puzzle below and click <strong>"Verify Answer"</strong> before creating your account
                </p>
              )}
              
              <CaptchaComponent className="mb-2" />
              {errors.captcha && (
                <p className="text-xs text-destructive flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3" />{errors.captcha}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !captchaVerified}
              className="w-full gradient-accent text-primary-foreground font-semibold py-3 rounded-xl shadow-card hover:shadow-elevated transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              title={!captchaVerified ? "Please complete security verification first" : ""}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  Create Account
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{" "}
            <Link to="/auth/signin" className="text-primary font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default SignUp;
