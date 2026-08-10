// lib/emailVerification.ts
// SECURITY FIX: Problem 25 - Email Verification Configuration
// Complete setup for secure email verification in Supabase

/**
 * ═══════════════════════════════════════════════════════════════
 * EMAIL VERIFICATION SETUP GUIDE FOR SUPABASE
 * ═══════════════════════════════════════════════════════════════
 * 
 * This file provides configuration and utilities for implementing
 * secure email verification on your Supabase backend. 
 * 
 * STEPS TO ENABLE (Do these in Supabase Dashboard):
 * 
 * 1. Go to Authentication → Settings
 * 2. Scroll to "Email Auth" section
 * 3. Enable "Enable email confirmations"
 * 4. Configure email template:
 *    - Subject: "Confirm your email for {{ .SiteName }}"
 *    - Body: See template below
 * 5. Set "Email Link Template" to your domain
 * 6. Save changes
 */

// ─── Email Templates ──────────────────────────────────────────────

export const EMAIL_TEMPLATES = {
  // Confirmation email sent when user signs up
  confirmation: {
    subject: 'Confirm your {{ .SiteName }} account',
    body: `
<h2>Welcome to {{ .SiteName }}!</h2>

<p>Thank you for creating an account. Please confirm your email address by clicking the button below:</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="{{ .ConfirmationURL }}" 
     style="background: #0086FF; color: white; padding: 12px 30px; 
            text-decoration: none; border-radius: 8px; font-weight: bold;">
    Confirm Email Address
  </a>
</p>

<p>If you didn't create this account, you can safely ignore this email.</p>

<p>This link will expire in 24 hours.</p>

<hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />

<p style="color: #666; font-size: 12px;">
  If the button doesn't work, copy and paste this URL into your browser:<br/>
  <span style="word-break: break-all;">{{ .ConfirmationURL }}</span>
</p>

<p style="color: #666; font-size: 12px;">
  {{ .SiteName }}<br/>
  Babi Khel, District Mohmand, KPK, Pakistan
</p>
    `,
  },

  // Password reset email
  passwordReset: {
    subject: 'Reset your {{ .SiteName }} password',
    body: `
<h2>Password Reset Request</h2>

<p>We received a request to reset your password for your {{ .SiteName }} account. Click the button below to set a new password:</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="{{ .RedirectURL }}" 
     style="background: #dc2626; color: white; padding: 12px 30px; 
            text-decoration: none; border-radius: 8px; font-weight: bold;">
    Reset Password
  </a>
</p>

<p>If you didn't request a password reset, you can safely ignore this email. Your password won't change until you click the button above.</p>

<p>This link will expire in 1 hour.</p>

<hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />

<p style="color: #666; font-size: 12px;">
  If the button doesn't work, copy and paste this URL:<br/>
  <span style="word-break: break-all;">{{ .RedirectURL }}</span>
</p>
    `,
  },

  // Email change verification
  emailChange: {
    subject: 'Verify your new email for {{ .SiteName }}',
    body: `
<h2>Email Change Verification</h2>

<p>You've requested to change your email address. Please verify your new email by clicking below:</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="{{ .ConfirmationURL }}" 
     style="background: #0086FF; color: white; padding: 12px 30px; 
            text-decoration: none; border-radius: 8px; font-weight: bold;">
    Verify New Email
  </a>
</p>

<p>Your account will be updated to use this new email after verification.</p>

<p>This link will expire in 24 hours.</p>
    `,
  },

  // Magic link login (optional)
  magicLink: {
    subject: 'Your {{ .SiteName }} login link',
    body: `
<h2>Here's your login link</h2>

<p>Click the button below to sign in to your {{ .SiteName }} account:</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="{{ .ConfirmationURL }}" 
     style="background: #0086FF; color: white; padding: 12px 30px; 
            text-decoration: none; border-radius: 8px; font-weight: bold;">
    Sign In
  </a>
</p>

<p>This link will expire in 1 hour and can only be used once.</p>

<p>If you didn't request this email, you can safely ignore it.</p>
    `,
  },
};

// ─── Configuration Options ─────────────────────────────────────────

export const EMAIL_VERIFICATION_CONFIG = {
  // Supabase Dashboard Settings
  supabaseSettings: {
    // Authentication → Settings
    enableEmailConfirmations: true,
    
    // Email settings
    mailer: {
      // Option 1: Use Supabase's built-in email (free tier available)
      // Go to Project Settings → SMTP Settings
      
      // Option 2: Custom SMTP (recommended for production)
      smtp: {
        host: 'smtp.gmail.com', // or your SMTP provider
        port: 465,
        user: '{{SMTP_USER}}',
        pass: '{{SMTP_PASSWORD}}',
        admin_email: 'noreply@ghsbabikhel.indevs.in',
      },
      
      // Option 3: Use a transactional email service
      // (SendGrid, Mailgun, AWS SES, etc.)
      customMailer: {
        enabled: false,
        endpoint: '/api/send-email',
        apiKey: '{{EMAIL_SERVICE_API_KEY}}',
      },
    },
    
    // URL templates
    urlTemplates: {
      // The URL users are redirected to after clicking confirmation
      confirmation: 'https://ghsbabikhel.indevs.in/auth/callback?type=signup',
      
      // Password reset redirect
      passwordReset: 'https://ghsbabikhel.indevs.in/auth/reset-password',
      
      // Email change redirect
      emailChange: 'https://ghsbabikhel.indevs.in/settings?verified=true',
      
      // Magic link redirect
      magicLink: 'https://ghsbabikhel.indevs.in/auth/callback?type=magiclink',
    },
    
    // Security settings
    security: {
      // How long before confirmation links expire (in hours)
      confirmationExpiryHours: 24,
      
      // How long before password reset links expire (in hours)
      passwordResetExpiryHours: 1,
      
      // Require email verification before allowing sign-in
      requireEmailVerification: true,
      
      // Allow unverified users some time to verify (in hours)
      gracePeriodHours: 48,
    },
  },

  // Client-side behavior
  clientConfig: {
    // Show resend verification option after (seconds)
    resendCooldownSeconds: 60,
    
    // Maximum number of resend attempts
    maxResendAttempts: 5,
    
    // Redirect unverified users to verification page
    redirectToVerification: true,
    
    // Verification page path
    verificationPagePath: '/auth/verify-email',
  },
};

