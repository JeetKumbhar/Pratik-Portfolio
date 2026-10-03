import { useState } from 'react';
import { AlertCircle, CheckCircle2, Mail, MessageSquare, Phone, Send, User } from 'lucide-react';
import Input from '../common/Input';
import Select from '../common/Select';
import Textarea from '../common/Textarea';
import Button from '../common/Button';
import { sendMessage } from '../../services/contactService';
import { validateContact, MESSAGE_MAX } from './contactValidation';
import { SUBJECT_OPTIONS } from './contactData';

const EMPTY = { name: '', email: '', phone: '', subject: '', message: '', website: '' };

export default function ContactForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error

  const set = (field) => (e) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();

    const found = validateContact(values);
    setErrors(found);
    const firstBad = Object.keys(found)[0];
    if (firstBad) {
      document.getElementById(`contact-${firstBad}`)?.focus();
      return;
    }

    // Honeypot: real people never fill this hidden field; bots often do
    if (values.website) { setStatus('success'); return; }

    setStatus('submitting');
    try {
      const { website, ...payload } = values;
      await sendMessage(payload);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  const reset = () => { setValues(EMPTY); setErrors({}); setStatus('idle'); };

  if (status === 'success') {
    return (
      <div className="form-success" role="status">
        <CheckCircle2 size={44} strokeWidth={1.3} />
        <h3>Message sent</h3>
        <p>Thanks{values.name ? `, ${values.name.trim().split(' ')[0]}` : ''}! I'll get back to you within 24 hours.</p>
        <Button variant="outline" onClick={reset}>Send another message</Button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate>
      {status === 'error' && (
        <p className="form-alert" role="alert">
          <AlertCircle size={18} /> Something went wrong sending your message. Please try again.
        </p>
      )}

      <div className="contact-form__row">
        <Input id="contact-name" name="name" label="Your name" required autoComplete="name" icon={<User size={18} />}
          placeholder="Enter your full name" value={values.name} onChange={set('name')} error={errors.name} />
        <Input id="contact-email" name="email" type="email" label="Email address" required autoComplete="email" icon={<Mail size={18} />}
          placeholder="you@example.com" value={values.email} onChange={set('email')} error={errors.email} />
      </div>

      <div className="contact-form__row">
        <Input id="contact-phone" name="phone" type="tel" label="Phone (optional)" autoComplete="tel" icon={<Phone size={18} />}
          placeholder="+1 (123) 456-7890" value={values.phone} onChange={set('phone')} error={errors.phone} />
        <Select id="contact-subject" name="subject" label="What's this about?" required icon={<MessageSquare size={18} />}
          placeholder="Select a topic" options={SUBJECT_OPTIONS} value={values.subject} onChange={set('subject')} error={errors.subject} />
      </div>

      <Textarea id="contact-message" name="message" label="Your message" required maxLength={MESSAGE_MAX}
        placeholder="Tell me about your idea, date and location…" value={values.message} onChange={set('message')} error={errors.message} />

      {/* Honeypot (hidden from people and screen readers) */}
      <div className="hp" aria-hidden="true">
        <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} /></label>
      </div>

      <Button type="submit" size="lg" loading={status === 'submitting'} iconRight={<Send size={16} />} className="contact-form__submit">
        {status === 'submitting' ? 'Sending' : 'Send message'}
      </Button>
    </form>
  );
}
