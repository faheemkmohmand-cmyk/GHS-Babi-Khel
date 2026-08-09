import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, User, GraduationCap, ArrowRight, Loader2, Phone, Clock, Shield, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSchoolSettings, safeMediaUrl } from "@/hooks/useSchoolSettings";
import toast from "react-hot-toast";

// SECURITY FIX: Block reserved email patterns to prevent admin account creation
const BLOCKED_EMAIL_PATTERNS = [
  'admin', 'administrator', 'root', 'support', 'info', 'noreply',
  'webmaster', 'hostmaster', 'postmaster', 'security', 'admin@',
  'support@', 'info@', 'noreply@', 'test@', 'debug@'
];

// Allowed roles for self-registration
const roles = ["student", "teacher"] as const;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password strength requirements
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIREMENTS = {
  minLength: PASSWORD_MIN_LENGTH,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true
};

const SignUp = () => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<string>("student");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { data: settings } = useSchoolSettings();
  const navigate = useNavigate();

  // SECURITY FIX: Validate email against blocked patterns
  const isEmailBlocked = (email: string): boolean => {
    const lowerEmail = email.toLowerCase().trim();
    return BLOCKED_EMAIL_PATTERNS.some(pattern => 
      lowerEmail.includes(pattern) || 
      lowerEmail.startsWith(pattern.replace('@', '')) ||
      pattern.includes('@') && lowerEmail === pattern
    );
  };

  // Validate password strength
  const validatePasswordStrength = (pwd: string): string | null => {
    if (pwd.length < PASSWORD_REQUIREMENTS.minLength) {
      return `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`;
    }
    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(pwd)) {
      return "Password must contain at least one uppercase letter";
    }
    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(pwd)) {
      return "Password must contain at least one lowercase letter";
    }
    if (PASSWORD_REQUIREMENTS.requireNumber && !/\d/.test(pwd)) {
      return "Password must contain at least one number";
    }
    return null;
  };

  // Validate name (no special characters that could be used for injection)
  const validateName = (name: string): string | null => {
    if (!name.trim()) {
      return "Name is required";
    }
    if (name.trim().length < 2) {
      return "Name must be at least 2 characters";
    }
    if (name.trim().length > 100) {
      return "Name must be less than 100 characters";
    }
    // Allow letters, spaces, hyphens, apostrophes (for names like O'Brien)
    if (!/^[a-zA-Z\s\-'\u0600-\u06FF]+$/.test(name.trim())) {
      return "Name contains invalid characters";
    }
    return null;
  };

  // Validate phone number format (optional field)
  const validatePhone = (phone: string): string | null => {
    if (!phone) return null; // Optional field
    // Basic international phone format validation
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{7,20}$/;
    if (!phoneRegex.test(phone)) {
      return "Please enter a valid phone number";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    setValidationErrors({});

    // Collect all validation errors
    const errors: Record<string, string> = {};

    // Validate name
    const nameError = validateName(fullName);
    if (nameError) errors.name = nameError;

    // Validate email format
    if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    // SECURITY FIX: Check for blocked email patterns
    if (isEmailBlocked(email)) {
      errors.email = "This email address is not allowed for registration";
      toast.error("Reserved email addresses cannot be used for registration");
    }

    // Validate password
    const passwordError = validatePasswordStrength(password);
    if (passwordError) errors.password = passwordError;

    // Validate confirm password
    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    // Validate role
    if (!["student", "teacher"].includes(role)) {
      errors.role = "Invalid role selected";
    }

    // Validate phone (optional)
    const phoneError = validatePhone(phone);
    if (phoneError) errors.phone = phoneError;

    // If there are errors, show them and stop
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      
      // Show toast for the first error
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return;
    }

    setLoading(true);

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName.trim(),
            role,
            phone: phone.trim() || null,
            status: "pending",
          },
        },
      });

      if (error) {
        // Handle specific error cases
        if (error.message?.includes("already registered")) {
          toast.error("An account with this email already exists");
          setValidationErrors({ ...validationErrors, email: "Email already registered" });
        } else {
          toast.error(error.message || "Registration failed. Please try again.");
        }
        setLoading(false);
        return;
      }

      // ── Manually insert profile row so admin can see pending request ──
      if (!error && authData.user) {
        await supabase.from("profiles").upsert({
          id: authData.user.id,
          full_name: fullName.trim(),
          role,
          phone: phone.trim() || null,
          status: "pending",
        }, { onConflict: "id" });
      }

      setLoading(false);

      if (!error) {
        setSuccess(true);
        toast.success("Account created successfully! Please check your email to verify.");
      }
    } catch (err) {
      console.error("[SignUp] Error:", err);
      toast.error("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen gradient-hero flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="bg-card rounded-2xl shadow-elevated p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/15 mx-auto mb-4 flex items-center justify-center">
              <Clock className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Account Under Review</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              Your account has been created and is <strong className="text-blue-700">pending admin approval</strong>.
              You will be able to sign in once an administrator approves your account.
            </p>
            <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
              <p className="text-xs text-blue-800 dark:text-blue-400">
                Please check your email to verify your address. Admin will review your request shortly.
              </p>
            </div>
            
            {/* Security notice */}
            <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
              <Shield className="w-5 h-5 text-green-600 mx-auto mb-1" />
              <p className="text-xs text-green-800 dark:text-green-400">
                Your account is protected with email verification and admin approval.
              </p>
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
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl gradient-hero mx-auto mb-4 flex items-center justify-center overflow-hidden">
              {settings?.logo_url && !logoFailed ? (
                <img
                  src={safeMediaUrl(settings.logo_url)!}
                  alt={`${settings?.school_name || "GHS Babi Khel"} logo`}
                  className="w-full h-full object-cover"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <GraduationCap className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Create Account</h1>
            <p className="text-sm text-muted-foreground mt-1">Join the {settings?.school_name || "GHS Babi Khel"} community</p>
          </div>

          {/* Security notice */}
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800 dark:text-blue-400">
                Secure registration with email verification & admin approval required.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center mb-4">
            Teachers: please use the form below so we know to set up your teacher account correctly.
          </p>

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
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    // Clear error when user starts typing
                    if (validationErrors.name) {
                      setValidationErrors(prev => ({ ...prev, name: "" }));
                    }
                  }}
                  placeholder="Your full name"
                  className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                    validationErrors.name ? 'border-destructive' : 'border-input'
                  }`}
                  required
                  maxLength={100}
                  minLength={2}
                  autoComplete="name"
                />
              </div>
              {validationErrors.name && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{validationErrors.name}
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
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationErrors.email) {
                      setValidationErrors(prev => ({ ...prev, email: "" }));
                    }
                  }}
                  placeholder="you@example.com"
                  className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                    validationErrors.email ? 'border-destructive' : 'border-input'
                  }`}
                  required
                  maxLength={255}
                  autoComplete="email"
                />
              </div>
              {validationErrors.email && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{validationErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (validationErrors.password) {
                        setValidationErrors(prev => ({ ...prev, password: "" }));
                      }
                    }}
                    placeholder="••••••••"
                    className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                      validationErrors.password ? 'border-destructive' : 'border-input'
                    }`}
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                  />
                </div>
                {validationErrors.password && (
                  <p className="text-xs text-destructive mt-1">{validationErrors.password}</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">
                  Confirm <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (validationErrors.confirmPassword) {
                        setValidationErrors(prev => ({ ...prev, confirmPassword: "" }));
                      }
                    }}
                    placeholder="••••••••"
                    className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                      validationErrors.confirmPassword ? 'border-destructive' : 'border-input'
                    }`}
                    required
                    autoComplete="new-password"
                  />
                </div>
                {validationErrors.confirmPassword && (
                  <p className="text-xs text-destructive mt-1">{validationErrors.confirmPassword}</p>
                )}
              </div>
            </div>

            {/* Password requirements hint */}
            <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded-lg">
              <p className="font-medium mb-1">Password requirements:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>At least {PASSWORD_MIN_LENGTH} characters</li>
                <li>One uppercase letter</li>
                <li>One lowercase letter</li>
                <li>One number</li>
              </ul>
            </div>

            {/* Role */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">I am a</label>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-2 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                      role === r
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Phone (optional)</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (validationErrors.phone) {
                      setValidationErrors(prev => ({ ...prev, phone: "" }));
                    }
                  }}
                  placeholder="+92 3XX XXXXXXX"
                  className={`w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-ring outline-none ${
                    validationErrors.phone ? 'border-destructive' : 'border-input'
                  }`}
                  autoComplete="tel"
                />
              </div>
              {validationErrors.phone && (
                <p className="text-xs text-destructive mt-1">{validationErrors.phone}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full gradient-accent text-primary-foreground font-semibold py-3 rounded-xl shadow-card hover:shadow-elevated transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

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
