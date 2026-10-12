import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Upload } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import Select from '../common/Select';
import Textarea from '../common/Textarea';
import useAuth from '../../hooks/useAuth';
import { createPhoto, getUploadSignature, updatePhoto } from '../../services/adminService';
import { uploadToCloudinary } from '../../services/uploadService';
import { CATEGORIES } from '../portfolio/portfolioData';
import { formatBytes, isImageUrlOrPath, titleFromFilename, transformUrl, validateImageFile } from '../../utils/imageUtils';
import { cx } from '../../utils/helpers';

const CATEGORY_OPTIONS = CATEGORIES.filter((c) => c.value !== 'all').map(({ value, label }) => ({ value, label }));
const blank = () => ({ title: '', category: '', description: '', isPublished: true, featured: false });

/**
 * Add a photo (upload a file, or paste an image URL) or edit one (title, category, description, visibility).
 * Upload flow:  signature from our API → browser uploads to Cloudinary → our API saves the returned URL in MongoDB.
 * If saving fails AFTER the upload succeeded, the uploaded file is remembered, so "Try again" doesn't upload it twice.
 */
export default function PhotoFormModal({ isOpen, photo, onClose, onSaved }) {
  const { token } = useAuth();
  const editing = Boolean(photo);
  const inputRef = useRef(null);

  const [mode, setMode] = useState('upload'); // 'upload' | 'url'
  const [form, setForm] = useState(blank());
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [urlText, setUrlText] = useState('');
  const [uploaded, setUploaded] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // A fresh form each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setForm(photo
      ? { title: photo.title, category: photo.category, description: photo.description ?? '', isPublished: photo.isPublished, featured: photo.featured }
      : blank());
    setMode('upload'); setFile(null); setUrlText(''); setUploaded(null);
    setErrors({}); setSubmitError(''); setProgress(0); setSaving(false);
  }, [isOpen, photo]);

  // Preview of the chosen file (the temporary address is released when the file changes)
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setErrors((e) => ({ ...e, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) })); };

  const pickFile = (chosen) => {
    if (!chosen) return;
    const problem = validateImageFile(chosen);
    if (problem) { setErrors((e) => ({ ...e, file: problem })); return; }
    setFile(chosen);
    setUploaded(null); // a different file: the earlier upload no longer applies
    setErrors((e) => ({ ...e, file: undefined }));
    setForm((f) => (f.title ? f : { ...f, title: titleFromFilename(chosen.name) }));
  };

  const validate = () => {
    const found = {};
    if (!form.title.trim()) found.title = 'Give the photo a title.';
    else if (form.title.trim().length > 100) found.title = 'Keep the title under 100 characters.';
    if (!form.category) found.category = 'Choose a category.';
    if (!editing && mode === 'upload' && !uploaded) {
      const problem = validateImageFile(file);
      if (problem) found.file = problem;
    }
    if (!editing && mode === 'url' && !isImageUrlOrPath(urlText.trim())) found.url = 'Enter a full https:// address or a /path.';
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setSubmitError('');
    setProgress(0);
    try {
      const fields = { title: form.title.trim(), category: form.category, description: form.description.trim(), isPublished: form.isPublished, featured: form.featured };
      let saved;
      if (editing) {
        saved = await updatePhoto(token, photo.id, fields);
      } else {
        let image;
        if (mode === 'url') {
          image = { url: urlText.trim() };
        } else {
          image = uploaded;
          if (!image) {
            const signature = await getUploadSignature(token); // 503 with a helpful message until Cloudinary is set up
            image = await uploadToCloudinary(file, signature, setProgress);
            setUploaded(image);
          }
        }
        saved = await createPhoto(token, { ...fields, image });
      }
      onSaved(saved, editing ? 'updated' : 'added');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploading = saving && !editing && mode === 'upload' && !uploaded && progress < 100;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title={editing ? 'Edit photo' : 'Add photo'}
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editing ? 'Save changes' : 'Add photo'}</Button>
        </>
      )}
    >
      <form className="photo-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        {editing ? (
          <div className="photo-form__current">
            <img src={transformUrl(photo.src, { width: 700 })} alt={photo.alt} />
            <p>To use a different image, add a new photo and delete this one.</p>
          </div>
        ) : (
          <>
            <div className="photo-form__mode" role="group" aria-label="How do you want to add the photo?">
              <button type="button" className={cx('chip', mode === 'upload' && 'is-selected')} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}><Upload size={14} /> Upload a file</button>
              <button type="button" className={cx('chip', mode === 'url' && 'is-selected')} aria-pressed={mode === 'url'} onClick={() => setMode('url')}><Link2 size={14} /> Paste an image URL</button>
            </div>

            {mode === 'upload' ? (
              <div>
                <label
                  className={cx('drop', dragOver && 'is-over', errors.file && 'has-error')}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                >
                  <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                  {preview ? (
                    <img className="drop__preview" src={preview} alt="Preview of the chosen photo" />
                  ) : (
                    <span className="drop__empty">
                      <ImagePlus size={30} strokeWidth={1.3} />
                      <strong>Choose a photo</strong>
                      <small>or drag it here · JPG, PNG or WebP · up to 10 MB</small>
                    </span>
                  )}
                </label>
                {file && (
                  <p className="drop__meta">
                    {file.name} · {formatBytes(file.size)}{' '}
                    <button type="button" onClick={() => inputRef.current?.click()}>Change</button>
                  </p>
                )}
                {errors.file && <p className="field__error" role="alert">{errors.file}</p>}
              </div>
            ) : (
              <Input id="photo-url" label="Image URL" icon={<Link2 size={18} />} placeholder="https://… or /images/portfolio/photo.jpg"
                hint="Use this if the image is already hosted somewhere. Deleting the photo later will not delete that file."
                value={urlText} onChange={(e) => { setUrlText(e.target.value); setErrors((er) => ({ ...er, url: undefined })); }} error={errors.url} />
            )}
          </>
        )}

        <Input id="photo-title" label="Title" required maxLength={100} placeholder="e.g. Sunset vows at the lake"
          value={form.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
        <Select id="photo-category" label="Category" required placeholder="Choose a category" options={CATEGORY_OPTIONS}
          value={form.category} onChange={(e) => set({ category: e.target.value })} error={errors.category} />
        <Textarea id="photo-description" label="Description (optional)" maxLength={500} rows={3}
          value={form.description} onChange={(e) => set({ description: e.target.value })} />

        <div className="photo-form__checks">
          <label><input type="checkbox" checked={form.isPublished} onChange={(e) => set({ isPublished: e.target.checked })} /> Show on the website <small>(untick to keep it as a draft)</small></label>
          <label><input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} /> Feature on the home page</label>
        </div>

        {saving && !editing && mode === 'upload' && !uploaded && (
          <div className="photo-form__progress" role="status" aria-live="polite">
            <div className="photo-form__bar"><span style={{ width: `${progress}%` }} /></div>
            <small>{uploading ? `Uploading… ${progress}%` : 'Saving…'}</small>
          </div>
        )}
        {submitError && <p className="form-alert" role="alert">{submitError}</p>}
        <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
      </form>
    </Modal>
  );
}
