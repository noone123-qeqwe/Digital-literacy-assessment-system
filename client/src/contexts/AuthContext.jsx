import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { AuthContext } from './AuthContextStore';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const profilePictureUrlRef = useRef('');
  const sessionRevision = useRef(0);

  const clearProfilePicture = useCallback(() => {
    if (profilePictureUrlRef.current) URL.revokeObjectURL(profilePictureUrlRef.current);
    profilePictureUrlRef.current = '';
    setProfilePictureUrl('');
  }, []);

  const refreshProfilePicture = useCallback(async () => {
    try {
      const res = await api.get('/auth/me/profile-picture', { responseType: 'blob' });
      if (profilePictureUrlRef.current) URL.revokeObjectURL(profilePictureUrlRef.current);
      const pictureUrl = URL.createObjectURL(res.data);
      profilePictureUrlRef.current = pictureUrl;
      setProfilePictureUrl(pictureUrl);
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 401) clearProfilePicture();
    }
  }, [clearProfilePicture]);

  useEffect(() => () => {
    if (profilePictureUrlRef.current) URL.revokeObjectURL(profilePictureUrlRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    const revision = sessionRevision.current;
    api.get('/auth/me', { suppressSessionRedirect: true, suppressErrorToast: true })
      .then(async (res) => {
        if (!active || revision !== sessionRevision.current) return;
        if (res.data.success) {
          setUser(res.data.data);
          await refreshProfilePicture();
        }
      })
      .catch(() => {
        if (!active || revision !== sessionRevision.current) return;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshProfilePicture]);

  const authErrorMessage = (err, fallback) => {
    if (!err?.response) return 'We could not connect. Check your internet connection and try again.';
    return err.response?.data?.message || fallback;
  };

  const login = async (email, password, options = {}) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.success) {
        if (res.data.mfaRequired || res.data.mfaSetupRequired) {
          return { ...res.data, success: false };
        }
        const currentUser = await api.get('/auth/me').then((me) => me.data.data);
        setUser(currentUser);
        await refreshProfilePicture();
        toast.success(`Welcome back, ${currentUser.first_name}!`);
        return { success: true, user: currentUser };
      }
    } catch (err) {
      const msg = authErrorMessage(err, 'Login failed. Please check your credentials.');
      if (!options.silentErrorToast && !err.response?.data?.mfaRequired && !err.response?.data?.mfaSetupRequired) {
        toast.error(msg);
      }
      return { success: false, message: msg, verificationRequired: Boolean(err.response?.data?.verificationRequired) };
    }
  };

  const register = async (formData) => {
    try {
      const res = await api.post('/auth/register', formData);
      if (res.data.success) {
        return { success: true, verificationRequired: res.data.verificationRequired, message: res.data.message };
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed.';
      return { success: false, message: msg };
    }
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    clearProfilePicture();
    setUser(null);
    toast.success('Signed out successfully');
  };

  const updateProfile = async (profileData) => {
    try {
      const res = await api.put('/auth/me', profileData);
      if (res.data.success) {
        setUser(res.data.data);
        toast.success('Profile updated successfully');
        return { success: true, user: res.data.data };
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update profile.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const uploadProfilePicture = async (image) => {
    try {
      const res = await api.put('/auth/me/profile-picture', { image });
      if (res.data.success) {
        await refreshProfilePicture();
        toast.success('Profile picture updated successfully');
        return { success: true };
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update profile picture.';
      toast.error(msg);
      return { success: false, message: msg };
    }
    return { success: false, message: 'Failed to update profile picture.' };
  };

  const changePassword = async (current_password, new_password) => {
    try {
      const res = await api.put('/auth/me/password', { current_password, new_password });
      if (res.data.success) {
        toast.success('Password changed successfully');
        return { success: true };
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to change password.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const refreshUser = useCallback(async (options = {}) => {
    const revision = ++sessionRevision.current;
    try {
      const res = await api.get('/auth/me', options);
      if (res.data.success && revision === sessionRevision.current) {
        setUser(res.data.data);
        setLoading(false);
        await refreshProfilePicture();
        return res.data.data;
      }
    } catch {}
    return null;
  }, [refreshProfilePicture]);

  const completeMfaLogin = async (challenge_id, code, options = {}) => {
    try {
      const res = await api.post('/auth/mfa/verify', { challenge_id, code });
      const currentUser = (await refreshUser()) || res.data.data.user;
      setUser(currentUser);
      await refreshProfilePicture();
      toast.success(`Welcome back, ${currentUser.first_name}!`);
      const { verifiedMethod, remainingBackupCodes } = res.data.data || {};
      if (verifiedMethod === 'backup_code' && Number.isInteger(remainingBackupCodes) && remainingBackupCodes <= 2) {
        toast(
          remainingBackupCodes === 0
            ? 'You used your last backup scratch code. Generate new codes in Security settings.'
            : `Only ${remainingBackupCodes} backup scratch code${remainingBackupCodes === 1 ? '' : 's'} left. Regenerate codes in Security settings.`,
          { duration: 6000 }
        );
      }
      return { success: true, user: currentUser, verifiedMethod };
    } catch (err) {
      const msg = authErrorMessage(err, 'Unable to verify the code.');
      if (!options.silentErrorToast) toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const resendMfaOtp = async (challenge_id, options = {}) => {
    try {
      const res = await api.post('/auth/mfa/resend-otp', { challenge_id });
      toast.success(res.data.message || 'Verification code resent.');
      return { success: true, message: res.data.message };
    } catch (err) {
      const msg = authErrorMessage(err, 'Unable to resend verification code.');
      if (!options.silentErrorToast) toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const beginMfaSetup = async (setup_token, options = {}) => {
    try {
      const res = await api.post('/auth/mfa/setup', { setup_token });
      return { success: true, ...res.data.data };
    } catch (err) {
      const msg = authErrorMessage(err, 'Unable to start multi-factor setup.');
      if (!options.silentErrorToast) toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const completeMfaSetup = async (setup_token, code, options = {}) => {
    try {
      const res = await api.post('/auth/mfa/setup/confirm', { setup_token, code });
      const currentUser = res.data.data.user;
      setUser(currentUser);
      await refreshProfilePicture();
      toast.success('Multi-factor authentication is enabled.');
      return { success: true, user: currentUser };
    } catch (err) {
      const msg = authErrorMessage(err, 'Unable to confirm the authenticator code.');
      if (!options.silentErrorToast) toast.error(msg);
      return { success: false, message: msg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profilePictureUrl,
        loading,
        login,
        register,
        logout,
        updateProfile,
        uploadProfilePicture,
        changePassword,
        refreshUser,
        completeMfaLogin,
        resendMfaOtp,
        beginMfaSetup,
        completeMfaSetup,
        isAdmin: user?.role === 'admin',
        isAssessor: user?.role === 'assessor',
        isRespondent: user?.role === 'respondent',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};


