"use client";

/* eslint-disable @next/next/no-img-element -- Local object URLs are used only for pre-upload previews. */

import { useEffect, useMemo } from "react";

export function ImagePicker({
  files,
  onChange,
  disabled = false,
  label = "Choose images",
  maxFiles = 8
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  maxFiles?: number;
}) {
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);

  function add(selected: FileList | null) {
    if (!selected) return;
    const next = [...files];
    for (const file of Array.from(selected)) {
      if (!next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
    }
    onChange(next.slice(0, maxFiles));
  }

  return (
    <div className="image-picker">
      <label className="button secondary image-picker-button">
        {label}
        <input className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || files.length >= maxFiles} onChange={(event) => { add(event.target.files); event.target.value = ""; }} />
      </label>
      <small>JPG, PNG or WEBP. Up to {maxFiles} images, 10 MB each.</small>
      {previews.length > 0 && <div className="image-preview-grid">{previews.map(({ file, url }, index) => (
        <figure key={`${file.name}-${file.size}-${file.lastModified}`}>
          <img src={url} alt={file.name} />
          <figcaption><span title={file.name}>{file.name}</span><button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>Remove</button></figcaption>
        </figure>
      ))}</div>}
    </div>
  );
}
