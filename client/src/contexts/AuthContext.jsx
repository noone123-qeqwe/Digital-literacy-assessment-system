import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { AuthContext } from './AuthContextStore';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const profilePictureUrlRef = useRef('');

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
    api.get('/auth/me')
      .then(async (res) => {
        if (res.data.success) {
          setUser(res.data.data);
          await refreshProfilePicture();
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refreshProfilePicture]);

  const login = async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.success) {
        if (res.data.mfaRequired || res.data.mfaSetupRequired) {
          return { success: false, ...res.data };
        }
        const currentUser = await api.get('/auth/me').then((me) => me.data.data);
        setUser(currentUser);
        await refreshProfilePicture();
        toast.success(`Welcome back, ${currentUser.first_name}!`);
        return { success: true, user: currentUser };
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please check your credentials.';
      if (!err.response?.data?.mfaRequired && !err.response?.data?.mfaSetupRequired) toast.error(msg);
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

  const completeMfaLogin = async (challenge_id, code) => {
    try {
      const res = await api.post('/auth/mfa/verify', { challenge_id, code });
      const currentUser = res.data.data.user;
      setUser(currentUser);
      await refreshProfilePicture();
      toast.success(`Welcome back, ${currentUser.first_name}!`);
      return { success: true, user: currentUser };
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to verify the code.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const beginMfaSetup = async (setup_token) => {
    try {
      const res = await api.post('/auth/mfa/setup', { setup_token });
      return { success: true, ...res.data.data };
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to start multi-factor setup.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  };

  const completeMfaSetup = async (setup_token, code) => {
    try {
      const res = await api.post('/auth/mfa/setup/confirm', { setup_token, code });
      const currentUser = res.data.data.user;
      setUser(currentUser);
      await refreshProfilePicture();
      toast.success('Multi-factor authentication is enabled.');
      return { success: true, user: currentUser };
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to confirm the authenticator code.';
      toast.error(msg);
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
        completeMfaLogin,
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