// ─── Utility Functions ──────────────────────────────────────────────

/**
 * Check if user's email is verified
 */
export async function isEmailVerified(supabase: any): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email_confirmed_at !== null;
  } catch {
    return false;
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(
  supabase: any, 
  email: string,
  redirectTo?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectTo || EMAIL_VERIFICATION_CONFIG.supabaseSettings.urlTemplates.confirmation,
      }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Failed to send verification email' 
    };
  }
}

/**
 * Handle email verification callback (after user clicks link)
 */
export async function handleVerificationCallback(
  supabase: any,
  token_hash: string | null
): Promise<{ 
  success: boolean; 
  error?: string; 
  shouldShowSuccess?: boolean;
}> {
  if (!token_hash) {
    return { success: false, error: 'Missing verification token' };
  }

  try {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: 'email'
    });

    if (error) {
      // Check if already verified
      if (error.message?.includes('already been verified')) {
        return { success: true, shouldShowSuccess: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true, shouldShowSuccess: true };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Verification failed' 
    };
  }
}

/**
 * Get email verification status with user-friendly message
 */
export function getVerificationStatus(user: any): {
  verified: boolean;
  message: string;
  actionRequired: boolean;
} {
  if (!user) {
    return {
      verified: false,
      message: 'Please sign in to check verification status',
      actionRequired: false
    };
  }

  if (user.email_confirmed_at) {
    return {
      verified: true,
      message: 'Email verified successfully!',
      actionRequired: false
    };
  }

  // Check if within grace period
  const createdAt = new Date(user.created_at);
  const now = new Date();
  const gracePeriodMs = EMAIL_VERIFICATION_CONFIG.supabaseSettings.security.gracePeriodHours * 60 * 60 * 1000;
  
  if ((now.getTime() - createdAt.getTime()) < gracePeriodMs) {
    return {
      verified: false,
      message: 'Please verify your email address. Check your inbox for a verification link.',
      actionRequired: true
    };
  }

  return {
    verified: false,
    message: 'Email not verified. Your access may be limited. Please verify to unlock all features.',
    actionRequired: true
  };
}

// ─── React Hook for Email Verification ─────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

export function useEmailVerification(supabase: any) {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResending, setIsResending] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [canResend, setCanResend] = useState(true);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Check verification status on mount
  useEffect(() => {
    checkVerificationStatus();
  }, []);

  // Cooldown timer for resending
  useEffect(() => {
    if (!canResend && cooldownRemaining > 0) {
      const timer = setTimeout(() => {
        setCooldownRemaining(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (cooldownRemaining === 0 && !canResend) {
      setCanResend(true);
    }
  }, [canResend, cooldownRemaining]);

  const checkVerificationStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const status = getVerificationStatus(user);
      setIsVerified(status.verified);
    } catch (err) {
      console.error('[EmailVerification] Status check failed:', err);
      setIsVerified(null);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const resendVerification = useCallback(async (email?: string) => {
    if (!canResend || resendCount >= EMAIL_VERIFICATION_CONFIG.clientConfig.maxResendAttempts) {
      toast.error('Maximum resend attempts reached');
      return;
    }

    setIsResending(true);
    
    try {
      const userEmail = email || (await supabase.auth.getUser()).data.user?.email;
      
      if (!userEmail) {
        throw new Error('No email found');
      }

      const result = await resendVerificationEmail(supabase, userEmail);

      if (result.success) {
        toast.success('Verification email sent! Check your inbox.');
        setResendCount(prev => prev + 1);
        setCanResend(false);
        setCooldownRemaining(EMAIL_VERIFICATION_CONFIG.clientConfig.resendCooldownSeconds);
      } else {
        toast.error(result.error || 'Failed to send verification email');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setIsResending(false);
    }
  }, [supabase, canResend, resendCount]);

  return {
    isVerified,
    isLoading,
    isResending,
    canResend,
    cooldownRemaining,
    resendCount,
    maxResends: EMAIL_VERIFICATION_CONFIG.clientConfig.maxResendAttempts,
    checkVerificationStatus,
    resendVerification,
  };
}

// ─── SQL for Enabling Email Verification ────────────────────────────

/*
 * Run this SQL in your Supabase SQL Editor to add email verification tracking:
 

-- Add column to track verification status (if not exists)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Create function to update profile when email is verified
CREATE OR REPLACE FUNCTION handle_email_verification()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles 
  SET 
    email_verified = TRUE,
    email_verified_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users update
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION handle_email_verification();

-- Policy: Only allow verified users to access certain features
-- (Add to your existing RLS policies)

*/

export default {
  EMAIL_TEMPLATES,
  EMAIL_VERIFICATION_CONFIG,
  isEmailVerified,
  resendVerificationEmail,
  handleVerificationCallback,
  getVerificationStatus,
  useEmailVerification,
};
