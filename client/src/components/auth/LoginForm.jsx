import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, LogIn, Mail } from 'lucide-react';
import Input from '../common/Input';
import Button from '../common/Button';
import useAuth from '../../hooks/useAuth';
import { validateEmail } from '../../utils/validation';

export default function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Go back to the admin page they were trying to open (internal /admin paths only)
  const requested = location.state?.from?.pathname;
  const destination = requested && requested.startsWith('/admin') && requested !== '/admin/login' ? requested : '/admin';

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const found = {};
    const emailError = validateEmail(values.email);
    if (emailError) found.email = emailError;
    if (!values.password) found.password = 'Enter your password.'; // no password-strength rules at login
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) { document.getElementById(`login-${first}`)?.focus(); return; }

    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      navigate(destination, { replace: true });
    } catch (err) {
      setFormError(err.message || 'Could not sign in. Please try again.');
      setValues((v) => ({ ...v, password: '' }));
      setSubmitting(false);
      document.getElementById('login-password')?.focus();
    }
  };

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {formError && (
        <p className="form-alert" role="alert"><AlertCircle size={18} /> {formError}</p>
      )}

      <Input
        id="login-email" name="email" type="email" label="Email address" required autoComplete="username"
        icon={<Mail size={18} />} placeholder="you@example.com"
        value={values.email} onChange={set('email')} error={errors.email}
      />
      <Input
        id="login-password" name="password" type={showPassword ? 'text' : 'password'} label="Password" required autoComplete="current-password"
        icon={<Lock size={18} />} placeholder="Your password"
        value={values.password} onChange={set('password')} error={errors.password}
      />

      <label className="auth-check">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        Show password
      </label>

      <Button type="submit" size="lg" fullWidth loading={submitting} icon={<LogIn size={16} />}>
        Sign in
      </Button>
    </form>
  );
}
